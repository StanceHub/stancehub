import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { meetings } from "@stancehub/db";
import { withOrgScope } from "@/server/db";
import { requireOrgSession } from "@/server/org";
import { DeleteMeetingButton } from "./delete-button";
import { PingButton } from "./ping-button";
import { ReembedAllButton } from "./reembed-all-button";
import { RetryButton } from "./retry-button";
import { SignOutButton } from "./sign-out-button";
import { UploadForm } from "./upload-form";

export default async function MeetingsPage() {
  const access = await requireOrgSession();
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Meetings</h1>
        <SignOutButton />
      </div>
      <p>
        Signed in as <strong>{access.session.user.email}</strong>
        {orgId ? (
          <>
            {" "}
            · active org <code>{orgId}</code>
          </>
        ) : (
          <> · no active organization</>
        )}
      </p>
      <p>
        <Link href="/search">Search vault</Link>
        {" · "}
        <Link href="/ask">Ask</Link>
        {" · "}
        <Link href="/tasks">Tasks</Link>
      </p>
      <UploadForm />
      <PingButton />
      {access.isAdmin ? (
        <p style={{ marginTop: 12 }}>
          <ReembedAllButton />
        </p>
      ) : null}
      <h2 style={{ marginTop: 24 }}>List</h2>
      {rows.length === 0 ? (
        <p>No meetings yet.</p>
      ) : (
        <ul>
          {rows.map((meeting) => (
            <li key={meeting.id}>
              {meeting.title}{" "}
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
