import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFreshAccessToken, buildGraphMessage, sendMail, listInbox, GraphError } from '../../../api/_lib/graph.js';
import { encryptToken, decryptToken } from '../../../api/_lib/crypto.js';

const resp = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeDb() {
  const updates: any[] = [];
  const db: any = { from: () => ({ update: (v: any) => ({ eq: async () => (updates.push(v), { error: null }) }) }) };
  return { db, updates };
}

const account = (expiresInMs: number): any => ({
  id: 'a1',
  access_token_enc: encryptToken('old-access'),
  refresh_token_enc: encryptToken('old-refresh'),
  expires_at: new Date(Date.now() + expiresInMs).toISOString(),
});

beforeEach(() => {
  process.env.EMAIL_TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.AZURE_TENANT_ID = 't';
  process.env.AZURE_CLIENT_ID = 'c';
  process.env.AZURE_CLIENT_SECRET = 's';
});
afterEach(() => vi.unstubAllGlobals());

describe('getFreshAccessToken', () => {
  it('uses the stored token while it is fresh', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { db } = fakeDb();
    expect(await getFreshAccessToken(db, account(30 * 60_000))).toBe('old-access');
    expect(f).not.toHaveBeenCalled();
  });

  it('refreshes when under 5 minutes left and stores the rotated refresh token', async () => {
    const f = vi.fn(async () => resp(200, { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }));
    vi.stubGlobal('fetch', f);
    const { db, updates } = fakeDb();
    expect(await getFreshAccessToken(db, account(60_000))).toBe('new-access');
    const body = (f.mock.calls[0] as any)[1].body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('old-refresh');
    expect(decryptToken(updates[0].refresh_token_enc)).toBe('new-refresh');
    expect(decryptToken(updates[0].access_token_enc)).toBe('new-access');
  });

  it('keeps the old refresh token when Microsoft omits a new one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resp(200, { access_token: 'n', expires_in: 3600 })));
    const { db, updates } = fakeDb();
    await getFreshAccessToken(db, account(0));
    expect(decryptToken(updates[0].refresh_token_enc)).toBe('old-refresh');
  });

  it('marks account reauth_required when refresh fails with invalid_grant', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resp(400, { error: 'invalid_grant', error_description: 'secret' })));
    const { db, updates } = fakeDb();
    await expect(getFreshAccessToken(db, account(0))).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(updates[0]).toMatchObject({ status: 'reauth_required' });
    expect(updates[0].error_message).not.toContain('secret');
  });

  it('does not mark reauth on a transient token-endpoint failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resp(503, {})));
    const { db, updates } = fakeDb();
    await expect(getFreshAccessToken(db, account(0))).rejects.toMatchObject({ code: 'GRAPH_FAILED', status: 503 });
    expect(updates).toHaveLength(0);
  });
});

describe('buildGraphMessage', () => {
  it('strips the data-url prefix from attachments', () => {
    const m: any = buildGraphMessage({
      to: 'a@b.com', subject: 'S', html: '<p>x</p>', replyTo: 'r@b.com',
      attachments: [{ name: 'f.txt', dataUrl: 'data:text/plain;base64,QUJD' }],
    });
    expect(m.message.body).toEqual({ contentType: 'HTML', content: '<p>x</p>' });
    expect(m.message.attachments[0]).toEqual({ '@odata.type': '#microsoft.graph.fileAttachment', name: 'f.txt', contentBytes: 'QUJD' });
    expect(m.message.replyTo).toEqual([{ emailAddress: { address: 'r@b.com' } }]);
    expect(m.saveToSentItems).toBe(true);
  });
});

describe('sendMail', () => {
  it('maps 401 to REAUTH_REQUIRED and 202 to success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resp(202)));
    await expect(sendMail('t', {})).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => resp(401, {})));
    await expect(sendMail('t', {})).rejects.toMatchObject({ code: 'REAUTH_REQUIRED', status: 401 });
  });

  it('uses Graph error.message on other failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resp(400, { error: { message: 'Bad recipient' } })));
    const e: any = await sendMail('t', {}).catch((x) => x);
    expect(e).toBeInstanceOf(GraphError);
    expect(e).toMatchObject({ code: 'GRAPH_FAILED', status: 400, message: 'Bad recipient' });
  });
});

describe('listInbox', () => {
  it('returns value and maps 401', async () => {
    const f = vi.fn(async () => resp(200, { value: [{ id: '1' }] }));
    vi.stubGlobal('fetch', f);
    expect(await listInbox('t')).toEqual([{ id: '1' }]);
    expect(String((f.mock.calls[0] as any)[0])).toContain('mailFolders/inbox/messages');
    vi.stubGlobal('fetch', vi.fn(async () => resp(401, {})));
    await expect(listInbox('t')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
  });
});
