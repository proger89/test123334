#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  : "${APP_URL:?Set APP_URL to the public URL on the first start}"
  umask 077
  {
    printf 'APP_NAME=VSM\nAPP_ENV=production\nAPP_URL=%s\n' "$APP_URL"
    printf 'APP_KEY=base64:%s\n' "$(openssl rand -base64 32)"
    printf 'DB_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'SESSION_SECURE_COOKIE=false\n'
  } > .env
fi
if ! grep -q '^EDITOR_ACCESS_CODE=' .env; then
  umask 077
  printf '\nEDITOR_ACCESS_CODE=%s\n' "$(openssl rand -hex 24)" >> .env
fi
compose=(docker compose -p vsm-hackathon-demo -f compose.yaml -f compose.server.yaml)
if [[ -f runtime/tls.enabled ]]; then
  compose+=(-f compose.tls.yaml)
fi
case "${1:-start}" in
  start)
    "${compose[@]}" build api
    "${compose[@]}" build web
    "${compose[@]}" up -d --wait --wait-timeout 180 web worker
    ;;
  stop) "${compose[@]}" stop ;;
  status) "${compose[@]}" ps ;;
  *) printf 'Usage: bash scripts/server.sh [start|stop|status]\n' >&2; exit 2 ;;
esac
