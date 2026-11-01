import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import r2Service from './service/r2-service';
import webAssetService from './service/web-asset-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
export { EmailHub } from './durable/email-hub';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		// MCP HTTP endpoint: path kept as-is (no /api prefix strip), routes into app
		if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
			return app.fetch(req, env, ctx);
		}

		// MCP OAuth 元数据发现（RFC 8414 / 9728），必须挂在站点根上
		if (url.pathname.startsWith('/.well-known/')) {
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await r2Service.publicObjResp( { env }, url.pathname.substring(1));
		 }

		return webAssetService.fetch(req, env);
	},
	email: email,
	async scheduled(c, env, ctx) {
		const now = new Date(c.scheduledTime || Date.now());
		const minute = now.getUTCMinutes();

		// cron 可能被配成每分钟触发；缓存刷新只在整点/半点，日任务只在 UTC 16:00
		if (minute === 0 || minute === 30) {
			await analysisService.refreshEchartsCache({ env });
		}
		if (now.getUTCHours() !== 16 || minute > 5) {
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.autoClean({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};
