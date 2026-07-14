import { prisma } from "@/lib/db";
import type { Role } from "@/app/generated/prisma/client";

export type FragmentsByPoolType = {
  NORMAL: string[];
  REPEATED: string[];
  // Пер-интентные пулы политики деградации (lib/janus/degradation.ts): DEGRADED — подсистема
  // интента погашена, EMERGENCY — аварийный режим всей системы.
  DEGRADED: string[];
  EMERGENCY: string[];
};

// resolveResponse (resolve.ts) остаётся чистой функцией без доступа к БД — этот модуль
// заранее подтягивает тексты фрагментов для сматченного intent'а, которые вызывающий
// код (маршрут) передаёт в resolveResponse как данные.
//
// Пул под конкретную роль (requiredRole = playerRole) имеет приоритет над общим
// (requiredRole = null), если оба существуют.
export async function loadFragmentsForIntent(
  intentCode: string,
  playerRole: Role,
): Promise<FragmentsByPoolType> {
  const pools = await prisma.responsePool.findMany({
    where: {
      intent: { code: intentCode },
      OR: [{ requiredRole: null }, { requiredRole: playerRole }],
    },
    include: { fragments: true },
  });

  const result: FragmentsByPoolType = { NORMAL: [], REPEATED: [], DEGRADED: [], EMERGENCY: [] };

  for (const type of ["NORMAL", "REPEATED", "DEGRADED", "EMERGENCY"] as const) {
    const roleSpecific = pools.find(
      (pool) => pool.type === type && pool.requiredRole === playerRole,
    );
    const generic = pools.find((pool) => pool.type === type && pool.requiredRole === null);
    const chosen = roleSpecific ?? generic;
    if (chosen) result[type] = chosen.fragments.map((fragment) => fragment.template);
  }

  return result;
}
