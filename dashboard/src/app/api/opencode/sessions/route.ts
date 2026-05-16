import { NextResponse } from "next/server";

const OPENCODE_API = process.env.OPENCODE_API_URL || "http://opencode-dashboard:8121";

export async function GET() {
  try {
    const res = await fetch(`${OPENCODE_API}/api/sessions`, { next: { revalidate: 15 } });
    if (!res.ok) return NextResponse.json({ error: "OpenCode API unavailable" }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "OpenCode API unreachable" }, { status: 503 });
  }
}
