#!/usr/bin/env bash
# ── AxiiomLab Prompt Queue Worker ──────────────────────
# Polls the dashboard API for pending prompts and spawns
# the appropriate harness (opencode, codex, claude-code).
# Runs on the HOST — not inside Docker.
# ────────────────────────────────────────────────────────
set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3223}"
POLL_INTERVAL="${POLL_INTERVAL:-10}"       # seconds between polls
MAX_CONCURRENT="${MAX_CONCURRENT:-2}"       # max parallel harness processes
HARNESS_TIMEOUT="${HARNESS_TIMEOUT:-300}"   # seconds per harness run
LOG_DIR="${LOG_DIR:-/tmp/prompt-worker}"
PID_DIR="${PID_DIR:-/tmp/prompt-worker}"

# ── Colors ──
G() { printf '\033[32m%s\033[0m\n' "$*"; }
Y() { printf '\033[33m%s\033[0m\n' "$*"; }
R() { printf '\033[31m%s\033[0m\n' "$*"; }
C() { printf '\033[36m%s\033[0m\n' "$*"; }
B() { printf '\033[1m%s\033[0m\n' "$*"; }

mkdir -p "$LOG_DIR" "$PID_DIR"

# ── Helpers ──

active_count() {
  local count
  count=$(ls "$PID_DIR"/*.pid 2>/dev/null | wc -l)
  echo "${count:-0}" | tr -d '[:space:]'
}

is_still_running() {
  local pid_file="$1"
  local pid
  pid=$(cat "$pid_file" 2>/dev/null) || return 1
  kill -0 "$pid" 2>/dev/null
}

reap_finished() {
  # Just remove stale PID files for processes that no longer exist
  for pid_file in "$PID_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    local pid
    pid=$(cat "$pid_file" 2>/dev/null) || { rm -f "$pid_file"; continue; }
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
    fi
  done
}

mark_running() {
  local qid="$1"
  curl -sf -X PATCH "$DASHBOARD_URL/api/prompt-queue" \
    -H 'Content-Type: application/json' \
    -d "{\"id\":\"$qid\",\"status\":\"running\"}" > /dev/null 2>&1
}

mark_done() {
  local qid="$1"
  local result="$2"
  curl -sf -X PATCH "$DASHBOARD_URL/api/prompt-queue" \
    -H 'Content-Type: application/json' \
    -d "{\"id\":\"$qid\",\"status\":\"done\",\"result\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1][:4000]))" "$result")}" > /dev/null 2>&1
}

mark_failed() {
  local qid="$1"
  local result="$2"
  curl -sf -X PATCH "$DASHBOARD_URL/api/prompt-queue" \
    -H 'Content-Type: application/json' \
    -d "{\"id\":\"$qid\",\"status\":\"failed\",\"result\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1][:4000]))" "$result")}" > /dev/null 2>&1
}

# ── Harness Spawners ──

spawn_opencode() {
  local qid="$1" prompt="$2" cwd="${3:-}" model="${4:-default}"
  local model_flag=""
  if [ "$model" != "default" ]; then
    model_flag="--model"
  fi
  local dir_flag=""
  if [ -n "$cwd" ] && [ -d "$cwd" ]; then
    dir_flag="--dir"
  fi

  Y "  → opencode run: prompt='${prompt:0:60}...' cwd=${cwd:-(auto)} model=${model:-default}"

  # Write prompt to temp file to avoid shell quoting issues
  local prompt_file="$LOG_DIR/${qid}.prompt"
  printf '%s' "$prompt" > "$prompt_file"

  if [ -n "$model_flag" ] && [ -n "$dir_flag" ]; then
    timeout "$HARNESS_TIMEOUT" opencode run "$prompt" --format json --model "$model" --dir "$cwd" \
      > "$LOG_DIR/${qid}.json" 2>"$LOG_DIR/${qid}.err" &
  elif [ -n "$dir_flag" ]; then
    timeout "$HARNESS_TIMEOUT" opencode run "$prompt" --format json --dir "$cwd" \
      > "$LOG_DIR/${qid}.json" 2>"$LOG_DIR/${qid}.err" &
  elif [ -n "$model_flag" ]; then
    timeout "$HARNESS_TIMEOUT" opencode run "$prompt" --format json --model "$model" \
      > "$LOG_DIR/${qid}.json" 2>"$LOG_DIR/${qid}.err" &
  else
    timeout "$HARNESS_TIMEOUT" opencode run "$prompt" --format json \
      > "$LOG_DIR/${qid}.json" 2>"$LOG_DIR/${qid}.err" &
  fi

  local pid=$!
  echo "$pid" > "$PID_DIR/${qid}.pid"
}

spawn_codex() {
  local qid="$1" prompt="$2" cwd="${3:-}" model="${4:-default}"
  Y "  → codex (not installed): would run '$prompt'"
  mark_failed "$qid" "codex CLI not available on this host"
}

spawn_claude_code() {
  local qid="$1" prompt="$2" cwd="${3:-}" model="${4:-default}"
  Y "  → claude-code (not installed): would run '$prompt'"
  mark_failed "$qid" "claude-code CLI not available on this host"
}

spawn_other() {
  local qid="$1" prompt="$2" cwd="${3:-}" model="${4:-default}"
  Y "  → other harness: not implemented"
  mark_failed "$qid" "harness 'other' not yet implemented"
}

# ── Parse opencode JSON output → extract text ──

parse_opencode_result() {
  local json_file="$1"
  python3 -c "
import json, sys
texts = []
try:
    with open(sys.argv[1]) as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                d = json.loads(line)
                if d.get('type') == 'text':
                    texts.append(d.get('part',{}).get('text',''))
            except: pass
except: pass
print('\\n'.join(texts) if texts else '(no text output)')
" "$json_file" 2>/dev/null
}

# ── Check completed background jobs ──

check_completed() {
  for pid_file in "$PID_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    local qid
    qid=$(basename "$pid_file" .pid)
    local pid
    pid=$(cat "$pid_file" 2>/dev/null) || continue

    if ! kill -0 "$pid" 2>/dev/null; then
      # Process finished
      wait "$pid" 2>/dev/null
      local exit_code=$?
      rm -f "$pid_file"

      if [ "$exit_code" -eq 0 ]; then
        local result
        result=$(parse_opencode_result "$LOG_DIR/${qid}.json" 2>/dev/null || echo "(parse error)")
        mark_done "$qid" "$result"
        G "  ✓ Job $qid completed"
      elif [ "$exit_code" -eq 124 ]; then
        mark_failed "$qid" "Timeout after ${HARNESS_TIMEOUT}s"
        R "  ✗ Job $qid timed out"
      else
        local err
        err=$(cat "$LOG_DIR/${qid}.err" 2>/dev/null | tail -5 | head -200)
        mark_failed "$qid" "Exit code $exit_code: ${err:-unknown error}"
        R "  ✗ Job $qid failed (exit=$exit_code)"
      fi
    fi
  done
}

# ── Main Loop ──

poll_and_spawn() {
  local active
  active=$(active_count)
  local slots=$(( MAX_CONCURRENT - active ))

  if [ "$slots" -le 0 ] 2>/dev/null; then
    return
  fi

  # Fetch pending items from API
  local pending
  pending=$(curl -sf "$DASHBOARD_URL/api/prompt-queue?status=pending&limit=$slots" 2>/dev/null) || return

  local count
  count=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('items',d)))" <<< "$pending" 2>/dev/null) || return

  if [ "$count" -eq 0 ]; then
    return
  fi

  C "  Found $count pending item(s), $slots slot(s) available"

  # Parse and spawn each — use process substitution to avoid subshell
  while IFS=$'\t' read -r qid harness prompt cwd model; do
    [ -z "$qid" ] && continue
    [ -f "$PID_DIR/${qid}.pid" ] && continue  # already running

    mark_running "$qid"

    case "$harness" in
      opencode) spawn_opencode "$qid" "$prompt" "$cwd" "$model" ;;
      codex) spawn_codex "$qid" "$prompt" "$cwd" "$model" ;;
      claude-code) spawn_claude_code "$qid" "$prompt" "$cwd" "$model" ;;
      *) spawn_other "$qid" "$prompt" "$cwd" "$model" ;;
    esac
  done < <(python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', data) if isinstance(data, dict) else data
for item in items:
    qid = item['id']
    prompt = item['prompt']
    cwd = item.get('target_cwd') or ''
    model = item.get('target_model') or 'default'
    harness = item.get('harness_type') or 'opencode'
    print(f'{qid}\t{harness}\t{prompt}\t{cwd}\t{model}')
" <<< "$pending" 2>/dev/null)
}

# ── Signal Handling ──

cleanup() {
  Y "Shutting down prompt worker..."
  for pid_file in "$PID_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    local qid
    qid=$(basename "$pid_file" .pid)
    local pid
    pid=$(cat "$pid_file" 2>/dev/null) || continue
    kill "$pid" 2>/dev/null || true
    mark_failed "$qid" "Worker shutdown"
    rm -f "$pid_file"
  done
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Entry Point ──

B "═══ AxiiomLab Prompt Queue Worker ═══"
C "  Dashboard: $DASHBOARD_URL"
C "  Poll interval: ${POLL_INTERVAL}s | Max concurrent: $MAX_CONCURRENT | Timeout: ${HARNESS_TIMEOUT}s"
C "  Log dir: $LOG_DIR"
echo ""

while true; do
  check_completed
  reap_finished
  poll_and_spawn
  sleep "$POLL_INTERVAL"
done
