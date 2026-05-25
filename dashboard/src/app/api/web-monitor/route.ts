import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";

// Groudon site-tests.json — Codebase is mounted read-only in container
const SITE_TESTS_PATHS = [
  "/home/debian/Codebase/3_perso/3_Groudon/data/site-tests.json",
  "/app/data/groudon/site-tests.json",
];

export async function GET() {
  try {
    for (const p of SITE_TESTS_PATHS) {
      if (existsSync(p)) {
        const raw = readFileSync(p, "utf-8");
        const data = JSON.parse(raw);
        return NextResponse.json(data);
      }
    }

    return NextResponse.json({
      version: 1,
      tests: {},
      _meta: { status: "no-data", message: "Groudon site-tests.json non trouvé" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Erreur chargement web monitor", details: String(err) },
      { status: 500 }
    );
  }
}
