export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export function isAdmin(role: string): boolean {
  return role === "admin";
}
