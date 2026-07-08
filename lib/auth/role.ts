import type { Role } from "@/app/generated/prisma/client";

// Стартовый набор ролей MVP. Точка вызова этой функции (сейчас — регистрация)
// может измениться в будущем без переделки модели данных.
const ASSIGNABLE_ROLES: Role[] = ["ARCHIVIST", "TECHNICIAN", "SECURITY_OFFICER"];

export function assignRandomRole(): Role {
  const index = Math.floor(Math.random() * ASSIGNABLE_ROLES.length);
  return ASSIGNABLE_ROLES[index];
}

export const ROLE_LABELS: Record<Role, string> = {
  UNASSIGNED: "НЕ НАЗНАЧЕНА",
  ARCHIVIST: "АРХИВИСТ",
  TECHNICIAN: "ТЕХНИК",
  SECURITY_OFFICER: "ОФИЦЕР БЕЗОПАСНОСТИ",
};
