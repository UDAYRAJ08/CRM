import { describe, it, expect } from 'vitest';
import { dueDrafts } from '../scheduledEmailRunner';
import { contactVanity } from '../linkedinQueueRunner';
import type { EmailDraft } from '../supabase';

const draft = (id: string, scheduled_at?: string | null): EmailDraft => ({
  id,
  recipient_email: 'a@b.com',
  subject: 's',
  body: 'b',
  scheduled_at,
  saved_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
});

describe('dueDrafts', () => {
  it('returns only drafts whose scheduled time has passed', () => {
    const now = Date.parse('2026-10-19T10:00:00Z');
    const drafts = [
      draft('plain'),
      draft('cleared', null),
      draft('past', '2026-10-19T09:59:00Z'),
      draft('exact', '2026-10-19T10:00:00Z'),
      draft('future', '2026-10-19T10:01:00Z'),
    ];
    expect(dueDrafts(drafts, now).map((d) => d.id)).toEqual(['past', 'exact']);
  });
});

describe('contactVanity', () => {
  it('reads the linkedin_url column', () => {
    expect(contactVanity({ linkedin_url: 'https://www.linkedin.com/in/jane-doe/?trk=x' })).toBe('jane-doe');
  });
  it('falls back to a custom field holding a profile URL', () => {
    expect(contactVanity({ linkedin_url: null, custom_fields: { site: 'acme.com', li: 'linkedin.com/in/j%C3%B6rg' } })).toBe('jörg');
  });
  it('returns null without a profile URL', () => {
    expect(contactVanity({ custom_fields: { li: 'https://linkedin.com/company/acme' } })).toBeNull();
    expect(contactVanity(null)).toBeNull();
  });
});
