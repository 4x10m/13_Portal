import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CM_SCRIPT = process.env.CLOUD_MANAGER_SCRIPT || "/home/debian/Codebase/1_infra/1_cloud_manager/cloud_manager.sh";

export async function GET() {
  try {
    const { stdout, stderr } = await execAsync(`bash ${CM_SCRIPT} test 2>&1`, {
      timeout: 15000,
      env: { ...process.env },
    });

    const output = stdout + stderr;

    const providers: { name: string; status: "ok" | "fail" | "warn"; detail: string }[] = [];

    // Match the summary line: "❌ OCI: FAILED" or "✅ Tailscale: OK"
    const ociMatch = output.match(/OCI:\s*(FAILED|OK|✅|❌)/);
    const gcpMatch = output.match(/GCP:\s*(FAILED|OK|✅|❌)/);
    const tsMatch = output.match(/Tailscale:\s*(FAILED|OK|✅|❌)/);

    providers.push({
      name: "Oracle Cloud (OCI)",
      status: (ociMatch?.[1] === "OK" || ociMatch?.[1] === "✅") ? "ok" : "fail",
      detail: (ociMatch?.[1] === "OK" || ociMatch?.[1] === "✅") ? "Token valide" : "Token introuvable",
    });
    providers.push({
      name: "Google Cloud (GCP)",
      status: (gcpMatch?.[1] === "OK" || gcpMatch?.[1] === "✅") ? "ok" : "fail",
      detail: (gcpMatch?.[1] === "OK" || gcpMatch?.[1] === "✅") ? "SA valide" : "Service account introuvable",
    });
    providers.push({
      name: "Tailscale",
      status: (tsMatch?.[1] === "OK" || tsMatch?.[1] === "✅") ? "ok" : "fail",
      detail: (tsMatch?.[1] === "OK" || tsMatch?.[1] === "✅") ? "API connectée" : "Clé API manquante",
    });

    return NextResponse.json({ providers });
  } catch (err: unknown) {
    // exec throws on non-zero exit — still parse output
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = (e.stdout || "") + (e.stderr || "");

    const providers: { name: string; status: "ok" | "fail" | "warn"; detail: string }[] = [];

    const ociMatch = output.match(/OCI:\s*(FAILED|OK|✅|❌)/);
    const gcpMatch = output.match(/GCP:\s*(FAILED|OK|✅|❌)/);
    const tsMatch = output.match(/Tailscale:\s*(FAILED|OK|✅|❌)/);

    providers.push({
      name: "Oracle Cloud (OCI)",
      status: (ociMatch?.[1] === "OK" || ociMatch?.[1] === "✅") ? "ok" : "fail",
      detail: (ociMatch?.[1] === "OK" || ociMatch?.[1] === "✅") ? "Token valide" : "Token introuvable",
    });
    providers.push({
      name: "Google Cloud (GCP)",
      status: (gcpMatch?.[1] === "OK" || gcpMatch?.[1] === "✅") ? "ok" : "fail",
      detail: (gcpMatch?.[1] === "OK" || gcpMatch?.[1] === "✅") ? "SA valide" : "Service account introuvable",
    });
    providers.push({
      name: "Tailscale",
      status: (tsMatch?.[1] === "OK" || tsMatch?.[1] === "✅") ? "ok" : "fail",
      detail: (tsMatch?.[1] === "OK" || tsMatch?.[1] === "✅") ? "API connectée" : "Clé API manquante",
    });

    return NextResponse.json({ providers });
  }
}
