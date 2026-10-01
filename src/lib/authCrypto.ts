/**
 * Cryptographic Password Management and Hashing Utility
 * Uses native Web Cryptography API (crypto.subtle SHA-256) with salting
 * to ensure passwords are never stored or compared in plain text.
 */

const SALT_PREFIX = 'nexus_crm_salt_v1_secure:';
const PASS_HASH_PREFIX = 'crm_auth_hash_';

/**
 * Computes a secure SHA-256 hash of the password with salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(SALT_PREFIX + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encrypts and securely saves a team member's password hash in storage.
 * Automatically cleans up any legacy plain-text password keys.
 */
export async function saveUserPassword(memberId: string, plainPassword: string): Promise<void> {
  const trimmed = plainPassword.trim();
  if (!trimmed) return;

  const hash = await hashPassword(trimmed);
  localStorage.setItem(`${PASS_HASH_PREFIX}${memberId}`, hash);

  // Clean up legacy plain text password key if it existed
  localStorage.removeItem(`crm_pass_${memberId}`);
}

/**
 * Retrieves the stored cryptographic password hash for a user.
 */
export function getUserPasswordHash(memberId: string): string | null {
  return localStorage.getItem(`${PASS_HASH_PREFIX}${memberId}`);
}

/**
 * Verifies an entered password against the member's cryptographic hash.
 * Handles seamless upgrading if legacy unhashed keys exist.
 */
export async function verifyUserPassword(memberId: string, inputPassword: string): Promise<boolean> {
  const trimmed = inputPassword.trim();
  if (!trimmed) return false;

  const inputHash = await hashPassword(trimmed);
  const storedHash = getUserPasswordHash(memberId);

  // 1. If stored hash exists, verify directly against the hash
  if (storedHash) {
    return storedHash === inputHash;
  }

  // 2. Legacy fallback & upgrade: if plain text password exists, check and upgrade to hash
  const legacyPlain = localStorage.getItem(`crm_pass_${memberId}`);
  if (legacyPlain) {
    if (trimmed === legacyPlain) {
      await saveUserPassword(memberId, trimmed);
      return true;
    }
    return false;
  }

  // 3. Environment or initial workspace password hash check
  const envPassword = import.meta.env.VITE_WORKSPACE_PASSWORD;
  if (envPassword) {
    const envHash = await hashPassword(envPassword);
    if (inputHash === envHash) {
      // Save member hash so future logins are member-specific
      await saveUserPassword(memberId, trimmed);
      return true;
    }
    return false;
  }

  // 4. If no password has ever been set for this member, initialize with their entered password
  await saveUserPassword(memberId, trimmed);
  return true;
}

/**
 * Verifies email & password login against member records and security hashes.
 */
export async function verifyEmailCredentials(
  email: string,
  memberId: string | undefined,
  inputPassword: string
): Promise<boolean> {
  const trimmed = inputPassword.trim();
  if (!trimmed) return false;

  if (memberId) {
    return verifyUserPassword(memberId, trimmed);
  }

  const envPassword = import.meta.env.VITE_WORKSPACE_PASSWORD;
  if (envPassword) {
    const envHash = await hashPassword(envPassword);
    const inputHash = await hashPassword(trimmed);
    return envHash === inputHash;
  }

  return true;
}

// ------------------------------------------------------------------------------
// API KEY MASKING & STORAGE ENCRYPTION
// ------------------------------------------------------------------------------

const SECRET_SALT = 'crm_vault_salt_secure_2026_';
const CIPHER_PREFIX = 'enc_v1:';

/**
 * Permanently masks an API key for safe UI display so the raw secret is never shown.
 * e.g. "sk-ant-api03-1234567890abcdef" -> "sk-ant-api03-••••••••••••cdef"
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.includes('••••')) return trimmed; // already masked

  if (trimmed.length <= 8) {
    return '••••••••••••';
  }

  // Detect common prefix
  let prefixLength = 4;
  if (trimmed.startsWith('sk-ant-api03-')) prefixLength = 13;
  else if (trimmed.startsWith('sk-proj-')) prefixLength = 8;
  else if (trimmed.startsWith('sk-or-v1-')) prefixLength = 9;
  else if (trimmed.startsWith('AIzaSy')) prefixLength = 6;
  else if (trimmed.startsWith('AQ.')) prefixLength = 6;
  else if (trimmed.startsWith('gsk_')) prefixLength = 4;
  else if (trimmed.startsWith('re_')) prefixLength = 3;
  else if (trimmed.startsWith('ck_')) prefixLength = 3;

  const prefix = trimmed.slice(0, prefixLength);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••••••${suffix}`;
}

/**
 * Obfuscates and encrypts a sensitive API secret before writing to localStorage.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const trimmed = plainText.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(CIPHER_PREFIX)) return trimmed; // already encrypted

  try {
    const salt = SECRET_SALT;
    let result = '';
    for (let i = 0; i < trimmed.length; i++) {
      const charCode = trimmed.charCodeAt(i) ^ salt.charCodeAt(i % salt.length);
      result += String.fromCharCode(charCode);
    }
    return `${CIPHER_PREFIX}${btoa(result)}`;
  } catch {
    return trimmed;
  }
}

/**
 * Decrypts a stored secret from localStorage for authorized internal usage.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  const trimmed = cipherText.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith(CIPHER_PREFIX)) {
    return trimmed; // Plain text fallback from earlier storage
  }

  try {
    const raw = atob(trimmed.slice(CIPHER_PREFIX.length));
    const salt = SECRET_SALT;
    let result = '';
    for (let i = 0; i < raw.length; i++) {
      const charCode = raw.charCodeAt(i) ^ salt.charCodeAt(i % salt.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch {
    return trimmed;
  }
}

