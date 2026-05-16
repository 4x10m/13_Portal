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
  idea: "Idée",
  "in-progress": "En cours",
  "on-hold": "En pause",
  done: "Terminé",
  pending: "En attente",
  todo: "À faire",
  blocked: "Bloqué",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
};

const PRIORITY_STYLES: Record<string, { color: string; bg: string }> = {
  low: { color: "text-muted-foreground", bg: "bg-muted/50" },
  medium: { color: "text-ax-blue", bg: "bg-ax-blue/10" },
  high: { color: "text-ax-yellow", bg: "bg-ax-yellow/10" },
  critical: { color: "text-ax-red", bg: "bg-ax-red/10" },
};

const STATUS_STYLES: Record<string, { dot: string; label: string; bg: string }> = {
  idea: { dot: "bg-ax-yellow", label: "Idée", bg: "bg-ax-yellow/10" },
  "in-progress": { dot: "bg-ax-blue", label: "En cours", bg: "bg-ax-blue/10" },
  "on-hold": { dot: "bg-muted-foreground", label: "En pause", bg: "bg-muted/50" },
  done: { dot: "bg-ax-green", label: "Terminé", bg: "bg-ax-green/10" },
};

const CATEGORY_LABELS: Record<string, string> = {
  infra: "Infra", ai: "IA", apps: "Apps", perso: "Perso", devops: "DevOps", general: "Général",
};

const TASK_STATUS_CYCLE: TaskStatus[] = ["todo", "in-progress", "done", "blocked"];

const TASK_STATUS_STYLES: Record<TaskStatus, { dot: string; label: string; bg: string }> = {
  todo: { dot: "bg-muted-foreground", label: "À faire", bg: "bg-muted/50" },
  "in-progress": { dot: "bg-ax-blue", label: "En cours", bg: "bg-ax-blue/10" },
  done: { dot: "bg-ax-green", label: "Terminé", bg: "bg-ax-green/10" },
  blocked: { dot: "bg-ax-red", label: "Bloqué", bg: "bg-ax-red/10" },
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
type TabKey = "overview" | "milestones" | "resources" | "links";

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
    }
  }, [open]);

  if (!project) return null;

  // ── Computed values ──

  const totalTasks = project.milestones?.reduce((s, m) => s + (m.tasks?.length || 0), 0) || 0;
  const doneTasks = project.milestones?.reduce((s, m) => s + (m.tasks?.filter(t => t.status === "done").length || 0), 0) || 0;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const resourceCount = (project.docker_containers?.length || 0) + (project.domains?.length || 0) + (project.databases?.length || 0) + (project.opencode_sessions?.length || 0);
  const blockedTasks = project.milestones?.reduce((s, m) => s + (m.tasks?.filter(t => t.status === "blocked").length || 0), 0) || 0;

  // ── Handlers ──

  const handleStatusChange = async (newStatus: string | null) => {
    if (!newStatus) return;
    try {
      await fetch(`/api/roadmap/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus as ProjectStatus }),
      });
      toast.success(`Projet → ${STATUS_LABELS[newStatus] || newStatus}`);
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
      toast.success(`Priorité → ${PRIORITY_LABELS[newPriority] || newPriority}`);
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
      toast.success(`Catégorie → ${CATEGORY_LABELS[newCategory] || newCategory}`);
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
      toast.success(`Tâche → ${STATUS_LABELS[nextStatus] || nextStatus}`);
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
      toast.success(`Jalon → ${STATUS_LABELS[nextStatus] || nextStatus}`);
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
      toast.success(`${data.updated_projects} projets mis à jour — ${data.scanned_containers} conteneurs scannés`);
      onProjectUpdated();
    } catch { toast.error("Erreur découverte Docker"); }
  };

  // ── Tab definitions ──

  const tabs: { key: TabKey; label: string; icon: string; badge?: number }[] = [
    { key: "overview", label: "Vue d'ensemble", icon: "📊", badge: resourceCount > 0 ? resourceCount : undefined },
    { key: "milestones", label: "Jalons & Tâches", icon: "📋", badge: totalTasks > 0 ? totalTasks : undefined },
    { key: "resources", label: "Ressources", icon: "🐳", badge: (project.docker_containers?.length || 0) + (project.domains?.length || 0) + (project.databases?.length || 0) || undefined },
    { key: "links", label: "Liens", icon: "🔗" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0 gap-0">
        {/* ── Header ── */}
        <div className="border-b border-border px-6 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold truncate flex-1">{project.name}</h2>
            <div className="flex items-center gap-2 shrink-0">
              <Select value={project.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idea">Idée</SelectItem>
                  <SelectItem value="in-progress">En cours</SelectItem>
                  <SelectItem value="on-hold">En pause</SelectItem>
                  <SelectItem value="done">Terminé</SelectItem>
                </SelectContent>
              </Select>
              <Select value={project.priority} onValueChange={handlePriorityChange}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="critical">Critique</SelectItem>
                </SelectContent>
              </Select>
              <Select value={project.category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="infra">Infra</SelectItem>
                  <SelectItem value="ai">IA</SelectItem>
                  <SelectItem value="apps">Apps</SelectItem>
                  <SelectItem value="perso">Perso</SelectItem>
                  <SelectItem value="devops">DevOps</SelectItem>
                  <SelectItem value="general">Général</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description + meta row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {project.description && <span className="truncate flex-1">{project.description}</span>}
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
            <span>Mis à jour {new Date(project.updated_at).toLocaleDateString("fr-FR")}</span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-xs rounded-t-md border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? "border-ax-blue text-ax-blue font-medium bg-ax-blue/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
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
        <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: "calc(95vh - 160px)" }}>

          {/* ── Overview tab ── */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Progress bar */}
              {totalTasks > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progression globale</span>
                    <span className="font-medium">{doneTasks}/{totalTasks} tâches ({progressPct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-ax-green rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}

              {/* KPI cards */}
              <div className="grid grid-cols-4 gap-3">
                <KpiCard icon="🐳" label="Conteneurs" value={project.docker_containers?.length || 0} color="text-ax-blue" />
                <KpiCard icon="🌐" label="Domaines" value={project.domains?.length || 0} color="text-ax-green" />
                <KpiCard icon="🗄️" label="Bases de données" value={project.databases?.length || 0} color="text-ax-yellow" />
                <KpiCard icon="⚡" label="Sessions OC" value={project.opencode_sessions?.length || 0} color="text-purple-400" />
              </div>

              {/* Status alerts */}
              {blockedTasks > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-ax-red/10 border border-ax-red/20 text-xs text-ax-red">
                  <span>⚠️</span>
                  <span>{blockedTasks} tâche{blockedTasks > 1 ? "s" : ""} bloquée{blockedTasks > 1 ? "s" : ""}</span>
                </div>
              )}

              {/* Resource summary — quick glance */}
              {(project.docker_containers?.length || 0) > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Conteneurs Docker</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {project.docker_containers!.map((c, i) => (
                      <Badge key={i} variant="outline" className="text-[11px] font-mono hover:bg-ax-blue/10 transition-colors">
                        🐙 {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(project.domains?.length || 0) > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Domaines Tailscale</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {project.domains!.map((d, i) => (
                      <a
                        key={i}
                        href={`https://${d}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-ax-blue hover:underline bg-ax-blue/5 border border-ax-blue/20 px-2 py-1 rounded-md transition-colors hover:bg-ax-blue/10"
                      >
                        🌐 {d} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {(project.databases?.length || 0) > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Bases de données</h3>
                  <div className="flex flex-wrap gap-2">
                    {project.databases!.map((db, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs ${DB_TYPE_COLORS[db.type] || "border-border bg-muted/50"}`}
                      >
                        <span className="text-base">{DB_TYPE_ICONS[db.type] || "🗄️"}</span>
                        <div>
                          <span className="font-medium capitalize">{db.type}</span>
                          <span className="text-muted-foreground ml-1.5 font-mono">{db.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Milestone summary on overview */}
              {project.milestones && project.milestones.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Jalons récents</h3>
                  <div className="space-y-1.5">
                    {project.milestones.slice(0, 3).map((m) => {
                      const mTasks = m.tasks || [];
                      const mDone = mTasks.filter(t => t.status === "done").length;
                      const mTotal = mTasks.length;
                      const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
                      const mStyle = STATUS_STYLES[m.status] || STATUS_STYLES["pending"];
                      return (
                        <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border text-xs">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${mStyle.dot}`} />
                          <span className="flex-1 truncate">{m.title}</span>
                          {mTotal > 0 && (
                            <>
                              <span className="text-muted-foreground">{mDone}/{mTotal}</span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-ax-green rounded-full" style={{ width: `${mPct}%` }} />
                              </div>
                            </>
                          )}
                          <Badge variant="outline" className={`text-[9px] ${mStyle.bg} ${mStyle.dot.replace("bg-", "text-")}`}>
                            {mStyle.label}
                          </Badge>
                        </div>
                      );
                    })}
                    {project.milestones.length > 3 && (
                      <button onClick={() => setActiveTab("milestones")} className="text-xs text-ax-blue hover:underline">
                        Voir les {project.milestones.length} jalons →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {resourceCount === 0 && totalTasks === 0 && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">Aucune ressource ni tâche associée</p>
                  <Button variant="outline" size="sm" onClick={handleDiscover}>
                    🔍 Découvrir les ressources Docker
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Milestones tab ── */}
          {activeTab === "milestones" && (
            <div className="space-y-3">
              {/* Add milestone */}
              <div className="flex gap-2">
                <Input
                  placeholder="Nouveau jalon..."
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMilestone()}
                />
                <Button onClick={handleAddMilestone} size="sm">Ajouter</Button>
              </div>

              {project.milestones?.map((milestone: MilestoneWithTasks) => {
                const mTasks = milestone.tasks || [];
                const mDone = mTasks.filter(t => t.status === "done").length;
                const mTotal = mTasks.length;
                const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
                const mStyle = STATUS_STYLES[milestone.status] || STATUS_STYLES["pending"];
                return (
                  <div key={milestone.id} className="border border-border rounded-lg p-4 space-y-3">
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
                            <span className="text-[11px] text-muted-foreground font-mono">{mDone}/{mTotal}</span>
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-ax-green rounded-full transition-all" style={{ width: `${mPct}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground">{mPct}%</span>
                          </div>
                        )}
                        <button
                          onClick={() => handleDeleteMilestone(milestone.id)}
                          className={`transition-colors text-xs px-1.5 ${
                            confirmDelete?.type === "milestone" && confirmDelete?.id === milestone.id
                              ? "text-ax-red font-medium" : "text-muted-foreground hover:text-ax-red"
                          }`}
                        >
                          {confirmDelete?.type === "milestone" && confirmDelete?.id === milestone.id ? "Confirmer ?" : "✕"}
                        </button>
                      </div>
                    </div>

                    {milestone.description && (
                      <p className="text-xs text-muted-foreground">{milestone.description}</p>
                    )}

                    {/* Tasks */}
                    {mTasks.length > 0 && (
                      <div className="space-y-1">
                        {mTasks.map((task) => {
                          const tStyle = TASK_STATUS_STYLES[task.status] || TASK_STATUS_STYLES.todo;
                          const isEditing = editingTaskId === task.id;
                          return (
                            <div
                              key={task.id}
                              className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 ${tStyle.bg} group`}
                            >
                              <button
                                onClick={() => handleTaskStatusCycle(task.id, task.status)}
                                className={`w-2.5 h-2.5 rounded-full shrink-0 cursor-pointer hover:ring-2 hover:ring-ax-blue/50 transition-all ${tStyle.dot}`}
                                title={`${tStyle.label} — clic pour changer`}
                              />
                              {isEditing ? (
                                <form
                                  onSubmit={(e) => { e.preventDefault(); handleTaskTitleSave(task.id); }}
                                  className="flex-1 flex gap-1"
                                >
                                  <Input
                                    value={editTaskTitle}
                                    onChange={(e) => setEditTaskTitle(e.target.value)}
                                    onBlur={() => handleTaskTitleSave(task.id)}
                                    autoFocus
                                    className="h-6 text-xs flex-1"
                                  />
                                </form>
                              ) : (
                                <span
                                  onDoubleClick={() => { setEditingTaskId(task.id); setEditTaskTitle(task.title); }}
                                  className={`flex-1 cursor-text ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}
                                  title="Double-clic pour renommer"
                                >
                                  {task.title}
                                </span>
                              )}
                              {task.assignee && (
                                <span className="text-[10px] text-muted-foreground shrink-0" title={task.assignee}>
                                  🤖 {task.assignee.split(":").pop()}
                                </span>
                              )}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Select
                                  value={task.assignee || "_none"}
                                  onValueChange={(v) => handleTaskAssignee(task.id, v === "_none" ? "" : String(v))}
                                >
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
                                      ? "text-ax-red font-medium" : "text-muted-foreground hover:text-ax-red"
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
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Aucun jalon pour le moment
                </div>
              )}
            </div>
          )}

          {/* ── Resources tab ── */}
          {activeTab === "resources" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Ressources du projet</h3>
                <Button variant="outline" size="sm" onClick={handleDiscover}>
                  🔍 Redécouvrir
                </Button>
              </div>

              {/* Docker containers — full detail */}
              <ResourceSection
                icon="🐳"
                title="Conteneurs Docker"
                count={project.docker_containers?.length || 0}
              >
                {project.docker_containers?.length ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {project.docker_containers.map((c, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/30 text-xs">
                        <span className="text-ax-green text-base">●</span>
                        <span className="font-mono flex-1">{c}</span>
                      </div>
                    ))}
                  </div>
                ) : undefined}
              </ResourceSection>

              {/* Domains — clickable */}
              <ResourceSection
                icon="🌐"
                title="Domaines Tailscale"
                count={project.domains?.length || 0}
              >
                {project.domains?.length ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {project.domains.map((d, i) => (
                      <a
                        key={i}
                        href={`https://${d}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2 rounded-md border border-ax-blue/20 bg-ax-blue/5 text-xs hover:bg-ax-blue/10 transition-colors"
                      >
                        <span className="text-ax-green text-base">●</span>
                        <span className="font-mono flex-1 text-ax-blue">{d}</span>
                        <span className="text-muted-foreground">↗</span>
                      </a>
                    ))}
                  </div>
                ) : undefined}
              </ResourceSection>

              {/* Databases — with type icons */}
              <ResourceSection
                icon="🗄️"
                title="Bases de données"
                count={project.databases?.length || 0}
              >
                {project.databases?.length ? (
                  <div className="grid grid-cols-1 gap-2">
                    {project.databases.map((db, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-xs ${DB_TYPE_COLORS[db.type] || "border-border bg-muted/50"}`}
                      >
                        <span className="text-xl">{DB_TYPE_ICONS[db.type] || "🗄️"}</span>
                        <div className="flex-1">
                          <span className="font-medium capitalize">{db.type}</span>
                          <p className="text-muted-foreground font-mono mt-0.5">{db.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : undefined}
              </ResourceSection>

              {/* OpenCode sessions */}
              <ResourceSection
                icon="⚡"
                title="Sessions OpenCode"
                count={project.opencode_sessions?.length || 0}
              >
                {project.opencode_sessions?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {project.opencode_sessions.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-[11px] font-mono bg-purple-500/5 border-purple-500/20">
                        ⚡ {s.slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                ) : undefined}
              </ResourceSection>

              {resourceCount === 0 && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">Aucune ressource découverte pour ce projet</p>
                  <Button variant="outline" size="sm" onClick={handleDiscover}>
                    🔍 Lancer la découverte Docker
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Links tab ── */}
          {activeTab === "links" && (
            <div className="space-y-3">
              {/* Quick links from domains */}
              {project.domains && project.domains.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Accès directs</h3>
                  {project.domains.map((d, i) => (
                    <a
                      key={i}
                      href={`https://${d}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-ax-blue/20 bg-ax-blue/5 hover:bg-ax-blue/10 transition-colors"
                    >
                      <span className="text-lg">🌐</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ax-blue">{d}</p>
                        <p className="text-[10px] text-muted-foreground">Tailscale Serve — HTTPS</p>
                      </div>
                      <span className="text-ax-blue">↗</span>
                    </a>
                  ))}
                </div>
              )}

              {/* GitHub repos — heuristic from project name */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Dépôts GitHub</h3>
                <a
                  href={`https://github.com/4x10m?q=${encodeURIComponent(project.name.split(" — ")[0])}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:border-ax-blue/30 transition-colors text-xs"
                >
                  <span className="text-lg">📦</span>
                  <span className="flex-1 text-muted-foreground">
                    Rechercher dans 4x10m/* — {project.name.split(" — ")[0]}
                  </span>
                  <span className="text-muted-foreground">↗</span>
                </a>
              </div>

              {project.domains?.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Aucun lien configuré pour ce projet
                </div>
              )}
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
    <div className="border border-border rounded-lg px-4 py-3 text-center space-y-1">
      <span className="text-lg">{icon}</span>
      <p className={`text-2xl font-bold tabular-nums ${value > 0 ? color : "text-muted-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

function ResourceSection({ icon, title, count, children }: {
  icon: string; title: string; count: number; children?: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h4 className="text-sm font-medium flex-1">{title}</h4>
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
      </div>
      {children || (
        <p className="text-xs text-muted-foreground">Aucun élément</p>
      )}
    </div>
  );
}
