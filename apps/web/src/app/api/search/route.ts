import { NextResponse } from "next/server";
import { requireOrgSession } from "@/server/org";
import { searchVault } from "@/server/search";

export async function GET(request: Request) {
  const access = await requireOrgSession();
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!access.organizationId) {
    return NextResponse.json({ error: "no active organization" }, { status: 400 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const modeParam = url.searchParams.get("mode");
  const mode = modeParam === "keyword" || modeParam === "vector" ? modeParam : "both";
  if (!query) return NextResponse.json({ error: "q is required" }, { status: 400 });

  const result = await searchVault({
    organizationId: access.organizationId,
    query,
    mode,
  });

  if (mode === "vector" && result.vectorError) {
    return NextResponse.json({ error: result.vectorError }, { status: 500 });
  }

  return NextResponse.json({ ok: true, query, ...result });
}
