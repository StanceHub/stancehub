import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { meetings } from "@stancehub/db";
import { requireSession } from "@/server/rbac";
import { getDb } from "@/server/db";
import { PingButton } from "./ping-button";
import { SignOutButton } from "./sign-out-button";

export default async function MeetingsPage() {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }

  const orgId = session.session.activeOrganizationId;
  const rows = orgId
    ? await getDb().select().from(meetings).where(eq(meetings.organizationId, orgId)).limit(50)
    : [];

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Meetings</h1>
        <SignOutButton />
      </div>
      <p>
        Signed in as <strong>{session.user.email}</strong>
        {orgId ? (
          <>
            {" "}
            · active org <code>{orgId}</code>
          </>
        ) : (
          <> · no active organization</>
        )}
      </p>
      <p style={{ color: "#666" }}>
        Stub UI — upload and cited Q&amp;A land in Sprint 1–2. Visual design later.
      </p>
      <PingButton />
      <h2 style={{ marginTop: 24 }}>List</h2>
      {rows.length === 0 ? (
        <p>No meetings yet.</p>
      ) : (
        <ul>
          {rows.map((m) => (
            <li key={m.id}>
              {m.title} <small>({m.pipelineStatus})</small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
