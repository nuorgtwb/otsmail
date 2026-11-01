import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/service/setting-service', () => ({
	default: { query: vi.fn() }
}));

import settingService from '../src/service/setting-service';
import telegramService from '../src/service/telegram-service';

describe('Telegram webhook binding', () => {
	beforeEach(() => {
		settingService.query.mockReset();
		global.fetch = vi.fn();
	});

	it('rejects when no bot token is saved', async () => {
		settingService.query.mockResolvedValue({});

		await expect(telegramService.setWebhook({ env: {}, req: { url: 'https://mail.test/api/setting/tgWebhook' } }, {}))
			.rejects.toThrow('Bot Token');
	});

	it('binds the worker webhook with the shared bot token', async () => {
		settingService.query.mockResolvedValue({ tgBotToken: '123:abc' });
		global.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		const data = await telegramService.setWebhook({
			env: { telegram_webhook_secret: 'secret-1' },
			req: { url: 'https://mail.test/api/setting/tgWebhook' }
		});

		expect(data.url).toBe('https://mail.test/api/telegram/webhook');
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.telegram.org/bot123:abc/setWebhook',
			expect.objectContaining({ method: 'POST' })
		);
		const body = JSON.parse(global.fetch.mock.calls[0][1].body);
		expect(body.secret_token).toBe('secret-1');
	});
});
