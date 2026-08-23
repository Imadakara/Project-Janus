import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { trackEvent } from "@/lib/analytics/track";
import { getUnlockedModuleKeys } from "@/lib/modules/unlocks";
import { hasModuleAccess } from "@/lib/modules/access";
import { isTerminalFilesRateLimited } from "@/lib/terminal/rate-limit";
import { recordSegmentWitness } from "@/lib/janus/salvage";
import { now } from "@/lib/janus/clock";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  if (isTerminalFilesRateLimited(player.id)) {
    return NextResponse.json({ error: "СЛИШКОМ МНОГО ЗАПРОСОВ. ПОДОЖДИТЕ." }, { status: 429 });
  }

  const { id } = await params;
  const file = await prisma.terminalFile.findUnique({
    where: { id },
    include: { requiredModule: true, segment: { select: { id: true, status: true } } },
  });

  if (!file || (file.visibleToRole && file.visibleToRole !== player.role)) {
    return NextResponse.json({ error: "ФАЙЛ НЕ НАЙДЕН." }, { status: 404 });
  }

  const unlockedModuleKeys = await getUnlockedModuleKeys(player.id);

  if (!hasModuleAccess(unlockedModuleKeys, file.requiredModuleKey)) {
    await trackEvent("FILE_OPEN_DENIED", player.id, {
      fileId: file.id,
      requiredModuleKey: file.requiredModuleKey,
    });
    return NextResponse.json({
      granted: false,
      message: `ДОСТУП ОТКЛОНЁН: ТРЕБУЕТСЯ МОДУЛЬ ${file.requiredModule.key}`,
    });
  }

  // Счётчик спасённого (2.6): полное открытие — засчитанный контакт, но только пока сегмент
  // ещё жив («вынесен ДО утраты», не после — иначе смысл счётчика теряется).
  if (file.segment && file.segment.status !== "DEAD") {
    await recordSegmentWitness(file.segment.id, player.id, await now());
  }

  return NextResponse.json({ granted: true, content: file.fullContent });
}
