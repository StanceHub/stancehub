/**
 * Enterprise RLS integration tests (#49 PR2).
 * Requires Postgres with role bootstrap + migration 0008 applied.
 * Run: RUN_RLS_IT=1 TENANCY_RLS=1 DATABASE_URL=... DATABASE_URL_ADMIN=... pnpm --filter @stancehub/db test
 */
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "./client";
import { organization } from "./schema/auth";
import { meetings } from "./schema/meetings";
import {
  assertAdminDatabaseRole,
  assertAppDatabaseRole,
  withOrganizationScope,
} from "./tenancy-rls";

const run = process.env.RUN_RLS_IT === "1";

describe.skipIf(!run)("enterprise RLS", () => {
  let app: ReturnType<typeof openDatabase>;
  let admin: ReturnType<typeof openDatabase>;
  const orgA = `rls-a-${crypto.randomUUID()}`;
  const orgB = `rls-b-${crypto.randomUUID()}`;
  const meetingA = crypto.randomUUID();
  const meetingB = crypto.randomUUID();

  beforeAll(() => {
    const appUrl = process.env.DATABASE_URL;
    const adminUrl = process.env.DATABASE_URL_ADMIN;
    if (!appUrl || !adminUrl) {
      throw new Error("RUN_RLS_IT=1 requires DATABASE_URL (app) and DATABASE_URL_ADMIN");
    }
    app = openDatabase(appUrl);
    admin = openDatabase(adminUrl);
  });

  afterAll(async () => {
    if (!admin || !app) return;
    await admin.db.delete(meetings).where(inArray(meetings.organizationId, [orgA, orgB]));
    await admin.db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
    await app.close();
    await admin.close();
  });

  it("seeds two orgs via admin bypass", async () => {
    await admin.db.insert(organization).values([
      { id: orgA, name: "RLS A", slug: `rls-a-${orgA.slice(0, 8)}` },
      { id: orgB, name: "RLS B", slug: `rls-b-${orgB.slice(0, 8)}` },
    ]);
    await admin.db.insert(meetings).values([
      {
        id: meetingA,
        organizationId: orgA,
        title: "Org A meeting",
        source: "upload",
        pipelineStatus: "ready",
        embedGeneration: 1,
      },
      {
        id: meetingB,
        organizationId: orgB,
        title: "Org B meeting",
        source: "upload",
        pipelineStatus: "ready",
        embedGeneration: 1,
      },
    ]);
  });

  it("app role without GUC sees zero vault rows", async () => {
    const rows = await app.db.select({ id: meetings.id }).from(meetings).limit(10);
    expect(rows).toEqual([]);
  });

  it("scoped reads return only the active org", async () => {
    const a = await withOrganizationScope(app.db, orgA, (tx) =>
      tx.select({ id: meetings.id, organizationId: meetings.organizationId }).from(meetings),
    );
    expect(a.map((r) => r.id).sort()).toEqual([meetingA]);

    const b = await withOrganizationScope(app.db, orgB, (tx) =>
      tx.select({ id: meetings.id }).from(meetings),
    );
    expect(b.map((r) => r.id)).toEqual([meetingB]);
  });

  it("concurrent scopes do not bleed across pool connections", async () => {
    const [a, b] = await Promise.all([
      withOrganizationScope(app.db, orgA, async (tx) => {
        await new Promise((r) => setTimeout(r, 25));
        return tx.select({ id: meetings.id }).from(meetings);
      }),
      withOrganizationScope(app.db, orgB, async (tx) => {
        await new Promise((r) => setTimeout(r, 25));
        return tx.select({ id: meetings.id }).from(meetings);
      }),
    ]);
    expect(a.map((r) => r.id)).toEqual([meetingA]);
    expect(b.map((r) => r.id)).toEqual([meetingB]);
  });

  it("admin bypass still sees both orgs", async () => {
    const rows = await admin.db
      .select({ id: meetings.id })
      .from(meetings)
      .where(inArray(meetings.organizationId, [orgA, orgB]));
    expect(rows.map((r) => r.id).sort()).toEqual([meetingA, meetingB].sort());
  });

  it("assertAppDatabaseRole refuses bypass roles when TENANCY_RLS=1", async () => {
    const prev = process.env.TENANCY_RLS;
    process.env.TENANCY_RLS = "1";
    try {
      await expect(assertAppDatabaseRole(admin.db as Database)).rejects.toThrow(/non-superuser|NOBYPASSRLS/);
      await expect(assertAppDatabaseRole(app.db)).resolves.toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.TENANCY_RLS;
      else process.env.TENANCY_RLS = prev;
    }
  });

  it("assertAdminDatabaseRole refuses app role when TENANCY_RLS=1", async () => {
    const prev = process.env.TENANCY_RLS;
    process.env.TENANCY_RLS = "1";
    try {
      await expect(assertAdminDatabaseRole(app.db)).rejects.toThrow(/BYPASSRLS|superuser/);
      await expect(assertAdminDatabaseRole(admin.db as Database)).resolves.toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.TENANCY_RLS;
      else process.env.TENANCY_RLS = prev;
    }
  });

  it("WITH CHECK denies cross-org insert and update under scoped GUC", async () => {
    const spoofId = crypto.randomUUID();
    await expect(
      withOrganizationScope(app.db, orgA, (tx) =>
        tx.insert(meetings).values({
          id: spoofId,
          organizationId: orgB,
          title: "spoof",
          source: "upload",
          pipelineStatus: "ready",
          embedGeneration: 1,
        }),
      ),
    ).rejects.toThrow();

    await expect(
      withOrganizationScope(app.db, orgA, (tx) =>
        tx
          .update(meetings)
          .set({ organizationId: orgB, title: "moved" })
          .where(inArray(meetings.id, [meetingA])),
      ),
    ).rejects.toThrow();

    const stillA = await withOrganizationScope(app.db, orgA, (tx) =>
      tx.select({ id: meetings.id, organizationId: meetings.organizationId }).from(meetings),
    );
    expect(stillA).toEqual([{ id: meetingA, organizationId: orgA }]);
  });
});
