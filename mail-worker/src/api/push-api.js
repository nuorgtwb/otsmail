import app from '../hono/hono';
import result from '../model/result';
import pushService from '../service/push-service';

app.get('/push/key', c => c.json(result.ok({ key: pushService.key(c) })));

app.post('/push/test', async c => {
	const results = await pushService.send(c, c.get('user').userId, {
		title: 'OTSMail 测试通知',
		body: '如果你看到这条通知，Web Push 正常。',
		url: '/'
	});
	return c.json(result.ok({ results }));
});

app.post('/push/subscribe', async c => {
	await pushService.subscribe(c, await c.req.json(), c.get('user').userId);
	return c.json(result.ok());
});

app.post('/push/unsubscribe', async c => {
	const { endpoint } = await c.req.json();
	await pushService.unsubscribe(c, String(endpoint || ''), c.get('user').userId);
	return c.json(result.ok());
});
