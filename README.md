# Artifation Blog Generator

Privé multi-agent SEO blog-generator. Draait op GitHub Actions cron, schrijft NL B2B blogs voor MKB-AI-niche, plaatst als concept in WordPress, mailt preview naar redactie.

## Architectuur
Zie [`docs/superpowers/specs/2026-05-08-seo-blog-generator-design.md`](docs/superpowers/specs/2026-05-08-seo-blog-generator-design.md).

## Setup

### 1. WordPress voorbereiden
1. Maak een dedicated WordPress-user `agent-blog` met rol **Editor**.
2. Genereer een **Application Password** voor die user (Users → Profile → Application Passwords).
3. Installeer de **Rank Math API Manager** plugin (`https://github.com/Devora-AS/rank-math-api-manager`) op artifation.nl. Activeer.

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

## Tests

```bash
npm test                # alle unit + integration
npm run test:watch      # watch-mode
npm run typecheck       # tsc --noEmit
```

## Kosten
±€0,17 per gepubliceerde post. ±€2-3/maand bij 3 published/week + 4/week reject.
