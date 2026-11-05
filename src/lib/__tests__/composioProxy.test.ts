import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../api/_lib/auth.js', async (orig) => ({ ...(await orig<object>()), adminDb: vi.fn() }));

import handler from '../../../api/composio';
import { adminDb } from '../../../api/_lib/auth.js';

// team_members lookup result returned by the fake admin client.
function memberDb(result: { data: unknown; error: unknown }) {
  const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => result };
  return { from: () => q };
}

function mockRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: string) => ((res.headers[k] = v), res);
  return res;
}

const req = (headers: Record<string, string> = {}, method = 'POST') => ({ method, headers, body: { jsonrpc: '2.0' } });

describe('api/composio proxy', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.COMPOSIO_API_KEY = 'server-key';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    (adminDb as any).mockReturnValue(memberDb({ data: { id: 'tm1' }, error: null }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.COMPOSIO_API_KEY;
  });

  it('rejects requests without a CRM session', async () => {
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid session without calling Composio', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    const res = mockRes();
    await handler(req({ authorization: 'Bearer bad' }), res);
    expect(res.statusCode).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards with the server key (over a browser-sent key) and relays the reply', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"id":"u1"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"successful":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const res = mockRes();
    await handler(req({ authorization: 'Bearer good', 'x-consumer-api-key': 'browser-key' }), res);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://connect.composio.dev/mcp');
    expect(init.headers['x-consumer-api-key']).toBe('server-key');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"successful":true}');
  });

  it('403 for a signed-in user who is not a team member, without calling Composio', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"id":"stranger"}', { status: 200 }));
    (adminDb as any).mockReturnValue(memberDb({ data: null, error: null }));
    const res = mockRes();
    await handler(req({ authorization: 'Bearer good' }), res);
    expect(res.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('500 (not 403) when the team lookup fails or the service key is missing', async () => {
    fetchMock.mockImplementation(async () => new Response('{"id":"u1"}', { status: 200 }));
    (adminDb as any).mockReturnValueOnce(memberDb({ data: null, error: { message: 'boom' } }));
    let res = mockRes();
    await handler(req({ authorization: 'Bearer good' }), res);
    expect(res.statusCode).toBe(500);

    (adminDb as any).mockImplementationOnce(() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set'); });
    res = mockRes();
    await handler(req({ authorization: 'Bearer good' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('rejects other methods', async () => {
    const res = mockRes();
    await handler(req({}, 'GET'), res);
    expect(res.statusCode).toBe(405);
  });
});
