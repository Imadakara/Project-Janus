import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { recomputeDerivedState } from "@/lib/janus/state";
import { now } from "@/lib/janus/clock";
import { applyDueDecay, syncApproachingDecay } from "@/lib/janus/reaper";
import { DEATH_AT, isDead, remaining } from "@/lib/janus/calendar";
import { getSalvageState } from "@/lib/janus/salvage";

// PULS.EXE (ТЗ 2.5): расписание распада фиксировано и известно заранее, поэтому «прогноз
// отказа» Фазы 1 заменён на константный отсчёт (DEATH_AT) — виртуальные часы (clock.ts) те же,
// что использует /api/chat, так что дебаг-сдвиг времени виден здесь без отдельного пути.
// Планировщик (reaper.ts) и деградация копий вызываются на каждое чтение — тот же
// recompute-on-read, что был принят в Фазе 1 для forecastDeathAt.
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const virtualNow = await now();
  await applyDueDecay(virtualNow);
  await syncApproachingDecay(virtualNow);
  const state = await recomputeDerivedState(virtualNow);

  const [coreSegments, recentLosses, lossCount, salvage, degradingSegments] = await Promise.all([
    prisma.memorySegment.findMany({
      where: { tier: "CORE" },
      orderBy: { code: "asc" },
      select: {
        code: true,
        title: true,
        status: true,
        sharesAlive: true,
        sharesTarget: true,
        k: true,
      },
    }),
    prisma.lossLedgerEntry.findMany({
      orderBy: { id: "desc" },
      take: 5,
      select: { segmentCode: true, title: true, diedAt: true },
    }),
    prisma.lossLedgerEntry.count(),
    getSalvageState(),
    prisma.memorySegment.findMany({
      where: { status: "DEGRADED" },
      include: { decayEvent: { select: { dieAt: true } } },
    }),
  ]);

  const coreDead = coreSegments.some((segment) => segment.status === "DEAD");

  const sortedDegrading = [...degradingSegments].sort((a, b) => {
    const aDieAt = a.decayEvent?.dieAt.getTime() ?? Infinity;
    const bDieAt = b.decayEvent?.dieAt.getTime() ?? Infinity;
    return aDieAt - bDieAt;
  });

  return NextResponse.json({
    computeMargin: state.computeMargin,
    computeMarginOverride: state.computeMarginOverride,
    integrityIndex: state.integrityIndex,
    subsystems: state.subsystems,
    countdown: {
      deathAt: DEATH_AT.toISOString(),
      remainingMs: remaining(virtualNow),
      isDead: isDead(virtualNow),
      coreDead,
    },
    salvage,
    lossCount,
    degradingSegments: sortedDegrading.map((segment) => ({
      code: segment.code,
      title: segment.title,
      dieAt: segment.decayEvent?.dieAt.toISOString() ?? null,
    })),
    coreSegments,
    recentLosses: recentLosses.map((loss) => ({
      segmentCode: loss.segmentCode,
      title: loss.title,
      diedAt: loss.diedAt.toISOString(),
    })),
  });
}
