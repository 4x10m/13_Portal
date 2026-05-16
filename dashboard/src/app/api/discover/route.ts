import { NextResponse } from "next/server";
import { getDb, parseProject } from "@/lib/db";
import type { ProjectDB } from "@/lib/db/types";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

// ── Mapping: compose project name → dashboard project name ──
const COMPOSE_PROJECT_MAP: Record<string, string> = {
  homepage: "Homepage Dashboard Hub",
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
};

// ── Domain mapping ──
const PROJECT_DOMAINS: Record<string, string[]> = {
  "Homepage Dashboard Hub": ["homepage.dolly-tilapia.ts.net", "dashboard.dolly-tilapia.ts.net"],
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
};

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

// GET /api/discover — scan Docker, map to projects, update DB
export async function GET() {
  try {
    const db = getDb();
    const containers = getDockerContainers();

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

    // Get existing project names from DB
    const existingRows = db.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
    const existingMap = new Map(existingRows.map((r) => [r.name, r.id]));

    // Create missing projects discovered from Docker
    for (const projectName of Object.keys(projectContainers)) {
      if (!existingMap.has(projectName)) {
        const id = randomUUID();
        const now = new Date().toISOString();
        const category = PROJECT_CATEGORIES[projectName] || "general";
        const desc = PROJECT_DESCRIPTIONS[projectName] || "";
        db.prepare(`
          INSERT INTO projects (id, name, description, status, priority, category, assigned_agent, docker_containers, domains, databases, opencode_sessions, created_at, updated_at)
          VALUES (?, ?, ?, 'in-progress', 'medium', ?, '', '[]', '[]', '[]', '[]', ?, ?)
        `).run(id, projectName, desc, category, now, now);
        existingMap.set(projectName, id);
      }
    }

    // Update resource fields for all projects that have containers
    let updatedCount = 0;
    for (const [projectName, cList] of Object.entries(projectContainers)) {
      const projectId = existingMap.get(projectName);
      if (!projectId) continue;

      const domains = PROJECT_DOMAINS[projectName] || [];
      const databases = detectDatabases(cList);
      const opencodeSessions: string[] = [];

      db.prepare(`
        UPDATE projects
        SET docker_containers = ?, domains = ?, databases = ?, opencode_sessions = ?, updated_at = ?
        WHERE id = ?
      `).run(
        JSON.stringify(cList),
        JSON.stringify(domains),
        JSON.stringify(databases),
        JSON.stringify(opencodeSessions),
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
      mapped_projects: Object.keys(projectContainers).length,
      updated_projects: updatedCount,
      total_projects: parsed.length,
      unmatched_containers: unmatched,
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
