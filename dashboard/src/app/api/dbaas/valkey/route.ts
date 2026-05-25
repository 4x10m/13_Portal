import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const VK_HOST = process.env.VK_HOST || "host.docker.internal";
const VK_PORT = process.env.VK_PORT || "6379";

const CLI = `redis-cli -h ${VK_HOST} -p ${VK_PORT}`;

export async function GET() {
  try {
    const { stdout: serverOut } = await execAsync(`${CLI} INFO server 2>&1`, { timeout: 10000 });
    const { stdout: memOut } = await execAsync(`${CLI} INFO memory 2>&1`, { timeout: 10000 });
    const { stdout: statOut } = await execAsync(`${CLI} INFO stats 2>&1`, { timeout: 10000 });
    const { stdout: ksOut } = await execAsync(`${CLI} INFO keyspace 2>&1`, { timeout: 10000 });
    const { stdout: cfgOut } = await execAsync(`${CLI} CONFIG GET maxmemory 2>&1`, { timeout: 10000 });
    const { stdout: cfgPolicyOut } = await execAsync(`${CLI} CONFIG GET maxmemory-policy 2>&1`, { timeout: 10000 });

    function extract(pattern: RegExp, text: string): string {
      const m = text.match(pattern);
      return m?.[1] || "";
    }

    const server = serverOut + "\n" + memOut + "\n" + statOut;

    const version = extract(/valkey_version:(\S+)/, server);
    const redis_compat = extract(/redis_version:(\S+)/, server);
    const uptime_days = extract(/uptime_in_days:(\d+)/, server);
    const connected_clients = extract(/connected_clients:(\d+)/, server);
    const used_memory_human = extract(/used_memory_human:(\S+)/, memOut);
    const used_memory_rss_human = extract(/used_memory_rss_human:(\S+)/, memOut);
    const used_memory_peak_human = extract(/used_memory_peak_human:(\S+)/, memOut);
    const total_connections = extract(/total_connections_received:(\d+)/, server);
    const total_commands = extract(/total_commands_processed:(\d+)/, server);
    const keyspace_hits = extract(/keyspace_hits:(\d+)/, server);
    const keyspace_misses = extract(/keyspace_misses:(\d+)/, server);

    // Parse keyspace
    const dbs: { id: number; keys: number; expires: number }[] = [];
    const ksMatch = ksOut.match(/db(\d+):keys=(\d+),expires=(\d+)/g);
    if (ksMatch) {
      for (const m of ksMatch) {
        const parts = m.match(/db(\d+):keys=(\d+),expires=(\d+)/);
        if (parts) {
          dbs.push({ id: parseInt(parts[1]), keys: parseInt(parts[2]), expires: parseInt(parts[3]) });
        }
      }
    }
    for (let i = 0; i <= 3; i++) {
      if (!dbs.find(d => d.id === i)) {
        dbs.push({ id: i, keys: 0, expires: 0 });
      }
    }
    dbs.sort((a, b) => a.id - b.id);

    // Parse maxmemory config
    const maxmemory = cfgOut.trim().split("\n").filter(Boolean).pop()?.trim() || "0";
    const maxmemory_policy = cfgPolicyOut.trim().split("\n").filter(Boolean).pop()?.trim() || "unknown";

    const db_labels: Record<number, string> = { 0: "default", 1: "agent-creator", 2: "immich", 3: "paperless" };

    return NextResponse.json({
      version,
      redis_compat,
      uptime_days,
      connected_clients,
      used_memory_human,
      used_memory_rss_human,
      used_memory_peak_human,
      total_connections,
      total_commands,
      keyspace_hits,
      keyspace_misses,
      maxmemory: parseInt(maxmemory, 10) || 0,
      maxmemory_human: maxmemory !== "0" ? `${Math.round(parseInt(maxmemory, 10) / 1024 / 1024)} MB` : "unlimited",
      maxmemory_policy,
      dbs: dbs.map(d => ({ ...d, label: db_labels[d.id] || `DB${d.id}` })),
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
