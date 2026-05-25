import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";

// Groudon pricing cache — multiple possible locations
const PRICING_CACHE_PATHS = [
  "/app/data/groudon/pricing-cache.json",
  "/home/debian/Codebase/3_perso/3_Groudon/pricing-data/cache.json",
  "/home/debian/.opencode/groudon-pricing-cache.json",
];

export async function GET() {
  try {
    for (const p of PRICING_CACHE_PATHS) {
      if (existsSync(p)) {
        const raw = readFileSync(p, "utf-8");
        const data = JSON.parse(raw);
        return NextResponse.json(data);
      }
    }

    // Try exec as last resort (host docker socket may allow access)
    return NextResponse.json({
      version: "3.5",
      generatedAt: null,
      providers: {},
      hardwareComparison: {},
      _meta: { status: "no-data", message: "Groudon pricing cache non trouvé — montez groudon-pricing-cache.json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Erreur chargement cloud pricing", details: String(err) },
      { status: 500 }
    );
  }
}
