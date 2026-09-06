import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import * as schema from "@stancehub/db";
import { getDb } from "@/server/db";
import { getServerEnv } from "@/env";

export function createAuth() {
  const env = getServerEnv();
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
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

const globalForAuth = globalThis as unknown as { __stancehubAuth?: ReturnType<typeof createAuth> };

export function getAuth() {
  if (!globalForAuth.__stancehubAuth) {
    globalForAuth.__stancehubAuth = createAuth();
  }
  return globalForAuth.__stancehubAuth;
}

export type AuthSession = typeof getAuth extends () => infer A
  ? A extends { api: { getSession: (...args: never[]) => Promise<infer S> } }
    ? S
    : never
  : never;
