# Productie-readiness — actielijst

Status-assessment van **2026-07-08** (branch `reconcile-live-audit`, draait live op de VPS).
De zware security-audit (juni + 2 remediatie-rondes) is afgerond; dit document dekt de
resterende **operationele** randjes. Vink af naarmate ze klaar zijn.

Legenda: 🔴 blokker · 🟠 belangrijk · 🟡 polish

---

## 🔴 Blokkers

### [x] #4 — Error-pagina's (KLAAR, 2026-07-08)
Toegevoegd, typecheck groen:
- `apps/web/app/not-found.tsx` — merk-stijl 404 (admin + publieke blog).
- `apps/web/app/error.tsx` — route-error boundary met "opnieuw proberen".
- `apps/web/app/global-error.tsx` — root-fallback met eigen `<html>/<body>` + inline stijl.
- `.err-*` stijlblok in `apps/web/app/globals.css`.

### [ ] #2 — Kostenplafonds op productie zetten  ← DOE DIT NU
Caps shippen blanco (`.env.example:127-128`) → leeg = **onbeperkt** = risico op runaway LLM-spend.
Gekozen waarden: **`MAX_RUN_USD=5`**, **`MAX_WEEKLY_USD=40`** (per site; ~€0,17/post nu).

Uitvoeren op de VPS (kan niet blind vanaf laptop — prod-`.env` is gitignored):
```bash
ssh -i ~/.ssh/vps_deploy root@187.124.171.70
cd /opt/blogtool
# voeg toe of pas aan in .env:
#   MAX_RUN_USD=5
#   MAX_WEEKLY_USD=40
grep -E 'MAX_(RUN|WEEKLY)_USD' .env    # controleer
docker compose up -d                    # herstart zodat env geladen wordt
docker compose logs --tail=20 blogtool  # bevestig healthy
```
> Let op: `assertRunBudget` (per-run) wordt op beide pipeline-paden afgedwongen; de
> **weekly** cap wordt alleen op het `apps/web/lib/pipeline/runForSite.ts`-pad afgedwongen,
> niet op de `src/`-orchestrator. Zie 🟠 #A.

### [~] #1 — Back-ups automatiseren + verifiëren (TOOLING KLAAR, 2026-07-08 — VPS-stap open)
Gedaan in de repo:
1. **Integriteitscheck** — `scripts/backup.sh` draait nu `PRAGMA integrity_check` op de snapshot
   én `gunzip -t` op de gzip; faalt luid (exit ≠ 0) en **prunet géén** oude backups als de nieuwe stuk is.
   (Fallback-flow getest; `integrity_check`-tak vereist sqlite3 = aanwezig op de VPS.)
2. **Off-site** — `RCLONE_REMOTE` support ingebouwd in het script (mirror per run als `rclone` aanwezig).
3. **Scheduling** — systemd-units toegevoegd: `docs/deployment/systemd/blogtool-backup.{service,timer}`
   (dagelijks 03:00 UTC, `OnFailure`-hook, draait als `blogtool`-user). Docs bijgewerkt (systemd README + vps.md).

Nog te doen op de VPS (operator-stap):
```bash
ssh -i ~/.ssh/vps_deploy root@187.124.171.70 ; cd /opt/blogtool
sudo cp docs/deployment/systemd/blogtool-backup.{service,timer} /etc/systemd/system/
# Docker: zet in /etc/blogtool/backup.env de volume-paden + off-site remote:
#   DB_FILE=/var/lib/docker/volumes/blogtool_data/_data/app.db
#   BACKUP_DIR=/var/lib/docker/volumes/blogtool_data/_data/backups
#   RCLONE_REMOTE=b2:blogtool-backups   (optioneel maar aangeraden)
sudo systemctl daemon-reload && sudo systemctl enable --now blogtool-backup.timer
sudo systemctl start blogtool-backup.service      # test één run
journalctl -u blogtool-backup -n 30               # verwacht: "integrity_check: ok ... verified"
```
4. **Restore-drill** — daarna één keer een backup terugzetten in een wegwerp-container om de recipe te bewijzen.
   > Let op: de `blogtool`-systeemuser in de unit past bij de bare-metal deploy. Bij de **Docker**-deploy draai je
   > 't script op de host tegen de volume-mount — pas dan `User=`/paden aan of draai als root.

### [ ] #3 — Migratiesysteem (of bewust accepteren)
Schema evolueert nu via hand-geschreven `CREATE TABLE IF NOT EXISTS` + `safeAddColumn()`
`ALTER ADD COLUMN` in `apps/web/lib/db/client.ts` — geen versies, geen rollback, geen rename/drop.
`drizzle.config.ts` bestaat al (dialect turso) maar er is **geen `drizzle/`-map**. Keuze:
- **Optie A (netjes):** Drizzle-migraties invoeren — `drizzle-kit generate` vanaf de huidige schema als
  baseline-migratie, `migrate()` bij boot i.p.v. `ensureSchema()`. Kost werk + zorgvuldige eerste run tegen de live DB.
- **Optie B (pragmatisch):** de `ensureSchema()`-aanpak bewust houden voor deze single-file/single-operator
  deploy, en dat expliciet documenteren als geaccepteerde beperking (geen renames/drops mogelijk).
  → **Aanbeveling:** B nu, A zodra een niet-additieve schemawijziging nodig is.

---

## 🟠 Belangrijk (geen showstopper)

- [ ] **#A — Weekly cap ook op `src/`-orchestrator.** Nu enforced `exceedsWeeklyBudget` alleen op het web-pad;
  de `src/`-orchestrator dwingt alleen de per-run cap af. Voeg de weekly-check daar ook toe.
- [ ] **#B — Externe error-alerting aanzetten.** Sentry is bewust een no-op tenzij `@sentry/node`
  geïnstalleerd + `SENTRY_DSN` gezet (`apps/web/lib/errors/sentry.ts`). Nu alleen DB + optionele e-mail.
  Ofwel Sentry activeren, ofwel de e-mail-alert-fan-out (`email-alert.ts`) bevestigen als voldoende.
- [ ] **#C — TLS / reverse-proxy verifiëren.** `docker-compose.yml:33` bindt standaard op `0.0.0.0:3000` en de
  Caddy/Traefik-blokken staan uitgecommentarieerd. Bevestig dat er een HTTPS-proxy vóór hangt (of zet er één).
- [ ] **#D — Lint in CI + ESLint-config.** `ci.yml` gate't typecheck/test/build maar **niet** lint; er is geen
  committed ESLint-config. `next lint` bestaat als script maar draait nergens. Config toevoegen + lint-stap in CI.
- [ ] **#E — Tests voor API-routes.** `app/api/**/route.ts` (cron-auth, image-upload, publish) en
  `lib/auth/credentials.ts`/`password.ts` zijn ongetest; alleen de laag eronder is gedekt. Geen E2E.

---

## 🟡 Polish

- [ ] **#F — UI-gaten:** topbar-zoek is `alert()`-placeholder, notificatie-bel is no-op, onboarding vraagt een
  Resend-key die nooit als veld getoond wordt, nieuwe site zonder topics toont "geen resultaten" i.p.v. eerste-keer-CTA.
- [ ] **#G — SEO-restjes:** Twitter-card-tags + JSON-LD `publisher.logo`/`author`-image ontbreken.
  (robots.txt, per-site sitemap, Article-JSON-LD, OG-tags zijn al gewired.)
- [ ] **#H — A11y deferred:** Radix/modal focus/ESC/ARIA + nonce-gebaseerde CSP (nu `script-src 'unsafe-inline'`).
  Vereist visuele verificatie met draaiende app.
- [ ] **#I — `src/index.ts` is nog een stub** (`// placeholder`).

---

## Wat al solide is (referentie)
Server-side opaque sessies + revocatie · tenant-ownership-checks in elke server-action · SSRF-guard met
redirect-revalidatie · dual-bucket login-rate-limit (IP + e-mail) · invite/scrape-throttle · AES-256 secrets
at-rest (boot faalt zonder key) · digest-gepinde Docker base-image · non-root container + healthcheck + tini ·
`/api/health` + `/api/ready` · CI-gate (typecheck/test/build, SHA-pinned) · 437 root + 107 web tests groen ·
per-run kostenbewaking mid-pipeline · robots/sitemap/JSON-LD gewired.
