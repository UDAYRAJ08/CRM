import { describe, it, expect, vi, beforeAll } from 'vitest';

const apiPost = vi.fn();
const listMyEmailAccounts = vi.fn();
vi.mock('../emailAccounts', () => ({ apiPost, listMyEmailAccounts }));

const msg = (id: string, address: string, subject: string, bodyPreview = 'Thanks, interested.') => ({
  id,
  subject,
  bodyPreview,
  from: { emailAddress: { name: address.split('@')[0], address } },
  receivedDateTime: '2026-10-29T10:00:00Z',
});

describe('syncOutlookInbox', () => {
  let db: typeof import('../supabase').db;
  let syncOutlookInbox: typeof import('../inboundSyncService').syncOutlookInbox;

  beforeAll(async () => {
    // localStorage store: never touch the real Supabase project in .env.
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    ({ db } = await import('../supabase'));
    ({ syncOutlookInbox } = await import('../inboundSyncService'));
  });

  it('stores each reply with the mailbox it arrived in', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        mailboxes: [
          { accountId: 'acc-1', email: 'a@team.com', messages: [msg('m1', 'lead1@x.com', 'Re: Hello')] },
          {
            accountId: 'acc-2',
            email: 'b@team.com',
            messages: [
              msg('m2', 'lead2@y.com', 'Re: Offer'),
              msg('m3', 'mailer-daemon@y.com', 'Undelivered Mail Returned to Sender', 'could not be delivered to lead1@x.com'),
              msg('m4', 'a@team.com', 'Fwd: own mail'),
            ],
          },
        ],
        errors: [],
      },
    });
    listMyEmailAccounts.mockResolvedValue([]);
    await db.saveContact({ name: 'Lead One', email: 'lead1@x.com', status: 'contacted' });
    await db.saveContact({ name: 'Lead Two', email: 'lead2@y.com', status: 'new' });
    const saveEmail = vi.spyOn(db, 'saveEmail');

    const res = await syncOutlookInbox();

    expect(apiPost).toHaveBeenCalledWith('/api/email-sync', expect.anything());
    expect(res.newRepliesCount).toBe(2);
    expect(res.message).toContain('Synced 2 mailbox(es)');
    const saved = saveEmail.mock.calls.map(([e]) => [e.sender_email, e.email_account_id, e.recipient_email]);
    expect(saved).toEqual([
      ['lead1@x.com', 'acc-1', 'a@team.com'],
      ['lead2@y.com', 'acc-2', 'b@team.com'],
    ]);
  });

  it('ignores mail from senders who are not CRM contacts', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: { mailboxes: [{ accountId: 'acc-1', email: 'a@team.com', messages: [msg('p1', 'friend@personal.com', 'Dinner?')] }], errors: [] },
    });
    const saveContact = vi.spyOn(db, 'saveContact');
    const saveEmail = vi.spyOn(db, 'saveEmail');
    const addInteraction = vi.spyOn(db, 'addInteraction');
    [saveContact, saveEmail, addInteraction].forEach((s) => s.mockClear());
    const res = await syncOutlookInbox();
    expect(res.newRepliesCount).toBe(0);
    expect(saveContact).not.toHaveBeenCalled();
    expect(saveEmail).not.toHaveBeenCalled();
    expect(addInteraction).not.toHaveBeenCalled();
    expect((await db.getContacts()).some((c) => c.email === 'friend@personal.com')).toBe(false);
  });

  it('tells the user which mailbox needs reconnecting', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: { mailboxes: [], errors: [{ accountId: 'acc-9', code: 'REAUTH_REQUIRED' }] },
    });
    listMyEmailAccounts.mockResolvedValue([{ id: 'acc-9', email: 'old@team.com' }]);
    const res = await syncOutlookInbox();
    expect(res.message).toContain('Reconnect old@team.com in Email settings.');
  });

  it('handles 401 and no mailboxes', async () => {
    apiPost.mockResolvedValue({ ok: false, status: 401, data: { code: 'AUTH' } });
    expect((await syncOutlookInbox()).message).toBe('Sign in again to sync your inbox.');
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { mailboxes: [], errors: [] } });
    const res = await syncOutlookInbox();
    expect(res.success).toBe(true);
    expect(res.message).toBe('No Outlook mailbox connected. Connect one in Email settings.');
  });
});
