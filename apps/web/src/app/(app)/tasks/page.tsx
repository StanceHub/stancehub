import { redirect } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { meetingPath } from "@stancehub/shared";
import { meetings, tasks } from "@stancehub/db";
import { AppNav } from "@/components/app-nav";
import { withOrgScope } from "@/server/db";
import { requireAppAccess } from "@/server/app-access";
import { TaskStatusButton } from "./task-status-button";

export default async function TasksPage() {
  const access = await requireAppAccess();
  if (!access) redirect("/login");
  if (!access.organizationId) {
    return (
      <main>
        <AppNav email={access.session.user.email} organizationLabel={null} />
        <h1>Tasks</h1>
        <p>No active organization. Tasks require an active org session.</p>
      </main>
    );
  }

  const organizationId = access.organizationId;
  const rows = await withOrgScope(organizationId, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        assigneeHint: tasks.assigneeHint,
        meetingId: tasks.meetingId,
        meetingTitle: meetings.title,
      })
      .from(tasks)
      .innerJoin(
        meetings,
        and(eq(meetings.id, tasks.meetingId), eq(meetings.organizationId, tasks.organizationId)),
      )
      .where(eq(tasks.organizationId, organizationId))
      .orderBy(asc(tasks.createdAt))
      .limit(200),
  );

  return (
    <main>
      <AppNav
        email={access.session.user.email}
        organizationLabel={access.organizationName ?? organizationId}
      />
      <h1>Tasks</h1>
      {rows.length === 0 ? (
        <p>No tasks yet. They appear after a meeting is summarized.</p>
      ) : (
        <ul>
          {rows.map((task) => (
            <li key={task.id}>
              <strong>{task.title}</strong> <small>({task.status})</small>
              <div>
                <small>
                  <Link href={meetingPath(task.meetingId)}>{task.meetingTitle}</Link>
                  {task.assigneeHint ? ` · ${task.assigneeHint}` : ""}
                </small>
              </div>
              <TaskStatusButton taskId={task.id} status={task.status} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
