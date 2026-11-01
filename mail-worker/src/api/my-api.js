import app from '../hono/hono';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c));
	return c.json(result.ok(user));
});

app.put('/my/resetPassword', async (c) => {
	await userService.resetPassword(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/my/delete', async (c) => {
	await userService.delete(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/my/setAvatar', async (c) => {
	const data = await userService.setAvatar(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/my/uploadAvatar', async (c) => {
	const data = await userService.uploadAvatar(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/my/uploadImage', async (c) => {
	const data = await userService.uploadImage(c, await c.req.json());
	return c.json(result.ok(data));
});

app.put('/my/setting', async (c) => {
	const data = await userService.updateMySetting(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/my/telegram/ticket', async (c) => {
	const userId = userContext.getUserId(c);
	const user = await userService.loginUserInfo(c, userId);
	if (user.email !== c.env.admin) throw new BizError('仅管理员可绑定 Telegram', 403);
	const ticket = crypto.randomUUID().replaceAll('-', '');
	await c.env.kv.put(`tg_bind_ticket_${ticket}`, String(userId), { expirationTtl: 300 });
	return c.json(result.ok({ ticket }));
});

app.get('/my/2fa/status', async (c) => {
	return c.json(result.ok(await userService.twoFactorStatus(c, userContext.getUserId(c))));
});

app.post('/my/2fa/setup', async (c) => {
	return c.json(result.ok(await userService.twoFactorSetup(c, userContext.getUserId(c))));
});

app.post('/my/2fa/enable', async (c) => {
	await userService.twoFactorEnable(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/my/2fa/disable', async (c) => {
	await userService.twoFactorDisable(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/my/2fa/required', async (c) => {
	const { required } = await c.req.json();
	await userService.setTwoFactorRequired(c, !!required, userContext.getUserId(c));
	return c.json(result.ok());
});


