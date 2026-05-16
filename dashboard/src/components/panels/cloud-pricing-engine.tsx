"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend,
} from "recharts";

// ── Types ──

interface PricingPlan {
  id: string;
  model: string;
  type: "dedicated" | "vps";
  cpu?: string;
  cores: number;
  threads?: number;
  ram: number;
  disk: number;
  diskType: string;
  priceMonthly: number;
  effectiveMonthly: number;
  perfScore: number;
  perfPerEuro: number;
  setupFee?: number;
  setupFeeAmortized?: number;
  bandwidth?: string;
  note?: string;
  _pool?: string[];
  providerId?: string;
  providerLabel?: string;
  currency?: string;
  dedicatedCpu?: boolean;
  sharedCpu?: boolean;
  billing?: string;
}

interface PricingCache {
  version: string;
  generatedAt: string;
  providers: Record<string, {
    label: string;
    url?: string;
    type?: string;
    location?: string[];
    plans: PricingPlan[];
  }>;
  hardwareComparison: {
    note: string;
    components: { item: string; price: number }[];
    recurringYearly: { item: string; price: number }[];
    conclusion: string;
  };
  _meta?: { status: string; message: string };
}

interface StrategyComposition {
  id: string;
  model: string;
  type: string;
  cores: number;
  ram: number;
  disk: number;
  diskType: string;
  priceMonthly?: number;
  effectiveMonthly: number;
  perfScore: number;
  perfPerEuro: number;
  providerId?: string;
  providerLabel?: string;
  note?: string;
}

// ── Constants ──

const PROVIDER_COLORS: Record<string, string> = {
  hetzner: "#e5534b", ovh: "#3b82f6", ovheco: "#58a6ff",
  kimsufi: "#d29922", scaleway: "#8b5cf6", ionos: "#3fb950",
  racknerd: "#f97316", buyvm: "#06b6d4", hostinger: "#ec4899",
  digitalocean: "#6366f1", kainode: "#14b8a6", contabo: "#a855f7",
  vultr: "#22c55e", greencloud: "#84cc16",
};

const GRADE_COLORS: Record<string, string> = {
  A: "#3fb950", B: "#58a6ff", C: "#d29922", D: "#f97316", F: "#f85149",
};

// ── Scoring Engine ──

interface Weights {
  cpu: number;
  ram: number;
  disk: number;
  price: number;
}

interface Baseline {
  cores: number;
  ram: number;
  disk: number;
  price: number;
  label: string;
}

const DEFAULT_WEIGHTS: Weights = { cpu: 1, ram: 0.6, disk: 1, price: 1 };
const DEFAULT_BASELINE: Baseline = { cores: 8, ram: 32, disk: 450, price: 21.59, label: "KS-5" };

function computePerfScore(plan: PricingPlan, weights: Weights, baseline: Baseline): number {
  const cpuRatio = plan.cores / baseline.cores;
  const ramRatio = plan.ram / baseline.ram;
  const diskRatio = plan.disk / baseline.disk;
  const priceRatio = baseline.price / plan.effectiveMonthly; // inverted: cheaper = better

  const totalWeight = weights.cpu + weights.ram + weights.disk + weights.price;
  if (totalWeight === 0) return 0;

  return (
    (cpuRatio * weights.cpu + ramRatio * weights.ram + diskRatio * weights.disk + priceRatio * weights.price) /
    totalWeight
  );
}

function gradeFromScore(score: number): string {
  if (score >= 1.8) return "A";
  if (score >= 1.3) return "B";
  if (score >= 0.9) return "C";
  if (score >= 0.5) return "D";
  return "F";
}

// ── Chart tooltip ──

function PerfPriceTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, string | number>;
  return (
    <div className="bg-popover border border-border rounded-lg p-2 text-xs shadow-lg">
      <p className="font-medium">{String(d.providerLabel)} {String(d.model)}</p>
      <p className="text-muted-foreground">{String(d.type)} · {d.cores}c · {d.ram}GB · {d.disk}GB {String(d.diskType)}</p>
      <p className="text-ax-green">{Number(d.effectiveMonthly).toFixed(2)}€ TTC</p>
      <p className="text-ax-blue">Score: {Number(d.score).toFixed(3)}</p>
    </div>
  );
}

// ── Sortable Table ──

type TableSort = "effectiveMonthly" | "score" | "perfPerEuro" | "cores" | "ram" | "disk";

function SortableTable({ plans, onPin, pinnedIds }: {
  plans: (PricingPlan & { score: number; scoreGrade: string })[];
  onPin: (id: string) => void;
  pinnedIds: Set<string>;
}) {
  const [sortBy, setSortBy] = useState<TableSort>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...plans].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "effectiveMonthly": cmp = a.effectiveMonthly - b.effectiveMonthly; break;
        case "score": cmp = a.score - b.score; break;
        case "perfPerEuro": cmp = a.perfPerEuro - b.perfPerEuro; break;
        case "cores": cmp = a.cores - b.cores; break;
        case "ram": cmp = a.ram - b.ram; break;
        case "disk": cmp = a.disk - b.disk; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [plans, sortBy, sortDir]);

  const handleSort = (key: TableSort) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("desc"); }
  };

  const SortHeader = ({ k, label }: { k: TableSort; label: string }) => (
    <th
      className="p-1.5 cursor-pointer select-none hover:text-ax-green whitespace-nowrap"
      onClick={() => handleSort(k)}
    >
      {label} {sortBy === k ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );

  const pinnedPlans = sorted.filter((p) => pinnedIds.has(p.id));
  const pinnedTotal = pinnedPlans.reduce((s, p) => s + p.effectiveMonthly, 0);
  const pinnedPerf = pinnedPlans.reduce((s, p) => s + p.score, 0);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-popover z-10">
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-1.5 w-6">📌</th>
                <SortHeader k="effectiveMonthly" label="€/mois" />
                <SortHeader k="score" label="Score" />
                <SortHeader k="perfPerEuro" label="Perf/€" />
                <th className="p-1.5 text-left">Provider</th>
                <th className="p-1.5 text-left">Modèle</th>
                <th className="p-1.5">Type</th>
                <SortHeader k="cores" label="Cores" />
                <SortHeader k="ram" label="RAM" />
                <SortHeader k="disk" label="Disque" />
                <th className="p-1.5">Stockage</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((plan) => {
                const isPinned = pinnedIds.has(plan.id);
                return (
                  <tr key={plan.id}
                    className={`border-b border-border/50 hover:bg-accent/10 ${isPinned ? "bg-purple-500/10 border-l-2 border-l-purple-500" : ""}`}
                  >
                    <td className="p-1.5 text-center">
                      <button onClick={() => onPin(plan.id)} className={`opacity-40 hover:opacity-100 ${isPinned ? "opacity-100" : ""}`}>
                        {isPinned ? "📌" : "📍"}
                      </button>
                    </td>
                    <td className="p-1.5 font-mono text-ax-green">{plan.effectiveMonthly.toFixed(2)}€</td>
                    <td className="p-1.5">
                      <span className={`font-bold ${GRADE_COLORS[plan.scoreGrade] || ""}`}>
                        {plan.score.toFixed(2)}
                      </span>
                    </td>
                    <td className="p-1.5 font-mono text-ax-blue">{plan.perfPerEuro.toFixed(4)}</td>
                    <td className="p-1.5">
                      <span style={{ color: PROVIDER_COLORS[plan.providerId || ""] || "#8b949e" }}>
                        {plan.providerLabel || plan.providerId}
                      </span>
                    </td>
                    <td className="p-1.5 font-medium">{plan.model}</td>
                    <td className="p-1.5">
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${plan.type === "dedicated" ? "border-ax-blue/30 text-ax-blue" : "border-ax-yellow/30 text-ax-yellow"}`}>
                        {plan.type === "dedicated" ? "Dédié" : "VPS"}
                      </Badge>
                    </td>
                    <td className="p-1.5 text-center">{plan.cores}</td>
                    <td className="p-1.5 text-center">{plan.ram}GB</td>
                    <td className="p-1.5 text-center">{plan.disk >= 1000 ? `${(plan.disk / 1000).toFixed(1)}T` : `${plan.disk}G`}</td>
                    <td className="p-1.5">
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${plan.diskType === "NVMe" ? "border-ax-green/30 text-ax-green" : plan.diskType === "SSD" ? "border-ax-blue/30 text-ax-blue" : "border-muted text-muted-foreground"}`}>
                        {plan.diskType}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {pinnedPlans.length > 0 && (
              <tfoot className="sticky bottom-0 bg-popover border-t-2 border-purple-500">
                <tr className="text-purple-400 font-bold">
                  <td colSpan={2} className="p-1.5">📌 {pinnedPlans.length} plans · {pinnedTotal.toFixed(2)}€ TTC</td>
                  <td className="p-1.5">{pinnedPerf.toFixed(2)}</td>
                  <td colSpan={8} className="p-1.5">Score total: {pinnedPerf.toFixed(2)} · Perf/€: {pinnedTotal > 0 ? (pinnedPerf / pinnedTotal).toFixed(4) : "—"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Panel ──

type View = "overview" | "table" | "hardware";

export function CloudPricingEngine({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [rawData, setRawData] = useState<PricingCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("overview");

  // Engine state
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });
  const [baseline, setBaseline] = useState<Baseline>({ ...DEFAULT_BASELINE });
  const [typeFilter, setTypeFilter] = useState<"all" | "dedicated" | "vps">("all");
  const [diskFilter, setDiskFilter] = useState<"all" | "NVMe" | "SSD">("all");
  const [maxPrice, setMaxPrice] = useState(60);
  const [minRam, setMinRam] = useState(0);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/cloud-pricing");
      if (res.ok) setRawData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  // Flatten all plans with provider info
  const allPlans: PricingPlan[] = useMemo(() => {
    if (!rawData?.providers) return [];
    const plans: PricingPlan[] = [];
    for (const [pid, pdata] of Object.entries(rawData.providers)) {
      for (const plan of pdata.plans || []) {
        plans.push({ ...plan, providerId: pid, providerLabel: pdata.label || pid });
      }
    }
    return plans;
  }, [rawData]);

  // Filtered + scored plans
  const scoredPlans = useMemo(() => {
    return allPlans
      .filter((p) => {
        if (typeFilter !== "all" && p.type !== typeFilter) return false;
        if (diskFilter !== "all" && p.diskType !== diskFilter) return false;
        if (p.effectiveMonthly > maxPrice) return false;
        if (p.ram < minRam) return false;
        return true;
      })
      .map((p) => {
        const score = computePerfScore(p, weights, baseline);
        return { ...p, score, scoreGrade: gradeFromScore(score) };
      });
  }, [allPlans, typeFilter, diskFilter, maxPrice, minRam, weights, baseline]);

  // Chart data
  const scatterData = useMemo(() =>
    scoredPlans.map((p) => ({
      x: p.effectiveMonthly,
      y: p.score,
      z: p.cores * 3 + p.ram,
      ...p,
      providerColor: PROVIDER_COLORS[p.providerId || ""] || "#8b949e",
    })),
    [scoredPlans]
  );

  // Provider bar chart — avg perf/€ per provider
  const providerBarData = useMemo(() => {
    const byProvider: Record<string, { label: string; avgPerfPerEuro: number; count: number; color: string }> = {};
    for (const p of scoredPlans) {
      const pid = p.providerId || "unknown";
      if (!byProvider[pid]) {
        byProvider[pid] = { label: p.providerLabel || pid, avgPerfPerEuro: 0, count: 0, color: PROVIDER_COLORS[pid] || "#8b949e" };
      }
      byProvider[pid].avgPerfPerEuro += p.perfPerEuro;
      byProvider[pid].count++;
    }
    return Object.values(byProvider)
      .map((v) => ({ ...v, avgPerfPerEuro: v.avgPerfPerEuro / v.count }))
      .sort((a, b) => b.avgPerfPerEuro - a.avgPerfPerEuro);
  }, [scoredPlans]);

  const handlePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const hw = rawData?.hardwareComparison;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>☁ Cloud Pricing — Moteur de comparaison</DialogTitle>
          <DialogDescription>
            {allPlans.length} plans · Baseline: {baseline.label} @ {baseline.price.toFixed(2)}€ TTC
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse py-8">Chargement Cloud Pricing…</p>
        ) : !rawData || rawData._meta?.status === "no-data" ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Données pricing non disponibles</p>
            <p className="text-xs text-muted-foreground mt-1">Assurez-vous que groudon-pricing-cache.json est monté</p>
          </div>
        ) : (
          <>
            {/* ── View switcher ── */}
            <div className="flex gap-2 border-b border-border pb-2">
              {([
                { v: "overview" as View, label: "📊 Vue d'ensemble" },
                { v: "table" as View, label: "📋 Tableau complet" },
                { v: "hardware" as View, label: "🔧 Hardware vs Cloud" },
              ]).map(({ v, label }) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === v ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Controls panel (always visible) ── */}
            <Card className="border-ax-blue/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm">🎛️ Poids du score perf</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {([
                  { key: "cpu" as const, label: "CPU", val: weights.cpu },
                  { key: "ram" as const, label: "RAM", val: weights.ram },
                  { key: "disk" as const, label: "Disk", val: weights.disk },
                  { key: "price" as const, label: "Prix (inversé)", val: weights.price },
                ]).map(({ key, label, val }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground min-w-[100px]">{label}</span>
                    <input
                      type="range" min={0} max={3} step={0.1} value={val}
                      onChange={(e) => setWeights((w) => ({ ...w, [key]: +e.target.value }))}
                      className="flex-1 accent-ax-blue"
                    />
                    <span className="text-xs font-mono text-ax-blue min-w-[30px] text-right">{val.toFixed(1)}</span>
                  </div>
                ))}

                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Type:</span>
                  <div className="flex gap-1">
                    {(["all", "dedicated", "vps"] as const).map((t) => (
                      <button key={t} onClick={() => setTypeFilter(t)}
                        className={`px-2 py-1 rounded text-[11px] transition-colors ${typeFilter === t ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground border border-border"}`}>
                        {{ all: "Tous", dedicated: "Dédiés", vps: "VPS" }[t]}
                      </button>
                    ))}
                  </div>

                  <span className="text-xs text-muted-foreground ml-2">Stockage:</span>
                  <div className="flex gap-1">
                    {(["all", "NVMe", "SSD"] as const).map((d) => (
                      <button key={d} onClick={() => setDiskFilter(d)}
                        className={`px-2 py-1 rounded text-[11px] transition-colors ${diskFilter === d ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground border border-border"}`}>
                        {{ all: "Tous", NVMe: "NVMe", SSD: "SSD+" }[d]}
                      </button>
                    ))}
                  </div>

                  <span className="text-xs text-muted-foreground ml-2">Prix max:</span>
                  <input type="range" min={5} max={120} step={5} value={maxPrice}
                    onChange={(e) => setMaxPrice(+e.target.value)}
                    className="w-20 accent-ax-blue"
                  />
                  <span className="text-xs font-mono text-ax-green">{maxPrice}€</span>

                  <span className="text-xs text-muted-foreground ml-2">Min RAM:</span>
                  <input type="range" min={0} max={128} step={4} value={minRam}
                    onChange={(e) => setMinRam(+e.target.value)}
                    className="w-20 accent-ax-blue"
                  />
                  <span className="text-xs font-mono">{minRam}GB</span>

                  <button onClick={() => { setWeights({ ...DEFAULT_WEIGHTS }); setMaxPrice(60); setMinRam(0); setTypeFilter("all"); setDiskFilter("all"); }}
                    className="ml-auto px-2 py-1 rounded text-[11px] text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors">
                    🔄 RAZ
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* ── Overview view ── */}
            {view === "overview" && (
              <div className="space-y-4">
                {/* Perf vs Price scatter */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">📊 Prix vs Performance ({baseline.label} = 1.0)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                        <XAxis type="number" dataKey="x" name="Prix €" unit="€" stroke="#8b949e" fontSize={11} />
                        <YAxis type="number" dataKey="y" name="Score" stroke="#8b949e" fontSize={11} />
                        <Tooltip content={<PerfPriceTooltip />} />
                        <Scatter data={scatterData} fill="#58a6ff">
                          {scatterData.map((entry, i) => (
                            <Cell key={i} fill={entry.providerColor} r={Math.max(4, Math.min(12, (entry.cores || 2) * 0.8))} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-2">
                      {Object.entries(PROVIDER_COLORS).filter(([pid]) => scoredPlans.some((p) => p.providerId === pid)).map(([pid, color]) => (
                        <span key={pid} className="flex items-center gap-1 text-[10px]">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-muted-foreground">{rawData?.providers?.[pid]?.label || pid}</span>
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Provider perf/€ bar chart */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">🏆 Score perf/€ moyen par provider</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={providerBarData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                        <XAxis dataKey="label" stroke="#8b949e" fontSize={10} angle={-30} textAnchor="end" height={60} />
                        <YAxis stroke="#8b949e" fontSize={11} />
                        <Tooltip
                          contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: "#e6edf3" }}
                        />
                        <Bar dataKey="avgPerfPerEuro" name="Perf/€" radius={[4, 4, 0, 0]}>
                          {providerBarData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Top 5 best perf/€ */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">⭐ Top 5 meilleur rapport perf/€</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {[...scoredPlans].sort((a, b) => b.perfPerEuro - a.perfPerEuro).slice(0, 5).map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent/10">
                        <span className="text-sm font-bold text-muted-foreground w-5">#{i + 1}</span>
                        <span style={{ color: PROVIDER_COLORS[p.providerId || ""] }}>{p.providerLabel}</span>
                        <span className="font-medium">{p.model}</span>
                        <span className="text-[10px] text-muted-foreground">{p.cores}c · {p.ram}GB · {p.disk >= 1000 ? `${(p.disk / 1000).toFixed(1)}T` : `${p.disk}G`} {p.diskType}</span>
                        <span className="ml-auto font-mono text-ax-green">{p.effectiveMonthly.toFixed(2)}€</span>
                        <span className="font-mono text-ax-blue">{p.perfPerEuro.toFixed(4)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground text-center">{scoredPlans.length} plans affichés sur {allPlans.length} total</p>
              </div>
            )}

            {/* ── Table view ── */}
            {view === "table" && (
              <div className="space-y-2">
                <SortableTable plans={scoredPlans} onPin={handlePin} pinnedIds={pinnedIds} />
                <p className="text-xs text-muted-foreground text-center">{scoredPlans.length} plans · Cliquez 📌 pour épingler</p>
              </div>
            )}

            {/* ── Hardware view ── */}
            {view === "hardware" && hw && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">🔧 Coût hardware équivalent</CardTitle></CardHeader>
                    <CardContent>
                      {hw.components.map((c, i) => (
                        <div key={i} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                          <span className="text-xs">{c.item}</span>
                          <span className="text-xs font-mono text-ax-green">{c.price}€</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 font-bold text-sm">
                        <span>Total hardware</span>
                        <span className="text-ax-green">{hw.components.reduce((s, c) => s + c.price, 0)}€</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">💰 Coûts récurrents annuels</CardTitle></CardHeader>
                    <CardContent>
                      {hw.recurringYearly.map((c, i) => (
                        <div key={i} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                          <span className="text-xs">{c.item}</span>
                          <span className="text-xs font-mono text-ax-yellow">{c.price}€/an</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 font-bold text-sm">
                        <span>Total/an</span>
                        <span className="text-ax-yellow">{hw.recurringYearly.reduce((s, c) => s + c.price, 0)}€</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium text-ax-blue mb-1">📐 Conclusion</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{hw.conclusion}</p>
                  </CardContent>
                </Card>

                {/* Quick comparison: KS-5 vs top 3 dedicated */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">⚡ KS-5 vs Top 3 Dédiés</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {[...scoredPlans].filter((p) => p.type === "dedicated").sort((a, b) => b.score - a.score).slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-border/50 hover:bg-accent/10">
                        <span style={{ color: PROVIDER_COLORS[p.providerId || ""] }} className="font-medium">{p.providerLabel}</span>
                        <span className="text-xs">{p.model}</span>
                        <span className="text-[10px] text-muted-foreground">{p.cores}c/{p.threads}t · {p.ram}GB · {p.disk >= 1000 ? `${(p.disk / 1000).toFixed(1)}T` : `${p.disk}G`} {p.diskType}</span>
                        <span className="ml-auto font-mono text-ax-green">{p.effectiveMonthly.toFixed(2)}€</span>
                        <span className={`font-bold ${GRADE_COLORS[p.scoreGrade]}`}>{p.scoreGrade}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
