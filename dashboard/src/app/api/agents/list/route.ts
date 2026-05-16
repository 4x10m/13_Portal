import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const HOST = process.env.HOST_GATEWAY || "host.docker.internal";

export const dynamic = "force-dynamic";

// GET /api/agents/list — list OpenCode sessions as assignable agents
export async function GET() {
  type Agent = { id: string; name: string; type: string; status: string };
  const agents: Agent[] = [];

  // 1. OpenCode sessions from the daemon
  try {
    const { stdout } = await execAsync(
      `curl -s 'http://${HOST}:4097/api/sessions'`,
      { timeout: 8000 }
    );
    const sessions = JSON.parse(stdout) as { id: string; title?: string; project?: string; status?: string }[];
    for (const s of sessions.slice(0, 50)) {
      agents.push({
        id: `opencode:${s.id}`,
        name: s.title || s.project || s.id.slice(0, 8),
        type: "opencode",
        status: s.status || "unknown",
      });
    }
  } catch { /* opencode daemon unreachable */ }

  // 2. Running Docker containers (subset — those that look like agents)
  try {
    const { stdout } = await execAsync(
      `docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}" 2>/dev/null`,
      { timeout: 5000 }
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    const agentKeywords = /agent|bot|worker|daemon|runner|opencode|llm|gpt|claude/i;
    for (const line of lines) {
      const [name, image, status] = line.split("\t");
      if (agentKeywords.test(name || "") || agentKeywords.test(image || "")) {
        agents.push({
          id: `container:${name}`,
          name: name || "?",
          type: "container",
          status: status || "?",
        });
      }
    }
  } catch { /* docker unavailable */ }

  // 3. MCP servers
  try {
    const { stdout } = await execAsync(
      `docker ps --filter "name=mcp" --format "{{.Names}}\\t{{.Status}}" 2>/dev/null`,
      { timeout: 5000 }
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const [name, status] = line.split("\t");
      if (name && !agents.some((a) => a.id === `container:${name}`)) {
        agents.push({
          id: `mcp:${name}`,
          name: name,
          type: "mcp",
          status: status || "?",
        });
      }
    }
  } catch { /* docker unavailable */ }

  return NextResponse.json(agents);
}
