import { NextResponse } from "next/server";
import { getDb, parseProject } from "@/lib/db";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const CODEBASE_DIR = process.env.CODEBASE_DIR || "/home/debian/Codebase";
const MAX_FILE_SIZE = 128 * 1024; // 128KB per file
const MAX_FILES = 30;

interface ExtractedTask {
  title: string;
  checked: boolean;
  file: string;
  line: number;
  indent: number;
  parent?: string;
}

interface MarkdownCheckboxes {
  file: string;
  tasks: ExtractedTask[];
}

// Recursively find .md files
function findMarkdownFiles(dir: string, depth: number): string[] {
  const files: string[] = [];
  if (depth > 3 || files.length >= MAX_FILES) return files;
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (files.length >= MAX_FILES) break;
      if (item.name.startsWith(".") || item.name === "node_modules" || item.name === "__pycache__") continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath, depth + 1));
      } else if (item.name.endsWith(".md")) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size <= MAX_FILE_SIZE) files.push(fullPath);
        } catch { /* skip */ }
      }
    }
  } catch { /* skip unreadable */ }
  return files;
}

// Parse checkboxes from markdown content
function parseCheckboxes(content: string, relFile: string): ExtractedTask[] {
  const tasks: ExtractedTask[] = [];
  const lines = content.split("\n");
  const stack: { indent: number; title: string }[] = []; // for parent tracking

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match: - [ ] or - [x] or * [ ] or * [x] (with optional leading whitespace)
    const match = line.match(/^(\s*)([-*])\s+\[([ xX])\]\s+(.+)/);
    if (!match) continue;

    const indent = match[1].length;
    const checked = match[3].toLowerCase() === "x";
    const title = match[4].trim();

    // Find parent (nearest item with less indent)
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack.length > 0 ? stack[stack.length - 1].title : undefined;

    tasks.push({ title, checked, file: relFile, line: i + 1, indent, parent });
    stack.push({ indent, title });
  }
  return tasks;
}

// POST /api/projects/[id]/extract-tasks
export async function POST(
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
      return NextResponse.json({ error: "repo_path non défini — impossible de scanner les fichiers" }, { status: 400 });
    }

    const repoDir = path.join(CODEBASE_DIR, project.repo_path);
    const resolved = path.resolve(repoDir);
    if (!resolved.startsWith(path.resolve(CODEBASE_DIR))) {
      return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
    }
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Répertoire introuvable" }, { status: 404 });
    }

    // Find and parse markdown files
    const mdFiles = findMarkdownFiles(resolved, 0);
    const allResults: MarkdownCheckboxes[] = [];

    for (const filePath of mdFiles) {
      const relPath = path.relative(resolved, filePath);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const tasks = parseCheckboxes(content, relPath);
        if (tasks.length > 0) {
          allResults.push({ file: relPath, tasks });
        }
      } catch { /* skip unreadable */ }
    }

    // Count total
    const totalUnchecked = allResults.reduce((s, r) => s + r.tasks.filter(t => !t.checked).length, 0);
    const totalChecked = allResults.reduce((s, r) => s + r.tasks.filter(t => t.checked).length, 0);

    if (totalUnchecked === 0 && totalChecked === 0) {
      return NextResponse.json({
        files_scanned: mdFiles.length,
        checkboxes: [],
        imported: 0,
        skipped_checked: 0,
        message: "Aucune checkbox trouvée dans les fichiers Markdown",
      });
    }

  // Auto-create a milestone for imported tasks if there are unchecked items
  let imported = 0;
  let skippedChecked = totalChecked;
  let duplicateSkipped = 0;

  if (totalUnchecked > 0) {
    const now = new Date().toISOString();
    const todayStr = new Date().toLocaleDateString("fr-FR");
    const milestoneTitle = `📋 Tâches importées (${todayStr})`;

    // Reuse existing extraction milestone for today if it exists
    let milestoneRow = db.prepare(
      "SELECT id FROM milestones WHERE project_id = ? AND title = ?"
    ).get(id, milestoneTitle) as { id: string } | undefined;

    let milestoneId: string;
    if (milestoneRow) {
      milestoneId = milestoneRow.id;
    } else {
      milestoneId = randomUUID();
      db.prepare(`
        INSERT INTO milestones (id, project_id, title, description, status, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        milestoneId, id, milestoneTitle,
        `Tâches extraites automatiquement depuis ${allResults.length} fichier(s) Markdown`,
        "pending", null, now, now
      );
    }

    // Get existing task titles for this milestone to avoid duplicates
    const existingTitles = new Set(
      (db.prepare("SELECT title FROM tasks WHERE milestone_id = ?").all(milestoneId) as { title: string }[])
        .map(r => r.title)
    );

    // Insert unchecked tasks (skip duplicates by title)
    for (const result of allResults) {
      for (const task of result.tasks) {
        if (task.checked) continue; // skip already-done
        if (existingTitles.has(task.title)) {
          duplicateSkipped++;
          continue; // skip duplicate
        }
        const taskId = randomUUID();
        const desc = task.parent
          ? `Sous-tâche de: ${task.parent}`
          : "";
        const sourceInfo = `${task.file}:${task.line}`;
        db.prepare(`
          INSERT INTO tasks (id, milestone_id, title, description, status, assignee, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          taskId, milestoneId, task.title,
          desc ? `${desc}\nSource: ${sourceInfo}` : `Source: ${sourceInfo}`,
          "todo", "", 0, now, now
        );
        existingTitles.add(task.title);
        imported++;
      }
    }
  }

  return NextResponse.json({
    files_scanned: mdFiles.length,
    checkboxes: allResults,
    imported,
    skipped_checked: skippedChecked,
    duplicate_skipped: duplicateSkipped,
    milestone_created: totalUnchecked > 0,
    message: `${imported} tâche${imported > 1 ? "s" : ""} importée${imported > 1 ? "s" : ""} depuis ${allResults.length} fichier${allResults.length > 1 ? "s" : ""} (${skippedChecked} déjà cochée${skippedChecked > 1 ? "s" : ""} ignorée${skippedChecked > 1 ? "s" : ""}${duplicateSkipped > 0 ? `, ${duplicateSkipped} doublon${duplicateSkipped > 1 ? "s" : ""} ignoré${duplicateSkipped > 1 ? "s" : ""}` : ""})`,
  });
  } catch (error) {
    console.error("POST /api/projects/[id]/extract-tasks error:", error);
    return NextResponse.json({ error: "Erreur extraction tâches" }, { status: 500 });
  }
}
