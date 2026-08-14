#!/usr/bin/env bash
# Shared helpers for the portal tooling.
#
# Model (same as axiiomlab):
#   stacks/<name>/      our customization layer (manifest + compose + overrides + seed)
#                       - core stack:      no VENDOR, compose lives in stacks/<name>/
#   .runtime/<name>/    staged, disposable compose tree per stack (gitignored)
#   DATA_ROOT           persistent data dir, lives outside the repo
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_ENV="$ROOT/runtime.env"
RUNTIME_DIR="$ROOT/.runtime"

# --------------------------------------------------------------------------- helpers
log()  { printf '\033[1;34m[portal]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[portal]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[portal]\033[0m %s\n' "$*" >&2; exit 1; }

# --------------------------------------------------------------------------- runtime env
# Source runtime.env (if present) so DATA_ROOT & friends are in the process env.
load_runtime_env() {
  if [ -f "$RUNTIME_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$RUNTIME_ENV"
    set +a
  fi
  DATA_ROOT="${DATA_ROOT:-$ROOT/data}"
  export DATA_ROOT
}

# --------------------------------------------------------------------------- stacks
# Names of stacks = directories under stacks/ containing a stack.conf.
list_stacks() {
  local d
  for d in "$ROOT"/stacks/*/; do
    [ -d "$d" ] || continue
    [ -f "$d/stack.conf" ] && basename "$d"
  done
}

# Load a stack manifest (stacks/<name>/stack.conf) and export STACK_* variables.
# stack.conf keys:
#   VENDOR            optional: path of the upstream submodule, relative to repo
#                     root. Empty/absent => core stack (compose lives in stacks/).
#   VENDOR_COMPOSE    base compose file(s) — relative to the vendor tree, or to
#                     the stack dir for core stacks (space separated)
#   OVERLAY_COMPOSE   optional compose file merged on top (repo-relative)
#   SERVICES          optional: only start these services of the base "universe"
#   COMPOSE_PROFILES  optional: compose profiles to activate for this stack
#   ENV_FILE          optional: override the env file (default below)
load_stack() {
  STACK_NAME="$1"
  STACK_DIR="$ROOT/stacks/$STACK_NAME"
  STACK_CONF="$STACK_DIR/stack.conf"
  [ -f "$STACK_CONF" ] || die "stack '$STACK_NAME' not found ($STACK_CONF)"

  # reset manifest keys that are "set" via source — otherwise a previous
  # stack.conf leaks into the next one
  unset VENDOR VENDOR_COMPOSE OVERLAY_COMPOSE SERVICES ENV_FILE COMPOSE_PROFILES 2>/dev/null || true

  # shellcheck disable=SC1090
  source "$STACK_CONF"
  : "${VENDOR_COMPOSE:?stack.conf ($STACK_NAME): VENDOR_COMPOSE is required}"

  VENDOR="${VENDOR:-}"
  STACK_OVERLAY_COMPOSE="${OVERLAY_COMPOSE:-}"
  STACK_SERVICES="${SERVICES:-}"

  if [ -n "$VENDOR" ]; then
    STACK_VENDOR_DIR="$ROOT/$VENDOR"
    STACK_STAGE_DIR="$RUNTIME_DIR/$STACK_NAME"
    [ -d "$STACK_VENDOR_DIR" ] || \
      die "vendor dir '$VENDOR' missing — run 'git submodule update --init'"
  else
    # core stack: the stack dir IS the compose source (no staged copy needed)
    STACK_VENDOR_DIR="$STACK_DIR"
    STACK_STAGE_DIR="$STACK_DIR"
  fi

  STACK_ENV_FILE=""
  if [ -n "${ENV_FILE:-}" ]; then
    STACK_ENV_FILE="$ROOT/$ENV_FILE"
  elif [ -f "$ROOT/secrets/$STACK_NAME/stack.env" ]; then
    STACK_ENV_FILE="$ROOT/secrets/$STACK_NAME/stack.env"
  elif [ -f "$STACK_DIR/stack.env.example" ]; then
    STACK_ENV_FILE="$STACK_DIR/stack.env.example"
  fi

  # optional compose profile activation
  if [ -n "${COMPOSE_PROFILES:-}" ]; then
    export COMPOSE_PROFILES
  fi

  export STACK_NAME STACK_DIR STACK_VENDOR_DIR
  export STACK_OVERLAY_COMPOSE STACK_SERVICES
  export STACK_STAGE_DIR STACK_ENV_FILE
}

# Source the stack env file (if any) into the process env for interpolation.
load_stack_env() {
  [ -n "$STACK_ENV_FILE" ] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$STACK_ENV_FILE"
  set +a
}

# --------------------------------------------------------------------------- staging
# Core stacks (no VENDOR) work directly in their stack dir — nothing to stage.
stage_stack() {
  if [ -z "$VENDOR" ]; then
    log "core stack $STACK_NAME — composing in place ($STACK_STAGE_DIR)"
    return 0
  fi
  log "staging $STACK_NAME -> $STACK_STAGE_DIR"
  rm -rf "$STACK_STAGE_DIR"
  mkdir -p "$STACK_STAGE_DIR"
  if git -C "$STACK_VENDOR_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$STACK_VENDOR_DIR" archive HEAD | tar -x -C "$STACK_STAGE_DIR"
  else
    # Plain checkout (e.g. rsync'd onto the server): copy the working tree,
    # dropping .git — the staged tree only needs the compose/config files.
    log "  (no git worktree — plain copy of $STACK_VENDOR_DIR)"
    tar -C "$STACK_VENDOR_DIR" -cf - --exclude=.git . | tar -x -C "$STACK_STAGE_DIR"
  fi
}

# Copy a file/dir into a directory, only if the destination does not exist yet
# (portable equivalent of `cp -n`, works on GNU & BSD coreutils).
copy_if_missing() {
  local src="$1" dst_dir="$2" base
  base="$(basename "$src")"
  if [ ! -e "$dst_dir/$base" ]; then
    cp -a "$src" "$dst_dir/"
  fi
}

# --------------------------------------------------------------------------- secrets
# 1. materialize real secrets from templates (secrets.example/<stack> -> secrets/<stack>)
# 2. copy them into $DATA_ROOT/secrets so compose `file:` secrets resolve
install_stack_secrets() {
  local tpl_dir="$ROOT/secrets.example/$STACK_NAME"
  local real_dir="$ROOT/secrets/$STACK_NAME"
  local tpl base
  if [ -d "$tpl_dir" ]; then
    mkdir -p "$real_dir"
    for tpl in "$tpl_dir"/*.template; do
      [ -e "$tpl" ] || continue
      base="$(basename "$tpl" .template)"
      if [ ! -f "$real_dir/$base" ]; then
        cp "$tpl" "$real_dir/$base"
        chmod 600 "$real_dir/$base"
        warn "created secrets/$STACK_NAME/$base from template — EDIT IT"
      fi
    done
  fi
  if [ -d "$real_dir" ] && [ -n "$(ls -A "$real_dir" 2>/dev/null)" ]; then
    mkdir -p "$DATA_ROOT/secrets"
    local f
    for f in "$real_dir"/*; do
      [ -e "$f" ] && copy_if_missing "$f" "$DATA_ROOT/secrets"
    done
    log "secrets -> $DATA_ROOT/secrets"
  fi
}

# --------------------------------------------------------------------------- data
# Seed persistent config into $DATA_ROOT (first-run only, never overwrites),
# then run a per-stack post-seed hook (cwd = $DATA_ROOT).
seed_stack_data() {
  local seed="$STACK_DIR/seed" f
  if [ -d "$seed" ]; then
    mkdir -p "$DATA_ROOT"
    for f in "$seed"/*; do
      [ -e "$f" ] && copy_if_missing "$f" "$DATA_ROOT"
    done
  fi
  if [ -f "$STACK_DIR/post-seed.sh" ]; then
    ( cd "$DATA_ROOT" && bash "$STACK_DIR/post-seed.sh" )
  fi
}

# --------------------------------------------------------------------------- compose
# Build the docker compose argument vector for the current stack.
build_compose_args() {
  local f
  COMPOSE_ARGS=(--project-directory "$STACK_STAGE_DIR")
  for f in $VENDOR_COMPOSE; do
    COMPOSE_ARGS+=(-f "$STACK_STAGE_DIR/$f")
  done
  [ -n "$STACK_OVERLAY_COMPOSE" ] && COMPOSE_ARGS+=(-f "$ROOT/$STACK_OVERLAY_COMPOSE")
  # interpolation order: runtime.env first, stack env overrides it
  [ -f "$RUNTIME_ENV" ] && COMPOSE_ARGS+=(--env-file "$RUNTIME_ENV")
  [ -n "$STACK_ENV_FILE" ] && COMPOSE_ARGS+=(--env-file "$STACK_ENV_FILE")
}
