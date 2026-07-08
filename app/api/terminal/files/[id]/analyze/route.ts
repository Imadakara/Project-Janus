import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { trackEvent } from "@/lib/analytics/track";
import { getUnlockedModuleKeys } from "@/lib/modules/unlocks";
import { hasModuleAccess } from "@/lib/modules/access";
import { isTerminalFilesRateLimited } from "@/lib/terminal/rate-limit";

const FILE_ANALYZER_KEY = "FILE_ANALYZER";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  if (isTerminalFilesRateLimited(player.id)) {
    return NextResponse.json({ error: "СЛИШКОМ МНОГО ЗАПРОСОВ. ПОДОЖДИТЕ." }, { status: 429 });
  }

  const unlockedModuleKeys = await getUnlockedModuleKeys(player.id);

  if (!hasModuleAccess(unlockedModuleKeys, FILE_ANALYZER_KEY)) {
    return NextResponse.json(
      { error: "ДОСТУП ОТКЛОНЁН: ТРЕБУЕТСЯ МОДУЛЬ FILE_ANALYZER" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const file = await prisma.terminalFile.findUnique({ where: { id } });

  if (!file || (file.visibleToRole && file.visibleToRole !== player.role)) {
    return NextResponse.json({ error: "ФАЙЛ НЕ НАЙДЕН." }, { status: 404 });
  }

  await prisma.playerFileAnalysis.upsert({
    where: { playerId_fileId: { playerId: player.id, fileId: file.id } },
    create: { playerId: player.id, fileId: file.id },
    update: { analyzedAt: new Date() },
  });

  await trackEvent("FILE_ANALYZED", player.id, { fileId: file.id });

  return NextResponse.json({ summary: file.analysisSummary });
}
