import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/auth/server";
import { now } from "@/lib/janus/clock";
import { DEATH_AT, isDead, remaining } from "@/lib/janus/calendar";

// Лёгкий endpoint под постоянный отсчёт в углу терминала (ТЗ 2.5, components/terminal/
// death-countdown.tsx) — только чтение виртуальных часов, без планировщика утрат
// (см. /api/terminal/vitals, там applyDueDecay/syncApproachingDecay уместны, а тут
// опрашивается со всех страниц сразу и должны быть дёшевы).
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const virtualNow = await now();
  return NextResponse.json({
    deathAt: DEATH_AT.toISOString(),
    remainingMs: remaining(virtualNow),
    isDead: isDead(virtualNow),
  });
}
