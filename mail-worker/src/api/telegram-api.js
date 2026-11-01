import app from '../hono/hono';
import telegramService from '../service/telegram-service';

app.get('/telegram/getEmail/:token', async (c) => {
	const content = await telegramService.getEmailContent(c, c.req.param());
	c.header('Cache-Control', 'private, no-store');
	return c.html(content)
});

// Telegram Bot 授权页：必须携带登录用户签发的短期 ticket，防止陌生人抢占全局绑定
app.get('/telegram/bind', async (c) => {
	const ticket = c.req.query('ticket') || '';
	const userId = ticket ? await c.env.kv.get(`tg_bind_ticket_${ticket}`) : null;
	if (!userId) return c.html('<!doctype html><meta charset="utf-8"><title>绑定 Telegram</title><p style="font-family:system-ui;max-width:560px;margin:60px auto">绑定链接已失效，请回到系统设置重新发起。</p>', 401);
	await c.env.kv.delete(`tg_bind_ticket_${ticket}`);
	const code = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
	await c.env.kv.put('tg_bind_' + code, userId, {expirationTtl: 600});
	return c.html(`<!doctype html><meta charset="utf-8"><title>绑定 Telegram</title>
<div style="font-family:system-ui;max-width:560px;margin:60px auto;padding:24px;line-height:1.7">
<h2>绑定 Telegram</h2>
<p>在 Telegram 中打开你的机器人，发送下面这条命令：</p>
<p style="font-size:18px;background:#f4f4f5;padding:12px;border-radius:8px">/bind ${code}</p>
<p style="color:#666">命令 10 分钟内有效。绑定成功后，机器人会回复“绑定成功”。</p>
</div>`);
});

// Telegram Bot webhook（免登录，靠独立 secret_token 校验）
app.post('/telegram/webhook', async (c) => {
	const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token') || '';
	const expected = await telegramService.webhookSecret(c);

	if (!expected || secret !== expected) {
		return c.text('forbidden', 403);
	}

	await telegramService.webhook(c, await c.req.json());
	return c.json(result.ok(null));
});

