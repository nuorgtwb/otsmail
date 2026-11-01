// Webhook 通知服务：收到邮件后向配置的 URL 推送 JSON（移植自 maillab/cloud-mail v3.2.0）
import { emailConst } from '../const/entity-const';
import domainUtils from '../utils/domain-uitls';

function isWxPush(url) { return /wxpush|wxsend/i.test(String(url || '')) }
function testBody(secret) {
	return new URLSearchParams({ token: secret || '', title: 'otsmail webhook test', content: 'otsmail webhook test message' })
}

const webhookService = {

	// 后台“发送测试”：只发一次，返回可展示的状态与耗时，不参与重试
	async test({ env }, { url, secret } = {}) {
		url = domainUtils.toOssDomain(String(url || '').trim());
		if (!url) {
			return { ok: false, status: 0, latencyMs: 0, message: 'Webhook URL 为空' };
		}
		const wx = isWxPush(url);
		const headers = { 'Content-Type': wx ? 'application/x-www-form-urlencoded' : 'application/json' };
		if (secret && !wx) headers['Authorization'] = secret;
		const started = Date.now();
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers,
				body: wx
					? testBody(secret).toString()
					: JSON.stringify({
						test: true,
						event: 'webhook.test',
						title: 'otsmail webhook test',
						text: '这是一条测试消息，收到即表示配置可用。',
						createTime: new Date().toISOString()
					})
			});
			return {
				ok: res.ok,
				status: res.status,
				latencyMs: Date.now() - started,
				message: res.ok ? '测试请求已送达' : `目标返回 ${res.status}`
			};
		} catch (e) {
			return {
				ok: false,
				status: 0,
				latencyMs: Date.now() - started,
				message: e.message || String(e)
			};
		}
	},

	// 收信后调用：把邮件摘要 POST 到 webhookUrl
	async sendEmail({ env }, email, webhookUrl, webhookRetry = 0, webhookSecret = '') {
		webhookUrl = domainUtils.toOssDomain(webhookUrl);
		if (!webhookUrl) return;

		const payload = {
			emailId: email.emailId,
			sendEmail: email.sendEmail,
			sendName: email.name,
			toEmail: email.toEmail,
			toName: email.toName,
			subject: email.subject,
			text: email.text,
			content: email.content,
			createTime: email.createTime
		};

		const wx = isWxPush(webhookUrl);
		const headers = { 'Content-Type': wx ? 'application/x-www-form-urlencoded' : 'application/json' };
		if (webhookSecret && !wx) headers['Authorization'] = webhookSecret;

		let attempt = 0;
		const maxAttempt = Number(webhookRetry) || 0;
		while (true) {
			try {
				const res = await fetch(webhookUrl, {
					method: 'POST',
					headers,
					body: wx ? new URLSearchParams({ token: webhookSecret || '', title: email.subject || 'otsmail', content: email.text || email.subject || '' }).toString() : JSON.stringify(payload)
				});
				if (!res.ok) {
					throw new Error(`webhook 返回 ${res.status}`);
				}
				return;
			} catch (e) {
				attempt++;
				if (attempt > maxAttempt) {
					console.error(`转发 Webhook 失败（已重试 ${maxAttempt} 次）：`, e.message);
					return;
				}
				// 简单退避后重试
				await new Promise(r => setTimeout(r, 500 * attempt));
			}
		}
	}

};

export default webhookService;
