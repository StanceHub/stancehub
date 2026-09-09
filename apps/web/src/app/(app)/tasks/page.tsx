import { redirect } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { meetings, tasks } from "@stancehub/db";
import { getDb } from "@/server/db";
import { requireOrgSession } from "@/server/org";
import { TaskStatusButton } from "./task-status-button";

export default async function TasksPage() {
  const access = await requireOrgSession();
  if (!access) redirect("/login");
  if (!access.organizationId) {
    return (
      <main>
        <p>No active organization.</p>
      </main>
    );
  }

  const rows = await getDb()
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      assigneeHint: tasks.assigneeHint,
      meetingTitle: meetings.title,
    })
    .from(tasks)
    .innerJoin(
      meetings,
      and(eq(meetings.id, tasks.meetingId), eq(meetings.organizationId, tasks.organizationId)),
    )
    .where(eq(tasks.organizationId, access.organizationId))
    .orderBy(asc(tasks.createdAt))
    .limit(200);

  return (
    <main>
      <p>
        <Link href="/meetings">Meetings</Link>
        {" · "}
        <Link href="/search">Search</Link>
        {" · "}
        <Link href="/ask">Ask</Link>
      </p>
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
                  {task.meetingTitle}
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
