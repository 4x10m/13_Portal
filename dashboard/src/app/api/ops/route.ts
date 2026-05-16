import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const HOST = process.env.HOST_GATEWAY || "host.docker.internal";
const PROM = `http://${HOST}:9090`;
const ALERTMGR = `http://${HOST}:9093`;

const TS_SERVE_BACKUP =
  process.env.TS_SERVE_BACKUP ||
  "/home/debian/Codebase/1_infra/25_Tailscale-Services/tailscale-serve-restore/serve-config-backup.json";

async function promQuery(query: string): Promise<{ metric: Record<string, string>; value: [number, string] }[]> {
  try {
    const { stdout } = await execAsync(
      `curl -s '${PROM}/api/v1/query?query=${encodeURIComponent(query)}'`,
      { timeout: 8000 }
    );
    const d = JSON.parse(stdout);
    return d.status === "success" ? d.data.result : [];
  } catch {
    return [];
  }
}

async function promFetch(path: string): Promise<unknown> {
  try {
    const { stdout } = await execAsync(`curl -s '${PROM}${path}'`, { timeout: 8000 });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // ── 1. System metrics (Prometheus) ──
  const [memAvail, memTotal, load1, fsAvail, fsSize] = await Promise.all([
    promQuery("node_memory_MemAvailable_bytes"),
    promQuery("node_memory_MemTotal_bytes"),
    promQuery("node_load1"),
    promQuery("node_filesystem_avail_bytes{fstype='ext4',mountpoint='/'}"),
    promQuery("node_filesystem_size_bytes{fstype='ext4',mountpoint='/'}"),
  ]);

  const ramAvailGB = memAvail[0] ? parseFloat(memAvail[0].value[1]) / 1073741824 : 0;
  const ramTotalGB = memTotal[0] ? parseFloat(memTotal[0].value[1]) / 1073741824 : 0;
  const load1Val = load1.find((r) => r.metric.instance?.includes("localhost"))?.value[1] || "0";

  // VPS filesystems from Prometheus
  const vpsFilesystems = fsAvail.map((r, i) => {
    const mp = r.metric.mountpoint || "/";
    const instance = r.metric.instance || "?";
    const avail = parseFloat(r.value[1]) / 1073741824;
    const total = fsSize[i] ? parseFloat(fsSize[i].value[1]) / 1073741824 : avail;
    return { mountpoint: `${instance}:${mp}`, avail_gb: +avail.toFixed(1), total_gb: +total.toFixed(1), used_pct: +((1 - avail / total) * 100).toFixed(1) };
  }).filter((f) => f.total_gb > 1);

  // Local host filesystem from df (Prometheus sees container bind mounts, not real host FS)
  let localFs: { mountpoint: string; avail_gb: number; total_gb: number; used_pct: number }[] = [];
  try {
    const { stdout: dfOut } = await execAsync("df -h 2>/dev/null", { timeout: 5000 });
    const lines = dfOut.trim().split("\n").slice(1).filter(Boolean);
    const seen = new Set<string>();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const [, size, , avail, pct, mp] = parts;
      // Skip tmpfs/shm/proc/sys/virtual FS
      if (mp.startsWith("/dev") || mp.startsWith("/proc") || mp.startsWith("/sys") || mp.startsWith("/run") || mp === "/dev/shm") continue;
      // Deduplicate by filesystem (overlay + /dev/md3 bind mounts show same data)
      const fsKey = `${size}:${avail}`;
      if (seen.has(fsKey)) continue;
      seen.add(fsKey);
      const parseGB = (s: string) => { const n = parseFloat(s); return s.endsWith("T") ? n * 1024 : s.endsWith("M") ? n / 1024 : n; };
      const totalGb = parseGB(size);
      const availGb = parseGB(avail);
      const usedPct = parseInt(pct) || 0;
      if (totalGb > 1) localFs.push({ mountpoint: mp, avail_gb: +availGb.toFixed(1), total_gb: +totalGb.toFixed(1), used_pct: usedPct });
    }
  } catch { /* df unavailable */ }

  const filesystems = [...localFs, ...vpsFilesystems];

    // ── 2. Prometheus targets health ──
    const targetsData = await promFetch("/api/v1/targets") as {
      data?: { activeTargets?: { labels: Record<string, string>; health: string; scrapeUrl: string }[] };
    } | null;
    const targets = (targetsData?.data?.activeTargets || []).map((t) => ({
      job: t.labels.job || "?",
      instance: t.labels.instance || t.scrapeUrl,
      health: t.health,
    }));

    // ── 3. Alertmanager alerts ──
    let alerts: { name: string; severity: string; state: string; summary: string }[] = [];
    try {
      const { stdout: alertOut } = await execAsync(
        `curl -s '${ALERTMGR}/api/v2/alerts'`, { timeout: 5000 }
      );
      const alertData = JSON.parse(alertOut);
  alerts = alertData.map((a: { labels?: Record<string, string>; status?: { state?: string }; annotations?: Record<string, string> }) => ({
      name: a.labels?.alertname || "?",
      severity: a.labels?.severity || "info",
      state: a.status?.state || "?",
      summary: (a.annotations?.summary || a.labels?.alertname || "").slice(0, 100),
    }));
    } catch { /* alertmanager unreachable */ }

    // ── 4. Docker system ──
    let dockerSystem: { images: { size: string; reclaimable: string }; containers: { size: string; running: number; total: number }; volumes: { size: string; reclaimable: string }; buildCache: { size: string } } = { images: { size: "?", reclaimable: "?" }, containers: { size: "?", running: 0, total: 0 }, volumes: { size: "?", reclaimable: "?" }, buildCache: { size: "?" } };
    try {
      const { stdout } = await execAsync(`docker system df --format "{{.Type}}\t{{.Size}}\t{{.Reclaimable}}" 2>&1`, { timeout: 8000 });
      for (const line of stdout.trim().split("\n").filter(Boolean)) {
        const [type, size, rec] = line.split("\t");
      if (type === "Images") dockerSystem.images = { size: size || "?", reclaimable: rec || "?" };
      if (type === "Containers") dockerSystem.containers = { size: size || "?", running: 0, total: 0 };
      if (type === "Local Volumes") dockerSystem.volumes = { size: size || "?", reclaimable: rec || "?" };
      if (type === "Build Cache") dockerSystem.buildCache = { size: size || "?" };
      }
      // Container counts
      const { stdout: psOut } = await execAsync(`docker ps -a --format "{{.Status}}" 2>/dev/null`, { timeout: 5000 });
      const statuses = psOut.trim().split("\n").filter(Boolean);
      dockerSystem.containers.total = statuses.length;
      dockerSystem.containers.running = statuses.filter((s) => s.startsWith("Up")).length;
    } catch { /* docker unavailable */ }

    // ── 5. Container→Network map (cross-reference) ──
    type ContainerInfo = { name: string; image: string; status: string; networks: string[]; ports: string; created: string };
    let containers: ContainerInfo[] = [];
    try {
      const { stdout } = await execAsync(
        `docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Networks}}\t{{.Ports}}\t{{.CreatedAt}}" 2>/dev/null`,
        { timeout: 10000 }
      );
      containers = stdout.trim().split("\n").filter(Boolean).map((line) => {
        const [name, image, status, networks, ports, created] = line.split("\t");
        return { name: name || "?", image: image || "?", status: status || "?", networks: (networks || "").split(",").map((n) => n.trim()).filter(Boolean), ports: ports || "", created: (created || "").slice(0, 10) };
      });
    } catch { /* docker unavailable */ }

    // ── 6. Tailscale services + devices ──
    type TSService = { name: string; domain: string; backend: string };
    let tsServices: TSService[] = [];
    try {
      const { stdout } = await execAsync(`cat "${TS_SERVE_BACKUP}"`, { timeout: 5000 });
      const tsData = JSON.parse(stdout);
      const svcMap = tsData.Services || {};
      tsServices = Object.entries(svcMap).map(([key, val]: [string, unknown]) => {
        const name = key.replace("svc:", "");
        const web = (val as Record<string, unknown>)?.Web as Record<string, unknown> || {};
        const domain = Object.keys(web)[0] || "";
        const handlers = (web[domain] as Record<string, unknown>)?.Handlers as Record<string, unknown> || {};
        const proxy = Object.values(handlers)[0] as Record<string, unknown> || {};
        const backend = (proxy.Proxy as string || "?").replace("http://", "");
        return { name, domain: domain.replace(":443", ""), backend };
      });
    } catch { /* ts serve backup unavailable */ }

    let tsDevices: { name: string; os: string; ip: string; online: boolean; lastSeen: string }[] = [];
    const tsKey = process.env.TAILSCALE_API_KEY;
    const tailnet = process.env.TAILNET;
    if (tsKey && tailnet) {
      try {
        const { stdout } = await execAsync(
          `curl -s 'https://api.tailscale.com/api/v2/tailnet/${tailnet}/devices' -H 'Authorization: Bearer ${tsKey}'`,
          { timeout: 8000 }
        );
        const devData = JSON.parse(stdout);
        tsDevices = (devData.devices || []).map((d: { name?: string; os?: string; addresses?: string[]; online?: boolean; lastSeen?: string }) => ({
          name: d.name || "?",
          os: d.os || "?",
          ip: (d.addresses || [])[0] || "?",
          online: d.online || false,
          lastSeen: (d.lastSeen || "").slice(0, 16),
        }));
      } catch { /* tailscale API unreachable */ }
    }

    // ── 7. Cross-references (the combinatory magic) ──
    // Link containers to Tailscale services by backend port
    const containerPortMap = new Map<string, ContainerInfo>();
    for (const c of containers) {
      const portMatches = c.ports.match(/0\.0\.0\.0:(\d+)->/g) || c.ports.match(/127\.0\.0\.1:(\d+)->/g) || [];
      for (const pm of portMatches) {
        const port = pm.match(/:(\d+)->/)?.[1];
        if (port) containerPortMap.set(port, c);
      }
    }

    // Build service health matrix: Tailscale service → Docker container → Prometheus target → Alert
    type ServiceHealth = {
      tsService: string;
      tsDomain: string;
      backend: string;
      container: string | null;
      containerStatus: string | null;
      containerImage: string | null;
      promJob: string | null;
      promHealth: string | null;
      relatedAlerts: string[];
      networks: string[];
    };
    const serviceMatrix: ServiceHealth[] = tsServices.map((svc) => {
      const port = svc.backend.match(/:(\d+)$/)?.[1];
      const container = port ? containerPortMap.get(port) || null : null;
      const relatedAlerts = alerts.filter((a) =>
        svc.name.toLowerCase().includes(a.name.toLowerCase().replace(/[_-]/g, "").slice(0, 5)) ||
        (container && a.name.toLowerCase().includes(container.name.split("-")[0].toLowerCase()))
      ).map((a) => `${a.name} (${a.severity})`);
      const promTarget = targets.find((t) =>
        svc.backend.includes(t.instance.replace("localhost", "127.0.0.1").split(":")[0])
      );
      return {
        tsService: svc.name,
        tsDomain: svc.domain,
        backend: svc.backend,
        container: container?.name || null,
        containerStatus: container?.status || null,
        containerImage: container?.image || null,
        promJob: promTarget?.job || null,
        promHealth: promTarget?.health || null,
        relatedAlerts,
        networks: container?.networks || [],
      };
    });

    // ── 8. Network topology ──
    const allNetworks = [...new Set(containers.flatMap((c) => c.networks))].sort();
    const networkMap = allNetworks.map((net) => ({
      network: net,
      containers: containers.filter((c) => c.networks.includes(net)).map((c) => c.name),
    }));

    // ── Compose response ──
    return NextResponse.json({
      system: {
        ram_avail_gb: +ramAvailGB.toFixed(1),
        ram_total_gb: +ramTotalGB.toFixed(1),
        ram_used_pct: +((1 - ramAvailGB / ramTotalGB) * 100).toFixed(1),
        load1: +parseFloat(load1Val as string).toFixed(2),
        filesystems,
      },
      targets,
      alerts,
      docker: {
        system: dockerSystem,
        containers,
        networks: networkMap,
      },
      tailscale: {
        services: tsServices,
        devices: tsDevices,
      },
      serviceMatrix,
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
