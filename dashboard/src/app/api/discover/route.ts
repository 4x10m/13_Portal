import { NextResponse } from "next/server";
import { getDb, parseProject } from "@/lib/db";
import type { ProjectDB } from "@/lib/db/types";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

// ── Mapping: compose project name → dashboard project name ──
const COMPOSE_PROJECT_MAP: Record<string, string> = {
  homepage: "Portal Dashboard Hub",
  portal: "Portal Dashboard Hub",
  "1_cloud_manager": "Cloud Manager — CLI Unifié",
  "opencode-communautary": "AI Stack — Forgejo + Woodpecker + Agents",
  "opencode-light": "AI Stack — Forgejo + Woodpecker + Agents",
  "opencode-mcp": "AI Stack — Forgejo + Woodpecker + Agents",
  deploy: "AI Stack — Forgejo + Woodpecker + Agents",
  woodpecker: "AI Stack — Forgejo + Woodpecker + Agents",
  appwrite: "Appwrite — Backend-as-a-Service",
  socialite: "Socialite — App Sociale",
  booker: "Booker — Réservation",
  "prompt-builder": "Prompt Builder — Éditeur de Prompts",
  "00_v6_hyperactive": "Hyperactive — Agent Autonome",
  "00_v3-assistant": "Unified Agent — Assistant IA",
  "tor-onion": "Tor — Onion Proxy",
  backend: "Soron — Backend API",
  "04-open-webui-ollama": "Open WebUI — Interface LLM",
};

// ── Mapping: container name pattern → dashboard project name ──
const CONTAINER_NAME_MAP: [RegExp, string][] = [
  [/grafana/i, "Monitoring — Prometheus + Grafana + Loki"],
  [/alertmanager/i, "Monitoring — Prometheus + Grafana + Loki"],
  [/node-exporter/i, "Monitoring — Prometheus + Grafana + Loki"],
  [/promtail/i, "Monitoring — Prometheus + Grafana + Loki"],
  [/prometheus/i, "Monitoring — Prometheus + Grafana + Loki"],
  [/wg-easy/i, "WG-Easy — VPN WireGuard"],
  [/docker-minio/i, "MinIO Backup — Tour 8To"],
  [/minio/i, "MinIO Backup — Tour 8To"],
  [/traefik/i, "Proxy Auth — Caddy + Authelia"],
  [/meilisearch/i, "Meilisearch — Moteur de Recherche"],
  [/registry/i, "Docker Registry — Images Privées"],
  [/delivery_api/i, "T2R — Delivery API"],
  [/tor-nginx/i, "Tor — Onion Proxy"],
];

// ── Repo path for new projects (relative to CODEBASE_DIR) ──
const PROJECT_REPO_PATHS: Record<string, string> = {
  "Portal Dashboard Hub": "1_infra/13_Portal",
  "Cloud Manager — CLI Unifié": "1_infra/1_cloud_manager",
  "Proxy Auth — Caddy + Authelia": "1_infra/10_Proxy",
  "AI Stack — Forgejo + Woodpecker + Agents": "2_ai-stack",
  "Monitoring — Prometheus + Grafana + Loki": "1_infra/12_Monitoring",
  "MinIO Backup — Tour 8To": "1_infra/21_Tour",
  "Tailscale — Mesh VPN": "1_infra/25_Tailscale",
  "Watchdog — Heartbeat OVH": "1_infra/remote-watchdog",
  "Security Audit — Hardening": "1_infra/security-audit",
  "Optimization — Cleanup Dedi": "1_infra/optimization",
  "Infra — Ops OVH": "1_infra",
  "Appwrite — Backend-as-a-Service": "3_perso/5_appwrite",
  "Socialite — App Sociale": "3_perso/7_socialite",
  "Booker — Réservation": "3_perso/4_booker",
  "Prompt Builder — Éditeur de Prompts": "2_ai-stack/6_tools/1_router",
  "Hyperactive — Agent Autonome": "2_ai-stack/7_roles/00_v6",
  "Unified Agent — Assistant IA": "2_ai-stack/7_roles/00_v3",
  "Tor — Onion Proxy": "3_perso/tor-onion",
  "RAGFlow — Pipeline Documentaire": "2_ai-stack/6_tools/3_rag",
  "Soron — Backend API": "3_perso/1_T2R",
  "Open WebUI — Interface LLM": "2_ai-stack/4_frameworks/ai-test-lab",
  "WG-Easy — VPN WireGuard": "1_infra/wg-easy",
  "Meilisearch — Moteur de Recherche": "2_ai-stack/6_tools/1_router",
  "Docker Registry — Images Privées": "1_infra/registry",
  "T2R — Delivery API": "3_perso/1_T2R",
  "Groudon — Web Crawler": "3_perso/3_Groudon",
  "Meta Harness — LLM Benchmarks": "2_ai-stack/6_tools/9_meta-harness",
  "Memory — Agent Memory Store": "2_ai-stack/6_tools/2_memory",
  "ExoCog — IA Cognitive": "Working/50_4x10m/33_ExoCog",
};

// ── Category for new projects ──
const PROJECT_CATEGORIES: Record<string, string> = {
  "Appwrite — Backend-as-a-Service": "ai",
  "Socialite — App Sociale": "apps",
  "Booker — Réservation": "apps",
  "Prompt Builder — Éditeur de Prompts": "ai",
  "Hyperactive — Agent Autonome": "ai",
  "Unified Agent — Assistant IA": "ai",
  "Tor — Onion Proxy": "infra",
  "RAGFlow — Pipeline Documentaire": "ai",
  "Soron — Backend API": "apps",
  "Open WebUI — Interface LLM": "ai",
  "WG-Easy — VPN WireGuard": "infra",
  "Meilisearch — Moteur de Recherche": "ai",
  "Docker Registry — Images Privées": "devops",
  "T2R — Delivery API": "apps",
  "Portal Dashboard Hub": "infra",
  "Infra — Ops OVH": "infra",
  "AI Test Lab — Expérimentations": "ai",
  "MCP Servers — Tool Bridge": "ai",
  "LiteLLM — Proxy Modèles": "ai",
  "Youtuber — Automation": "perso",
  "Watchdog — Heartbeat OVH": "infra",
  "Security Audit — Hardening": "infra",
  "Optimization — Cleanup Dedi": "infra",
  "Tailscale — Mesh VPN": "infra",
  "Groudon — Web Crawler": "perso",
  "Meta Harness — LLM Benchmarks": "ai",
  "Memory — Agent Memory Store": "ai",
  "ExoCog — IA Cognitive": "ai",
};

// ── CWD → project name mapping (for OpenCode sessions) ──
// ORDER MATTERS: more specific patterns MUST come before broader ones
const CWD_PROJECT_MAP: [RegExp, string][] = [
  // ── Infra (1_infra) — specific before broad ──
  [/1_infra\/13_Portal/i, "Portal Dashboard Hub"],
  [/1_infra\/26_Homepage/i, "Portal Dashboard Hub"],
  [/1_infra\/14_CLI/i, "Cloud Manager — CLI Unifié"],
  [/1_infra\/1_cloud_manager/i, "Cloud Manager — CLI Unifié"],
  [/1_infra\/10_Proxy/i, "Proxy Auth — Caddy + Authelia"],
  [/1_infra\/11_Git-CI/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/1_infra\/12_Monitoring/i, "Monitoring — Prometheus + Grafana + Loki"],
  [/1_infra\/21_Tour/i, "MinIO Backup — Tour 8To"],
  [/1_infra\/25_Tailscale/i, "Tailscale — Mesh VPN"],
  [/1_infra\/remote-watchdog/i, "Watchdog — Heartbeat OVH"],
  [/1_infra\/security-audit/i, "Security Audit — Hardening"],
  [/1_infra\/optimization/i, "Optimization — Cleanup Dedi"],
  [/1_infra$/i, "Infra — Ops OVH"],               // root 1_infra (32 sessions)
  // ── AI Stack (2_ai-stack) — specific before broad ──
  [/2_ai-stack\/7_roles\/00_v6/i, "Hyperactive — Agent Autonome"],
  [/2_ai-stack\/7_roles\/00_v3/i, "Unified Agent — Assistant IA"],
  [/2_ai-stack\/7_roles\/00_v4/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/2_ai-stack\/7_roles/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/2_ai-stack\/11_ragflow/i, "RAGFlow — Pipeline Documentaire"],
  [/2_ai-stack.*open-webui/i, "Open WebUI — Interface LLM"],
  [/2_ai-stack\/4_frameworks\/ai-test-lab/i, "AI Test Lab — Expérimentations"],
  [/2_ai-stack\/4_frameworks\/opencode-communautary/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/2_ai-stack\/6_tools\/4_mcp/i, "MCP Servers — Tool Bridge"],
  [/2_ai-stack\/6_tools\/4_llm-provider/i, "LiteLLM — Proxy Modèles"],
  [/2_ai-stack\/6_tools\/3_rag/i, "RAGFlow — Pipeline Documentaire"],
  [/2_ai-stack\/6_tools\/1_router/i, "LiteLLM — Proxy Modèles"],
  [/2_ai-stack\/6_tools\/9_meta-harness/i, "Meta Harness — LLM Benchmarks"],
  [/2_ai-stack\/6_tools\/2_memory/i, "Memory — Agent Memory Store"],
  [/2_ai-stack/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  // ── Perso (3_perso) — specific before broad ──
  [/3_perso\/3_Groudon/i, "Groudon — Web Crawler"],
  [/3_perso\/4_trading/i, "T2R — Delivery API"],
  [/3_perso\/1_T2R/i, "T2R — Delivery API"],
  [/3_perso\/5_appwrite/i, "Appwrite — Backend-as-a-Service"],
  [/3_perso\/7_socialite/i, "Socialite — App Sociale"],
  [/3_perso\/socialite/i, "Socialite — App Sociale"],
  [/3_perso\/4_booker/i, "Booker — Réservation"],
  [/3_perso\/youtuber/i, "Youtuber — Automation"],
  // ── Working/46_Autonomous — specific before broad Working ──
  [/Working\/46_Autonomous\/6_tools\/3_RAG-Sources/i, "RAGFlow — Pipeline Documentaire"],
  [/Working\/46_Autonomous\/4_frameworks\/opencode-communautary/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/Working\/46_Autonomous\/6_tools\/9_agent-benchmark/i, "Meta Harness — LLM Benchmarks"],
  [/Working\/46_Autonomous\/4_frameworks\/my-harness/i, "Meta Harness — LLM Benchmarks"],
  [/Working\/46_Autonomous\/7_roles\/00_v4/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/Working\/46_Autonomous\/7_roles\/00_v3/i, "Unified Agent — Assistant IA"],
  [/Working\/46_Autonomous\/7_roles\/00_v6/i, "Hyperactive — Agent Autonome"],
  [/Working\/46_Autonomous\/6_tools\/0_searcher/i, "MCP Servers — Tool Bridge"],
  [/Working\/46_Autonomous\/5_fine-tunning/i, "AI Test Lab — Expérimentations"],
  [/Working\/46_Autonomous\/fine-tunning/i, "AI Test Lab — Expérimentations"],
  [/Working\/00_Inbox/i, "Infra — Ops OVH"],
  [/Working\/46_Autonomous/i, "AI Test Lab — Expérimentations"],
  // ── Working/50_4x10m ──
  [/Working\/50_4x10m\/my_human/i, "ExoCog — IA Cognitive"],
  [/Working\/50_4x10m\/33_ExoCog/i, "ExoCog — IA Cognitive"],
  [/Working\/50_4x10m\/9_sql_human_brain/i, "ExoCog — IA Cognitive"],
  [/Working\/50_4x10m\/9_human_brain/i, "ExoCog — IA Cognitive"],
  [/Working\/50_4x10m/i, "ExoCog — IA Cognitive"],
  // ── Working/31_Axiiomlab ──
  [/Working\/31_Axiiomlab\/remote-watchdog/i, "Watchdog — Heartbeat OVH"],
  [/Working\/31_Axiiomlab/i, "Infra — Ops OVH"],
  // ── Other Working paths ──
  [/Working\/03_BASB/i, "Infra — Ops OVH"],
  [/Working\/cloud_manager/i, "Cloud Manager — CLI Unifié"],
  [/Working\/daily-reconstruction/i, "Infra — Ops OVH"],
  [/Working\/3_perso\/4_trading/i, "T2R — Delivery API"],
  // ── Codebase extras ──
  [/Codebase\/3_perso\/3_ExoCog/i, "ExoCog — IA Cognitive"],
  [/Codebase\/0_conception/i, "Infra — Ops OVH"],
  [/^\/home\/debian\/Working$/i, "Infra — Ops OVH"],
  // ── Home / root Codebase ──
  [/Codebase$/i, "Infra — Ops OVH"],
  // ── Bare /home/debian and /workspace (container CWDs) ──
  [/^\/home\/debian$/i, "Infra — Ops OVH"],
  [/^\/workspace$/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  // ── OpenCode internal paths ──
  [/\.opencode/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/\.openclaw/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/\.config\/opencode/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/\.context-api/i, "RAGFlow — Pipeline Documentaire"],
  [/openwrk-workspace/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/openwork-workspace/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/ia-memory-rnd/i, "Memory — Agent Memory Store"],
  [/opencode-daemon/i, "AI Stack — Forgejo + Woodpecker + Agents"],
  [/^\/tmp$/i, "AI Test Lab — Expérimentations"],
];

// ── Domain mapping ──
const PROJECT_DOMAINS: Record<string, string[]> = {
  "Portal Dashboard Hub": ["homepage.dolly-tilapia.ts.net", "dashboard.dolly-tilapia.ts.net"],
  "Cloud Manager — CLI Unifié": ["cloud.dolly-tilapia.ts.net"],
  "AI Stack — Forgejo + Woodpecker + Agents": [
    "forgejo.dolly-tilapia.ts.net",
    "woodpecker.dolly-tilapia.ts.net",
    "litellm.dolly-tilapia.ts.net",
  ],
  "Appwrite — Backend-as-a-Service": ["appwrite.dolly-tilapia.ts.net"],
  "Open WebUI — Interface LLM": ["openwebui.dolly-tilapia.ts.net"],
  "Monitoring — Prometheus + Grafana + Loki": ["grafana.dolly-tilapia.ts.net"],
  "MinIO Backup — Tour 8To": ["minio.dolly-tilapia.ts.net"],
  "Soron — Backend API": ["soron.dolly-tilapia.ts.net"],
  "Prompt Builder — Éditeur de Prompts": ["promptbuilder.dolly-tilapia.ts.net"],
  "WG-Easy — VPN WireGuard": ["wg.dolly-tilapia.ts.net"],
  "Meilisearch — Moteur de Recherche": ["meilisearch.dolly-tilapia.ts.net"],
  "Proxy Auth — Caddy + Authelia": ["auth.dolly-tilapia.ts.net"],
};

// ── Description templates ──
const PROJECT_DESCRIPTIONS: Record<string, string> = {
  "Appwrite — Backend-as-a-Service": "Backend-as-a-Service auto-hébergé — auth, DB, storage, functions",
  "Socialite — App Sociale": "Application sociale — frontend + API",
  "Booker — Réservation": "Système de réservation — booking engine",
  "Prompt Builder — Éditeur de Prompts": "Éditeur de prompts LLM avec templates et preview",
  "Hyperactive — Agent Autonome": "Agent autonome de modification de codebase avec Telegram/LLM",
  "Unified Agent — Assistant IA": "Assistant IA unifié — Telegram/Mattermost interfaces",
  "Tor — Onion Proxy": "Proxy Tor Onion — service anonyme",
  "RAGFlow — Pipeline Documentaire": "Pipeline RAG documentaire — ingestion, chunking, retrieval",
  "Soron — Backend API": "Backend API Soron — PostgREST + PostgreSQL",
  "Open WebUI — Interface LLM": "Interface web pour modèles LLM — Ollama/OpenAI compatible",
  "WG-Easy — VPN WireGuard": "Interface web de gestion WireGuard VPN",
  "Meilisearch — Moteur de Recherche": "Moteur de recherche full-text Meilisearch",
  "Docker Registry — Images Privées": "Registry Docker privé pour images custom",
  "T2R — Delivery API": "API de livraison — PostgREST + PostgreSQL",
  "Portal Dashboard Hub": "Dashboard central AxiiomLab — projets, ops, ressources, monitoring",
  "Infra — Ops OVH": "Infrastructure OVH dédiée — scripts, config, sécurité, optimisation",
  "AI Test Lab — Expérimentations": "Lab d'expérimentations IA — tests modèles, benchmarks, protos",
  "MCP Servers — Tool Bridge": "Serveurs MCP — bridge tools LLM ↔ APIs externes",
  "LiteLLM — Proxy Modèles": "Proxy unifié LLM — routing, rate-limit, multi-provider",
  "Youtuber — Automation": "Automation YouTube — transcripts, shorts, upload",
  "Watchdog — Heartbeat OVH": "Heartbeat serveur + client macOS + reboot auto OVH",
  "Security Audit — Hardening": "Audit & hardening — fail2ban, rkhunter, UFW, auditd",
  "Optimization — Cleanup Dedi": "Nettoyage & optimisation serveur dédié OVH",
  "Tailscale — Mesh VPN": "Mesh VPN Tailscale — 38 services, config, restore",
  "Groudon — Web Crawler": "Crawler web Groudon — monitoring sites, scoring, pricing data",
  "Meta Harness — LLM Benchmarks": "Harness de benchmarks LLM — évaluation, comparaison modèles",
  "Memory — Agent Memory Store": "Store mémoire pour agents IA — persistance contextuelle",
  "ExoCog — IA Cognitive": "IA cognitive — modélisation cerveau humain, SQL brain, ExoCog",
};

// ── OpenCode session fetcher (reads directly from SQLite DB) ──
interface OpenCodeSessionAPI {
  id: string;
  title: string;
  slug: string;
  cwd: string;
  flavor: string;
  model: string;
  message_count: number;
  is_active: boolean;
  is_recent: boolean;
  is_pinned: boolean;
  time_created: number;
  time_updated: number;
}

function getOpenCodeSessions(): OpenCodeSessionAPI[] {
  try {
    const srcPath = process.env.OPENCODE_DB_PATH || "/home/debian/.local/share/opencode/opencode.db";
    const Database = require("better-sqlite3");
    // Open readonly — WAL is handled internally by better-sqlite3
    // No need to copy: readonly mode works even with WAL present
    const ocDb = new Database(srcPath, { readonly: true });

    const now = Date.now();
    const oneDay = 86_400_000;
    // Lightweight query — skip JOIN with messages to avoid OOM on 1.3GB DB
    const rows = ocDb.prepare(`
      SELECT s.id, s.title, s.slug, s.directory as cwd, s.model, s.time_created, s.time_updated
      FROM session s
      WHERE s.time_archived IS NULL
      ORDER BY s.time_updated DESC
    `).all() as Array<{
      id: string; title: string; slug: string; cwd: string; model: string;
      time_created: number; time_updated: number;
    }>;
    ocDb.close();

    return rows.map((r: any) => {
      let modelId = "";
      try { modelId = JSON.parse(r.model || "{}").id || ""; } catch { modelId = r.model || ""; }
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        cwd: r.cwd,
        flavor: "",
        model: modelId,
        message_count: 0,
        is_active: (now - r.time_updated) < oneDay,
        is_recent: (now - r.time_updated) < 7 * oneDay,
        is_pinned: false,
        time_created: r.time_created,
        time_updated: r.time_updated,
      };
    });
  } catch (e) {
    console.error("OpenCode DB read error:", e);
    return [];
  }
}

function resolveProjectByCwd(cwd: string): string | null {
  for (const [pattern, projectName] of CWD_PROJECT_MAP) {
    if (pattern.test(cwd)) return projectName;
  }
  return null;
}

// ── Database detection from container names ──
function detectDatabases(containers: string[]): { type: string; name: string }[] {
  const dbs: { type: string; name: string }[] = [];
  for (const c of containers) {
    if (c.includes("mariadb") || c.includes("mysql")) dbs.push({ type: "mariadb", name: c });
    else if (c.includes("redis")) dbs.push({ type: "redis", name: c });
    else if (c.includes("postgres") || c.includes("postgrest")) dbs.push({ type: "postgresql", name: c });
    else if (c.includes("meilisearch")) dbs.push({ type: "meilisearch", name: c });
    else if (c.includes("minio")) dbs.push({ type: "minio", name: c });
  }
  return dbs;
}

interface DockerContainer {
  Names: string[];
  State: string;
  Status: string;
  Image: string;
  Labels: Record<string, string>;
  Ports: { PrivatePort?: number; PublicPort?: number; Type: string }[];
}

function getDockerContainers(): DockerContainer[] {
  try {
    const raw = execSync(
      'curl -s --unix-socket /var/run/docker.sock http://localhost/containers/json',
      { timeout: 5000, encoding: "utf-8" }
    );
    return JSON.parse(raw) as DockerContainer[];
  } catch {
    return [];
  }
}

// Resolve container name to dashboard project
function resolveProject(name: string, composeProject: string): string | null {
  // 1. Try compose project map first (exact match)
  if (composeProject && COMPOSE_PROJECT_MAP[composeProject]) {
    return COMPOSE_PROJECT_MAP[composeProject];
  }
  // 2. Try container name patterns
  for (const [pattern, projectName] of CONTAINER_NAME_MAP) {
    if (pattern.test(name)) return projectName;
  }
  // 3. Try compose project name as fuzzy match
  if (composeProject) {
    const slug = composeProject.toLowerCase().replace(/[^a-z0-9]/g, "");
    const allProjects = Object.values(COMPOSE_PROJECT_MAP);
    for (const pn of allProjects) {
      const pslug = pn.split(" — ")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      if (slug.includes(pslug.substring(0, 5)) || pslug.includes(slug.substring(0, 5))) {
        return pn;
      }
    }
  }
  return null;
}

// GET /api/discover — scan Docker + OpenCode sessions, map to projects, update DB
export async function GET() {
  try {
    const db = getDb();

    // ── Migrate renamed projects ──
    const RENAMED_PROJECTS: Record<string, string> = {
      "Homepage Dashboard Hub": "Portal Dashboard Hub",
    };
    for (const [oldName, newName] of Object.entries(RENAMED_PROJECTS)) {
      const old = db.prepare("SELECT id FROM projects WHERE name = ?").get(oldName) as { id: string } | undefined;
      const nw = db.prepare("SELECT id FROM projects WHERE name = ?").get(newName) as { id: string } | undefined;
      if (old && nw) {
        // Merge: move milestones/links to new, delete old
        db.prepare("UPDATE milestones SET project_id = ? WHERE project_id = ?").run(nw.id, old.id);
        db.prepare("UPDATE links SET project_id = ? WHERE project_id = ?").run(nw.id, old.id);
        db.prepare("DELETE FROM projects WHERE id = ?").run(old.id);
      } else if (old && !nw) {
        db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(newName, new Date().toISOString(), old.id);
      }
    }

    const containers = getDockerContainers();
    const opencodeSessions = getOpenCodeSessions();

    // Group containers by dashboard project name
    const projectContainers: Record<string, string[]> = {};
    const unmatched: string[] = [];

    for (const c of containers) {
      const rawName = c.Names?.[0] || "";
      const name = rawName.replace(/^\//, "");
      const composeProject = c.Labels?.["com.docker.compose.project"] || "";
      const projectName = resolveProject(name, composeProject);

      if (projectName) {
        if (!projectContainers[projectName]) projectContainers[projectName] = [];
        if (!projectContainers[projectName].includes(name)) {
          projectContainers[projectName].push(name);
        }
      } else {
        unmatched.push(name);
      }
    }

    // Group OpenCode sessions by project name (via cwd mapping)
    const projectSessions: Record<string, OpenCodeSessionAPI[]> = {};
    const unmatchedSessions: string[] = [];

    for (const s of opencodeSessions) {
      const projectName = resolveProjectByCwd(s.cwd);
      if (projectName) {
        if (!projectSessions[projectName]) projectSessions[projectName] = [];
        projectSessions[projectName].push(s);
      } else {
        unmatchedSessions.push(`${s.title} (${s.cwd})`);
      }
    }

    // Get existing project names from DB
    const existingRows = db.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
    const existingMap = new Map(existingRows.map((r) => [r.name, r.id]));

    // Create missing projects discovered from Docker OR OpenCode
    const allDiscovered = new Set([...Object.keys(projectContainers), ...Object.keys(projectSessions)]);
    for (const projectName of allDiscovered) {
      if (!existingMap.has(projectName)) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const category = PROJECT_CATEGORIES[projectName] || "general";
    const desc = PROJECT_DESCRIPTIONS[projectName] || "";
    const repoPath = PROJECT_REPO_PATHS[projectName] || "";
    db.prepare(`
      INSERT INTO projects (id, name, description, status, priority, category, assigned_agent, repo_path, docker_containers, domains, databases, opencode_sessions, created_at, updated_at)
      VALUES (?, ?, ?, 'in-progress', 'medium', ?, '', ?, '[]', '[]', '[]', '[]', ?, ?)
    `).run(id, projectName, desc, category, repoPath, now, now);
        existingMap.set(projectName, id);
      }
    }

  // Backfill repo_path for existing projects that don't have one yet
  for (const [projectName, repoPath] of Object.entries(PROJECT_REPO_PATHS)) {
    const projectId = existingMap.get(projectName);
    if (!projectId) continue;
    db.prepare(`UPDATE projects SET repo_path = ? WHERE id = ? AND (repo_path IS NULL OR repo_path = '')`).run(repoPath, projectId);
  }

  // Update resource fields for all projects
  let updatedCount = 0;
  for (const [projectName, cList] of Object.entries(projectContainers)) {
    const projectId = existingMap.get(projectName);
    if (!projectId) continue;

    const domains = PROJECT_DOMAINS[projectName] || [];
    const databases = detectDatabases(cList);
    const sessions = (projectSessions[projectName] || []).map((s) => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      cwd: s.cwd,
      flavor: s.flavor,
      model: s.model,
      message_count: s.message_count,
      is_active: s.is_active,
      is_recent: s.is_recent,
      is_pinned: s.is_pinned,
      time_created: s.time_created,
      time_updated: s.time_updated,
    }));

    db.prepare(`
      UPDATE projects
      SET docker_containers = ?, domains = ?, databases = ?, opencode_sessions = ?, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(cList),
      JSON.stringify(domains),
      JSON.stringify(databases),
      JSON.stringify(sessions),
      new Date().toISOString(),
      projectId
    );
    updatedCount++;
  }

  // Also update sessions for projects that have sessions but no containers
  for (const [projectName, sessions] of Object.entries(projectSessions)) {
    if (projectContainers[projectName]) continue; // already updated above
    const projectId = existingMap.get(projectName);
    if (!projectId) continue;

    const sessionData = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      cwd: s.cwd,
      flavor: s.flavor,
      model: s.model,
      message_count: s.message_count,
      is_active: s.is_active,
      is_recent: s.is_recent,
      is_pinned: s.is_pinned,
      time_created: s.time_created,
      time_updated: s.time_updated,
    }));

    db.prepare(`
      UPDATE projects
      SET opencode_sessions = ?, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(sessionData),
      new Date().toISOString(),
      projectId
    );
    updatedCount++;
  }

    // Return summary
    const projects = db.prepare("SELECT * FROM projects ORDER BY name").all() as ProjectDB[];
    const parsed = projects.map(parseProject);

    return NextResponse.json({
      scanned_containers: containers.length,
      scanned_sessions: opencodeSessions.length,
      mapped_projects: Object.keys(projectContainers).length,
      sessions_mapped: Object.keys(projectSessions).length,
      updated_projects: updatedCount,
      total_projects: parsed.length,
      unmatched_containers: unmatched,
      unmatched_sessions: unmatchedSessions,
      projects: parsed,
    });
  } catch (error) {
    console.error("GET /api/discover error:", error);
    return NextResponse.json(
      { error: "Échec de la découverte Docker", details: String(error) },
      { status: 500 }
    );
  }
}
