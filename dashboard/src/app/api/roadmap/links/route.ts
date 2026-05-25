import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Link, CreateLinkInput } from "@/lib/db/types";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/roadmap/links?task_id=xxx&project_id=yyy
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("task_id");
    const projectId = searchParams.get("project_id");

    if (!taskId && !projectId) {
      return NextResponse.json(
        { error: "Le paramètre task_id ou project_id est requis" },
        { status: 400 }
      );
    }

    const db = getDb();

    if (projectId) {
      const links = db.prepare(
        "SELECT * FROM links WHERE project_id = ? ORDER BY created_at"
      ).all(projectId) as Link[];
      return NextResponse.json(links);
    }

    const links = db.prepare(
      "SELECT * FROM links WHERE task_id = ? ORDER BY created_at"
    ).all(taskId) as Link[];
    return NextResponse.json(links);
  } catch (error) {
    console.error("GET /api/roadmap/links error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des liens" },
      { status: 500 }
    );
  }
}

// POST /api/roadmap/links — create a link
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateLinkInput;

    if (!body.url || body.url.trim().length === 0) {
      return NextResponse.json(
        { error: "L'URL est requise" },
        { status: 400 }
      );
    }

    if (!body.label || body.label.trim().length === 0) {
      return NextResponse.json(
        { error: "Le libellé est requis" },
        { status: 400 }
      );
    }

    if (!body.task_id && !body.project_id) {
      return NextResponse.json(
        { error: "Au moins un identifiant task_id ou project_id est requis" },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO links (id, task_id, project_id, url, label, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.task_id || null,
      body.project_id || null,
      body.url.trim(),
      body.label.trim(),
      now
    );

    const link = db.prepare("SELECT * FROM links WHERE id = ?").get(id) as Link;
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("POST /api/roadmap/links error:", error);
    return NextResponse.json(
      { error: "Échec de la création du lien" },
      { status: 500 }
    );
  }
}
