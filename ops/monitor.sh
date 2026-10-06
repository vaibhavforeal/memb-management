#!/bin/sh
set -u
: "${MONITOR_HEALTHCHECK_URL:?Configure the external health monitor URL}"
while true; do
  if curl -fsS --max-time 10 http://web:3000/api/health >/dev/null; then
    curl -fsS --max-time 10 "$MONITOR_HEALTHCHECK_URL" >/dev/null || true
  else
    curl -fsS --max-time 10 "$MONITOR_HEALTHCHECK_URL/fail" >/dev/null || true
  fi
  sleep 60 &
  wait "$!"
done
