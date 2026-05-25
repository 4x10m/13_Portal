import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const PG_HOST = process.env.PG_HOST || "host.docker.internal";
const PG_PORT = process.env.PG_PORT || "5432";
const PG_USER = process.env.PG_USER || "postgres";
const PG_PASSWORD = process.env.PG_PASSWORD || "";

const PGPASS = PG_PASSWORD ? `PGPASSWORD='${PG_PASSWORD}'` : "";
const PSQLOPTS = `-h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -t -A`;

export async function GET() {
  try {
    // Get version
    const { stdout: verOut } = await execAsync(
      `psql ${PSQLOPTS} -c "SELECT version();" 2>&1`,
      { timeout: 10000, env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
    );
    const version = verOut.trim().split(",")[0].replace("PostgreSQL ", "");

    // Get database list with sizes
    const { stdout: dbOut } = await execAsync(
      `psql ${PSQLOPTS} -F '|' -c "SELECT datname, pg_size_pretty(pg_database_size(datname)), pg_database_size(datname) FROM pg_database WHERE datistemplate = false ORDER BY pg_database_size(datname) DESC;" 2>&1`,
      { timeout: 10000, env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
    );

    const databases = dbOut.trim().split("\n").filter(Boolean).map((line) => {
      const parts = line.split("|");
      const name = (parts[0] || "").trim();
      const size_pretty = (parts[1] || "").trim();
      const size_bytes = parseInt((parts[2] || "0").trim(), 10) || 0;
      return { name, size_pretty, size_bytes };
    }).filter(d => d.name);

    // Get total size
    const { stdout: totalOut } = await execAsync(
      `psql ${PSQLOPTS} -c "SELECT pg_size_pretty(sum(pg_database_size(datname))) FROM pg_database WHERE datistemplate = false;" 2>&1`,
      { timeout: 10000, env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
    );

    // Get config
    const { stdout: cfgOut } = await execAsync(
      `psql ${PSQLOPTS} -F '|' -c "SHOW shared_buffers;" 2>&1`,
      { timeout: 10000, env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
    );
    const shared_buffers = cfgOut.trim();

    const { stdout: maxConnOut } = await execAsync(
      `psql ${PSQLOPTS} -c "SHOW max_connections;" 2>&1`,
      { timeout: 10000, env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
    );
    const max_connections = maxConnOut.trim();

    // Get active connections
    const { stdout: connOut } = await execAsync(
      `psql ${PSQLOPTS} -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>&1`,
      { timeout: 10000, env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
    );

    // Get roles
    const { stdout: roleOut } = await execAsync(
      `psql ${PSQLOPTS} -F '|' -c "SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY rolname;" 2>&1`,
      { timeout: 10000, env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
    );
    const roles = roleOut.trim().split("\n").filter(Boolean).map(r => r.trim().replace("|", ""));

    // Get DB count
    const { stdout: countOut } = await execAsync(
      `psql ${PSQLOPTS} -c "SELECT count(*) FROM pg_database WHERE datistemplate = false;" 2>&1`,
      { timeout: 10000, env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
    );

    return NextResponse.json({
      version,
      total_databases: parseInt(countOut.trim(), 10) || 0,
      total_size: totalOut.trim(),
      shared_buffers,
      max_connections,
      active_connections: parseInt(connOut.trim(), 10) || 0,
      roles,
      databases,
    });
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string; stderr?: string };
    // Try to parse partial output
    const output = e.stdout || e.stderr || "";
    if (output.includes("datname")) {
      // We got data but psql exited with warning — parse it
      const lines = output.trim().split("\n");
      const databases = lines.filter(l => l.includes("|")).map((line) => {
        const parts = line.split("|");
        return { name: parts[0]?.trim() || "", size_pretty: parts[1]?.trim() || "", size_bytes: parseInt(parts[2]?.trim() || "0", 10) || 0 };
      }).filter(d => d.name && !d.name.includes("(") && !d.name.includes("-"));

      return NextResponse.json({
        version: "17.x (partial)",
        total_databases: databases.length,
        total_size: "?",
        shared_buffers: "?",
        max_connections: "?",
        active_connections: 0,
        roles: [],
        databases,
      });
    }
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
