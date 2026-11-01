import app from '../hono/hono';
import { dbInit } from '../init/init';

app.get('/init', (c) => {
	return dbInit.init(c);
})
