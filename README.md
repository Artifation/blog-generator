# Artifation Blog Generator

Privé multi-agent SEO blog-generator. Draait op GitHub Actions cron, schrijft NL B2B blogs voor MKB-AI-niche, plaatst als concept in WordPress, mailt preview naar redactie.

## Architectuur
Zie [`docs/superpowers/specs/2026-05-08-seo-blog-generator-design.md`](docs/superpowers/specs/2026-05-08-seo-blog-generator-design.md).

## Setup

### 1. WordPress voorbereiden
1. Maak een dedicated WordPress-user `agent-blog` met rol **Editor**.
2. Genereer een **Application Password** voor die user (Users → Profile → Application Passwords).
3. Installeer en activeer **Yoast SEO** (v20+) op artifation.nl. Deactiveer eventuele andere SEO-plugins (Rank Math, SureRank) — slechts één tegelijk actief.

### 2. Domein-DNS voor email
1. Verifieer `artifation.nl` op resend.com.
2. Voeg de DNS-records (DKIM, SPF, return-path) toe bij je domeinhost.
3. Wacht tot Resend "verified" toont.

### 3. API-accounts
- [Anthropic](https://platform.claude.com) — voor Sonnet 4.6, Haiku 4.5, Opus 4.7.
- [Google AI Studio](https://aistudio.google.com) — voor Gemini 2.5 Pro.
- [Groq](https://console.groq.com) — gratis tier voor Llama 3.3.
- [Fal.ai](https://fal.ai) — voor Flux 1.1 Pro Ultra image generation.
- [Resend](https://resend.com) — voor email.
- (Optioneel) [Cloudflare](https://dash.cloudflare.com) — voor Workers AI image fallback.

### 4. GitHub-secrets
Repo Settings → Secrets and variables → Actions → New repository secret:

| Secret | Bron |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic dashboard |
| `GEMINI_API_KEY` | Google AI Studio |
| `GROQ_API_KEY` | Groq console |
| `FAL_API_KEY` | Fal.ai dashboard |
| `RESEND_API_KEY` | Resend dashboard |
| `WP_USER` | `agent-blog` |
| `WP_APP_PASSWORD` | WP Application Password |
| `CF_ACCOUNT_ID` | (optioneel) Cloudflare dashboard |
| `CF_API_TOKEN` | (optioneel) Cloudflare dashboard |

### 5. Lokaal draaien (test)

```bash
npm install
cp .env.example .env  # vul in
npx tsx src/pipeline/orchestrator.ts --tenant=artifation
```

### 6. Een nieuwe tenant toevoegen

1. Kopieer `tenants/artifation/` naar `tenants/<nieuwe-slug>/`.
2. Pas `config.yaml` en `topics.yaml` aan.
3. Voeg tenant-specifieke secrets toe.
4. (Optioneel) Voeg een 2e workflow-job toe voor de nieuwe tenant.

### 7. Internal-linker

De reverse internal-linker draait wekelijks (maandag 05:00 UTC) en plaatst links in oudere posts naar de nieuwste posts. Inschakelen per tenant:

```yaml
features:
  internal_linker:
    enabled: true
    max_links_per_run: 10
    lookback_posts: 50
    exclude_post_ids: [12, 34]   # pillar/product pages waar geen links bij mogen
```

Logs van elke run staan in `data/internal-linker-runs/<tenant>/<date>.json`.

## Tests

```bash
npm test                # alle unit + integration
npm run test:watch      # watch-mode
npm run typecheck       # tsc --noEmit
```

## Production deployment

Voor het draaien van Blog Studio (de webapp + agent-pipeline) op een eigen VPS:

```bash
git clone https://github.com/Artifation/blog-generator.git /opt/blogtool
cd /opt/blogtool
cp .env.example .env && $EDITOR .env
docker compose up -d --build
```

Volledige walkthrough — Docker Compose én bare-metal+systemd, met backups,
reverse proxy (Caddy/nginx), updates, scheduling en logs — staat in
[`docs/deployment/vps.md`](docs/deployment/vps.md).

Korte cheat-sheets:
- Systemd unit + install: [`docs/deployment/systemd/`](docs/deployment/systemd/)
- Caddyfile voorbeeld:    [`docs/deployment/caddy/Caddyfile`](docs/deployment/caddy/Caddyfile)
- SQLite backup script:   [`scripts/backup.sh`](scripts/backup.sh)
- Health endpoint:        `GET /api/health` -> `200 {"ok":true,...}`

## Kosten
±€0,17 per gepubliceerde post. ±€2-3/maand bij 3 published/week + 4/week reject.
