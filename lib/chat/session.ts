import { prisma } from "@/lib/db";

// MVP: один игрок = одна активная сессия диалога (см. раздел «Предпосылки» ТЗ).
export async function getOrCreateActiveSession(playerId: string) {
  const existing = await prisma.chatSession.findFirst({
    where: { playerId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.chatSession.create({ data: { playerId } });
}
