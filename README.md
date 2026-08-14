# 13_Portal — Dashboard des services AxiiomLab

Dashboard central (Next.js 16, SQLite) : hub projets/roadmap/tâches, ops
(Prometheus + Docker + Alertmanager + Tailscale), agents OpenCode, DBaaS,
cloud manager, prompt queue. Déployé sous le **modèle upstream-overlay CD** de
`axiiomlab` (cf. `docs/cd-reference.md` dans le dépôt axiiomlab).

## Structure

```
13_Portal/
├── bin/                       # outillage idempotent (modèle CD)
│   ├── lib.sh                 # helpers (env, stacks, staging, compose args)
│   ├── render.sh              # stage + validation compose → .runtime/<stack>.merged.yml
│   ├── deploy.sh              # secrets → seed → stage → valide → up -d
│   ├── bootstrap.sh           # docker + compose plugin + DATA_ROOT
│   ├── status.sh              # état local
│   └── ops.sh                 # CLI serveur (status/health/logs/restart)
├── stacks/portal/             # la stack (core, pas de vendor upstream)
│   ├── stack.conf             # manifeste (VENDOR_COMPOSE)
│   ├── docker-compose.yml     # dashboard (build ../../dashboard)
│   └── stack.env.example      # env → secrets/portal/stack.env
├── secrets.example/           # templates de secrets (commités)
├── runtime.env.example        # config serveur (DATA_ROOT, TZ, DOMAIN, HOST_IP)
├── server/setup.sh            # provisioning serveur + deploy
├── .github/workflows/
│   ├── ci.yml                 # shellcheck + render/validation + gitleaks
│   └── deploy.yml             # dispatch manuel confirmé (OUI) → rsync + deploy
├── dashboard/                 # app Next.js (Dockerfile multi-stage standalone)
├── static-portal/             # portail statique legacy (services.yml + generate_portal.py)
├── dev.sh                     # utilitaires dev (build/up/logs/db/test/worker)
└── prompt-worker.sh           # worker prompt queue (tourne sur l'hôte)
```

## Déploiement (serveur ns3129417 — 51.68.39.122)

| Élément | Valeur |
|---|---|
| Repo | `4x10m/13_Portal` (branch `master`) |
| Cible | `/opt/portal/` (copié **sans `.git`**) |
| Données | `DATA_ROOT=/opt/portal/data` (hors repo, gitignoré) |
| Port | `3223` publié — accès tailnet `http://100.113.28.65:3223` |
| Docker | `docker.sock` monté en lecture seule (découverte des conteneurs) |

```bash
# 1. premier déploiement manuel (sur le serveur)
sudo bash server/setup.sh

# 2. redéploiement
bin/render.sh && bin/deploy.sh portal

# 3. via GitHub Actions (CD continu)
#    Actions → Deploy → inputs: confirm=OUI  (nécessite secrets GH_PAT, SSH_DEPLOY_KEY)
```

Fonctionnalités dépendantes de l'hôte dev (codebase `/home/debian/Codebase`,
DB OpenCode, cloud-manager) : **dégradées** sur le serveur — les routes
retournent proprement 404/[] si les chemins n'existent pas. La découverte
Docker (/api/discover) scanne les conteneurs du serveur.

## Dev (machine locale)

```bash
./dev.sh setup-dev    # deps + .env.local + DB locale
./dev.sh dev-local    # next dev hot-reload sur :3224
./dev.sh build        # docker build (stack stacks/portal)
./dev.sh up           # docker compose up -d (dashboard)
./dev.sh status/test  # santé + smoke tests API
./dev.sh db-pull      # copie la DB du conteneur vers dashboard/data/
```

## Règles d'or

- **Jamais** de secret dans le repo. `runtime.env`, `secrets/`, `data/`,
  `.runtime/` sont gitignorés ; seuls `*.example` sont commités.
- Le dashboard est une **core stack** (compose maison) — pas de vendor
  upstream, donc pas de submodules ni de `bin/update.sh`.
- Les données persistantes vivent dans `${DATA_ROOT}`, jamais dans le repo.

## Source de vérité

- `static-portal/services.yml` — portail statique legacy (Caddy/Tailscale),
  voir `static-portal/README` si besoin de le réactiver.
- Le tailnet Tailscale utilisé : `axiiom.home` (serveur `ns3129417`).
