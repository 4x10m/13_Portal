"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import type { OpsData as SharedOpsData, ServiceMatrixEntry } from "@/lib/types/ops";
import { pctBar } from "@/lib/types/ops";

// ── Local types (specific to ops-panel, not shared) ──

interface ServiceHealth {
  tsService: string; tsDomain: string; backend: string;
  container: string | null; containerStatus: string | null; containerImage: string | null;
  promJob: string | null; promHealth: string | null;
  relatedAlerts: string[]; networks: string[];
}

type OpsData = SharedOpsData & { serviceMatrix: ServiceHealth[] };

// ── Helpers ──

const SEV_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  info: "bg-ax-blue/20 text-ax-blue border-ax-blue/30",
};

const HEALTH_COLORS: Record<string, string> = {
  up: "text-ax-green", down: "text-red-400", unknown: "text-muted-foreground",
};

const SERVICE_ICONS: Record<string, string> = {
  homepage: "🏠", portal: "🚪", grafana: "📊", portainer: "🐳",
  litellm: "🤖", opencode: "⌨", dashboard: "📋", caddy: "🌐",
  authelia: "🔐", forgejo: "🔨", woodpecker: "🐦", minio: "📦",
  prometheus: "🔥", alertmanager: "🔔", node: "🖥", mongodb: "🍃",
  valkey: "🔴", postgres: "🐘", tailscale: "🦎", ragflow: "📄",
  watchdog: "🐕", ollama: "🦙", mcp: "⚡", wg: "🛡",
  sonar: "📡", cadvisor: "📈", netdata: "📊",
};

function getServiceIcon(name: string): string {
  const normalized = name.toLowerCase().replace(/[-_]/g, "");
  for (const key of Object.keys(SERVICE_ICONS)) {
    if (normalized.includes(key)) return SERVICE_ICONS[key];
  }
  return "◈";
}

function statusIcon(status: string | null) {
  if (!status) return <span className="text-muted-foreground/40">—</span>;
  if (status.startsWith("Up")) return <span className="text-ax-green">●</span>;
  return <span className="text-red-400">●</span>;
}

function CopySSHButton({ port }: { port: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(`ssh -L ${port}:localhost:${port} debian@axiiomlab.ovh`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="ml-1 px-1 py-0.5 rounded text-[10px] text-muted-foreground hover:text-ax-blue hover:bg-accent/50 transition-colors" title={copied ? "Copié !" : "Copier SSH forward"}>
      {copied ? "✓" : "📋"}
    </button>
  );
}

type View = "matrix" | "system";

// ── Sub-components ──

function MatrixView({ data }: { data: OpsData }) {
  const { serviceMatrix } = data;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Matrice Services — Tailscale × Docker × Prometheus × Alertes</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-2 font-medium">Service TS</th>
                <th className="text-left p-2 font-medium">Backend</th>
                <th className="text-center p-2 font-medium">Container</th>
                <th className="text-center p-2 font-medium">Statut</th>
                <th className="text-center p-2 font-medium">Prom</th>
                <th className="text-left p-2 font-medium">Alertes</th>
                <th className="text-left p-2 font-medium">Réseaux</th>
              </tr>
            </thead>
            <tbody>
              {serviceMatrix.map((svc) => {
                const localhostMatch = svc.backend.match(/(?:127\.0\.0\.1|localhost):(\d+)/);
                return (
                  <tr key={svc.tsService} className="border-b border-border/50 hover:bg-accent/10">
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        <span>{getServiceIcon(svc.tsService)}</span>
                        <div>
                          <div className="font-medium">{svc.tsService}</div>
                          {svc.tsDomain ? (
                            <a href={`https://${svc.tsDomain}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-ax-blue hover:underline">{svc.tsDomain}</a>
                          ) : (<div className="text-[10px] text-muted-foreground">—</div>)}
                        </div>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center">
                        <span className="text-muted-foreground">{svc.backend}</span>
                        {localhostMatch && <CopySSHButton port={localhostMatch[1]} />}
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      {svc.container ? (<span className="font-mono text-[11px]">{svc.container}</span>) : (<span className="text-muted-foreground/40">—</span>)}
                    </td>
                    <td className="p-2 text-center">{statusIcon(svc.containerStatus)}</td>
                    <td className="p-2 text-center">
                      {svc.promHealth ? (<span className={HEALTH_COLORS[svc.promHealth] || HEALTH_COLORS.unknown}>{svc.promHealth === "up" ? "✓" : "✗"}</span>) : (<span className="text-muted-foreground/40">—</span>)}
                    </td>
                    <td className="p-2">
                      {svc.relatedAlerts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">{svc.relatedAlerts.map((a) => (<Badge key={a} variant="outline" className="text-[9px] px-1 py-0 border-red-500/30 text-red-400">{a}</Badge>))}</div>
                      ) : (<span className="text-muted-foreground/40">—</span>)}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">{svc.networks.map((n) => (<Badge key={n} variant="outline" className="text-[9px] px-1 py-0">{n.length > 20 ? n.slice(0, 18) + "…" : n}</Badge>))}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemView({ data }: { data: OpsData }) {
  const { system, targets, alerts, docker: dockerInfo, tailscale } = data;
  const upCount = targets.filter((t) => t.health === "up").length;
  const downCount = targets.filter((t) => t.health === "down").length;
  const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;
  const onlineDevices = tailscale.devices.filter((d) => d.online).length;
  const runningContainers = dockerInfo.containers.filter((c) => c.status.startsWith("Up")).length;

  return (
    <div className="space-y-4">
      {/* System metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">RAM</p><p className="text-xl font-bold">{system.ram_used_pct}<span className="text-sm text-muted-foreground">%</span></p><p className="text-[10px] text-muted-foreground">{system.ram_avail_gb}/{system.ram_total_gb} Go libre</p>{pctBar(+system.ram_used_pct)}</CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Load</p><p className="text-xl font-bold">{system.load1}</p><p className="text-[10px] text-muted-foreground">load avg 1m</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Alertes</p><p className={`text-xl font-bold ${criticalAlerts > 0 ? "text-red-400" : "text-ax-green"}`}>{alerts.length}</p><p className="text-[10px] text-muted-foreground">{criticalAlerts} critique{criticalAlerts !== 1 ? "s" : ""}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Cibles</p><p className="text-xl font-bold"><span className="text-ax-green">{upCount}</span><span className="text-muted-foreground">/{targets.length}</span></p><p className="text-[10px] text-muted-foreground">{downCount} down</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Containers</p><p className="text-xl font-bold"><span className="text-ax-green">{runningContainers}</span><span className="text-muted-foreground">/{dockerInfo.containers.length}</span></p><p className="text-[10px] text-muted-foreground">{dockerInfo.system.images.size} images</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Tailscale</p><p className="text-xl font-bold"><span className="text-ax-green">{onlineDevices}</span><span className="text-muted-foreground">/{tailscale.devices.length}</span></p><p className="text-[10px] text-muted-foreground">{tailscale.services.length} services</p></CardContent></Card>
      </div>

      {/* Disk + Docker reclaim */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {system.filesystems.map((fs) => (
          <Card key={fs.mountpoint}><CardContent className="p-3">
            <div className="flex justify-between items-baseline mb-1"><p className="text-xs font-medium">{fs.mountpoint}</p><p className="text-[10px] text-muted-foreground">{fs.avail_gb} Go libre / {fs.total_gb} Go</p></div>
            {pctBar(fs.used_pct)}
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{fs.used_pct}% utilisé</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Images</p><p className="text-sm font-medium">{dockerInfo.system.images.size}</p><p className="text-[10px] text-amber-400">{dockerInfo.system.images.reclaimable} récupérable</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Volumes</p><p className="text-sm font-medium">{dockerInfo.system.volumes.size}</p><p className="text-[10px] text-amber-400">{dockerInfo.system.volumes.reclaimable} récupérable</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Containers</p><p className="text-sm font-medium">{dockerInfo.system.containers.size}</p><p className="text-[10px] text-muted-foreground">{runningContainers} actifs / {dockerInfo.containers.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground tracking-wider">Build Cache</p><p className="text-sm font-medium">{dockerInfo.system.buildCache.size}</p><p className="text-[10px] text-muted-foreground">docker builder prune</p></CardContent></Card>
      </div>

      {/* Alerts table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Alertes actives — {alerts.length}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-muted-foreground"><th className="text-left p-2 font-medium">Nom</th><th className="text-center p-2 font-medium">Sévérité</th><th className="text-left p-2 font-medium">Résumé</th></tr></thead>
            <tbody>{alerts.map((a) => (<tr key={a.name} className="border-b border-border/50 hover:bg-accent/10"><td className="p-2 font-medium">{a.name}</td><td className="p-2 text-center"><Badge variant="outline" className={`text-[10px] ${SEV_COLORS[a.severity] || SEV_COLORS.info}`}>{a.severity}</Badge></td><td className="p-2 text-muted-foreground">{a.summary}</td></tr>))}</tbody>
          </table>
        </CardContent>
      </Card>

      {/* Prometheus targets */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Cibles Prometheus — {upCount}/{targets.length} UP</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-muted-foreground"><th className="text-left p-2 font-medium">Job</th><th className="text-left p-2 font-medium">Instance</th><th className="text-center p-2 font-medium">Health</th></tr></thead>
            <tbody>{targets.map((t, i) => (<tr key={`${t.job}-${i}`} className="border-b border-border/50 hover:bg-accent/10"><td className="p-2 font-medium">{t.job}</td><td className="p-2 font-mono text-muted-foreground">{t.instance}</td><td className="p-2 text-center"><span className={HEALTH_COLORS[t.health] || HEALTH_COLORS.unknown}>{t.health === "up" ? "● UP" : "● DOWN"}</span></td></tr>))}</tbody>
          </table>
        </CardContent>
      </Card>

      {/* Tailscale devices */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Appareils Tailscale — {onlineDevices}/{tailscale.devices.length}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-muted-foreground"><th className="text-left p-2 font-medium">Nom</th><th className="text-left p-2 font-medium">OS</th><th className="text-left p-2 font-medium">IP</th><th className="text-center p-2 font-medium">Statut</th><th className="text-left p-2 font-medium">Dernière activité</th></tr></thead>
            <tbody>{tailscale.devices.map((d) => (<tr key={d.name} className="border-b border-border/50 hover:bg-accent/10"><td className="p-2 font-medium">{d.name}</td><td className="p-2 text-muted-foreground">{d.os}</td><td className="p-2 font-mono text-muted-foreground">{d.ip}</td><td className="p-2 text-center"><span className={d.online ? "text-ax-green" : "text-muted-foreground"}>{d.online ? "● En ligne" : "○ Hors ligne"}</span></td><td className="p-2 text-muted-foreground">{d.lastSeen}</td></tr>))}</tbody>
          </table>
        </CardContent>
      </Card>

      {/* All containers */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Containers — {runningContainers}/{dockerInfo.containers.length} actifs</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-muted-foreground"><th className="text-left p-2 font-medium">Nom</th><th className="text-left p-2 font-medium">Image</th><th className="text-left p-2 font-medium">Statut</th><th className="text-left p-2 font-medium">Réseaux</th><th className="text-left p-2 font-medium">Ports</th></tr></thead>
              <tbody>{dockerInfo.containers.sort((a, b) => { const aUp = a.status.startsWith("Up") ? 0 : 1; const bUp = b.status.startsWith("Up") ? 0 : 1; return aUp - bUp || a.name.localeCompare(b.name); }).map((c) => (<tr key={c.name} className="border-b border-border/50 hover:bg-accent/10"><td className="p-2 font-medium font-mono">{c.name}</td><td className="p-2 text-muted-foreground truncate max-w-[200px]">{c.image}</td><td className="p-2"><span className={c.status.startsWith("Up") ? "text-ax-green" : "text-red-400"}>{c.status.startsWith("Up") ? "● " : "○ "}{c.status.slice(0, 30)}</span></td><td className="p-2"><div className="flex flex-wrap gap-1">{c.networks.slice(0, 2).map((n) => (<Badge key={n} variant="outline" className="text-[9px] px-1 py-0">{n.length > 15 ? n.slice(0, 13) + "…" : n}</Badge>))}{c.networks.length > 2 && (<span className="text-[9px] text-muted-foreground">+{c.networks.length - 2}</span>)}</div></td><td className="p-2 text-muted-foreground font-mono text-[10px] max-w-[150px] truncate">{c.ports || "—"}</td></tr>))}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Network topology */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Carte Réseau Docker — {dockerInfo.networks.length} réseaux</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-3">
            {dockerInfo.networks.map((net) => (
              <div key={net.network} className="border border-border rounded-md p-2">
                <p className="text-[10px] font-medium text-ax-blue truncate mb-1">{net.network}</p>
                <div className="space-y-0.5">{net.containers.slice(0, 5).map((c) => (<p key={c} className="text-[10px] text-muted-foreground truncate">{c}</p>))}{net.containers.length > 5 && (<p className="text-[9px] text-muted-foreground/60">+{net.containers.length - 5} autres</p>)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Ops Panel ──

export function OpsPanel({ open, onOpenChange, defaultView }: { open: boolean; onOpenChange: (open: boolean) => void; defaultView?: View }) {
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(defaultView || "matrix");

  // Sync defaultView when panel opens
  useEffect(() => {
    if (open && defaultView) setView(defaultView);
  }, [open, defaultView]);

  const loadOps = useCallback(async () => {
    try {
      const res = await fetch("/api/ops");
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) { loadOps(); const iv = setInterval(loadOps, 60000); return () => clearInterval(iv); }
  }, [open, loadOps]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>◈ Ops — Centre d&apos;opérations</DialogTitle>
          <DialogDescription>Infrastructure, monitoring, containers et réseau</DialogDescription>
        </DialogHeader>

        {/* View switcher */}
        <div className="flex gap-2 border-b border-border pb-2">
          <button onClick={() => setView("matrix")} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === "matrix" ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>⬡ Matrice Services</button>
          <button onClick={() => setView("system")} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === "system" ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>▣ Système</button>
        </div>

        {loading ? (<p className="text-sm text-muted-foreground animate-pulse py-8">Chargement Ops…</p>) : !data ? (<p className="text-sm text-red-400 py-8">Impossible de charger les données</p>) : (
          <>
            {view === "matrix" && <MatrixView data={data} />}
            {view === "system" && <SystemView data={data} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
