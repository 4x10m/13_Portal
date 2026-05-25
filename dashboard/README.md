# Dashboard AxiiomLab — Next.js 16

Hub central de gestion des projets et opérations infra.

## Structure

```
src/
├── app/
│   ├── projets/page.tsx      # Hub principal (grille/kanban/timeline)
│   ├── layout.tsx            # Root layout + Toaster sonner
│   └── api/                  # 15 routes API
│       ├── roadmap/          # CRUD projects/milestones/tasks/links (SQLite)
│       ├── ops/              # Agrégation Prometheus+Docker+Alertmanager+Tailscale
│       ├── agents/           # Sessions OpenCode
│       ├── dbaas/            # Postgres/MongoDB/Valkey status
│       ├── cloud/            # Cloud Manager pool/devices/credentials
│       └── opencode/         # Containers, overview, stats, predictions
├── components/
│   ├── project-detail-dialog.tsx   # Détail projet + CRUD jalons/tâches/liens
│   ├── new-project-dialog.tsx      # Création projet
│   ├── panels/                     # 4 panneaux modaux (Ops, Agents, DBaaS, Cloud)
│   └── ui/                         # Composants shadcn/ui
├── lib/
│   ├── db/index.ts           # getDb() + schema + migrate() + parseProject() + VALID_*
│   ├── db/types.ts           # Types Project/Milestone/Task/Link
│   └── types/ops.tsx         # Types Ops partagés + pctBar()
└── app/globals.css           # Theme dark + animations cardFadeIn
```

## Dev

```bash
npm run dev          # http://localhost:3000
npm run build        # Production build (standalone)
```

## Déploiement

```bash
cd /home/debian/Codebase/1_infra/26_Homepage
docker compose build dashboard && docker compose up -d dashboard
```

Container : `axiiomlab-dashboard`, port 3223→3000, ~50-65MB RAM.
DB SQLite : volume `dashboard-data` → `/app/data/dashboard.db`.

## Features

| Feature | Implémentation |
|---------|---------------|
| 3 vues (Grille/Kanban/Timeline) | `viewMode` state + composants dédiés |
| Drag & Drop Kanban | HTML5 DnD natif → PUT `/api/roadmap/projects/[id]` |
| Filtres (catégorie/statut/priorité/recherche) | States + `filteredProjects` chain |
| Tri (nom/priorité/date/jalons) | `sortBy`+`sortDir` + `sortedProjects` |
| KPI cliquables | `OpsKPIBandeau` → `onKpiClick` → `OpsPanel.defaultView` |
| Activité récente | `ActivityTimeline` avec `relativeTime()` |
| Toast notifications | `sonner` v2 sur tous les handlers CRUD |
| Animations | `cardFadeIn` keyframe + stagger delay |
