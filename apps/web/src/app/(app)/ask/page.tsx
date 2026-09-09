import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOrgSession } from "@/server/org";
import { AskForm } from "./ask-form";

export default async function AskPage() {
  const access = await requireOrgSession();
  if (!access) redirect("/login");
  if (!access.organizationId) {
    return (
      <main>
        <p>No active organization.</p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href="/meetings">Meetings</Link>
        {" · "}
        <Link href="/search">Search</Link>
        {" · "}
        <Link href="/tasks">Tasks</Link>
      </p>
      <h1>Ask</h1>
      <p>Answers use fused vault retrieval and cite source chunks.</p>
      <AskForm />
    </main>
  );
}
