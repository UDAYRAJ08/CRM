import { describe, it, expect } from 'vitest';
import { followUpStep, planFollowUp } from '../emailService';
import type { Reminder } from '../../types/crm';

const rem = (id: string, note: string, done = false, contact_id = 'c1'): Reminder => ({
  id, contact_id, note, done, due_date: '2026-10-22T00:00:00Z', created_at: '2026-10-19T00:00:00Z',
});

describe('followUpStep', () => {
  it('reads new, legacy and manual notes', () => {
    expect(followUpStep('Follow-up 1: Send follow-up email 1 if X does not reply')).toBe(1);
    expect(followUpStep('Follow-up 2: Send follow-up email 2 if X does not reply')).toBe(2);
    expect(followUpStep('Follow-up Step 1: Send reminder email if X does not reply')).toBe(1);
    expect(followUpStep('Follow-up: Send reminder email if X does not reply within 3 days.')).toBe(2);
    expect(followUpStep('Call about pricing')).toBeNull();
  });
});

describe('planFollowUp', () => {
  it('first email queues Follow-up 1', () => {
    expect(planFollowUp([], 'c1')).toEqual({ complete: [], nextStep: 1 });
  });

  it('sending Follow-up 1 completes it and queues Follow-up 2', () => {
    const r1 = rem('r1', 'Follow-up 1: ...');
    expect(planFollowUp([r1], 'c1')).toEqual({ complete: [r1], nextStep: 2 });
  });

  it('sending Follow-up 2 completes it and stops (no loop)', () => {
    const r1 = rem('r1', 'Follow-up 1: ...', true);
    const r2 = rem('r2', 'Follow-up 2: ...');
    expect(planFollowUp([r1, r2], 'c1')).toEqual({ complete: [r2], nextStep: null });
  });

  it('after the sequence is finished, more emails create nothing', () => {
    const done = [rem('r1', 'Follow-up 1: ...', true), rem('r2', 'Follow-up 2: ...', true)];
    expect(planFollowUp(done, 'c1')).toEqual({ complete: [], nextStep: null });
  });

  it('legacy looping reminder completes on the next send', () => {
    const legacy = rem('r1', 'Follow-up: Send reminder email if X does not reply within 3 days.');
    expect(planFollowUp([legacy], 'c1')).toEqual({ complete: [legacy], nextStep: null });
  });

  it('ignores manual reminders and other contacts', () => {
    const manual = rem('m1', 'Call about pricing');
    const other = rem('o1', 'Follow-up 1: ...', false, 'c2');
    expect(planFollowUp([manual, other], 'c1')).toEqual({ complete: [], nextStep: 1 });
  });
});
