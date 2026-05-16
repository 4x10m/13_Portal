import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Task, UpdateTaskInput } from "@/lib/db/types";

export const dynamic = "force-dynamic";

// PUT /api/roadmap/tasks/[id] — update task
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdateTaskInput;
    const db = getDb();

    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
    }

    const validStatuses = ["todo", "in-progress", "done", "blocked"];
    const title = body.title?.trim() || existing.title;
    const description = body.description !== undefined ? body.description.trim() : existing.description;
    const status = validStatuses.includes(body.status || "") ? body.status! : existing.status;
    const assignee = body.assignee !== undefined ? body.assignee.trim() : existing.assignee;
    const sort_order = body.sort_order !== undefined ? body.sort_order : existing.sort_order;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE tasks SET title = ?, description = ?, status = ?, assignee = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(title, description, status, assignee, sort_order, now, id);

    const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task;
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/roadmap/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour de la tâche" },
      { status: 500 }
    );
  }
}

// DELETE /api/roadmap/tasks/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
    }

    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/roadmap/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression de la tâche" },
      { status: 500 }
    );
  }
}
