import { and, eq } from "drizzle-orm";
import { meetings, tasks, type Database } from "@stancehub/db";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

/** Org-scoped meeting load. Null means not found **or** other org (uniform 404). */
export async function getMeetingForOrg(
  db: DbOrTx,
  input: { organizationId: string; meetingId: string; forUpdate?: boolean },
) {
  const query = db
    .select({
      id: meetings.id,
      organizationId: meetings.organizationId,
      title: meetings.title,
      pipelineStatus: meetings.pipelineStatus,
      embedGeneration: meetings.embedGeneration,
      summaryStatus: meetings.summaryStatus,
      summaryGeneration: meetings.summaryGeneration,
    })
    .from(meetings)
    .where(and(eq(meetings.id, input.meetingId), eq(meetings.organizationId, input.organizationId)))
    .limit(1);
  const [row] = input.forUpdate ? await query.for("update") : await query;
  return row ?? null;
}

/** Org-scoped task load. Null → uniform 404. */
export async function getTaskForOrg(
  db: DbOrTx,
  input: { organizationId: string; taskId: string },
) {
  const [row] = await db
    .select({
      id: tasks.id,
      organizationId: tasks.organizationId,
      status: tasks.status,
      title: tasks.title,
    })
    .from(tasks)
    .where(and(eq(tasks.id, input.taskId), eq(tasks.organizationId, input.organizationId)))
    .limit(1);
  return row ?? null;
}

export const NOT_FOUND_BODY = { error: "not found" } as const;

/** Pure helper for tests: wrong-org vs same-org meeting visibility. */
export function meetingVisibleInOrg(
  meeting: { organizationId: string } | null | undefined,
  organizationId: string,
): boolean {
  return Boolean(meeting && meeting.organizationId === organizationId);
}
