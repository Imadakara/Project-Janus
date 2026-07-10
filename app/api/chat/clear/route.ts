import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getOrCreateActiveSession } from "@/lib/chat/session";

// Доступно только дебаг-игрокам (панель отладки, кнопка «Очистить чат») — удаляет историю
// сообщений сессии и сбрасывает состояние движка (Слой 1) к значениям только что созданной
// сессии, см. @default(...) в prisma/schema.prisma для ChatSession.
export async function POST() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }
  if (!player.isDebug) {
    return NextResponse.json({ error: "Недоступно." }, { status: 403 });
  }

  const session = await getOrCreateActiveSession(player.id);

  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { sessionId: session.id } }),
    prisma.chatSession.update({
      where: { id: session.id },
      data: {
        disposition: { trust: 0, tension: 0 },
        activeContext: null,
        shortTermMemory: [],
        intentRepeatCount: {},
        desyncScore: 0,
        lastConfidenceTier: null,
      },
    }),
  ]);

  return NextResponse.json({ sessionId: session.id });
}
