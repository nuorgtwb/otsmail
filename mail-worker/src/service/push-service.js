import { buildPushPayload } from '@block65/webcrypto-web-push';

const KEY_PREFIX = 'PUSH_SUB:';
const MAX_SUBS = 5;

/**
 * Web Push（VAPID）。订阅存 KV，避免为一个设备列表加数据库迁移。
 * 没配置 VAPID 密钥时静默跳过，站内桌面通知仍然可用。
 */
const pushService = {
	key(c) {
		return c.env.VAPID_PUBLIC_KEY || '';
	},

	async list(c, userId) {
		const rows = await c.env.kv.get(KEY_PREFIX + userId, { type: 'json' });
		return Array.isArray(rows) ? rows : [];
	},

	async subscribe(c, subscription, userId) {
		const endpoint = String(subscription?.endpoint || '').trim();
		const p256dh = String(subscription?.keys?.p256dh || '').trim();
		const auth = String(subscription?.keys?.auth || '').trim();

		if (!endpoint.startsWith('https://') || !p256dh || !auth) {
			throw new Error('invalid push subscription');
		}

		const rows = await this.list(c, userId);
		const next = rows.filter(row => row.endpoint !== endpoint);
		next.unshift({ endpoint, expirationTime: subscription.expirationTime || null, keys: { p256dh, auth } });
		await c.env.kv.put(KEY_PREFIX + userId, JSON.stringify(next.slice(0, MAX_SUBS)));
	},

	async unsubscribe(c, endpoint, userId) {
		const rows = await this.list(c, userId);
		await c.env.kv.put(KEY_PREFIX + userId, JSON.stringify(rows.filter(row => row.endpoint !== endpoint)));
	},

	async send(c, userId, { title, body, url = '/' }) {
		const publicKey = c.env.VAPID_PUBLIC_KEY;
		const privateKey = c.env.VAPID_PRIVATE_KEY;
		if (!publicKey || !privateKey) return [];

		const subscriptions = await this.list(c, userId);
		if (subscriptions.length === 0) return [];

		const vapid = {
			subject: c.env.VAPID_SUBJECT || 'mailto:admin@otscup.com',
			publicKey,
			privateKey
		};
		const message = {
			data: JSON.stringify({ title, body, url }),
			options: { ttl: 300 }
		};

		return Promise.all(subscriptions.map(async subscription => {
			try {
				const payload = await buildPushPayload(message, subscription, vapid);
				const response = await fetch(subscription.endpoint, {
					...payload,
					signal: AbortSignal.timeout(8000)
				});
				if (response.status === 404 || response.status === 410) {
					await this.unsubscribe(c, subscription.endpoint, userId);
				} else if (!response.ok) {
					const detail = await response.text().catch(() => '');
					console.error(`Web Push failed status=${response.status} ${detail.slice(0, 200)}`);
				}
				return { ok: response.ok, status: response.status };
			} catch (e) {
				console.error('Web Push 发送失败: ', e);
				return { ok: false, error: e?.message || String(e) };
			}
		}));
	}
};

export default pushService;
