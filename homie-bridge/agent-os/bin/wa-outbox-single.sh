#!/usr/bin/env bash
# Explicit one-action CLI. Does not change HOLD or load the ordinary LaunchAgent.
set -eu
umask 077
ENV_FILE="${HOME}/.boom/env"
set -a
[ ! -f "$ENV_FILE" ] || source "$ENV_FILE"
set +a
HERE="$(cd "$(dirname "$0")" && pwd)"
exec /usr/bin/python3 "$HERE/wa_outbox_single.py" "$@"
