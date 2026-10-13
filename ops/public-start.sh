#!/bin/sh
set -eu
cinema_data="${DATA_DIR:-/data}"
mkdir -p "$cinema_data/clients"
if [ ! -f "$cinema_data/clients/cinema-hub.apk" ]; then
    cp /app/client.apk "$cinema_data/clients/cinema-hub.apk.tmp"
    mv "$cinema_data/clients/cinema-hub.apk.tmp" "$cinema_data/clients/cinema-hub.apk"
fi
exec sh /app/ops/start.sh
