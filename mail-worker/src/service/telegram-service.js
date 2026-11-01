import orm from '../entity/orm';
import email from '../entity/email';
import attService from './att-service';
import settingService from './setting-service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { and, eq } from 'drizzle-orm';
import user from '../entity/user';
import { isDel } from '../const/entity-const';
import jwtUtils from '../utils/jwt-utils';
import emailMsgTemplate from '../template/email-msg';
import emailTextTemplate from '../template/email-text';
import emailHtmlTemplate from '../template/email-html';
import verifyUtils from '../utils/verify-utils';
import domainUtils from "../utils/domain-uitls";
import BizError from '../error/biz-error';

// sendPhoto：每封邮件最多发的内嵌图数（避免多图刷屏）
const MAX_PHOTOS_PER_EMAIL = 5;
const PHOTO_CAPTION_LIMIT = 900;

// 引用消息正文末尾的 #邮件ID（模板写入）；取最后一个，避免正文里的 #数字 干扰
export function parseQuotedEmailId(text) {
	const ids = [...String(text || '').matchAll(/#(\d+)\b/g)];
	return Number(ids.at(-1)?.[1]) || null;
}

const telegramService = {

	async getEmailContent(c, params) {

		const { token } = params

		const result = await jwtUtils.verifyToken(c, token);

		if (!result) {
			return emailTextTemplate('Access denied')
		}

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();

		if (emailRow) {

			if (emailRow.content) {
				const { r2Domain } = await settingService.query(c);
				return emailHtmlTemplate(emailRow.content || '', r2Domain)
			} else {
				return emailTextTemplate(emailRow.text || '')
			}

		} else {
			return emailTextTemplate('The email does not exist')
		}

	},

	async sendAlert(c, text) {
		const { tgBotToken, tgChatId } = await settingService.query(c)
		if (!tgBotToken || !tgChatId) return
		for (const chatId of String(tgChatId).split(',').map(id => id.trim()).filter(Boolean)) {
			await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, text })
			}).catch(() => {})
		}
	},

	async webhookSecret(c) {
		if (c.env.telegram_webhook_secret) return c.env.telegram_webhook_secret;
		if (!c.env.kv) return c.env.jwt_secret;
		let secret = await c.env.kv.get('tg_webhook_secret');
		if (!secret) {
			secret = crypto.randomUUID().replaceAll('-', '');
			await c.env.kv.put('tg_webhook_secret', secret);
		}
		return secret;
	},

	// 通知和 AI 指令共用同一个 Bot：这里只把 webhook 指到本 Worker
	async setWebhook(c, url) {
		const { tgBotToken } = await settingService.query(c);

		if (!tgBotToken) {
			throw new BizError('请先保存 Telegram Bot Token', 400);
		}

		const target = String(url || '').trim() || `${new URL(c.req.url).origin}/api/telegram/webhook`;
		const secret = await this.webhookSecret(c);

		if (!/^https:\/\//i.test(target)) {
			throw new BizError('Webhook 必须是 https 地址', 400);
		}

		const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/setWebhook`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				url: target,
				secret_token: secret,
				allowed_updates: ['message']
			})
		});

		const data = await res.json().catch(() => null);

		if (!res.ok || !data?.ok) {
			throw new BizError(data?.description || 'Telegram Webhook 设置失败', 502);
		}

		return { url: target };
	},

	async sendEmailToBot(c, email) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText, r2Domain } = await settingService.query(c);

		const tgChatIds = tgChatId.split(',');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId }, 24 * 60 * 60)

		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404'
		const inlineKeyboard = [
			[
				{
					text: 'View',
					web_app: { url: webAppUrl }
				}
			]
		];

		if (email.code) {
			inlineKeyboard.push([
				{
					text: email.code,
					copy_text: { text: email.code }
				}
			]);
		}

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId,
						parse_mode: 'HTML',
						text: emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText),
						reply_markup: {
							inline_keyboard: inlineKeyboard
						}
					})
				});
				if (!res.ok) {
					console.error(`转发 Telegram 失败 status: ${res.status} response: ${await res.text()}`);
				}
			} catch (e) {
				console.error(`转发 Telegram 失败:`, e.message);
			}
		}));

		// sendPhoto（方案 A）：邮件内嵌图逐张发到聊天（单图一列），caption=摘要 + View 兜底
		await this.sendPhotosToBot(c, { email, tgBotToken, tgChatIds, webAppUrl, r2Domain });
	},

	/**
	 * sendPhoto（架构 TG sendPhoto 方案 A 定案）：邮件内嵌图（CID 附件，已存 R2 公开 URL）
	 * 逐张用 sendPhoto 发到聊天，单图一列；每张 caption = 主题/发件人/序号（短摘要），
	 * 保留 View 按钮兜底看完整 HTML。多图最多 MAX_PHOTOS_PER_EMAIL 张，避免刷屏。
	 */
	async sendPhotosToBot(c, { email, tgBotToken, tgChatIds, webAppUrl, r2Domain }) {

		if (!email || !email.emailId || !tgBotToken || !r2Domain) {
			return;
		}

		let attList = [];
		try {
			attList = await attService.selectByEmailIds(c, [email.emailId]);
		} catch (e) {
			console.error(`sendPhotosToBot 查询附件失败:`, e.message);
			return;
		}

		// 只取内嵌图：image mime + 有 contentId（CID 附件）
		const inlineImages = attList.filter(att =>
			att &&
			att.mimeType &&
			String(att.mimeType).toLowerCase().startsWith('image/') &&
			att.contentId
		).slice(0, MAX_PHOTOS_PER_EMAIL);

		if (inlineImages.length === 0) {
			return;
		}

		const baseUrl = domainUtils.toOssDomain(r2Domain);
		const subject = (email.subject || '').slice(0, 80);
		const from = (email.name || email.sendEmail || '').slice(0, 80);

		const captionPrefix = `<b>${subject.replace(/</g, '&lt;')}</b>\n${from.replace(/</g, '&lt;')}`;

		await Promise.all(tgChatIds.map(async chatId => {
			for (let i = 0; i < inlineImages.length; i++) {
				const att = inlineImages[i];
				const photoUrl = `${baseUrl}/${att.key}`;
				const caption = `${captionPrefix}\n📷 ${i + 1}/${inlineImages.length}`.slice(0, PHOTO_CAPTION_LIMIT - 12) + `\n#${email.emailId}`;
				try {
					const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendPhoto`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							chat_id: chatId,
							photo: photoUrl,
							caption,
							parse_mode: 'HTML',
							reply_markup: {
								inline_keyboard: [[{ text: 'View', web_app: { url: webAppUrl } }]]
							}
						})
					});
					if (!res.ok) {
						console.error(`sendPhoto 失败 status: ${res.status} response: ${await res.text()}`);
					}
				} catch (e) {
					console.error(`sendPhoto 失败:`, e.message);
				}
			}
		}));
	},

	/**
	 * Telegram Bot webhook：/ai 前缀或纯自然语言 → aiService.command() → 把结果回发聊天。
	 * 只接受后台 tgChatId 里配置的 chat；chat 没有用户绑定表，因此固定操作管理员自己的邮箱。
	 */
	async webhook(c, update) {
		const message = update?.message || update?.edited_message;
		const chatId = String(message?.chat?.id || '');
		const text = String(message?.text || '').trim();
		const quotedText = String(message?.reply_to_message?.text || message?.reply_to_message?.caption || message?.quote?.text || '');
		const quotedEmailId = parseQuotedEmailId(quotedText);

		// 机器人自己发的消息 / 非文本消息直接忽略，避免自激循环
		if (!chatId || !text || message?.from?.is_bot) {
			return;
		}

		const { tgBotToken, tgChatId } = await settingService.query(c);

		if (!tgBotToken) {
			return;
		}

		const admin = await orm(c).select({ userId: user.userId }).from(user)
			.where(and(eq(user.email, c.env.admin), eq(user.isDel, isDel.NORMAL)))
			.get();

		// /bind <code>：只允许管理员授权页签发的绑定码
		const bind = text.match(/^\/bind\s+([a-f0-9]{16,})$/i);
		if (bind) {
			const key = 'tg_bind_' + bind[1];
			const bindUserId = await c.env.kv.get(key);
			if (admin && bindUserId && String(bindUserId) === String(admin.userId)) {
				await settingService.set(c, { tgChatId: chatId });
				await c.env.kv.delete(key);
				await this.sendBotText(tgBotToken, chatId, '绑定成功');
			} else {
				await this.sendBotText(tgBotToken, chatId, '绑定码无效或已过期');
			}
			return;
		}

		const tgChatIds = String(tgChatId || '').split(',').map(item => item.trim()).filter(Boolean);

		if (!tgChatIds.includes(chatId)) {
			await this.sendBotText(tgBotToken, chatId, 'Access denied');
			return;
		}

		if (!admin) {
			await this.sendBotText(tgBotToken, chatId, 'Admin user not found');
			return;
		}

		// 动态引入：ai-service 和 telegram-service 之间有 email-service 的静态依赖环
		const { default: aiService } = await import('./ai-service');

		const input = text.replace(/^\/ai\s*/i, '').trim();
		const historyKey = 'tg_ai_history:' + chatId;
		const history = (await c.env.kv.get(historyKey, {type: 'json'})) || [];

		// Telegram 没有网页的 busy 气泡；typing 5 秒过期，AI 慢时每 4 秒续一次
		let typing = true;
		const keepTyping = async () => {
			if (!typing) return;
			await this.sendChatAction(tgBotToken, chatId);
			if (typing) setTimeout(keepTyping, 4000);
		};
		void keepTyping();

		let answer;
		try {
			answer = await aiService.command(c, {
				text: input || text,
				userId: admin.userId,
				replyEmailId: quotedEmailId,
				quotedText,
				history
			});
		} catch (e) {
			await this.sendBotText(tgBotToken, chatId, `AI error: ${e.message || e}`);
			return;
		} finally {
			typing = false;
		}

		const reply = this.commandReplyText(answer);
		await this.sendBotText(tgBotToken, chatId, reply);

		// 每个聊天保留最近 20 条，支持“转发刚才那封”这类追问
		const nextHistory = [...history, {role: 'user', text: input || text}, {role: 'assistant', text: reply}].slice(-20);
		await c.env.kv.put(historyKey, JSON.stringify(nextHistory), {expirationTtl: 7 * 24 * 60 * 60});
	},

	// 动作结果拼成可读文本：回复 + 成功数 + 失败原因
	commandReplyText({ reply, actions }) {
		const failed = actions.filter(item => !item.ok);
		const lines = [reply || ''];

		if (actions.length > 0) {
			lines.push(`✅ ${actions.length - failed.length}/${actions.length}`);
		}

		failed.forEach(item => {
			const target = item.to ? ` ${item.to}` : item.emailId ? ` #${item.emailId}` : '';
			lines.push(`❌ ${item.type}${target}: ${item.error || ''}`);
		});

		return lines.filter(Boolean).join('\n') || '-';
	},

	async sendChatAction(tgBotToken, chatId) {
		try {
			await fetch(`https://api.telegram.org/bot${tgBotToken}/sendChatAction`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({chat_id: chatId, action: 'typing'})
			});
		} catch (e) {
			console.error('Telegram typing 状态失败:', e.message);
		}
	},

	async sendBotText(tgBotToken, chatId, text) {
		try {
			const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ chat_id: chatId, text })
			});
			if (!res.ok) {
				console.error(`Telegram 回复失败 status: ${res.status} response: ${await res.text()}`);
			}
		} catch (e) {
			console.error('Telegram 回复失败:', e.message);
		}
	}

}

export default telegramService
