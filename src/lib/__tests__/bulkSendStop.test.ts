import { describe, it, expect } from 'vitest';
import { shouldStopBulk } from '../bulkSend';

const withCode = (code: string) => Object.assign(new Error('x'), { code });

describe('shouldStopBulk', () => {
  it('is true for DAILY_LIMIT, NO_MAILBOX and REAUTH_REQUIRED', () => {
    for (const c of ['DAILY_LIMIT', 'NO_MAILBOX', 'REAUTH_REQUIRED']) {
      expect(shouldStopBulk(withCode(c))).toBe(true);
    }
  });
  it('is false for GRAPH_FAILED, TOO_LARGE and codeless errors', () => {
    expect(shouldStopBulk(withCode('GRAPH_FAILED'))).toBe(false);
    expect(shouldStopBulk(withCode('TOO_LARGE'))).toBe(false);
    expect(shouldStopBulk(new Error('boom'))).toBe(false);
    expect(shouldStopBulk(null)).toBe(false);
  });
});
