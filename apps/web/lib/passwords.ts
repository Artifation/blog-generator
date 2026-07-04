/**
 * Password hashing via Node's built-in scrypt — no native deps required.
 *
 * Format on disk:  scrypt$N=16384,r=8,p=1$<salt-hex>$<derived-hex>
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}
const KEY_LEN = 64;
const N = 16384;
const R = 8;
const P = 1;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(plain.normalize("NFKC"), salt, KEY_LEN, { N, r: R, p: P })) as Buffer;
  return `scrypt$N=${N},r=${R},p=${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const params = Object.fromEntries(
    parts[1]!.split(",").map((kv) => kv.split("="))
  ) as { N?: string; r?: string; p?: string };
  const salt = Buffer.from(parts[2]!, "hex");
  const expected = Buffer.from(parts[3]!, "hex");
  const derived = (await scrypt(plain.normalize("NFKC"), salt, expected.length, {
    N: Number(params.N) || N,
    r: Number(params.r) || R,
    p: Number(params.p) || P,
  })) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// A single valid dummy hash (computed once per process) used to equalize the
// timing of the "no such user" login branch. Without running a scrypt there,
// unknown emails return ~instantly while known emails pay the full KDF cost —
// a reliable account-enumeration oracle.
let _dummyHash: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!_dummyHash) _dummyHash = hashPassword(randomBytes(24).toString("hex"));
  return _dummyHash;
}

/**
 * Run the same KDF work a real verify would, then discard it. Call on the
 * user-not-found branch of login so response time doesn't reveal whether an
 * account exists.
 */
export async function equalizeVerifyTiming(plain: string): Promise<void> {
  await verifyPassword(plain, await dummyHash());
}
