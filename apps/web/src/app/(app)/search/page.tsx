import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOrgSession } from "@/server/org";
import { searchVault } from "@/server/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const access = await requireOrgSession();
  if (!access) redirect("/login");
  if (!access.organizationId) {
    return (
      <main>
        <p>No active organization.</p>
      </main>
    );
  }

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const result = query
    ? await searchVault({ organizationId: access.organizationId, query })
    : { fused: [], keyword: [], vector: [], keywordError: null, vectorError: null };

  return (
    <main>
      <p>
        <Link href="/meetings">Meetings</Link>
        {" · "}
        <Link href="/ask">Ask</Link>
        {" · "}
        <Link href="/tasks">Tasks</Link>
      </p>
      <h1>Search</h1>
      <form>
        <input name="q" defaultValue={query} placeholder="roadmap decision" />
        <button type="submit">Search</button>
      </form>
      {query ? (
        <>
          {result.keywordError ? <p>{result.keywordError}</p> : null}
          {result.vectorError ? <p>{result.vectorError}</p> : null}
          <h2>Results</h2>
          <HitList hits={result.fused} />
          <h2>Keyword</h2>
          <HitList hits={result.keyword} />
          <h2>Vector</h2>
          <HitList hits={result.vector} />
        </>
      ) : null}
    </main>
  );
}

function HitList({
  hits,
}: {
  hits: Array<{
    chunkId: string;
    meetingTitle: string;
    content: string;
    score: number;
  }>;
}) {
  if (hits.length === 0) return <p>No matches.</p>;
  return (
    <ul>
      {hits.map((hit) => (
        <li key={hit.chunkId}>
          <strong>{hit.meetingTitle}</strong> ({hit.score.toFixed(4)})
          <div>{hit.content.slice(0, 280)}</div>
        </li>
      ))}
    </ul>
  );
}
