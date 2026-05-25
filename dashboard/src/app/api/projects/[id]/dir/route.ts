import { NextResponse } from "next/server";
import { getDb, parseProject } from "@/lib/db";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const CODEBASE_DIR = process.env.CODEBASE_DIR || "/home/debian/Codebase";
const MAX_ENTRIES = 200;
const MAX_DEPTH = 2;

interface DirEntry {
  name: string;
  type: "file" | "dir";
  size: number;
  modified: string;
}

function scanDir(dirPath: string, depth: number, prefix: string): DirEntry[] {
  const entries: DirEntry[] = [];
  if (depth > MAX_DEPTH) return entries;
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    // Sort: dirs first, then files, both alphabetical
    const sorted = items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const item of sorted) {
      if (entries.length >= MAX_ENTRIES) break;
      // Skip hidden + node_modules + .git
      if (item.name.startsWith(".") || item.name === "node_modules" || item.name === "__pycache__") continue;
      const fullPath = path.join(dirPath, item.name);
      const relPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        entries.push({ name: relPath, type: "dir", size: 0, modified: "" });
        entries.push(...scanDir(fullPath, depth + 1, relPath));
      } else {
        try {
          const stat = fs.statSync(fullPath);
          entries.push({ name: relPath, type: "file", size: stat.size, modified: stat.mtime.toISOString() });
        } catch { /* skip inaccessible */ }
      }
    }
  } catch { /* skip unreadable */ }
  return entries;
}

// GET /api/projects/[id]/dir — list project directory contents
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
      return NextResponse.json({ entries: [], repo_path: null });
    }

    const repoDir = path.join(CODEBASE_DIR, project.repo_path);
    const resolved = path.resolve(repoDir);
    if (!resolved.startsWith(path.resolve(CODEBASE_DIR))) {
      return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ entries: [], repo_path: project.repo_path, exists: false });
    }

    const entries = scanDir(resolved, 0, "");
    return NextResponse.json({ entries, repo_path: project.repo_path, exists: true });
  } catch (error) {
    console.error("GET /api/projects/[id]/dir error:", error);
    return NextResponse.json({ error: "Erreur lecture répertoire" }, { status: 500 });
  }
}
