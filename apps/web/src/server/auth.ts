import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import * as schema from "@stancehub/db";
import { getDb } from "./db";
import { getServerEnv } from "../env";

/** Drizzle tables Better Auth is configured to use — keep in sync with `createAuth`. */
export const authDrizzleSchema = {
  user: schema.user,
  session: schema.session,
  account: schema.account,
  verification: schema.verification,
  organization: schema.organization,
  member: schema.member,
  invitation: schema.invitation,
} as const;

export function createAuth(options?: {
  database?: ReturnType<typeof getDb>;
  secret?: string;
  baseURL?: string;
}) {
  const env = options?.secret && options?.baseURL ? null : getServerEnv();
  const database = options?.database ?? getDb();
  const secret = options?.secret ?? env!.BETTER_AUTH_SECRET;
  const baseURL = options?.baseURL ?? env!.BETTER_AUTH_URL;

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authDrizzleSchema,
    }),
    secret,
    baseURL,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: "admin",
      }),
    ],
  });
}

const globalForAuth = globalThis as unknown as {
  __stancehubAuth?: ReturnType<typeof createAuth>;
};

export function getAuth() {
  if (!globalForAuth.__stancehubAuth) {
    globalForAuth.__stancehubAuth = createAuth();
  }
  return globalForAuth.__stancehubAuth;
}

// Dev/HMR: drop the cached instance when this module reloads so Better Auth
// re-checks the current Drizzle schema (e.g. invitation.createdAt).
if (process.env.NODE_ENV !== "production") {
  globalForAuth.__stancehubAuth = undefined;
}

export type AuthSession = typeof getAuth extends () => infer A
  ? A extends { api: { getSession: (...args: never[]) => Promise<infer S> } }
    ? S
    : never
  : never;
