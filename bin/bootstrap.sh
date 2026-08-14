#!/usr/bin/env bash
# One-shot server preparation: install Docker + compose plugin, create DATA_ROOT.
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_runtime_env

if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine…"
  if [ "$(id -u)" -ne 0 ]; then
    curl -fsSL https://get.docker.com | sudo sh
  else
    curl -fsSL https://get.docker.com | sh
  fi
fi
command -v docker >/dev/null 2>&1 || die "docker install failed"
log "docker: $(docker --version)"
docker compose version >/dev/null 2>&1 && log "compose plugin: $(docker compose version | head -1)" \
  || warn "docker compose plugin missing — required"

mkdir -p "$DATA_ROOT"
log "DATA_ROOT=$DATA_ROOT ready"

cat <<EOF

next steps:
  1. cp runtime.env.example runtime.env      # set DATA_ROOT / TZ / DOMAIN
  2. edit secrets/portal/stack.env (generated from stacks/portal/stack.env.example)
  3. bin/deploy.sh                            # or: bin/deploy.sh portal
EOF
