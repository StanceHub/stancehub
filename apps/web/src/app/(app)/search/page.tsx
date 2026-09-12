import { redirect } from "next/navigation";
import Link from "next/link";
import { meetingPath } from "@stancehub/shared";
import { AppNav } from "@/components/app-nav";
import { requireAppAccess } from "@/server/app-access";
import { searchVault } from "@/server/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const access = await requireAppAccess();
  if (!access) redirect("/login");
  if (!access.organizationId) {
    return (
      <main>
        <AppNav email={access.session.user.email} organizationLabel={null} />
        <h1>Search</h1>
        <p>No active organization. Vault search requires an active org session.</p>
      </main>
    );
  }

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const result = query
    ? await searchVault({ organizationId: access.organizationId, query })
    : { fused: [], keywordError: null as string | null, vectorError: null as string | null };

  return (
    <main>
      <AppNav
        email={access.session.user.email}
        organizationLabel={access.organizationName ?? access.organizationId}
      />
      <h1>Search</h1>
      <form>
        <input name="q" defaultValue={query} placeholder="roadmap decision" aria-label="Search query" />
        <button type="submit">Search</button>
      </form>
      {query ? (
        <>
          {result.keywordError ? <p>Keyword retrieval: {result.keywordError}</p> : null}
          {result.vectorError ? <p>Vector retrieval: {result.vectorError}</p> : null}
          <h2>Results</h2>
          <HitList hits={result.fused} />
        </>
      ) : (
        <p>Enter a query to search the org vault.</p>
      )}
    </main>
  );
}

function HitList({
  hits,
}: {
  hits: Array<{
    chunkId: string;
    meetingId: string;
    meetingTitle: string;
    content: string;
    score: number;
    startMs: number | null;
  }>;
}) {
  if (hits.length === 0) return <p>No matches.</p>;
  return (
    <ul>
      {hits.map((hit) => (
        <li key={hit.chunkId}>
          <Link href={meetingPath(hit.meetingId, { tMs: hit.startMs })}>
            <strong>{hit.meetingTitle}</strong>
          </Link>{" "}
          <small>({hit.score.toFixed(4)})</small>
          <div>{hit.content.slice(0, 280)}</div>
        </li>
      ))}
    </ul>
  );
}
