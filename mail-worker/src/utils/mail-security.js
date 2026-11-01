// 入站邮件安全标记与验证码/验证链接提取。只做保守规则，不调用 AI。
export function parseAuthResults(headers = []) {
	const values = (Array.isArray(headers) ? headers : [])
		.filter(item => /^(authentication-results|arc-authentication-results)$/i.test(item?.key || ''))
		.map(item => String(item.value || ''));
	const raw = values.join('; ');
	const pick = name => {
		const match = raw.match(new RegExp(`\\b${name}\\s*=\\s*([a-z]+)`, 'i'));
		return match ? match[1].toLowerCase() : '';
	};
	return { spf: pick('spf'), dmarc: pick('dmarc') };
}

function plainHtml(html) {
	return String(html || '')
		.replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"');
}

export function extractOtp(email = {}) {
	const raw = `${email.subject || ''}\n${email.text || ''}\n${plainHtml(email.html || '')}`.slice(0, 20000);
	const codeMatch = raw.match(/(?:验证码|校验码|动态码|verification\s+code|security\s+code|one[-\s]?time\s+(?:password|code)|passcode|\botp\b|code\s*(?:is|:))\s*[^\d]{0,24}(\d{4,8})/i);
	const code = codeMatch ? codeMatch[1] : '';
	const urls = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
	const link = urls
		.map(item => item.replace(/[),.;!?]+$/, ''))
		.find(item => /(verify|confirm|activate|activation|reset|token|signin|login|code)/i.test(item)) || '';
	return { code, link: link.slice(0, 1000) };
}
