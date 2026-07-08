# VPS deployment guide

This walks through deploying Blog Studio on a single Linux VPS — for a solo
operator or a small team. Two supported paths:

- [**Option A — Docker Compose**](#option-a-docker-compose) (recommended)
- [**Option B — Bare metal + systemd**](#option-b-bare-metal--systemd)

Followed by [backup](#backups), [updates](#updates), [reverse proxy](#reverse-proxy--ssl),
[scheduling](#scheduling), and [logs](#logs).

---

## Prerequisites

| Need              | Version            | Notes                                                  |
| ----------------- | ------------------ | ------------------------------------------------------ |
| OS                | Ubuntu 22.04+ / Debian 12 / any modern Linux | x86_64 or arm64                  |
| RAM               | 1 GB minimum, 2 GB comfortable | Image generation (sharp) is the hottest path     |
| Disk              | 5 GB              | DB + generated images grow slowly                       |
| Public domain     | Required for SSL  | Point an A/AAAA record at the VPS first                |
| Node.js (Option B) | 22.x              | Use [`fnm`](https://github.com/Schniz/fnm) or NodeSource |
| Docker (Option A) | 24.x + Compose v2 | `apt install docker.io docker-compose-v2` on recent distros |

Open ports `80` and `443` in your firewall (`ufw allow 80,443/tcp`). Do **not**
expose `3000` publicly — the reverse proxy fronts it.

---

## Option A — Docker Compose

This is the simplest path. Everything (Next.js server + SQLite + image cache)
runs in one container, with a named volume holding the persistent state.

```bash
# 1. Clone the repo.
sudo mkdir -p /opt/blogtool && sudo chown "$USER" /opt/blogtool
git clone https://github.com/Artifation/blog-generator.git /opt/blogtool
cd /opt/blogtool

# 2. Configure environment.
cp .env.example .env
$EDITOR .env                  # fill in API keys + generate CRON_TOKEN

# 3. Build and start.
docker compose up -d --build

# 4. Check it's alive.
curl -s http://127.0.0.1:3000/api/health
# -> {"ok":true,"status":"healthy",...}

docker compose logs -f blogtool
```

The named volume `blogtool_data` holds:

```
/app/data/
├── app.db                     # SQLite — primary state
├── backups/                   # rotated SQLite snapshots (see Backups)
├── exports/                   # Markdown-exported posts
├── gsc-snapshots/             # GSC weekly diffs per site
├── images/                    # cached generated images
└── runs/                      # per-run JSON artifacts
```

Inspect it from the host:

```bash
docker volume inspect blogtool_data | jq '.[0].Mountpoint'
# -> /var/lib/docker/volumes/blogtool_data/_data
```

### Adding the reverse proxy

The compose file ships with **Caddy** and **Traefik** stanzas commented out.
For Caddy:

1. Set `BLOGTOOL_DOMAIN=blog.example.com` (and `ACME_EMAIL=...`) in `.env`.
2. Uncomment the `caddy:` service and the `caddy_data` / `caddy_config` volumes
   in `docker-compose.yml`.
3. `docker compose up -d`.

The matching Caddyfile lives at `docs/deployment/caddy/Caddyfile`. Caddy will
auto-provision a Let's Encrypt cert on first request — give DNS 1-2 minutes
to propagate.

---

## Option B — Bare metal + systemd

Pick this if you prefer no Docker layer, or if you're sharing the VPS with
other Node apps and want a single Node runtime.

```bash
# 1. Install Node 22 (NodeSource).
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3 sqlite3

# 2. Create a dedicated system user + clone into /opt/blogtool.
sudo useradd --system --create-home --home-dir /opt/blogtool --shell /bin/bash blogtool
sudo -u blogtool git clone https://github.com/Artifation/blog-generator.git /opt/blogtool

# 3. Install + build (as the blogtool user).
sudo -u blogtool bash -c 'cd /opt/blogtool && npm ci'
sudo -u blogtool bash -c 'cd /opt/blogtool/apps/web && npm ci && npm run build'

# 4. Place the env file root-owned, group-readable by blogtool, mode 0640.
sudo mkdir -p /etc/blogtool
sudo cp /opt/blogtool/.env.example /etc/blogtool/blogtool.env
sudo $EDITOR /etc/blogtool/blogtool.env
sudo chown root:blogtool /etc/blogtool/blogtool.env
sudo chmod 640 /etc/blogtool/blogtool.env

# 5. Install the systemd unit + enable.
sudo cp /opt/blogtool/docs/deployment/systemd/blogtool.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blogtool

# 6. Verify.
systemctl status blogtool
curl -s http://127.0.0.1:3000/api/health
```

By default the unit binds to `127.0.0.1:3000` (via `HOSTNAME=127.0.0.1` in the
unit file). Front it with Caddy / nginx — see [Reverse proxy](#reverse-proxy--ssl).

---

## Backups

The SQLite file (`data/app.db`) holds every site config, draft, published post,
score history, and refresh log. **Back it up.**

The repo ships [`scripts/backup.sh`](../../scripts/backup.sh), which uses
SQLite's online-backup API (safe to run while the app is writing), **verifies**
every snapshot (`PRAGMA integrity_check` + `gunzip -t`) before trusting it, and
prunes backups older than 14 days. A failed verification exits non-zero and does
**not** prune — so a corrupt snapshot can never rotate away the last good copies.

> **Schedule it — this is not optional.** Out of the box nothing runs the
> script; pick one of the options below. The **systemd timer is recommended**
> (see [`systemd/README.md`](systemd/README.md#backups)) because a failed backup
> surfaces via `OnFailure` / `journalctl` instead of failing silently.

### Cron — bare metal

```bash
# Root crontab:
sudo crontab -e
# Add:
0 3 * * * /opt/blogtool/scripts/backup.sh >> /var/log/blogtool-backup.log 2>&1
```

### Cron — Docker

Either run the script on the host against the volume mount:

```bash
# Find the volume path.
VOL=$(docker volume inspect blogtool_data --format '{{ .Mountpoint }}')

# Daily backup.
0 3 * * * DB_FILE="$VOL/app.db" BACKUP_DIR="$VOL/backups" /opt/blogtool/scripts/backup.sh
```

…or exec inside the container:

```bash
0 3 * * * docker compose -f /opt/blogtool/docker-compose.yml exec -T blogtool sh -lc '/app/scripts/backup.sh'
```

(The second form requires mounting `scripts/` into the container — add a
`./scripts:/app/scripts:ro` volume in `docker-compose.yml` if you want this.)

### Off-site copy

**A local backup on the same VPS is not a backup** — if the host dies you lose
everything. Ship `data/backups/` to S3 / Backblaze B2 / a second VPS.

The script has this built in: set `RCLONE_REMOTE` and (if `rclone` is installed)
each run mirrors the verified backup dir off-site — no separate cron entry:

```bash
# In /etc/blogtool/backup.env (or the cron/systemd environment):
RCLONE_REMOTE=b2:blogtool-backups
```

Or run it as a separate cron line if you prefer to decouple it:

```bash
30 3 * * * rclone copy /var/lib/docker/volumes/blogtool_data/_data/backups remote:blogtool-backups
```

### Restore

```bash
sudo systemctl stop blogtool       # or: docker compose stop blogtool
gunzip -c data/backups/app-20260520-030000.db.gz > data/app.db
sudo systemctl start blogtool
```

---

## Updates

### Docker

```bash
cd /opt/blogtool
git pull
docker compose build --pull       # rebuild image with new code
docker compose up -d               # rolling-restart the container
docker image prune -f              # garbage-collect old layers
```

Zero-downtime is not provided — the container restarts in ~5s. For a single-
user/small-team tool that's fine. If you need it, front two containers with
the proxy.

### Bare metal

```bash
sudo -u blogtool bash -c 'cd /opt/blogtool && git pull && npm ci && cd apps/web && npm ci && npm run build'
sudo systemctl restart blogtool
```

Schema migrations are auto-applied on boot — `ensureSchema()` in
`apps/web/lib/db/client.ts` runs idempotent `CREATE TABLE IF NOT EXISTS` +
`ALTER TABLE ADD COLUMN` statements. Take a backup first anyway.

---

## Reverse proxy + SSL

### Caddy (recommended — auto-SSL)

Bare metal install:

```bash
sudo apt install -y caddy
sudo cp /opt/blogtool/docs/deployment/caddy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/{$BLOGTOOL_DOMAIN}/blog.example.com/g' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy provisions a Let's Encrypt cert on first request. Renewal is automatic.

### nginx (manual SSL)

```nginx
server {
    listen 443 ssl http2;
    server_name blog.example.com;

    ssl_certificate     /etc/letsencrypt/live/blog.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 310s;          # cron route allows up to 300s
    }

    # Block cron endpoint from the public web.
    location /api/cron/ {
        allow 127.0.0.1;
        allow ::1;
        deny  all;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Pair with `certbot --nginx` for cert provisioning.

---

## Scheduling

The pipeline is triggered via `GET /api/cron/[siteSlug]?token=<CRON_TOKEN>`.
Pick the highest-priority queued topic, run the agents, publish if approved.

### Host cron — single site

```cron
# Every 4 hours, run the cron for site `artifation`.
0 */4 * * * curl -fsS "http://127.0.0.1:3000/api/cron/artifation?token=$(grep ^CRON_TOKEN /etc/blogtool/blogtool.env | cut -d= -f2-)" >> /var/log/blogtool-cron.log 2>&1
```

### Host cron — multiple sites

```cron
0 6 * * 1,3,5 curl -fsS "http://127.0.0.1:3000/api/cron/artifation?token=XXX"
0 7 * * 2,4   curl -fsS "http://127.0.0.1:3000/api/cron/example?token=XXX"
```

Once the in-app scheduler ships (`apps/web/lib/scheduler/`), the host crontab
goes away. See `docs/deployment/scheduling.md` (added by the scheduler module).

---

## Logs

### Docker

```bash
docker compose logs -f blogtool                  # tail live
docker compose logs --since 1h blogtool          # last hour
docker compose logs --tail 500 blogtool | less   # paginate
```

### Systemd

```bash
journalctl -u blogtool -f                        # tail live
journalctl -u blogtool --since "1 hour ago"      # last hour
journalctl -u blogtool -p err                    # errors only
```

Per-run JSON artifacts (LLM calls, scores, costs) land in `data/runs/<run-id>/`
regardless of deploy mode.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `503 Cron endpoint is uitgeschakeld` | `CRON_TOKEN` not set | Add to `.env` and restart |
| Container restarts in a loop, healthcheck fails | App can't write to `/app/data` | `docker compose down -v` only if you accept data loss; otherwise `docker compose exec blogtool ls -la /app/data` and fix perms |
| `Error: better-sqlite3 / sharp native module missing` | Native build failed in builder stage | Rebuild with `docker compose build --no-cache`; check that `python3 make g++` are installed (they are in our Dockerfile) |
| Build OOM on a 1 GB VPS | Next.js build is memory-hungry | Build locally and `docker save | scp | docker load`, or temporarily add swap (`fallocate -l 2G /swap && mkswap /swap && swapon /swap`) |
| `EADDRINUSE :3000` | Another process owns 3000 | `BLOGTOOL_PORT=3100` in `.env`, then `docker compose up -d` |
