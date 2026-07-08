import { prisma } from "@/lib/db";

export async function getUnlockedModuleKeys(playerId: string): Promise<string[]> {
  const unlocks = await prisma.playerModuleUnlock.findMany({
    where: { playerId },
    select: { moduleKey: true },
  });
  return unlocks.map((u) => u.moduleKey);
}
