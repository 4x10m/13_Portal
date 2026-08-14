#!/usr/bin/env bash
# Stage every stack (or the given ones) and render the merged compose file:
#   .runtime/<stack>.merged.yml
# This validates the stack compose before anything is deployed.
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

STACKS="${*:-$(list_stacks | tr '\n' ' ')}"
[ -n "$STACKS" ] || die "no stacks found under stacks/"
command -v docker >/dev/null 2>&1 || warn "docker not found — rendering skipped"

mkdir -p "$RUNTIME_DIR"
load_runtime_env

for s in $STACKS; do
  load_stack "$s"
  load_stack_env
  install_stack_secrets
  stage_stack
  if command -v docker >/dev/null 2>&1; then
    build_compose_args
    docker compose "${COMPOSE_ARGS[@]}" config > "$RUNTIME_DIR/$s.merged.yml"
    log "rendered .runtime/$s.merged.yml ($(wc -l < "$RUNTIME_DIR/$s.merged.yml") lines)"
  else
    warn "docker not available — cannot validate $s (compose files staged)"
  fi
done
