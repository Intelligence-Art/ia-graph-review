import { ROLES, type Role } from "./roles";

export function mayEdit(role: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf("editor");
}
