#!/usr/bin/env bash
# Deploy one or more stacks (default: all).
# For each stack: materialize secrets -> seed DATA_ROOT -> stage -> validate -> up -d.
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_runtime_env
[ -f "$RUNTIME_ENV" ] || die "missing $RUNTIME_ENV — cp runtime.env.example runtime.env and adapt DATA_ROOT"
command -v docker >/dev/null 2>&1 || die "docker not found — run bin/bootstrap.sh first"

STACKS="${*:-$(list_stacks | tr '\n' ' ')}"
[ -n "$STACKS" ] || die "no stacks found under stacks/"

mkdir -p "$RUNTIME_DIR" "$DATA_ROOT"

for s in $STACKS; do
  load_stack "$s"
  load_stack_env
  install_stack_secrets
  seed_stack_data
  stage_stack
  build_compose_args

  docker compose "${COMPOSE_ARGS[@]}" config --quiet \
    || die "invalid compose for $s — fix the stack (run bin/render.sh)"

  if [ -n "$STACK_SERVICES" ]; then
    log "deploying $s (services: $STACK_SERVICES)"
    docker compose "${COMPOSE_ARGS[@]}" up -d $STACK_SERVICES
  else
    log "deploying $s (all services)"
    docker compose "${COMPOSE_ARGS[@]}" up -d
  fi
done

log "done."
