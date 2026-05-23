/**
 * Password hashing API for the auth subsystem. Sits on top of Node's built-in
 * `crypto.scrypt` — no external dep (argon2, bcrypt) needed for a single-user
 * local/VPS deployment.
 *
 * Storage format:  scrypt$N=16384,r=8,p=1$<salt-hex>$<derived-hex>
 *
 * Backed by the existing `lib/passwords.ts` so the on-disk format stays
 * compatible with the per-user `users.passwordHash` column. New schema columns
 * (`user_credentials.password_hash`) use the exact same format.
 */

import {
  hashPassword as _hash,
  verifyPassword as _verify,
} from "../passwords";

/** Hash a plaintext password. Returns the encoded `scrypt$...` string. */
export async function hashPassword(plain: string): Promise<string> {
  return _hash(plain);
}

/**
 * Verify a plaintext password against a stored hash. Constant-time on the
 * comparison step (Node's `timingSafeEqual`). Returns `false` for any
 * malformed input rather than throwing.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return _verify(plain, hash);
}

/**
 * Minimum policy. Single-user local: not enforced as draconian — but we still
 * refuse trivially short ones to dodge typos and one-finger jabs.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordStrength(plain: string): { ok: true } | { ok: false; error: string } {
  if (!plain || plain.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens zijn.`,
    };
  }
  if (plain.length > 1024) {
    return { ok: false, error: "Wachtwoord is te lang (max 1024 tekens)." };
  }
  return { ok: true };
}
