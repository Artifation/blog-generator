# Secrets at rest

This document explains how the blog-tool encrypts API keys and WordPress
passwords stored in the SQLite DB, and what operators need to do to keep
that protection intact across upgrades and key-rotations.

## Why

The blog-tool stores a handful of sensitive strings per site in
`data/app.db`:

- `sites.api_keys` — JSON blob containing OpenAI / Anthropic / Gemini /
  Groq / Fal.ai / Resend / Cloudflare / GSC service-account JSON /
  DataForSEO credentials.
- `sites.wordpress_config.appPassword` — the WordPress
  Application Password used by the publisher.

Without encryption these sit in plaintext inside a single file. Threats we
care about:

- **Stolen disk / cold backup**: a tar.gz of `data/`, an offsite backup, a
  cloned VPS volume — anyone who reads `app.db` reads every API-key.
- **Operator mistake**: a dev who runs the tool on their laptop and later
  pushes the whole working tree (including `data/`) to a shared drive.
- **Lateral movement**: an attacker who lands on the host with read-only
  filesystem access (e.g. via a path-traversal in a totally unrelated
  service on the same box) shouldn't immediately own every LLM account.

What's **out of scope**: a live attacker on the running app-process with
the env-var loaded. They get the keys. That's by design — the running
process must be able to call OpenAI etc. — and is why threat-model-wise
the encryption is "at rest" only.

## How it works

AES-256-GCM via Node's built-in `crypto` module. Every secret string is
wrapped in a per-field envelope:

```json
{ "v": 1, "iv": "<base64 96-bit>", "tag": "<base64 128-bit>", "ct": "<base64>" }
```

- `v` — envelope version, bumped if we ever change algorithm.
- `iv` — fresh 96-bit nonce per encrypt call (NIST-recommended for GCM).
- `tag` — 128-bit GCM auth tag, so tampering is detected.
- `ct` — ciphertext.

The whole envelope is stored as a JSON string inside the existing
`TEXT`-mode JSON columns. The schema didn't change; only the values
inside the existing `api_keys` blob and the `appPassword` field inside
`wordpress_config` are wrapped.

Code lives in:

- `apps/web/lib/security/crypto.ts` — `encryptString`, `decryptString`,
  `isEncrypted`.
- `apps/web/lib/sites/secrets.ts` — `sealApiKeys`, `openApiKeys`,
  `sealWordpressConfig`, `openWordpressConfig`, `openSiteSecrets`.
  Single point where the read/write paths hook in.
- `apps/web/lib/sites.ts` — `createSite` / `updateSite` call `seal*`;
  `getSiteById` / `getSiteBySlug` / `listSitesWithStats` call
  `openSiteSecrets`.
- `apps/web/lib/db/client.ts` — on boot, `ensureSchema()` scans every
  `sites` row and encrypts any plaintext leaf-values. Idempotent.

## Setup

### Generate a key

```bash
# Either:
openssl rand -base64 32

# Or via the bundled helper:
npx tsx apps/web/scripts/generate-encryption-key.ts
```

The helper prints a ready-to-paste `.env` line. The output is a 32-byte
key, base64-encoded.

### Put it in your environment

Add to `apps/web/.env`:

```
APP_ENCRYPTION_KEY=<the base64 string>
```

On a VPS, put it in your systemd unit / docker-compose env / pm2 ecosystem
config — wherever your runtime gets env-vars. **Do not** commit it to
git.

### Back it up

If you lose `APP_ENCRYPTION_KEY` you cannot recover the encrypted secrets
in the DB. Treat it like the DB-file itself: back it up at the same
cadence (and store the two backups separately so a single leak doesn't
hand over both).

## Boot behaviour

### First boot with a key set

`ensureSchema()` finds existing plaintext secrets, encrypts them in
place, writes back. You'll see one log line per boot:

```
[security] Encrypted plaintext secrets in N site row(s) at boot.
```

After that the row is in envelope form and subsequent boots are no-ops.

### Boot without `APP_ENCRYPTION_KEY` in dev

The app starts and logs a loud warning:

```
[security] APP_ENCRYPTION_KEY is not set — secrets in the SQLite DB are stored as PLAINTEXT.
          Generate a key:
            npx tsx apps/web/scripts/generate-encryption-key.ts
          and add it to apps/web/.env. The app will then encrypt existing rows on next boot.
```

Onboarding / pipeline / publish all keep working — values just stay
plaintext until you set a key and re-boot.

### Boot without `APP_ENCRYPTION_KEY` in production

Refuses to start. Hard fail with a clear message — we never want secrets
silently landing on a production disk as plaintext.

## Key rotation

GCM is a symmetric cipher and we don't ship multi-key envelopes, so
rotation is a one-shot manual operation:

1. **Stop** the app (or scale to 0) to avoid concurrent writes.
2. **Back up** `data/app.db` and your current `.env`.
3. **Decrypt** with the old key. The simplest path:
   ```bash
   APP_ENCRYPTION_KEY=<OLD> npx tsx apps/web/scripts/inspect-db.ts
   ```
   (or write a small one-off script that reads each site via
   `getSiteById`, which returns plaintext, then re-saves with the new
   key after step 4).
4. **Swap** `APP_ENCRYPTION_KEY` in your env to the new key and **drop
   the now-decrypted blobs back to plaintext** (e.g. via direct SQL
   `UPDATE sites SET api_keys = ?`). On the next boot the migration
   re-encrypts them with the new key automatically.
5. **Start** the app. Watch the boot log for
   `Encrypted plaintext secrets in N site row(s) at boot.`
6. **Securely destroy** the old key.

For a single-site VPS deployment this whole dance is rarely needed —
keep the original key safe and avoid rotation unless you suspect a
compromise.

## What is NOT encrypted

Deliberately plaintext:

- Blog content (`drafts.content_html`, `published_posts.content_html`),
  titles, meta-descriptions, TLDRs — these are public anyway.
- Brand-voice text, ban-list, pillars, schedule cron, etc. — config, not
  secret.
- `wordpress_config.baseUrl` and `wordpress_config.user` — needed for
  public URLs and not secrets on their own.
- The user-account `password_hash` column — already a one-way bcrypt-ish
  hash, no plaintext to protect.
- GSC service-account JSON has been *included* in the encrypted set
  because the JSON contains a private RSA key.

If you need to expand the set, add the field name to the JSON-blob
processing in `apps/web/lib/sites/secrets.ts` (for items inside
`api_keys`) or to `sealWordpressConfig` / `openWordpressConfig` (for new
fields inside `wordpress_config`), and to the migration helpers inside
`apps/web/lib/db/client.ts`.

## Required env vars (for `.env.example`)

| Name | Required | Notes |
| --- | --- | --- |
| `APP_ENCRYPTION_KEY` | yes in prod, recommended in dev | base64-encoded 32 bytes (AES-256 key). Generate via `openssl rand -base64 32` or `npx tsx apps/web/scripts/generate-encryption-key.ts`. |

## Verifying the install

The repo ships two checks:

```bash
# Unit tests — round-trip + tamper-detection + key-handling.
npx tsx --test apps/web/lib/security/__tests__/crypto.test.ts

# End-to-end migration smoke test against a throwaway DB.
APP_ENCRYPTION_KEY=$(openssl rand -base64 32) DATABASE_FILE=/tmp/enc.db \
  npx tsx apps/web/scripts/test-encrypt-migration.ts
```

Both should print `OK` (or `pass N/0 fail`) on a healthy install.
