import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getOrCreateActiveSession } from "@/lib/chat/session";
import { getAnthropicClient, CHAT_MODEL } from "@/lib/ai/client";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { isRateLimited } from "@/lib/ai/rate-limit";

const HISTORY_LIMIT = 20;
const MAX_MESSAGE_LENGTH = 2000;

const chatSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export async function POST(request: Request) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  if (isRateLimited(player.id)) {
    return NextResponse.json({ error: "СЛИШКОМ МНОГО ЗАПРОСОВ. ПОДОЖДИТЕ." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректное сообщение." }, { status: 400 });
  }

  const session = await getOrCreateActiveSession(player.id);

  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "PLAYER", content: parsed.data.message },
  });

  const recentHistory = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  const history = recentHistory.reverse();

  let aiText: string;
  let inputTokens = 0;
  let outputTokens = 0;
  const startedAt = Date.now();

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(player.role),
      messages: history.map((m) => ({
        role: m.role === "PLAYER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
    });

    aiText = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();
    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;
  } catch (error) {
    console.error("Anthropic API call failed:", error);
    return NextResponse.json(
      { error: "СВЯЗЬ С ЯДРОМ СИСТЕМЫ ПРЕРВАНА. ПОВТОРИТЕ ПОПЫТКУ ПОЗЖЕ." },
      { status: 502 },
    );
  }

  const latencyMs = Date.now() - startedAt;

  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "AI", content: aiText },
  });

  await prisma.llmCallLog.create({
    data: {
      playerId: player.id,
      sessionId: session.id,
      model: CHAT_MODEL,
      inputTokens,
      outputTokens,
      latencyMs,
    },
  });

  return NextResponse.json({ sessionId: session.id, message: aiText });
}
