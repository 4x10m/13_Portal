"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface PGDatabase { name: string; size_pretty: string; size_bytes: number }
interface PostgresData {
  version: string; total_databases: number; total_size: string;
  shared_buffers: string; max_connections: string; active_connections: number;
  roles: string[]; databases: PGDatabase[];
}
interface ValkeyDB { id: number; keys: number; expires: number; label: string }
interface ValkeyData {
  version: string; redis_compat: string; uptime_days: string;
  connected_clients: string; used_memory_human: string;
  used_memory_rss_human: string; used_memory_peak_human: string;
  total_connections: string; total_commands: string;
  keyspace_hits: string; keyspace_misses: string;
  maxmemory: number; maxmemory_human: string; maxmemory_policy: string;
  dbs: ValkeyDB[];
}
interface MongoDatabase { name: string; sizeOnDisk: number; sizeHuman: string; empty: boolean }
interface MongoDBData {
  version: string; uptime_days: number; connections_current: number;
  connections_available: number; memory_resident_mb: number;
  memory_virtual_mb: number; total_databases: number; databases: MongoDatabase[];
}

type DBaaSTab = "pg" | "valkey" | "mongo";

function dbBar(size: number, maxSize: number): { pct: number; bar: string } {
  const pct = maxSize > 0 ? (size / maxSize) * 100 : 0;
  const filled = Math.round(pct / 5);
  return { pct, bar: "█".repeat(filled) + "░".repeat(20 - filled) };
}

function hitRate(hits: string, misses: string): number {
  const h = parseInt(hits, 10) || 0;
  const m = parseInt(misses, 10) || 0;
  if (h + m === 0) return 0;
  return Math.round((h / (h + m)) * 100);
}

export function DBaaSPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [pg, setPG] = useState<PostgresData | null>(null);
  const [valkey, setValkey] = useState<ValkeyData | null>(null);
  const [mongo, setMongo] = useState<MongoDBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DBaaSTab>("pg");

  useEffect(() => {
    if (!open) return;
    async function load() {
      try {
        const [pgRes, vkRes, mgRes] = await Promise.all([
          fetch("/api/dbaas/postgres"), fetch("/api/dbaas/valkey"), fetch("/api/dbaas/mongodb"),
        ]);
        if (pgRes.ok) setPG(await pgRes.json());
        if (vkRes.ok) setValkey(await vkRes.json());
        if (mgRes.ok) setMongo(await mgRes.json());
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [open]);

  if (loading) return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>🐘 Bases de données</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground animate-pulse py-8">Chargement…</p>
      </DialogContent>
    </Dialog>
  );

  const maxPgSize = pg ? Math.max(...pg.databases.map(d => d.size_bytes), 1) : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🐘 Bases de données</DialogTitle>
          <DialogDescription>PostgreSQL, Valkey (Redis), MongoDB</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Top stats */}
          <div className="grid grid-cols-4 gap-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">PostgreSQL</CardTitle></CardHeader><CardContent><div className="flex items-baseline gap-2"><span className="text-2xl font-bold text-ax-blue">{pg?.total_databases ?? "—"}</span><span className="text-xs text-muted-foreground">bases</span></div><p className="text-[10px] text-muted-foreground mt-1">v{pg?.version?.split(" ")[0]} · {pg?.total_size}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Valkey</CardTitle></CardHeader><CardContent><div className="flex items-baseline gap-2"><span className="text-2xl font-bold text-ax-red">{valkey?.version ?? "—"}</span></div><p className="text-[10px] text-muted-foreground mt-1">{valkey?.used_memory_human} · {valkey?.maxmemory_human}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">MongoDB</CardTitle></CardHeader><CardContent><div className="flex items-baseline gap-2"><span className="text-2xl font-bold text-ax-green">{mongo?.total_databases ?? "—"}</span><span className="text-xs text-muted-foreground">bases</span></div><p className="text-[10px] text-muted-foreground mt-1">v{mongo?.version} · {mongo?.memory_resident_mb} MB RSS</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Connexions</CardTitle></CardHeader><CardContent><div className="space-y-1"><p className="text-sm"><span className="text-ax-blue">PG:</span> {pg?.active_connections ?? "—"} / {pg?.max_connections}</p><p className="text-sm"><span className="text-ax-red">VK:</span> {valkey?.connected_clients ?? "—"}</p><p className="text-sm"><span className="text-ax-green">MG:</span> {mongo?.connections_current ?? "—"}</p></div></CardContent></Card>
          </div>

          {/* DB selector tabs */}
          <div className="flex gap-1">
            {([
              { key: "pg" as const, label: "PostgreSQL", icon: "🐘", count: pg?.total_databases },
              { key: "valkey" as const, label: "Valkey (Redis)", icon: "🔴", count: valkey?.dbs.filter(d => d.keys > 0).length },
              { key: "mongo" as const, label: "MongoDB", icon: "🍃", count: mongo?.total_databases },
            ]).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-md text-sm transition-colors ${tab === t.key ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
                {t.icon} {t.label} ({t.count ?? 0})
              </button>
            ))}
          </div>

          {/* PostgreSQL */}
          {tab === "pg" && pg && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Version</span><span className="text-xs font-medium">PostgreSQL {pg.version.split(" ")[0]}</span></div></CardContent></Card>
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Shared Buffers</span><span className="text-xs font-medium text-ax-blue">{pg.shared_buffers}</span></div></CardContent></Card>
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Rôles</span><span className="text-xs font-medium">{pg.roles.length}</span></div></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Bases de données ({pg.databases.length}) — Total: {pg.total_size}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {pg.databases.map((db) => {
                      const { pct, bar } = dbBar(db.size_bytes, maxPgSize);
                      return (
                        <div key={db.name} className="flex items-center gap-3 py-1">
                          <span className="text-xs font-mono w-48 truncate shrink-0" title={db.name}>{db.name}</span>
                          <span className="font-mono text-[9px] text-muted-foreground w-[120px] shrink-0">{bar}</span>
                          <span className="text-[10px] text-muted-foreground w-10 shrink-0 text-right">{pct.toFixed(0)}%</span>
                          <span className="text-xs font-medium w-16 shrink-0 text-right">{db.size_pretty}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Rôles ({pg.roles.length})</CardTitle></CardHeader>
                <CardContent><div className="flex flex-wrap gap-1">{pg.roles.map((role) => (<Badge key={role} variant="outline" className="text-[9px]">{role}</Badge>))}</div></CardContent>
              </Card>
            </div>
          )}

          {/* Valkey */}
          {tab === "valkey" && valkey && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Version</span><span className="text-xs font-medium">Valkey {valkey.version} (Redis {valkey.redis_compat})</span></div></CardContent></Card>
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Uptime</span><span className="text-xs font-medium">{valkey.uptime_days} jours</span></div></CardContent></Card>
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Mémoire</span><span className="text-xs font-medium text-ax-red">{valkey.used_memory_human} / {valkey.maxmemory_human}</span></div></CardContent></Card>
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Hit rate</span><span className={`text-xs font-medium ${hitRate(valkey.keyspace_hits, valkey.keyspace_misses) > 50 ? "text-ax-green" : "text-ax-yellow"}`}>{hitRate(valkey.keyspace_hits, valkey.keyspace_misses)}%</span></div></CardContent></Card>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardHeader><CardTitle className="text-sm font-medium">DBs logiques</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">{valkey.dbs.map((db) => (
                      <div key={db.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${db.keys > 0 ? "bg-ax-red" : "bg-muted-foreground/30"}`} /><span className="text-xs font-mono">DB{db.id}</span><span className="text-[10px] text-muted-foreground">{db.label}</span></div>
                        <div className="flex items-center gap-3"><span className="text-xs font-medium">{db.keys} clés</span>{db.expires > 0 && <span className="text-[10px] text-muted-foreground">{db.expires} TTL</span>}</div>
                      </div>
                    ))}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm font-medium">Statistiques</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Commandes</span><span className="font-medium">{parseInt(valkey.total_commands).toLocaleString("fr-FR")}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Connexions totales</span><span className="font-medium">{parseInt(valkey.total_connections).toLocaleString("fr-FR")}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Keyspace hits</span><span className="font-medium text-ax-green">{parseInt(valkey.keyspace_hits).toLocaleString("fr-FR")}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Keyspace misses</span><span className="font-medium text-ax-yellow">{parseInt(valkey.keyspace_misses).toLocaleString("fr-FR")}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Mémoire RSS</span><span className="font-medium">{valkey.used_memory_rss_human}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pic mémoire</span><span className="font-medium">{valkey.used_memory_peak_human}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Éviction</span><span className="font-medium">{valkey.maxmemory_policy}</span></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* MongoDB */}
          {tab === "mongo" && mongo && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Version</span><span className="text-xs font-medium">MongoDB {mongo.version}</span></div></CardContent></Card>
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Uptime</span><span className="text-xs font-medium">{mongo.uptime_days} jours</span></div></CardContent></Card>
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Mémoire RSS</span><span className="text-xs font-medium text-ax-green">{mongo.memory_resident_mb} MB</span></div></CardContent></Card>
                <Card><CardContent className="py-3"><div className="flex justify-between"><span className="text-xs text-muted-foreground">Connexions</span><span className="text-xs font-medium">{mongo.connections_current} / {mongo.connections_current + mongo.connections_available}</span></div></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Bases de données ({mongo.databases.length})</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {mongo.databases.map((db) => (
                      <div key={db.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${db.empty ? "bg-muted-foreground/30" : "bg-ax-green"}`} /><span className="text-xs font-mono">{db.name}</span></div>
                        <span className="text-[10px] text-muted-foreground">{db.sizeHuman}</span>
                      </div>
                    ))}
                    {mongo.databases.length === 0 && <p className="text-xs text-muted-foreground">Aucune base</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
