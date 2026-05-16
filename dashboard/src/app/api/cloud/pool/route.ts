import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CM_SCRIPT = process.env.CLOUD_MANAGER_SCRIPT || "/home/debian/Codebase/1_infra/1_cloud_manager/cloud_manager.sh";

export async function GET() {
  try {
    const { stdout, stderr } = await execAsync(`bash ${CM_SCRIPT} pool status 2>&1`, {
      timeout: 15000,
      env: { ...process.env },
    });

    const output = stdout + stderr;

    const capMatch = output.match(/Capacity:\s*(\{[\s\S]*?\})\s*Stats:/);
    const statsMatch = output.match(/Stats:\s*(\{[\s\S]*\})/);

    const capacity = capMatch ? JSON.parse(capMatch[1]) : null;
    const stats = statsMatch ? JSON.parse(statsMatch[1]) : null;

    return NextResponse.json({ capacity, stats });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = (e.stdout || "") + (e.stderr || "");

    const capMatch = output.match(/Capacity:\s*(\{[\s\S]*?\})\s*Stats:/);
    const statsMatch = output.match(/Stats:\s*(\{[\s\S]*\})/);

    try {
      const capacity = capMatch ? JSON.parse(capMatch[1]) : null;
      const stats = statsMatch ? JSON.parse(statsMatch[1]) : null;
      return NextResponse.json({ capacity, stats });
    } catch {
      return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
    }
  }
}
