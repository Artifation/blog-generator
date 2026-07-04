import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newId(prefix: string, length = 16): string {
  // Rejection sampling: only accept bytes in [0, max) where max is the largest
  // multiple of the alphabet size <= 256, so `% ALPHABET.length` is unbiased
  // (a plain `byte % 36` over-represents the first 256 % 36 = 4 symbols).
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      const b = bytes[i]!;
      if (b < max) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return `${prefix}_${out}`;
}
