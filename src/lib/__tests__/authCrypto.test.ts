import { describe, it, expect } from 'vitest';
import { hashPassword, maskApiKey, encryptSecret, decryptSecret } from '../authCrypto';

describe('hashPassword', () => {
  it('is deterministic and never returns the plain text', async () => {
    const a = await hashPassword('hunter2');
    const b = await hashPassword('hunter2');
    expect(a).toBe(b);
    expect(a).not.toContain('hunter2');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs for different inputs', async () => {
    expect(await hashPassword('a')).not.toBe(await hashPassword('b'));
  });
});

describe('maskApiKey', () => {
  it('never reveals the middle of a key', () => {
    const key = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234';
    const masked = maskApiKey(key);
    expect(masked.startsWith('sk-ant-api03-')).toBe(true);
    expect(masked.endsWith('1234')).toBe(true);
    expect(masked).not.toContain('ABCDEFGH');
  });
  it('fully masks short keys', () => {
    expect(maskApiKey('abc')).not.toContain('abc');
  });
  it('leaves already-masked values alone', () => {
    const masked = maskApiKey('gsk_abcdefghijklmnop');
    expect(maskApiKey(masked)).toBe(masked);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const secret = 'gsk_abcdefghijklmnop1234';
    const cipher = encryptSecret(secret);
    expect(cipher).not.toContain(secret);
    expect(decryptSecret(cipher)).toBe(secret);
  });
  it('does not double-encrypt', () => {
    const cipher = encryptSecret('abc123abc123');
    expect(encryptSecret(cipher)).toBe(cipher);
  });
});
