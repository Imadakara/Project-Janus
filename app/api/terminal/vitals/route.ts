import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getJanusState, recomputeDerivedState } from "@/lib/janus/state";

// «Периодический» пересчёт прогноза без джоб-раннера (ТЗ 1.4): если производные старше
// порога — пересчитать при чтении. Между изменениями долей прогноз-дата абсолютна и не
// дрейфует, так что ветка срабатывает редко; событийные триггеры (смерть/±доли/чурн)
// пересчитывают немедленно сами.
const FORECAST_STALE_MS = 6 * 60 * 60 * 1000;

export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  let state = await getJanusState();
  if (Date.now() - state.updatedAt.getTime() > FORECAST_STALE_MS) {
    state = await recomputeDerivedState();
  }

  const [coreSegments, recentLosses] = await Promise.all([
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
  ]);

  const coreDead = coreSegments.some(
    (segment) => segment.status === "DEAD" || segment.sharesAlive < segment.k,
  );

  return NextResponse.json({
    computeMargin: state.computeMargin,
    integrityIndex: state.integrityIndex,
    subsystems: state.subsystems,
    forecast: {
      deathAt: state.forecastDeathAt?.toISOString() ?? null,
      p10At: state.forecastP10At?.toISOString() ?? null,
      lambda: state.lambdaEstimate,
      coreDead,
    },
    coreSegments,
    recentLosses: recentLosses.map((loss) => ({
      segmentCode: loss.segmentCode,
      title: loss.title,
      diedAt: loss.diedAt.toISOString(),
    })),
  });
}
