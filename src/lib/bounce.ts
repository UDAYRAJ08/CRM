// Delivery-failure (bounce) detection for synced inbox mail. No imports: used by the db layer too.

const BOUNCE_SENDER = /^(postmaster|mailer-daemon|mail-daemon|microsoftexchange[0-9a-f]*|bounces?)[@+]/i;
const BOUNCE_TEXT =
  /undeliverable|delivery status notification|delivery (has )?failed|mail delivery (failed|subsystem)|returned mail|couldn'?t be delivered|could not be delivered|wasn'?t found at|address not found/i;
const NO_SUBJECT = /^\s*(no subject)?\s*$/i;

/** A delivery-failure report rather than a real reply. */
export function isBounceMessage(from: string, subject: string, body: string): boolean {
  if (BOUNCE_SENDER.test(from.trim())) return true;
  if (BOUNCE_TEXT.test(subject)) return true;
  // Some providers send the report with no subject; only then trust the body text.
  return NO_SUBJECT.test(subject) && BOUNCE_TEXT.test(body);
}

/** Addresses named in a bounce report (the recipients that failed), excluding the reporting mailbox. */
export function bouncedRecipients(body: string, from: string): string[] {
  const found = (body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((a) => a.toLowerCase());
  return [...new Set(found)].filter((a) => a !== from.toLowerCase() && !BOUNCE_SENDER.test(a));
}
