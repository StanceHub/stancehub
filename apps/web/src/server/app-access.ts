import { eq } from "drizzle-orm";
import { organization } from "@stancehub/db";
import { getDb } from "@/server/db";
import { requireOrgSession, type OrgSession } from "@/server/org";

export type AppAccess = {
  session: NonNullable<OrgSession>["session"];
  organizationId: string | null;
  organizationName: string | null;
  isAdmin: boolean;
};

/** Session gate + optional active org display name (auth tables; not vault-scoped). */
export async function requireAppAccess(): Promise<AppAccess | null> {
  const access = await requireOrgSession();
  if (!access) return null;

  let organizationName: string | null = null;
  if (access.organizationId) {
    const [row] = await getDb()
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, access.organizationId))
      .limit(1);
    organizationName = row?.name ?? null;
  }

  return {
    session: access.session,
    organizationId: access.organizationId,
    organizationName,
    isAdmin: access.isAdmin,
  };
}
