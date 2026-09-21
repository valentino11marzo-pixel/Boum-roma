#!/usr/bin/env bash
# Existing LaunchAgent entrypoint. Environment remains local to this process.
set -eu
umask 077
ENV_FILE="${HOME}/.boom/env"
set -a
[ ! -f "$ENV_FILE" ] || source "$ENV_FILE"
set +a
HERE="$(cd "$(dirname "$0")" && pwd)"
exec /usr/bin/python3 "$HERE/wa_outbox.py" "$@"
