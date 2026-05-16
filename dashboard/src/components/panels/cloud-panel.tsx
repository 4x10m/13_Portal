"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface PoolCapacity {
  vps: { count: number; total_cpu_cores: number; total_ram_mb: number; total_storage_gb: number; arm_count: number; x86_count: number };
  saas: { count: number }; api: { count: number; total_api_calls: number };
}
interface PoolStats {
  total_resources: number;
  by_type: Record<string, { count: number; types: string[] }>;
  by_status: Record<string, number>;
  by_provider: Record<string, { count: number; types: string[] }>;
}
interface MachineInfo {
  name: string; ram_mb: number; ram_used_mb: number; ram_free_mb: number;
  utilization_percent: number; assigned_roles: string[]; provider: string;
  cost_per_month: number; is_existing: boolean;
}
interface RoleAssignment { role: string; machine: string; reason: string; services: string[]; ram_mb: number; status: string }
interface MigratePlan {
  machines: Record<string, MachineInfo>; dedi_ovh: MachineInfo & {
    ram_used_with_native_mb: number; ram_free_with_native_mb: number;
    utilization_with_native_percent: number; native_services_mb: Record<string, number>; native_services_total_mb: number;
  }; assignments: RoleAssignment[]; ram_freed_mb: number; ram_overcommit: boolean; warnings: string[];
}
interface CloudDevice { hostname: string; addresses: string[]; os: string; online: boolean; lastSeen: string; tags: string[] }
interface CredentialProvider { name: string; status: "ok" | "fail" | "warn"; detail: string }

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function utilizationColor(pct: number): string {
  if (pct >= 80) return "text-ax-red";
  if (pct >= 50) return "text-ax-yellow";
  return "text-ax-green";
}

function utilizationBar(pct: number): string {
  const filled = Math.round(pct / 2.5);
  return "█".repeat(filled) + "░".repeat(40 - filled);
}

const PROVIDER_COLORS: Record<string, string> = {
  ovh: "bg-ax-blue/20 text-ax-blue", oci: "bg-ax-red/20 text-ax-red",
  aws: "bg-ax-yellow/20 text-ax-yellow", gcp: "bg-ax-green/20 text-ax-green",
  apple: "bg-gray-500/20 text-gray-400", "self-hosted": "bg-muted text-muted-foreground",
};

const ROLE_COLORS: Record<string, string> = {
  security: "border-ax-red/30", storage: "border-ax-blue/30",
  monitoring: "border-ax-green/30", messaging: "border-ax-yellow/30",
  automation: "border-purple-500/30", ai: "border-cyan-500/30",
  productivity: "border-orange-500/30", media: "border-pink-500/30",
  devtools: "border-ax-blue/30", agents: "border-ax-yellow/30",
};

export function CloudPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [pool, setPool] = useState<{ capacity: PoolCapacity | null; stats: PoolStats | null }>({ capacity: null, stats: null });
  const [plan, setPlan] = useState<MigratePlan | null>(null);
  const [devices, setDevices] = useState<CloudDevice[]>([]);
  const [credentials, setCredentials] = useState<CredentialProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    async function load() {
      try {
        const [poolRes, migrateRes, devicesRes, credRes] = await Promise.all([
          fetch("/api/cloud/pool"), fetch("/api/cloud/migrate"),
          fetch("/api/cloud/devices"), fetch("/api/cloud/credentials"),
        ]);
        if (poolRes.ok) setPool(await poolRes.json());
        if (migrateRes.ok) setPlan(await migrateRes.json());
        if (devicesRes.ok) { const d = await devicesRes.json(); setDevices(d.devices || []); }
        if (credRes.ok) { const c = await credRes.json(); setCredentials(c.providers || []); }
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [open]);

  const machines = plan ? Object.entries(plan.machines) : [];
  const dedi = plan?.dedi_ovh;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>☁ Cloud Manager</DialogTitle>
          <DialogDescription>Pool de ressources, machines et allocation</DialogDescription>
        </DialogHeader>

        {loading ? (<p className="text-sm text-muted-foreground animate-pulse py-8">Chargement…</p>) : (
          <div className="space-y-4">
            {/* Top stats */}
            <div className="grid grid-cols-6 gap-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">VPS</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold text-ax-blue">{pool.capacity?.vps.count ?? "—"}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">APIs</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold text-ax-green">{pool.capacity?.api.count ?? "—"}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">CPU</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold">{pool.capacity?.vps.total_cpu_cores ?? "—"}</span><span className="text-xs text-muted-foreground ml-1">cœurs</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">RAM totale</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold">{pool.capacity ? formatMB(pool.capacity.vps.total_ram_mb) : "—"}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Stockage</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold">{pool.capacity?.vps.total_storage_gb ?? "—"} GB</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">RAM libérée</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold text-ax-green">{plan ? formatMB(plan.ram_freed_mb) : "—"}</span></CardContent></Card>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Card className="col-span-2">
                <CardHeader><CardTitle className="text-sm font-medium">Machines &amp; Utilisation</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dedi && (
                      <div className="p-3 rounded-md bg-accent/20 border border-ax-blue/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2"><Badge variant="secondary" className={PROVIDER_COLORS["ovh"]}>OVH</Badge><span className="text-sm font-medium">{dedi.name}</span></div>
                          <span className="text-xs text-muted-foreground">{dedi.cost_per_month === 0 ? "Gratuit" : `${dedi.cost_per_month}€/mois`}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div><span className="text-muted-foreground">Containers: </span><span className={utilizationColor(dedi.utilization_percent)}>{dedi.utilization_percent}% ({formatMB(dedi.ram_used_mb)})</span></div>
                          <div><span className="text-muted-foreground">Avec natifs: </span><span className={utilizationColor(dedi.utilization_with_native_percent)}>{dedi.utilization_with_native_percent}% ({formatMB(dedi.ram_used_with_native_mb)})</span></div>
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground leading-none"><span className="text-ax-green">[{utilizationBar(dedi.utilization_percent).slice(0, 40)}]</span></div>
                        {dedi.native_services_mb && Object.keys(dedi.native_services_mb).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">{Object.entries(dedi.native_services_mb).map(([svc, mb]) => (<Badge key={svc} variant="outline" className="text-[9px]">{svc}: {formatMB(mb as number)}</Badge>))}</div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">{dedi.assigned_roles.map((role) => (<Badge key={role} variant="outline" className={`text-[9px] ${ROLE_COLORS[role] || ""}`}>{role}</Badge>))}</div>
                      </div>
                    )}
                    {machines.map(([key, m]) => (
                      <div key={key} className="p-3 rounded-md bg-accent/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2"><Badge variant="secondary" className={PROVIDER_COLORS[m.provider] || "bg-muted text-muted-foreground"}>{m.provider.toUpperCase()}</Badge><span className="text-sm font-medium">{m.name}</span></div>
                          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{formatMB(m.ram_mb)}</span><span className="text-xs text-muted-foreground">{m.cost_per_month === 0 ? "Gratuit" : `${m.cost_per_month}€/mois`}</span></div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-[10px] ${utilizationColor(m.utilization_percent)}`}>[{utilizationBar(m.utilization_percent)}]</span>
                          <span className={`text-xs ${utilizationColor(m.utilization_percent)}`}>{m.utilization_percent}% — {formatMB(m.ram_used_mb)} utilisé, {formatMB(m.ram_free_mb)} libre</span>
                        </div>
                        {m.assigned_roles.length > 0 && (<div className="flex flex-wrap gap-1">{m.assigned_roles.map((role) => (<Badge key={role} variant="outline" className={`text-[9px] ${ROLE_COLORS[role] || ""}`}>{role}</Badge>))}</div>)}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm font-medium">Allocation des rôles</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                      {plan?.assignments.map((a) => (
                        <div key={a.role} className={`flex items-center justify-between p-2 rounded border ${ROLE_COLORS[a.role] || "border-muted"}`}>
                          <div className="min-w-0"><span className="text-xs font-medium">{a.role}</span><div className="text-[10px] text-muted-foreground truncate">{a.services.length} services → {a.machine}</div></div>
                          <div className="flex items-center gap-1 shrink-0"><span className="text-[10px] text-muted-foreground">{formatMB(a.ram_mb)}</span><span className={`w-1.5 h-1.5 rounded-full ${a.status === "ready" ? "bg-ax-green" : "bg-ax-yellow"}`} /></div>
                        </div>
                      ))}
                      {!plan && <p className="text-xs text-muted-foreground">Aucune donnée</p>}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm font-medium">Identifiants Cloud</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {credentials.map((c) => (
                        <div key={c.name} className="flex items-center justify-between">
                          <span className="text-xs">{c.name}</span>
                          <div className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${c.status === "ok" ? "bg-ax-green" : "bg-ax-red"}`} /><span className="text-[10px] text-muted-foreground">{c.detail}</span></div>
                        </div>
                      ))}
                      {credentials.length === 0 && <p className="text-xs text-muted-foreground">Aucun fournisseur</p>}
                    </div>
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
