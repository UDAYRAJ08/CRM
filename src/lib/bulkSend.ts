// Errors where every remaining send in a bulk run would fail the same way.
const STOP_CODES = ['DAILY_LIMIT', 'NO_MAILBOX', 'REAUTH_REQUIRED'];

export function shouldStopBulk(err: unknown): boolean {
  return STOP_CODES.includes((err as { code?: string } | null)?.code ?? '');
}
