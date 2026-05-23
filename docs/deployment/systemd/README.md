# Systemd deployment

Use this when you don't want Docker — straight Node on the host, managed by
systemd. The full walkthrough lives in
[`docs/deployment/vps.md`](../vps.md#option-b-bare-metal--systemd) (Option B);
this README is the cheat sheet.

## Install

```bash
# 1. Create a dedicated system user.
sudo useradd --system --create-home --home-dir /opt/blogtool --shell /bin/bash blogtool

# 2. Clone + install + build as that user.
sudo -u blogtool git clone https://github.com/Artifation/blog-generator.git /opt/blogtool
sudo -u blogtool bash -c 'cd /opt/blogtool && npm ci'
sudo -u blogtool bash -c 'cd /opt/blogtool/apps/web && npm ci && npm run build'

# 3. Put the env file somewhere root-owned and 0600.
sudo mkdir -p /etc/blogtool
sudo cp /opt/blogtool/.env.example /etc/blogtool/blogtool.env
sudo $EDITOR /etc/blogtool/blogtool.env
sudo chmod 600 /etc/blogtool/blogtool.env
sudo chown root:blogtool /etc/blogtool/blogtool.env

# 4. Drop the unit file in place and enable it.
sudo cp /opt/blogtool/docs/deployment/systemd/blogtool.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blogtool

# 5. Check status / tail logs.
systemctl status blogtool
journalctl -u blogtool -f
```

## Update

```bash
sudo -u blogtool bash -c 'cd /opt/blogtool && git pull && npm ci && cd apps/web && npm ci && npm run build'
sudo systemctl restart blogtool
```

## Cron / scheduling

The Next.js process exposes `/api/cron/[siteSlug]?token=...`. Three options:

1. **Host crontab** — simplest, see `docs/deployment/vps.md` ("Scheduling").
2. **Systemd timer** — drop `blogtool-cron.service` + `blogtool-cron.timer`
   (already in this directory) into `/etc/systemd/system/`, create
   `/etc/blogtool/cron.env` with `BLOGTOOL_BASE_URL` and `CRON_TOKEN`, then
   `sudo systemctl enable --now blogtool-cron@<site-slug>.timer` per site.
3. **In-process scheduler** — once `apps/web/lib/scheduler/` lands, the app
   ticks itself based on each site's `scheduleCron`.

## Files in this directory

- `blogtool.service`        — main app server unit (Next.js + agents)
- `blogtool-cron.service`   — templated curl-trigger for `/api/cron/<slug>`
- `blogtool-cron.timer`     — periodic firing of the above (per-site instance)
- `README.md`               — this file
