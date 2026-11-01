import orm from '../entity/orm';
import mcpToken from '../entity/mcp-token';
import mcpClient from '../entity/mcp-client';
import { and, desc, eq } from 'drizzle-orm';
import BizError from '../error/biz-error';
import cryptoUtils from '../utils/crypto-utils';

/**
 * MCP 授权
 *
 * - 访问令牌：mcp_<48 hex>，库内只存 sha256，明文只在创建响应里出现一次
 * - OAuth 客户端：client_credentials 换取同名 mcp 令牌（有效期仅作展示，实际靠吊销/撤销）
 * - /mcp 请求由 security.js 调 verifyBearer 换出 userId，与 JWT 走同一套用户上下文
 */
const TOKEN_PREFIX = 'mcp_';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_EXPIRES_IN = 3600;

function randomHex(bytes) {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(str) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
	return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function publicToken(row) {
	return {
		tokenId: row.tokenId,
		name: row.name,
		tokenPrefix: row.tokenPrefix,
		clientId: row.clientId,
		createdAt: row.createdAt,
		lastUsedAt: row.lastUsedAt,
		revoked: row.revoked
	};
}

const mcpService = {

	async createToken(c, params, userId) {
		const name = String(params?.name || '').trim();
		if (!name) throw new BizError('令牌名称不能为空');

		const secret = randomHex(24);
		const token = TOKEN_PREFIX + secret;
		const tokenHash = await sha256Hex(token);
		const tokenPrefix = TOKEN_PREFIX + secret.slice(0, 8);

		await orm(c).insert(mcpToken).values({ userId, name, tokenPrefix, tokenHash }).run();
		const row = await orm(c).select().from(mcpToken).where(eq(mcpToken.tokenHash, tokenHash)).get();

		// 明文只此一次，之后库里只剩 hash
		return { ...publicToken(row), token };
	},

	async listTokens(c, userId) {
		const rows = await orm(c).select().from(mcpToken)
			.where(eq(mcpToken.userId, userId))
			.orderBy(desc(mcpToken.tokenId))
			.all();
		return rows.map(publicToken);
	},

	async revokeToken(c, params, userId) {
		const tokenId = Number(params?.tokenId);
		if (!tokenId) throw new BizError('令牌不存在');
		const row = await orm(c).select().from(mcpToken)
			.where(and(eq(mcpToken.tokenId, tokenId), eq(mcpToken.userId, userId)))
			.get();
		if (!row) throw new BizError('令牌不存在');
		await orm(c).update(mcpToken).set({ revoked: 1 }).where(eq(mcpToken.tokenId, tokenId)).run();
	},

	/** security.js 用：Bearer 是 mcp_ 令牌则校验并刷新 lastUsedAt，返回 { userId } 或 null */
	async verifyBearer(c, raw) {
		// MCP 客户端按规范发 `Authorization: Bearer mcp_xxx`，和网页 JWT 共用同一个头
		const token = String(raw || '').replace(/^Bearer\s+/i, '').trim();
		if (!token.startsWith(TOKEN_PREFIX)) return null;
		const tokenHash = await sha256Hex(token);
		const row = await orm(c).select().from(mcpToken).where(eq(mcpToken.tokenHash, tokenHash)).get();
		if (!row || row.revoked === 1) return null;
		const createdAt = Date.parse(row.createdAt);
		if (!Number.isFinite(createdAt) || Date.now() - createdAt > TOKEN_TTL_MS) return null;
		await orm(c).update(mcpToken)
			.set({ lastUsedAt: new Date().toISOString() })
			.where(eq(mcpToken.tokenId, row.tokenId))
			.run();
		return { userId: row.userId };
	},

	async status(c, userId) {
		const rows = await orm(c).select().from(mcpToken).where(eq(mcpToken.userId, userId)).all();
		const clientRows = await orm(c).select().from(mcpClient).where(eq(mcpClient.userId, userId)).all();
		const active = rows.filter(row => row.revoked !== 1);
		const lastUsedAt = active.reduce((latest, row) => (row.lastUsedAt > latest ? row.lastUsedAt : latest), '');
		return {
			tokenCount: rows.length,
			activeTokenCount: active.length,
			clientCount: clientRows.filter(row => row.revoked !== 1).length,
			lastUsedAt: lastUsedAt || null
		};
	},

	async createClient(c, params, userId) {
		const name = String(params?.name || '').trim();
		if (!name) throw new BizError('客户端名称不能为空');

		const clientId = 'mcpc_' + randomHex(8);
		const clientSecret = randomHex(32);

		await orm(c).insert(mcpClient).values({
			clientId,
			clientSecretHash: await sha256Hex(clientSecret),
			name,
			userId
		}).run();

		// secret 只此一次
		return { clientId, name, clientSecret, createdAt: new Date().toISOString(), revoked: 0 };
	},

	async listClients(c, userId) {
		const rows = await orm(c).select().from(mcpClient)
			.where(eq(mcpClient.userId, userId))
			.orderBy(desc(mcpClient.clientId))
			.all();
		return rows.map(row => ({
			clientId: row.clientId,
			name: row.name,
			createdAt: row.createdAt,
			revoked: row.revoked
		}));
	},

	async revokeClient(c, params, userId) {
		const clientId = String(params?.clientId || '');
		if (!clientId) throw new BizError('客户端不存在');
		const row = await orm(c).select().from(mcpClient)
			.where(and(eq(mcpClient.clientId, clientId), eq(mcpClient.userId, userId)))
			.get();
		if (!row) throw new BizError('客户端不存在');
		await orm(c).update(mcpClient).set({ revoked: 1 }).where(eq(mcpClient.clientId, clientId)).run();
		// 同步吊销该客户端已签发的令牌，否则旧 token 仍可用
		await orm(c).update(mcpToken).set({ revoked: 1 })
			.where(and(eq(mcpToken.clientId, clientId), eq(mcpToken.userId, userId)))
			.run();
	},

	/** OAuth client_credentials：凭据对则签发 mcp 令牌，不对返回 null（由 api 层回 RFC 错误） */
	async oauthToken(c, params) {
		const clientId = String(params?.client_id || '');
		const clientSecret = String(params?.client_secret || '');
		if (!clientId || !clientSecret) return null;

		const row = await orm(c).select().from(mcpClient).where(eq(mcpClient.clientId, clientId)).get();
		if (!row || row.revoked === 1) return null;

		// secret 是 32 字节随机串，直接 sha256 存/比已足够（无需加盐慢哈希）
		const hash = await sha256Hex(clientSecret);
		if (!cryptoUtils.timingSafeEqual(hash, row.clientSecretHash)) return null;

		// shortcut: 每次换 token 落一行 mcp_token，高频调用会累积；需要时改成按 client 复用 + 定时清理
		const secret = randomHex(24);
		const token = TOKEN_PREFIX + secret;
		await orm(c).insert(mcpToken).values({
			userId: row.userId,
			name: row.name,
			tokenPrefix: TOKEN_PREFIX + secret.slice(0, 8),
			tokenHash: await sha256Hex(token),
			clientId
		}).run();

		return { access_token: token, token_type: 'Bearer', expires_in: OAUTH_EXPIRES_IN };
	}
};

export default mcpService;
