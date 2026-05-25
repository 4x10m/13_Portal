# 13_Portal — AxiiomLab Dashboard

Dashboard central pour la gestion des projets, services et infra AxiiomLab.

## Structure

```
13_Portal/
├── dashboard/              # Next.js 16 app (SQLite + better-sqlite3)
│   ├── src/
│   │   ├── app/            # Pages + API routes (13 endpoints)
│   │   ├── components/     # UI components (header, dialogs, panels)
│   │   └── lib/            # DB schema, types, utils
│   ├── Dockerfile          # Multi-stage build (Node 22 Alpine)
│   ├── package.json
│   ├── .env.example        # Template for local dev
│   └── data/               # Local SQLite DB (gitignored)
├── static-portal/          # Legacy static HTML portal (services.yml → index.html)
├── dev.sh                  # Dev utility (15+ commands)
├── prompt-worker.sh        # Prompt queue worker (polls DB → spawns opencode)
├── docker-compose.yml      # Dashboard + Homepage services
├── .env                    # Secrets (gitignored)
└── README.md
```

## Quick Start

### Local dev (hot-reload, no Docker)

```bash
./dev.sh setup-dev     # One-time: install deps + copy DB
./dev.sh dev-local     # Start next dev on :3224
```

### Docker (production)

```bash
./dev.sh deploy        # Build + restart on :3223
./dev.sh logs          # Tail logs
./dev.sh status        # Health check + stats
```

## API Routes

| Endpoint | Description |
|----------|-------------|
| `/api/roadmap/projects` | Projects CRUD + filtering |
| `/api/discover` | Docker container + OpenCode session discovery |
| `/api/ops` | Ops overview (containers, DBs, domains) |
| `/api/prompt-queue` | Prompt queue CRUD (pending/running/done/failed) |
| `/api/prompt-builder` | Build prompts for harness dispatch |
| `/api/agents/list` | Available AI agents/harnesses |
| `/api/projects/[id]/readme` | Project README viewer |
| `/api/projects/[id]/dir` | Project directory browser |
| `/api/cloud-pricing` | Cloud cost tracking (Groudon) |
| `/api/cloud` | Cloud infrastructure status |
| `/api/dbaas` | Database-as-a-service listing |
| `/api/artefacts` | Project artefacts |
| `/api/web-monitor` | Web monitoring |

## dev.sh Commands

| Command | Description |
|---------|-------------|
| `dev-local` | Start `next dev` with hot-reload on :3224 |
| `setup-dev` | One-time setup: npm ci + copy DB + .env.local |
| `build` | Build Docker image |
| `deploy` | Build + restart container (zero-downtime) |
| `up` / `down` | Start/stop all services |
| `restart` | Restart dashboard container |
| `logs` | Tail dashboard logs |
| `ssh` | Shell inside container |
| `status` | Container status + health check + stats |
| `test` | 7 API smoke tests |
| `discover` | Trigger Docker/OpenCode discovery |
| `worker` | Start prompt queue worker |
| `db` | SQLite REPL inside container |
| `db-schema` | Show DB schema |
| `db-stats` | Project/queue counts by status |
| `db-pull` | Copy DB from container for local dev |
| `clean` | Remove caches + rebuild |

## Prompt Queue Worker

`prompt-worker.sh` polls the API for `pending` items and spawns harness sessions:

```bash
./dev.sh worker                           # Start with defaults
DASHBOARD_URL=http://localhost:3223 \
POLL_INTERVAL=10 \
MAX_CONCURRENT=2 \
  ./prompt-worker.sh                      # Custom config
```

- Harnesses: `opencode` (default), `codex`, `claude-code` (stubs)
- Output parsed from `opencode run --format json` → text events
- Status lifecycle: `pending → running → done/failed`

## Legacy Static Portal

The original HTML portal is preserved in `static-portal/`:

- `services.yml` — Service definitions (source of truth for Tailscale services)
- `generate_portal.py` — Generates `index.html` from services.yml
- `index.html` — Deployed to `/var/www/portal/` via Caddy

## Ports

| Service | Port | URL |
|---------|------|-----|
| Dashboard (Docker) | 3223 | `http://localhost:3223` |
| Dashboard (local dev) | 3224 | `http://localhost:3224` |
| Homepage | 3012 | `http://localhost:3012` |

## Tech Stack

- **Next.js 16** (Turbopack) + React 19 + TypeScript
- **better-sqlite3** (WAL mode) — single-file DB
- **Tailwind CSS 4** + shadcn/ui + Lucide icons
- **Docker** — Node 22 Alpine, multi-stage build (~47MB RAM)
