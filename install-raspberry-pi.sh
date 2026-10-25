#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then
    umask 077
    cinema_password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
    printf '%s\n' 'APP_PORT=9999' 'LAN_BIND=0.0.0.0' 'APP_IMAGE=ghcr.io/hattimon/cinema-hub:1.3.15' "INITIAL_ADMIN_PASSWORD=$cinema_password" 'COOKIE_SECURE=false' 'PUBLIC_ORIGIN=' >.env
fi
case "${1:-}" in
    '') docker compose -f compose.pi.yaml up -d ;;
    --build) docker compose -f compose.pi.yaml up -d --build ;;
    *) echo 'Usage: sh install-raspberry-pi.sh [--build]' >&2; exit 1 ;;
esac
echo 'Cinema Hub is available on this host, port from .env (default 9999). Initial admin password is in .env.'
docker compose -f compose.pi.yaml ps cinema
