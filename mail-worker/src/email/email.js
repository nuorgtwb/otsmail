import PostalMime from 'postal-mime';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import settingService from '../service/setting-service';
import attService from '../service/att-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel, settingConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import roleService from '../service/role-service';
import userService from '../service/user-service';
import telegramService from '../service/telegram-service';
import aiService, { classifyByRules } from '../service/ai-service';
import webhookService from '../service/webhook-service';
import pushService from '../service/push-service';
import emailRules from '../utils/emailRules';
import {matchFilterRules} from '../utils/filter-rules';
import { parseAuthResults, extractOtp } from '../utils/mail-security';

export async function email(message, env, ctx) {

	try {

		const {
			receive,
			tgChatId,
			tgBotStatus,
			forwardStatus,
			forwardEmail,
			webhookStatus,
			webhookUrl,
			webhookRetry,
			webhookSecret,
			ruleEmail,
			ruleType,
			r2Domain,
			noRecipient,
			blackSubject,
			blackContent,
			blackFrom,
			aiCode,
			aiCodeFilter,
			aiClassifyMode,
			emailFilters
		} = await settingService.query({ env });

		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}

		const reader = message.raw.getReader();
		const decoder = new TextDecoder();
		let content = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			content += decoder.decode(value, { stream: true });
		}
		content += decoder.decode();

		const email = await PostalMime.parse(content);


		// 黑名单 + 标准垃圾头/主题标记命中不再直接拒收：邮件照常入库并打垃圾标记，由用户在垃圾箱查看
		const blockFlag = checkBlock(blackSubject, blackContent, blackFrom, email) || isSpamByHeaders(email);

		const account = await accountService.selectByEmailIncludeDel({ env: env }, message.to);

		if (!account && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		let userRow = {}

		if (account) {
			 userRow = await userService.selectByIdIncludeDel({ env: env }, account.userId);
		}

		if (account && userRow.email !== env.admin) {

			let { banEmail, availDomain } = await roleService.selectByUserId({ env: env }, account.userId);

			if (!roleService.hasAvailDomainPerm(availDomain, message.to)) {
				message.setReject('The recipient is not authorized to use this domain.');
				return;
			}

			if(roleService.isBanEmail(banEmail, email.from.address)) {
				message.setReject('The recipient is disabled from receiving emails.');
				return;
			}

		}


		if (!email.to) {
			email.to = [{ address: message.to, name: emailUtils.getName(message.to)}]
		}

		const toName = email.to.find(item => item.address === message.to)?.name || '';
		const auth = parseAuthResults(email.headers);
		const otp = extractOtp(email);
		const code = (await aiService.extractCode({ env }, email, { aiCode, aiCodeFilter })) || otp.code;
		// 默认只跑本地规则；只有显式开启自动 AI 才在收信链路里调用模型
		// 用户过滤器优先于 AI/本地分类；垃圾标记仍最高优先
		const filterCategory = matchFilterRules(email, emailFilters);
		const category = blockFlag ? 'spam' : filterCategory || (aiClassifyMode === 'auto'
			? await aiService.classifyEmail({ env }, email)
			: classifyByRules(email));

		const params = {
			toEmail: message.to,
			toName: toName,
			sendEmail: email.from.address,
			name: email.from.name || emailUtils.getName(email.from.address),
			subject: email.subject,
			code,
			authSpf: auth.spf,
			authDmarc: auth.dmarc,
			otpLink: otp.link,
			content: email.html,
			text: email.text,
			cc: email.cc ? JSON.stringify(email.cc) : '[]',
			bcc: email.bcc ? JSON.stringify(email.bcc) : '[]',
			recipient: JSON.stringify(email.to),
			inReplyTo: email.inReplyTo,
			relation: email.references,
			messageId: email.messageId,
			userId: account ? account.userId : 0,
			accountId: account ? account.accountId : 0,
			isDel: isDel.DELETE,
			spam: blockFlag || category === 'spam' ? 1 : 0,
			category,
			status: emailConst.status.SAVING
		};

		// 去重：同一 Message-Id + 同一收件地址只收一次。
		// 上游（SMTP）重投时 Message-Id 不变，照单全收会把同一封信入库、
		// TG、转发、webhook 各发 N 遍（2026-10-30 实测：GNAME 原信 10 秒一封重投 18 次）。
		// RECEIVE / NOONE 直接丢弃；SAVING 说明上次已插入但没走到 completeReceive，
		// 收尾旧行而不是再插一条。空 Message-Id 不去重（无法区分）。
		// 正常返回（不抛错、不拒收）是关键：让上游认为投递成功，停止重投。
		if (params.messageId) {
			const dup = await env.db.prepare(
				'SELECT email_id, status FROM email WHERE message_id = ? AND to_email = ? AND type = 0 AND status IN (?, ?, ?) LIMIT 1'
			).bind(
				params.messageId,
				params.toEmail,
				emailConst.status.RECEIVE,
				emailConst.status.NOONE,
				emailConst.status.SAVING
			).first();
			if (dup) {
				// 上次已完成 receive() 但没走到 completeReceive()，收尾旧行，避免重投再插一条。
				if (dup.status === emailConst.status.SAVING) {
					await emailService.completeReceive(
						{ env },
						account ? emailConst.status.RECEIVE : emailConst.status.NOONE,
						dup.email_id
					);
					console.log(`[dedup] completed stale saving row: messageId=${params.messageId} existingEmailId=${dup.email_id}`);
				}
				console.log(`[dedup] duplicate inbound dropped: messageId=${params.messageId} to=${params.toEmail} existingEmailId=${dup.email_id}`);
				return;
			}
		}

		const attachments = [];
		const cidAttachments = [];

		for (let item of email.attachments) {
			let attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) {
				cidAttachments.push(attachment);
			}
		}

		let emailRow = await emailService.receive({ env }, params, cidAttachments, r2Domain);
		await env.kv?.delete(`email:counts:${emailRow.userId}`);

		attachments.forEach(attachment => {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		});

		try {
			if (attachments.length > 0) {
				await attService.addAtt({ env }, attachments);
			}
		} catch (e) {
			console.error(e);
			ctx.waitUntil(
				telegramService.sendAlert(
					{ env },
					`⚠️ otsmail 附件保存失败\nto=${String(message.to || '').slice(0, 80)}\n${String(e?.message || e).slice(0, 300)}`
				).catch(() => {})
			);
		}

		emailRow = await emailService.completeReceive({ env }, account ? emailConst.status.RECEIVE : emailConst.status.NOONE, emailRow.emailId);
		// Real-time SSE only needs the latest id; the client refreshes counts/list.
		await env.kv?.put(`email:last:${emailRow.userId}`, String(emailRow.emailId), { expirationTtl: 86400 });
		if (env.EMAIL_HUB) {
			ctx.waitUntil(env.EMAIL_HUB.get(env.EMAIL_HUB.idFromName(String(emailRow.userId)))
				.fetch('https://email-hub/notify', {
					method: 'POST',
					body: JSON.stringify({
						type: 'email',
						emailId: emailRow.emailId,
						subject: params.subject,
						name: params.name,
						text: String(params.text || '').slice(0, 120)
					})
				})
				.catch(e => console.error('WebSocket notify failed: ', e)));
		}

		ctx.waitUntil(pushService.send({ env }, emailRow.userId, {
			title: params.subject || '新邮件',
			body: `${params.name || ''}${params.name ? ' · ' : ''}${String(params.text || '').slice(0, 80)}`,
			url: '/'
		}).catch(e => console.error('Web Push 失败: ', e)));


		if (ruleType === settingConst.ruleType.RULE) {

			const emails = ruleEmail.split(',');

			if (!emails.includes(message.to)) {
				return;
			}

		}

		//转发到TG
		if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
			await telegramService.sendEmailToBot({ env }, emailRow)
		}

		//转发到其他邮箱
					// N-02：Google/Gmail 来源邮件只 TG+保存，跳过 forward（不送 Outlook/QQ）
					// 判定主信号：message.to 命中 GMAIL_ROUTING_INBOX（gmail@otscup.com）即 Google 通道（§4.11 v1.3）
					const isGoogleSourced = emailRules.isGoogleSourcedEmail(email, env, message.to);

				// N-02 诊断日志（可观测性，不影响业务）：真实样本进来可 tail 到判定依据
				{
					const _from = (email && email.from && email.from.address) || '';
					const _hs = (email && Array.isArray(email.headers)) ? email.headers : [];
					const _sig = _hs.filter(h => ['x-gm-original-from','x-google-smtp-source','x-google-original-from'].includes((h.key||'').toLowerCase()))
						.map(h => `${h.key}=${String(h.value||'').slice(0,60)}`).join(' | ');
					console.log(`[N-02] to=${message.to} from=${_from} flag=${env && env.SKIP_FORWARD_GMAIL_FORWARDED} toEmailRouting=${(env && env.GMAIL_ROUTING_INBOX)||'gmail@otscup.com'} isGoogleSourced=${isGoogleSourced} sig=[${_sig}]`);
				}

				if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail && !isGoogleSourced) {

					const emails = forwardEmail.split(',');

					await Promise.all(emails.map(async email => {

						try {
							await message.forward(email);
						} catch (e) {
							console.error(`转发邮箱 ${email} 失败：`, e);
						}

					}));

				}

		//转发到 Webhook
		if (webhookStatus === settingConst.webhookStatus.OPEN && webhookUrl) {
			await webhookService.sendEmail({ env }, emailRow, webhookUrl, webhookRetry, webhookSecret);
		}

	} catch (e) {
		console.error('邮件接收异常: ', e);
		try {
			ctx.waitUntil(
				telegramService.sendAlert(
					{ env },
					`⚠️ otsmail 收信失败\nto=${String(message.to || '').slice(0, 80)}\n${String(e?.message || e).slice(0, 300)}`
				).catch(() => {})
			);
		} catch (alertError) {
			console.error('send alert failed', alertError);
		}
		throw e
	}
}

/**
 * 垃圾邮件判定（纯函数，便于自测）：
 * 1. 标准反垃圾头：X-Spam-Status: Yes / X-Spam-Flag: YES / X-Spam-Score >= 5 / X-Spam-Level 五星以上
 * 2. 主题标记：[SPAM] / ***SPAM*** / [垃圾邮件]
 * 管理后台的黑/白名单仍走 checkBlock()，两者取并集。
 */
export function isSpamByHeaders(email) {
	const headers = Array.isArray(email?.headers) ? email.headers : [];
	const get = key => {
		const row = headers.find(h => String(h.key || '').toLowerCase() === key);
		return String(row?.value || '').trim();
	};

	if (/^yes\b/i.test(get('x-spam-status'))) return true;
	if (/^yes$/i.test(get('x-spam-flag'))) return true;

	const score = Number.parseFloat(get('x-spam-score'));
	if (Number.isFinite(score) && score >= 5) return true;

	const stars = (get('x-spam-level').match(/\*/g) || []).length;
	if (stars >= 5) return true;

	const subject = String(email?.subject || '');
	return /\[spam\]|\*\*\*spam\*\*\*|\[垃圾邮件\]/i.test(subject);
}

function checkBlock(blackSubjectStr, blackContentStr, blackFromStr, email) {

	const blackFromList = blackFromStr ? blackFromStr.split(',') : []
	const blackContentList = blackContentStr ? blackContentStr.split(',') : []
	const blackSubjectList = blackSubjectStr ? blackSubjectStr.split(',') : []

	for (const blackSubject of blackSubjectList) {
		if (email.subject?.includes(blackSubject)) {
			return true
		}
	}

	for (const blackContent of blackContentList) {
		if (email.html?.includes(blackContent) || email.text?.includes(blackContent)) {
			return true
		}
	}

	for (const blackFrom of blackFromList) {
		if (email.from.address === blackFrom || emailUtils.getDomain(email.from.address) === blackFrom) {
			return true
		}
	}

	return false

}
