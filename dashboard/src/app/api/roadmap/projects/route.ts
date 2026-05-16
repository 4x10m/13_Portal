import { NextResponse } from "next/server";
import { getDb, parseProject, VALID_STATUSES, VALID_PRIORITIES, VALID_CATEGORIES } from "@/lib/db";
import type { ProjectDB, ProjectWithStats, CreateProjectInput, ProjectStatus, ProjectPriority, ProjectCategory } from "@/lib/db/types";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/roadmap/projects — list all projects with stats
export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT p.*,
      COUNT(DISTINCT m.id) as milestone_count,
      COUNT(DISTINCT t.id) as task_count
      FROM projects p
      LEFT JOIN milestones m ON m.project_id = p.id
      LEFT JOIN tasks t ON t.milestone_id = m.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all() as (ProjectDB & { milestone_count: number; task_count: number })[];

    const projects: ProjectWithStats[] = rows.map((r) => {
      const { milestone_count, task_count, ...rest } = r;
      return { ...parseProject(rest), milestone_count, task_count };
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("GET /api/roadmap/projects error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des projets" },
      { status: 500 }
    );
  }
}

// POST /api/roadmap/projects — create a new project
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateProjectInput;

    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "Le nom du projet est requis" },
        { status: 400 }
      );
    }

    const status = VALID_STATUSES.includes(body.status as ProjectStatus) ? body.status! : "idea";
    const priority = VALID_PRIORITIES.includes(body.priority as ProjectPriority) ? body.priority! : "medium";
    const category = VALID_CATEGORIES.includes(body.category as ProjectCategory) ? body.category! : "general";
    const assigned_agent = body.assigned_agent?.trim() || "";
    const docker_containers = JSON.stringify(body.docker_containers || []);
    const domains = JSON.stringify(body.domains || []);
    const databases = JSON.stringify(body.databases || []);
    const opencode_sessions = JSON.stringify(body.opencode_sessions || []);

    const id = randomUUID();
    const now = new Date().toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO projects (id, name, description, status, priority, category, assigned_agent, docker_containers, domains, databases, opencode_sessions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.name.trim(), body.description?.trim() || "", status, priority, category, assigned_agent, docker_containers, domains, databases, opencode_sessions, now, now);

    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectDB;
    return NextResponse.json(parseProject(row), { status: 201 });
  } catch (error) {
    console.error("POST /api/roadmap/projects error:", error);
    return NextResponse.json(
      { error: "Échec de la création du projet" },
      { status: 500 }
    );
  }
}
