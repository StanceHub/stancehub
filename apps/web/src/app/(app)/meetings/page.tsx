import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { meetingPath } from "@stancehub/shared";
import { meetings } from "@stancehub/db";
import { AppNav } from "@/components/app-nav";
import { withOrgScope } from "@/server/db";
import { requireAppAccess } from "@/server/app-access";
import { DeleteMeetingButton } from "./delete-button";
import { PingButton } from "./ping-button";
import { ReembedAllButton } from "./reembed-all-button";
import { RetryButton } from "./retry-button";
import { UploadForm } from "./upload-form";

export default async function MeetingsPage() {
  const access = await requireAppAccess();
  if (!access) redirect("/login");

  const orgId = access.organizationId;
  const rows = orgId
    ? await withOrgScope(orgId, (tx) =>
        tx
          .select()
          .from(meetings)
          .where(eq(meetings.organizationId, orgId))
          .orderBy(desc(meetings.createdAt))
          .limit(50),
      )
    : [];

  return (
    <main>
      <AppNav
        email={access.session.user.email}
        organizationLabel={access.organizationName ?? (orgId ? orgId : null)}
      />
      <h1>Meetings</h1>
      {!orgId ? (
        <p>No active organization. Upload and vault actions require an active org session.</p>
      ) : null}
      {orgId ? <UploadForm /> : null}
      {access.isAdmin ? (
        <section style={{ marginTop: 16 }}>
          <h2>Admin</h2>
          <p style={{ marginBottom: 8 }}>
            <ReembedAllButton />
          </p>
          <h3>Operator</h3>
          <p style={{ color: "#555", maxWidth: 520 }}>
            Queue connectivity check for operators. Not part of the meeting vault product loop.
          </p>
          <PingButton />
        </section>
      ) : null}
      <h2 style={{ marginTop: 24 }}>List</h2>
      {rows.length === 0 ? (
        <p>{orgId ? "No meetings yet. Upload a transcript to start." : "No meetings to show."}</p>
      ) : (
        <ul>
          {rows.map((meeting) => (
            <li key={meeting.id}>
              <Link href={meetingPath(meeting.id)}>{meeting.title}</Link>{" "}
              <small>
                (embed: {meeting.pipelineStatus}
                {meeting.summaryStatus ? ` · summary: ${meeting.summaryStatus}` : ""})
              </small>
              {meeting.pipelineError ? <small> — {meeting.pipelineError}</small> : null}
              {meeting.summaryError ? <small> — summary: {meeting.summaryError}</small> : null}
              {access.isAdmin &&
              (meeting.pipelineStatus === "failed" ||
                meeting.pipelineStatus === "pending" ||
                meeting.pipelineStatus === "embedding") ? (
                <>
                  {" "}
                  <RetryButton meetingId={meeting.id} />
                </>
              ) : null}
              {access.isAdmin ? (
                <>
                  {" "}
                  <DeleteMeetingButton meetingId={meeting.id} />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
