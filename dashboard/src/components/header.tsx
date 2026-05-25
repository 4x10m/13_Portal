"use client";

import { useState } from "react";

// ── External links (config, not hardcoded in page) ──
const NAV_LINKS = [
  { href: "https://homepage.axiiomlab.ovh", label: "Homepage" },
  { href: "https://grafana.axiiomlab.ovh", label: "Grafana" },
  { href: "https://portainer.axiiomlab.ovh", label: "Portainer" },
  { href: "https://forgejo.axiiomlab.ovh", label: "Forgejo" },
  { href: "https://minio.axiiomlab.ovh", label: "MinIO" },
] as const;

// ── Status chip type ──
export interface StatusChip {
  status: string;
  count: number;
  color: string;   // text color class or hex
  bg: string;      // bg class
}

// ── Sub-components ──

function BrandMark() {
  return (
    <h1 className="text-lg font-bold tracking-tight select-none">
      <span className="bg-gradient-to-r from-[#00d9ff] to-[#00ff88] bg-clip-text text-transparent">
        Axiiom
      </span>
      <span className="text-[#e0e8f0]">Lab</span>
    </h1>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[11px] text-[#8899b3] hover:text-[#00d9ff] transition-colors whitespace-nowrap"
    >
      {label} ↗
    </a>
  );
}

function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute top-12 right-4 z-50 bg-[#1a2744] border border-[#2d3f5e] rounded-xl shadow-2xl p-4 min-w-[200px] space-y-1">
        <p className="text-[10px] text-[#8899b3] uppercase tracking-widest mb-2 px-2">
          Liens externes
        </p>
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#e0e8f0] hover:bg-[#243352] hover:text-[#00d9ff] transition-colors"
            onClick={onClose}
          >
            <span className="text-[#8899b3] text-xs">↗</span>
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Main Header ──

export function Header({
  subtitle,
  statusChips,
  totalCount,
  searchValue,
  onSearchChange,
  actions,
}: {
  subtitle?: string;
  statusChips?: StatusChip[];
  totalCount?: number;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  actions?: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasRichProps = statusChips || totalCount !== undefined || onSearchChange || actions;

  return (
    <header className={`border-b border-[#2d3f5e]/50 ${hasRichProps ? "px-4 py-3 space-y-3" : "flex items-center justify-between px-6 py-3"}`}>
      {/* Row 1: brand + subtitle + nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandMark />
          {subtitle && (
            <span className="text-[10px] text-[#8899b3] uppercase tracking-widest">
              {subtitle}
            </span>
          )}
          {totalCount !== undefined && (
            <span className="text-xs font-mono text-[#00d9ff] bg-[#00d9ff]/10 border border-[#00d9ff]/20 px-2 py-0.5 rounded-md">
              {totalCount} projet{totalCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <nav className="hidden md:flex items-center gap-3">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.label} href={link.href} label={link.label} />
            ))}
          </nav>

          <button
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-[#8899b3] hover:text-[#00d9ff] hover:bg-[#243352] transition-colors"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-label="Menu navigation"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Row 2: status chips + search + actions (rich mode only) */}
      {hasRichProps && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status chips */}
          {statusChips && statusChips.length > 0 && (
            <div className="flex items-center gap-1.5">
              {statusChips.map((chip) => (
                <div
                  key={chip.status}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md ${chip.bg}`}
                >
                  <span className={`text-sm font-bold ${chip.color}`}>{chip.count}</span>
                  <span className="text-[10px] text-[#8899b3]">{chip.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          {onSearchChange && (
            <div className="flex items-center gap-1.5 flex-1 min-w-[180px] max-w-xs">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8899b3] text-xs">🔍</span>
                <input
                  type="text"
                  value={searchValue || ""}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Rechercher un projet…"
                  className="w-full h-8 text-xs bg-[#1a2744] border border-[#2d3f5e] rounded-md pl-8 pr-3 text-[#e0e8f0] placeholder:text-[#8899b3]/50 focus:outline-none focus:ring-1 focus:ring-[#00d9ff]"
                />
                {searchValue && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8899b3] hover:text-[#00d9ff]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Actions slot */}
          {actions && (
            <div className="flex items-center gap-2 ml-auto">
              {actions}
            </div>
          )}
        </div>
      )}

      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  );
}
