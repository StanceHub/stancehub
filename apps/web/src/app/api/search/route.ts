import { NextResponse } from "next/server";
import { requireActiveOrg } from "@/server/org";
import { searchVault } from "@/server/search";
import { filterHitsForOrganization } from "@/server/tenancy-search";

export async function GET(request: Request) {
  const gate = await requireActiveOrg();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const modeParam = url.searchParams.get("mode");
  const mode = modeParam === "keyword" || modeParam === "vector" ? modeParam : "both";
  if (!query) return NextResponse.json({ error: "q is required" }, { status: 400 });

  const organizationId = gate.access.organizationId;
  const result = await searchVault({
    organizationId,
    query,
    mode,
  });

  if (mode === "vector" && result.vectorError) {
    return NextResponse.json({ error: result.vectorError }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    query,
    ...result,
    fused: filterHitsForOrganization(result.fused, organizationId),
    keyword: filterHitsForOrganization(result.keyword, organizationId),
    vector: filterHitsForOrganization(result.vector, organizationId),
  });
}
