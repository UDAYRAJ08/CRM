import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/auth.js', () => ({ requireUser: vi.fn(), adminDb: vi.fn() }));
vi.mock('../../../api/_lib/graph.js', async () => {
  const actual = await vi.importActual<any>('../../../api/_lib/graph.js');
  return { ...actual, getFreshAccessToken: vi.fn(), listInbox: vi.fn() };
});

import handler from '../../../api/email-sync';
import { requireUser, adminDb } from '../../../api/_lib/auth.js';
import { GraphError, getFreshAccessToken, listInbox } from '../../../api/_lib/graph.js';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined as unknown };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  return res;
}

let updates: any[] = [];
let eqs: [string, unknown][] = [];
function dbWith(result: { data: any; error: any }) {
  updates = [];
  eqs = [];
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => (eqs.push([k, v]), q),
    update: (v: unknown) => (updates.push(v), q),
    then: (f: any) => Promise.resolve(result).then(f),
  };
  (adminDb as any).mockReturnValue({ from: () => q });
}

const acct = (id: string, email: string) => ({ id, email });

describe('api/email-sync', () => {
  beforeEach(() => vi.resetAllMocks());

  it('401 without session', async () => {
    (requireUser as any).mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('405 on GET', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns messages per mailbox and keeps going when one mailbox needs reauth', async () => {
    (requireUser as any).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    dbWith({ data: [acct('a1', 'one@x.com'), acct('a2', 'two@x.com')], error: null });
    (getFreshAccessToken as any).mockImplementation(async (_db: any, a: any) => {
      if (a.id === 'a1') throw new GraphError('REAUTH_REQUIRED');
      return 'tok';
    });
    (listInbox as any).mockResolvedValue([{ id: 'm1' }]);
    const res = mockRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.mailboxes).toEqual([{ accountId: 'a2', email: 'two@x.com', messages: [{ id: 'm1' }] }]);
    expect(res.body.errors).toEqual([{ accountId: 'a1', code: 'REAUTH_REQUIRED' }]);
  });

  it('Graph 401 on listInbox: reports REAUTH_REQUIRED and expires the stored token without marking reauth', async () => {
    (requireUser as any).mockResolvedValue({ id: 'u1', email: null });
    dbWith({ data: [acct('a1', 'one@x.com')], error: null });
    (getFreshAccessToken as any).mockResolvedValue('tok');
    (listInbox as any).mockRejectedValue(new GraphError('REAUTH_REQUIRED', 401));
    const res = mockRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.body.errors).toEqual([{ accountId: 'a1', code: 'REAUTH_REQUIRED' }]);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0])).toEqual(['expires_at']);
    expect(eqs).toContainEqual(['id', 'a1']);
  });

  it('maps unknown errors to GRAPH_FAILED and DB errors to 502', async () => {
    (requireUser as any).mockResolvedValue({ id: 'u1', email: null });
    dbWith({ data: [acct('a1', 'one@x.com')], error: null });
    (getFreshAccessToken as any).mockRejectedValue(new Error('boom'));
    let res = mockRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.body.errors).toEqual([{ accountId: 'a1', code: 'GRAPH_FAILED' }]);

    dbWith({ data: null, error: { message: 'x' } });
    res = mockRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(502);
  });
});
