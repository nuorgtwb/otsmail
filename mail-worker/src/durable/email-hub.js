/**
 * One Durable Object per user. Keeps the user's open WebSocket tabs and
 * broadcasts new-mail events without KV polling.
 */
export class EmailHub {
	constructor() {
		this.sockets = new Set();
	}

	async fetch(request) {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/notify') {
			const message = await request.text();
			for (const ws of this.sockets) {
				try { ws.send(message); } catch { this.sockets.delete(ws); }
			}
			return new Response('ok');
		}

		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('expected websocket', { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		server.accept();
		this.sockets.add(server);
		const drop = () => this.sockets.delete(server);
		server.addEventListener('close', drop);
		server.addEventListener('error', drop);
		return new Response(null, { status: 101, webSocket: client });
	}
}
