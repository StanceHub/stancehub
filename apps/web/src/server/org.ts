import { and, eq } from "drizzle-orm";
import { member } from "@stancehub/db";
import { getDb } from "@/server/db";
import { requireSession } from "@/server/rbac";

export async function requireOrgSession() {
  const session = await requireSession();
  if (!session) return null;
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) return { session, organizationId: null, isAdmin: false };

  const [membership] = await getDb()
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, organizationId)))
    .limit(1);

  if (!membership) return { session, organizationId: null, isAdmin: false };

  const role = membership.role;
  return {
    session,
    organizationId,
    isAdmin: role === "admin" || role === "owner",
  };
}
