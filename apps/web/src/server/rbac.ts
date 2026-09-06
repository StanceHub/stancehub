import { headers } from "next/headers";
import { getAuth } from "@/server/auth";

export async function requireSession() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }
  return session;
}

export function memberRoleIsAdmin(role: string | undefined | null) {
  return role === "admin" || role === "owner";
}
