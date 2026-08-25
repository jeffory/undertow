#!/usr/bin/env bash
# Run Blender "semi-headless" (full GUI process on a virtual Xvfb display, no
# visible window) so the blender-mcp addon's socket server on port 9876 works.
# Plain `blender --background` cannot host the server: the addon executes
# commands via bpy.app.timers, which never fire without an event loop.
#
# Usage: tools/blender-headless.sh {start|stop|status} [file.blend]
set -u

PIDFILE="${TMPDIR:-/tmp}/blender-mcp-headless.pid"
LOG="${TMPDIR:-/tmp}/blender-mcp-headless.log"
PORT=9876

port_open() {
  python3 -c "import socket; socket.create_connection(('127.0.0.1', $PORT), 1)" 2>/dev/null
}

case "${1:-status}" in
  start)
    if port_open; then
      echo "blender-mcp already listening on :$PORT"
      exit 0
    fi
    # WAYLAND_DISPLAY points at a nonexistent socket: Blender's GHOST otherwise
    # finds the real desktop compositor via $XDG_RUNTIME_DIR/wayland-0 (even with
    # WAYLAND_DISPLAY unset), opens a window there, and hangs in swap-buffers.
    # The bogus name makes the Wayland connect fail so it falls back to X11/Xvfb.
    setsid nohup env WAYLAND_DISPLAY=wayland-headless-none LIBGL_ALWAYS_SOFTWARE=1 \
      xvfb-run -a -s "-screen 0 1280x720x24 +extension GLX +render -noreset" \
      blender "${2:-}" >"$LOG" 2>&1 &
    echo $! >"$PIDFILE"
    echo "waiting for blender-mcp server on :$PORT ..."
    for _ in $(seq 1 30); do
      if port_open; then
        echo "up (pid $(cat "$PIDFILE"), log: $LOG)"
        exit 0
      fi
      sleep 1
    done
    echo "timed out; check $LOG" >&2
    exit 1
    ;;
  stop)
    if [ -f "$PIDFILE" ]; then
      kill -TERM -- -"$(cat "$PIDFILE")" 2>/dev/null && echo "stopped"
      rm -f "$PIDFILE"
    else
      pkill -f "xvfb-run -a blender" && echo "stopped (no pidfile)" || echo "not running"
    fi
    ;;
  status)
    if port_open; then
      echo "blender-mcp listening on :$PORT"
    else
      echo "not running"
      exit 1
    fi
    ;;
  *)
    echo "usage: $0 {start|stop|status} [file.blend]" >&2
    exit 2
    ;;
esac
