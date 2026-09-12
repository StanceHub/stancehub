import type { SearchHit } from "@stancehub/db";

/** Defense in depth: never pass another org's chunks into ask/citations. */
export function filterHitsForOrganization(hits: SearchHit[], organizationId: string): SearchHit[] {
  return hits.filter((hit) => hit.organizationId === organizationId);
}
