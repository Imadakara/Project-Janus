import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getDebugTimeOffsetMs, setDebugTimeOffsetMs, now } from "@/lib/janus/clock";
import { applyDueDecay, syncApproachingDecay } from "@/lib/janus/reaper";
import { recomputeDerivedState } from "@/lib/janus/state";
import { getJanusDebugSnapshot } from "@/lib/janus/debug-snapshot";
import { DEATH_AT } from "@/lib/janus/calendar";

// Виртуальные часы дебаг-панели (ТЗ 2.11): единственный писатель JanusState.debugTimeOffsetMs
// вне тестов. После любого сдвига обязаны «догнать» планировщик (2.3) синхронно, в этом же
// запросе — панель ожидает увидеть уже применённые утраты в возвращаемом снапшоте, не после
// следующего случайного recompute-on-read.
const timeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("advance"), deltaMs: z.number().int() }),
  z.object({ action: z.literal("jumpToDeathMinus"), marginMs: z.number().int().nonnegative() }),
  z.object({ action: z.literal("reset") }),
]);

export async function POST(request: Request) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }
  if (!player.isDebug) {
    return NextResponse.json({ error: "Недоступно." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = timeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (parsed.data.action === "reset") {
    await setDebugTimeOffsetMs(0);
  } else if (parsed.data.action === "advance") {
    const currentOffsetMs = await getDebugTimeOffsetMs();
    await setDebugTimeOffsetMs(currentOffsetMs + parsed.data.deltaMs);
  } else {
    // Абсолютный прыжок считается от РЕАЛЬНОГО системного времени, а не от текущего
    // виртуального — иначе повторные нажатия «к дате смерти − N» дрейфовали бы друг от
    // друга вместо того, чтобы каждый раз целиться в одну и ту же точку.
    const targetTimeMs = DEATH_AT.getTime() - parsed.data.marginMs;
    await setDebugTimeOffsetMs(targetTimeMs - Date.now());
  }

  const virtualNow = await now();
  await applyDueDecay(virtualNow);
  await syncApproachingDecay(virtualNow);
  await recomputeDerivedState(virtualNow);

  return NextResponse.json(await getJanusDebugSnapshot());
}
