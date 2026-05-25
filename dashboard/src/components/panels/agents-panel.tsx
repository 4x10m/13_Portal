"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface OpenCodeStats {
  total_sessions: number; total_messages: number;
  active_containers: number; container_count: number;
  cwd_count: number; last_updated: string;
}
interface OpenCodeSession {
  id: string; title: string; slug: string; cwd: string;
  version: string; flavor: string; container_status: string;
  provider: string; model: string; mode: string;
  message_count: number; time_created: number; time_updated: number;
  time_archived: number | null; is_active: boolean; is_recent: boolean;
  is_pinned: boolean; awaiting_question: boolean; exit_reason: string; last_tool: string;
}
interface OpenCodeOverview {
  zones: {
    name: string; sessions: number; messages: number;
    active: number; recent: number;
    domains: Record<string, {
      name: string; sessions: number; messages: number;
      active: number; recent: number;
      projects: Record<string, { name: string; sessions: number; messages: number; active: number; recent: number; modes: Record<string, number> }>;
    }>;
  }[];
}
interface OpenCodeContainer {
  name: string; container: string; port: number;
  status: string; health: string; memory_usage: string;
}
interface MCPServer { name: string; port: string; image: string; status: string; created: string }
interface ArtefactsData {
  extensions: unknown[]; docker_images: unknown[];
  mcp_servers: MCPServer[]; cli_tools: unknown[];
  dockerfiles: unknown[]; build_systems: unknown[];
}

const MODE_COLORS: Record<string, string> = {
  webdev: "bg-ax-blue/20 text-ax-blue",
  "v1-basic": "bg-ax-green/20 text-ax-green",
  codeur: "bg-purple-500/20 text-purple-400",
  enhancer: "bg-ax-yellow/20 text-ax-yellow",
  "v0-basic": "bg-muted text-muted-foreground",
  webdriver: "bg-cyan-500/20 text-cyan-400",
  "job-scheduler": "bg-orange-500/20 text-orange-400",
};

const FLAVOR_LABELS: Record<string, string> = { native: "Native", docker: "Docker" };

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

function extractProject(cwd: string): string {
  const parts = cwd.split("/");
  const idx = parts.indexOf("Codebase");
  if (idx >= 0 && parts.length > idx + 2) return parts.slice(idx + 1, idx + 3).join("/");
  if (parts.length > 2) return parts.slice(-2).join("/");
  return cwd.split("/").pop() || cwd;
}

export function AgentsPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [stats, setStats] = useState<OpenCodeStats | null>(null);
  const [sessions, setSessions] = useState<OpenCodeSession[]>([]);
  const [overview, setOverview] = useState<OpenCodeOverview | null>(null);
  const [containers, setContainers] = useState<OpenCodeContainer[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "recent">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    async function load() {
      try {
        const [statsRes, sessionsRes, overviewRes, containersRes, artefactsRes] = await Promise.all([
          fetch("/api/opencode/stats"), fetch("/api/opencode/sessions"),
          fetch("/api/opencode/overview"), fetch("/api/opencode/containers"),
          fetch("/api/artefacts"),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (sessionsRes.ok) setSessions(await sessionsRes.json());
        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (containersRes.ok) setContainers(await containersRes.json());
        if (artefactsRes.ok) { const a: ArtefactsData = await artefactsRes.json(); setMcpServers(a.mcp_servers || []); }
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [open]);

  const filtered = sessions.filter((s) => {
    if (filter === "active") return s.is_active;
    if (filter === "recent") return s.is_recent;
    return true;
  });
  const activeCount = sessions.filter((s) => s.is_active).length;
  const recentCount = sessions.filter((s) => s.is_recent).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⚡ Agents &amp; Outils IA</DialogTitle>
          <DialogDescription>Sessions OpenCode, MCP servers et outils IA</DialogDescription>
        </DialogHeader>

        {loading ? (<p className="text-sm text-muted-foreground animate-pulse py-8">Chargement…</p>) : (
          <div className="space-y-6">
            <div className="grid grid-cols-5 gap-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Sessions</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold text-ax-blue">{stats?.total_sessions ?? "—"}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Messages</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold text-ax-green">{stats?.total_messages?.toLocaleString("fr-FR") ?? "—"}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Actives</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold text-ax-yellow">{activeCount}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Containers</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold">{stats?.active_containers ?? "—"}</span><span className="text-sm text-muted-foreground"> / {stats?.container_count ?? "—"}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Workspaces</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold">{stats?.cwd_count ?? "—"}</span></CardContent></Card>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Card className="col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Sessions</CardTitle>
                    <div className="flex gap-1">
                      {(["all", "active", "recent"] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-md text-xs transition-colors ${filter === f ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
                          {f === "all" ? `Toutes (${sessions.length})` : f === "active" ? `Actives (${activeCount})` : `Récentes (${recentCount})`}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {filtered.slice(0, 50).map((session) => (
                      <div key={session.id} className={`flex items-center gap-3 p-2 rounded-md transition-colors ${session.is_active ? "bg-ax-blue/5 border border-ax-blue/20" : "hover:bg-accent/30"}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${session.is_active ? "bg-ax-green animate-pulse" : session.is_recent ? "bg-ax-yellow" : "bg-muted-foreground/40"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{session.title || session.slug}</span>
                            {session.is_pinned && <span className="text-ax-yellow text-xs">★</span>}
                            {session.awaiting_question && <Badge className="text-[9px] bg-ax-red/20 text-ax-red border-ax-red/30">?</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span className="truncate max-w-[200px]">{extractProject(session.cwd)}</span>
                            <span>·</span><span>{session.message_count} msgs</span>
                            <span>·</span><span>{timeAgo(session.time_updated)}</span>
                          </div>
                        </div>
                        <Badge variant="secondary" className={`text-[10px] shrink-0 ${MODE_COLORS[session.mode] || "bg-muted text-muted-foreground"}`}>{session.mode}</Badge>
                        <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right">{FLAVOR_LABELS[session.flavor] || session.flavor}</span>
                      </div>
                    ))}
                    {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Aucune session</p>}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm font-medium">Zones d&apos;activité</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {overview?.zones.map((zone) => (
                        <div key={zone.name} className="space-y-1">
                          <div className="flex items-center justify-between"><span className="text-sm font-medium">{zone.name}</span><span className="text-xs text-muted-foreground">{zone.sessions} sessions</span></div>
                          {Object.entries(zone.domains).slice(0, 3).map(([key, domain]) => (
                            <div key={key} className="ml-3 space-y-1">
                              <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground truncate">{domain.name}</span><div className="flex gap-2 text-[10px] text-muted-foreground"><span>{domain.active}⚡</span><span>{domain.messages}💬</span></div></div>
                            </div>
                          ))}
                        </div>
                      ))}
                      {!overview && <p className="text-xs text-muted-foreground">Aucune donnée</p>}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm font-medium">Containers</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {containers.map((c) => (
                        <div key={c.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${c.status === "running" ? c.health === "healthy" ? "bg-ax-green" : "bg-ax-yellow" : "bg-ax-red"}`} />
                            <span className="text-xs">{c.name}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{c.memory_usage !== "—" ? c.memory_usage : c.status}</span>
                        </div>
                      ))}
                      {containers.length === 0 && <p className="text-xs text-muted-foreground">Aucun container</p>}
                    </div>
                  </CardContent>
                </Card>
                <a href="http://100.82.220.96:8121" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 p-3 rounded-md bg-accent/50 hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <span>↗</span> Dashboard complet OpenCode
                </a>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">MCP Servers</h3>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm font-medium">Serveurs actifs ({mcpServers.length})</CardTitle></CardHeader>
                  <CardContent>
                    {mcpServers.length === 0 ? (<p className="text-xs text-muted-foreground">Aucun serveur MCP</p>) : (
                      <div className="space-y-2">{mcpServers.map((s) => (
                        <div key={s.name} className="flex items-center justify-between p-2 rounded-md bg-accent/10">
                          <div><span className="text-xs font-medium">{s.name}</span><p className="text-[10px] text-muted-foreground">{s.image}</p></div>
                          <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px]">:{s.port}</Badge><span className={`w-2 h-2 rounded-full ${s.status === "Up" ? "bg-ax-green" : "bg-ax-red"}`} /></div>
                        </div>
                      ))}</div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm font-medium">Ports MCP</CardTitle></CardHeader>
                  <CardContent>
                    {mcpServers.length === 0 ? (<p className="text-xs text-muted-foreground">Aucun port</p>) : (
                      <div className="space-y-1 text-xs">
                        {[...mcpServers].sort((a, b) => parseInt(a.port) - parseInt(b.port)).map((s) => (
                          <div key={s.name} className="flex items-center justify-between"><span className="font-mono text-muted-foreground">:{s.port}</span><span>{s.name.replace("mcp-", "")}</span></div>
                        ))}
                        <div className="mt-3 pt-3 border-t border-border"><p className="text-[10px] text-muted-foreground">Range: 8202–8212</p><p className="text-[10px] text-muted-foreground">Protocole: stdio ↔ SSE</p></div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
