#!/bin/bash
# ops.sh — Console d'exploitation du dashboard Portal (modèle stacks).
# Usage: ops.sh <cmd> [args]
# Si lancé par un utilisateur non-root, se re-exécute en root via sudo (NOPASSWD).
set -Eeuo pipefail

OPS_ROOT=/opt/portal
if [[ $EUID -ne 0 ]]; then
  exec sudo -n "$OPS_ROOT/bin/ops.sh" "$@"
fi

# shellcheck disable=SC1091
source "$(dirname "$0")/lib.sh"

load_runtime_env

compose_for() { # prépare COMPOSE_ARGS pour la stack (par défaut: portal)
  local stack="${1:-portal}"
  load_stack "$stack"
  load_stack_env
  stage_stack
  build_compose_args
}

cmd_status() {
  echo "=== SYSTEME ==="
  uptime
  echo "Mem   : $(free -h | awk '/Mem:/{print $3" / "$2}')"
  echo "Disque: $(df -h / | awk 'NR==2{print $3" / "$2" ("$5")"}')"
  echo
  echo "=== CONTENEURS ==="
  docker ps --format "table {{.Names}}\t{{.Status}}" | sort
  echo
  echo "=== DASHBOARD ==="
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "http://localhost:3223/projets" 2>/dev/null || echo ERR)
  echo "http://localhost:3223/projets -> ${code:-ERR}"
}

cmd_ps()     { docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" | sort; }
cmd_logs()   { docker logs axiiomlab-dashboard --tail "${1:-200}" "$([ "${1:-}" ] && echo -f)" 2>&1; }
cmd_restart(){ docker restart axiiomlab-dashboard >/dev/null && echo "dashboard restarted"; }
cmd_deploy_stack(){ local stack="${1:-portal}"; bash "$ROOT/bin/deploy.sh" "$stack"; }
cmd_up()     { bash "$ROOT/bin/deploy.sh"; }
cmd_render() { bash "$ROOT/bin/render.sh"; }
cmd_health() {
  local code
  for p in /projets /portal /api/roadmap/projects /api/discover /api/ops /api/prompt-queue; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 8 "http://localhost:3223$p" 2>/dev/null || echo ERR)
    printf "  %-28s -> %s\n" "$p" "${code:-ERR}"
  done
}

usage() {
  cat <<EOF
ops.sh <cmd> [args]
  status        État système + dashboard
  ps            Liste des conteneurs
  logs [n]      Logs du dashboard
  restart       Restart du dashboard
  health        Smoke test des routes API
  deploy-stack [stack]  Deploy d'une stack (def: portal)
  up            Deploy toutes les stacks
  render        Render (validation compose)
  help          Ce message
EOF
}

cmd="${1:-help}"
case "$cmd" in
  status) cmd_status ;;
  ps) cmd_ps ;;
  logs) cmd_logs "${2:-200}" ;;
  restart) cmd_restart ;;
  health) cmd_health ;;
  deploy-stack) cmd_deploy_stack "${2:-portal}" ;;
  up) cmd_up ;;
  render) cmd_render ;;
  help|-h|--help) usage ;;
  *) echo "commande inconnue: $cmd" >&2; usage >&2; exit 1 ;;
esac
