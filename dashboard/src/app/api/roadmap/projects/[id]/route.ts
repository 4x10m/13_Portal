import { NextResponse } from "next/server";
import { getDb, parseProject, VALID_STATUSES, VALID_PRIORITIES, VALID_CATEGORIES } from "@/lib/db";
import type { ProjectDB, MilestoneWithTasks, UpdateProjectInput, Milestone, Task } from "@/lib/db/types";

export const dynamic = "force-dynamic";

// GET /api/roadmap/projects/[id] — single project with milestones + tasks
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectDB | undefined;
    if (!row) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    const project = parseProject(row);

    const milestones = db.prepare(
      "SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at"
    ).all(id) as Milestone[];

    const tasks = db.prepare(
      "SELECT * FROM tasks WHERE milestone_id IN (SELECT id FROM milestones WHERE project_id = ?) ORDER BY sort_order, created_at"
    ).all(id) as Task[];

    const milestonesWithTasks: MilestoneWithTasks[] = milestones.map((m) => ({
      ...m,
      tasks: tasks.filter((t) => t.milestone_id === m.id),
    }));

    return NextResponse.json({ ...project, milestones: milestonesWithTasks });
  } catch (error) {
    console.error("GET /api/roadmap/projects/[id] error:", error);
    return NextResponse.json(
      { error: "Échec du chargement du projet" },
      { status: 500 }
    );
  }
}

// PUT /api/roadmap/projects/[id] — update project
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdateProjectInput;
    const db = getDb();

    const existingRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectDB | undefined;
    if (!existingRow) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    const existing = parseProject(existingRow);

    const name = body.name?.trim() || existing.name;
    const description = body.description !== undefined ? body.description.trim() : existing.description;
    const status = VALID_STATUSES.includes(body.status as any) ? body.status! : existing.status;
    const priority = VALID_PRIORITIES.includes(body.priority as any) ? body.priority! : existing.priority;
    const category = VALID_CATEGORIES.includes(body.category as any) ? body.category! : existing.category;
  const assigned_agent = body.assigned_agent !== undefined ? body.assigned_agent.trim() : existing.assigned_agent;
  const repo_path = body.repo_path !== undefined ? body.repo_path.trim() : existing.repo_path;
  const docker_containers = JSON.stringify(body.docker_containers !== undefined ? body.docker_containers : existing.docker_containers);
    const domains = JSON.stringify(body.domains !== undefined ? body.domains : existing.domains);
    const databases = JSON.stringify(body.databases !== undefined ? body.databases : existing.databases);
    const opencode_sessions = JSON.stringify(body.opencode_sessions !== undefined ? body.opencode_sessions : existing.opencode_sessions);

    const now = new Date().toISOString();
  db.prepare(`
  UPDATE projects SET name = ?, description = ?, status = ?, priority = ?, category = ?, assigned_agent = ?, repo_path = ?, docker_containers = ?, domains = ?, databases = ?, opencode_sessions = ?, updated_at = ?
  WHERE id = ?
  `).run(name, description, status, priority, category, assigned_agent, repo_path, docker_containers, domains, databases, opencode_sessions, now, id);

    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectDB;
    return NextResponse.json(parseProject(row));
  } catch (error) {
    console.error("PUT /api/roadmap/projects/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour du projet" },
      { status: 500 }
    );
  }
}

// DELETE /api/roadmap/projects/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectDB | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }

    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/roadmap/projects/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression du projet" },
      { status: 500 }
    );
  }
}
