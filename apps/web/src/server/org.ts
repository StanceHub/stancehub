import { and, eq } from "drizzle-orm";
import { member } from "@stancehub/db";
import { isAdmin } from "@stancehub/shared";
import { getDb } from "@/server/db";
import { requireSession } from "@/server/rbac";

export type OrgSession =
  | {
      session: NonNullable<Awaited<ReturnType<typeof requireSession>>>;
      organizationId: string;
      isAdmin: boolean;
    }
  | {
      session: NonNullable<Awaited<ReturnType<typeof requireSession>>>;
      organizationId: null;
      isAdmin: false;
    };

export async function requireOrgSession(): Promise<OrgSession | null> {
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

  return {
    session,
    organizationId,
    isAdmin: isAdmin(membership.role),
  };
}

/** Fail-closed: session + active org membership required. */
export type ActiveOrgAccess = {
  session: NonNullable<Awaited<ReturnType<typeof requireSession>>>;
  organizationId: string;
  isAdmin: boolean;
};

export type ActiveOrgResult =
  | { ok: true; access: ActiveOrgAccess }
  | { ok: false; status: 401 | 400; error: string };

export async function requireActiveOrg(): Promise<ActiveOrgResult> {
  const access = await requireOrgSession();
  if (!access) return { ok: false, status: 401, error: "unauthorized" };
  if (!access.organizationId) {
    return { ok: false, status: 400, error: "no active organization" };
  }
  return {
    ok: true,
    access: {
      session: access.session,
      organizationId: access.organizationId,
      isAdmin: access.isAdmin,
    },
  };
}

export type AdminOrgResult =
  | { ok: true; access: ActiveOrgAccess }
  | { ok: false; status: 401 | 400 | 403; error: string };

export async function requireAdminOrg(): Promise<AdminOrgResult> {
  const result = await requireActiveOrg();
  if (!result.ok) return result;
  if (!result.access.isAdmin) return { ok: false, status: 403, error: "admin required" };
  return result;
}
