import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import type { PromptQueueStatus } from "@/lib/db/types";
import { VALID_PROMPT_STATUSES } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/prompt-queue — list queue items
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const status = req.nextUrl.searchParams.get("status");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 200);

    let rows;
    if (status && VALID_PROMPT_STATUSES.includes(status as PromptQueueStatus)) {
      rows = db.prepare("SELECT * FROM prompt_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?").all(status, limit);
    } else {
      rows = db.prepare("SELECT * FROM prompt_queue ORDER BY created_at DESC LIMIT ?").all(limit);
    }

    return NextResponse.json({ items: rows, total: (rows as unknown[]).length });
  } catch (error) {
    return NextResponse.json({ error: "Erreur lecture queue", details: String(error) }, { status: 500 });
  }
}

// POST /api/prompt-queue — enqueue a new prompt
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { prompt, project_id, project_name, target_cwd, target_model } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt requis" }, { status: 400 });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO prompt_queue (id, prompt, project_id, project_name, target_cwd, target_model, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, prompt.trim(), project_id || null, project_name || null, target_cwd || null, target_model || "default", now);

    return NextResponse.json({ success: true, id, status: "pending" });
  } catch (error) {
    return NextResponse.json({ error: "Erreur enqueue", details: String(error) }, { status: 500 });
  }
}

// PATCH /api/prompt-queue — update status
export async function PATCH(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { id, status, result } = body;

    if (!id || !VALID_PROMPT_STATUSES.includes(status)) {
      return NextResponse.json({ error: "id et status valide requis" }, { status: 400 });
    }

    const now = new Date().toISOString();
    if (status === "running") {
      db.prepare("UPDATE prompt_queue SET status = ?, started_at = ? WHERE id = ?").run(status, now, id);
    } else if (status === "done" || status === "failed") {
      db.prepare("UPDATE prompt_queue SET status = ?, result = ?, finished_at = ? WHERE id = ?").run(status, result || null, now, id);
    } else {
      db.prepare("UPDATE prompt_queue SET status = ? WHERE id = ?").run(status, id);
    }

    return NextResponse.json({ success: true, id, status });
  } catch (error) {
    return NextResponse.json({ error: "Erreur update queue", details: String(error) }, { status: 500 });
  }
}

// DELETE /api/prompt-queue — clear completed/failed items
export async function DELETE(req: NextRequest) {
  try {
    const db = getDb();
    const scope = req.nextUrl.searchParams.get("scope") || "completed";
    if (scope === "all") {
      db.prepare("DELETE FROM prompt_queue").run();
    } else {
      db.prepare("DELETE FROM prompt_queue WHERE status IN ('done', 'failed', 'cancelled')").run();
    }
    return NextResponse.json({ success: true, scope });
  } catch (error) {
    return NextResponse.json({ error: "Erreur purge queue", details: String(error) }, { status: 500 });
  }
}
