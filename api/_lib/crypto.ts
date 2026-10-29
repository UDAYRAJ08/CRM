/// <reference types="node" />
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function encKey(): Buffer {
  const raw = process.env.EMAIL_TOKEN_ENC_KEY;
  if (!raw) throw new Error('EMAIL_TOKEN_ENC_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('EMAIL_TOKEN_ENC_KEY must be base64 of 32 bytes');
  return key;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptToken(enc: string): string {
  const [v, iv, tag, ct] = enc.split(':');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Bad token format');
  const d = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

const hmac = (data: string) =>
  createHmac('sha256', createHash('sha256').update('oauth-state:' + (encKey().toString('base64'))).digest())
    .update(data)
    .digest();

export function signState(uid: string, ttlMs = 600_000): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + ttlMs, n: randomBytes(8).toString('hex') })).toString('base64url');
  return `${payload}.${hmac(payload).toString('base64url')}`;
}

export function verifyState(state: string): { uid: string } | null {
  const [payload, sig] = String(state).split('.');
  if (!payload || !sig) return null;
  const want = hmac(payload);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof uid === 'string' && typeof exp === 'number' && exp > Date.now() ? { uid } : null;
  } catch {
    return null;
  }
}
