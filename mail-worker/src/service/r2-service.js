import s3Service from './s3-service';
import settingService from './setting-service';
import kvObjService from './kv-obj-service';

function unsafeInline(key, mime) {
	const ext = String(key || '').split('.').pop().toLowerCase();
	return ['html', 'htm', 'xhtml', 'svg', 'svgz', 'xml'].includes(ext)
		|| /^(text\/html|application\/xhtml\+xml|image\/svg\+xml)/i.test(mime || '');
}

const r2Service = {

	async storageType(c) {

		const setting = await settingService.query(c);
		const { bucket, endpoint, s3AccessKey, s3SecretKey } = setting;

		if (!!(bucket && endpoint && s3AccessKey && s3SecretKey)) {
			return 'S3';
		}

		if (c.env.r2) {
			return 'R2';
		}

		return 'KV';
	},

	async putObj(c, key, content, metadata) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.putObj(c, key, content, metadata);
		}

		if (storageType === 'R2') {
			await c.env.r2.put(key, content, {
				httpMetadata: { ...metadata }
			});
		}

		if (storageType === 'S3') {
			await s3Service.putObj(c, key, content, metadata);
		}

	},

	async getObj(c, key) {
		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			return await kvObjService.getObj(c, key);
		}

		if (storageType === 'R2') {
			return await c.env.r2.get(key);
		}

		if (storageType === 'S3') {
			return await s3Service.getObj(c, key);
		}
	},

	// /attachments/** 的公开读取：旧对象可能仍是 text/html + inline，按扩展名强制下载
	safeResponse(obj, key) {
		const headers = new Headers(obj.headers);
		const unsafe = unsafeInline(key, headers.get('Content-Type'));
		if (unsafe) {
			headers.set('Content-Type', 'application/octet-stream');
			headers.set('Content-Disposition', 'attachment');
		}
		if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'public, max-age=2592000');
		return new Response(obj.body, { status: obj.status, headers });
	},

	async publicObjResp(c, key) {
		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			const obj = await kvObjService.getObj(c, key);
			return obj ? this.safeResponse(obj, key) : new Response('Not Found', { status: 404 });
		}

		const obj = storageType === 'S3' ? await s3Service.getObj(c, key) : await c.env.r2.get(key);
		if (!obj) {
			return new Response('Not Found', { status: 404 });
		}

		if (obj instanceof Response) {
			return this.safeResponse(obj, key);
		}

		const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
		const headers = new Headers({
			'Content-Type': unsafeInline(key, contentType) ? 'application/octet-stream' : contentType,
			'Content-Disposition': obj.httpMetadata?.contentDisposition || (unsafeInline(key, contentType) ? 'attachment' : 'inline'),
			'Cache-Control': 'public, max-age=2592000'
		});
		return new Response(obj.body || obj, { headers });
	},

	async delete(c, key) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.deleteObj(c, key);
		}

		if (storageType === 'R2') {
			await c.env.r2.delete(key);
		}

		if (storageType === 'S3'){
			await s3Service.deleteObj(c, key);
		}

	}

};
export default r2Service;
