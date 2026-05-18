# Blog Studio — web app

The GUI for the multi-site blog generator. Built on Next.js 15 + Tailwind + SQLite.

## Run locally

```bash
cd apps/web
npm install
npm run dev
```

Then open http://localhost:3000.

The SQLite database lives at `data/app.db` (relative to the repo root). It is
created automatically on first run.

## Import existing YAML tenants

If you have tenants in `tenants/<slug>/config.yaml`, you can import them once:

```bash
cd apps/web
npm run import:yaml                # import everything
npm run import:yaml artifation     # import a single tenant
npm run import:yaml --overwrite    # replace existing sites
```

API keys are read from `process.env` (so your existing `.env` works). After
import you can edit them per-site under Settings → API keys.

## What you can do today

- **Create new sites** through a 5-step onboarding wizard — no YAML editing.
- **Edit everything** under Settings: brand voice, ban list, pillars, schedule,
  publish destination, author, API keys.
- **Manage topics**: add, edit, delete, prioritize, and manually trigger
  generation per topic.
- **Review drafts** with score breakdown, hard-fails, and side-by-side preview/HTML/SEO editing.
- **Publish to**:
  - **Built-in CMS** — posts are served at `/{site-slug}/{post-slug}` by this app.
  - **WordPress** — same REST API path as the legacy pipeline.
  - **Markdown export** — `.md` files in `data/exports/{site-slug}/`.

## GSC-powered topic suggestions (optional)

The **Suggest topics** button can use Google Search Console to surface real
opportunity queries from your own traffic — striking-distance queries
(position 8-20), content gaps (queries you rank for without a topic), and
rising queries (trending impressions).

**Each site stores its own service-account JSON in the DB**, so multi-site
deployments work out of the box without per-process env vars. Setup:

1. **Create a service account** in Google Cloud:
   - https://console.cloud.google.com/ → APIs & Services → Library → enable
     "Search Console API"
   - IAM & Admin → Service Accounts → Create service account
   - Open the service account → Keys → Add Key → Create new key → JSON
2. **Grant the service account access in GSC**:
   - https://search.google.com/search-console → pick your property
   - Settings → Users and permissions → Add user
   - Paste the service-account `client_email`, permission: **Restricted**
3. **Configure the site in Blog Studio**:
   - Login → Settings → Google Search Console
   - Tick "Search Console gebruiken"
   - Paste the property URL (exactly as it appears in GSC, e.g.
     `sc-domain:artifation.nl` or `https://artifation.nl/`)
   - Paste the full service-account JSON into the **Service account JSON**
     textarea. The UI parses it and confirms the `client_email` was found.
4. Click **Suggest topics** on the Topics page. Proposals get a badge
   indicating which signal triggered them (📈 striking distance, 🎯 content
   gap, ⬆ rising query).

Snapshots live at `data/gsc-snapshots/<site-slug>.json`. The first run only
emits striking-distance + content-gap signals; the second run onwards also
emits rising-query signals (because it now has a previous window to diff
against). Without GSC configured, **Suggest topics** falls back to a pure-LLM
manual seed.

**Legacy env-var fallback**: if you still set the global
`GSC_SERVICE_ACCOUNT_JSON` env var, sites that don't have a per-site JSON in
Settings will fall back to it. Useful for single-user local setups.

## What's next

See [`docs/superpowers/specs/2026-05-16-general-blog-tool-design.md`](../../docs/superpowers/specs/2026-05-16-general-blog-tool-design.md)
for the roadmap. Notable not-yet-built items:

- Auth & multi-user accounts.
- Cron scheduler for automatic runs (today the cron field is informational —
  manual triggers work).
- Topic suggester / repurposer UI (backend already exists in `src/agents/`).
- Tiptap rich-text editor for drafts (currently a raw-HTML textarea + preview).
