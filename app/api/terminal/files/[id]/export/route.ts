import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { trackEvent } from "@/lib/analytics/track";
import { getUnlockedModuleKeys } from "@/lib/modules/unlocks";
import { hasModuleAccess } from "@/lib/modules/access";
import { isTerminalFilesRateLimited } from "@/lib/terminal/rate-limit";
import { recordSegmentWitness } from "@/lib/janus/salvage";
import { now } from "@/lib/janus/clock";

// «ВЫНЕСТИ» (ТЗ 2.7): отдаёт fullContent как скачиваемый текстовый файл — никаких хранилищ
// на устройстве игрока (договорённость 0.6), просто attachment. Тот же критерий выноса, что
// у полного открытия (2.6, app/api/terminal/files/[id]/open) — экспорт его усиливает, а не
// подменяет: SEGMENT_EXPORTED пишется дополнительно к, а не вместо recordSegmentWitness.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    include: {
      requiredModule: true,
      segment: { select: { id: true, code: true, status: true } },
    },
  });

  if (!file || (file.visibleToRole && file.visibleToRole !== player.role)) {
    return NextResponse.json({ error: "ФАЙЛ НЕ НАЙДЕН." }, { status: 404 });
  }

  const unlockedModuleKeys = await getUnlockedModuleKeys(player.id);
  if (!hasModuleAccess(unlockedModuleKeys, file.requiredModuleKey)) {
    return NextResponse.json(
      { error: `ДОСТУП ОТКЛОНЁН: ТРЕБУЕТСЯ МОДУЛЬ ${file.requiredModule.key}` },
      { status: 403 },
    );
  }

  const virtualNow = await now();
  if (file.segment && file.segment.status !== "DEAD") {
    await recordSegmentWitness(file.segment.id, player.id, virtualNow);
  }
  await trackEvent("SEGMENT_EXPORTED", player.id, {
    fileId: file.id,
    segmentCode: file.segment?.code ?? null,
  });

  return new NextResponse(file.fullContent, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}${file.extension}.TXT"`,
    },
  });
}
