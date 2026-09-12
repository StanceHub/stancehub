import { describe, expect, it } from "vitest";
import {
  isTenancyRlsEnabled,
  resolveAdminDatabaseUrl,
  resolveAppDatabaseUrl,
} from "./tenancy-rls";

describe("tenancy-rls env helpers", () => {
  it("treats TENANCY_RLS=1 as enabled", () => {
    expect(isTenancyRlsEnabled({ TENANCY_RLS: "1" })).toBe(true);
    expect(isTenancyRlsEnabled({ TENANCY_RLS: "0" })).toBe(false);
    expect(isTenancyRlsEnabled({})).toBe(false);
  });

  it("requires DATABASE_URL_ADMIN when RLS is on", () => {
    expect(() => resolveAdminDatabaseUrl({ TENANCY_RLS: "1", DATABASE_URL: "postgresql://app" })).toThrow(
      /DATABASE_URL_ADMIN/,
    );
    expect(
      resolveAdminDatabaseUrl({
        TENANCY_RLS: "1",
        DATABASE_URL: "postgresql://app",
        DATABASE_URL_ADMIN: "postgresql://admin",
      }),
    ).toBe("postgresql://admin");
  });

  it("uses DATABASE_URL for admin when RLS is off", () => {
    expect(resolveAdminDatabaseUrl({ DATABASE_URL: "postgresql://ce" })).toBe("postgresql://ce");
  });

  it("never falls back app URL to admin", () => {
    expect(
      resolveAppDatabaseUrl({
        TENANCY_RLS: "1",
        DATABASE_URL: "postgresql://app",
        DATABASE_URL_ADMIN: "postgresql://admin",
      }),
    ).toBe("postgresql://app");
  });
});
