#!/bin/sh
set -eu

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-9801}"

if [ "${D:-}" = "" ]; then
  MODE="start"
else
  MODE="dev"
fi

# Build command once so sandboxed/non-sandboxed paths stay identical.
set -- yarn "$MODE" -H "$HOST" -p "$PORT"

# Allow opting out when debugging sandbox issues.
if [ "${NO_BWRAP:-0}" = "1" ]; then
  exec "$@"
fi

if command -v bwrap >/dev/null 2>&1; then
  TMP_ROOT="${TMPDIR:-/tmp}"

  exec bwrap \
    --die-with-parent \
    --unshare-pid \
    --new-session \
    --dev /dev \
    --proc /proc \
    --ro-bind /usr /usr \
    --ro-bind /bin /bin \
    --ro-bind /lib /lib \
    --ro-bind /lib64 /lib64 \
    --ro-bind /etc /etc \
    --ro-bind /run /run \
    --ro-bind /opt /opt \
    --bind "$PWD" "$PWD" \
    --chdir "$PWD" \
    --bind "$TMP_ROOT" "$TMP_ROOT" \
    --setenv HOME "$PWD/.sandbox-home" \
    --setenv TMPDIR "$TMP_ROOT" \
    --setenv XDG_CACHE_HOME "$PWD/.sandbox-home/.cache" \
    --setenv XDG_CONFIG_HOME "$PWD/.sandbox-home/.config" \
    --setenv XDG_DATA_HOME "$PWD/.sandbox-home/.local/share" \
    --setenv PATH "${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}" \
    "$@"
fi

exec "$@"
