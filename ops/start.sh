#!/bin/sh
set -eu
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix
if [ -f /tmp/.X99-lock ]; then
  display_pid=$(tr -d '[:space:]' </tmp/.X99-lock)
  if [ -n "$display_pid" ] && [ -r "/proc/$display_pid/comm" ] && [ "$(cat "/proc/$display_pid/comm")" = Xvfb ]; then
    echo "Virtual display is already running"; exit 1
  fi
  rm -f -- /tmp/.X99-lock /tmp/.X11-unix/X99
fi
Xvfb :99 -screen 0 1600x1200x24 -nolisten tcp &
xpid=$!
count=0
while [ ! -S /tmp/.X11-unix/X99 ]; do
  count=$((count+1))
  if [ "$count" -gt 40 ]; then echo "Virtual display failed"; exit 1; fi
  sleep 0.1
done
x11vnc -display :99 -localhost -forever -shared -nopw -quiet -rfbport 5900 -nolookup > /tmp/cinema-vnc.log 2>&1 &
vpid=$!
websockify --web=/usr/share/novnc --heartbeat=30 127.0.0.1:6080 127.0.0.1:5900 > /tmp/cinema-websockify.log 2>&1 &
wpid=$!
node server/index.mjs &
npid=$!
cleanup() {
  trap - EXIT HUP INT TERM
  kill "$npid" 2>/dev/null || true
  wait "$npid" 2>/dev/null || true
  kill "$xpid" "$vpid" "$wpid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
wait "$npid"
