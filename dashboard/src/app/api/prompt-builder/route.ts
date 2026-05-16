import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const PB_HOST = process.env.PROMPT_BUILDER_URL || `http://host.docker.internal:3010`;

// Proxy to prompt-builder backend with local fallback
async function pbFetch(path: string, body?: unknown): Promise<unknown> {
  try {
    const url = `${PB_HOST}${path}`;
    const cmd = body
      ? `curl -s -X POST '${url}' -H 'Content-Type: application/json' -d '${JSON.stringify(body).replace(/'/g, "'\\''")}' --max-time 5`
      : `curl -s '${url}' --max-time 5`;
    const { stdout } = await execAsync(cmd, { timeout: 8000 });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

// GET /api/prompt-builder — health + suggestions
export async function GET() {
  const health = await pbFetch("/api/health");
  const suggestions = await pbFetch("/api/prompt/suggestions");

  return NextResponse.json({
    backend: health ? "online" : "offline",
    version: (health as Record<string, string>)?.version || "local",
    suggestions: (suggestions as Record<string, unknown>)?.suggestions || getDefaultSuggestions(),
  });
}

// POST /api/prompt-builder — proxy generate/improve/analyze
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "generate") {
      const result = await pbFetch("/api/prompt/generate", body);
      if (result && (result as Record<string, unknown>).success) {
        return NextResponse.json(result);
      }
      // Fallback: generate locally
      return NextResponse.json({ success: true, prompt: generateLocal(body), stats: localStats(body) });
    }

    if (action === "improve") {
      const result = await pbFetch("/api/prompt/improve", { prompt: body.prompt, improvements: body.improvements });
      if (result && (result as Record<string, unknown>).success) {
        return NextResponse.json(result);
      }
      // Fallback: local improve
      return NextResponse.json(improveLocal(body.prompt, body.improvements || []));
    }

    if (action === "analyze") {
      const result = await pbFetch("/api/prompt/analyze", { prompt: body.prompt });
      if (result && (result as Record<string, unknown>).success) {
        return NextResponse.json(result);
      }
      // Fallback: local analyze
      return NextResponse.json({ success: true, analysis: analyzeLocal(body.prompt) });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Erreur prompt-builder", details: String(err) }, { status: 500 });
  }
}

// ── Local fallback implementations ──

function generateLocal(data: Record<string, unknown>): string {
  let prompt = "";
  const project = data.project as Record<string, unknown> | null;
  if (project) {
    prompt += `# Projet\n**Nom:** ${project.name}\n`;
    if (project.description) prompt += `**Description:** ${project.description}\n`;
    const stack = project.stack as string[] | undefined;
    if (stack?.length) prompt += `**Stack:** ${stack.join(", ")}\n`;
    prompt += "\n";
  }
  if (data.role) prompt += `# Rôle\n${String(data.role).trim()}\n\n`;
  if (data.task) prompt += `# Tâche\n${String(data.task).trim()}\n\n`;
  if (data.context) prompt += `# Contexte\n${String(data.context).trim()}\n\n`;
  const constraints = data.constraints as string[] | undefined;
  const valid = constraints?.filter((c) => c?.trim()) || [];
  if (valid.length > 0) {
    prompt += `# Contraintes\n`;
    valid.forEach((c, i) => { prompt += `${i + 1}. ${c.trim()}\n`; });
    prompt += "\n";
  }
  if (data.format && data.format !== "text") {
    const names: Record<string, string> = { markdown: "Markdown", json: "JSON", code: "Code", list: "Liste" };
    prompt += `# Format de sortie\nFormat: ${names[String(data.format)] || String(data.format)}\n\n`;
  }
  const examples = data.examples as Array<{ input: string; output: string }> | undefined;
  const validEx = examples?.filter((e) => e?.input?.trim() || e?.output?.trim()) || [];
  if (validEx.length > 0) {
    prompt += `# Exemples\n\n`;
    validEx.forEach((e, i) => {
      if (e.input?.trim()) prompt += `**Input ${i + 1}:**\n${e.input.trim()}\n\n`;
      if (e.output?.trim()) prompt += `**Output ${i + 1}:**\n${e.output.trim()}\n\n`;
    });
  }
  return prompt.trim();
}

function localStats(data: Record<string, unknown>): { characters: number; words: number; lines: number } {
  const prompt = generateLocal(data);
  return { characters: prompt.length, words: prompt.trim().split(/\s+/).length, lines: prompt.split("\n").length };
}

function improveLocal(prompt: string, improvements: string[]): Record<string, unknown> {
  let improved = prompt;
  const suggestions: string[] = [];

  if (!/# rôle/i.test(improved)) suggestions.push("Ajoutez une section \"# Rôle\" pour définir le persona de l'IA.");
  if (!/# tâche/i.test(improved)) suggestions.push("Ajoutez une section \"# Tâche\" pour clarifier l'objectif.");
  if (!/# contexte/i.test(improved)) suggestions.push("Ajoutez du contexte pour aider l'IA à comprendre la situation.");
  if (!/# contraintes/i.test(improved)) suggestions.push("Ajoutez des contraintes pour guider la réponse.");
  if (!/# format/i.test(improved)) suggestions.push("Spécifiez le format de sortie attendu.");
  if (!/# exemples/i.test(improved)) suggestions.push("Ajoutez des exemples (few-shot) pour de meilleurs résultats.");

  if (improvements.includes("add_role") && !/# rôle/i.test(improved))
    improved = `# Rôle\nTu es un assistant expert dans ton domaine.\n\n${improved}`;
  if (improvements.includes("add_context") && !/# contexte/i.test(improved))
    improved += "\n\n# Contexte\nInformations importantes à prendre en compte.";
  if (improvements.includes("add_format"))
    improved += "\n\n# Format de sortie\nRépondre en format Markdown structuré.";
  if (improvements.includes("add_constraints"))
    improved += "\n\n# Contraintes\n1. Être précis et concis\n2. Fournir des exemples quand nécessaire\n3. Répondre en français";
  if (improvements.includes("add_examples"))
    improved += "\n\n# Exemples\n\n**Input:** Question exemple\n**Output:** Réponse structurée";

  improved = improved.replace(/\n{3,}/g, "\n\n").trim();
  return { success: true, original: prompt, improved, suggestions, changesApplied: improvements };
}

function analyzeLocal(prompt: string): Record<string, unknown> {
  const chars = prompt.length;
  const words = prompt.trim().split(/\s+/).length;
  const sentences = prompt.split(/[.!?]+/).filter((s) => s.trim()).length;
  const paragraphs = prompt.split(/\n\n+/).filter((p) => p.trim()).length;

  const structure = {
    hasRole: /#\s*(rôle|role)/i.test(prompt),
    hasTask: /#\s*(tâche|task)/i.test(prompt),
    hasContext: /#\s*(contexte|context)/i.test(prompt),
    hasConstraints: /#\s*(contraintes|constraints)/i.test(prompt),
    hasFormat: /#\s*(format)/i.test(prompt),
    hasExamples: /#\s*(exemples|examples)/i.test(prompt),
    sections: (prompt.match(/^#\s+.+/gm) || []).length,
  };

  let score = 0;
  const strengths: string[] = [];
  const issues: string[] = [];

  if (structure.hasRole) { score += 20; strengths.push("Rôle défini"); } else issues.push("Pas de rôle défini");
  if (structure.hasTask) { score += 20; strengths.push("Tâche claire"); } else issues.push("Tâche non spécifiée");
  if (structure.hasContext) { score += 15; strengths.push("Contexte fourni"); } else issues.push("Pas de contexte");
  if (structure.hasConstraints) { score += 15; strengths.push("Contraintes définies"); }
  if (structure.hasFormat) { score += 10; strengths.push("Format spécifié"); }
  if (structure.hasExamples) { score += 10; strengths.push("Exemples fournis"); }
  if (chars >= 100 && chars <= 2000) { score += 10; strengths.push("Longueur appropriée"); }
  else if (chars < 100) issues.push("Prompt trop court");
  else issues.push("Prompt très long");

  return {
    length: { characters: chars, words, sentences, paragraphs },
    structure,
    quality: {
      score,
      level: score >= 80 ? "Excellent" : score >= 60 ? "Bon" : score >= 40 ? "Moyen" : "À améliorer",
      issues,
      strengths,
    },
  };
}

function getDefaultSuggestions(): Array<{ id: string; label: string; description: string }> {
  return [
    { id: "add_role", label: "Ajouter un rôle", description: "Définit clairement le persona de l'IA" },
    { id: "add_context", label: "Ajouter du contexte", description: "Fournit les informations nécessaires" },
    { id: "add_format", label: "Spécifier le format", description: "Indique le format de sortie attendu" },
    { id: "add_constraints", label: "Ajouter des contraintes", description: "Guide la réponse (langue, style, longueur)" },
    { id: "add_examples", label: "Ajouter des exemples", description: "Few-shot prompting pour de meilleurs résultats" },
  ];
}
