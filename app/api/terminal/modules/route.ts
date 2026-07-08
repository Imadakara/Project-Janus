import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayerId } from "@/lib/auth/server";

export async function GET() {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const unlocks = await prisma.playerModuleUnlock.findMany({
    where: { playerId },
    include: { module: true },
  });

  return NextResponse.json({
    modules: unlocks.map((unlock) => ({
      key: unlock.module.key,
      name: unlock.module.name,
      description: unlock.module.description,
    })),
  });
}
