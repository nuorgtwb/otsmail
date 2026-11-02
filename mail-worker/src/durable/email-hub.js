/**
 * One Durable Object per user. Uses the WebSocket Hibernation API so idle
 * tabs do not keep the object billed for the whole connection lifetime.
 */
export class EmailHub {
	constructor(ctx, env) {
		this.ctx = ctx;
		this.env = env;
	}

	async fetch(request) {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/notify') {
			const message = await request.text();
			for (const ws of this.ctx.getWebSockets()) {
				try { ws.send(message); } catch { /* stale socket */ }
			}
			return new Response('ok');
		}

		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('expected websocket', { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage() {
		// The browser does not need to send anything; keep the handler for
		// the hibernation API contract.
	}

	async webSocketClose(ws, code, reason) {
		try { ws.close(code, reason); } catch { /* already closed */ }
	}

	async webSocketError(ws) {
		try { ws.close(1011, 'websocket error'); } catch { /* already closed */ }
	}
}
