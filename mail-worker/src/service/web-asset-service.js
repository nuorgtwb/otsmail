// 前端静态资源服务：从 R2 (web/ 前缀) 读取 (绕开 Cloudflare Assets 绑定存储层故障)
// 移植策略：替代 env.assets.fetch，直接用 R2 托管前端构建产物
// 关键: 用流式 body (obj.body) 返回, 避免大文件 arrayBuffer 在 Worker runtime 下偶发空 body

const webAssetService = {

	// content-type 推断
	contentType(path) {
		if (path.endsWith('.html')) return 'text/html; charset=utf-8';
		if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
		if (path.endsWith('.css')) return 'text/css; charset=utf-8';
		if (path.endsWith('.json')) return 'application/json; charset=utf-8';
		if (path.endsWith('.svg')) return 'image/svg+xml';
		if (path.endsWith('.png')) return 'image/png';
		if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
		if (path.endsWith('.ico')) return 'image/x-icon';
		if (path.endsWith('.woff2')) return 'font/woff2';
		if (path.endsWith('.woff')) return 'font/woff';
		if (path.endsWith('.webmanifest')) return 'application/manifest+json';
		return 'application/octet-stream';
	},

	// 读取前端资源，返回 Response
	async fetch(req, env) {
		// Fresh Deploy-button installs use Workers Assets; production keeps using R2.
		if (env.assets) {
			const asset = await env.assets.fetch(req);
			if (asset.status !== 404) return asset;
		}

		const url = new URL(req.url);
		let pathname = decodeURIComponent(url.pathname);

		// Cache-busted asset namespace: lets a fresh build bypass stale edge-cached 404/SPA responses.
		if (pathname.startsWith('/assets/v12/')) pathname = pathname.slice('/assets/v12'.length);

		// 根路径返回 index.html (SPA)
		if (pathname === '/' || pathname === '') {
			pathname = '/index.html';
		}

		// 防止路径穿越
		if (pathname.includes('..')) {
			return new Response('Forbidden', { status: 403 });
		}

		const key = 'web' + pathname; // web/ 前缀
		try {
			const obj = await env.r2.get(key);
			if (!obj) {
				// SPA 回退：未知路径返回 index.html
				const indexObj = await env.r2.get('web/index.html');
				if (!indexObj) {
					return new Response('Not Found', { status: 404 });
				}
				return new Response(indexObj.body, {
					headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
				});
			}
			// 带 hash 的构建产物可永久缓存；index/SPA 回退不缓存，避免旧壳
			const immutable = pathname.startsWith('/assets/');
			const cacheControl = immutable
				? 'public, max-age=31536000, immutable'
				: 'no-store';
			// 流式返回 R2 对象 body (避免 arrayBuffer 大文件偶发空 body)
			return new Response(obj.body, {
				headers: {
					'content-type': this.contentType(pathname),
					'cache-control': cacheControl,
					'cdn-cache-control': cacheControl
				}
			});
		} catch (e) {
			return new Response('Internal Error: ' + e.message, { status: 500 });
		}
	}
};

export default webAssetService;
