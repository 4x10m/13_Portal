"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import type {
  Project, ProjectWithStats, ProjectWithMilestones,
  ProjectCategory, ProjectStatus, ProjectPriority,
} from "@/lib/db/types";
import type { OpsData } from "@/lib/types/ops";
import { pctBar } from "@/lib/types/ops";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ProjectDetailDialog } from "@/components/project-detail-dialog";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { OpsPanel } from "@/components/panels/ops-panel";
import { AgentsPanel } from "@/components/panels/agents-panel";
import { WebMonitorPanel } from "@/components/panels/web-monitor-panel";
import { CloudPricingEngine } from "@/components/panels/cloud-pricing-engine";
import { PromptBuilderPanel } from "@/components/panels/prompt-builder-panel";
import { DBaaSPanel } from "@/components/panels/dbaas-panel";
import { CloudPanel } from "@/components/panels/cloud-panel";

// ── Constants ──

const CATEGORIES: { value: ProjectCategory | "all"; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "infra", label: "Infra" },
  { value: "ai", label: "IA" },
  { value: "apps", label: "Apps" },
  { value: "perso", label: "Perso" },
  { value: "devops", label: "DevOps" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-[#00d9ff]/15 text-[#00d9ff]",
  high: "bg-[#ffbe0b]/15 text-[#ffbe0b]",
  critical: "bg-[#ff4757]/15 text-[#ff4757]",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Basse", medium: "Moyenne", high: "Haute", critical: "Critique",
};

const STATUS_STYLES: Record<ProjectStatus, { label: string; color: string; dot: string; border: string; hex: string }> = {
  idea: { label: "Idée", color: "text-[#ffbe0b]", dot: "bg-[#ffbe0b]", border: "border-l-[#ffbe0b]", hex: "#ffbe0b" },
  "in-progress": { label: "En cours", color: "text-[#00d9ff]", dot: "bg-[#00d9ff]", border: "border-l-[#00d9ff]", hex: "#00d9ff" },
  "on-hold": { label: "En pause", color: "text-muted-foreground", dot: "bg-muted-foreground", border: "border-l-muted-foreground", hex: "#8899b3" },
  done: { label: "Terminé", color: "text-[#00ff88]", dot: "bg-[#00ff88]", border: "border-l-[#00ff88]", hex: "#00ff88" },
};

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; bgColor: string }> = {
  idea: { label: "Idées", color: "text-[#ffbe0b]", bgColor: "bg-[#ffbe0b]/10" },
  "in-progress": { label: "En cours", color: "text-[#00d9ff]", bgColor: "bg-[#00d9ff]/10" },
  "on-hold": { label: "En pause", color: "text-muted-foreground", bgColor: "bg-muted" },
  done: { label: "Terminés", color: "text-[#00ff88]", bgColor: "bg-[#00ff88]/10" },
};

const KANBAN_COLUMNS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: "idea", label: "Idée", color: "text-[#ffbe0b]" },
  { status: "in-progress", label: "En cours", color: "text-[#00d9ff]" },
  { status: "on-hold", label: "En pause", color: "text-muted-foreground" },
  { status: "done", label: "Terminé", color: "text-[#00ff88]" },
];

// ── Activity staleness detection ──
function getActivityLevel(updatedAt: string): "active" | "stale" | "idle" {
  const daysSince = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
  if (daysSince < 3) return "active";
  if (daysSince < 14) return "stale";
  return "idle";
}

const ACTIVITY_BORDER: Record<string, string> = {
  active: "border-l-[#00ff88]",  // green = active
  stale: "border-l-[#ffbe0b]",   // yellow = stale
  idle: "border-l-muted-foreground/30",
};

// ── Resource badges (enhanced with clickable domains) ──

function ResourceBadges({ project }: { project: Project }) {
  const items: { icon: string; label: string; href?: string }[] = [];
  if (project.docker_containers?.length) items.push({ icon: "🐳", label: `${project.docker_containers.length}` });
  if (project.domains?.length) {
    items.push({ icon: "🌐", label: `${project.domains.length}` });
  }
  if (project.databases?.length) items.push({ icon: "🗄️", label: `${project.databases.length}` });
  if (project.opencode_sessions?.length) items.push({ icon: "⚡", label: `${project.opencode_sessions.length}` });
  if (project.assigned_agent) items.push({ icon: "🤖", label: project.assigned_agent.split(":").pop() || project.assigned_agent });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-[#1a2744] border border-[#2d3f5e]/50 px-1.5 py-0.5 rounded">
          <span className="text-[9px]">{item.icon}</span>{item.label}
        </span>
      ))}
    </div>
  );
}

// ── Domain links (clickable) ──
function DomainLinks({ project }: { project: Project }) {
  if (!project.domains?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {project.domains.slice(0, 3).map((d, i) => (
        <a
          key={i}
          href={d.startsWith("http") ? d : `https://${d}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[9px] text-[#00d9ff] hover:text-[#00ff88] transition-colors underline underline-offset-2 truncate max-w-[120px]"
        >
          {d.replace(/^https?:\/\//, "")}
        </a>
      ))}
      {project.domains.length > 3 && (
        <span className="text-[9px] text-muted-foreground">+{project.domains.length - 3}</span>
      )}
    </div>
  );
}

// ── Progress bar for project completion ──
function ProjectProgressBar({ project }: { project: ProjectWithStats }) {
  // Use done status as 100%, in-progress as ~60%, idea as ~20%, on-hold as ~40%
  const pct = project.status === "done" ? 100 : project.status === "in-progress" ? 55 : project.status === "on-hold" ? 35 : 10;
  const color = STATUS_STYLES[project.status].hex;
  return (
    <div className="h-1 bg-[#2d3f5e] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Grid card (enhanced) ──

function GridCard({ project, onClick, style }: { project: ProjectWithStats; onClick: () => void; style?: React.CSSProperties }) {
  const statusStyle = STATUS_STYLES[project.status];
  const activityLevel = getActivityLevel(project.updated_at);
  const borderClass = ACTIVITY_BORDER[activityLevel];
  return (
    <Card
      className={`card-enter cursor-pointer border-l-3 ${borderClass} hover:border-[#00d9ff]/60 hover:shadow-[0_0_20px_rgba(0,217,255,0.08)] transition-all bg-[#1a2744]/80`}
      onClick={onClick}
      style={style}
    >
      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold truncate text-[#e0e8f0]">{project.name}</p>
          <Badge variant="secondary" className={`text-[10px] shrink-0 ${PRIORITY_COLORS[project.priority] || ""}`}>
            {PRIORITY_LABELS[project.priority] || project.priority}
          </Badge>
        </div>
        {project.description && <p className="text-xs text-[#8899b3] line-clamp-2">{project.description}</p>}
        <div className="flex items-center justify-between text-xs text-[#8899b3]">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
            <span className={statusStyle.color}>{statusStyle.label}</span>
          </div>
          <Badge variant="outline" className="text-[10px] capitalize border-[#2d3f5e]">{project.category}</Badge>
        </div>
        <ProjectProgressBar project={project} />
        <ResourceBadges project={project} />
        <DomainLinks project={project} />
        <div className="flex items-center justify-between text-[10px] text-[#8899b3]">
          <span>{project.milestone_count} jalon{project.milestone_count !== 1 ? "s" : ""}</span>
          <span>{new Date(project.updated_at).toLocaleDateString("fr-FR")}</span>
        </div>
      </div>
    </Card>
  );
}

// ── Kanban card (enhanced) ──

function KanbanCard({ project, onClick, onDragStart }: { project: ProjectWithStats; onClick: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const statusStyle = STATUS_STYLES[project.status];
  const activityLevel = getActivityLevel(project.updated_at);
  const borderClass = ACTIVITY_BORDER[activityLevel];
  return (
    <Card
      className={`card-enter cursor-pointer border-l-3 ${borderClass} hover:border-[#00d9ff]/60 transition-all bg-[#1a2744]/80`}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate text-[#e0e8f0]">{project.name}</p>
          <Badge variant="secondary" className={`text-[10px] shrink-0 ${PRIORITY_COLORS[project.priority] || ""}`}>
            {PRIORITY_LABELS[project.priority] || project.priority}
          </Badge>
        </div>
        {project.description && <p className="text-xs text-[#8899b3] line-clamp-2">{project.description}</p>}
        <div className="flex items-center justify-between text-xs text-[#8899b3]">
          <Badge variant="outline" className="text-[10px] capitalize border-[#2d3f5e]">{project.category}</Badge>
          <span>{project.milestone_count} jalon{project.milestone_count !== 1 ? "s" : ""}</span>
        </div>
        <ProjectProgressBar project={project} />
        <ResourceBadges project={project} />
      </div>
    </Card>
  );
}

// ── Timeline / Activité récente ──

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `il y a ${days}j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

function ActivityTimeline({ projects }: { projects: ProjectWithStats[] }) {
  const recent = [...projects]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 8);

  if (recent.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {recent.map((p) => {
        const s = STATUS_STYLES[p.status];
        return (
          <div key={p.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-[#243352]/50 transition-colors">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
            <span className="truncate font-medium text-[#e0e8f0]">{p.name}</span>
            <span className="text-[#8899b3] shrink-0">{s.label}</span>
            <span className="text-[#8899b3] ml-auto shrink-0">{relativeTime(p.updated_at)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Horizontal Timeline view ──

function TimelineView({ projects, onProjectClick }: { projects: ProjectWithStats[]; onProjectClick: (p: ProjectWithStats) => void }) {
  if (projects.length === 0) return <p className="text-xs text-[#8899b3] text-center py-8">Aucun projet</p>;

  const sorted = [...projects].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const minDate = new Date(sorted[0].created_at).getTime();
  const maxDate = Math.max(Date.now(), new Date(sorted[sorted.length - 1].created_at).getTime());
  const range = maxDate - minDate || 1;

  const toPercent = (iso: string) => ((new Date(iso).getTime() - minDate) / range) * 100;

  const DOT_COLORS: Record<string, string> = { idea: "#ffbe0b", "in-progress": "#00d9ff", "on-hold": "#8899b3", done: "#00ff88" };

  return ( <div className="relative border border-[#2d3f5e] rounded-xl p-6 bg-[#1a2744]/50 overflow-x-auto">
    {/* Time axis */}
    <div className="relative h-1 bg-[#2d3f5e] rounded-full mb-8">
      <div className="absolute left-0 top-2 text-[9px] text-[#8899b3]">{new Date(minDate).toLocaleDateString("fr-FR")}</div>
      <div className="absolute right-0 top-2 text-[9px] text-[#8899b3]">{new Date(maxDate).toLocaleDateString("fr-FR")}</div>
      {/* Now marker */}
      <div className="absolute top-0 h-3 w-0.5 bg-[#00d9ff]" style={{ left: `${toPercent(new Date().toISOString())}%` }} />
      <div className="absolute text-[8px] text-[#00d9ff]" style={{ left: `${Math.min(toPercent(new Date().toISOString()), 95)}%`, top: "-12px" }}>Maintenant</div>
    </div>
    {/* Project rows */}
    <div className="space-y-2">
      {sorted.map((p) => {
        const startPct = toPercent(p.created_at);
        const endPct = p.status === "done" ? toPercent(p.updated_at) : Math.min(toPercent(new Date().toISOString()), 100);
        const s = STATUS_STYLES[p.status];
        return (
          <div key={p.id} className="flex items-center gap-2 group cursor-pointer" onClick={() => onProjectClick(p)}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DOT_COLORS[p.status] }} />
            <span className="text-xs font-medium truncate w-28 shrink-0 text-[#e0e8f0]">{p.name}</span>
            <div className="flex-1 relative h-5">
              <div
                className="absolute top-1 h-3 rounded-full opacity-40"
                style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 1)}%`, backgroundColor: s.hex }}
              />
              <div className="absolute top-0.5 h-4 w-1 rounded" style={{ left: `${startPct}%`, backgroundColor: s.hex }} />
            </div>
            <Badge variant="secondary" className={`text-[9px] shrink-0 ${PRIORITY_COLORS[p.priority] || ""}`}>
              {PRIORITY_LABELS[p.priority]}
            </Badge>
          </div>
        );
      })}
    </div>
  </div>
  );
}

// ── KPI Bandeau (vivid) ──

function OpsKPIBandeau({ ops, opsLoading, onKpiClick }: { ops: OpsData | null; opsLoading: boolean; onKpiClick: (view: "matrix" | "system") => void }) {
  const upCount = ops?.targets.filter((t) => t.health === "up").length ?? 0;
  const downCount = ops?.targets.filter((t) => t.health === "down").length ?? 0;
  const criticalAlerts = ops?.alerts.filter((a) => a.severity === "critical").length ?? 0;
  const onlineDevices = ops?.tailscale.devices.filter((d) => d.online).length ?? 0;
  const runningContainers = ops?.docker.containers.filter((c) => c.status.startsWith("Up")).length ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      <Card className="cursor-pointer hover:border-[#00d9ff]/50 hover:shadow-[0_0_15px_rgba(0,217,255,0.06)] transition-all bg-[#1a2744]/80" onClick={() => onKpiClick("system")} title="Ouvrir Ops → Système"><CardContent className="p-2.5 text-center">
        <p className="text-[9px] uppercase text-[#8899b3] tracking-wider">RAM</p>
        <p className="text-lg font-bold text-[#e0e8f0]">{opsLoading ? "—" : ops?.system.ram_used_pct}<span className="text-xs text-[#8899b3]">%</span></p>
        {ops && <p className="text-[9px] text-[#8899b3]">{ops.system.ram_avail_gb}/{ops.system.ram_total_gb} Go libre</p>}
      </CardContent></Card>
      <Card className="cursor-pointer hover:border-[#00d9ff]/50 hover:shadow-[0_0_15px_rgba(0,217,255,0.06)] transition-all bg-[#1a2744]/80" onClick={() => onKpiClick("system")} title="Ouvrir Ops → Système"><CardContent className="p-2.5 text-center">
        <p className="text-[9px] uppercase text-[#8899b3] tracking-wider">Load</p>
        <p className="text-lg font-bold text-[#e0e8f0]">{opsLoading ? "—" : ops?.system.load1}</p>
      </CardContent></Card>
      <Card className="cursor-pointer hover:border-[#00d9ff]/50 hover:shadow-[0_0_15px_rgba(0,217,255,0.06)] transition-all bg-[#1a2744]/80" onClick={() => onKpiClick("matrix")} title="Ouvrir Ops → Matrice"><CardContent className="p-2.5 text-center">
        <p className="text-[9px] uppercase text-[#8899b3] tracking-wider">Alertes</p>
        <p className={`text-lg font-bold ${criticalAlerts > 0 ? "text-[#ff4757]" : "text-[#00ff88]"}`}>{opsLoading ? "—" : (ops?.alerts.length ?? 0)}</p>
        {ops && <p className="text-[9px] text-[#8899b3]">{criticalAlerts} critique{criticalAlerts !== 1 ? "s" : ""}</p>}
      </CardContent></Card>
      <Card className="cursor-pointer hover:border-[#00d9ff]/50 hover:shadow-[0_0_15px_rgba(0,217,255,0.06)] transition-all bg-[#1a2744]/80" onClick={() => onKpiClick("matrix")} title="Ouvrir Ops → Matrice"><CardContent className="p-2.5 text-center">
        <p className="text-[9px] uppercase text-[#8899b3] tracking-wider">Cibles</p>
        <p className="text-lg font-bold text-[#e0e8f0]"><span className="text-[#00ff88]">{upCount}</span><span className="text-[#8899b3]">/{ops?.targets.length ?? "—"}</span></p>
        {ops && <p className="text-[9px] text-[#8899b3]">{downCount} down</p>}
      </CardContent></Card>
      <Card className="cursor-pointer hover:border-[#00d9ff]/50 hover:shadow-[0_0_15px_rgba(0,217,255,0.06)] transition-all bg-[#1a2744]/80" onClick={() => onKpiClick("matrix")} title="Ouvrir Ops → Matrice"><CardContent className="p-2.5 text-center">
        <p className="text-[9px] uppercase text-[#8899b3] tracking-wider">Containers</p>
        <p className="text-lg font-bold text-[#e0e8f0]"><span className="text-[#00ff88]">{runningContainers}</span><span className="text-[#8899b3]">/{ops?.docker.containers.length ?? "—"}</span></p>
      </CardContent></Card>
      <Card className="cursor-pointer hover:border-[#00d9ff]/50 hover:shadow-[0_0_15px_rgba(0,217,255,0.06)] transition-all bg-[#1a2744]/80" onClick={() => onKpiClick("matrix")} title="Ouvrir Ops → Matrice"><CardContent className="p-2.5 text-center">
        <p className="text-[9px] uppercase text-[#8899b3] tracking-wider">Tailscale</p>
        <p className="text-lg font-bold text-[#e0e8f0]"><span className="text-[#00ff88]">{onlineDevices}</span><span className="text-[#8899b3]">/{ops?.tailscale.devices.length ?? "—"}</span></p>
        {ops && <p className="text-[9px] text-[#8899b3]">{ops.tailscale.services.length} services</p>}
      </CardContent></Card>
    </div>
  );
}

// ── FAB (Floating Action Button) for modaux + activity ──

type PanelKey = "ops" | "agents" | "webmonitor" | "cloudpricing" | "dbaas" | "cloud" | "promptbuilder";

const FAB_ITEMS: { key: PanelKey; icon: string; label: string }[] = [
  { key: "ops", icon: "◈", label: "Ops" },
  { key: "agents", icon: "⚡", label: "Agents" },
  { key: "webmonitor", icon: "🌐", label: "Web Monitor" },
  { key: "cloudpricing", icon: "☁", label: "Cloud Pricing" },
  { key: "dbaas", icon: "🐘", label: "BDD" },
  { key: "cloud", icon: "☁", label: "Cloud" },
  { key: "promptbuilder", icon: "🛠", label: "Prompt" },
];

function FloatingActionPanel({
  projects,
  onOpenPanel,
}: {
  projects: ProjectWithStats[];
  onOpenPanel: (key: PanelKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  // Count "notifications" = stale + active projects
  const activeCount = projects.filter((p) => getActivityLevel(p.updated_at) === "active").length;
  const staleCount = projects.filter((p) => getActivityLevel(p.updated_at) === "stale").length;
  const badgeCount = staleCount; // stale = needs attention

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={fabRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {open && (
        <div className="bg-[#1a2744] border border-[#2d3f5e] rounded-xl shadow-2xl shadow-black/40 w-80 max-h-[70vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Panel actions */}
          <div className="p-3 space-y-1">
            <p className="text-[10px] uppercase text-[#8899b3] tracking-wider px-2 mb-2">Modaux</p>
            {FAB_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => { onOpenPanel(item.key); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#e0e8f0] hover:bg-[#243352] transition-colors"
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Activity timeline inside FAB */}
          <div className="border-t border-[#2d3f5e] p-3">
            <p className="text-[10px] uppercase text-[#8899b3] tracking-wider px-2 mb-2">Activité récente</p>
            <ActivityTimeline projects={projects} />
          </div>

          {/* Stats mini-bar */}
          <div className="border-t border-[#2d3f5e] p-3 flex items-center gap-4 text-[10px]">
            <span className="text-[#00ff88]">● {activeCount} actif{activeCount !== 1 ? "s" : ""}</span>
            <span className="text-[#ffbe0b]">● {staleCount} en attente</span>
            <span className="text-[#8899b3]">{projects.length} projets</span>
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen(!open)}
        className={`relative w-14 h-14 rounded-full shadow-lg shadow-black/30 flex items-center justify-center text-xl transition-all duration-200 ${
          open
            ? "bg-[#00d9ff] text-[#0a0f1a] rotate-45"
            : "bg-gradient-to-br from-[#00d9ff] to-[#00ff88] text-[#0a0f1a] hover:shadow-[0_0_25px_rgba(0,217,255,0.3)]"
        }`}
      >
        ✛
        {badgeCount > 0 && !open && (
          <span className="absolute -top-1 -right-1 bg-[#ffbe0b] text-[#0a0f1a] text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>
    </div>
  );
}

// ── Main Projets Page ──

export default function ProjetsPage() {
  // Projects state
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectWithMilestones | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ProjectCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<ProjectPriority | "all">("all");
  const [viewMode, setViewMode] = useState<"grid" | "kanban" | "timeline">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "priority" | "updated_at" | "milestone_count">("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);

  // Ops state
  const [ops, setOps] = useState<OpsData | null>(null);
  const [opsLoading, setOpsLoading] = useState(true);

  // Modal state
  const [opsPanelOpen, setOpsPanelOpen] = useState(false);
  const [opsDefaultView, setOpsDefaultView] = useState<"matrix" | "system">("matrix");
  const [agentsPanelOpen, setAgentsPanelOpen] = useState(false);
  const [webMonitorOpen, setWebMonitorOpen] = useState(false);
  const [cloudPricingOpen, setCloudPricingOpen] = useState(false);
  const [dbaasPanelOpen, setDBaaSPanelOpen] = useState(false);
  const [cloudPanelOpen, setCloudPanelOpen] = useState(false);
  const [promptBuilderOpen, setPromptBuilderOpen] = useState(false);

  // Drag & Drop
  const dragProjectId = useRef<string | null>(null);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/roadmap/projects");
      if (res.ok) setProjects(await res.json());
    } catch (err) { console.error("Erreur chargement projets:", err); }
    finally { setLoading(false); }
  }, []);

  // Fetch ops
  useEffect(() => {
    async function loadOps() {
      try {
        const res = await fetch("/api/ops");
        if (res.ok) setOps(await res.json());
      } catch { /* silent */ }
      finally { setOpsLoading(false); }
    }
    loadOps();
    const iv = setInterval(loadOps, 60000);
    return () => clearInterval(iv);
  }, []);

  // Auto-discover Docker resources
  useEffect(() => {
    async function discover() {
      try {
        const res = await fetch("/api/discover");
        if (res.ok) fetchProjects();
      } catch { /* silent */ }
    }
    discover();
    const iv = setInterval(discover, 300000);
    return () => clearInterval(iv);
  }, [fetchProjects]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleProjectClick = async (project: ProjectWithStats) => {
    try {
      const res = await fetch(`/api/roadmap/projects/${project.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedProject(data);
        setDetailOpen(true);
      } else {
        toast.error(`Erreur ${res.status} lors du chargement du projet`);
      }
    } catch (err) {
      console.error("Erreur chargement détail projet:", err);
      toast.error("Erreur réseau lors du chargement du projet");
    }
  };

  const handleKpiClick = (view: "matrix" | "system") => {
    setOpsDefaultView(view);
    setOpsPanelOpen(true);
  };

  const handleKanbanDrop = async (projectId: string, newStatus: ProjectStatus) => {
    try {
      await fetch(`/api/roadmap/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success("Statut mis à jour");
      fetchProjects();
    } catch { toast.error("Erreur mise à jour statut"); }
  };

  // FAB panel opener
  const handleOpenPanel = (key: PanelKey) => {
    switch (key) {
      case "ops": setOpsPanelOpen(true); break;
      case "agents": setAgentsPanelOpen(true); break;
      case "webmonitor": setWebMonitorOpen(true); break;
      case "cloudpricing": setCloudPricingOpen(true); break;
      case "dbaas": setDBaaSPanelOpen(true); break;
      case "cloud": setCloudPanelOpen(true); break;
      case "promptbuilder": setPromptBuilderOpen(true); break;
    }
  };

  const filteredProjects = projects
    .filter((p) => categoryFilter === "all" || p.category === categoryFilter)
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) => priorityFilter === "all" || p.priority === priorityFilter)
    .filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
      );
    });

  const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "priority": cmp = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9); break;
      case "milestone_count": cmp = a.milestone_count - b.milestone_count; break;
      case "updated_at": default: cmp = a.updated_at.localeCompare(b.updated_at); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const statsByStatus = (status: ProjectStatus) => projects.filter((p) => p.status === status).length;

  return (
    <div className="space-y-4 p-6 pb-24">
      {/* ── Topbar: brand gradient + external links ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-default">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#00d9ff] to-[#00ff88] bg-clip-text text-transparent">Axiiom</span><span className="text-[#e0e8f0]">Lab</span>
          </h1>
          <span className="text-[10px] text-[#8899b3] uppercase tracking-widest">Projets</span>
        </div>
        <div className="flex items-center gap-3">
          {[
            { href: "https://homepage.axiiomlab.ovh", label: "Homepage" },
            { href: "https://portal.axiiomlab.ovh", label: "Portal" },
            { href: "https://grafana.axiiomlab.ovh", label: "Grafana" },
            { href: "https://portainer.axiiomlab.ovh", label: "Portainer" },
            { href: "https://forgejo.axiiomlab.ovh", label: "Forgejo" },
            { href: "https://minio.axiiomlab.ovh", label: "MinIO" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#8899b3] hover:text-[#00d9ff] transition-colors"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>

      {/* ── KPI Ops Bandeau ── */}
      <OpsKPIBandeau ops={ops} opsLoading={opsLoading} onKpiClick={handleKpiClick} />

      {/* ── Toolbar: status counts + sort + view + new (no inline panel buttons) ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Project status counts */}
          <div className="flex items-center gap-2">
            {(Object.entries(STATUS_CONFIG) as [ProjectStatus, typeof STATUS_CONFIG[ProjectStatus]][]).map(
              ([status, cfg]) => (
                <div key={status} className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${cfg.bgColor}`}>
                  <span className={`text-sm font-bold ${cfg.color}`}>{statsByStatus(status)}</span>
                  <span className="text-[10px] text-[#8899b3]">{cfg.label}</span>
                </div>
              )
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split(":") as [typeof sortBy, typeof sortDir];
              setSortBy(by);
              setSortDir(dir);
            }}
            className="h-7 text-xs bg-transparent border border-[#2d3f5e] rounded-md px-2 text-[#8899b3] focus:outline-none focus:ring-1 focus:ring-[#00d9ff]"
          >
            <option value="updated_at:desc">Récents</option>
            <option value="updated_at:asc">Anciens</option>
            <option value="name:asc">Nom A-Z</option>
            <option value="name:desc">Nom Z-A</option>
            <option value="priority:asc">Priorité ↗</option>
            <option value="priority:desc">Priorité ↘</option>
            <option value="milestone_count:desc">+ Jalons</option>
            <option value="milestone_count:asc">- Jalons</option>
          </select>

          {/* View toggle */}
          <div className="flex rounded-md border border-[#2d3f5e] overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={`px-3 py-1.5 text-xs transition-colors ${viewMode === "grid" ? "bg-[#243352] text-[#00d9ff]" : "text-[#8899b3] hover:text-[#e0e8f0]"}`}>
              ▦ Grille
            </button>
            <button onClick={() => setViewMode("kanban")} className={`px-3 py-1.5 text-xs transition-colors ${viewMode === "kanban" ? "bg-[#243352] text-[#00d9ff]" : "text-[#8899b3] hover:text-[#e0e8f0]"}`}>
              ☷ Kanban
            </button>
            <button onClick={() => setViewMode("timeline")} className={`px-3 py-1.5 text-xs transition-colors ${viewMode === "timeline" ? "bg-[#243352] text-[#00d9ff]" : "text-[#8899b3] hover:text-[#e0e8f0]"}`}>
              ⟿ Timeline
            </button>
          </div>
          <NewProjectDialog onCreated={fetchProjects} />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Rechercher un projet..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs h-8 text-sm bg-[#1a2744] border-[#2d3f5e] text-[#e0e8f0] placeholder:text-[#8899b3] focus:ring-[#00d9ff]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-xs text-[#8899b3] hover:text-[#00d9ff] transition-colors">
              ✕ Effacer
            </button>
          )}
        </div>

        <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as ProjectCategory | "all")}>
          <TabsList>
            {CATEGORIES.map((cat) => (<TabsTrigger key={cat.value} value={cat.value}>{cat.label}</TabsTrigger>))}
          </TabsList>
        </Tabs>

        <div className="flex gap-1">
          {([
            { value: "all" as const, label: "Tous" },
            ...Object.entries(STATUS_STYLES).map(([key, cfg]) => ({ value: key as ProjectStatus, label: cfg.label })),
          ]).map((f) => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)} className={`px-3 py-1.5 rounded-md text-xs transition-colors ${statusFilter === f.value ? "bg-[#243352] text-[#00d9ff] font-medium" : "text-[#8899b3] hover:text-[#e0e8f0] hover:bg-[#243352]/50"}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {([
            { value: "all" as const, label: "⚡ Toutes priorités" },
            ...Object.entries(PRIORITY_LABELS).map(([key, label]) => ({ value: key as ProjectPriority, label })),
          ]).map((f) => (
            <button key={f.value} onClick={() => setPriorityFilter(f.value)} className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${priorityFilter === f.value ? "bg-[#243352] text-[#00d9ff] font-medium" : "text-[#8899b3] hover:text-[#e0e8f0] hover:bg-[#243352]/50"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid view ── */}
      {viewMode === "grid" && (
        sortedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-[#8899b3] text-lg mb-2">Aucun projet</p>
            <p className="text-[#8899b3] text-sm">Modifiez les filtres ou créez un nouveau projet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedProjects.map((project, i) => (<GridCard key={project.id} project={project} onClick={() => handleProjectClick(project)} style={{ animationDelay: `${i * 30}ms` }} />))}
          </div>
        )
      )}

      {/* ── Kanban view ── */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
          {KANBAN_COLUMNS.map((col) => {
            const colProjects = sortedProjects.filter((p) => p.status === col.status);

            return (
              <div
                key={col.status}
                className="flex flex-col gap-3"
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  const pid = dragProjectId.current;
                  if (pid && pid !== "") {
                    handleKanbanDrop(pid, col.status);
                  }
                  dragProjectId.current = null;
                }}
              >
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-medium ${col.color}`}>{col.label}</h3>
                  <Badge variant="secondary" className="text-[10px]">{colProjects.length}</Badge>
                </div>
                <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-[60px]">
                  {colProjects.map((project) => (
                    <KanbanCard
                      key={project.id}
                      project={project}
                      onClick={() => handleProjectClick(project)}
                      onDragStart={(e) => {
                        dragProjectId.current = project.id;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", project.id);
                      }}
                    />
                  ))}
                  {colProjects.length === 0 && <p className="text-xs text-[#8899b3] text-center py-8">Aucun projet</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Timeline view ── */}
      {viewMode === "timeline" && (
        <TimelineView projects={sortedProjects} onProjectClick={handleProjectClick} />
      )}

      {/* ── FAB (Floating Action Button) ── */}
      <FloatingActionPanel projects={sortedProjects} onOpenPanel={handleOpenPanel} />

      {/* ── Project detail dialog ── */}
      <ProjectDetailDialog project={selectedProject} open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedProject(null); }} onProjectUpdated={fetchProjects} />

      {/* ── Modal panels ── */}
      <OpsPanel open={opsPanelOpen} onOpenChange={setOpsPanelOpen} defaultView={opsDefaultView} />
      <AgentsPanel open={agentsPanelOpen} onOpenChange={setAgentsPanelOpen} />
      <WebMonitorPanel open={webMonitorOpen} onOpenChange={setWebMonitorOpen} />
      <CloudPricingEngine open={cloudPricingOpen} onOpenChange={setCloudPricingOpen} />
      <DBaaSPanel open={dbaasPanelOpen} onOpenChange={setDBaaSPanelOpen} />
      <CloudPanel open={cloudPanelOpen} onOpenChange={setCloudPanelOpen} />
      <PromptBuilderPanel open={promptBuilderOpen} onOpenChange={setPromptBuilderOpen} />
    </div>
  );
}
