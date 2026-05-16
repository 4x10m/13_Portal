import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const MG_HOST = process.env.MG_HOST || "host.docker.internal";
const MG_PORT = process.env.MG_PORT || "27017";
const MG_USER = process.env.MONGO_ADMIN_USER || "admin";
const MG_PASS = process.env.MONGO_ADMIN_PASS || "";

const MONGOSH = `mongosh --host ${MG_HOST} --port ${MG_PORT} --username ${MG_USER} --password '${MG_PASS}' --authenticationDatabase admin --quiet`;

export async function GET() {
  try {
    const { stdout: statusOut, stderr: statusErr } = await execAsync(
      `${MONGOSH} --eval 'JSON.stringify(db.serverStatus())' 2>&1`,
      { timeout: 15000 }
    );

    const { stdout: dbOut } = await execAsync(
      `${MONGOSH} --eval 'JSON.stringify(db.adminCommand("listDatabases"))' 2>&1`,
      { timeout: 15000 }
    );

    function extractJSON(text: string): Record<string, unknown> | null {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch { return null; }
      }
      return null;
    }

    const status = extractJSON(statusOut);
    const dbList = extractJSON(dbOut);

    const version = (status?.["version"] as string) || "unknown";
    const uptime = (status?.["uptime"] as number) || 0;
    const uptime_days = Math.floor(uptime / 86400);
    const connections = (status?.["connections"] as Record<string, number>) || {};
    const mem = (status?.["mem"] as Record<string, number>) || {};

    const databases = ((dbList?.["databases"] as Record<string, unknown>[]) || []).map((d) => ({
      name: (d.name as string) || "unknown",
      sizeOnDisk: ((d.sizeOnDisk as number) || 0),
      sizeHuman: ((d.sizeOnDisk as number) || 0) > 0
        ? `${((d.sizeOnDisk as number) / 1024 / 1024).toFixed(1)} MB`
        : "vide",
      empty: (d.empty as boolean) || false,
    }));

    return NextResponse.json({
      version,
      uptime_days,
      connections_current: connections.current || 0,
      connections_available: connections.available || 0,
      memory_resident_mb: mem.resident || 0,
      memory_virtual_mb: mem.virtual || 0,
      total_databases: databases.length,
      databases,
    });
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string; stderr?: string };
    const output = (e.stdout || "") + (e.stderr || "") + (e.message || "");

    // MongoDB bound to 127.0.0.1 only — not accessible from Docker
    if (output.includes("ECONNREFUSED") || output.includes("connect")) {
      return NextResponse.json({
        version: "—",
        uptime_days: 0,
        connections_current: 0,
        connections_available: 0,
        memory_resident_mb: 0,
        memory_virtual_mb: 0,
        total_databases: 0,
        databases: [],
        error: "MongoDB bind 127.0.0.1 uniquement — inaccessible depuis Docker. Bind 0.0.0.0 requis ou utiliser socat.",
      });
    }

    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
