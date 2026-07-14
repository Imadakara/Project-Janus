import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getJanusDebugSnapshot } from "@/lib/janus/debug-snapshot";
import { setComputeMargin } from "@/lib/janus/state";

// Ручной рычаг M Фазы 1 (ТЗ 1.6). В Фазе 3 источником M станет живой расчёт по флоту
// узлов, а этот роут останется дебаг-override'ом.
const schema = z.object({ computeMargin: z.number().min(0).max(2) });

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
    return NextResponse.json({ error: "Некорректное значение computeMargin." }, { status: 400 });
  }

  await setComputeMargin(parsed.data.computeMargin);
  return NextResponse.json(await getJanusDebugSnapshot());
}
