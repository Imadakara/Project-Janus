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
import { recomputeDerivedState } from "@/lib/janus/state";
import { resolveDegradationPolicy } from "@/lib/janus/degradation";
import { buildChatSlots, loadDynamicSlots } from "@/lib/janus/slots";
import { loadSystemStateBrief } from "@/lib/janus/brief";
import { now } from "@/lib/janus/clock";
import { applyDueDecay, syncApproachingDecay } from "@/lib/janus/reaper";
import { recordSegmentWitness } from "@/lib/janus/salvage";
import { pickFragment } from "@/lib/scenario/fragments";
import { COMA_FRAGMENTS, MEMORY_LOST_FRAGMENTS } from "@/lib/scenario/refusal-fragments";
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

  // Фаза 2: виртуальные часы → догоняем просроченные плановые утраты → свежее состояние
  // (computeMargin по кривой износа от текущего момента, если не override) → политика
  // деградации на этот ход.
  const virtualNow = await now();
  await applyDueDecay(virtualNow);
  await syncApproachingDecay(virtualNow);
  const janusState = await recomputeDerivedState(virtualNow);
  const policy = resolveDegradationPolicy(janusState);
  const slots = {
    ...buildChatSlots(janusState, player.role, virtualNow),
    ...(await loadDynamicSlots()),
  };

  const session = await getOrCreateActiveSession(player.id);

  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "PLAYER", content: playerMessage },
  });

  // Кома (M < 0.2): перехват ДО классификации интента — в коме система не тратит ни
  // эмбеддинги, ни запросы пулов. Состояние сессии не мутируется (ход «не считается»),
  // но телеметрия пишется честно. Дебаг-роуты и PULS через политику не проходят — из комы
  // можно выйти.
  if (policy.stage === "COMA") {
    const comaText = pickFragment(COMA_FRAGMENTS, slots);
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "AI",
        content: comaText,
        handledByLayer: "DETERMINISTIC",
        matchedIntent: null,
        intentConfidence: null,
        escalationReason: "coma",
      },
    });
    await trackEvent("CHAT_MESSAGE", player.id, { sessionId: session.id });
    return NextResponse.json({
      sessionId: session.id,
      message: comaText,
      replyDelayMs: policy.replyDelayMs,
      debug: player.isDebug
        ? {
            handledByLayer: "DETERMINISTIC",
            matchedIntent: null,
            intentConfidence: null,
            escalationReason: "coma",
            policy: {
              stage: policy.stage,
              maxLayer: policy.maxLayer,
              replyDelayMs: policy.replyDelayMs,
            },
            session: {
              desyncScore: session.desyncScore,
              lastConfidenceTier: session.lastConfidenceTier,
              disposition: session.disposition,
              activeContext: session.activeContext,
            },
          }
        : undefined,
    });
  }

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

  const [fragmentsByPoolType, systemStateBrief] = await Promise.all([
    intentResult.intent
      ? loadFragmentsForIntent(intentResult.intent, player.role)
      : Promise.resolve(null),
    loadSystemStateBrief(janusState),
  ]);

  const resolveInput: ResolveInput = {
    intentResult,
    sessionState,
    requiresSynthesis,
    playerRole: player.role,
    fullLlmBudgetExceeded: isFullLlmBudgetExceeded(player.id),
    fragmentsByPoolType,
    policy,
    slots,
    systemStateBrief,
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
      const ragOutcome = await searchUnlockedMaterials(
        playerMessage,
        unlockedModuleKeys,
        player.role,
      );

      // Вопрос попал в мёртвый сегмент памяти: детерминированный ответ MEMORY_LOST без
      // вызова провайдера — по тому же паттерну перехвата, что тумблер «Use LLM» выше
      // (ТЗ 1.3; перехват в роуте, а не в resolveResponse, потому что RAG вызывается
      // только здесь — см. тех.описание реализации).
      if (ragOutcome.kind === "lost") {
        handledByLayer = "DETERMINISTIC";
        escalationReason = "memory_lost";
        aiText = pickFragment(MEMORY_LOST_FRAGMENTS, slots);
      } else {
        const history = recentHistory.reverse().map((m) => ({
          role: m.role === "PLAYER" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        }));

        const prompt = buildPrompt(resolution.task, {
          mode: "full",
          role: player.role,
          currentMessage: playerMessage,
          history,
          ragResults: ragOutcome.results,
        });
        const startedAt = Date.now();
        const result = await getLlmProvider().generate(prompt);
        aiText = applyGuards(result.text, resolution.task);
        llmUsage = { ...result.usage, model: result.model, latencyMs: Date.now() - startedAt };

        // Счётчик спасённого (2.6): попадание сегмента в RAG-контекст ответа full_llm —
        // засчитанный контакт игрока с содержимым, наравне с полным открытием файла
        // (app/api/terminal/files/[id]/open).
        for (const hit of ragOutcome.results) {
          if (hit.segmentId) await recordSegmentWitness(hit.segmentId, player.id, virtualNow);
        }
      }
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
        policy: {
          stage: policy.stage,
          maxLayer: policy.maxLayer,
          replyDelayMs: policy.replyDelayMs,
        },
        session: {
          desyncScore: resolution.stateUpdate.desyncScore,
          lastConfidenceTier: resolution.stateUpdate.lastConfidenceTier,
          disposition: resolution.stateUpdate.disposition,
          activeContext: sessionState.activeContext,
        },
      }
    : undefined;

  // replyDelayMs — диегетика очереди (M 0.7-1.0): клиент чата держит индикатор обработки
  // указанное время перед показом ответа (app/terminal/chat/chat-client.tsx).
  return NextResponse.json({
    sessionId: session.id,
    message: aiText,
    replyDelayMs: policy.replyDelayMs,
    debug,
  });
}
