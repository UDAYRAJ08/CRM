import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const upsert = vi.fn();
let existingDefault: unknown = null;
vi.mock('../../../api/_lib/auth.js', () => ({
  requireUser: vi.fn(),
  adminDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingDefault, error: null }) }) }),
      }),
      upsert: async (row: any, opts: any) => {
        upsert(row, opts);
        return { error: null };
      },
    }),
  }),
}));

import { requireUser } from '../../../api/_lib/auth.js';
import { signState, verifyState, decryptToken } from '../../../api/_lib/crypto.js';
import start from '../../../api/email-oauth-start';
import callback from '../../../api/email-oauth-callback';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, location: '' };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.redirect = (c: number, url: string) => ((res.statusCode = c), (res.location = url), res);
  res.headers = {} as Record<string, string>;
  res.setHeader = (k: string, v: string) => ((res.headers[k.toLowerCase()] = v), res);
  return res;
}

describe('outlook oauth', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.AZURE_TENANT_ID = 'tenant-1';
    process.env.AZURE_CLIENT_ID = 'client-1';
    process.env.AZURE_CLIENT_SECRET = 'secret';
    process.env.EMAIL_OAUTH_REDIRECT_URI = 'https://app.test/api/email-oauth-callback';
    process.env.EMAIL_TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
    fetchMock.mockReset();
    upsert.mockReset();
    existingDefault = null;
    vi.mocked(requireUser).mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('start: 401 without session', async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const res = mockRes();
    await start({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('start: url carries tenant, client id, the four scopes, redirect uri and a verifiable state', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const res = mockRes();
    await start({ method: 'POST', headers: {} }, res);
    const u = new URL(res.body.url);
    expect(u.pathname).toBe('/tenant-1/oauth2/v2.0/authorize');
    expect(u.searchParams.get('client_id')).toBe('client-1');
    expect(u.searchParams.get('scope')).toBe('offline_access User.Read Mail.Send Mail.Read');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.test/api/email-oauth-callback');
    expect(verifyState(u.searchParams.get('state')!)?.uid).toBe('u1');
  });

  it('start: sets an HttpOnly nonce cookie equal to the state nonce', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const res = mockRes();
    await start({ method: 'POST', headers: {} }, res);
    const st = verifyState(new URL(res.body.url).searchParams.get('state')!);
    const cookie = res.headers['set-cookie'] as string;
    expect(cookie).toMatch(/^eo_n=[^;]+; Path=\/api\/email-oauth-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
    expect(st?.n).toBeTruthy();
    expect(cookie.slice(5, cookie.indexOf(';'))).toBe(st?.n);
  });

  it('callback: rejects a valid state with no nonce cookie', async () => {
    const res = mockRes();
    await callback({ method: 'GET', headers: {}, query: { code: 'c', state: signState('u1', 'n1') } }, res);
    expect(res.location).toBe('/?email_account=error&reason=state');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toContain('Max-Age=0');
  });

  it('callback: rejects a valid state with a different nonce cookie', async () => {
    const res = mockRes();
    await callback({ method: 'GET', headers: { cookie: 'a=1; eo_n=other' }, query: { code: 'c', state: signState('u1', 'n1') } }, res);
    expect(res.location).toBe('/?email_account=error&reason=state');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('callback: rejects tampered state', async () => {
    const res = mockRes();
    await callback({ method: 'GET', query: { code: 'c', state: signState('u1', 'n1') + 'x' } }, res);
    expect(res.location).toContain('email_account=error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('callback: rejects expired state', async () => {
    const res = mockRes();
    await callback({ method: 'GET', headers: { cookie: 'eo_n=n1' }, query: { code: 'c', state: signState('u1', 'n1', -1) } }, res);
    expect(res.location).toContain('email_account=error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('callback: stores encrypted tokens and makes the first mailbox default', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ mail: 'Me@Corp.com', displayName: 'Me' })));
    const res = mockRes();
    await callback({ method: 'GET', headers: { cookie: 'x=y; eo_n=n1' }, query: { code: 'c', state: signState('u1', 'n1') } }, res);
    expect(res.location).toBe('/?email_account=connected');
    expect(res.headers['set-cookie']).toBe('eo_n=; Path=/api/email-oauth-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    const [row, opts] = upsert.mock.calls[0];
    expect(opts.onConflict).toBe('auth_user_id,email');
    expect(row.email).toBe('me@corp.com');
    expect(row.access_token_enc).not.toBe('AT');
    expect(decryptToken(row.access_token_enc)).toBe('AT');
    expect(decryptToken(row.refresh_token_enc)).toBe('RT');
    expect(row.is_default).toBe(true);
  });

  it('callback: microsoft error redirects with reason=denied', async () => {
    const res = mockRes();
    await callback({ method: 'GET', headers: { cookie: 'eo_n=n1' }, query: { error: 'access_denied', state: signState('u1', 'n1') } }, res);
    expect(res.location).toBe('/?email_account=error&reason=denied');
  });
});
