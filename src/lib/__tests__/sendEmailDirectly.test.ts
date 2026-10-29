import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const apiPost = vi.fn();
vi.mock('../emailAccounts', () => ({ apiPost: (...a: unknown[]) => apiPost(...a) }));

describe('sendEmailDirectly', () => {
  let sendEmailDirectly: typeof import('../emailService').sendEmailDirectly;
  let sendSystemEmail: typeof import('../emailService').sendSystemEmail;
  let db: typeof import('../supabase').db;

  beforeAll(async () => {
    // localStorage store: never touch the real Supabase project in .env.
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    ({ db } = await import('../supabase'));
    ({ sendEmailDirectly, sendSystemEmail } = await import('../emailService'));
  });

  beforeEach(() => apiPost.mockReset());

  const base = { recipientEmail: 'lead@example.com', subject: 'Hi', body: 'Hello there' };

  it('posts to /api/email-send with the chosen account', async () => {
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { from: 'me@org.com', accountId: 'acc-2' } });
    await sendEmailDirectly({ ...base, emailAccountId: 'acc-2' });
    const [path, body] = apiPost.mock.calls[0];
    expect(path).toBe('/api/email-send');
    expect(body).toMatchObject({ emailAccountId: 'acc-2', to: 'lead@example.com', subject: 'Hi' });
    expect(body.html).toContain('Hello there');
  });

  it('logs the email with the mailbox address returned by the server', async () => {
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { from: 'me@org.com', accountId: 'acc-2' } });
    const res = await sendEmailDirectly(base);
    expect(res.provider).toBe('Outlook (me@org.com)');
    expect(res.record).toMatchObject({ sender_email: 'me@org.com', email_account_id: 'acc-2', status: 'sent' });
  });

  it('DAILY_LIMIT surfaces the limit message and code', async () => {
    apiPost.mockResolvedValue({ ok: false, status: 429, data: { code: 'DAILY_LIMIT', limit: 200 } });
    await expect(sendEmailDirectly(base)).rejects.toMatchObject({
      code: 'DAILY_LIMIT',
      message: 'Daily sending limit reached for this mailbox (200/day). Try again tomorrow.',
    });
  });

  it('maps other codes and falls back to the server message', async () => {
    apiPost.mockResolvedValue({ ok: false, status: 404, data: { code: 'NO_MAILBOX' } });
    await expect(sendEmailDirectly(base)).rejects.toMatchObject({ code: 'NO_MAILBOX' });
    apiPost.mockResolvedValue({ ok: false, status: 502, data: { code: 'GRAPH_FAILED', message: 'boom' } });
    await expect(sendEmailDirectly(base)).rejects.toThrow('boom');
  });

  it('does not save a failed email record', async () => {
    const before = (await db.getEmails()).length;
    apiPost.mockResolvedValue({ ok: false, status: 409, data: { code: 'REAUTH_REQUIRED' } });
    await expect(sendEmailDirectly(base)).rejects.toThrow();
    expect((await db.getEmails()).length).toBe(before);
  });

  it('logOnly never calls the API', async () => {
    const res = await sendEmailDirectly({ ...base, logOnly: true });
    expect(apiPost).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('sendSystemEmail posts to /api/system-email and throws on failure', async () => {
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { id: 'x' } });
    await sendSystemEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    expect(apiPost).toHaveBeenCalledWith('/api/system-email', { to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    apiPost.mockResolvedValue({ ok: false, status: 422, data: { message: 'bad domain' } });
    await expect(sendSystemEmail({ to: 'a@b.com', subject: 's', html: 'x' })).rejects.toThrow('bad domain');
  });
});
