#!/bin/sh
set -eu
: "${RESTORE_DATABASE:?Choose a NEW database name for the restore drill}"
case "$RESTORE_DATABASE" in clubhouse|postgres|template0|template1|*[!a-zA-Z0-9_]*) echo 'Unsafe restore target' >&2; exit 1;; esac
tmpdir=$(mktemp -d)
trap 'rm -rf -- "$tmpdir"' EXIT
restic restore latest --tag clubhouse --host clubhouse --target "$tmpdir"
dump=$(find "$tmpdir" -name clubhouse.dump -type f -print -quit)
test -n "$dump"
createdb --template=template0 --encoding=UTF8 --lc-collate=C --lc-ctype=C "$RESTORE_DATABASE"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE" "$dump"
PGDATABASE="$RESTORE_DATABASE" psql -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS businesses FROM "Business"; SELECT COUNT(*) AS members FROM "Member"; SELECT COUNT(*) AS payments FROM "Payment";'
echo "Restore completed into $RESTORE_DATABASE. Inspect records before switching any application connection."
