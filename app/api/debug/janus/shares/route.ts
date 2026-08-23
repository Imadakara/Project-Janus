import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { killSegment } from "@/lib/janus/death";
import { getJanusDebugSnapshot } from "@/lib/janus/debug-snapshot";
import { recomputeDerivedState } from "@/lib/janus/state";
import { now } from "@/lib/janus/clock";

// ±доли синтетического сегмента (ТЗ 1.6): видимая причинность — добавление долей отодвигает
// дату отказа на PULS, снятие приближает. Падение ниже порога k убивает сегмент единственным
// штатным путём (lib/janus/death.ts), никакой смерти «мимо killSegment».
const schema = z.object({ segmentCode: z.string().min(1), delta: z.number().int() });

export async function POST(request: Request) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }
  if (!player.isDebug) {
    return NextResponse.json({ error: "Недоступно." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректное тело запроса." }, { status: 400 });
  }

  const segment = await prisma.memorySegment.findUnique({
    where: { code: parsed.data.segmentCode },
  });
  if (!segment) {
    return NextResponse.json({ error: "СЕГМЕНТ НЕ НАЙДЕН." }, { status: 404 });
  }
  if (segment.status === "DEAD") {
    return NextResponse.json(
      { error: "СЕГМЕНТ МЁРТВ. ДОЛИ НЕ ВОССТАНАВЛИВАЮТСЯ." },
      { status: 409 },
    );
  }

  const newShares = Math.max(0, segment.sharesAlive + parsed.data.delta);
  await prisma.memorySegment.update({
    where: { id: segment.id },
    data: { sharesAlive: newShares },
  });

  const virtualNow = await now();
  if (newShares < segment.k) {
    await killSegment(segment.code, "shares_below_threshold", virtualNow);
  } else {
    await recomputeDerivedState(virtualNow);
  }

  return NextResponse.json(await getJanusDebugSnapshot());
}
