#!/bin/sh
set -eu
: "${RESTIC_REPOSITORY:?Configure an off-site restic repository}"
: "${RESTIC_PASSWORD:?Configure a strong encryption password}"
tmpdir=$(mktemp -d)
trap 'rm -rf -- "$tmpdir"' EXIT
failed() { if [ -n "${BACKUP_HEALTHCHECK_URL:-}" ]; then curl -fsS --max-time 15 "$BACKUP_HEALTHCHECK_URL/fail" >/dev/null || true; fi; }
trap 'failed' HUP INT TERM
if ! pg_dump --format=custom --no-owner --no-acl --file="$tmpdir/clubhouse.dump"; then failed; exit 1; fi
if ! restic backup --stdin --stdin-filename clubhouse.dump --tag clubhouse --host clubhouse < "$tmpdir/clubhouse.dump"; then failed; exit 1; fi
if ! restic forget --tag clubhouse --host clubhouse --keep-within 30d --prune; then failed; exit 1; fi
psql -v ON_ERROR_STOP=1 -c 'INSERT INTO "WorkerHeartbeat" (id,"updatedAt",detail) VALUES ('"'"'backup'"'"',NOW(),'"'"'Encrypted off-site backup completed'"'"') ON CONFLICT(id) DO UPDATE SET "updatedAt"=NOW(),detail=EXCLUDED.detail;'
if [ -n "${BACKUP_HEALTHCHECK_URL:-}" ]; then curl -fsS --max-time 15 "$BACKUP_HEALTHCHECK_URL" >/dev/null; fi
