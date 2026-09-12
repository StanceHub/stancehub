import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { requireAppAccess } from "@/server/app-access";
import { AskForm } from "./ask-form";

export default async function AskPage() {
  const access = await requireAppAccess();
  if (!access) redirect("/login");
  if (!access.organizationId) {
    return (
      <main>
        <AppNav email={access.session.user.email} organizationLabel={null} />
        <h1>Ask</h1>
        <p>No active organization. Ask requires an active org session.</p>
      </main>
    );
  }

  return (
    <main>
      <AppNav
        email={access.session.user.email}
        organizationLabel={access.organizationName ?? access.organizationId}
      />
      <h1>Ask</h1>
      <p>Answers use fused vault retrieval and cite source chunks.</p>
      <AskForm />
    </main>
  );
}
