/**
 * AES-256-GCM encrypt-at-rest helper voor gevoelige velden in de SQLite DB.
 *
 * Threat model: lekken van het DB-bestand (backup, gestolen VPS-disk, dev die
 * `data/app.db` per ongeluk in een share zet). Met deze laag staan API-keys en
 * WordPress passwords versleuteld op disk; alleen de live app-proces met
 * `APP_ENCRYPTION_KEY` in env kan ze terugdraaien.
 *
 * Envelope-formaat (JSON-string in de DB-kolom):
 *
 *   { "v": 1, "iv": "<base64 96-bit>", "tag": "<base64 128-bit>", "ct": "<base64>" }
 *
 * - `v` = versie van het envelope-schema; bumpen bij algoritme-wissel zodat
 *   migratie-code per versie kan splitsen.
 * - `iv` = random 96-bit nonce per encrypt-call (NIST-aanbeveling voor GCM).
 * - `tag` = 128-bit auth tag (tamper-detection).
 * - `ct` = ciphertext.
 *
 * Key komt uit `process.env.APP_ENCRYPTION_KEY`, base64-encoded 32 bytes.
 * Genereren: `openssl rand -base64 32` of via
 * `npx tsx apps/web/scripts/generate-encryption-key.ts`.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENVELOPE_VERSION = 1 as const;
const ALGO = "aes-256-gcm" as const;
const KEY_BYTES = 32; // 256-bit
const IV_BYTES = 12; // 96-bit, NIST-recommended for GCM
const TAG_BYTES = 16; // 128-bit GCM auth tag

const ENV_VAR = "APP_ENCRYPTION_KEY";

interface Envelope {
  v: typeof ENVELOPE_VERSION;
  iv: string;
  tag: string;
  ct: string;
}

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env[ENV_VAR];
  if (!raw || raw.trim() === "") {
    throw new Error(
      `[security/crypto] Missing env var ${ENV_VAR}. ` +
        `This holds the AES-256-GCM key that protects API-keys and WordPress ` +
        `passwords stored in the SQLite DB. Generate one with:\n\n` +
        `    openssl rand -base64 32\n\n` +
        `or:\n\n` +
        `    npx tsx apps/web/scripts/generate-encryption-key.ts\n\n` +
        `Then put it in your .env as:\n\n` +
        `    ${ENV_VAR}=<the-generated-base64-string>\n\n` +
        `WARNING: lose this key and any previously-encrypted secrets are ` +
        `unrecoverable. Back it up alongside your DB backups.`,
    );
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      `[security/crypto] ${ENV_VAR} is not valid base64. Re-generate with ` +
        `\`openssl rand -base64 32\`.`,
    );
  }
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `[security/crypto] ${ENV_VAR} must decode to exactly ${KEY_BYTES} bytes ` +
        `(got ${buf.length}). Re-generate with \`openssl rand -base64 32\`.`,
    );
  }
  cachedKey = buf;
  return cachedKey;
}

/**
 * Test-only / boot-only: clears the cached key so the next call re-reads env.
 * Used by the unit test and by the bootstrap-migration path when the user
 * just set the key for the first time.
 */
export function _resetKeyCache(): void {
  cachedKey = null;
}

/**
 * True when `APP_ENCRYPTION_KEY` is configured AND decodes to the right size.
 * Use this before calling `encryptString` from any code path that should
 * silently no-op in dev when the user hasn't set up encryption yet.
 */
export function isEncryptionAvailable(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a UTF-8 string. Returns a JSON-string envelope ready to drop into
 * a `TEXT` column. Each call uses a fresh random IV.
 *
 * Throws if `APP_ENCRYPTION_KEY` is missing/invalid.
 */
export function encryptString(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new Error("[security/crypto] encryptString expects a string");
  }
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const env: Envelope = {
    v: ENVELOPE_VERSION,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
  return JSON.stringify(env);
}

/**
 * Decrypt an envelope produced by `encryptString`. Throws on:
 * - missing/invalid key
 * - malformed envelope JSON
 * - unknown version
 * - tampered ciphertext (GCM auth-tag mismatch)
 */
export function decryptString(envelope: string): string {
  if (typeof envelope !== "string") {
    throw new Error("[security/crypto] decryptString expects a string");
  }
  const key = loadKey();
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope);
  } catch {
    throw new Error(
      "[security/crypto] decryptString: input is not a JSON envelope",
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as Envelope).v !== ENVELOPE_VERSION
  ) {
    throw new Error(
      `[security/crypto] decryptString: unsupported envelope version (expected v=${ENVELOPE_VERSION})`,
    );
  }
  const env = parsed as Envelope;
  if (
    typeof env.iv !== "string" ||
    typeof env.tag !== "string" ||
    typeof env.ct !== "string"
  ) {
    throw new Error(
      "[security/crypto] decryptString: envelope missing iv/tag/ct fields",
    );
  }
  const iv = Buffer.from(env.iv, "base64");
  const tag = Buffer.from(env.tag, "base64");
  const ct = Buffer.from(env.ct, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error(
      `[security/crypto] decryptString: bad iv length (got ${iv.length}, expected ${IV_BYTES})`,
    );
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(
      `[security/crypto] decryptString: bad tag length (got ${tag.length}, expected ${TAG_BYTES})`,
    );
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Cheap check to tell plaintext from envelope-strings WITHOUT calling decrypt
 * (which would need the key and throw on plaintext input).
 *
 * Heuristic: an envelope is always a JSON-object string starting with `{"v":1`
 * (after optional whitespace) and contains `"iv"`/`"tag"`/`"ct"`. Anything
 * else — bare API key, empty string, "{}"-blob — is treated as plaintext.
 *
 * Used by the bootstrap-migration to skip already-encrypted values, and by
 * the read-path as a defensive fallback in case a row is half-migrated.
 */
export function isEncrypted(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("{")) return false;
  // Fast path: the literal `"v":1` prefix is the strongest signal.
  if (!/"v"\s*:\s*1\b/.test(trimmed)) return false;
  if (!trimmed.includes('"iv"')) return false;
  if (!trimmed.includes('"tag"')) return false;
  if (!trimmed.includes('"ct"')) return false;
  return true;
}
