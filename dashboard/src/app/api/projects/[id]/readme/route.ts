import { NextResponse } from "next/server";
import { getDb, parseProject } from "@/lib/db";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const CODEBASE_DIR = process.env.CODEBASE_DIR || "/home/debian/Codebase";
const MAX_README_SIZE = 64 * 1024; // 64KB max

// GET /api/projects/[id]/readme — read README.md from repo_path
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
    if (!row) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    const project = parseProject(row);
    if (!project.repo_path) {
      return NextResponse.json({ content: null, path: null });
    }

    const repoDir = path.join(CODEBASE_DIR, project.repo_path);
    // Security: ensure path doesn't escape CODEBASE_DIR
    const resolved = path.resolve(repoDir);
    if (!resolved.startsWith(path.resolve(CODEBASE_DIR))) {
      return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
    }

    // Try common README filenames
    const readmeNames = ["README.md", "readme.md", "Readme.md", "README.MD", "README", "README.txt"];
    for (const name of readmeNames) {
      const fp = path.join(resolved, name);
      if (fs.existsSync(fp)) {
        const stat = fs.statSync(fp);
        if (stat.size > MAX_README_SIZE) {
          const content = fs.readFileSync(fp, "utf-8").slice(0, MAX_README_SIZE);
          return NextResponse.json({ content: content + "\n\n... (tronqué)", path: name, size: stat.size });
        }
        const content = fs.readFileSync(fp, "utf-8");
        return NextResponse.json({ content, path: name, size: stat.size });
      }
    }

    return NextResponse.json({ content: null, path: null });
  } catch (error) {
    console.error("GET /api/projects/[id]/readme error:", error);
    return NextResponse.json({ error: "Erreur lecture README" }, { status: 500 });
  }
}
