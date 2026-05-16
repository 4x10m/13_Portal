import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Milestone, UpdateMilestoneInput } from "@/lib/db/types";

export const dynamic = "force-dynamic";

// PUT /api/roadmap/milestones/[id] — update milestone
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdateMilestoneInput;
    const db = getDb();

    const existing = db.prepare("SELECT * FROM milestones WHERE id = ?").get(id) as Milestone | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Jalon introuvable" }, { status: 404 });
    }

    const validStatuses = ["pending", "in-progress", "done"];
    const title = body.title?.trim() || existing.title;
    const description = body.description !== undefined ? body.description.trim() : existing.description;
    const status = validStatuses.includes(body.status || "") ? body.status! : existing.status;
    const due_date = body.due_date !== undefined ? body.due_date : existing.due_date;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE milestones SET title = ?, description = ?, status = ?, due_date = ?, updated_at = ?
      WHERE id = ?
    `).run(title, description, status, due_date, now, id);

    const updated = db.prepare("SELECT * FROM milestones WHERE id = ?").get(id) as Milestone;
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/roadmap/milestones/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour du jalon" },
      { status: 500 }
    );
  }
}

// DELETE /api/roadmap/milestones/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare("SELECT * FROM milestones WHERE id = ?").get(id) as Milestone | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Jalon introuvable" }, { status: 404 });
    }

    db.prepare("DELETE FROM milestones WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/roadmap/milestones/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression du jalon" },
      { status: 500 }
    );
  }
}
