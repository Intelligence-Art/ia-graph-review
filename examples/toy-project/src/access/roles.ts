export const ROLES = ["viewer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];
