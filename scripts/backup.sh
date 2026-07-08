#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Blog Studio — SQLite backup
#
# Snapshots data/app.db to data/backups/app-YYYYMMDD-HHMMSS.db.gz using the
# SQLite Online Backup API (`sqlite3 .backup`), which is safe to run while the
# app is writing. Falls back to `cp` if sqlite3 isn't installed.
#
# The snapshot is VERIFIED before it is trusted:
#   1. `PRAGMA integrity_check` on the fresh snapshot (must report "ok"),
#   2. `gunzip -t` on the gzip after compression.
# If either fails the script exits non-zero and does NOT prune older backups —
# so a corrupt snapshot can never rotate away the last good copies. A failing
# exit is loud on purpose: wire it to email/journald alerting (systemd
# OnFailure or `|| mail`) so a broken backup chain gets noticed.
#
# Optional off-site copy: set RCLONE_REMOTE (e.g. "b2:blogtool-backups") and,
# if rclone is installed, the verified backup dir is mirrored there.
#
# Schedule from host cron, daily at 03:00:
#   0 3 * * * /opt/blogtool/scripts/backup.sh >> /var/log/blogtool-backup.log 2>&1
# ...or via the shipped systemd timer:
#   docs/deployment/systemd/blogtool-backup.{service,timer}
#
# Inside Docker (run on the host against the volume mount):
#   VOL=$(docker volume inspect blogtool_data --format '{{ .Mountpoint }}')
#   DB_FILE="$VOL/app.db" BACKUP_DIR="$VOL/backups" /opt/blogtool/scripts/backup.sh
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DB_FILE="${DB_FILE:-${REPO_ROOT}/data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/data/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

mkdir -p "${BACKUP_DIR}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "[backup] DB file not found at ${DB_FILE} — nothing to back up." >&2
  exit 0
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_DIR}/app-${STAMP}.db"

# Remove a half-written snapshot on any error so it can't be mistaken for good.
cleanup_partial() { rm -f "${TARGET}" "${TARGET}.gz" 2>/dev/null || true; }

HAVE_SQLITE=0
if command -v sqlite3 >/dev/null 2>&1; then
  HAVE_SQLITE=1
  # Safe online backup — works while the app is writing.
  sqlite3 "${DB_FILE}" ".backup '${TARGET}'"
else
  echo "[backup] sqlite3 not found, falling back to cp (best run while idle)." >&2
  cp "${DB_FILE}" "${TARGET}"
fi

# --- Integrity check on the snapshot (only possible with sqlite3) -----------
if [[ "${HAVE_SQLITE}" -eq 1 ]]; then
  INTEGRITY="$(sqlite3 "${TARGET}" 'PRAGMA integrity_check;' 2>&1 || echo 'CHECK_FAILED')"
  if [[ "${INTEGRITY}" != "ok" ]]; then
    echo "[backup] FATAL: integrity_check on snapshot failed: ${INTEGRITY}" >&2
    cleanup_partial
    exit 1
  fi
  echo "[backup] integrity_check: ok"
else
  echo "[backup] WARNING: sqlite3 absent — snapshot NOT integrity-checked." >&2
fi

gzip -f "${TARGET}"

# --- Verify the gzip is intact and decompressible ---------------------------
if ! gunzip -t "${TARGET}.gz" 2>/dev/null; then
  echo "[backup] FATAL: gzip verification (gunzip -t) failed for ${TARGET}.gz" >&2
  cleanup_partial
  exit 1
fi
echo "[backup] wrote ${TARGET}.gz ($(du -h "${TARGET}.gz" | cut -f1)) — verified"

# --- Prune old backups (ONLY after a verified new one exists) ---------------
find "${BACKUP_DIR}" -maxdepth 1 -name 'app-*.db.gz' -type f -mtime "+${KEEP_DAYS}" -print -delete

# --- Optional off-site mirror -----------------------------------------------
if [[ -n "${RCLONE_REMOTE}" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "[backup] syncing to off-site remote ${RCLONE_REMOTE} ..."
    rclone copy "${BACKUP_DIR}" "${RCLONE_REMOTE}" --max-age "$((KEEP_DAYS + 1))d"
    echo "[backup] off-site sync done."
  else
    echo "[backup] WARNING: RCLONE_REMOTE set but rclone not installed — skipped off-site copy." >&2
  fi
fi

echo "[backup] done. retention: ${KEEP_DAYS} days."
