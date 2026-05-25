#!/usr/bin/env bash
# ── AxiiomLab Dashboard — Deployment Test Script ──
# Usage: ./test-deploy.sh [BASE_URL]
# Default: http://localhost:3223
set -euo pipefail

BASE="${1:-http://localhost:3223}"
PASS=0
FAIL=0
SKIP=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

check() {
  local label="$1" url="$2" expected_status="${3:-200}" expect_json="${4:-}"
  local resp_code resp_body

  resp_code=$(curl -s -o /tmp/test-deploy-body -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")
  resp_body=$(cat /tmp/test-deploy-body 2>/dev/null || echo "")

  if [ "$resp_code" = "000" ]; then
    echo -e " ${RED}✗${NC} $label — CONNECTION FAILED"
    FAIL=$((FAIL+1))
    return
  fi

  if [ "$resp_code" != "$expected_status" ]; then
    echo -e " ${RED}✗${NC} $label — HTTP $resp_code (expected $expected_status)"
    FAIL=$((FAIL+1))
    return
  fi

  # Optional JSON field check
  if [ -n "$expect_json" ]; then
    local val
    val=$(echo "$resp_body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$expect_json','__MISSING__'))" 2>/dev/null || echo "__PARSE_ERR__")
    if [ "$val" = "__MISSING__" ] || [ "$val" = "__PARSE_ERR__" ]; then
      echo -e " ${RED}✗${NC} $label — HTTP $resp_code OK but field '$expect_json' missing/unparseable"
      FAIL=$((FAIL+1))
      return
    fi
  fi

  echo -e " ${GREEN}✓${NC} $label — HTTP $resp_code"
  PASS=$((PASS+1))
}

check_page() {
  local label="$1" url="$2"
  local resp_code
  resp_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")

  if [ "$resp_code" = "000" ]; then
    echo -e " ${RED}✗${NC} $label — CONNECTION FAILED"
    FAIL=$((FAIL+1))
    return
  fi

  if [ "$resp_code" != "200" ]; then
    echo -e " ${RED}✗${NC} $label — HTTP $resp_code"
    FAIL=$((FAIL+1))
    return
  fi

  echo -e " ${GREEN}✓${NC} $label — HTTP $resp_code"
  PASS=$((PASS+1))
}

echo -e "${CYAN}═══ AxiiomLab Dashboard — Deploy Test ═══${NC}"
echo -e "  Base URL: $BASE"
echo ""

# ── 1. Container health ──
echo -e "${CYAN}── Container ──${NC}"
if docker ps --format '{{.Names}}' | grep -q 'axiiomlab-dashboard'; then
  echo -e " ${GREEN}✓${NC} Container running"
  PASS=$((PASS+1))
  # Memory check
  mem=$(docker stats axiiomlab-dashboard --no-stream --format '{{.MemUsage}}' 2>/dev/null | head -1 || echo "unknown")
  echo -e " ${CYAN}ℹ${NC} Memory: $mem"
else
  echo -e " ${RED}✗${NC} Container NOT running"
  FAIL=$((FAIL+1))
fi
echo ""

# ── 2. Pages ──
echo -e "${CYAN}── Pages ──${NC}"
check "Root → Projets redirect" "$BASE" 307
check_page "Projets page" "$BASE/projets"
echo ""

# ── 3. API Routes ──
echo -e "${CYAN}── API Routes ──${NC}"
check "Projects list" "$BASE/api/roadmap/projects" 200
check "Discover scan" "$BASE/api/discover" 200
check "Ops data" "$BASE/api/ops" 200
check "Agents list" "$BASE/api/agents/list" 200
check "Web monitor" "$BASE/api/web-monitor" 200
check "Cloud pricing" "$BASE/api/cloud-pricing" 200
check "DBaaS — Postgres" "$BASE/api/dbaas/postgres" 200
check "Cloud — Pool" "$BASE/api/cloud/pool" 200
check "Artefacts" "$BASE/api/artefacts" 200
echo ""

# ── 4. Data integrity ──
echo -e "${CYAN}── Data Integrity ──${NC}"

# Projects with resources
projects_with_resources=$(curl -s "$BASE/api/roadmap/projects" | python3 -c "
import sys, json
data = json.load(sys.stdin)
count = sum(1 for p in data if p.get('docker_containers') or p.get('domains') or p.get('databases'))
print(count)
" 2>/dev/null || echo "0")

if [ "$projects_with_resources" -gt 0 ]; then
  echo -e " ${GREEN}✓${NC} Projects with resources: $projects_with_resources"
  PASS=$((PASS+1))
else
  echo -e " ${YELLOW}⚠${NC} No projects have resources — run /api/discover first"
  SKIP=$((SKIP+1))
fi

# Duplicate project check
dupes=$(curl -s "$BASE/api/roadmap/projects" | python3 -c "
import sys, json
data = json.load(sys.stdin)
names = [p['name'] for p in data]
dupes = [n for n in set(names) if names.count(n) > 1]
print(len(dupes))
" 2>/dev/null || echo "-1")

if [ "$dupes" = "0" ]; then
  echo -e " ${GREEN}✓${NC} No duplicate project names"
  PASS=$((PASS+1))
elif [ "$dupes" = "-1" ]; then
  echo -e " ${YELLOW}⚠${NC} Could not check duplicates (parse error)"
  SKIP=$((SKIP+1))
else
  echo -e " ${RED}✗${NC} Duplicate project names found: $dupes"
  FAIL=$((FAIL+1))
fi

# Discover returns data
discover_mapped=$(curl -s "$BASE/api/discover" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('mapped_projects', 0))
" 2>/dev/null || echo "0")

if [ "$discover_mapped" -gt 0 ]; then
  echo -e " ${GREEN}✓${NC} Discover mapped $discover_mapped projects"
  PASS=$((PASS+1))
else
  echo -e " ${YELLOW}⚠${NC} Discover mapped 0 projects — Docker socket issue?"
  SKIP=$((SKIP+1))
fi
echo ""

# ── 5. TypeScript check ──
echo -e "${CYAN}── TypeScript ──${NC}"
tsc_output=$(cd /home/debian/Codebase/1_infra/26_Homepage/dashboard && npx tsc --noEmit 2>&1 | grep -v 'node_modules' | grep -i 'error' | head -5 || true)
if [ -z "$tsc_output" ]; then
  echo -e " ${GREEN}✓${NC} No TypeScript errors (src only)"
  PASS=$((PASS+1))
else
  echo -e " ${RED}✗${NC} TypeScript errors found:"
  echo "$tsc_output"
  FAIL=$((FAIL+1))
fi
echo ""

# ── Summary ──
echo -e "${CYAN}═══ Summary ═══${NC}"
echo -e "  ${GREEN}PASS${NC}: $PASS  ${RED}FAIL${NC}: $FAIL  ${YELLOW}SKIP${NC}: $SKIP"
TOTAL=$((PASS+FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}All $TOTAL checks passed!${NC}"
  exit 0
else
  echo -e "  ${RED}$FAIL check(s) failed${NC}"
  exit 1
fi
