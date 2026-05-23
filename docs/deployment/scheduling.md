# Scheduling

De blogtool heeft drie manieren om de pipeline op tijd te draaien.
Kies één — meerdere tegelijk leidt tot dubbele runs.

## Optie A: in-process scheduler (default)

De webapp start bij boot een in-process scheduler die elke site uit de DB
met een `scheduleCron` field automatisch plant via `node-cron`. Bij
trigger pakt-ie het hoogste-prioriteit `queued` topic en draait de
pipeline (`runForSite`) — exact hetzelfde code-pad als de "Run next"
knop in de UI.

**Eigenschappen:**

- Geen externe services nodig.
- Pollt de DB elke 60s (instelbaar via `SCHEDULER_POLL_INTERVAL_MS`) om
  nieuwe/gewijzigde sites op te pikken. Site-CRUD vereist dus geen
  expliciete scheduler-refresh.
- Mutex per site: een trage run die over de volgende cron-tick heen
  loopt skipt de tweede tick met een log (geen wachtrij).
- Auto-publish wordt gehonoreerd als `site.autoPublish=true`.
- Ongeldige cron-expressies worden geskipt met een warning — de andere
  sites blijven gewoon werken.

**Aan/uit:**

| Situatie | Resultaat |
|---|---|
| `NODE_ENV=production` | Aan (default) |
| `NODE_ENV=development` | Uit (default) |
| `ENABLE_SCHEDULER_IN_DEV=true` | Aan in dev |
| `DISABLE_INPROCESS_SCHEDULER=true` | Altijd uit (override) |

Zet 'm bewust uit als je optie B of C gebruikt — anders draait elke run
twee keer.

## Optie B: systemd timer (Linux/VPS)

Gebruik dit als je `DISABLE_INPROCESS_SCHEDULER=true` zet en liever
systemd het tempo laat bepalen (bv. omdat je meerdere webapp-instances
draait of omdat je systemd-logs centraal verzamelt).

Zie [`systemd/readme.md`](./systemd/readme.md) voor installatie. Korte
samenvatting:

```bash
sudo cp systemd/blogtool-cron.service /etc/systemd/system/blogtool-cron@.service
sudo cp systemd/blogtool-cron.timer   /etc/systemd/system/blogtool-cron@.timer
sudo systemctl daemon-reload
sudo systemctl enable --now blogtool-cron@<siteSlug>.timer
```

Schrijf `/etc/blogtool/cron.env` met `BLOGTOOL_BASE_URL` + `CRON_TOKEN`
(dezelfde token als in de webapp z'n env). Default-tempo is elke 15
minuten, aanpasbaar via `OnCalendar=` in de timer-file.

## Optie C: externe scheduler

Het `/api/cron/[siteSlug]?token=<CRON_TOKEN>` endpoint werkt met elke
externe scheduler die GET-requests kan sturen:

- **Vercel Cron** — voeg toe aan `vercel.json`:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/artifation?token=<CRON_TOKEN>",
        "schedule": "0 9 * * 1"
      }
    ]
  }
  ```
  Let op: Vercel cron is alleen beschikbaar op betaalde plannen, en de
  token zit dan in een publieke config — overweeg of dat acceptabel is
  voor je threat-model.

- **GitHub Actions** — `.github/workflows/cron.yml`:
  ```yaml
  on:
    schedule:
      - cron: "0 9 * * 1"
  jobs:
    trigger:
      runs-on: ubuntu-latest
      steps:
        - run: curl --fail "${{ secrets.BLOGTOOL_BASE_URL }}/api/cron/artifation?token=${{ secrets.CRON_TOKEN }}"
  ```

- **EasyCron / Cronitor / cron-job.org** — vergelijkbaar, één HTTP GET
  per ingeplande tijd.

Bij alle drie geldt: zet `DISABLE_INPROCESS_SCHEDULER=true` om dubbele
runs te voorkomen.

## `schedule_cron` per site configureren

Het cron-veld zit op de `sites`-tabel in de SQLite-DB. Drie manieren om
'm te zetten:

1. **Via de onboarding-wizard** (UI) — `scheduleCron` is een veld in het
   site-create formulier.
2. **Via de site-instellingen** in de webapp — `/settings/site` heeft 'm
   ook.
3. **Direct in de DB** voor scripting / migraties:
   ```sql
   UPDATE sites SET schedule_cron = '0 9 * * 1' WHERE slug = 'artifation';
   ```

Het format is standaard cron met 5 velden:
`minuut uur dag-van-maand maand dag-van-week`.

Voorbeelden:

| Cron | Betekenis |
|---|---|
| `0 9 * * 1` | Elke maandag om 09:00 |
| `0 6 * * 1,3,5` | Ma/wo/vr om 06:00 (default) |
| `*/30 * * * *` | Elke 30 minuten |
| `0 9-17 * * 1-5` | Elk uur tussen 9 en 17 op werkdagen |

Bij twijfel: <https://crontab.guru/>.

## Relevante env vars

| Variabele | Wanneer | Default |
|---|---|---|
| `DISABLE_INPROCESS_SCHEDULER` | Optie B of C | unset |
| `ENABLE_SCHEDULER_IN_DEV` | Optie A in dev | unset |
| `SCHEDULER_POLL_INTERVAL_MS` | Hertimings (min 15000) | 60000 |
| `SCHEDULER_TIMEZONE` | TZ voor cron-expressies (IANA, bv. `Europe/Amsterdam`) | systeem-TZ |
| `CRON_TOKEN` | Optie B en C | unset (endpoint geeft dan 503) |

## Troubleshooting

- **"Scheduler skipped" log bij boot** — check of je `NODE_ENV=production`
  draait of `ENABLE_SCHEDULER_IN_DEV=true` zet.
- **Cron werkt maar runs starten niet** — kijk naar de queued-topics:
  zonder queued topics is er gewoon niks te doen. Logs zeggen
  `scheduler-skip-empty`.
- **Run faalt met "weekcap bereikt"** — bedoeld gedrag: per site is er
  een `maxPostsPerWeek` limiet. Het topic gaat naar `cap_deferred` en
  wordt volgende week opnieuw geprobeerd.
- **Twee runs tegelijk** — twee schedulers actief (bv. in-process +
  systemd-timer). Kies één.
