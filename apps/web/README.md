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

## What's next

See [`docs/superpowers/specs/2026-05-16-general-blog-tool-design.md`](../../docs/superpowers/specs/2026-05-16-general-blog-tool-design.md)
for the roadmap. Notable not-yet-built items:

- Auth & multi-user accounts.
- Cron scheduler for automatic runs (today the cron field is informational —
  manual triggers work).
- Topic suggester / repurposer UI (backend already exists in `src/agents/`).
- Tiptap rich-text editor for drafts (currently a raw-HTML textarea + preview).
