#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $EUID -ne 0 ]]; then
  printf 'Run this server maintenance command as root.\n' >&2
  exit 1
fi
exec 9>/run/lock/vsm-certificates.lock
flock -n 9 || { printf 'Certificate maintenance is already running.\n' >&2; exit 1; }
mkdir -p runtime/acme runtime/letsencrypt
chmod 700 runtime/letsencrypt
# Certbot 5.8.0 supports HTTP-01 validation of IP addresses.
certbot=(docker run --rm --memory=192m
  -v "$PWD/runtime/letsencrypt:/etc/letsencrypt"
  -v "$PWD/runtime/acme:/var/www/acme"
  certbot/certbot@sha256:f70ad0adbb7e117f0fe42a63c553f28ea451edabc0148757b6efcd9735acaa20)
compose=(docker compose -p vsm-hackathon-demo -f compose.yaml -f compose.server.yaml -f compose.tls.yaml)
case "${1:-renew}" in
  issue)
    "${certbot[@]}" certonly --non-interactive --agree-tos --register-unsafely-without-email \
      --cert-name vsm-ip --preferred-profile shortlived --webroot -w /var/www/acme \
      --ip-address 185.173.147.205
    exit 0
    ;;
  renew) "${certbot[@]}" renew --cert-name vsm-ip --non-interactive ;;
  test) "${certbot[@]}" renew --cert-name vsm-ip --non-interactive --dry-run ;;
  *) printf 'Usage: bash scripts/certificates.sh [issue|renew|test]\n' >&2; exit 2 ;;
esac
# Test first: a bad certificate/configuration must not stop existing workers.
# Reload even when nothing was renewed, so a previous reload failure is retried.
"${compose[@]}" exec -T web nginx -t
"${compose[@]}" exec -T web nginx -s reload
