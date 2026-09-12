import { and, asc, desc, eq } from "drizzle-orm";
import {
  meetingArtifacts,
  meetings,
  tasks,
  transcripts,
  type DbOrTx,
} from "@stancehub/db";

export type MeetingDetailRow = {
  id: string;
  organizationId: string;
  title: string;
  pipelineStatus: string;
  pipelineError: string | null;
  embedGeneration: number;
  summaryStatus: string;
  summaryGeneration: number;
  summaryError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MeetingDetailPayload = {
  meeting: MeetingDetailRow;
  transcript: {
    id: string;
    format: string;
    rawText: string;
    version: number;
  } | null;
  summary: {
    contentText: string | null;
    model: string | null;
    summaryGeneration: number;
    updatedAt: Date;
  } | null;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    assigneeHint: string | null;
  }>;
};

/**
 * Org-scoped meeting detail. Null = not found or other org (uniform 404).
 * Loads meeting + latest transcript + summary artifact + tasks in one org scope.
 */
export async function getMeetingDetailForOrg(
  db: DbOrTx,
  input: { organizationId: string; meetingId: string },
): Promise<MeetingDetailPayload | null> {
  const [meeting] = await db
    .select({
      id: meetings.id,
      organizationId: meetings.organizationId,
      title: meetings.title,
      pipelineStatus: meetings.pipelineStatus,
      pipelineError: meetings.pipelineError,
      embedGeneration: meetings.embedGeneration,
      summaryStatus: meetings.summaryStatus,
      summaryGeneration: meetings.summaryGeneration,
      summaryError: meetings.summaryError,
      createdAt: meetings.createdAt,
      updatedAt: meetings.updatedAt,
    })
    .from(meetings)
    .where(and(eq(meetings.id, input.meetingId), eq(meetings.organizationId, input.organizationId)))
    .limit(1);

  if (!meeting) return null;

  const [transcript] = await db
    .select({
      id: transcripts.id,
      format: transcripts.format,
      rawText: transcripts.rawText,
      version: transcripts.version,
    })
    .from(transcripts)
    .where(
      and(
        eq(transcripts.meetingId, input.meetingId),
        eq(transcripts.organizationId, input.organizationId),
      ),
    )
    .orderBy(desc(transcripts.createdAt))
    .limit(1);

  const [summary] = await db
    .select({
      contentText: meetingArtifacts.contentText,
      model: meetingArtifacts.model,
      summaryGeneration: meetingArtifacts.summaryGeneration,
      updatedAt: meetingArtifacts.updatedAt,
    })
    .from(meetingArtifacts)
    .where(
      and(
        eq(meetingArtifacts.meetingId, input.meetingId),
        eq(meetingArtifacts.organizationId, input.organizationId),
        eq(meetingArtifacts.kind, "summary"),
      ),
    )
    .limit(1);

  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      assigneeHint: tasks.assigneeHint,
    })
    .from(tasks)
    .where(and(eq(tasks.meetingId, input.meetingId), eq(tasks.organizationId, input.organizationId)))
    .orderBy(asc(tasks.createdAt));

  return {
    meeting,
    transcript: transcript ?? null,
    summary: summary ?? null,
    tasks: taskRows,
  };
}
