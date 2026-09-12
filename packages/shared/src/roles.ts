export const ROLES = ["admin", "owner", "member"] as const;
export type Role = (typeof ROLES)[number];

/** Privileged vault mutations (delete / retry / reembed). Better Auth creator is `admin`; some installs use `owner`. */
export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "owner";
}
