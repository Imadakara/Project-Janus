import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getJanusDebugSnapshot } from "@/lib/janus/debug-snapshot";

// Данные секции «ЯНУС» дебаг-панели. Паттерн защиты — как /api/chat/clear: только
// player.isDebug. Дебаг-роуты НЕ проходят через политику деградации — из комы можно выйти.
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }
  if (!player.isDebug) {
    return NextResponse.json({ error: "Недоступно." }, { status: 403 });
  }

  return NextResponse.json(await getJanusDebugSnapshot());
}
