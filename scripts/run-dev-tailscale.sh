#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TAILSCALE_BIN="${TAILSCALE_BIN:-$(command -v tailscale || true)}"
TAILSCALE_SERVICE="${TAILSCALE_SERVICE:-svc:palworld-companion}"
# Trading Webapp already uses this host's conventional Vite port (5173).
FRONTEND_PORT="${FRONTEND_PORT:-5174}"
FRONTEND_PID=""
BACKEND_STARTED=0
TAILNET_CONFIGURED=0

log() {
  printf '[palworld-companion] %s\n' "$*"
}

fail() {
  printf '[palworld-companion] ERROR: %s\n' "$*" >&2
  exit 1
}

stop_group() {
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  log "Stopping services..."
  stop_group "$FRONTEND_PID"
  wait 2>/dev/null || true
  if [[ "$BACKEND_STARTED" -eq 1 ]]; then
    node "$ROOT_DIR/scripts/guild/local.mjs" stop || exit_code=1
  fi
  if [[ "$TAILNET_CONFIGURED" -eq 1 ]]; then
    log "Named Tailnet route retained for the next launch: $TAILSCALE_SERVICE."
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local description="$1"
  local url="$2"
  for _ in {1..150}; do
    if curl --connect-timeout 2 --max-time 3 -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  fail "$description did not become ready at $url"
}

for command in node npm podman curl python3 setsid ss; do
  command -v "$command" >/dev/null 2>&1 || fail "Required command not found: $command"
done
[[ -n "$TAILSCALE_BIN" && -x "$TAILSCALE_BIN" ]] || fail "Required command not found: tailscale"
[[ -x "$ROOT_DIR/node_modules/.bin/vite" ]] || fail "Frontend dependencies missing; run: cd '$ROOT_DIR' && npm ci"
[[ "$TAILSCALE_SERVICE" =~ ^svc:[a-z0-9][a-z0-9-]*$ ]] || fail "Invalid TAILSCALE_SERVICE"
[[ "$FRONTEND_PORT" =~ ^[0-9]+$ ]] && (( FRONTEND_PORT >= 1024 && FRONTEND_PORT <= 65535 )) || fail "Invalid FRONTEND_PORT"

podman info >/dev/null 2>&1 || fail "Podman is installed but its engine is not ready; run: podman info"

TAILSCALE_STATUS="$($TAILSCALE_BIN status --json)" || fail "Tailscale status is unavailable"
TAILSCALE_STATE="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["BackendState"])' <<<"$TAILSCALE_STATUS")"
[[ "$TAILSCALE_STATE" == "Running" ]] || fail "Tailscale is not ready (state: $TAILSCALE_STATE)"
TAILNET_SUFFIX="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["MagicDNSSuffix"])' <<<"$TAILSCALE_STATUS")"
TAILSCALE_SERVICE_NAME="${TAILSCALE_SERVICE#svc:}"
TAILSCALE_DNS_NAME="$TAILSCALE_SERVICE_NAME.$TAILNET_SUFFIX"
TAILNET_URL="https://$TAILSCALE_DNS_NAME"
SERVICE_AVAILABLE="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(str(sys.argv[1] in d["Self"].get("Capabilities",[])).lower())' "services/$TAILSCALE_SERVICE_NAME" <<<"$TAILSCALE_STATUS")"
[[ "$SERVICE_AVAILABLE" == "true" ]] || fail "Tailscale Service is not defined for this host: $TAILSCALE_SERVICE"

if ss -ltn "sport = :$FRONTEND_PORT" 2>/dev/null | grep -q LISTEN; then
  fail "Port $FRONTEND_PORT is already in use. Stop the existing frontend first."
fi

SERVE_STATUS="$($TAILSCALE_BIN serve status --json)" || fail "Unable to read Tailscale Serve configuration"
EXISTING_PROXY="$(python3 -c 'import json,sys; d=json.load(sys.stdin); service,key=sys.argv[1:]; print(d.get("Services",{}).get(service,{}).get("Web",{}).get(key,{}).get("Handlers",{}).get("/",{}).get("Proxy",""))' "$TAILSCALE_SERVICE" "$TAILSCALE_DNS_NAME:443" <<<"$SERVE_STATUS")"
if [[ -n "$EXISTING_PROXY" && "$EXISTING_PROXY" != "http://127.0.0.1:$FRONTEND_PORT" ]]; then
  fail "$TAILSCALE_SERVICE already proxies another service: $EXISTING_PROXY"
fi

log "Starting the private guild backend..."
node "$ROOT_DIR/scripts/guild/local.mjs" start
BACKEND_STARTED=1

GUILD_CONFIG="$ROOT_DIR/scripts/guild/.local/config.json"
[[ -r "$GUILD_CONFIG" ]] || fail "Guild backend did not write $GUILD_CONFIG"
readarray -t GUILD_URLS < <(python3 - "$GUILD_CONFIG" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as stream:
    config = json.load(stream)
print(config['authUrl'])
print(config['restUrl'])
PY
)
GUILD_AUTH_TARGET="${GUILD_URLS[0]}"
GUILD_REST_TARGET="${GUILD_URLS[1]}"
wait_for_url "Guild Auth" "$GUILD_AUTH_TARGET/health"
wait_for_url "Guild REST" "$GUILD_REST_TARGET/"

export VITE_ALLOWED_HOST="$TAILSCALE_DNS_NAME"
export VITE_GUILD_AUTH_TARGET="$GUILD_AUTH_TARGET"
export VITE_GUILD_REST_TARGET="$GUILD_REST_TARGET"
export VITE_GUILD_AUTH_URL="$TAILNET_URL/auth"
export VITE_GUILD_REST_URL="$TAILNET_URL/rest"

log "Starting Vite on http://127.0.0.1:$FRONTEND_PORT ..."
(
  cd "$ROOT_DIR"
  exec setsid npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort
) &
FRONTEND_PID=$!
wait_for_url "Vite" "http://127.0.0.1:$FRONTEND_PORT/"

if [[ -z "$EXISTING_PROXY" ]]; then
  "$TAILSCALE_BIN" serve --service="$TAILSCALE_SERVICE" --bg --yes --https=443 "http://127.0.0.1:$FRONTEND_PORT"
fi
TAILNET_CONFIGURED=1

ACTUAL_PROXY="$($TAILSCALE_BIN serve status --json | python3 -c 'import json,sys; d=json.load(sys.stdin); service,key=sys.argv[1:]; print(d.get("Services",{}).get(service,{}).get("Web",{}).get(key,{}).get("Handlers",{}).get("/",{}).get("Proxy",""))' "$TAILSCALE_SERVICE" "$TAILSCALE_DNS_NAME:443")"
[[ "$ACTUAL_PROXY" == "http://127.0.0.1:$FRONTEND_PORT" ]] || fail "Tailscale Serve route was not configured as expected"
wait_for_url "Tailnet frontend" "$TAILNET_URL/"
wait_for_url "Tailnet Auth proxy" "$TAILNET_URL/auth/health"
wait_for_url "Tailnet REST proxy" "$TAILNET_URL/rest/"

log "Ready."
log "Local URL:   http://127.0.0.1:$FRONTEND_PORT"
log "Tailnet URL: $TAILNET_URL"
log "Guild Auth and REST are available through the same HTTPS origin."
log "Access is private to devices permitted by your tailnet; this is not public Funnel access."
log "Press Ctrl+C to stop the frontend and preserve/stop the guild containers."

while true; do
  kill -0 "$FRONTEND_PID" 2>/dev/null || fail "Frontend exited unexpectedly"
  for container in pw-guild-local-db pw-guild-local-auth pw-guild-local-rest; do
    [[ "$(podman inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)" == "true" ]] || fail "Backend container exited unexpectedly: $container"
  done
  sleep 1
done
