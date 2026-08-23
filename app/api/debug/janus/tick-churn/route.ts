import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { killSegment } from "@/lib/janus/death";
import { getJanusDebugSnapshot } from "@/lib/janus/debug-snapshot";
import { getJanusState, recomputeDerivedState } from "@/lib/janus/state";
import { tickChurn } from "@/lib/janus/synthetic-churn";
import { now } from "@/lib/janus/clock";

// «Сутки чурна» (ТЗ 1.6): каждая живая доля каждого живого сегмента умирает с вероятностью
// λ — симуляция суточного оттока носителей до появления настоящих heartbeat'ов (Фаза 2).
// Math.random допустим только здесь, в вызывающем коде; сама tickChurn чистая.
export async function POST() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }
  if (!player.isDebug) {
    return NextResponse.json({ error: "Недоступно." }, { status: 403 });
  }

  const state = await getJanusState();
  const aliveSegments = await prisma.memorySegment.findMany({
    where: { status: { not: "DEAD" } },
  });

  const belowThreshold: string[] = [];
  for (const segment of aliveSegments) {
    const survivors = tickChurn(segment.sharesAlive, state.lambdaEstimate, Math.random);
    if (survivors !== segment.sharesAlive) {
      await prisma.memorySegment.update({
        where: { id: segment.id },
        data: { sharesAlive: survivors },
      });
    }
    if (survivors < segment.k) belowThreshold.push(segment.code);
  }

  // Упавшие ниже порога умирают единственным штатным путём; killSegment пересчитывает
  // производные сам, но общий пересчёт нужен и при простой убыли долей без смертей.
  const virtualNow = await now();
  for (const code of belowThreshold) {
    await killSegment(code, "churn", virtualNow);
  }
  await recomputeDerivedState(virtualNow);

  return NextResponse.json(await getJanusDebugSnapshot());
}
