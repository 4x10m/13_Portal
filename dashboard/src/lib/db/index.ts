import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { ProjectDB, Project, ProjectStatus, ProjectPriority, ProjectCategory, OpenCodeSession, PromptQueueStatus } from "./types";

const DB_PATH = process.env.DATABASE_PATH || "./data/dashboard.db";

let db: Database.Database | null = null;

// ── Validation constants (single source of truth) ──

export const VALID_STATUSES: ProjectStatus[] = ["idea", "pending", "todo", "in-progress", "on-hold", "blocked", "done"];
export const VALID_PROMPT_STATUSES: PromptQueueStatus[] = ["pending", "running", "done", "failed", "cancelled"];
export const VALID_PRIORITIES: ProjectPriority[] = ["low", "medium", "high", "critical"];
export const VALID_CATEGORIES: ProjectCategory[] = ["infra", "ai", "apps", "perso", "devops", "general"];

// ── Parse JSON fields from DB row to Project ──

export function parseProject(row: ProjectDB): Project {
  let docker_containers: string[] = [];
  let domains: string[] = [];
  let databases: { type: string; name: string }[] = [];
  let opencode_sessions: OpenCodeSession[] = [];
  try { docker_containers = JSON.parse(row.docker_containers || "[]"); } catch { /* */ }
  try { domains = JSON.parse(row.domains || "[]"); } catch { /* */ }
  try { databases = JSON.parse(row.databases || "[]"); } catch { /* */ }
  try {
    const raw = JSON.parse(row.opencode_sessions || "[]");
    // Handle both old format (string[]) and new format (OpenCodeSession[])
    if (raw.length > 0 && typeof raw[0] === "string") {
      opencode_sessions = [];
    } else {
      opencode_sessions = raw;
    }
  } catch { /* */ }
  const { docker_containers: _dc, domains: _dm, databases: _db, opencode_sessions: _oc, ...rest } = row;
  return { ...rest, docker_containers, domains, databases, opencode_sessions };
}

// ── Schema ──

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'idea',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT DEFAULT 'general',
  assigned_agent TEXT DEFAULT '',
  repo_path TEXT DEFAULT '',
  docker_containers TEXT DEFAULT '[]',
  domains TEXT DEFAULT '[]',
  databases TEXT DEFAULT '[]',
  opencode_sessions TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  due_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  assignee TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

  CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_queue (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT,
  target_cwd TEXT,
  target_model TEXT NOT NULL DEFAULT 'default',
  harness_type TEXT NOT NULL DEFAULT 'opencode',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);
`;

/** Migrate existing DB — add new columns if missing */
function migrate(database: Database.Database) {
  const columns = database.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has("assigned_agent")) {
    database.exec("ALTER TABLE projects ADD COLUMN assigned_agent TEXT DEFAULT ''");
  }
  if (!colNames.has("docker_containers")) {
    database.exec("ALTER TABLE projects ADD COLUMN docker_containers TEXT DEFAULT '[]'");
  }
  if (!colNames.has("domains")) {
    database.exec("ALTER TABLE projects ADD COLUMN domains TEXT DEFAULT '[]'");
  }
  if (!colNames.has("databases")) {
    database.exec("ALTER TABLE projects ADD COLUMN databases TEXT DEFAULT '[]'");
  }
  if (!colNames.has("opencode_sessions")) {
    database.exec("ALTER TABLE projects ADD COLUMN opencode_sessions TEXT DEFAULT '[]'");
  }
  if (!colNames.has("repo_path")) {
    database.exec("ALTER TABLE projects ADD COLUMN repo_path TEXT DEFAULT ''");
  }

  // Migrate prompt_queue — add harness_type if missing
  const pqColumns = database.prepare("PRAGMA table_info(prompt_queue)").all() as { name: string }[];
  const pqColNames = new Set(pqColumns.map((c) => c.name));
  if (!pqColNames.has("harness_type")) {
    database.exec("ALTER TABLE prompt_queue ADD COLUMN harness_type TEXT NOT NULL DEFAULT 'opencode'");
  }
}

function getDb(): Database.Database {
  if (db) return db;

  // Ensure the data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Execute schema (CREATE TABLE IF NOT EXISTS — idempotent)
  db.exec(SCHEMA);

  // Run migrations for existing DBs
  migrate(db);

  return db;
}

export { getDb };
