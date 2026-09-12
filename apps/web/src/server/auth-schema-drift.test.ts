/**
 * CI / unit gate for #47: Better Auth expected schema vs Drizzle auth tables.
 * Uses Better Auth's own drizzle adapter check (same path as runtime).
 */
import { describe, expect, it } from "vitest";
import { createAuth } from "./auth";

describe("Better Auth ↔ Drizzle schema drift (#47)", () => {
  it("passes checkSchema against packages/db auth tables", async () => {
    // Stub DB is enough: BA drizzle adapter compares ORM table defs, not a live connection.
    const stubDb = { _: { fullSchema: {} } } as unknown as Parameters<typeof createAuth>[0] extends {
      database?: infer D;
    }
      ? D
      : never;

    const auth = createAuth({
      database: stubDb as never,
      secret: "ci-secret-at-least-16-chars",
      baseURL: "http://localhost:3000",
    });

    const ctx = await auth.$context;
    expect(typeof ctx.checkSchema).toBe("function");
    await expect(ctx.checkSchema?.()).resolves.toBeUndefined();
  });
});
