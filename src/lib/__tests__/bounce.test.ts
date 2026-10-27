import { describe, it, expect } from 'vitest';
import { isBounceMessage, bouncedRecipients } from '../bounce';

// Shapes taken from real bounce reports seen in the inbox.
const exchangeBody =
  "Your message to person.with.long.email.1@northwind.com couldn't be delivered. person.with.long.email.1 wasn't found at northwind.com. udaySharma Office 365 person.with.long.ema...";

describe('isBounceMessage', () => {
  it('flags reports by sender', () => {
    expect(isBounceMessage('postmaster@northwind.com', 'No Subject', exchangeBody)).toBe(true);
    expect(isBounceMessage('MAILER-DAEMON@mail.example.com', 'Hi', '')).toBe(true);
    expect(isBounceMessage('microsoftexchange329e71ec88ae4615bbc36ab6ce41109e@ingversionsdigital.com', '', '')).toBe(true);
  });

  it('flags reports by subject', () => {
    expect(isBounceMessage('someone@corp.com', 'Undeliverable: Following up', '')).toBe(true);
    expect(isBounceMessage('someone@corp.com', 'Delivery Status Notification (Failure)', '')).toBe(true);
  });

  it('trusts body text only when there is no subject', () => {
    expect(isBounceMessage('someone@corp.com', 'No Subject', exchangeBody)).toBe(true);
    expect(isBounceMessage('lead@corp.com', 'Re: proposal', "My last email couldn't be delivered to Sam, can you resend?")).toBe(false);
  });

  it('leaves real replies alone', () => {
    expect(isBounceMessage('raj@northwind.com', 'Re: Quick follow-up', 'Sounds good, call Tuesday?')).toBe(false);
    expect(isBounceMessage('giovanni@hunter.io', 'Your weekly update', 'Hello there')).toBe(false);
  });
});

describe('bouncedRecipients', () => {
  it('extracts the failed address, not the reporter', () => {
    expect(bouncedRecipients(exchangeBody, 'postmaster@northwind.com')).toEqual(['person.with.long.email.1@northwind.com']);
  });

  it('ignores other reporting mailboxes and duplicates', () => {
    const body = 'To: A@x.com from postmaster@x.com. Address A@x.com not found.';
    expect(bouncedRecipients(body, 'mailer-daemon@x.com')).toEqual(['a@x.com']);
  });
});
