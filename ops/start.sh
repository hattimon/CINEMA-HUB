#!/bin/sh
set -eu
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix
xpid= filman_xpid= vpid= wpid= npid= starting_display_pid=
cleanup() {
  trap - EXIT HUP INT TERM
  if [ -n "$npid" ]; then
    kill "$npid" 2>/dev/null || true
    wait "$npid" 2>/dev/null || true
  fi
  for pid in "$xpid" "$filman_xpid" "$vpid" "$wpid" "$starting_display_pid"; do
    if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

start_display() {
  display_number=$1
  lock="/tmp/.X$display_number-lock"
  socket="/tmp/.X11-unix/X$display_number"
  if [ -f "$lock" ]; then
    previous_pid=$(tr -d '[:space:]' <"$lock")
    if [ -n "$previous_pid" ] && [ -r "/proc/$previous_pid/comm" ] && [ "$(cat "/proc/$previous_pid/comm")" = Xvfb ]; then
      echo "Virtual display :$display_number is already running"; exit 1
    fi
    rm -f -- "$lock" "$socket"
  fi
  Xvfb ":$display_number" -screen 0 "$2" -nolisten tcp &
  starting_display_pid=$!
  count=0
  while [ ! -S "$socket" ]; do
    count=$((count+1))
    if [ "$count" -gt 40 ]; then echo "Virtual display :$display_number failed"; exit 1; fi
    sleep 0.1
  done
}

start_display 99 1600x1200x24
xpid=$starting_display_pid
# Background Filman requests use the same Chromium mode as the login window on a display without noVNC.
start_display 98 1600x1200x24
filman_xpid=$starting_display_pid
starting_display_pid=
export FILMAN_BROWSER_DISPLAY=:98
x11vnc -display :99 -localhost -forever -shared -nopw -quiet -rfbport 5900 -nolookup > /tmp/cinema-vnc.log 2>&1 &
vpid=$!
websockify --web=/usr/share/novnc --heartbeat=30 127.0.0.1:6080 127.0.0.1:5900 > /tmp/cinema-websockify.log 2>&1 &
wpid=$!
node server/index.mjs &
npid=$!
wait "$npid"
