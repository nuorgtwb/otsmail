import { describe, expect, it } from 'vitest';
import { parseAuthResults, extractOtp } from '../src/utils/mail-security';

describe('mail security metadata', () => {
	it('reads spf/dmarc from authentication-results', () => {
		const result = parseAuthResults([
			{ key: 'Authentication-Results', value: 'mx.google.com; spf=pass smtp.mailfrom=a.com; dmarc=fail header.from=a.com' }
		]);
		expect(result).toEqual({ spf: 'pass', dmarc: 'fail' });
	});

	it('returns empty values without headers', () => {
		expect(parseAuthResults([])).toEqual({ spf: '', dmarc: '' });
	});

	it('extracts a keyword-adjacent code', () => {
		expect(extractOtp({ subject: '登录验证', text: '您的验证码是 483920，10 分钟内有效' }).code).toBe('483920');
	});

	it('does not treat an order number as a code', () => {
		expect(extractOtp({ subject: 'Order 20261031', text: 'Order 20261031 shipped' }).code).toBe('');
	});

	it('extracts the first verification link', () => {
		expect(extractOtp({ text: 'Open https://example.com/verify?token=abc to continue' }).link)
			.toBe('https://example.com/verify?token=abc');
	});
});
