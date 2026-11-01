import resendService from '../service/resend-service';
import app from '../hono/hono';

function base64Bytes(value) {
	const binary = atob(value);
	return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

async function verifySvix(c, raw, headers) {
	const secret = c.env.resend_webhook_secret;
	if (!secret) return false;
	const id = headers.get('svix-id');
	const timestamp = headers.get('svix-timestamp');
	const signatures = headers.get('svix-signature');
	if (!id || !timestamp || !signatures) return false;
	if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
	const key = await crypto.subtle.importKey('raw', base64Bytes(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${raw}`));
	const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
	return signatures.split(' ').some(item => item.startsWith('v1,') && item.slice(3) === expected);
}

app.post('/webhooks',async (c) => {
	if (!c.env.resend_webhook_secret) {
		console.error('[resend] webhook secret not configured');
		return c.text('webhook secret not configured', 503);
	}
	const raw = await c.req.text();
	if (!await verifySvix(c, raw, c.req.raw.headers)) return c.text('invalid signature', 401);
	try {
		await resendService.webhooks(c, JSON.parse(raw));
		return c.text('success', 200)
	} catch (e) {
		return  c.text(e.message, 400)
	}
})
