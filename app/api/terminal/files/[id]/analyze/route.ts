import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";

const FILE_ANALYZER_KEY = "FILE_ANALYZER";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const analyzerUnlock = await prisma.playerModuleUnlock.findFirst({
    where: { playerId: player.id, moduleKey: FILE_ANALYZER_KEY },
  });

  if (!analyzerUnlock) {
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

  return NextResponse.json({ summary: file.analysisSummary });
}
