import { redirect } from "next/navigation";
import { requireSession } from "@/server/rbac";

export default async function HomePage() {
  const session = await requireSession();
  if (session) {
    redirect("/meetings");
  }
  redirect("/login");
}
