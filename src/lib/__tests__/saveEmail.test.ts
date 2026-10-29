import { describe, it, expect, vi, beforeAll } from 'vitest';

let inserted: any;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: (payload: any) => {
        inserted = payload;
        return { select: () => ({ single: async () => ({ data: payload, error: null }) }) };
      },
    }),
  }),
}));

describe('saveEmail (Supabase branch)', () => {
  let db: typeof import('../supabase').db;

  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.resetModules();
    ({ db } = await import('../supabase'));
  });

  it('keeps status received and sends is_inbound, sender_email, email_account_id', async () => {
    const saved = await db.saveEmail({
      recipient_email: 'me@x.com',
      sender_email: 'them@y.com',
      subject: 's',
      body: 'b',
      status: 'received',
      is_inbound: true,
      email_account_id: 'acc-1',
    });

    expect(inserted.status).toBe('received');
    expect(inserted.is_inbound).toBe(true);
    expect(inserted.sender_email).toBe('them@y.com');
    expect(inserted.email_account_id).toBe('acc-1');
    expect(saved.status).toBe('received');
    expect(saved.is_inbound).toBe(true);
  });
});
