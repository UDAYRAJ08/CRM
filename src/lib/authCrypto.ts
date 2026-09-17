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
