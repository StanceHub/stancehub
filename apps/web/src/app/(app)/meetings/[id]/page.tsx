import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { parseTranscript } from "@stancehub/ai";
import { parseMeetingTimeParam } from "@stancehub/shared";
import { AppNav } from "@/components/app-nav";
import { withOrgScope } from "@/server/db";
import { requireAppAccess } from "@/server/app-access";
import { getMeetingDetailForOrg } from "@/server/meeting-detail";
import { DeleteMeetingButton } from "../delete-button";
import { RetryButton } from "../retry-button";
import { TaskStatusButton } from "../../tasks/task-status-button";
import { TranscriptView } from "./transcript-view";

export default async function MeetingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const access = await requireAppAccess();
  if (!access) redirect("/login");
  if (!access.organizationId) {
    return (
      <main>
        <AppNav email={access.session.user.email} organizationLabel={null} />
        <p>No active organization. Org-scoped meetings cannot be opened.</p>
      </main>
    );
  }

  const organizationId = access.organizationId;
  const { id } = await params;
  const { t } = await searchParams;
  const focusMs = parseMeetingTimeParam(t);

  const detail = await withOrgScope(organizationId, (tx) =>
    getMeetingDetailForOrg(tx, {
      organizationId,
      meetingId: id,
    }),
  );
  if (!detail) notFound();

  const { meeting, transcript, summary, tasks } = detail;
  const parsed = transcript
    ? parseTranscript(transcript.rawText, transcript.format)
    : null;

  const showRetry =
    access.isAdmin &&
    (meeting.pipelineStatus === "failed" ||
      meeting.pipelineStatus === "pending" ||
      meeting.pipelineStatus === "embedding");

  return (
    <main>
      <AppNav
        email={access.session.user.email}
        organizationLabel={access.organizationName ?? access.organizationId}
      />
      <p>
        <Link href="/meetings">← Meetings</Link>
      </p>
      <h1>{meeting.title}</h1>
      <p>
        <small>
          embed: {meeting.pipelineStatus}
          {meeting.summaryStatus ? ` · summary: ${meeting.summaryStatus}` : ""}
        </small>
      </p>
      {meeting.pipelineError ? <p>Embed error: {meeting.pipelineError}</p> : null}
      {meeting.summaryError ? <p>Summary error: {meeting.summaryError}</p> : null}
      {access.isAdmin ? (
        <p>
          {showRetry ? (
            <>
              <RetryButton meetingId={meeting.id} />{" "}
            </>
          ) : null}
          <DeleteMeetingButton meetingId={meeting.id} />
        </p>
      ) : null}

      <section style={{ marginTop: 24 }}>
        <h2>Summary</h2>
        {summary?.contentText ? (
          <p style={{ whiteSpace: "pre-wrap" }}>{summary.contentText}</p>
        ) : meeting.summaryStatus === "pending" || meeting.summaryStatus === "running" ? (
          <p>Summary in progress…</p>
        ) : meeting.summaryStatus === "failed" ? (
          <p>Summary failed{meeting.summaryError ? `: ${meeting.summaryError}` : "."}</p>
        ) : (
          <p>No summary yet.</p>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Tasks</h2>
        {tasks.length === 0 ? (
          <p>No tasks for this meeting.</p>
        ) : (
          <ul>
            {tasks.map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong> <small>({task.status})</small>
                {task.assigneeHint ? <small> · {task.assigneeHint}</small> : null}
                <div>
                  <TaskStatusButton taskId={task.id} status={task.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Transcript</h2>
        {transcript ? (
          <TranscriptView
            cues={parsed?.cues ?? []}
            rawText={transcript.rawText}
            focusMs={focusMs}
          />
        ) : (
          <p>No transcript stored for this meeting.</p>
        )}
      </section>
    </main>
  );
}
