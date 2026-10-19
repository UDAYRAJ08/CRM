import { describe, it, expect, vi, beforeAll } from 'vitest';

// Regression: imported contacts only appeared after a page reload, because the
// 45s contacts cache was not cleared by batchInsertContacts.
describe('batchInsertContacts', () => {
  let db: typeof import('../supabase').db;

  beforeAll(async () => {
    // Use the localStorage store so the test never touches the real Supabase project in .env.
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    ({ db } = await import('../supabase'));
  });

  it('makes imported contacts visible to getContacts immediately', async () => {
    await db.getContacts(); // warm the cache
    let notified = false;
    window.addEventListener('crm_contacts_updated', () => (notified = true), { once: true });

    await db.batchInsertContacts([{ name: 'Imported Person', email: 'imported@example.com' }]);

    const contacts = await db.getContacts();
    expect(contacts.some((c) => c.email === 'imported@example.com')).toBe(true);
    expect(notified).toBe(true);
  });
});
