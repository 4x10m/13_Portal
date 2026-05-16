"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Project } from "@/lib/db/types";

// ── Service card from index.html design ──

interface ServiceEntry {
  name: string;
  icon: string;
  desc: string;
  url: string;
  port?: string;
  category: string;
}

const SERVICES: ServiceEntry[] = [
  // AI & Agents
  { name: "Open-WebUI", icon: "🤖", desc: "Chat LLM (Ollama + API)", url: "https://open-webui.dolly-tilapia.ts.net", port: ":3003", category: "AI & Agents" },
  { name: "Ollama", icon: "🤖", desc: "LLM inference locale", url: "https://ollama.dolly-tilapia.ts.net", port: ":11434", category: "AI & Agents" },
  { name: "LiteLLM Proxy", icon: "🤖", desc: "Routeur LLM multi-provider", url: "https://litellm.dolly-tilapia.ts.net", port: ":4000", category: "AI & Agents" },
  { name: "Unified Agent", icon: "🤖", desc: "Agent IA unifié (v4)", url: "https://unified.dolly-tilapia.ts.net", port: ":8084", category: "AI & Agents" },
  { name: "Prompt Builder", icon: "🤖", desc: "Builder de prompts", url: "https://prompt-builder.dolly-tilapia.ts.net", port: ":8095", category: "AI & Agents" },
  { name: "Hyperactive Agent", icon: "🤖", desc: "Agent v6 hyperactif", url: "https://hyperactive.dolly-tilapia.ts.net", port: ":9096", category: "AI & Agents" },
  { name: "Hermes", icon: "🤖", desc: "Agent Hermes", url: "https://hermes.dolly-tilapia.ts.net", port: ":9119", category: "AI & Agents" },
  { name: "Agent-Zero", icon: "🤖", desc: "Agent-Zero (testlab)", url: "https://agent-zero.dolly-tilapia.ts.net", port: ":8120", category: "AI & Agents" },
  { name: "RAGFlow", icon: "🤖", desc: "RAG pipeline — DO NOT TOUCH", url: "https://ragflow.dolly-tilapia.ts.net", port: ":8105", category: "AI & Agents" },
  // OpenCode
  { name: "OpenCode", icon: "💻", desc: "OpenCode natif (systemd)", url: "https://opencode.dolly-tilapia.ts.net", port: ":4096", category: "OpenCode" },
  { name: "OpenCode Prod", icon: "💻", desc: "OpenCode production", url: "https://opencode-prod.dolly-tilapia.ts.net", port: ":4099", category: "OpenCode" },
  { name: "OpenCode Ultra", icon: "💻", desc: "OpenCode ultra", url: "https://opencode-ultra.dolly-tilapia.ts.net", port: ":4097", category: "OpenCode" },
  { name: "OpenCode Light", icon: "💻", desc: "OpenCode light", url: "https://opencode-light.dolly-tilapia.ts.net", port: ":4098", category: "OpenCode" },
  { name: "OpenCode Staging", icon: "💻", desc: "OpenCode staging", url: "https://opencode-stack.dolly-tilapia.ts.net", port: ":4100", category: "OpenCode" },
  // Infra & DevOps
  { name: "Portainer", icon: "🔧", desc: "Docker management", url: "https://portainer.dolly-tilapia.ts.net", port: ":9000", category: "Infra & DevOps" },
  { name: "Grafana", icon: "🔧", desc: "Dashboards monitoring", url: "https://grafana.dolly-tilapia.ts.net", port: ":3030", category: "Infra & DevOps" },
  { name: "Forgejo", icon: "🔧", desc: "Git self-hosted", url: "https://git.dolly-tilapia.ts.net", port: ":3000", category: "Infra & DevOps" },
  { name: "Woodpecker CI", icon: "🔧", desc: "CI/CD pipelines (Forgejo OAuth2)", url: "https://ci.dolly-tilapia.ts.net", port: ":8010", category: "Infra & DevOps" },
  { name: "WG-Easy", icon: "🔧", desc: "WireGuard VPN UI", url: "https://wg-easy.dolly-tilapia.ts.net", port: ":51821", category: "Infra & DevOps" },
  { name: "Homepage", icon: "🔧", desc: "Dashboard services", url: "https://homepage.dolly-tilapia.ts.net", port: ":3012", category: "Infra & DevOps" },
  { name: "Registry", icon: "🔧", desc: "Docker registry locale", url: "http://127.0.0.1:5000", port: ":5000", category: "Infra & DevOps" },
  // VPS Fleet
  { name: "Uptime Kuma", icon: "☁️", desc: "Monitoring status pages (oci-x86-micro-1)", url: "https://oci-x86-micro-1.dolly-tilapia.ts.net", port: ":3001", category: "VPS Fleet" },
  { name: "n8n", icon: "☁️", desc: "Workflow automation (gcp-e2-small-us)", url: "https://gcp-e2-small-us.dolly-tilapia.ts.net", port: ":5678", category: "VPS Fleet" },
  // Apps & Storage
  { name: "Paperless", icon: "📦", desc: "Gestion documents", url: "https://paperless.dolly-tilapia.ts.net", port: ":8011", category: "Apps & Storage" },
  { name: "Immich", icon: "📦", desc: "Gestion photos", url: "https://photo.dolly-tilapia.ts.net", port: ":2283", category: "Apps & Storage" },
  { name: "Stirling-PDF", icon: "📦", desc: "Outils PDF", url: "https://pdf.dolly-tilapia.ts.net", port: ":8010", category: "Apps & Storage" },
  { name: "ArchiveBox", icon: "📦", desc: "Archive web", url: "https://archive.dolly-tilapia.ts.net", port: ":8002", category: "Apps & Storage" },
  { name: "pgAdmin", icon: "📦", desc: "Admin PostgreSQL", url: "https://pgadmin.dolly-tilapia.ts.net", port: ":5050", category: "Apps & Storage" },
  // Public
  { name: "Portal", icon: "🌐", desc: "Portail des services", url: "https://portal.axiiomlab.ovh", category: "Public" },
  { name: "MCP Server", icon: "🌐", desc: "AxiiomLab MCP HTTP", url: "https://mcp.axiiomlab.ovh/mcp", category: "Public" },
];

const CATEGORIES = [...new Set(SERVICES.map((s) => s.category))];

const CATEGORY_ICONS: Record<string, string> = {
  "AI & Agents": "🤖",
  "OpenCode": "💻",
  "Infra & DevOps": "🔧",
  "VPS Fleet": "☁️",
  "Apps & Storage": "📦",
  Public: "🌐",
};

export default function PortalPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/roadmap/projects")
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => {});
  }, []);

  const activeProjects = projects.filter((p) => p.status === "in-progress").length;
  const totalContainers = projects.reduce((s, p) => s + (p.docker_containers?.length || 0), 0);
  const totalSessions = projects.reduce((s, p) => s + (p.opencode_sessions?.length || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}>
      {/* ── Header ── */}
      <div className="text-center mb-8 pt-10 pb-4">
        <h1
          className="text-5xl font-bold mb-2"
          style={{
            background: "linear-gradient(90deg, #00d9ff, #00ff88)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          AxiiomLab
        </h1>
        <p className="text-[#888] text-sm">Portail des services — {SERVICES.length} services</p>

        {/* Quick stats */}
        <div className="flex items-center justify-center gap-6 mt-6">
          <Link
            href="/projets"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2a2a4a] hover:border-[#00d9ff] transition-all text-sm text-[#e0e0e0]"
          >
            <span className="text-[#00d9ff] font-bold text-lg">{projects.length}</span>
            <span className="text-[#888]">projets</span>
          </Link>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2a2a4a] text-sm text-[#e0e0e0]">
            <span className="text-[#00ff88] font-bold text-lg">{activeProjects}</span>
            <span className="text-[#888]">en cours</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2a2a4a] text-sm text-[#e0e0e0]">
            <span className="text-[#ffbe0b] font-bold text-lg">{totalContainers}</span>
            <span className="text-[#888]">conteneurs</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2a2a4a] text-sm text-[#e0e0e0]">
            <span className="text-purple-400 font-bold text-lg">{totalSessions}</span>
            <span className="text-[#888]">sessions OC</span>
          </div>
        </div>
      </div>

      {/* ── Service categories ── */}
      <div className="px-8 pb-4">
        {CATEGORIES.map((cat) => {
          const catServices = SERVICES.filter((s) => s.category === cat);
          return (
            <div key={cat} className="mb-8">
              <h2
                className="text-xl font-semibold mb-4 pb-2"
                style={{ color: "#00d9ff", borderBottom: "1px solid #2a2a4a" }}
              >
                {CATEGORY_ICONS[cat] || "📁"} {cat}
              </h2>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}
              >
                {catServices.map((svc) => {
                  const isHovered = hoveredCard === svc.name;
                  return (
                    <a
                      key={svc.name}
                      href={svc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseEnter={() => setHoveredCard(svc.name)}
                      onMouseLeave={() => setHoveredCard(null)}
                      className="block rounded-xl p-5 no-underline text-[#e0e0e0] transition-all duration-200"
                      style={{
                        background: isHovered ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${isHovered ? "#00d9ff" : "rgba(255,255,255,0.1)"}`,
                        transform: isHovered ? "translateY(-2px)" : "none",
                      }}
                    >
                      <div className="text-lg font-semibold mb-1">
                        {svc.icon} {svc.name}
                      </div>
                      <div className="text-sm text-[#aaa]">{svc.desc}</div>
                      {svc.port && <div className="text-xs text-[#555] mt-2">{svc.port}</div>}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Dashboard CTA ── */}
      <div className="text-center mt-6 pb-10">
        <Link
          href="/projets"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200"
          style={{
            background: "linear-gradient(90deg, #00d9ff, #00ff88)",
            color: "#0a0f1a",
          }}
        >
          → Ouvrir le Dashboard Projets
        </Link>
        <p className="text-[#555] text-xs mt-4">
          AxiiomLab — {new Date().toLocaleDateString("fr-FR")}
        </p>
      </div>
    </div>
  );
}
