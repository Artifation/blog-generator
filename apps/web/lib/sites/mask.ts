/**
 * Mask a site's secrets before it is handed to client components.
 *
 * getSiteById/getSiteBySlug return DECRYPTED secrets (API keys, WordPress app
 * password). The settings UI previously rendered those plaintext values into
 * client state, so a single page load shipped every tenant secret to the
 * browser — defeating the at-rest encryption. We now blank the secret leaves
 * and ship only a "present" flag, so the form can show "•••• ingesteld"
 * without ever sending the value. Writes are merge-based (see updateSite), so
 * an untouched (blank) secret field preserves the stored value.
 */

import type { SiteWithPillars } from "../sites";

/** apiKeys leaves that are genuine secrets and must never reach the client. */
export const SECRET_API_KEYS = [
  "anthropic",
  "gemini",
  "groq",
  "fal",
  "resend",
  "cloudflareAccount",
  "cloudflareToken",
  "gscServiceAccountJson",
  "dataForSeoPassword",
] as const;

export interface SecretsPresent {
  /** Which secret apiKeys are currently set (non-empty) in the DB. */
  apiKeys: Record<string, boolean>;
  /** Whether a WordPress application password is stored. */
  wpAppPassword: boolean;
}

export function maskSiteForClient(site: SiteWithPillars): {
  site: SiteWithPillars;
  secretsPresent: SecretsPresent;
} {
  const apiKeys = { ...(site.apiKeys ?? {}) } as Record<string, string | undefined>;
  const apiKeysPresent: Record<string, boolean> = {};
  for (const key of SECRET_API_KEYS) {
    const v = apiKeys[key];
    const present = typeof v === "string" && v.length > 0;
    apiKeysPresent[key] = present;
    if (present) apiKeys[key] = "";
  }

  let wp = site.wordpressConfig;
  const wpAppPassword = !!(wp && wp.appPassword);
  if (wp && wp.appPassword) wp = { ...wp, appPassword: "" };

  return {
    site: { ...site, apiKeys: apiKeys as SiteWithPillars["apiKeys"], wordpressConfig: wp },
    secretsPresent: { apiKeys: apiKeysPresent, wpAppPassword },
  };
}
