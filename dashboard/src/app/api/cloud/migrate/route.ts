import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CM_DIR = process.env.CLOUD_MANAGER_DIR || "/cloud-manager";

export async function GET() {
  try {
    const { stdout, stderr } = await execAsync(
      `cd ${CM_DIR} && python3 -m migration.allocator 2>&1`,
      { timeout: 15000, env: { ...process.env, PYTHONPATH: CM_DIR } }
    );

    const output = stdout + stderr;

    const jsonStart = output.indexOf("{");
    if (jsonStart === -1) {
      return NextResponse.json({ error: "No JSON in output" }, { status: 500 });
    }

    const data = JSON.parse(output.slice(jsonStart));
    return NextResponse.json(data);
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = (e.stdout || "") + (e.stderr || "");

    const jsonStart = output.indexOf("{");
    if (jsonStart >= 0) {
      try {
        const data = JSON.parse(output.slice(jsonStart));
        return NextResponse.json(data);
      } catch { /* fall through */ }
    }
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
