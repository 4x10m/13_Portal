#!/usr/bin/env bash
# ── AxiiomLab Portal — dev utility ──────────────────────
# Usage: ./dev.sh <command> [args]
# ──────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

PORT=3223
CONTAINER=axiiomlab-dashboard
COMPOSE="docker compose"

# ── Colors ──
G() { printf '\033[32m%s\033[0m' "$*"; }
Y() { printf '\033[33m%s\033[0m' "$*"; }
R() { printf '\033[31m%s\033[0m' "$*"; }
C() { printf '\033[36m%s\033[0m' "$*"; }

usage() {
  cat <<EOF
$(C "AxiiomLab Portal — dev.sh")

$(Y "Commands:")
 build Build dashboard image
 deploy Build + restart container (zero-downtime)
 dev-local Start next dev with hot-reload on host (port 3224)
 setup-dev One-time setup: install deps + copy DB from container
 up Start all portal services (dashboard + homepage)
 down Stop all portal services
 restart Restart dashboard container
 logs Tail dashboard logs (last 50)
 ssh Exec shell inside dashboard container
 status Show container status + quick health check
 test Run API smoke tests
 discover Trigger Docker discovery
 worker Start prompt queue worker (polls & spawns harness)
 db Open SQLite CLI inside container
 db-schema Show DB schema
 db-stats Show project counts + queue stats
 db-pull Copy DB from container to dashboard/data/ for local dev
 clean Remove node_modules + .next cache + rebuild
 help Show this help

$(Y "Examples:")
 ./dev.sh dev-local    # Start hot-reload on :3224
 ./dev.sh setup-dev    # One-time: install deps + copy DB
 ./dev.sh build        # Docker build
 ./dev.sh logs         # Tail logs
 ./dev.sh test         # Smoke tests
 ./dev.sh db-pull      # Refresh local DB from container
 ./dev.sh db-stats     # DB statistics
EOF
}

cmd_build() {
  Y "Building dashboard..." >&2
  $COMPOSE build dashboard 2>&1 | tail -5
  G "✓ Build complete" >&2
}

cmd_deploy() {
  Y "Deploying dashboard..." >&2
  $COMPOSE up -d --build dashboard 2>&1 | tail -5
  sleep 4
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    G "✓ Dashboard running on :${PORT}" >&2
  else
    R "✗ Dashboard not running!" >&2
    docker logs "$CONTAINER" --tail 20 2>&1
    return 1
  fi
}

cmd_up() {
  Y "Starting portal services..." >&2
  $COMPOSE up -d 2>&1 | tail -10
  G "✓ Services started" >&2
}

cmd_down() {
  $COMPOSE down 2>&1 | tail -5
  G "✓ Services stopped" >&2
}

cmd_restart() {
  docker restart "$CONTAINER" 2>&1
  sleep 3
  G "✓ Restarted" >&2
}

cmd_logs() {
  docker logs "$CONTAINER" --tail "${1:-50}" -f 2>&1
}

cmd_ssh() {
  docker exec -it "$CONTAINER" sh
}

cmd_status() {
  echo "$(C "── Container ──")"
  docker ps --filter "name=$CONTAINER" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Not found"
  echo ""
  echo "$(C "── Health ──")"
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/projets" 2>/dev/null || echo "ERR")
  if [ "$HTTP" = "200" ]; then
    echo "$(G "✓ /projets → $HTTP")"
  else
    echo "$(R "✗ /projets → $HTTP")"
  fi
  echo ""
  echo "$(C "── Quick Stats ──")"
  curl -s "http://localhost:${PORT}/api/roadmap/projects" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print(f'  Projects: {len(d)}')
  by_status = {}
  for p in d:
    s = p.get('status','?')
    by_status[s] = by_status.get(s,0)+1
  for s,c in sorted(by_status.items(), key=lambda x:-x[1]):
    print(f'    {s}: {c}')
  rp = [p for p in d if p.get('repo_path')]
  print(f'  With repo_path: {len(rp)}/{len(d)}')
except: print('  (API unavailable)')
" 2>/dev/null
}

cmd_test() {
  PASS=0; FAIL=0
  test_endpoint() {
    local url="$1" expect="${2:-200}" label="$3"
    local code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}${url}" 2>/dev/null || echo "000")
    if [ "$code" = "$expect" ]; then
      printf " $(G "✓") %s → %s\n" "$label" "$code"
      PASS=$((PASS + 1))
    else
      printf " $(R "✗") %s → %s (expected %s)\n" "$label" "$code" "$expect"
      FAIL=$((FAIL + 1))
    fi
  }

  echo "$(C "── API Smoke Tests ──")"
  test_endpoint "/projets" 200 "Projets page"
  test_endpoint "/portal" 200 "Portal landing"
  test_endpoint "/api/roadmap/projects" 200 "Projects API"
  test_endpoint "/api/discover" 200 "Discover API"
  test_endpoint "/api/ops" 200 "Ops API"
  test_endpoint "/api/prompt-queue" 200 "Prompt Queue API"
  test_endpoint "/api/agents/list" 200 "Agents API"

  # Test a project's README + dir
  PROJ_ID=$(curl -s "http://localhost:${PORT}/api/roadmap/projects" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[x for x in d if x.get('repo_path')]
print(p[0]['id'] if p else '')
" 2>/dev/null)
  if [ -n "$PROJ_ID" ]; then
    test_endpoint "/api/projects/${PROJ_ID}/readme" 200 "README API"
    test_endpoint "/api/projects/${PROJ_ID}/dir" 200 "Dir API"
  fi

  echo ""
  echo "$(C "── Results ──") $(G "$PASS passed") $(R "$FAIL failed")"
  [ "$FAIL" -eq 0 ]
}

cmd_discover() {
  echo "$(Y "Triggering discovery...")" >&2
  curl -s "http://localhost:${PORT}/api/discover" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  Containers scanned: {d.get(\"scanned_containers\",\"?\")}')
print(f'  Sessions scanned: {d.get(\"scanned_sessions\",\"?\")}')
print(f'  Projects updated: {d.get(\"updated_projects\",\"?\")}')
print(f'  Total projects: {d.get(\"total_projects\",\"?\")}')
if d.get('unmatched_containers'):
  print(f'  Unmatched containers: {d[\"unmatched_containers\"]}')
if d.get('unmatched_sessions'):
  print(f'  Unmatched sessions: {len(d[\"unmatched_sessions\"])}')
" 2>/dev/null
  echo "$(G "✓ Done")" >&2
}

cmd_db() {
  docker exec -it "$CONTAINER" node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/dashboard.db');
const repl = require('repl');
const r = repl.start('> ');
r.context.db = db;
r.context.sql = (q) => { try { return db.prepare(q).all(); } catch(e) { return e.message; } };
" 2>/dev/null || echo "$(R "Container not running")"
}

cmd_db_schema() {
  docker exec "$CONTAINER" node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/dashboard.db');
for (const t of ['projects','milestones','tasks','links','prompt_queue']) {
  const cols = db.pragma('table_info(' + t + ')');
  console.log('\n── ' + t + ' ──');
  cols.forEach(c => console.log('  ' + c.name + ' ' + c.type + (c.dflt_value ? ' DEFAULT ' + c.dflt_value : '') + (c.pk ? ' PK' : '')));
}
db.close();
" 2>/dev/null || echo "$(R "Container not running")"
}

cmd_db_stats() {
  docker exec "$CONTAINER" node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/dashboard.db');
console.log('── Projects ──');
console.log('  Total:', db.prepare('SELECT COUNT(*) as c FROM projects').get().c);
const byStatus = db.prepare('SELECT status, COUNT(*) as c FROM projects GROUP BY status ORDER BY c DESC').all();
byStatus.forEach(r => console.log('  ' + r.status + ': ' + r.c));
const withRepo = db.prepare(\"SELECT COUNT(*) as c FROM projects WHERE repo_path IS NOT NULL AND repo_path != ''\").get().c;
console.log('  With repo_path: ' + withRepo);
console.log('');
console.log('── Milestones ──');
console.log('  Total:', db.prepare('SELECT COUNT(*) as c FROM milestones').get().c);
console.log('');
console.log('── Tasks ──');
console.log('  Total:', db.prepare('SELECT COUNT(*) as c FROM tasks').get().c);
const byTaskStatus = db.prepare('SELECT status, COUNT(*) as c FROM tasks GROUP BY status ORDER BY c DESC').all();
byTaskStatus.forEach(r => console.log('  ' + r.status + ': ' + r.c));
console.log('');
console.log('── Prompt Queue ──');
console.log('  Total:', db.prepare('SELECT COUNT(*) as c FROM prompt_queue').get().c);
const byPQ = db.prepare('SELECT status, COUNT(*) as c FROM prompt_queue GROUP BY status ORDER BY c DESC').all();
byPQ.forEach(r => console.log('  ' + r.status + ': ' + r.c));
db.close();
" 2>/dev/null || echo "$(R "Container not running")"
}

cmd_clean() {
  echo "$(Y "Cleaning build artifacts...")" >&2
  rm -rf dashboard/.next dashboard/node_modules/.cache
  echo "$(Y "Rebuilding...")" >&2
  cmd_deploy
}

cmd_dev_local() {
  local dash_dir="$(dirname "$0")/dashboard"
  if [ ! -d "$dash_dir/node_modules" ]; then
    Y "Installing node_modules..." >&2
    (cd "$dash_dir" && npm ci) 2>&1 | tail -3
  fi
  if [ ! -f "$dash_dir/data/dashboard.db" ]; then
    Y "No local DB found — pulling from container..." >&2
    cmd_db_pull
  fi
  C "Starting next dev (hot-reload) on :3224..." >&2
  cd "$dash_dir" && npx next dev --port 3224
}

cmd_setup_dev() {
  local dash_dir="$(dirname "$0")/dashboard"
  Y "Setting up local dev environment..." >&2
  # 1. Install deps
  if [ ! -d "$dash_dir/node_modules" ]; then
    C " Installing npm dependencies..." >&2
    (cd "$dash_dir" && npm ci) 2>&1 | tail -5
  else
    G " ✓ node_modules already installed" >&2
  fi
  # 2. Copy DB from container
  if [ ! -f "$dash_dir/data/dashboard.db" ]; then
    C " Copying DB from container..." >&2
    mkdir -p "$dash_dir/data"
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
      docker cp "$CONTAINER:/app/data/dashboard.db" "$dash_dir/data/dashboard.db"
      G " ✓ DB copied" >&2
    else
      Y " ⚠ Container not running — creating empty DB on first dev start" >&2
    fi
  else
    G " ✓ Local DB exists" >&2
  fi
  # 3. Create .env.local if missing
  if [ ! -f "$dash_dir/.env.local" ]; then
    C " Creating .env.local from .env.example..." >&2
    cp "$dash_dir/.env.example" "$dash_dir/.env.local"
    G " ✓ .env.local created (edit if needed)" >&2
  else
    G " ✓ .env.local already exists" >&2
  fi
  echo "" >&2
  G "✓ Setup complete! Run: ./dev.sh dev-local" >&2
}

cmd_db_pull() {
  local dash_dir="$(dirname "$0")/dashboard"
  mkdir -p "$dash_dir/data"
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    docker cp "$CONTAINER:/app/data/dashboard.db" "$dash_dir/data/dashboard.db"
    G "✓ DB pulled from container to dashboard/data/dashboard.db" >&2
  else
    R "✗ Container not running — cannot pull DB" >&2
    return 1
  fi
}

cmd_worker() {
  Y "Starting prompt queue worker..." >&2
  local worker_script="$(dirname "$0")/prompt-worker.sh"
  if [ ! -f "$worker_script" ]; then
    R "✗ prompt-worker.sh not found!" >&2
    return 1
  fi
  exec "$worker_script" "${@:2}"
}

# ── Main ──
case "${1:-help}" in
build) cmd_build ;;
deploy) cmd_deploy ;;
dev-local) cmd_dev_local ;;
setup-dev) cmd_setup_dev ;;
db-pull) cmd_db_pull ;;
up) cmd_up ;;
  down)      cmd_down ;;
  restart)   cmd_restart ;;
  logs)      cmd_logs "${2:-50}" ;;
  ssh)       cmd_ssh ;;
  status)    cmd_status ;;
  test)      cmd_test ;;
  discover)  cmd_discover ;;
  db)        cmd_db ;;
  db-schema) cmd_db_schema ;;
  db-stats)  cmd_db_stats ;;
  clean) cmd_clean ;;
  worker) cmd_worker "$@" ;;
  help|*) usage ;;
esac
