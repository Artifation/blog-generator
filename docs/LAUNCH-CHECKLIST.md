# Launch checklist

Stap-voor-stap om van huidig main-branch state naar eerste gepubliceerde blog op artifation.nl te komen. Geen code-werk meer; alles handmatig of via WordPress/secrets-portal.

## 1. Tenant config invullen — `tenants/artifation/config.yaml`

Open het bestand. Vervang elke `REPLACE_ME` placeholder. Specifiek:

```yaml
author:
  name: REPLACE_ME              # echte auteursnaam (bv. "Julian van Artifation")
  linkedin: REPLACE_ME          # https://linkedin.com/in/jouw-profiel
  bio: REPLACE_ME               # 1-2 zinnen, NL, B2B-context
  photo_url: REPLACE_ME         # https-URL naar profielfoto

organization:
  legal_name: REPLACE_ME        # bv. "Artifation B.V."
  kvk: REPLACE_ME               # 8-cijferig KvK-nummer
  btw: REPLACE_ME               # NL...B01 BTW-nummer
  address: REPLACE_ME           # bezoekadres
```

**Reden:** spec §14 zegt deze velden zijn intentioneel placeholder; tot ze zijn ingevuld parseert de tenant config wel maar je publiceert content met fake auteurs-data.

**Verifieer lokaal:**

```bash
npx tsx -e "import('./src/config/loader.ts').then(m => m.loadTenant('artifation').then(c => console.log('OK', c.author.name, c.organization.kvk)))"
```

Moet de echte naam + KvK printen.

---

## 2. WordPress voorbereiden — `artifation.nl`

### 2.1 Dedicated user

1. WP admin → Users → Add New
2. Username: `agent-blog` (of vergelijkbaar)
3. Role: **Editor** (NIET admin — least privilege)
4. Wachtwoord: random, opslaan in password-manager (wordt niet gebruikt — App Password is wat je nodig hebt)

### 2.2 Application Password

1. Inloggen als `agent-blog` → Profile → Application Passwords
2. New Application Password met label "blog-generator"
3. **Kopieer de gegenereerde string** (zonder spaties, formaat `xxxx xxxx xxxx xxxx xxxx xxxx`)
4. Bewaar in password-manager — wordt niet meer getoond

### 2.3 Rank Math API Manager plugin

1. WP admin → Plugins → Add New
2. Upload zip vanaf `https://github.com/Devora-AS/rank-math-api-manager`
3. Activate
4. Verify endpoint bestaat: `curl -i -u "agent-blog:<app-password>" https://artifation.nl/wp-json/rank-math-api/v1/updateMeta` (verwacht 405 Method Not Allowed bij GET — bewijst dat de route bestaat)

### 2.4 (Optioneel) WP versie check

WordPress 6.5+ vereist voor AVIF-uploads. Check via Dashboard → At a Glance.

---

## 3. Resend (email) opzetten

### 3.1 Domain verifiëren

1. Account aanmaken op resend.com
2. Add Domain → `artifation.nl`
3. Voeg de getoonde DKIM/SPF/return-path DNS-records toe bij je domeinhost (TransIP, Versio, Cloudflare, etc.)
4. Wacht tot Resend "verified" toont (5 min – 24 u)

### 3.2 API key

1. Resend → API Keys → Create
2. Permissions: Full access (of "Sending access" als je dat strakker wil)
3. Bewaar de key

---

## 4. API-accounts

| Provider | URL | Doel | Tarief 2026 |
|---|---|---|---|
| Anthropic | platform.claude.com | Sonnet 4.6, Haiku 4.5, Opus 4.7 | ~€0,12 per blog |
| Google AI Studio | aistudio.google.com | Gemini 2.5 Pro (Researcher) | ~€0,02 per blog |
| Groq | console.groq.com | Llama 3.3 70B (Image Prompter) | gratis tier |
| Fal.ai | fal.ai | Flux 1.1 Pro Ultra (image-gen) | ~€0,03 per image |

(Cloudflare Workers AI als image-fallback is optioneel — alleen nodig als Fal.ai twee keer faalt op één run.)

---

## 5. GitHub secrets — repo Settings → Secrets and variables → Actions

Voeg toe als "New repository secret":

| Secret | Value source |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic dashboard, format `sk-ant-...` |
| `GEMINI_API_KEY` | AI Studio, format `AIza...` |
| `GROQ_API_KEY` | Groq console, format `gsk_...` |
| `FAL_API_KEY` | Fal.ai dashboard, format `<key-id>:<key-secret>` |
| `RESEND_API_KEY` | Resend dashboard, format `re_...` |
| `WP_USER` | `agent-blog` (of welke WP-username je koos in stap 2.1) |
| `WP_APP_PASSWORD` | de App Password uit stap 2.2 (mét spaties — WP accepteert beide vormen) |
| `CF_ACCOUNT_ID` | (optioneel) Cloudflare dashboard |
| `CF_API_TOKEN` | (optioneel) Cloudflare dashboard, met `Workers AI` permission |

---

## 6. Eerste live-run (Task 36)

### 6.1 Trigger handmatig

Op GitHub: Actions → "Daily blog generator" → Run workflow → Branch: `main`, Tenant: `artifation` → Run.

(Of via CLI: `gh workflow run "Daily blog generator" --ref main -f tenant=artifation`)

### 6.2 Tijdens de run — monitor

Workflow logs tonen elke stage in JSON. Verwacht volgorde:
1. `sitemap` (5s)
2. `researcher` (~30s, Gemini 2.5 Pro)
3. `strategist` (~25s, Sonnet 4.6)
4. `writer` (~60s, Sonnet 4.6, kan reflectie-loop tot 3x = 180s totaal)
5. `seoEditor` (~30s, Haiku 4.5)
6. `factChecker` (~45s, Opus 4.7)
7. `qualityJudge` (~30s, Opus 4.7)
8. (vertakking GO / NO-GO / cap)
9. `imagePrompter` (~5s, Groq)
10. `imageGen` (~30s, Fal.ai Flux)
11. `wordpress` (~10s, upload + create + Rank Math meta)
12. `email` (~3s, Resend)

Totaal happy-path: ~3-5 minuten.

### 6.3 Na de run — verifieer

In volgorde van checks:

**Email arriveerde?** Check je inbox van het `to`-adres in `tenants/artifation/config.yaml`. Verwacht onderwerp `[Artifation] Concept klaar: <H1> — score X.Y` (of een Reject/Cap/Error variant).

**WP draft staat klaar?** WP admin → Posts → Drafts. Eerste post moet er zijn met:
- Title = de gegenereerde H1
- Featured image = AVIF
- Content begint met `<div class="tldr">` met drie lagen (one-liner + direct-answer + summary)
- Aan het eind van de body: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting",...}</script>`

**Rank Math meta gezet?** Klik op de post → scroll naar Rank Math sectie. Focus keyword + meta title + meta description moeten ingevuld zijn.

**Topic state geüpdatet?** Repo → `tenants/artifation/topics.yaml`. De topic die werd gepublished heeft nu `status: published`, `last_attempted: <ISO>`, `wp_post_id: <number>`, `wp_post_url: <link>`, `key_entities: [...]`.

**Run-log artifact?** GitHub Actions run → Artifacts → `run-log-<run-id>` (download en bekijk de JSON).

### 6.4 Wat als het misgaat?

| Symptoom | Vermoedelijke oorzaak | Check |
|---|---|---|
| Email arriveerde niet | Resend domain niet verified | Resend dashboard → Domains |
| Email is een Error-mail | Een agent crashte | Email body bevat stage + error message |
| Verdict NO-GO | Quality Judge rejecteerde | Email body toont hard_fails + reasoning |
| Verdict CAP | Al 4 posts deze week | Wacht tot maandag of verhoog `max_posts_per_week_published` |
| WP 401 in logs | App Password fout | Re-genereer App Password, update GH secret |
| Rank Math 404 | Plugin niet geactiveerd | WP admin → Plugins → activate Rank Math API Manager |
| Image 500 | WP <6.5 of disk-quota | Check WP version + storage |

### 6.5 Iteratie

Eerste run vrijwel zeker NO-GO of email-feedback waardig. Verwachte tweaks:
- Banlist uitbreiden in `tenants/artifation/config.yaml.brand.ban_list` met clichés die je in de output ziet
- Pillar-gewichten herschikken als de generator te veel uit één pillar pakt
- Topic priorities verhogen voor onderwerpen waar je vroeg op wil ranken
- TL;DR direct-answer regels in `src/agents/prompts/strategist.ts` verfijnen op basis van wat de Researcher daadwerkelijk produceert

Commit elke tweak. Trigger opnieuw via workflow_dispatch.

---

## 7. Pas na 5+ gepubliceerde posts: open features in roadmap

Pas dán is feature-uitbreiding zinvol:
- **Phase 1 — Internal-linker** is al af (commits `8b8d29b..1f057db`); zet `features.internal_linker.enabled: true` in `tenants/artifation/config.yaml` en de wekelijkse cron pakt op vanaf maandag 05:00 UTC.
- **Phase 7 — Repurposer** vraagt voldoende content om kort-form van te maken.
- **Phase 8 — GSC integration** vraagt 90+ dagen data voordat de query/page-pairs betekenisvol zijn.
- **Phase 12 — Editorial review log** wordt verplicht per 2 augustus 2026 (Article 50 EU AI Act); moet vóór die datum draaien.

Roadmap met alle openstaande Phases: [`docs/superpowers/plans/2026-05-08-seo-extensions.md`](superpowers/plans/2026-05-08-seo-extensions.md).
Validatie-onderbouwing: [`docs/superpowers/research/2026-05-08-seo-validation.md`](superpowers/research/2026-05-08-seo-validation.md).

---

## Checklist samengevat

- [ ] `tenants/artifation/config.yaml` REPLACE_ME's vervangen
- [ ] WP user `agent-blog` met Editor-rol
- [ ] App Password gegenereerd
- [ ] Rank Math API Manager plugin geïnstalleerd + geactiveerd
- [ ] Resend `artifation.nl` domain verified
- [ ] Anthropic + Gemini + Groq + Fal API-keys
- [ ] 7 GitHub secrets gezet (8e en 9e optioneel)
- [ ] Workflow handmatig getriggerd
- [ ] Email + WP-draft + topics.yaml-update geverifieerd
- [ ] (na 1e succes) cron schedule actief — runs draaien daily 04:15 UTC

Pas wanneer de eerste 3-5 posts gepubliceerd zijn en je tevreden bent met output: open Phase 12 (Article 50 deadline) en daarna Phase 5-11 op volgorde.
