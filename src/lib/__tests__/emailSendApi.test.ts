import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/auth.js', () => ({ requireUser: vi.fn(), adminDb: vi.fn() }));
vi.mock('../../../api/_lib/graph.js', async (orig) => ({
  ...(await orig<typeof import('../../../api/_lib/graph.js')>()),
  getFreshAccessToken: vi.fn(),
  buildGraphMessage: vi.fn(() => ({ built: true })),
  sendMail: vi.fn(),
}));

import handler from '../../../api/email-send';
import { requireUser, adminDb } from '../../../api/_lib/auth.js';
import { GraphError, getFreshAccessToken, sendMail } from '../../../api/_lib/graph.js';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined as unknown };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  return res;
}

const body = { to: 'a@b.co', subject: 'Hi', html: '<p>x</p>' };
const req = (b: any = body, method = 'POST') => ({ method, headers: { authorization: 'Bearer t' }, body: b });

let account: any;
let eqs: [string, unknown][];
let rpcResult: { data: any; error: any };
let updates: any[];

beforeEach(() => {
  vi.resetAllMocks();
  eqs = [];
  updates = [];
  account = { id: 'acc1', email: 'me@corp.com', status: 'active' };
  rpcResult = { data: true, error: null };
  vi.mocked(requireUser).mockResolvedValue({ id: 'u1', email: 'me@corp.com' });
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => (eqs.push([k, v]), q),
    update: (v: unknown) => (updates.push(v), q),
    maybeSingle: async () => ({ data: account, error: null }),
  };
  vi.mocked(adminDb).mockReturnValue({ from: () => q, rpc: async () => rpcResult } as any);
  vi.mocked(getFreshAccessToken).mockResolvedValue('tok');
  vi.mocked(sendMail).mockResolvedValue(undefined);
});

describe('api/email-send', () => {
  it('405 for non-POST', async () => {
    const res = mockRes();
    await handler(req(body, 'GET'), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 without session', async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ code: 'AUTH' });
  });

  it('400 for an invalid recipient', async () => {
    const res = mockRes();
    await handler(req({ ...body, to: 'not-an-email' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'BAD_REQUEST' });
  });

  it("404 for another user's account", async () => {
    account = null;
    const res = mockRes();
    await handler(req({ ...body, emailAccountId: 'other' }), res);
    expect(res.statusCode).toBe(404);
    expect(eqs).toContainEqual(['auth_user_id', 'u1']);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('uses the default mailbox when no id is given', async () => {
    const res = mockRes();
    await handler(req(), res);
    expect(eqs).toContainEqual(['is_default', true]);
    expect(eqs).toContainEqual(['auth_user_id', 'u1']);
  });

  it('returns 429 DAILY_LIMIT when reserve fails', async () => {
    rpcResult = { data: false, error: null };
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('DAILY_LIMIT');
  });

  it('does not call Graph when reserve fails', async () => {
    rpcResult = { data: false, error: null };
    await handler(req(), mockRes());
    expect(getFreshAccessToken).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('502 and no send when the reserve rpc errors', async () => {
    rpcResult = { data: null, error: { message: 'boom' } };
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(502);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('returns 409 REAUTH_REQUIRED', async () => {
    vi.mocked(getFreshAccessToken).mockRejectedValue(new GraphError('REAUTH_REQUIRED'));
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ code: 'REAUTH_REQUIRED' });
  });

  it('Graph 401 on send: 409 and expires the stored token without marking reauth', async () => {
    vi.mocked(sendMail).mockRejectedValue(new GraphError('REAUTH_REQUIRED', 401));
    const before = Date.now();
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ code: 'REAUTH_REQUIRED' });
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0])).toEqual(['expires_at']);
    expect(new Date(updates[0].expires_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(eqs).toContainEqual(['id', 'acc1']);
  });

  it('409 when the account is already reauth_required', async () => {
    account.status = 'reauth_required';
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
  });

  it('502 GRAPH_FAILED with the Graph message', async () => {
    vi.mocked(sendMail).mockRejectedValue(new GraphError('GRAPH_FAILED', 400, 'bad thing'));
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ code: 'GRAPH_FAILED', message: 'bad thing' });
  });

  it('413 for 4 MB of attachments', async () => {
    const dataUrl = 'data:application/pdf;base64,' + 'A'.repeat(Math.ceil((4 * 1024 * 1024 * 4) / 3));
    const res = mockRes();
    await handler(req({ ...body, attachments: [{ name: 'a.pdf', dataUrl }] }), res);
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ code: 'TOO_LARGE' });
  });

  it('200 with the from address on 202', async () => {
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ from: 'me@corp.com', accountId: 'acc1' });
    expect(sendMail).toHaveBeenCalledWith('tok', { built: true });
  });
});
