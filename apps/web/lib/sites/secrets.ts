/**
 * Encrypt-on-write / decrypt-on-read wrappers for the secret bits of a Site
 * row: `apiKeys` (every value) and `wordpressConfig.appPassword`.
 *
 * Rationale: all secret data must live encrypted at rest in SQLite, but the
 * rest of the codebase reads `site.apiKeys?.anthropic` style fields directly.
 * Rather than touching every caller, we wrap the DB boundary — `sealApiKeys`
 * runs in createSite/updateSite, `openApiKeys` runs in the getSite* readers.
 *
 * If `APP_ENCRYPTION_KEY` is NOT set (dev convenience), the helpers no-op and
 * leave the values as plaintext — same behaviour the codebase had before.
 * `lib/db/client.ts#ensureSchema` warns loudly in dev and throws in prod, so
 * production deploys never hit this no-op path with secrets in flight.
 *
 * The shape of `apiKeys` (a `Record<string, string>` JSON blob) and of
 * `wordpressConfig` is unchanged; only the leaf-string values are wrapped in
 * an envelope JSON-string (see `lib/security/crypto.ts`).
 */

import {
  encryptString,
  decryptString,
  isEncrypted,
  isEncryptionAvailable,
} from "../security/crypto";
import type { Site } from "../db/schema";

// `apiKeys` is a structured object in the schema but functionally a
// `Record<string, string | undefined>` blob. We accept both shapes and return
// the same shape we got, so callers stay type-clean.
type ApiKeysShape = NonNullable<Site["apiKeys"]>;
type WordpressShape = NonNullable<Site["wordpressConfig"]>;

type AnyApiKeys = Record<string, string | undefined>;

function processApiKeys(
  apiKeys: AnyApiKeys,
  mode: "seal" | "open",
): AnyApiKeys {
  const out: AnyApiKeys = {};
  const available = isEncryptionAvailable();
  for (const [k, v] of Object.entries(apiKeys)) {
    if (v === undefined || v === null) {
      if (mode === "open") out[k] = v;
      // On seal: drop undefined (cleaner JSON).
      continue;
    }
    if (typeof v !== "string") {
      // Defensive — schema is string-only, but pass through unknown types.
      out[k] = v as unknown as string;
      continue;
    }
    if (v === "") {
      out[k] = "";
      continue;
    }
    if (mode === "seal") {
      if (!available) {
        // Dev mode without key: pass through (ensureSchema warned at boot).
        out[k] = v;
        continue;
      }
      out[k] = isEncrypted(v) ? v : encryptString(v);
    } else {
      if (!isEncrypted(v)) {
        // Plaintext slipped through (legacy row, or no key at write time).
        out[k] = v;
        continue;
      }
      if (!available) {
        throw new Error(
          `[sites/secrets] apiKeys.${k} is encrypted but APP_ENCRYPTION_KEY is not set. ` +
            `Set it in your env and restart, or re-enter the key via Settings.`,
        );
      }
      out[k] = decryptString(v);
    }
  }
  return out;
}

/**
 * Encrypt every leaf-string value in an apiKeys blob. Skips empty strings and
 * already-encrypted values (idempotent). Undefined keys are dropped.
 */
export function sealApiKeys<T extends AnyApiKeys>(
  apiKeys: T | null | undefined,
): T {
  if (!apiKeys) return {} as T;
  return processApiKeys(apiKeys, "seal") as T;
}

/**
 * Decrypt every leaf-string value in an apiKeys blob. Tolerates plaintext for
 * backwards-compat (pre-migration rows that slipped through), values that
 * aren't envelope-shaped are returned as-is.
 */
export function openApiKeys<T extends AnyApiKeys>(
  apiKeys: T | null | undefined,
): T {
  if (!apiKeys) return {} as T;
  return processApiKeys(apiKeys, "open") as T;
}

/**
 * Encrypt only `appPassword` inside a wordpressConfig blob. `baseUrl` and
 * `user` stay plaintext — they aren't secrets. Idempotent.
 */
export function sealWordpressConfig(
  cfg: WordpressShape | null | undefined,
): WordpressShape | null {
  if (!cfg) return null;
  const next: WordpressShape = { ...cfg };
  if (!isEncryptionAvailable()) return next;
  if (typeof next.appPassword !== "string" || next.appPassword === "") {
    return next;
  }
  if (isEncrypted(next.appPassword)) return next;
  next.appPassword = encryptString(next.appPassword);
  return next;
}

/**
 * Decrypt `appPassword` inside a wordpressConfig blob.
 */
export function openWordpressConfig(
  cfg: WordpressShape | null | undefined,
): WordpressShape | null {
  if (!cfg) return null;
  const next: WordpressShape = { ...cfg };
  if (typeof next.appPassword !== "string" || next.appPassword === "") {
    return next;
  }
  if (!isEncrypted(next.appPassword)) return next;
  if (!isEncryptionAvailable()) {
    throw new Error(
      "[sites/secrets] wordpressConfig.appPassword is encrypted but APP_ENCRYPTION_KEY is not set. " +
        "Set it in your env and restart, or re-enter the password via Settings.",
    );
  }
  next.appPassword = decryptString(next.appPassword);
  return next;
}

/**
 * Convenience: hydrate a freshly-read Site row in place (returns a new object
 * with secrets decrypted). Used by getSiteById/getSiteBySlug/listSites.
 */
export function openSiteSecrets<S extends Pick<Site, "apiKeys" | "wordpressConfig">>(
  site: S,
): S {
  return {
    ...site,
    apiKeys: openApiKeys(site.apiKeys as ApiKeysShape) as S["apiKeys"],
    wordpressConfig: openWordpressConfig(
      site.wordpressConfig as WordpressShape | null,
    ) as S["wordpressConfig"],
  };
}
