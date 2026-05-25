import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Milestone, CreateMilestoneInput } from "@/lib/db/types";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/roadmap/milestones?project_id=xxx
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");

    if (!projectId) {
      return NextResponse.json(
        { error: "Le paramètre project_id est requis" },
        { status: 400 }
      );
    }

    const db = getDb();
    const milestones = db.prepare(
      "SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at"
    ).all(projectId) as Milestone[];

    return NextResponse.json(milestones);
  } catch (error) {
    console.error("GET /api/roadmap/milestones error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des jalons" },
      { status: 500 }
    );
  }
}

// POST /api/roadmap/milestones — create a milestone
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateMilestoneInput;

    if (!body.project_id || body.project_id.trim().length === 0) {
      return NextResponse.json(
        { error: "L'identifiant du projet est requis" },
        { status: 400 }
      );
    }

    if (!body.title || body.title.trim().length === 0) {
      return NextResponse.json(
        { error: "Le titre du jalon est requis" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "in-progress", "done"];
    const status = validStatuses.includes(body.status || "") ? body.status! : "pending";

    const id = randomUUID();
    const now = new Date().toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO milestones (id, project_id, title, description, status, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.project_id,
      body.title.trim(),
      body.description?.trim() || "",
      status,
      body.due_date || null,
      now,
      now
    );

    const milestone = db.prepare("SELECT * FROM milestones WHERE id = ?").get(id) as Milestone;
    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    console.error("POST /api/roadmap/milestones error:", error);
    return NextResponse.json(
      { error: "Échec de la création du jalon" },
      { status: 500 }
    );
  }
}
