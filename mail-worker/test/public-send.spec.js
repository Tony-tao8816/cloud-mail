import { afterEach, describe, expect, it, vi } from 'vitest';
import publicService from '../src/service/public-service.js';
import userService from '../src/service/user-service.js';
import accountService from '../src/service/account-service.js';
import emailService from '../src/service/email-service.js';
import BizError from '../src/error/biz-error.js';
import app from '../src/hono/webs.js';
import emailHtmlTemplate from '../src/template/email-html.js';
import telegramService from '../src/service/telegram-service.js';
import worker from '../src/index.js';

describe('publicService.sendEmail', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('normalizes payload and delegates to emailService.send', async () => {
		vi.spyOn(userService, 'selectByEmailIncludeDel')
			.mockResolvedValue({ userId: 7, email: 'admin@example.com', isDel: 0 });

		vi.spyOn(accountService, 'selectByEmailIncludeDel')
			.mockResolvedValue({ accountId: 9, email: 'sender@example.com', userId: 7, isDel: 0 });

		const sendSpy = vi.spyOn(emailService, 'send')
			.mockResolvedValue([{ emailId: 1 }]);

		const result = await publicService.sendEmail({ env: { admin: 'admin@example.com' } }, {
			sendEmail: ' sender@example.com ',
			sendName: ' Sender Name ',
			receiveEmail: 'first@example.com, second@example.com，first@example.com',
			subject: 'Test',
			content: '<p>Hello</p>',
			attachments: [{ filename: 'hello.txt', content: 'SGVsbG8=', contentType: 'text/plain' }]
		});

		expect(result).toEqual([{ emailId: 1 }]);
		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(sendSpy.mock.calls[0][2]).toBe(7);

		const payload = sendSpy.mock.calls[0][1];
		expect(payload.accountId).toBe(9);
		expect(payload.name).toBe('Sender Name');
		expect(payload.receiveEmail).toEqual(['first@example.com', 'second@example.com']);
		expect(payload.attachments).toEqual([{
			filename: 'hello.txt',
			content: 'SGVsbG8=',
			contentType: 'text/plain',
			type: 'text/plain',
			mimeType: 'text/plain'
		}]);
	});

	it('rejects empty recipients', async () => {
		vi.spyOn(userService, 'selectByEmailIncludeDel')
			.mockResolvedValue({ userId: 7, email: 'admin@example.com', isDel: 0 });

		await expect(
			publicService.sendEmail({ env: { admin: 'admin@example.com' } }, {
				receiveEmail: ' , , '
			})
		).rejects.toEqual(new BizError('收件人不能为空'));
	});
});

describe('publicService.deleteEmail', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('supports single delete by emailId', async () => {
		const deleteSpy = vi.spyOn(emailService, 'deleteByIds')
			.mockResolvedValue([101]);

		const result = await publicService.deleteEmail({}, { emailId: 101 });

		expect(deleteSpy).toHaveBeenCalledWith({}, [101]);
		expect(result).toEqual({
			mode: 'single',
			deletedCount: 1,
			emailIds: [101]
		});
	});

	it('supports batch delete by emailIds', async () => {
		const deleteSpy = vi.spyOn(emailService, 'deleteByIds')
			.mockResolvedValue([101, 102]);

		const result = await publicService.deleteEmail({}, { emailIds: '101,102,101' });

		expect(deleteSpy).toHaveBeenCalledWith({}, [101, 102]);
		expect(result).toEqual({
			mode: 'batch',
			deletedCount: 2,
			emailIds: [101, 102]
		});
	});

	it('supports conditional delete', async () => {
		const deleteSpy = vi.spyOn(emailService, 'deleteByConditions')
			.mockResolvedValue([201, 202]);

		const result = await publicService.deleteEmail({}, {
			sendEmail: '%@example.com%',
			type: 1,
			startTime: '2026-01-01 00:00:00',
			endTime: '2026-01-31 23:59:59'
		});

		expect(deleteSpy).toHaveBeenCalledTimes(1);
		expect(deleteSpy.mock.calls[0][1]).toHaveLength(4);
		expect(result).toEqual({
			mode: 'condition',
			deletedCount: 2,
			emailIds: [201, 202]
		});
	});

	it('rejects empty delete conditions', async () => {
		await expect(
			publicService.deleteEmail({}, {})
		).rejects.toEqual(new BizError('删除条件不能为空'));
	});
});

describe('emailService.normalizeSendParams', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('normalizes recipients, attachments and derives text from html', () => {
		const normalized = emailService.normalizeSendParams({
			receiveEmail: 'alpha@example.com; beta@example.com；alpha@example.com',
			content: '<p>Hello <strong>world</strong></p>',
			attachments: [{ filename: 'a.txt', content: 'QQ==', contentType: 'text/plain' }]
		});

		expect(normalized.receiveEmail).toEqual(['alpha@example.com', 'beta@example.com']);
		expect(normalized.attachments).toEqual([{
			filename: 'a.txt',
			content: 'QQ==',
			contentType: 'text/plain',
			type: 'text/plain',
			mimeType: 'text/plain'
		}]);
		expect(normalized.text).toContain('Hello world');
	});
});

describe('public route aliases', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('allows calling account list through public token', async () => {
		vi.spyOn(userService, 'selectByEmailIncludeDel')
			.mockResolvedValue({ userId: 7, email: 'admin@example.com', isDel: 0 });

		vi.spyOn(userService, 'loginUserInfo')
			.mockResolvedValue({ userId: 7, email: 'admin@example.com', role: { name: 'admin' } });

		const listSpy = vi.spyOn(accountService, 'list')
			.mockResolvedValue([{ accountId: 1, email: 'admin@example.com' }]);

		const response = await app.request(
			'http://example.com/public/account/list?accountId=1&size=20',
			{
				method: 'GET',
				headers: {
					Authorization: 'public-token'
				}
			},
			{
				admin: 'admin@example.com',
				kv: {
					get: vi.fn().mockResolvedValue('public-token')
				}
			}
		);

		const data = await response.json();

		expect(response.status).toBe(200);
		expect(listSpy).toHaveBeenCalledWith(expect.anything(), { accountId: '1', size: '20' }, 7);
		expect(data.code).toBe(200);
		expect(data.data).toEqual([{ accountId: 1, email: 'admin@example.com' }]);
	});
});

describe('telegram email html template', () => {
	it('renders html through the original shadow-dom mini app flow safely', () => {
		const html = '<body style="font-size:16px"><p>code `inline` and ${value}</p></body>';
		const result = emailHtmlTemplate(html, 'files.example.com');

		expect(result).toContain('code `inline` and ${value}');
		expect(result).toContain('class="fallback-content"');
		expect(result).toContain('attachShadow');
		expect(result).toContain('renderHTML("\\u003cbody');
		expect(result).not.toContain('const exampleHtml =');
		expect(result).not.toContain('renderHTML(`<');
	});

	it('renders a visible fallback when mini app scripts do not run', () => {
		const html = '<body><p>Fallback visible</p></body>';
		const result = emailHtmlTemplate(html, 'files.example.com');

		const scriptIndex = result.indexOf('<script>');
		const fallbackIndex = result.indexOf('Fallback visible');

		expect(fallbackIndex).toBeGreaterThan(-1);
		expect(fallbackIndex).toBeLessThan(scriptIndex);
		expect(result).toContain('display: block !important');
	});

	it('keeps hostile email body styles from hiding the mini app page', () => {
		const html = '<body style="display:none; font-size:16px; opacity:0"><style>body,.content-box{display:none!important}</style><p>Visible content</p></body>';
		const result = emailHtmlTemplate(html, 'files.example.com');

		expect(result).toContain('Visible content');
		expect(result).toContain('font-size:16px');
		expect(result).toContain('sanitizeBodyStyle');
		expect(result).toContain("const blockedProps = new Set");
		expect(result).not.toContain('<style>body,.content-box');
		expect(result.slice(0, result.indexOf('<script>'))).not.toContain('display:none; font-size');
	});
});

describe('telegram route cache policy', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('disables caching for signed email pages', async () => {
		vi.spyOn(telegramService, 'getEmailContent').mockResolvedValue('<html><body>ok</body></html>');

		const response = await app.request('http://example.com/telegram/getEmail/test-token');

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate, private');
		expect(response.headers.get('pragma')).toBe('no-cache');
		expect(response.headers.get('expires')).toBe('0');
	});

	it('serves the telegram page from the public /api URL used by the bot', async () => {
		vi.spyOn(telegramService, 'getEmailContent').mockResolvedValue('<html><body>ok</body></html>');

		const response = await worker.fetch(new Request('http://example.com/api/telegram/getEmail/test-token'), {}, {});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('<html><body>ok</body></html>');
	});
});
