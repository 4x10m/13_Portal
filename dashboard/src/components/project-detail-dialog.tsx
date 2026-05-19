"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type {
  ProjectWithMilestones,
  ProjectStatus,
  ProjectPriority,
  ProjectCategory,
  UpdateProjectInput,
  CreateMilestoneInput,
  CreateTaskInput,
  MilestoneWithTasks,
  TaskStatus,
} from "@/lib/db/types";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Constants ──

const STATUS_LABELS: Record<string, string> = {
  idea: "Idée", pending: "En attente", todo: "À faire",
  "in-progress": "En cours", "on-hold": "En pause",
  blocked: "Bloqué", done: "Terminé",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Basse", medium: "Moyenne", high: "Haute", critical: "Critique",
};

const PRIORITY_STYLES: Record<string, { color: string; bg: string }> = {
  low: { color: "text-muted-foreground", bg: "bg-muted/50" },
  medium: { color: "text-[#00d9ff]", bg: "bg-[#00d9ff]/10" },
  high: { color: "text-[#ffbe0b]", bg: "bg-[#ffbe0b]/10" },
  critical: { color: "text-[#ff4757]", bg: "bg-[#ff4757]/10" },
};

const STATUS_STYLES: Record<string, { dot: string; label: string; bg: string }> = {
  idea: { dot: "bg-[#ffbe0b]", label: "Idée", bg: "bg-[#ffbe0b]/10" },
  pending: { dot: "bg-[#ffbe0b]", label: "En attente", bg: "bg-[#ffbe0b]/10" },
  todo: { dot: "bg-[#8899b3]", label: "À faire", bg: "bg-muted/50" },
  "in-progress": { dot: "bg-[#00d9ff]", label: "En cours", bg: "bg-[#00d9ff]/10" },
  "on-hold": { dot: "bg-[#8899b3]", label: "En pause", bg: "bg-muted/50" },
  blocked: { dot: "bg-[#ff4757]", label: "Bloqué", bg: "bg-[#ff4757]/10" },
  done: { dot: "bg-[#00ff88]", label: "Terminé", bg: "bg-[#00ff88]/10" },
};

const CATEGORY_LABELS: Record<string, string> = {
  infra: "Infra", ai: "IA", apps: "Apps", perso: "Perso", devops: "DevOps", general: "Général",
};

const TASK_STATUS_CYCLE: TaskStatus[] = ["todo", "in-progress", "done", "blocked"];

const TASK_STATUS_STYLES: Record<TaskStatus, { dot: string; label: string; bg: string }> = {
  todo: { dot: "bg-[#8899b3]", label: "À faire", bg: "bg-muted/50" },
  "in-progress": { dot: "bg-[#00d9ff]", label: "En cours", bg: "bg-[#00d9ff]/10" },
  done: { dot: "bg-[#00ff88]", label: "Terminé", bg: "bg-[#00ff88]/10" },
  blocked: { dot: "bg-[#ff4757]", label: "Bloqué", bg: "bg-[#ff4757]/10" },
};

const MILESTONE_STATUS_CYCLE: string[] = ["pending", "in-progress", "done"];

const DB_TYPE_ICONS: Record<string, string> = {
  postgresql: "🐘", postgres: "🐘", valkey: "🔴", redis: "🔴",
  mongodb: "🍃", mongo: "🍃", sqlite: "🗄️", mariadb: "🐬",
  mysql: "🐬", meilisearch: "🔍", minio: "📦",
};

const DB_TYPE_COLORS: Record<string, string> = {
  postgresql: "border-blue-500/30 bg-blue-500/5", postgres: "border-blue-500/30 bg-blue-500/5",
  redis: "border-red-500/30 bg-red-500/5", valkey: "border-red-500/30 bg-red-500/5",
  mariadb: "border-cyan-500/30 bg-cyan-500/5", mysql: "border-cyan-500/30 bg-cyan-500/5",
  meilisearch: "border-purple-500/30 bg-purple-500/5", minio: "border-amber-500/30 bg-amber-500/5",
  sqlite: "border-green-500/30 bg-green-500/5", mongodb: "border-emerald-500/30 bg-emerald-500/5",
};

type AgentOption = { id: string; name: string; type: string };
type HarnessType = "opencode" | "codex" | "claude-code" | "other";
type TabKey = "overview" | "readme" | "milestones" | "files" | "resources" | "links" | "prompt";

const HARNESS_OPTIONS: { value: HarnessType; label: string; icon: string }[] = [
  { value: "opencode", label: "OpenCode", icon: "⚡" },
  { value: "codex", label: "Codex", icon: "🔮" },
  { value: "claude-code", label: "Claude Code", icon: "🤖" },
  { value: "other", label: "Autre", icon: "🔧" },
];

// ── Component ──

export function ProjectDetailDialog({
  project,
  open,
  onOpenChange,
  onProjectUpdated,
}: {
  project: ProjectWithMilestones | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectUpdated: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "task" | "milestone"; id: string } | null>(null);

  // Inline editing
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editingRepoPath, setEditingRepoPath] = useState(false);
  const [editRepoPath, setEditRepoPath] = useState("");

  // README + directory data
  const [readme, setReadme] = useState<{ content: string | null; path: string | null } | null>(null);
  const [dirEntries, setDirEntries] = useState<{ name: string; type: string; size: number }[]>([]);
  const [dirLoading, setDirLoading] = useState(false);

  // Prompt tab state
  const [quickPrompt, setQuickPrompt] = useState("");
  const [quickHarness, setQuickHarness] = useState<HarnessType>("opencode");
  const [quickCwd, setQuickCwd] = useState("");
  const [quickModel, setQuickModel] = useState("default");
  const [enqueueing, setEnqueueing] = useState(false);

  // Task extraction state
  const [extracting, setExtracting] = useState(false);

  // Load agents for assignment dropdown
  useEffect(() => {
    if (open) {
      fetch("/api/agents/list")
        .then((r) => r.json())
        .then((data: AgentOption[]) => setAgents(data))
        .catch(() => setAgents([]));
    }
  }, [open]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setConfirmDelete(null);
      setActiveTab("overview");
      setNewMilestoneTitle("");
      setNewTaskTitles({});
      setEditingTaskId(null);
      setEditingName(false);
      setEditingDesc(false);
      setEditingRepoPath(false);
      setReadme(null);
      setDirEntries([]);
      setQuickPrompt("");
      setQuickHarness("opencode");
      setQuickCwd("");
      setQuickModel("default");
      setExtracting(false);
    }
  }, [open]);

  // Load README + dir when project opens
  useEffect(() => {
    if (!open || !project) return;
    // Auto-fill CWD from first session
    const cwds = [...new Set((project.opencode_sessions || []).map(s => s.cwd))];
    if (cwds.length > 0) setQuickCwd(cwds[0]);
    else if (project.repo_path) setQuickCwd(`/home/debian/Codebase/${project.repo_path}`);
    // Fetch README
    fetch(`/api/projects/${project.id}/readme`)
      .then((r) => r.json())
      .then((data) => setReadme({ content: data.content, path: data.path }))
      .catch(() => setReadme(null));
  }, [open, project?.id]);

  useEffect(() => {
    if (!open || !project || activeTab !== "files") return;
    setDirLoading(true);
    fetch(`/api/projects/${project.id}/dir`)
      .then((r) => r.json())
      .then((data) => { setDirEntries(data.entries || []); setDirLoading(false); })
      .catch(() => { setDirEntries([]); setDirLoading(false); });
  }, [open, project?.id, activeTab]);

  if (!project) return null;

  // ── Computed values ──

  const totalTasks = project.milestones?.reduce((s, m) => s + (m.tasks?.length || 0), 0) || 0;
  const doneTasks = project.milestones?.reduce((s, m) => s + (m.tasks?.filter(t => t.status === "done").length || 0), 0) || 0;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const resourceCount = (project.docker_containers?.length || 0) + (project.domains?.length || 0) + (project.databases?.length || 0) + (project.opencode_sessions?.length || 0);
  const blockedTasks = project.milestones?.reduce((s, m) => s + (m.tasks?.filter(t => t.status === "blocked").length || 0), 0) || 0;

  // Extract unique CWDs from sessions
  const uniqueCwds = [...new Set((project.opencode_sessions || []).map(s => s.cwd))];

  // ── Handlers ──

  const handleFieldUpdate = async (field: string, value: string) => {
    try {
      await fetch(`/api/roadmap/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      onProjectUpdated();
    } catch { toast.error("Erreur mise à jour"); }
  };

  const handleStatusChange = async (newStatus: string | null) => {
    if (!newStatus) return;
    try {
      await fetch(`/api/roadmap/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus as ProjectStatus }),
      });
      toast.success(`Statut → ${STATUS_LABELS[newStatus]}`);
      onProjectUpdated();
    } catch { toast.error("Erreur changement statut"); }
  };

  const handlePriorityChange = async (newPriority: string | null) => {
    if (!newPriority) return;
    try {
      await fetch(`/api/roadmap/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority as ProjectPriority }),
      });
      toast.success(`Priorité → ${PRIORITY_LABELS[newPriority]}`);
      onProjectUpdated();
    } catch { toast.error("Erreur changement priorité"); }
  };

  const handleCategoryChange = async (newCategory: string | null) => {
    if (!newCategory) return;
    try {
      await fetch(`/api/roadmap/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory as ProjectCategory }),
      });
      toast.success(`Catégorie → ${CATEGORY_LABELS[newCategory]}`);
      onProjectUpdated();
    } catch { toast.error("Erreur changement catégorie"); }
  };

  const handleAgentChange = async (agentId: string | null) => {
    if (!agentId) return;
    try {
      await fetch(`/api/roadmap/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_agent: agentId === "_none" ? "" : agentId }),
      });
      toast.success(agentId === "_none" ? "Agent retiré" : "Agent assigné");
      onProjectUpdated();
    } catch { toast.error("Erreur assignation agent"); }
  };

  const handleNameSave = () => {
    if (!editName.trim() || editName === project.name) { setEditingName(false); return; }
    handleFieldUpdate("name", editName.trim()).then(() => {
      toast.success("Projet renommé");
      setEditingName(false);
    });
  };

  const handleDescSave = () => {
    handleFieldUpdate("description", editDesc.trim()).then(() => {
      toast.success("Description mise à jour");
      setEditingDesc(false);
    });
  };

  const handleRepoPathSave = () => {
    handleFieldUpdate("repo_path", editRepoPath.trim()).then(() => {
      toast.success("Chemin du dépôt mis à jour");
      setEditingRepoPath(false);
      // Refresh README + dir
      fetch(`/api/projects/${project.id}/readme`).then(r => r.json()).then(d => setReadme({ content: d.content, path: d.path }));
    });
  };

  const handleAddMilestone = async () => {
    if (!newMilestoneTitle.trim()) return;
    try {
      await fetch("/api/roadmap/milestones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, title: newMilestoneTitle.trim() }),
      });
      setNewMilestoneTitle("");
      toast.success("Jalon ajouté");
      onProjectUpdated();
    } catch { toast.error("Erreur ajout jalon"); }
  };

  const handleAddTask = async (milestoneId: string) => {
    const title = newTaskTitles[milestoneId]?.trim();
    if (!title) return;
    try {
      await fetch("/api/roadmap/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone_id: milestoneId, title }),
      });
      setNewTaskTitles((prev) => ({ ...prev, [milestoneId]: "" }));
      toast.success("Tâche ajoutée");
      onProjectUpdated();
    } catch { toast.error("Erreur ajout tâche"); }
  };

  const handleTaskStatusCycle = async (taskId: string, currentStatus: TaskStatus) => {
    const idx = TASK_STATUS_CYCLE.indexOf(currentStatus);
    const nextStatus = TASK_STATUS_CYCLE[(idx + 1) % TASK_STATUS_CYCLE.length];
    try {
      await fetch(`/api/roadmap/tasks/${taskId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(`Tâche → ${STATUS_LABELS[nextStatus]}`);
      onProjectUpdated();
    } catch { toast.error("Erreur changement statut"); }
  };

  const handleMilestoneStatusCycle = async (milestoneId: string, currentStatus: string) => {
    const idx = MILESTONE_STATUS_CYCLE.indexOf(currentStatus);
    const nextStatus = MILESTONE_STATUS_CYCLE[(idx + 1) % MILESTONE_STATUS_CYCLE.length];
    try {
      await fetch(`/api/roadmap/milestones/${milestoneId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(`Jalon → ${STATUS_LABELS[nextStatus]}`);
      onProjectUpdated();
    } catch { toast.error("Erreur changement statut jalon"); }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirmDelete?.type === "task" && confirmDelete?.id === taskId) {
      try {
        await fetch(`/api/roadmap/tasks/${taskId}`, { method: "DELETE" });
        setConfirmDelete(null);
        toast.success("Tâche supprimée");
        onProjectUpdated();
      } catch { toast.error("Erreur suppression"); }
    } else {
      setConfirmDelete({ type: "task", id: taskId });
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (confirmDelete?.type === "milestone" && confirmDelete?.id === milestoneId) {
      try {
        await fetch(`/api/roadmap/milestones/${milestoneId}`, { method: "DELETE" });
        setConfirmDelete(null);
        toast.success("Jalon supprimé");
        onProjectUpdated();
      } catch { toast.error("Erreur suppression"); }
    } else {
      setConfirmDelete({ type: "milestone", id: milestoneId });
    }
  };

  const handleTaskAssignee = async (taskId: string, assignee: string) => {
    try {
      await fetch(`/api/roadmap/tasks/${taskId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee }),
      });
      toast.success(assignee ? "Agent assigné" : "Agent retiré");
      onProjectUpdated();
    } catch { toast.error("Erreur assignation"); }
  };

  const handleTaskTitleSave = async (taskId: string) => {
    if (!editTaskTitle.trim()) { setEditingTaskId(null); return; }
    try {
      await fetch(`/api/roadmap/tasks/${taskId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTaskTitle.trim() }),
      });
      setEditingTaskId(null);
      toast.success("Tâche renommée");
      onProjectUpdated();
    } catch { toast.error("Erreur renommage"); }
  };

  const handleDiscover = async () => {
    try {
      const res = await fetch("/api/discover");
      const data = await res.json();
      toast.success(`${data.updated_projects} projets mis à jour`);
      onProjectUpdated();
    } catch { toast.error("Erreur découverte Docker"); }
  };

  const handleExtractTasks = async () => {
    if (!project.repo_path) {
      toast.error("repo_path non défini — impossible d'extraire les tâches");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/extract-tasks`, { method: "POST" });
      const data = await res.json();
      if (data.imported > 0) {
        toast.success(data.message);
        onProjectUpdated();
      } else if (data.error) {
        toast.error(data.error);
      } else {
        toast.info(data.message);
      }
    } catch {
      toast.error("Erreur extraction tâches");
    } finally {
      setExtracting(false);
    }
  };

  const handleQuickEnqueue = async () => {
    if (!quickPrompt.trim()) { toast.error("Prompt vide"); return; }
    setEnqueueing(true);
    try {
      const res = await fetch("/api/prompt-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: quickPrompt,
          project_id: project.id,
          project_name: project.name,
          target_cwd: quickCwd || null,
          target_model: quickModel || "default",
          harness_type: quickHarness,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Envoyé → ${HARNESS_OPTIONS.find(h => h.value === quickHarness)?.label || quickHarness}`);
        setQuickPrompt("");
      } else {
        toast.error("Erreur: " + (data.error || "inconnue"));
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setEnqueueing(false);
    }
  };

  // ── Tab definitions ──

  const tabs: { key: TabKey; label: string; icon: string; badge?: number }[] = [
    { key: "overview", label: "Vue d'ensemble", icon: "📊", badge: resourceCount > 0 ? resourceCount : undefined },
    { key: "readme", label: "README", icon: "📖", badge: readme?.content ? 1 : undefined },
    { key: "milestones", label: "Jalons & Tâches", icon: "📋", badge: totalTasks > 0 ? totalTasks : undefined },
    { key: "files", label: "Fichiers", icon: "📁", badge: dirEntries.length > 0 ? dirEntries.length : undefined },
    { key: "resources", label: "Ressources", icon: "🐳", badge: (project.docker_containers?.length || 0) + (project.domains?.length || 0) + (project.databases?.length || 0) || undefined },
    { key: "links", label: "Liens", icon: "🔗" },
    { key: "prompt", label: "Prompt", icon: "🚀" },
  ];

  // Format bytes
  const fmtSize = (b: number) => b < 1024 ? `${b}o` : b < 1048576 ? `${(b / 1024).toFixed(1)}ko` : `${(b / 1048576).toFixed(1)}Mo`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1600px] h-[92vh] overflow-hidden p-0 gap-0 rounded-2xl" showCloseButton={false}>
        {/* ── Header ── */}
        <div className="border-b border-[#2d3f5e] px-6 py-4 space-y-3">
          {/* Row 1: Name + controls */}
          <div className="flex items-center justify-between gap-4">
            {editingName ? (
              <form onSubmit={(e) => { e.preventDefault(); handleNameSave(); }} className="flex-1 flex gap-2">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus className="h-8 text-lg font-semibold" />
                <Button type="submit" size="sm" className="h-8">✓</Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditingName(false)}>✕</Button>
              </form>
            ) : (
              <h2
                className="text-xl font-semibold truncate flex-1 cursor-pointer hover:text-[#00d9ff] transition-colors"
                onClick={() => { setEditingName(true); setEditName(project.name); }}
                title="Cliquer pour renommer"
              >
                {project.name}
              </h2>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <Select value={project.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={project.priority} onValueChange={handlePriorityChange}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={project.category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <button onClick={() => onOpenChange(false)} className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center text-[#8899b3] hover:text-[#e0e8f0] hover:bg-[#243352] transition-colors text-lg" title="Fermer">✕</button>
            </div>
          </div>

          {/* Row 2: Description + agent + repo_path */}
          <div className="flex items-center gap-3 text-xs text-[#8899b3] flex-wrap">
            {editingDesc ? (
              <form onSubmit={(e) => { e.preventDefault(); handleDescSave(); }} className="flex-1 flex gap-2 min-w-[200px]">
                <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} autoFocus className="h-7 text-xs flex-1" placeholder="Description du projet..." />
                <Button type="submit" size="sm" className="h-7 text-[11px]">✓</Button>
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setEditingDesc(false)}>✕</Button>
              </form>
            ) : (
              <span
                className="truncate flex-1 cursor-pointer hover:text-[#00d9ff] transition-colors"
                onClick={() => { setEditingDesc(true); setEditDesc(project.description); }}
                title="Cliquer pour modifier la description"
              >
                {project.description || "— Cliquer pour ajouter une description —"}
              </span>
            )}

            <Select value={project.assigned_agent || "_none"} onValueChange={handleAgentChange}>
              <SelectTrigger className="w-36 h-7 text-[11px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Aucun agent —</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.type === "opencode" ? "⚡" : a.type === "mcp" ? "🔌" : "🐳"} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {editingRepoPath ? (
              <form onSubmit={(e) => { e.preventDefault(); handleRepoPathSave(); }} className="flex gap-1">
                <Input value={editRepoPath} onChange={(e) => setEditRepoPath(e.target.value)} autoFocus className="h-7 text-[10px] font-mono w-48" placeholder="1_infra/13_Portal" />
                <Button type="submit" size="sm" className="h-7 text-[10px]">✓</Button>
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setEditingRepoPath(false)}>✕</Button>
              </form>
            ) : (
              <span
                className="font-mono text-[10px] cursor-pointer hover:text-[#00ff88] transition-colors"
                onClick={() => { setEditingRepoPath(true); setEditRepoPath(project.repo_path || ""); }}
                title="Cliquer pour modifier le chemin du dépôt"
              >
                📂 {project.repo_path || "— chemin non défini —"}
              </span>
            )}

            <span className="shrink-0">MAJ {new Date(project.updated_at).toLocaleDateString("fr-FR")}</span>
          </div>

          {/* Row 3: CWDs (from sessions) */}
          {uniqueCwds.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-[#8899b3]">
              <span className="shrink-0 font-medium">CWDs:</span>
              {uniqueCwds.slice(0, 5).map((cwd) => (
                <code key={cwd} className="px-1.5 py-0.5 rounded bg-[#243352] border border-[#2d3f5e] font-mono truncate max-w-[250px]">{cwd}</code>
              ))}
              {uniqueCwds.length > 5 && <span className="text-[#00d9ff]">+{uniqueCwds.length - 5}</span>}
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-xs rounded-t-md border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? "border-[#00d9ff] text-[#00d9ff] font-medium bg-[#00d9ff]/5"
                    : "border-transparent text-[#8899b3] hover:text-[#e0e8f0]"
                }`}
              >
                <span className="text-[10px]">{tab.icon}</span>
                {tab.label}
                {tab.badge !== undefined && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1">{tab.badge}</Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="overflow-y-auto px-6 py-5 flex-1" style={{ maxHeight: "calc(92vh - 180px)" }}>

          {/* ── Overview tab ── */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Progress bar */}
              {totalTasks > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#8899b3]">Progression globale</span>
                    <span className="font-medium">{doneTasks}/{totalTasks} tâches ({progressPct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-[#00ff88] rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}

              {/* KPI cards */}
              <div className="grid grid-cols-4 gap-3">
                <KpiCard icon="🐳" label="Conteneurs" value={project.docker_containers?.length || 0} color="text-[#00d9ff]" />
                <KpiCard icon="🌐" label="Domaines" value={project.domains?.length || 0} color="text-[#00ff88]" />
                <KpiCard icon="🗄️" label="Bases de données" value={project.databases?.length || 0} color="text-[#ffbe0b]" />
                <KpiCard icon="⚡" label="Sessions" value={project.opencode_sessions?.length || 0} color="text-purple-400" />
              </div>

              {/* Blocked alert */}
              {blockedTasks > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#ff4757]/10 border border-[#ff4757]/20 text-xs text-[#ff4757]">
                  <span>⚠️</span>
                  <span>{blockedTasks} tâche{blockedTasks > 1 ? "s" : ""} bloquée{blockedTasks > 1 ? "s" : ""}</span>
                </div>
              )}

              {/* README preview */}
              {readme?.content && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-[#8899b3]">📖 README</h3>
                    <button onClick={() => setActiveTab("readme")} className="text-xs text-[#00d9ff] hover:underline">Voir complet →</button>
                  </div>
                  <pre className="text-xs bg-[#1a2744] border border-[#2d3f5e] rounded-md p-3 whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono text-[#e0e8f0] leading-relaxed">
                    {readme.content.slice(0, 1500)}{readme.content.length > 1500 ? "…" : ""}
                  </pre>
                </div>
              )}

              {/* Resource summary */}
              {(project.docker_containers?.length || 0) > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-[#8899b3]">Conteneurs Docker</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {project.docker_containers!.map((c, i) => (
                      <Badge key={i} variant="outline" className="text-[11px] font-mono hover:bg-[#00d9ff]/10 transition-colors">
                        🐙 {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(project.domains?.length || 0) > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-[#8899b3]">Domaines</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {project.domains!.map((d, i) => (
                      <a key={i} href={`https://${d}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-[#00d9ff] hover:underline bg-[#00d9ff]/5 border border-[#00d9ff]/20 px-2 py-1 rounded-md">
                        🌐 {d} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Milestone summary */}
              {project.milestones && project.milestones.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-[#8899b3]">Jalons récents</h3>
                  <div className="space-y-1.5">
                    {project.milestones.slice(0, 3).map((m) => {
                      const mTasks = m.tasks || [];
                      const mDone = mTasks.filter(t => t.status === "done").length;
                      const mTotal = mTasks.length;
                      const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
                      const mStyle = STATUS_STYLES[m.status] || STATUS_STYLES["pending"];
                      return (
                        <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-md border border-[#2d3f5e] text-xs">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${mStyle.dot}`} />
                          <span className="flex-1 truncate">{m.title}</span>
                          {mTotal > 0 && (
                            <>
                              <span className="text-[#8899b3]">{mDone}/{mTotal}</span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-[#00ff88] rounded-full" style={{ width: `${mPct}%` }} />
                              </div>
                            </>
                          )}
                          <Badge variant="outline" className={`text-[9px] ${mStyle.bg}`}>{mStyle.label}</Badge>
                        </div>
                      );
                    })}
                    {project.milestones.length > 3 && (
                      <button onClick={() => setActiveTab("milestones")} className="text-xs text-[#00d9ff] hover:underline">
                        Voir les {project.milestones.length} jalons →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {resourceCount === 0 && totalTasks === 0 && !readme?.content && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-[#8899b3]">Aucune ressource, tâche ni README associé</p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" size="sm" onClick={handleDiscover}>🔍 Découvrir Docker</Button>
                    <Button variant="outline" size="sm" onClick={() => { setEditingRepoPath(true); setEditRepoPath(project.repo_path || ""); }}>📂 Définir le chemin</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── README tab ── */}
          {activeTab === "readme" && (
            <div className="space-y-3">
              {readme?.content ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-[#8899b3]">
                      <span>📄 {readme.path}</span>
                      {project.repo_path && <code className="text-[10px] px-1.5 py-0.5 rounded bg-[#243352] border border-[#2d3f5e] font-mono">{project.repo_path}/{readme.path}</code>}
                    </div>
                    <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={() => navigator.clipboard.writeText(readme.content || "").then(() => toast.success("README copié"))}>
                      📋 Copier
                    </Button>
                  </div>
                  <pre className="text-sm bg-[#1a2744] border border-[#2d3f5e] rounded-lg p-4 whitespace-pre-wrap font-mono text-[#e0e8f0] leading-relaxed">
                    {readme.content}
                  </pre>
                </>
              ) : (
                <div className="text-center py-12 space-y-3">
                  <p className="text-sm text-[#8899b3]">Aucun README trouvé</p>
                  {!project.repo_path && (
                    <Button variant="outline" size="sm" onClick={() => { setEditingRepoPath(true); setEditRepoPath(""); }}>
                      📂 Définir le chemin du dépôt
                    </Button>
                  )}
                  {project.repo_path && (
                    <p className="text-xs text-[#8899b3]">Aucun README.md dans <code className="font-mono px-1 py-0.5 rounded bg-[#243352]">{project.repo_path}</code></p>
                  )}
                </div>
              )}
            </div>
          )}

  {/* ── Milestones tab ── */}
  {activeTab === "milestones" && (
  <div className="space-y-3">
  {/* Add milestone + extract tasks */}
  <div className="flex gap-2">
  <Input
  placeholder="Nouveau jalon..."
  value={newMilestoneTitle}
  onChange={(e) => setNewMilestoneTitle(e.target.value)}
  onKeyDown={(e) => e.key === "Enter" && handleAddMilestone()}
  className="flex-1"
  />
  <Button onClick={handleAddMilestone} size="sm">Ajouter</Button>
  {project.repo_path && (
  <Button variant="outline" size="sm" className="text-xs h-9 border-[#00ff88]/30 text-[#00ff88] hover:bg-[#00ff88]/10 shrink-0" onClick={handleExtractTasks} disabled={extracting}>
  {extracting ? "⏳ Scan…" : "📥 Extraire .md"}
  </Button>
  )}
  </div>

              {project.milestones?.map((milestone: MilestoneWithTasks) => {
                const mTasks = milestone.tasks || [];
                const mDone = mTasks.filter(t => t.status === "done").length;
                const mTotal = mTasks.length;
                const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
                const mStyle = STATUS_STYLES[milestone.status] || STATUS_STYLES["pending"];
                return (
                  <div key={milestone.id} className="border border-[#2d3f5e] rounded-lg p-4 space-y-3">
                    {/* Milestone header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          onClick={() => handleMilestoneStatusCycle(milestone.id, milestone.status)}
                          className={`shrink-0 text-[10px] px-2 py-1 rounded-md border transition-colors cursor-pointer ${mStyle.bg} ${mStyle.dot.replace("bg-", "border-")}`}
                          title="Clic pour changer le statut"
                        >
                          {mStyle.label}
                        </button>
                        <h4 className="text-sm font-medium truncate">{milestone.title}</h4>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {mTotal > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[#8899b3] font-mono">{mDone}/{mTotal}</span>
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-[#00ff88] rounded-full transition-all" style={{ width: `${mPct}%` }} />
                            </div>
                            <span className="text-[10px] text-[#8899b3]">{mPct}%</span>
                          </div>
                        )}
                        <button
                          onClick={() => handleDeleteMilestone(milestone.id)}
                          className={`transition-colors text-xs px-1.5 ${
                            confirmDelete?.type === "milestone" && confirmDelete?.id === milestone.id
                              ? "text-[#ff4757] font-medium" : "text-[#8899b3] hover:text-[#ff4757]"
                          }`}
                        >
                          {confirmDelete?.type === "milestone" && confirmDelete?.id === milestone.id ? "Confirmer ?" : "✕"}
                        </button>
                      </div>
                    </div>

                    {milestone.description && <p className="text-xs text-[#8899b3]">{milestone.description}</p>}

                    {/* Tasks */}
                    {mTasks.length > 0 && (
                      <div className="space-y-1">
                        {mTasks.map((task) => {
                          const tStyle = TASK_STATUS_STYLES[task.status] || TASK_STATUS_STYLES.todo;
                          const isEditing = editingTaskId === task.id;
                          return (
                            <div key={task.id} className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 ${tStyle.bg} group`}>
                              <button
                                onClick={() => handleTaskStatusCycle(task.id, task.status)}
                                className={`w-2.5 h-2.5 rounded-full shrink-0 cursor-pointer hover:ring-2 hover:ring-[#00d9ff]/50 transition-all ${tStyle.dot}`}
                                title={`${tStyle.label} — clic pour changer`}
                              />
                              {isEditing ? (
                                <form onSubmit={(e) => { e.preventDefault(); handleTaskTitleSave(task.id); }} className="flex-1 flex gap-1">
                                  <Input value={editTaskTitle} onChange={(e) => setEditTaskTitle(e.target.value)} onBlur={() => handleTaskTitleSave(task.id)} autoFocus className="h-6 text-xs flex-1" />
                                </form>
                              ) : (
                                <span
                                  onDoubleClick={() => { setEditingTaskId(task.id); setEditTaskTitle(task.title); }}
                                  className={`flex-1 cursor-text ${task.status === "done" ? "line-through text-[#8899b3]" : ""}`}
                                  title="Double-clic pour renommer"
                                >
                                  {task.title}
                                </span>
                              )}
                              {task.assignee && (
                                <span className="text-[10px] text-[#8899b3] shrink-0" title={task.assignee}>
                                  🤖 {task.assignee.split(":").pop()}
                                </span>
                              )}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Select value={task.assignee || "_none"} onValueChange={(v) => handleTaskAssignee(task.id, v === "_none" ? "" : String(v))}>
                                  <SelectTrigger className="h-5 w-5 p-0 border-0 bg-transparent">
                                    <span className="text-[10px]">👤</span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_none">— Aucun —</SelectItem>
                                    {agents.map((a) => (
                                      <SelectItem key={a.id} value={a.id}>
                                        {a.type === "opencode" ? "⚡" : a.type === "mcp" ? "🔌" : "🐳"} {a.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  className={`transition-colors ${
                                    confirmDelete?.type === "task" && confirmDelete?.id === task.id
                                      ? "text-[#ff4757] font-medium" : "text-[#8899b3] hover:text-[#ff4757]"
                                  }`}
                                >
                                  {confirmDelete?.type === "task" && confirmDelete?.id === task.id ? "✓" : "✕"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add task */}
                    <div className="flex gap-2 mt-1">
                      <Input
                        placeholder="Nouvelle tâche..."
                        className="h-7 text-xs"
                        value={newTaskTitles[milestone.id] || ""}
                        onChange={(e) => setNewTaskTitles((prev) => ({ ...prev, [milestone.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && handleAddTask(milestone.id)}
                      />
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAddTask(milestone.id)}>+</Button>
                    </div>
                  </div>
                );
              })}

              {(!project.milestones || project.milestones.length === 0) && (
                <div className="text-center py-8 text-sm text-[#8899b3]">Aucun jalon pour le moment</div>
              )}
            </div>
          )}

          {/* ── Files tab ── */}
          {activeTab === "files" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">Contenu du répertoire</h3>
                  {project.repo_path && (
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-[#243352] border border-[#2d3f5e] font-mono text-[#00d9ff]">{project.repo_path}</code>
                  )}
                </div>
                <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={() => {
                  setDirLoading(true);
                  fetch(`/api/projects/${project.id}/dir`).then(r => r.json()).then(d => { setDirEntries(d.entries || []); setDirLoading(false); });
                }}>
                  🔄 Rafraîchir
                </Button>
              </div>

              {dirLoading ? (
                <p className="text-xs text-[#8899b3] text-center py-8">Chargement…</p>
              ) : dirEntries.length > 0 ? (
                <div className="border border-[#2d3f5e] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#243352] text-[#8899b3]">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Nom</th>
                        <th className="text-right px-3 py-2 font-medium w-20">Taille</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dirEntries.map((entry, i) => (
                        <tr key={i} className="border-t border-[#2d3f5e]/50 hover:bg-[#243352]/50 transition-colors">
                          <td className="px-3 py-1.5">
                            <span className="mr-2">{entry.type === "dir" ? "📁" : fileIcon(entry.name)}</span>
                            <span className={entry.type === "dir" ? "text-[#00d9ff] font-medium" : "text-[#e0e8f0]"}>{entry.name}</span>
                          </td>
                          <td className="text-right px-3 py-1.5 text-[#8899b3] font-mono">
                            {entry.type === "dir" ? "—" : fmtSize(entry.size)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-[#8899b3]">
                    {project.repo_path ? "Répertoire vide ou introuvable" : "Chemin du dépôt non défini"}
                  </p>
                  {!project.repo_path && (
                    <Button variant="outline" size="sm" onClick={() => { setEditingRepoPath(true); setEditRepoPath(""); }}>
                      📂 Définir le chemin
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Resources tab ── */}
          {activeTab === "resources" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Ressources du projet</h3>
                <Button variant="outline" size="sm" onClick={handleDiscover}>🔍 Redécouvrir</Button>
              </div>

              <ResourceSection icon="🐳" title="Conteneurs Docker" count={project.docker_containers?.length || 0}>
                {project.docker_containers?.length ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {project.docker_containers.map((c, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md border border-[#2d3f5e] bg-muted/30 text-xs">
                        <span className="text-[#00ff88] text-base">●</span>
                        <span className="font-mono flex-1">{c}</span>
                      </div>
                    ))}
                  </div>
                ) : undefined}
              </ResourceSection>

              <ResourceSection icon="🌐" title="Domaines Tailscale" count={project.domains?.length || 0}>
                {project.domains?.length ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {project.domains.map((d, i) => (
                      <a key={i} href={`https://${d}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2 rounded-md border border-[#00d9ff]/20 bg-[#00d9ff]/5 text-xs hover:bg-[#00d9ff]/10 transition-colors">
                        <span className="text-[#00ff88] text-base">●</span>
                        <span className="font-mono flex-1 text-[#00d9ff]">{d}</span>
                        <span className="text-[#8899b3]">↗</span>
                      </a>
                    ))}
                  </div>
                ) : undefined}
              </ResourceSection>

              <ResourceSection icon="🗄️" title="Bases de données" count={project.databases?.length || 0}>
                {project.databases?.length ? (
                  <div className="grid grid-cols-1 gap-2">
                    {project.databases.map((db, i) => (
                      <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-xs ${DB_TYPE_COLORS[db.type] || "border-[#2d3f5e] bg-muted/50"}`}>
                        <span className="text-xl">{DB_TYPE_ICONS[db.type] || "🗄️"}</span>
                        <div className="flex-1">
                          <span className="font-medium capitalize">{db.type}</span>
                          <p className="text-[#8899b3] font-mono mt-0.5">{db.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : undefined}
              </ResourceSection>

              <ResourceSection icon="⚡" title="Sessions" count={project.opencode_sessions?.length || 0}>
                {project.opencode_sessions?.length ? (
                  <div className="space-y-2">
                    {project.opencode_sessions.map((s) => {
                      const timeAgo = s.time_updated
                        ? new Date(Math.floor(s.time_updated * 1000)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "";
                      return (
                        <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg bg-[#1a2744] border border-[#2d3f5e]/50 hover:border-[#00d9ff]/30 transition-colors">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${s.is_active ? "bg-[#00ff88] shadow-[0_0_6px_rgba(0,255,136,0.4)]" : s.is_recent ? "bg-[#ffbe0b]" : "bg-[#8899b3]"}`} />
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm font-medium text-[#e0e8f0] truncate">{s.title}</p>
                            <p className="text-[11px] text-[#8899b3] truncate font-mono">{s.cwd}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant="outline" className="text-[10px] border-[#2d3f5e] text-[#00d9ff]">{s.model?.split("/").pop() || s.flavor}</Badge>
                            <div className="flex items-center gap-2 text-[10px] text-[#8899b3]">
                              <span>{s.message_count} msg</span>
                              {timeAgo && <span>{timeAgo}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : undefined}
              </ResourceSection>

              {resourceCount === 0 && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-[#8899b3]">Aucune ressource découverte</p>
                  <Button variant="outline" size="sm" onClick={handleDiscover}>🔍 Découvrir Docker</Button>
                </div>
              )}
            </div>
          )}

          {/* ── Links tab ── */}
          {activeTab === "links" && (
            <div className="space-y-3">
              {project.domains && project.domains.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-[#8899b3]">Accès directs</h3>
                  {project.domains.map((d, i) => (
                    <a key={i} href={`https://${d}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#00d9ff]/20 bg-[#00d9ff]/5 hover:bg-[#00d9ff]/10 transition-colors">
                      <span className="text-lg">🌐</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#00d9ff]">{d}</p>
                        <p className="text-[10px] text-[#8899b3]">Tailscale Serve — HTTPS</p>
                      </div>
                      <span className="text-[#00d9ff]">↗</span>
                    </a>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-[#8899b3]">Dépôts GitHub</h3>
                <a href={`https://github.com/4x10m?q=${encodeURIComponent(project.name.split(" — ")[0])}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#2d3f5e] hover:border-[#00d9ff]/30 transition-colors text-xs">
                  <span className="text-lg">📦</span>
                  <span className="flex-1 text-[#8899b3]">Rechercher dans 4x10m/* — {project.name.split(" — ")[0]}</span>
                  <span className="text-[#8899b3]">↗</span>
                </a>
              </div>

              {project.repo_path && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-[#8899b3]">Chemin local</h3>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#2d3f5e] text-xs">
                    <span className="text-lg">📂</span>
                    <code className="flex-1 font-mono text-[#00ff88]">/home/debian/Codebase/{project.repo_path}</code>
                  </div>
                </div>
              )}

{project.domains?.length === 0 && !project.repo_path && (
  <div className="text-center py-8 text-sm text-[#8899b3]">Aucun lien configuré</div>
)}
</div>
)}

{/* ── Prompt tab ── */}
{activeTab === "prompt" && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium">🚀 Prompt rapide — Envoyer à un harnais</h3>
      <Badge variant="outline" className="text-[10px] border-[#2d3f5e] text-[#8899b3]">
        {project.name}
      </Badge>
    </div>

    {/* Harness selector */}
    <div>
      <label className="text-[11px] text-[#8899b3] font-medium mb-1.5 block">Harnais cible</label>
      <div className="flex gap-1.5 flex-wrap">
        {HARNESS_OPTIONS.map((h) => (
          <button
            key={h.value}
            onClick={() => setQuickHarness(h.value)}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors flex items-center gap-1.5 ${
              quickHarness === h.value
                ? "border-[#00d9ff] bg-[#00d9ff]/10 text-[#00d9ff] font-medium"
                : "border-[#2d3f5e] text-[#8899b3] hover:border-[#00d9ff]/30 hover:text-[#e0e8f0]"
            }`}
          >
            <span>{h.icon}</span>
            {h.label}
          </button>
        ))}
      </div>
    </div>

    {/* CWD + Model */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="text-[11px] text-[#8899b3] font-medium mb-1.5 block">CWD (répertoire de travail)</label>
        <Input
          value={quickCwd}
          onChange={(e) => setQuickCwd(e.target.value)}
          placeholder="/home/debian/Codebase/..."
          className="h-8 text-xs font-mono"
        />
        {/* CWD quick-select from sessions */}
        {uniqueCwds.length > 1 && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {uniqueCwds.slice(0, 5).map((c) => (
              <button
                key={c}
                onClick={() => setQuickCwd(c)}
                className={`text-[9px] px-1.5 py-0.5 rounded border font-mono truncate max-w-[200px] transition-colors ${
                  quickCwd === c
                    ? "border-[#00ff88]/50 bg-[#00ff88]/10 text-[#00ff88]"
                    : "border-[#2d3f5e] text-[#8899b3] hover:border-[#00d9ff]/30"
                }`}
                title={c}
              >
                {c.split("/").slice(-2).join("/")}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="text-[11px] text-[#8899b3] font-medium mb-1.5 block">Modèle</label>
        <select
          value={quickModel}
          onChange={(e) => setQuickModel(e.target.value)}
          className="h-8 text-xs w-full bg-transparent border border-[#2d3f5e] rounded-md px-2 text-[#e0e8f0]"
        >
          <option value="default">Défaut</option>
          <option value="claude-sonnet">Claude Sonnet</option>
          <option value="glm-5.1">GLM-5.1</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="deepseek">DeepSeek</option>
        </select>
      </div>
    </div>

    {/* Prompt textarea */}
    <div>
      <label className="text-[11px] text-[#8899b3] font-medium mb-1.5 block">Prompt</label>
      <textarea
        value={quickPrompt}
        onChange={(e) => setQuickPrompt(e.target.value)}
        placeholder="Décrivez la tâche à exécuter…"
        className="w-full min-h-[120px] text-xs bg-[#1a2744] border border-[#2d3f5e] rounded-md p-3 resize-y focus:outline-none focus:ring-1 focus:ring-[#00d9ff] text-[#e0e8f0] placeholder:text-[#8899b3]/50"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleQuickEnqueue();
          }
        }}
      />
      <p className="text-[10px] text-[#8899b3] mt-1">Ctrl+Enter pour envoyer — {quickPrompt.length} car.</p>
    </div>

    {/* Enqueue button */}
    <div className="flex gap-2 items-center">
      <Button
        size="sm"
        className="text-xs h-9 bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 hover:bg-[#00ff88]/30"
        onClick={handleQuickEnqueue}
        disabled={enqueueing || !quickPrompt.trim()}
      >
        {enqueueing
          ? "⏳ Envoi…"
          : `${HARNESS_OPTIONS.find(h => h.value === quickHarness)?.icon || "🚀"} Enqueue → ${HARNESS_OPTIONS.find(h => h.value === quickHarness)?.label || ""}`}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-xs h-9"
        onClick={() => {
          navigator.clipboard.writeText(quickPrompt);
          toast.success("Prompt copié");
        }}
        disabled={!quickPrompt.trim()}
      >
        📋 Copier
      </Button>
      {quickPrompt.trim() && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-9 text-[#ff4757]"
          onClick={() => setQuickPrompt("")}
        >
          ✕ Effacer
        </Button>
      )}
    </div>

    {/* Info box */}
    <div className="border border-[#2d3f5e] rounded-lg p-3 text-xs text-[#8899b3] bg-[#1a2744]/50 space-y-1.5">
      <p className="font-medium text-[#e0e8f0]">💡 Utilisation</p>
      <p>Le prompt sera ajouté à la <span className="text-[#00d9ff]">file d'attente</span> et assigné au harnais sélectionné.</p>
      <p>CWD détermine le répertoire de travail. Il est pré-rempli depuis les sessions existantes.</p>
      <p>Suivez l'état dans le FAB → File d'attente ou via <code className="px-1 py-0.5 rounded bg-[#243352] text-[#00d9ff]">/api/prompt-queue</code></p>
    </div>
  </div>
)}
</div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──

function KpiCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="border border-[#2d3f5e] rounded-lg px-4 py-3 text-center space-y-1">
      <span className="text-lg">{icon}</span>
      <p className={`text-2xl font-bold tabular-nums ${value > 0 ? color : "text-[#8899b3]"}`}>{value}</p>
      <p className="text-[10px] text-[#8899b3] uppercase tracking-wider">{label}</p>
    </div>
  );
}

function ResourceSection({ icon, title, count, children }: {
  icon: string; title: string; count: number; children?: React.ReactNode;
}) {
  return (
    <div className="border border-[#2d3f5e] rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h4 className="text-sm font-medium flex-1">{title}</h4>
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
      </div>
      {children || <p className="text-xs text-[#8899b3]">Aucun élément</p>}
    </div>
  );
}

/** File icon based on extension */
function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "🟦", tsx: "🟦", js: "🟨", jsx: "🟨", json: "📋", md: "📝",
    py: "🐍", yml: "⚙️", yaml: "⚙️", toml: "⚙️", env: "🔐",
    sh: "📜", bash: "📜", sql: "🗄️", css: "🎨", html: "🌐",
    dockerfile: "🐳", gitignore: "🙈", lock: "🔒", svg: "🖼️",
    png: "🖼️", jpg: "🖼️", ico: "🖼️",
  };
  return map[ext] || (name === "Dockerfile" ? "🐳" : name === "Makefile" ? "🔧" : "📄");
}
