import { beforeEach, describe, expect, it } from 'vitest';
import { decryptToken, encryptToken, signState, verifyState } from '../../../api/_lib/crypto';

beforeEach(() => {
  process.env.EMAIL_TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
});

const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);

describe('token crypto', () => {
  it('round-trips a token', () => {
    expect(decryptToken(encryptToken('abc'))).toBe('abc');
    expect(encryptToken('abc')).not.toBe(encryptToken('abc'));
  });

  it('rejects tampered ciphertext', () => {
    const [v, iv, tag, ct] = encryptToken('abc').split(':');
    expect(() => decryptToken([v, iv, tag, flip(ct)].join(':'))).toThrow();
  });

  it('rejects a missing or short key', () => {
    process.env.EMAIL_TOKEN_ENC_KEY = Buffer.alloc(8).toString('base64');
    expect(() => encryptToken('x')).toThrow(/EMAIL_TOKEN_ENC_KEY/);
  });
});

describe('oauth state', () => {
  it('verifyState accepts its own state', () => {
    expect(verifyState(signState('u1', 'n1'))).toEqual({ uid: 'u1', n: 'n1' });
  });

  it('rejects tampered state', () => {
    const [p, s] = signState('u1', 'n1').split('.');
    expect(verifyState(`${flip(p)}.${s}`)).toBeNull();
  });

  it('rejects expired state', () => {
    expect(verifyState(signState('u1', 'n1', -1))).toBeNull();
  });
});
