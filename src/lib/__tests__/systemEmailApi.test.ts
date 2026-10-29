import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../api/_lib/auth.js', () => ({ requireUser: vi.fn(), adminDb: vi.fn() }));

import handler from '../../../api/system-email';
import { requireUser, adminDb } from '../../../api/_lib/auth.js';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined as unknown };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  return res;
}

const body = { to: 'x@y.com', subject: 'Hi', html: '<p>yo</p>' };

let teamRow: { data: any; error: any };
const teamEqs: [string, unknown][] = [];

describe('api/system-email', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.RESEND_API_KEY = 'server-key';
    process.env.RESEND_FROM_EMAIL = 'CRM <crm@x.com>';
    vi.stubGlobal('fetch', fetchMock);
    teamRow = { data: { id: 'tm1' }, error: null };
    teamEqs.length = 0;
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (teamEqs.push([k, v]), q), maybeSingle: async () => teamRow };
    (adminDb as any).mockReturnValue({ from: (t: string) => (t === 'team_members' ? q : null) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('401 without session', async () => {
    (requireUser as any).mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body }, res);
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403 for a signed-in user who is not a team member', async () => {
    (requireUser as any).mockResolvedValue({ id: 'stranger', email: null });
    teamRow = { data: null, error: null };
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ code: 'FORBIDDEN', error: 'Only team members can send system email.' });
    expect(teamEqs).toContainEqual(['auth_user_id', 'stranger']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403 when the team lookup errors', async () => {
    (requireUser as any).mockResolvedValue({ id: 'u1', email: null });
    teamRow = { data: null, error: { message: 'x' } };
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body }, res);
    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends with the server key and RESEND_FROM_EMAIL', async () => {
    (requireUser as any).mockResolvedValue({ id: 'u1', email: null });
    fetchMock.mockResolvedValue(new Response('{"id":"r1"}', { status: 200 }));
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body }, res);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer server-key');
    expect(JSON.parse(init.body)).toEqual({ from: 'CRM <crm@x.com>', to: ['x@y.com'], subject: 'Hi', html: '<p>yo</p>' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: 'r1' });
  });

  it('400 on bad body, 500 when unconfigured', async () => {
    (requireUser as any).mockResolvedValue({ id: 'u1', email: null });
    let res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { ...body, to: 'nope' } }, res);
    expect(res.statusCode).toBe(400);
    delete process.env.RESEND_API_KEY;
    res = mockRes();
    await handler({ method: 'POST', headers: {}, body }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('CONFIG');
  });
});
