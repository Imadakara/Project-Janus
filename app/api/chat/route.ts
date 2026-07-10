import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { MessageLayer } from "@/app/generated/prisma/client";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getOrCreateActiveSession } from "@/lib/chat/session";
import { isChatRateLimited, isFullLlmBudgetExceeded } from "@/lib/ai/rate-limit";
import { getLlmProvider } from "@/lib/ai/providers";
import { buildPrompt } from "@/lib/ai/prompt-builder";
import { applyGuards } from "@/lib/ai/guards";
import { searchUnlockedMaterials } from "@/lib/ai/rag";
import { trackEvent } from "@/lib/analytics/track";
import { classifyIntent } from "@/lib/intent/classify";
import { resolveResponse, type ResolveInput } from "@/lib/scenario/resolve";
import { loadFragmentsForIntent } from "@/lib/scenario/repository";
import type {
  EscalationReason,
  ScenarioSessionState,
  ShortTermMemoryEntry,
} from "@/lib/scenario/types";
import { explainTurn } from "@/lib/scenario/debug-explain";
import { getUnlockedModuleKeys } from "@/lib/modules/unlocks";

const HISTORY_LIMIT = 20;
const MAX_MESSAGE_LENGTH = 2000;

const chatSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  // Тумблер «Use LLM» панели отладки — учитывается только для player.isDebug (fail-open по
  // умолчанию, чтобы обычные игроки и старые клиенты без этого поля никогда не блокировались).
  useLlm: z.boolean().default(true),
});

export async function POST(request: Request) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  if (isChatRateLimited(player.id)) {
    return NextResponse.json({ error: "СЛИШКОМ МНОГО ЗАПРОСОВ. ПОДОЖДИТЕ." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректное сообщение." }, { status: 400 });
  }
  const playerMessage = parsed.data.message;

  const session = await getOrCreateActiveSession(player.id);

  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "PLAYER", content: playerMessage },
  });

  const sessionState: ScenarioSessionState = {
    disposition: session.disposition as unknown as ScenarioSessionState["disposition"],
    activeContext: session.activeContext,
    shortTermMemory: session.shortTermMemory as unknown as ShortTermMemoryEntry[],
    intentRepeatCount: session.intentRepeatCount as unknown as Record<string, number>,
    desyncScore: session.desyncScore,
    lastConfidenceTier: session.lastConfidenceTier as ScenarioSessionState["lastConfidenceTier"],
  };

  const intentResult = await classifyIntent(playerMessage, {
    shortTermMemory: sessionState.shortTermMemory,
  });

  // MVP-эвристика: считаем, что запрос требует синтеза нескольких материалов, если
  // сообщение упоминает 2+ известных сущности сразу. TODO: заменить реальной сверкой с
  // разблокированными файлами/модулями.
  const requiresSynthesis = intentResult.mentionedEntities.length >= 2;

  const fragmentsByPoolType = intentResult.intent
    ? await loadFragmentsForIntent(intentResult.intent, player.role)
    : null;

  const resolveInput: ResolveInput = {
    intentResult,
    sessionState,
    requiresSynthesis,
    playerRole: player.role,
    fullLlmBudgetExceeded: isFullLlmBudgetExceeded(player.id),
    fragmentsByPoolType,
  };

  const resolution = resolveResponse(resolveInput);

  // Только для дебаг-игроков переключатель «Use LLM» на панели отладки может заблокировать
  // эскалацию до LLM — см. lib/debug/debug-context.tsx и components/debug/debug-panel.tsx.
  const llmBlocked = player.isDebug && parsed.data.useLlm === false;

  let aiText: string;
  let handledByLayer: MessageLayer;
  let escalationReason: EscalationReason | null = null;
  let llmUsage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    latencyMs: number;
  } | null = null;

  try {
    if (llmBlocked && (resolution.kind === "light_llm" || resolution.kind === "full_llm")) {
      handledByLayer = "DETERMINISTIC";
      escalationReason =
        resolution.kind === "light_llm"
          ? "desync_light_blocked_toggle"
          : "desync_full_blocked_toggle";
      aiText = explainTurn({
        handledByLayer,
        matchedIntent: intentResult.intent,
        intentConfidence: intentResult.confidence,
        escalationReason,
        desyncScore: resolution.stateUpdate.desyncScore,
      });
    } else if (resolution.kind === "deterministic") {
      aiText = resolution.fragment;
      handledByLayer = "DETERMINISTIC";
      escalationReason = resolution.escalationReason ?? null;
    } else if (resolution.kind === "light_llm") {
      handledByLayer = "LIGHT_LLM";
      escalationReason = resolution.escalationReason;
      const prompt = buildPrompt(resolution.task, {
        mode: "light",
        role: player.role,
        currentMessage: playerMessage,
      });
      const startedAt = Date.now();
      const result = await getLlmProvider().generate(prompt);
      aiText = applyGuards(result.text, resolution.task);
      llmUsage = { ...result.usage, model: result.model, latencyMs: Date.now() - startedAt };
    } else {
      handledByLayer = "FULL_LLM";
      escalationReason = resolution.escalationReason;

      const [unlockedModuleKeys, recentHistory] = await Promise.all([
        getUnlockedModuleKeys(player.id),
        prisma.chatMessage.findMany({
          where: { sessionId: session.id },
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
        }),
      ]);
      const ragResults = await searchUnlockedMaterials(
        playerMessage,
        unlockedModuleKeys,
        player.role,
      );
      const history = recentHistory.reverse().map((m) => ({
        role: m.role === "PLAYER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

      const prompt = buildPrompt(resolution.task, {
        mode: "full",
        role: player.role,
        currentMessage: playerMessage,
        history,
        ragResults,
      });
      const startedAt = Date.now();
      const result = await getLlmProvider().generate(prompt);
      aiText = applyGuards(result.text, resolution.task);
      llmUsage = { ...result.usage, model: result.model, latencyMs: Date.now() - startedAt };
    }
  } catch (error) {
    console.error("LLM provider call failed:", error);
    return NextResponse.json(
      { error: "СВЯЗЬ С ЯДРОМ СИСТЕМЫ ПРЕРВАНА. ПОВТОРИТЕ ПОПЫТКУ ПОЗЖЕ." },
      { status: 502 },
    );
  }

  await prisma.chatSession.update({
    where: { id: session.id },
    data: {
      disposition: resolution.stateUpdate.disposition,
      intentRepeatCount: resolution.stateUpdate.intentRepeatCount,
      desyncScore: resolution.stateUpdate.desyncScore,
      lastConfidenceTier: resolution.stateUpdate.lastConfidenceTier,
      shortTermMemory: resolution.stateUpdate.shortTermMemory,
    },
  });

  await prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "AI",
      content: aiText,
      handledByLayer,
      matchedIntent: intentResult.intent,
      intentConfidence: intentResult.confidence,
      escalationReason,
    },
  });

  if (llmUsage) {
    await prisma.llmCallLog.create({
      data: {
        playerId: player.id,
        sessionId: session.id,
        model: llmUsage.model,
        inputTokens: llmUsage.inputTokens,
        outputTokens: llmUsage.outputTokens,
        latencyMs: llmUsage.latencyMs,
      },
    });
  }

  await trackEvent("CHAT_MESSAGE", player.id, { sessionId: session.id });

  const debug = player.isDebug
    ? {
        handledByLayer,
        matchedIntent: intentResult.intent,
        intentConfidence: intentResult.confidence,
        escalationReason,
        session: {
          desyncScore: resolution.stateUpdate.desyncScore,
          lastConfidenceTier: resolution.stateUpdate.lastConfidenceTier,
          disposition: resolution.stateUpdate.disposition,
          activeContext: sessionState.activeContext,
        },
      }
    : undefined;

  return NextResponse.json({ sessionId: session.id, message: aiText, debug });
}
