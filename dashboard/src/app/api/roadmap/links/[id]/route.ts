import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Link } from "@/lib/db/types";

export const dynamic = "force-dynamic";

// DELETE /api/roadmap/links/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare("SELECT * FROM links WHERE id = ?").get(id) as Link | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });
    }

    db.prepare("DELETE FROM links WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/roadmap/links/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression du lien" },
      { status: 500 }
    );
  }
}
