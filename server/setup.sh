#!/bin/bash
# =============================================================================
#  Setup serveur : deploiement du modele stacks pour le dashboard Portal
#  Usage: sudo bash setup.sh   (variables DOMAIN / TZ / HOST_IP surchargeables)
#
#  Depuis le refactor upstream-overlay, le deploiement passe par le repo
#  4x10m/13_Portal (bin/render.sh + bin/deploy.sh). Ce script prepare le
#  serveur (repertoires, runtime.env, secrets) puis deploye la stack portal.
# =============================================================================
set -euo pipefail

# ---- Valeurs de base (surchargeables via l'environnement) -------------------
DOMAIN="${DOMAIN:-portal.axiiomlab.ovh}"
TZ="${TZ:-Europe/Paris}"
HOST_IP="${HOST_IP:-51.68.39.122}"

REPO_URL="https://github.com/4x10m/13_Portal.git"
REPO_DIR=/opt/portal
DATA_ROOT=/opt/portal/data

log() { echo -e "\n\033[1;36m[setup]\033[0m $*"; }

# -----------------------------------------------------------------------------
#  PHASE A : repertoires metier + docker
# -----------------------------------------------------------------------------
phase_a() {
  log "Phase A : repertoires metier"
  mkdir -p "$DATA_ROOT" "$REPO_DIR"

  log "Phase A : docker + compose plugin"
  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  fi
  command -v docker >/dev/null 2>&1 || { echo "docker install failed" >&2; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo "docker compose plugin manquant" >&2; exit 1; }
}

# -----------------------------------------------------------------------------
#  PHASE B : repo + runtime.env + secrets
# -----------------------------------------------------------------------------
prepare_repo() {
  log "Phase B : repo -> $REPO_DIR"
  if [ ! -d "$REPO_DIR/.git" ]; then
    git clone "$REPO_URL" "$REPO_DIR"
  fi
  cd "$REPO_DIR"

  if [ ! -f runtime.env ]; then
    cp runtime.env.example runtime.env
    sed -i "s|^DATA_ROOT=.*|DATA_ROOT=$DATA_ROOT|" runtime.env
    sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" runtime.env
    chmod 600 runtime.env
  fi

  log "Phase B : secrets/portal/stack.env (depuis stack.env.example)"
  mkdir -p secrets/portal
  if [ ! -f secrets/portal/stack.env ]; then
    cp stacks/portal/stack.env.example secrets/portal/stack.env
    chmod 600 secrets/portal/stack.env
    log "secrets/portal/stack.env cree — EDITEZ les valeurs si besoin"
  fi
}

deploy_stacks() {
  log "Phase B : deploy de la stack portal"
  bash bin/deploy.sh portal

  # Ownership du volume data : le conteneur tourne en uid 1001 (nextjs),
  # le bind-mount hote est cree en uid 1000 (debian) -> SQLITE_CANTOPEN sinon.
  # NB: ops (uid 65533) apparait dans les fichiers car sqlite rehash les DB
  # via /proc mount namespace; seul le repertoire doit rester en 1001:1001.
  mkdir -p "$DATA_ROOT/dashboard"
  chown -R 1001:1001 "$DATA_ROOT/dashboard"
}

# -----------------------------------------------------------------------------
#  Tests
# -----------------------------------------------------------------------------
run_tests() {
  log "Tests HTTP (dashboard sur :3223)"
  local paths=(/projets /portal /api/roadmap/projects /api/ops)
  for p in "${paths[@]}"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 8 "http://localhost:3223$p" 2>/dev/null || true)
    printf "  %-28s -> %s\n" "$p" "${code:-ERR}"
  done
}

# -----------------------------------------------------------------------------
main() {
  phase_a
  prepare_repo
  deploy_stacks
  run_tests
  log "Termine. Dashboard: http://localhost:3223 (tailnet: 100.113.28.65:3223)"
}
main "$@"
