#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Blog Studio — SQLite backup
#
# Snapshots data/app.db to data/backups/app-YYYYMMDD-HHMMSS.db.gz using the
# SQLite Online Backup API (`sqlite3 .backup`), which is safe to run while the
# app is writing. Falls back to `cp` if sqlite3 isn't installed.
#
# Schedule from host cron, daily at 03:00:
#   0 3 * * * /opt/blogtool/scripts/backup.sh >> /var/log/blogtool-backup.log 2>&1
#
# Inside Docker:
#   docker compose exec blogtool /app/scripts/backup.sh
# (mount the script into the container or run it on the host against the
#  volume mount directly).
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DB_FILE="${DB_FILE:-${REPO_ROOT}/data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/data/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "${BACKUP_DIR}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "[backup] DB file not found at ${DB_FILE} — nothing to back up." >&2
  exit 0
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_DIR}/app-${STAMP}.db"

if command -v sqlite3 >/dev/null 2>&1; then
  # Safe online backup — works while the app is writing.
  sqlite3 "${DB_FILE}" ".backup '${TARGET}'"
else
  echo "[backup] sqlite3 not found, falling back to cp (best run while idle)." >&2
  cp "${DB_FILE}" "${TARGET}"
fi

gzip -f "${TARGET}"
echo "[backup] wrote ${TARGET}.gz ($(du -h "${TARGET}.gz" | cut -f1))"

# Prune older backups.
find "${BACKUP_DIR}" -maxdepth 1 -name 'app-*.db.gz' -type f -mtime "+${KEEP_DAYS}" -print -delete

echo "[backup] done. retention: ${KEEP_DAYS} days."
