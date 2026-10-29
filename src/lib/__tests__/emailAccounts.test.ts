import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('../supabase', () => ({ supabase: { auth: { getSession: (...a: any[]) => getSession(...a) } } }));

import { apiPost, sentTodayCount, type EmailAccount } from '../emailAccounts';

describe('apiPost', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('sends the session token', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ url: 'x' }) });
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiPost('/api/email-oauth-start', { a: 1 });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/email-oauth-start');
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
    expect(res).toEqual({ ok: true, status: 200, data: { url: 'x' } });
  });

  it('omits Authorization without a session and tolerates non-JSON bodies', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiPost('/x', {});

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(res).toEqual({ ok: false, status: 502, data: {} });
  });
});

describe('sentTodayCount', () => {
  const acct = { sent_today: 7, sent_today_date: '2026-10-29' } as EmailAccount;

  it('resets on a new day', () => {
    expect(sentTodayCount(acct, new Date(2026, 9, 29, 15))).toBe(7);
    expect(sentTodayCount(acct, new Date(2026, 9, 30, 0, 5))).toBe(0);
    expect(sentTodayCount({ ...acct, sent_today_date: null }, new Date(2026, 9, 29))).toBe(0);
  });
});
