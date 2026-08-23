import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getJanusDebugSnapshot } from "@/lib/janus/debug-snapshot";
import { clearComputeMarginOverride } from "@/lib/janus/state";

// Снятие ручного override M (ТЗ 2.4): после этого recomputeDerivedStateTx возвращает
// computeMargin на штатную кривую износа (lib/janus/wear.ts) при следующем чтении.
export async function POST() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }
  if (!player.isDebug) {
    return NextResponse.json({ error: "Недоступно." }, { status: 403 });
  }

  await clearComputeMarginOverride();
  return NextResponse.json(await getJanusDebugSnapshot());
}
