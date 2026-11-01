import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';

const countKey = userId => `email:counts:${userId}`;

async function getCounts(c, userId) {
	const cached = await c.env.kv?.get(countKey(userId), 'json');
	if (cached) return cached;
	const data = await emailService.counts(c, userId);
	await c.env.kv?.put(countKey(userId), JSON.stringify(data), { expirationTtl: 60 });
	return data;
}

// Any email mutation invalidates the cached counters. Inbound delivery invalidates separately.
app.use('/email/*', async (c, next) => {
	await next();
	if (c.req.method !== 'GET') {
		try {
			const userId = userContext.getUserId(c);
			if (userId) await c.env.kv?.delete(countKey(userId));
		} catch (e) { /* auth failure already handled by the route */ }
	}
});
app.get('/email/list', async (c) => {
	const data = await emailService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/email/latest', async (c) => {
	const list = await emailService.latest(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/email/delete', async (c) => {
	await emailService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/email/attList', async (c) => {
	const attList = await attService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(attList));
});

app.post('/email/send', async (c) => {
	const email = await emailService.send(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(email));
});

app.put('/email/read', async (c) => {
	await emailService.read(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.put('/email/unread', async (c) => {
	await emailService.unread(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.put('/email/category', async (c) => {
	await emailService.moveCategory(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/email/counts', async (c) => {
	const data = await getCounts(c, userContext.getUserId(c));
	return c.json(result.ok(data));
})

app.get('/email/category-counts', async (c) => {
	const data = (await getCounts(c, userContext.getUserId(c))).category;
	return c.json(result.ok(data));
})

app.get('/email/menu-counts', async (c) => {
	const data = (await getCounts(c, userContext.getUserId(c))).menu;
	return c.json(result.ok(data));
})

app.get('/email/detail', async (c) => {
	const data = await emailService.detail(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
})

app.post('/email/spam', async (c) => {
	await emailService.spam(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.post('/email/spamCancel', async (c) => {
	await emailService.spamCancel(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.post('/email/restore', async (c) => {
	await emailService.restore(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.delete('/email/physicsDelete', async (c) => {
	await emailService.physicsDeleteOwn(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
})

