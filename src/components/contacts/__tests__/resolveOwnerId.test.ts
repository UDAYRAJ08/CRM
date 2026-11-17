import { describe, it, expect } from 'vitest';
import { resolveOwnerId } from '../ContactFormModal';

describe('resolveOwnerId', () => {
  it('keeps an unassigned contact unassigned when editing', () => {
    expect(resolveOwnerId(true, '', 'me')).toBeNull();
  });
  it('keeps the chosen owner when editing', () => {
    expect(resolveOwnerId(true, 'm2', 'me')).toBe('m2');
  });
  it('defaults a new contact to its creator', () => {
    expect(resolveOwnerId(false, '', 'me')).toBe('me');
  });
  it('uses the chosen owner for a new contact', () => {
    expect(resolveOwnerId(false, 'm2', 'me')).toBe('m2');
  });
});
