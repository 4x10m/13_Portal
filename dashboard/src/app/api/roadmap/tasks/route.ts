import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Task, CreateTaskInput } from "@/lib/db/types";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/roadmap/tasks?milestone_id=xxx
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const milestoneId = searchParams.get("milestone_id");

    if (!milestoneId) {
      return NextResponse.json(
        { error: "Le paramètre milestone_id est requis" },
        { status: 400 }
      );
    }

    const db = getDb();
    const tasks = db.prepare(
      "SELECT * FROM tasks WHERE milestone_id = ? ORDER BY sort_order, created_at"
    ).all(milestoneId) as Task[];

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("GET /api/roadmap/tasks error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des tâches" },
      { status: 500 }
    );
  }
}

// POST /api/roadmap/tasks — create a task
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateTaskInput;

    if (!body.milestone_id || body.milestone_id.trim().length === 0) {
      return NextResponse.json(
        { error: "L'identifiant du jalon est requis" },
        { status: 400 }
      );
    }

    if (!body.title || body.title.trim().length === 0) {
      return NextResponse.json(
        { error: "Le titre de la tâche est requis" },
        { status: 400 }
      );
    }

    const validStatuses = ["todo", "in-progress", "done", "blocked"];
    const status = validStatuses.includes(body.status || "") ? body.status! : "todo";

    const id = randomUUID();
    const now = new Date().toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO tasks (id, milestone_id, title, description, status, assignee, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.milestone_id,
      body.title.trim(),
      body.description?.trim() || "",
      status,
      body.assignee?.trim() || "",
      body.sort_order || 0,
      now,
      now
    );

    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task;
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/roadmap/tasks error:", error);
    return NextResponse.json(
      { error: "Échec de la création de la tâche" },
      { status: 500 }
    );
  }
}
