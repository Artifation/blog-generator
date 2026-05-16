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
