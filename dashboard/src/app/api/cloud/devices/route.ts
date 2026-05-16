import { NextResponse } from "next/server";

const TAILNET = process.env.TAILNET || "dolly-tilapia.ts.net";
const TS_API_KEY = process.env.TAILSCALE_API_KEY || "";

export async function GET() {
  if (!TS_API_KEY) {
    return NextResponse.json({ error: "TAILSCALE_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://api.tailscale.com/api/v2/tailnet/${TAILNET}/devices`,
      { headers: { Authorization: `Bearer ${TS_API_KEY}` } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Tailscale API ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    const devices = (data.devices || []).map((d: Record<string, unknown>) => ({
      hostname: d.hostname,
      addresses: d.addresses || [],
      os: d.os || "",
      online: d.online || false,
      lastSeen: d.lastSeen || "",
      tags: d.tags || [],
      machineKey: d.machineKey ? "●" : "○",
    }));

    return NextResponse.json({ devices });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
