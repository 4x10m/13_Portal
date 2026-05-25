import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CODEBASE = process.env.CODEBASE_DIR || "/home/debian/Codebase";

export async function GET() {
  try {
    const results: {
      extensions: { name: string; version: string; description: string; permissions: number; path: string; type: string }[];
      docker_images: { name: string; tag: string; size: string; created: string; local: boolean }[];
      mcp_servers: { name: string; port: string; image: string; status: string; created: string }[];
      cli_tools: { name: string; version: string; path: string; language: string }[];
      dockerfiles: { project: string; path: string }[];
      build_systems: { project: string; system: string; path: string }[];
    } = {
      extensions: [],
      docker_images: [],
      mcp_servers: [],
      cli_tools: [],
      dockerfiles: [],
      build_systems: [],
    };

    // 1. Chrome/Firefox extensions (manifest.json)
    try {
      const { stdout: manifestOut } = await execAsync(
        `find ${CODEBASE} -maxdepth 5 -name "manifest.json" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null`,
        { timeout: 10000 }
      );
      for (const f of manifestOut.trim().split("\n").filter(Boolean)) {
        try {
          const { stdout } = await execAsync(`cat "${f}"`, { timeout: 3000 });
          const d = JSON.parse(stdout);
          results.extensions.push({
            name: d.name || "?",
            version: d.version || "?",
            description: (d.description || "").slice(0, 80),
            permissions: (d.permissions || []).length,
            path: f.replace(CODEBASE, "~"),
            type: d.manifest_version === 3 ? "MV3" : "MV2",
          });
        } catch { /* skip */ }
      }
    } catch { /* no manifests */ }

    // 2. Docker images (local builds)
    try {
      const { stdout } = await execAsync(
        `docker images --format "{{.Repository}}:{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}" 2>/dev/null`,
        { timeout: 10000 }
      );
      for (const line of stdout.trim().split("\n").filter(Boolean)) {
        const [nameTag, size, created] = line.split("\t");
        if (nameTag && !nameTag.startsWith("<none>")) {
          const [name, tag] = nameTag.split(":");
          results.docker_images.push({
            name: name || "",
            tag: tag || "latest",
            size: size || "?",
            created: created || "?",
            local: !name.includes("/") || name.startsWith("localhost"),
          });
        }
      }
    } catch { /* docker unavailable */ }

    // 3. MCP Servers (running containers)
    try {
      const { stdout } = await execAsync(
        `docker ps --filter "name=mcp" --format "{{.Names}}\\t{{.Ports}}\\t{{.Image}}\\t{{.Status}}" 2>/dev/null`,
        { timeout: 10000 }
      );
      for (const line of stdout.trim().split("\n").filter(Boolean)) {
        const parts = line.split("\t");
        const name = parts[0] || "";
        const ports = parts[1] || "";
        const image = parts[2] || "";
        const status = parts[3] || "";
        const portMatch = ports.match(/127\.0\.0\.1:(\d+)/);
        results.mcp_servers.push({
          name,
          port: portMatch?.[1] || "",
          image,
          status: status.split(" ")[0],
          created: "",
        });
      }
      // Also get created dates
      for (const s of results.mcp_servers) {
        try {
          const { stdout } = await execAsync(
            `docker inspect ${s.name} --format '{{.Created}}' 2>/dev/null`,
            { timeout: 3000 }
          );
          s.created = stdout.trim().slice(0, 10);
        } catch { /* skip */ }
      }
    } catch { /* no mcp containers */ }

    // 4. CLI tools (package.json with bin field)
    try {
      const { stdout: pkgOut } = await execAsync(
        `find ${CODEBASE} -maxdepth 4 -name "package.json" -not -path "*/node_modules/*" -not -path "*/_3rd-party/opencode/*" 2>/dev/null`,
        { timeout: 10000 }
      );
      for (const f of pkgOut.trim().split("\n").filter(Boolean)) {
        try {
          const { stdout } = await execAsync(`cat "${f}"`, { timeout: 3000 });
          const d = JSON.parse(stdout);
          if (d.bin) {
            results.cli_tools.push({
              name: d.name || "?",
              version: d.version || "?",
              path: f.replace(CODEBASE, "~"),
              language: "node",
            });
          }
        } catch { /* skip */ }
      }
    } catch { /* no cli tools */ }

    // Also check Python CLI tools (pyproject.toml with [project.scripts])
    try {
      const { stdout: pyOut } = await execAsync(
        `find ${CODEBASE} -maxdepth 3 -name "pyproject.toml" -not -path "*/_3rd-party/*" 2>/dev/null`,
        { timeout: 10000 }
      );
      for (const f of pyOut.trim().split("\n").filter(Boolean)) {
        try {
          const { stdout } = await execAsync(`cat "${f}"`, { timeout: 3000 });
          if (stdout.includes("[project.scripts]") || stdout.includes("console_scripts")) {
            const nameMatch = stdout.match(/name\s*=\s*"([^"]+)"/);
            const verMatch = stdout.match(/version\s*=\s*"([^"]+)"/);
            results.cli_tools.push({
              name: nameMatch?.[1] || "?",
              version: verMatch?.[1] || "?",
              path: f.replace(CODEBASE, "~"),
              language: "python",
            });
          }
        } catch { /* skip */ }
      }
    } catch { /* no python projects */ }

    // 5. Dockerfiles (buildable projects)
    try {
      const { stdout } = await execAsync(
        `find ${CODEBASE} -maxdepth 4 -name "Dockerfile" -not -path "*/_3rd-party/*" -not -path "*/node_modules/*" 2>/dev/null`,
        { timeout: 10000 }
      );
      for (const f of stdout.trim().split("\n").filter(Boolean)) {
        const parts = f.split("/");
        const project = parts.slice(4, 6).join("/");
        results.dockerfiles.push({ project, path: f.replace(CODEBASE, "~") });
      }
    } catch { /* no dockerfiles */ }

    // 6. Build systems
    const buildSystems: Record<string, string> = {
      "Cargo.toml": "rust",
      "go.mod": "go",
      "build.gradle": "gradle",
      "Makefile": "make",
    };
    for (const [file, system] of Object.entries(buildSystems)) {
      try {
        const { stdout } = await execAsync(
          `find ${CODEBASE} -maxdepth 3 -name "${file}" -not -path "*/_3rd-party/*" 2>/dev/null`,
          { timeout: 5000 }
        );
        for (const f of stdout.trim().split("\n").filter(Boolean)) {
          const parts = f.split("/");
          const project = parts.slice(4, 6).join("/");
          results.build_systems.push({ project, system, path: f.replace(CODEBASE, "~") });
        }
      } catch { /* no results */ }
    }

    return NextResponse.json(results);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
