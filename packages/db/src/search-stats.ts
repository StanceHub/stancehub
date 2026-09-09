import { sql } from "drizzle-orm";
import type { Database } from "./client";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Serialize org-scoped BM25 stats updates across concurrent meeting embeds. */
export function orgSearchStatsLockSql(organizationId: string) {
  return sql`select pg_advisory_xact_lock(hashtext(${`org-search:${organizationId}`}))`;
}

/**
 * Remove a meeting's contribution from org BM25 stats and delete its chunks.
 * Caller must already hold orgSearchStatsLockSql in this transaction.
 */
export async function removeMeetingChunksAndStats(
  tx: Tx,
  input: { organizationId: string; meetingId: string },
) {
  await tx.execute(sql`
    WITH old_terms AS (
      SELECT u.lexeme, count(*)::integer AS delta
      FROM chunks c
      CROSS JOIN LATERAL unnest(c.content_tsv) AS u(lexeme, positions)
      WHERE c.meeting_id = ${input.meetingId}
        AND c.organization_id = ${input.organizationId}
      GROUP BY u.lexeme
    )
    UPDATE org_term_df AS d
    SET n_qi = d.n_qi - old_terms.delta
    FROM old_terms
    WHERE d.organization_id = ${input.organizationId}
      AND d.lexeme = old_terms.lexeme
  `);

  await tx.execute(sql`
    WITH old_docs AS (
      SELECT
        count(*)::bigint AS n_docs,
        coalesce(sum(token_count), 0)::bigint AS sum_token_count
      FROM chunks
      WHERE meeting_id = ${input.meetingId}
        AND organization_id = ${input.organizationId}
    )
    UPDATE org_search_stats AS s
    SET
      n_docs = greatest(s.n_docs - old_docs.n_docs, 0),
      sum_token_count = greatest(s.sum_token_count - old_docs.sum_token_count, 0),
      updated_at = now()
    FROM old_docs
    WHERE s.organization_id = ${input.organizationId}
  `);

  await tx.execute(sql`
    DELETE FROM chunks
    WHERE meeting_id = ${input.meetingId}
      AND organization_id = ${input.organizationId}
  `);

  await tx.execute(sql`
    DELETE FROM org_term_df
    WHERE organization_id = ${input.organizationId}
      AND n_qi <= 0
  `);
}

/**
 * After new chunks are inserted for a meeting, set token_count and add org BM25 stats.
 * Caller must already hold orgSearchStatsLockSql in this transaction.
 */
export async function attachMeetingSearchStats(
  tx: Tx,
  input: { organizationId: string; meetingId: string },
) {
  await tx.execute(sql`
    UPDATE chunks
    SET token_count = (
      SELECT coalesce(sum(cardinality(u.positions)), 0)::integer
      FROM unnest(content_tsv) AS u(lexeme, positions)
    )
    WHERE meeting_id = ${input.meetingId}
      AND organization_id = ${input.organizationId}
  `);

  await tx.execute(sql`
    WITH new_docs AS (
      SELECT
        count(*)::bigint AS n_docs,
        coalesce(sum(token_count), 0)::bigint AS sum_token_count
      FROM chunks
      WHERE meeting_id = ${input.meetingId}
        AND organization_id = ${input.organizationId}
    )
    INSERT INTO org_search_stats (organization_id, n_docs, sum_token_count, updated_at)
    SELECT ${input.organizationId}, new_docs.n_docs, new_docs.sum_token_count, now()
    FROM new_docs
    WHERE new_docs.n_docs > 0
    ON CONFLICT (organization_id) DO UPDATE SET
      n_docs = org_search_stats.n_docs + EXCLUDED.n_docs,
      sum_token_count = org_search_stats.sum_token_count + EXCLUDED.sum_token_count,
      updated_at = now()
  `);

  await tx.execute(sql`
    WITH new_terms AS (
      SELECT u.lexeme, count(*)::integer AS delta
      FROM chunks c
      CROSS JOIN LATERAL unnest(c.content_tsv) AS u(lexeme, positions)
      WHERE c.meeting_id = ${input.meetingId}
        AND c.organization_id = ${input.organizationId}
      GROUP BY u.lexeme
    )
    INSERT INTO org_term_df (organization_id, lexeme, n_qi)
    SELECT ${input.organizationId}, new_terms.lexeme, new_terms.delta
    FROM new_terms
    ON CONFLICT (organization_id, lexeme) DO UPDATE SET
      n_qi = org_term_df.n_qi + EXCLUDED.n_qi
  `);
}
