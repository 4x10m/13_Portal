"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

// ── Types ──

interface FeatureResult {
  status: "ok" | "fail" | "partial" | "skip" | "pass";
  timestamp: string;
  note?: string;
}

interface SiteResult {
  features: Record<string, FeatureResult>;
  lastTested: string;
}

interface SiteTestsData {
  version: number;
  tests: Record<string, SiteResult>;
  _meta?: { status: string; message: string };
}

interface ComputedSite {
  name: string;
  score: number;
  grade: string;
  gradeColor: string;
  pass: number;
  fail: number;
  partial: number;
  skip: number;
  features: { name: string; status: string; note?: string; time: string }[];
  lastTested: string;
}

// ── Helpers ──

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-ax-green/20 text-ax-green",
  pass: "bg-ax-green/20 text-ax-green",
  fail: "bg-red-500/20 text-red-400",
  partial: "bg-ax-yellow/20 text-ax-yellow",
  skip: "bg-muted/50 text-muted-foreground",
};

const STATUS_DOT: Record<string, string> = {
  ok: "bg-ax-green", pass: "bg-ax-green",
  fail: "bg-red-400", partial: "bg-ax-yellow", skip: "bg-muted-foreground",
};

const GRADE_STYLES: Record<string, string> = {
  A: "text-ax-green", B: "text-ax-blue", C: "text-ax-yellow",
  D: "text-orange-400", F: "text-red-400",
};

function gradeFromScore(pct: number): { grade: string; color: string } {
  if (pct >= 80) return { grade: "A", color: GRADE_STYLES.A };
  if (pct >= 60) return { grade: "B", color: GRADE_STYLES.B };
  if (pct >= 40) return { grade: "C", color: GRADE_STYLES.C };
  if (pct >= 20) return { grade: "D", color: GRADE_STYLES.D };
  return { grade: "F", color: GRADE_STYLES.F };
}

function scoreFromFeatures(features: Record<string, FeatureResult>): {
  score: number; pass: number; fail: number; partial: number; skip: number;
} {
  let pass = 0, fail = 0, partial = 0, skip = 0;
  const entries = Object.values(features);
  for (const f of entries) {
    if (f.status === "ok" || f.status === "pass") pass++;
    else if (f.status === "fail") fail++;
    else if (f.status === "partial") partial++;
    else skip++;
  }
  const total = entries.length || 1;
  const score = Math.round(((pass + partial * 0.5) / total) * 100);
  return { score, pass, fail, partial, skip };
}

function computeSites(data: SiteTestsData): ComputedSite[] {
  const sites: ComputedSite[] = [];
  for (const [name, result] of Object.entries(data.tests)) {
    const { score, pass, fail, partial, skip } = scoreFromFeatures(result.features);
    const { grade, color } = gradeFromScore(score);
    sites.push({
      name,
      score,
      grade,
      gradeColor: color,
      pass, fail, partial, skip,
      features: Object.entries(result.features).map(([fname, f]) => ({
        name: fname.replace(/_/g, " "),
        status: f.status,
        note: f.note,
        time: f.timestamp ? new Date(f.timestamp).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + ", " + new Date(f.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "",
      })),
      lastTested: result.lastTested
        ? new Date(result.lastTested).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
          + ", " + new Date(result.lastTested).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : "—",
    });
  }
  return sites.sort((a, b) => b.score - a.score);
}

function pctBarColor(pct: number): string {
  if (pct >= 80) return "bg-ax-green";
  if (pct >= 60) return "bg-ax-blue";
  if (pct >= 40) return "bg-ax-yellow";
  if (pct >= 20) return "bg-orange-400";
  return "bg-red-400";
}

type SortKey = "name" | "score" | "grade" | "fail";

// ── Sub-views ──

function FeatureChips({ features, max = 3 }: { features: ComputedSite["features"]; max?: number }) {
  const visible = features.slice(0, max);
  const extra = features.length - max;
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((f) => (
        <span key={f.name} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLORS[f.status] || STATUS_COLORS.skip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[f.status] || STATUS_DOT.skip}`} />
          <span className="truncate max-w-[80px]">{f.name}</span>
        </span>
      ))}
      {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
    </div>
  );
}

function FeatureDetail({ site }: { site: ComputedSite }) {
  return (
    <div className="space-y-1.5">
      {site.features.map((f) => (
        <div key={f.name} className="flex items-start gap-2 py-1 border-b border-border/50 last:border-0">
          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${STATUS_DOT[f.status] || STATUS_DOT.skip}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{f.name}</span>
              <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_COLORS[f.status] || STATUS_COLORS.skip}`}>
                {f.status}
              </Badge>
            </div>
            {f.note && <p className="text-[11px] text-muted-foreground mt-0.5 break-all">{f.note}</p>}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">{f.time}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Panel ──

export function WebMonitorPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<SiteTestsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<ComputedSite | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<"all" | "fail" | "partial" | "ok">("all");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/web-monitor");
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) { loadData(); const iv = setInterval(loadData, 120000); return () => clearInterval(iv); }
  }, [open, loadData]);

  const sites = data ? computeSites(data) : [];

  const filtered = sites
    .filter((s) => {
      if (filterStatus === "fail") return s.fail > 0;
      if (filterStatus === "partial") return s.partial > 0 && s.fail === 0;
      if (filterStatus === "ok") return s.fail === 0 && s.partial === 0;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "score": cmp = a.score - b.score; break;
        case "grade": cmp = a.grade.localeCompare(b.grade); break;
        case "fail": cmp = a.fail - b.fail; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  // Summary stats
  const totalSites = sites.length;
  const avgScore = sites.length > 0 ? Math.round(sites.reduce((s, x) => s + x.score, 0) / sites.length) : 0;
  const totalFails = sites.reduce((s, x) => s + x.fail, 0);
  const totalPass = sites.reduce((s, x) => s + x.pass, 0);
  const { grade: avgGrade, color: avgGradeColor } = gradeFromScore(avgScore);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🌐 Web Monitor — Santé des sites</DialogTitle>
          <DialogDescription>Résultats des tests CDP Groudon sur {totalSites} sites</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse py-8">Chargement Web Monitor…</p>
        ) : !data || data._meta?.status === "no-data" ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Données Groudon non disponibles</p>
            <p className="text-xs text-muted-foreground mt-1">Assurez-vous que site-tests.json est monté dans /app/data/groudon/</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <Card><CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold">{totalSites}</p>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Sites</p>
              </CardContent></Card>
              <Card><CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold text-ax-green">{totalPass}</p>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Pass</p>
              </CardContent></Card>
              <Card><CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold text-red-400">{totalFails}</p>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Fail</p>
              </CardContent></Card>
              <Card><CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold">{avgScore}<span className="text-xs text-muted-foreground">%</span></p>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Score moyen</p>
              </CardContent></Card>
              <Card><CardContent className="p-2.5 text-center">
                <p className={`text-lg font-bold ${avgGradeColor}`}>{avgGrade}</p>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Grade moyen</p>
              </CardContent></Card>
              <Card><CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold text-ax-yellow">{sites.reduce((s, x) => s + x.partial, 0)}</p>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Partial</p>
              </CardContent></Card>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1">
                {(["all", "fail", "partial", "ok"] as const).map((f) => (
                  <button key={f} onClick={() => setFilterStatus(f)}
                    className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${filterStatus === f ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
                    {{ all: "Tous", fail: "❌ Fail", partial: "⚠ Partial", ok: "✅ OK" }[f]}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-border" />
              <select
                value={`${sortBy}:${sortDir}`}
                onChange={(e) => { const [by, dir] = e.target.value.split(":") as [SortKey, typeof sortDir]; setSortBy(by); setSortDir(dir); }}
                className="h-7 text-xs bg-transparent border border-border rounded-md px-2 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ax-blue"
              >
                <option value="score:desc">Score ↘</option>
                <option value="score:asc">Score ↗</option>
                <option value="name:asc">Nom A-Z</option>
                <option value="name:desc">Nom Z-A</option>
                <option value="fail:desc">+ Fails</option>
                <option value="grade:asc">Grade ↗</option>
              </select>
              <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length}/{sites.length} sites</span>
            </div>

            {/* Sites table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left p-2 font-medium">Site</th>
                        <th className="text-center p-2 font-medium">Score</th>
                        <th className="text-center p-2 font-medium">Grade</th>
                        <th className="text-center p-2 font-medium">✓</th>
                        <th className="text-center p-2 font-medium">✗</th>
                        <th className="text-center p-2 font-medium">⚠</th>
                        <th className="text-left p-2 font-medium">Santé</th>
                        <th className="text-left p-2 font-medium">Features</th>
                        <th className="text-left p-2 font-medium">Dernier test</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((site) => (
                        <tr key={site.name}
                          className="border-b border-border/50 hover:bg-accent/10 cursor-pointer"
                          onClick={() => setSelectedSite(site)}
                        >
                          <td className="p-2 font-medium">{site.name}</td>
                          <td className="p-2 text-center">{site.score}%</td>
                          <td className="p-2 text-center">
                            <span className={`font-bold text-sm ${site.gradeColor}`}>{site.grade}</span>
                          </td>
                          <td className="p-2 text-center text-ax-green">{site.pass}</td>
                          <td className="p-2 text-center text-red-400">{site.fail}</td>
                          <td className="p-2 text-center text-ax-yellow">{site.partial}</td>
                          <td className="p-2">
                            <div className="h-1.5 bg-muted rounded-full min-w-[60px]">
                              <div className={`h-full rounded-full ${pctBarColor(site.score)}`} style={{ width: `${site.score}%` }} />
                            </div>
                          </td>
                          <td className="p-2"><FeatureChips features={site.features} /></td>
                          <td className="p-2 text-muted-foreground text-[11px]">{site.lastTested}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Feature detail sub-dialog */}
            {selectedSite && (
              <Card className="mt-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span>{selectedSite.name}</span>
                    <span className={`text-lg font-bold ${selectedSite.gradeColor}`}>{selectedSite.grade}</span>
                    <Badge variant="outline" className="text-[10px]">{selectedSite.score}%</Badge>
                    <button onClick={() => setSelectedSite(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕ Fermer</button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FeatureDetail site={selectedSite} />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
