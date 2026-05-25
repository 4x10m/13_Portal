// ── Ops types shared between projets/page.tsx and ops-panel.tsx ──

export interface SystemInfo {
  ram_avail_gb: number;
  ram_total_gb: number;
  ram_used_pct: number;
  load1: number;
  filesystems: { mountpoint: string; avail_gb: number; total_gb: number; used_pct: number }[];
}

export interface Target {
  job: string;
  instance: string;
  health: string;
}

export interface Alert {
  name: string;
  severity: string;
  state: string;
  summary: string;
}

export interface DockerSystem {
  images: { size: string; reclaimable: string };
  containers: { size: string; running: number; total: number };
  volumes: { size: string; reclaimable: string };
  buildCache: { size: string };
}

export interface Container {
  name: string;
  image: string;
  status: string;
  networks: string[];
  ports: string;
  created: string;
}

export interface TSService {
  name: string;
  domain: string;
  backend: string;
}

export interface TSDevice {
  name: string;
  os: string;
  ip: string;
  online: boolean;
  lastSeen: string;
}

export interface NetworkEntry {
  network: string;
  containers: string[];
}

export interface ServiceMatrixEntry {
  tsService: string;
  tsDomain: string;
  service: string;
  domain: string;
  backend: string;
  enabled: boolean;
  container: string | null;
  containerStatus: string | null;
  containerImage: string | null;
  promJob: string | null;
  promHealth: string | null;
  relatedAlerts: string[];
  networks: string[];
}

export interface OpsData {
  system: SystemInfo;
  targets: Target[];
  alerts: Alert[];
  docker: {
    system: DockerSystem;
    containers: Container[];
    networks: NetworkEntry[];
  };
  tailscale: {
    services: TSService[];
    devices: TSDevice[];
  };
  serviceMatrix?: ServiceMatrixEntry[];
}

/** Percentage bar — shared helper */
export function pctBar(pct: number, color = "bg-ax-blue") {
  const c = pct > 85 ? "bg-red-500" : pct > 65 ? "bg-amber-500" : color;
  return (
    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${c} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}
