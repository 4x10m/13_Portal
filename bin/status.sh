#!/usr/bin/env bash
# Human-readable status: stacks + running containers.
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_runtime_env
echo "== runtime =="
echo "DATA_ROOT=$DATA_ROOT"
[ -f "$RUNTIME_ENV" ] || warn "runtime.env missing — cp runtime.env.example runtime.env"
echo

for s in $(list_stacks); do
  load_stack "$s"
  echo "== stack: $s (vendor: ${VENDOR:-core}) =="
  echo "  compose: $(basename "${VENDOR_COMPOSE%% *}")  env: ${STACK_ENV_FILE:-none}"
  echo
done

echo "== containers =="
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>/dev/null || true
