#!/bin/sh
set -eu
# 20:30 UTC is 02:00 IST. Child processes inherit credentials directly;
# no shell interpolation or extra on-disk secret file is needed.
while true; do
  now=$(date -u +%s)
  next=$(date -u -d 'today 20:30' +%s)
  if [ "$next" -le "$now" ]; then next=$(date -u -d 'tomorrow 20:30' +%s); fi
  sleep "$((next - now))" &
  wait "$!"
  /usr/local/bin/backup.sh || echo 'Backup failed; inspect logs and monitoring alerts.' >&2
done
