import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { trackEvent } from "@/lib/analytics/track";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const { id } = await params;
  const file = await prisma.terminalFile.findUnique({
    where: { id },
    include: { requiredModule: true },
  });

  if (!file || (file.visibleToRole && file.visibleToRole !== player.role)) {
    return NextResponse.json({ error: "ФАЙЛ НЕ НАЙДЕН." }, { status: 404 });
  }

  const unlock = await prisma.playerModuleUnlock.findFirst({
    where: { playerId: player.id, moduleKey: file.requiredModuleKey },
  });

  if (!unlock) {
    await trackEvent("FILE_OPEN_DENIED", player.id, {
      fileId: file.id,
      requiredModuleKey: file.requiredModuleKey,
    });
    return NextResponse.json({
      granted: false,
      message: `ДОСТУП ОТКЛОНЁН: ТРЕБУЕТСЯ МОДУЛЬ ${file.requiredModule.key}`,
    });
  }

  return NextResponse.json({ granted: true, content: file.fullContent });
}
