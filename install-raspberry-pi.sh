#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then
    umask 077
    cinema_password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
    printf '%s\n' 'APP_PORT=9999' 'LAN_BIND=0.0.0.0' 'APP_IMAGE=ghcr.io/hattimon/cinema-hub:1.3.24' "INITIAL_ADMIN_PASSWORD=$cinema_password" 'COOKIE_SECURE=false' 'PUBLIC_ORIGIN=' >.env
fi
case "${1:-}" in
    '')
        # Pull before touching the running service. A failed pull leaves it intact.
        APP_IMAGE=ghcr.io/hattimon/cinema-hub:1.3.24
        export APP_IMAGE
        docker compose -f compose.pi.yaml pull cinema
        ;;
    --build)
        # Local experiments must not shadow the published GHCR image tag.
        APP_IMAGE=cinema-hub:local-1.3.24
        export APP_IMAGE
        docker compose -f compose.pi.yaml build cinema
        ;;
    *) echo 'Usage: sh install-raspberry-pi.sh [--build]' >&2; exit 1 ;;
esac

# Preserve the old image for rollback before replacing the container.
old_container=$(docker compose -f compose.pi.yaml ps -q cinema)
if [ -n "$old_container" ]; then
    old_image=$(docker inspect --format '{{.Image}}' "$old_container")
    rollback_tag="cinema-hub:rollback-$(date -u +%Y%m%dT%H%M%SZ)"
    docker image tag "$old_image" "$rollback_tag"
    printf 'Previous image retained as %s for rollback.\n' "$rollback_tag"
fi

docker compose -f compose.pi.yaml up -d --no-build --no-deps --pull never --wait cinema
if [ "${1:-}" = '' ]; then
    # Persist the selected release only after a successful start, preserving
    # every other .env value and retaining the original for rollback.
    umask 077
    backup=".env.backup-$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p .env "$backup"
    temporary=".env.new-$$"
    trap 'rm -f "$temporary"' EXIT HUP INT TERM
    awk -v image="$APP_IMAGE" '
        /^APP_IMAGE=/ { if (!seen++) print "APP_IMAGE=" image; next }
        { print }
        END { if (!seen) print "APP_IMAGE=" image }
    ' .env > "$temporary"
    chmod 600 "$temporary"
    mv "$temporary" .env
    trap - EXIT HUP INT TERM
    printf 'Published image recorded in .env; prior configuration: %s\n' "$backup"
fi
echo 'Cinema Hub is available on this host, port from .env (default 9999). Initial admin password is in .env.'
docker compose -f compose.pi.yaml ps cinema
