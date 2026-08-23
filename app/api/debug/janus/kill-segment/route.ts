import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { killSegment } from "@/lib/janus/death";
import { getJanusDebugSnapshot } from "@/lib/janus/debug-snapshot";
import { now } from "@/lib/janus/clock";

const schema = z.object({
  segmentCode: z.string().min(1),
  cause: z.string().min(1).default("debug_kill"),
});

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

  await killSegment(parsed.data.segmentCode, parsed.data.cause, await now());
  return NextResponse.json(await getJanusDebugSnapshot());
}
