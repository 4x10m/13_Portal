"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Types ──

interface Example {
  input: string;
  output: string;
}

interface Profile {
  id: string;
  name: string;
  role: string;
  constraints: string[];
  format: string;
  formatDetails: string;
}

interface HistoryItem {
  id: number;
  preview: string;
  fullPrompt: string;
  date: string;
}

interface Analysis {
  length: { characters: number; words: number; sentences: number; paragraphs: number };
  structure: { hasRole: boolean; hasTask: boolean; hasContext: boolean; hasConstraints: boolean; hasFormat: boolean; hasExamples: boolean; sections: number };
  quality: { score: number; level: string; issues: string[]; strengths: string[] };
}

interface ProjectOption {
  id: string;
  name: string;
  repo_path: string;
  cwds: string[];
}

type Format = "text" | "markdown" | "json" | "code" | "list";
type BuilderView = "build" | "preview" | "history";
type HarnessType = "opencode" | "codex" | "claude-code" | "other";

// ── Harness config ──

const HARNESS_OPTIONS: { value: HarnessType; label: string; icon: string; desc: string }[] = [
  { value: "opencode", label: "OpenCode", icon: "⚡", desc: "OpenCode CLI — sessions SQLite" },
  { value: "codex", label: "Codex", icon: "🔮", desc: "OpenAI Codex CLI" },
  { value: "claude-code", label: "Claude Code", icon: "🤖", desc: "Anthropic Claude Code CLI" },
  { value: "other", label: "Autre", icon: "🔧", desc: "Autre harnais d'exécution" },
];

// ── Default templates ──

const TEMPLATES: Record<string, { label: string; icon: string; role: string; task: string; constraints: string[]; format: Format; formatDetails: string }> = {
  "code-review": {
    label: "Code Review", icon: "🔍",
    role: "Tu es un expert en revue de code avec une expertise approfondie en bonnes pratiques, design patterns et optimisation.",
    task: "Analyse le code fourni et identifie les problèmes potentiels, les améliorations possibles et les violations des bonnes pratiques.",
    constraints: ["Fournir des explications claires et concises", "Proposer des solutions concrètes", "Classer les problèmes par priorité", "Inclure des références aux bonnes pratiques"],
    format: "markdown",
    formatDetails: "Structure avec: Problèmes critiques, Améliorations suggérées, Bonnes pratiques respectées",
  },
  explainer: {
    label: "Expliqueur", icon: "📖",
    role: "Tu es un professeur expérimenté capable d'expliquer des concepts complexes de manière simple et accessible.",
    task: "Explique le concept demandé de manière claire avec des exemples concrets et des analogies.",
    constraints: ["Utiliser un langage simple", "Fournir des exemples concrets", "Éviter le jargon technique inutile", "Adapter le niveau au public cible"],
    format: "markdown",
    formatDetails: "Structure avec: Introduction, Explication simple, Exemples, Résumé",
  },
  writer: {
    label: "Rédacteur", icon: "✍️",
    role: "Tu es un rédacteur professionnel spécialisé dans la création de contenu engageant et optimisé.",
    task: "Rédige du contenu de qualité sur le sujet demandé.",
    constraints: ["Ton professionnel mais accessible", "Structure claire et logique", "Informations vérifiées et sourcées", "Optimisé pour la lisibilité"],
    format: "markdown",
    formatDetails: "Titre, Introduction, Corps structuré, Conclusion",
  },
  debugger: {
    label: "Debugger", icon: "🐛",
    role: "Tu es un expert en debugging avec une connaissance approfondie des erreurs courantes et des solutions.",
    task: "Analyse le problème décrit et aide à identifier et corriger les bugs.",
    constraints: ["Analyser les messages d'erreur", "Proposer des étapes de diagnostic", "Fournir des solutions testées", "Expliquer la cause racine"],
    format: "markdown",
    formatDetails: "Diagnostic, Causes possibles, Solutions étape par étape, Prévention",
  },
  custom: {
    label: "Vierge", icon: "📝",
    role: "", task: "", constraints: [], format: "text", formatDetails: "",
  },
};

const ROLE_PRESETS = [
  { label: "Expert", value: "Tu es un expert dans ton domaine avec une connaissance approfondie et une expérience pratique." },
  { label: "Assistant", value: "Tu es un assistant utile, concis et bienveillant." },
  { label: "Professeur", value: "Tu es un professeur expérimenté, capable d'expliquer clairement et de guider l'apprentissage." },
  { label: "Développeur", value: "Tu es un développeur senior expérimenté, spécialisé en architecture logicielle et bonnes pratiques." },
];

const TASK_PRESETS = [
  { label: "Expliquer", value: "Explique le concept suivant de manière claire et structurée." },
  { label: "Corriger", value: "Corrige les erreurs dans le code/texte fourni et explique les corrections." },
  { label: "Optimiser", value: "Optimise le code/processus fourni en identifiant les points d'amélioration." },
  { label: "Créer", value: "Crée un contenu/code répondant au besoin décrit." },
  { label: "Analyser", value: "Analyse en détail le sujet fourni en identifiant les points clés et les implications." },
];

const FORMAT_LABELS: Record<Format, string> = {
  text: "Texte libre", markdown: "Markdown", json: "JSON", code: "Code", list: "Liste à puces",
};

const STORAGE_KEY = "ax-prompt-builder-state";
const HISTORY_KEY = "ax-prompt-builder-history";

// ── Helpers ──

function generatePrompt(state: { role: string; task: string; context: string; constraints: string[]; format: Format; formatDetails: string; examples: Example[] }): string {
  let p = "";
  if (state.role.trim()) p += `# Rôle\n${state.role.trim()}\n\n`;
  if (state.task.trim()) p += `# Tâche\n${state.task.trim()}\n\n`;
  if (state.context.trim()) p += `# Contexte\n${state.context.trim()}\n\n`;
  const validC = state.constraints.filter((c) => c?.trim());
  if (validC.length > 0) {
    p += `# Contraintes\n`;
    validC.forEach((c, i) => { p += `${i + 1}. ${c.trim()}\n`; });
    p += "\n";
  }
  if (state.format !== "text" || state.formatDetails.trim()) {
    p += `# Format de sortie\n`;
    if (state.format !== "text") p += `Format: ${FORMAT_LABELS[state.format]}\n`;
    if (state.formatDetails.trim()) p += `${state.formatDetails.trim()}\n`;
    p += "\n";
  }
  const validEx = state.examples.filter((e) => e.input?.trim() || e.output?.trim());
  if (validEx.length > 0) {
    p += `# Exemples\n\n`;
    validEx.forEach((e, i) => {
      if (e.input?.trim()) p += `**Input ${i + 1}:**\n${e.input.trim()}\n\n`;
      if (e.output?.trim()) p += `**Output ${i + 1}:**\n${e.output.trim()}\n\n`;
    });
  }
  return p.trim();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

// ── Main Panel ──

export function PromptBuilderPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Builder state
  const [role, setRole] = useState("");
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [constraints, setConstraints] = useState<string[]>([""]);
  const [format, setFormat] = useState<Format>("text");
  const [formatDetails, setFormatDetails] = useState("");
  const [examples, setExamples] = useState<Example[]>([]);

  // UI state
  const [view, setView] = useState<BuilderView>("build");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [improving, setImproving] = useState(false);
  const [improveResult, setImproveResult] = useState<{ improved: string; suggestions: string[] } | null>(null);
  const [backendStatus, setBackendStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [enqueueing, setEnqueueing] = useState(false);
  const [showEnqueue, setShowEnqueue] = useState(false);
  const [enqueueProject, setEnqueueProject] = useState("");
  const [enqueueCwd, setEnqueueCwd] = useState("");
  const [enqueueModel, setEnqueueModel] = useState("default");
  const [harnessType, setHarnessType] = useState<HarnessType>("opencode");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Computed preview
  const preview = useMemo(() => generatePrompt({ role, task, context, constraints, format, formatDetails, examples }),
    [role, task, context, constraints, format, formatDetails, examples]);

  const stats = useMemo(() => ({
    chars: preview.length,
    words: preview.trim() ? preview.trim().split(/\s+/).length : 0,
    tokens: estimateTokens(preview),
  }), [preview]);

  // Load from localStorage on open
  useEffect(() => {
    if (!open) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (s.role) setRole(s.role);
        if (s.task) setTask(s.task);
        if (s.context) setContext(s.context);
        if (s.constraints) setConstraints(s.constraints);
        if (s.format) setFormat(s.format);
        if (s.formatDetails) setFormatDetails(s.formatDetails);
        if (s.examples) setExamples(s.examples);
      }
      const savedProfiles = localStorage.getItem(STORAGE_KEY + "-profiles");
      if (savedProfiles) setProfiles(JSON.parse(savedProfiles));
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      if (savedHistory) setHistory(JSON.parse(savedHistory));
    } catch { /* ignore */ }

    // Check backend status
    fetch("/api/prompt-builder").then(r => r.json()).then(d => {
      setBackendStatus(d.backend === "online" ? "online" : "offline");
    }).catch(() => setBackendStatus("offline"));

    // Load project options for combobox
    fetch("/api/roadmap/projects").then(r => r.json()).then((projects: any[]) => {
      const opts: ProjectOption[] = projects.map((p: any) => ({
        id: p.id as string,
        name: p.name as string,
        repo_path: (p.repo_path as string) || "",
        cwds: [...new Set((p.opencode_sessions || []).map((s: any) => s.cwd as string))] as string[],
      }));
      setProjectOptions(opts);
    }).catch(() => setProjectOptions([]));
  }, [open]);

  // Close project dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Save to localStorage on changes
  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ role, task, context, constraints, format, formatDetails, examples }));
    } catch { /* ignore */ }
  }, [role, task, context, constraints, format, formatDetails, examples, open]);

  // ── Actions ──

  const handleCopy = useCallback(async () => {
    if (!preview.trim()) { toast.error("Rien à copier"); return; }
    await navigator.clipboard.writeText(preview);
    // Add to history
    const item: HistoryItem = {
      id: Date.now(),
      preview: preview.substring(0, 100) + (preview.length > 100 ? "..." : ""),
      fullPrompt: preview,
      date: new Date().toLocaleString("fr-FR"),
    };
    const newHistory = [item, ...history].slice(0, 20);
    setHistory(newHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    toast.success("Prompt copié dans le presse-papier");
  }, [preview, history]);

  const handleDownload = useCallback(() => {
    if (!preview.trim()) { toast.error("Rien à télécharger"); return; }
    const blob = new Blob([preview], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompt_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Prompt téléchargé");
  }, [preview]);

  const handleClear = useCallback(() => {
    setRole(""); setTask(""); setContext(""); setConstraints([""]);
    setFormat("text"); setFormatDetails(""); setExamples([]);
    setCurrentProfileId(null); setAnalysis(null); setImproveResult(null);
    toast.success("Tout effacé");
  }, []);

  const loadTemplate = useCallback((key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    setRole(t.role); setTask(t.task); setConstraints([...t.constraints]);
    setFormat(t.format); setFormatDetails(t.formatDetails); setExamples([]);
    setCurrentProfileId(null); setAnalysis(null); setImproveResult(null);
    toast.success(`Template "${t.label}" chargé`);
  }, []);

  const saveProfile = useCallback(() => {
    const name = prompt("Nom du profil:");
    if (!name) return;
    const p: Profile = {
      id: Date.now().toString(), name,
      role, constraints: [...constraints], format, formatDetails,
    };
    const newProfiles = [...profiles, p];
    setProfiles(newProfiles);
    setCurrentProfileId(p.id);
    localStorage.setItem(STORAGE_KEY + "-profiles", JSON.stringify(newProfiles));
    toast.success(`Profil "${name}" sauvegardé`);
  }, [role, constraints, format, formatDetails, profiles]);

  const loadProfile = useCallback((id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setRole(p.role); setConstraints([...p.constraints]);
    setFormat(p.format as Format); setFormatDetails(p.formatDetails);
    setCurrentProfileId(p.id);
    toast.success(`Profil "${p.name}" chargé`);
  }, [profiles]);

  const deleteProfile = useCallback((id: string) => {
    const newProfiles = profiles.filter((p) => p.id !== id);
    setProfiles(newProfiles);
    if (currentProfileId === id) setCurrentProfileId(null);
    localStorage.setItem(STORAGE_KEY + "-profiles", JSON.stringify(newProfiles));
  }, [profiles, currentProfileId]);

  const handleAnalyze = useCallback(async () => {
    if (!preview.trim()) { toast.error("Rien à analyser"); return; }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/prompt-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", prompt: preview }),
      });
      const data = await res.json();
      if (data.analysis) setAnalysis(data.analysis);
      else toast.error("Analyse échouée");
    } catch {
      toast.error("Erreur lors de l'analyse");
    } finally {
      setAnalyzing(false);
    }
  }, [preview]);

  const handleImprove = useCallback(async (improvements: string[]) => {
    if (!preview.trim()) { toast.error("Rien à améliorer"); return; }
    setImproving(true);
    try {
      const res = await fetch("/api/prompt-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", prompt: preview, improvements }),
      });
      const data = await res.json();
      if (data.improved) {
        setImproveResult({ improved: data.improved, suggestions: data.suggestions || [] });
        toast.success("Amélioration terminée");
      }
    } catch {
      toast.error("Erreur lors de l'amélioration");
    } finally {
      setImproving(false);
    }
  }, [preview]);

  const applyImproved = useCallback(() => {
    if (!improveResult) return;
    navigator.clipboard.writeText(improveResult.improved);
    toast.success("Prompt amélioré copié");
  }, [improveResult]);

  const handleEnqueue = useCallback(async () => {
    if (!preview.trim()) { toast.error("Rien à envoyer"); return; }
    setEnqueueing(true);
    try {
      const res = await fetch("/api/prompt-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: preview,
          project_id: selectedProject?.id || null,
          project_name: selectedProject?.name || enqueueProject || null,
          target_cwd: enqueueCwd || null,
          target_model: enqueueModel || "default",
          harness_type: harnessType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Prompt enqueued → ${HARNESS_OPTIONS.find(h => h.value === harnessType)?.label || harnessType} (id: ${data.id?.slice(0, 8)}…)`);
        setShowEnqueue(false);
      } else {
        toast.error("Erreur enqueue: " + (data.error || "inconnue"));
      }
    } catch {
      toast.error("Erreur réseau lors de l'enqueue");
    } finally {
      setEnqueueing(false);
    }
  }, [preview, enqueueProject, enqueueCwd, enqueueModel, harnessType, selectedProject]);

  const loadFromHistory = useCallback((item: HistoryItem) => {
    navigator.clipboard.writeText(item.fullPrompt);
    toast.success("Prompt de l'historique copié");
  }, []);

  // ── Constraint management ──
  const addConstraint = () => setConstraints((c) => [...c, ""]);
  const updateConstraint = (i: number, v: string) => setConstraints((c) => { const n = [...c]; n[i] = v; return n; });
  const removeConstraint = (i: number) => setConstraints((c) => c.filter((_, j) => j !== i));

  // ── Example management ──
  const addExample = () => setExamples((e) => [...e, { input: "", output: "" }]);
  const updateExample = (i: number, field: "input" | "output", v: string) =>
    setExamples((e) => { const n = [...e]; n[i] = { ...n[i], [field]: v }; return n; });
  const removeExample = (i: number) => setExamples((e) => e.filter((_, j) => j !== i));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[95vw] max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          🛠️ Prompt & Task Builder
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {backendStatus === "online" ? "🟢 API" : "🟡 Local"}
          </Badge>
        </DialogTitle>
        <DialogDescription>Construisez des prompts structurés et envoyez-les à n'importe quel harnais d'exécution</DialogDescription>
      </DialogHeader>

        {/* ── View switcher + actions ── */}
        <div className="flex items-center gap-2 flex-wrap border-b border-border pb-2">
          <div className="flex gap-1">
            {([
              { v: "build" as BuilderView, label: "🏗️ Builder" },
              { v: "preview" as BuilderView, label: "👁️ Aperçu" },
              { v: "history" as BuilderView, label: "📜 Historique" },
            ]).map(({ v, label }) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === v ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleCopy} disabled={!preview.trim()}>📋 Copier</Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleDownload} disabled={!preview.trim()}>⬇️ .txt</Button>
        <Button variant="outline" size="sm" className="text-xs h-7 border-ax-green/30 text-ax-green hover:bg-ax-green/10" onClick={() => setShowEnqueue(!showEnqueue)} disabled={!preview.trim()}>🚀 Enqueue</Button>
        <Button variant="outline" size="sm" className="text-xs h-7 text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={handleClear}>🗑️ Effacer</Button>
          </div>
        </div>

        {/* ── Stats bar (always visible) ── */}
        <div className="flex gap-4 text-[11px] text-muted-foreground">
          <span>{stats.chars} car.</span>
          <span>{stats.words} mots</span>
          <span>~{stats.tokens} tokens</span>
          {analysis && (
            <span className={`font-medium ${analysis.quality.score >= 60 ? "text-ax-green" : analysis.quality.score >= 40 ? "text-ax-yellow" : "text-red-400"}`}>
              Score: {analysis.quality.score}/100 — {analysis.quality.level}
            </span>
          )}
        </div>

        {/* ══════ BUILD VIEW ══════ */}
        {view === "build" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Builder */}
            <div className="space-y-4">

              {/* Templates + Profiles */}
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground font-medium">Templates:</span>
                    {Object.entries(TEMPLATES).map(([key, t]) => (
                      <button key={key} onClick={() => loadTemplate(key)}
                        className="px-2 py-1 rounded text-[11px] border border-border hover:bg-accent/50 transition-colors">
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground font-medium">Profils:</span>
                    <select value={currentProfileId || ""}
                      onChange={(e) => { if (e.target.value) loadProfile(e.target.value); }}
                      className="h-7 text-xs bg-transparent border border-border rounded-md px-2 text-muted-foreground">
                      <option value="">-- Charger --</option>
                      {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button onClick={saveProfile} className="px-2 py-1 rounded text-[11px] border border-ax-blue/30 text-ax-blue hover:bg-ax-blue/10">
                      💾 Sauver
                    </button>
                    {currentProfileId && (
                      <button onClick={() => deleteProfile(currentProfileId)} className="px-2 py-1 rounded text-[11px] text-red-400 border border-red-500/30 hover:bg-red-500/10">
                        ✕
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Rôle */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    🎭 Rôle / Persona
                    <span className="text-muted-foreground font-normal text-xs">— Définissez le persona de l'IA</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-1 flex-wrap">
                    {ROLE_PRESETS.map((p) => (
                      <button key={p.label} onClick={() => setRole(p.value)}
                        className={`px-2 py-1 rounded text-[11px] transition-colors ${role === p.value ? "bg-ax-blue/20 text-ax-blue font-medium border border-ax-blue/30" : "border border-border hover:bg-accent/50"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={role} onChange={(e) => setRole(e.target.value)}
                    placeholder="Ex: Tu es un expert en architecture cloud avec 10 ans d'expérience..."
                    className="w-full min-h-[80px] text-xs bg-muted/30 border border-border rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-ax-blue" />
                </CardContent>
              </Card>

              {/* Tâche */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">📋 Tâche / Mission</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-1 flex-wrap">
                    {TASK_PRESETS.map((p) => (
                      <button key={p.label} onClick={() => setTask(p.value)}
                        className={`px-2 py-1 rounded text-[11px] transition-colors ${task === p.value ? "bg-ax-blue/20 text-ax-blue font-medium border border-ax-blue/30" : "border border-border hover:bg-accent/50"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={task} onChange={(e) => setTask(e.target.value)}
                    placeholder="Ex: Analyse le code fourni et propose des optimisations..."
                    className="w-full min-h-[60px] text-xs bg-muted/30 border border-border rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-ax-blue" />
                </CardContent>
              </Card>

              {/* Contexte */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">📚 Contexte</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea value={context} onChange={(e) => setContext(e.target.value)}
                    placeholder="Ajoutez du contexte: code source, documentation, contraintes techniques..."
                    className="w-full min-h-[100px] text-xs bg-muted/30 border border-border rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-ax-blue" />
                </CardContent>
              </Card>

              {/* Contraintes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    ⚠️ Contraintes
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{constraints.filter((c) => c?.trim()).length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {constraints.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground min-w-[20px]">{i + 1}.</span>
                      <Input value={c} onChange={(e) => updateConstraint(i, e.target.value)}
                        placeholder="Ex: Répondre en français"
                        className="h-7 text-xs" />
                      <button onClick={() => removeConstraint(i)} className="text-muted-foreground hover:text-red-400 text-sm px-1">✕</button>
                    </div>
                  ))}
                  <button onClick={addConstraint} className="text-xs text-ax-blue hover:underline">+ Ajouter une contrainte</button>
                </CardContent>
              </Card>

              {/* Format */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">📄 Format de sortie</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {(["text", "markdown", "json", "code", "list"] as Format[]).map((f) => (
                      <button key={f} onClick={() => setFormat(f)}
                        className={`px-2.5 py-1 rounded text-[11px] transition-colors ${format === f ? "bg-ax-blue/20 text-ax-blue font-medium border border-ax-blue/30" : "border border-border hover:bg-accent/50"}`}>
                        {FORMAT_LABELS[f]}
                      </button>
                    ))}
                  </div>
                  {format !== "text" && (
                    <textarea value={formatDetails} onChange={(e) => setFormatDetails(e.target.value)}
                      placeholder="Détails du format attendu..."
                      className="w-full min-h-[40px] text-xs bg-muted/30 border border-border rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-ax-blue" />
                  )}
                </CardContent>
              </Card>

              {/* Exemples */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    💡 Exemples (Few-shot)
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{examples.filter((e) => e.input?.trim() || e.output?.trim()).length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {examples.map((ex, i) => (
                    <div key={i} className="border border-border/50 rounded-md p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground">Exemple {i + 1}</span>
                        <button onClick={() => removeExample(i)} className="text-muted-foreground hover:text-red-400 text-xs">✕</button>
                      </div>
                      <textarea value={ex.input} onChange={(e) => updateExample(i, "input", e.target.value)}
                        placeholder="Input..." className="w-full min-h-[30px] text-xs bg-muted/30 border border-border rounded p-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-ax-blue" />
                      <textarea value={ex.output} onChange={(e) => updateExample(i, "output", e.target.value)}
                        placeholder="Output attendu..." className="w-full min-h-[30px] text-xs bg-muted/30 border border-border rounded p-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-ax-blue" />
                    </div>
                  ))}
                  <button onClick={addExample} className="text-xs text-ax-blue hover:underline">+ Ajouter un exemple</button>
                </CardContent>
              </Card>
            </div>

            {/* Right: Preview + Actions */}
            <div className="space-y-4">
              {/* Live preview */}
              <Card className="sticky top-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>👁️ Aperçu en temps réel</span>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      <span>{stats.chars} car.</span>
                      <span>{stats.words} mots</span>
                      <span>~{stats.tokens} tokens</span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted/30 border border-border rounded-md p-3 whitespace-pre-wrap min-h-[200px] max-h-[400px] overflow-y-auto font-mono leading-relaxed">
                    {preview.trim() || <span className="text-muted-foreground italic">Votre prompt apparaîtra ici...</span>}
                  </pre>
                </CardContent>
              </Card>

              {/* IA Actions */}
              <Card className="border-ax-blue/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">🤖 Actions IA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full text-xs h-8"
                    onClick={handleAnalyze} disabled={analyzing || !preview.trim()}>
                    {analyzing ? "⏳ Analyse..." : "📊 Analyser la qualité"}
                  </Button>

                  {/* Analysis result */}
                  {analysis && (
                    <div className="border border-border rounded-md p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold text-sm ${analysis.quality.score >= 80 ? "text-ax-green" : analysis.quality.score >= 60 ? "text-ax-blue" : analysis.quality.score >= 40 ? "text-ax-yellow" : "text-red-400"}`}>
                          {analysis.quality.score}/100 — {analysis.quality.level}
                        </span>
                      </div>
                      {analysis.quality.strengths.length > 0 && (
                        <div>
                          <p className="font-medium text-ax-green text-[11px] mb-1">Points forts:</p>
                          {analysis.quality.strengths.map((s, i) => (
                            <p key={i} className="text-muted-foreground">✓ {s}</p>
                          ))}
                        </div>
                      )}
                      {analysis.quality.issues.length > 0 && (
                        <div>
                          <p className="font-medium text-ax-yellow text-[11px] mb-1">À améliorer:</p>
                          {analysis.quality.issues.map((s, i) => (
                            <p key={i} className="text-muted-foreground">△ {s}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5">
                    <Button variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => handleImprove(["add_role", "add_format"])}
                      disabled={improving || !preview.trim()}>
                      {improving ? "⏳..." : "✨ Rôle + Format"}
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => handleImprove(["add_context", "add_constraints"])}
                      disabled={improving || !preview.trim()}>
                      {improving ? "⏳..." : "✨ Contexte + Contraintes"}
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 col-span-2"
                      onClick={() => handleImprove(["add_role", "add_context", "add_format", "add_constraints", "add_examples"])}
                      disabled={improving || !preview.trim()}>
                      {improving ? "⏳..." : "✨ Amélioration complète"}
                    </Button>
                  </div>

                  {/* Improve result */}
                  {improveResult && (
                    <div className="border border-ax-blue/30 rounded-md p-3 space-y-2 text-xs">
                      <p className="font-medium text-ax-blue text-[11px]">Prompt amélioré:</p>
                      {improveResult.suggestions.length > 0 && (
                        <div>
                          <p className="text-muted-foreground text-[11px] mb-1">Suggestions:</p>
                          {improveResult.suggestions.map((s, i) => (
                            <p key={i} className="text-muted-foreground">→ {s}</p>
                          ))}
                        </div>
                      )}
                      <pre className="bg-muted/30 border border-border rounded p-2 text-[10px] whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                        {improveResult.improved}
                      </pre>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" className="text-xs h-6" onClick={applyImproved}>
                          📋 Copier l'amélioré
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setImproveResult(null)}>
                          ✕ Fermer
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ══════ PREVIEW VIEW ══════ */}
        {view === "preview" && (
          <div className="space-y-3">
            <pre className="text-sm bg-muted/30 border border-border rounded-md p-4 whitespace-pre-wrap min-h-[300px] font-mono leading-relaxed">
              {preview.trim() || <span className="text-muted-foreground italic">Votre prompt apparaîtra ici...</span>}
            </pre>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{stats.chars} caractères</span>
              <span>{stats.words} mots</span>
              <span>~{stats.tokens} tokens estimés</span>
              <span>{preview.split("\n").length} lignes</span>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" className="text-xs h-7" onClick={handleCopy}>📋 Copier</Button>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleDownload}>⬇️ Télécharger</Button>
              </div>
            </div>
          </div>
        )}

  {/* ══════ HISTORY VIEW ══════ */}
  {view === "history" && (
  <div className="space-y-2">
    {history.length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-8">Aucun historique — copiez des prompts pour les sauvegarder</p>
    ) : (
    <>
    {history.map((item) => (
    <Card key={item.id} className="cursor-pointer hover:border-ax-blue/50 transition-colors"
      onClick={() => loadFromHistory(item)}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">Prompt #{item.id}</span>
          <span className="text-[10px] text-muted-foreground">{item.date}</span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{item.preview}</p>
      </CardContent>
    </Card>
    ))}
    <button onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); toast.success("Historique effacé"); }}
      className="text-xs text-red-400 hover:underline block mx-auto mt-2">
      🗑️ Effacer l'historique
    </button>
    </>
    )}
  </div>
  )}

      {/* ══════ ENQUEUE PANEL ══════ */}
      {showEnqueue && (
        <Card className="border-[#00ff88]/30 bg-[#00ff88]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              🚀 Enqueue — Envoyer à un harnais d'exécution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Harness type selector */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1.5 block">Harnais cible</label>
              <div className="flex gap-1.5 flex-wrap">
                {HARNESS_OPTIONS.map((h) => (
                  <button
                    key={h.value}
                    onClick={() => setHarnessType(h.value)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors flex items-center gap-1.5 ${
                      harnessType === h.value
                        ? "border-[#00d9ff] bg-[#00d9ff]/10 text-[#00d9ff] font-medium"
                        : "border-[#2d3f5e] text-[#8899b3] hover:border-[#00d9ff]/30 hover:text-[#e0e8f0]"
                    }`}
                    title={h.desc}
                  >
                    <span>{h.icon}</span>
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Project combobox */}
            <div ref={projectDropdownRef} className="relative">
              <label className="text-[11px] text-muted-foreground font-medium mb-1.5 block">Projet cible</label>
              <Input
                value={projectSearch || selectedProject?.name || ""}
                onChange={(e) => {
                  setProjectSearch(e.target.value);
                  setSelectedProject(null);
                  setShowProjectDropdown(true);
                }}
                onFocus={() => setShowProjectDropdown(true)}
                placeholder="Rechercher un projet…"
                className="h-7 text-xs"
              />
              {showProjectDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-[#1a2744] border border-[#2d3f5e] rounded-md shadow-xl max-h-[200px] overflow-y-auto">
                  {projectOptions
                    .filter((p) => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()))
                    .slice(0, 20)
                    .map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#243352] transition-colors flex items-center justify-between gap-2"
                        onClick={() => {
                          setSelectedProject(p);
                          setProjectSearch("");
                          setShowProjectDropdown(false);
                          // Auto-fill CWD from project sessions
                          if (p.cwds.length > 0) {
                            setEnqueueCwd(p.cwds[0]);
                          } else if (p.repo_path) {
                            setEnqueueCwd(`/home/debian/Codebase/${p.repo_path}`);
                          }
                          setEnqueueProject(p.name);
                        }}
                      >
                        <span className="truncate flex-1">{p.name}</span>
                        {p.cwds.length > 0 && (
                          <Badge variant="outline" className="text-[9px] shrink-0">{p.cwds.length} CWD</Badge>
                        )}
                      </button>
                    ))}
                  {projectOptions.filter((p) => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2">Aucun projet trouvé</p>
                  )}
                </div>
              )}
              {selectedProject && (
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" className="text-[10px] border-[#00d9ff]/30 text-[#00d9ff]">
                    ✓ {selectedProject.name}
                  </Badge>
                  {selectedProject.cwds.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {selectedProject.cwds.slice(0, 3).map((c) => (
                        <button
                          key={c}
                          onClick={() => setEnqueueCwd(c)}
                          className={`text-[9px] px-1.5 py-0.5 rounded border font-mono truncate max-w-[200px] transition-colors ${
                            enqueueCwd === c
                              ? "border-[#00ff88]/50 bg-[#00ff88]/10 text-[#00ff88]"
                              : "border-[#2d3f5e] text-[#8899b3] hover:border-[#00d9ff]/30"
                          }`}
                          title={c}
                        >
                          {c.split("/").slice(-2).join("/")}
                        </button>
                      ))}
                      {selectedProject.cwds.length > 3 && (
                        <span className="text-[9px] text-[#8899b3]">+{selectedProject.cwds.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CWD + Model */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground font-medium">CWD (répertoire de travail)</label>
                <Input value={enqueueCwd} onChange={(e) => setEnqueueCwd(e.target.value)}
                  placeholder="Ex: /home/debian/Codebase/2_ai-stack" className="h-7 text-xs mt-1 font-mono" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium">Modèle</label>
                <select value={enqueueModel} onChange={(e) => setEnqueueModel(e.target.value)}
                  className="h-7 text-xs w-full bg-transparent border border-border rounded-md px-2 mt-1">
                  <option value="default">Défaut</option>
                  <option value="claude-sonnet">Claude Sonnet</option>
                  <option value="glm-5.1">GLM-5.1</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>
            </div>

            {/* Preview + actions */}
            <div className="bg-muted/30 border border-border rounded-md p-2 max-h-[80px] overflow-y-auto">
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">{preview.slice(0, 300)}{preview.length > 300 ? "…" : ""}</pre>
            </div>
            <div className="flex gap-2 items-center">
              <Button size="sm" className="text-xs h-8 bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 hover:bg-[#00ff88]/30"
                onClick={handleEnqueue} disabled={enqueueing || !preview.trim()}>
                {enqueueing ? "⏳ Envoi…" : `${HARNESS_OPTIONS.find(h => h.value === harnessType)?.icon || "🚀"} Enqueue → ${HARNESS_OPTIONS.find(h => h.value === harnessType)?.label || ""}`}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setShowEnqueue(false)}>
                ✕ Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </DialogContent>
    </Dialog>
  );
}
