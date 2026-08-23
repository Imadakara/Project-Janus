import type { MessageLayer } from "@/app/generated/prisma/client";
import { DESYNC_FULL_LLM_MIN, DESYNC_LIGHT_LLM_MIN } from "./thresholds";
import type { EscalationReason } from "./types";

export type DebugExplainInput = {
  handledByLayer: MessageLayer;
  matchedIntent: string | null;
  intentConfidence: number | null;
  escalationReason: EscalationReason | null;
  // null — историческое сообщение, загруженное со страницы: desyncScore не персистится
  // по-сообщённо (см. ChatSession), доступен только для хода в текущей живой сессии.
  desyncScore: number | null;
  // Стадия политики деградации на этот ход (lib/janus/degradation.ts); undefined/null —
  // историческое сообщение или ход до Фазы 1.
  policyStage?: string | null;
};

function formatConfidence(confidence: number | null): string {
  return confidence != null ? confidence.toFixed(2) : "—";
}

function formatDesync(desyncScore: number | null): string {
  return desyncScore != null ? String(desyncScore) : "н/д";
}

// Человекочитаемое объяснение хода ИИ, встраиваемое прямо в реплику бота в дебаг-режиме (и, в
// случае блокировки тумблером «Use LLM», как единственный реальный текст ответа бота) — см.
// app/api/chat/route.ts и app/terminal/chat/chat-client.tsx.
export function explainTurn(input: DebugExplainInput): string {
  const { handledByLayer, matchedIntent, intentConfidence, escalationReason, desyncScore } = input;
  const desync = formatDesync(desyncScore);

  switch (escalationReason) {
    case "desync_full_budget_exceeded":
      return (
        `Сработал бы триггер эскалации до FULL_LLM (desyncScore=${desync} ≥ ${DESYNC_FULL_LLM_MIN}), ` +
        `но часовой бюджет LLM-вызовов для игрока исчерпан — выдан канонический отказ вместо реальной эскалации.`
      );
    case "desync_light":
      return (
        `Эскалация до Слоя 3 (light-режим): desyncScore=${desync} ≥ ${DESYNC_LIGHT_LLM_MIN}. ` +
        `Ответ сгенерирован LLM по облегчённому промпту без истории диалога.`
      );
    case "desync_full":
      return (
        `Эскалация до Слоя 3 (full-режим): desyncScore=${desync} ≥ ${DESYNC_FULL_LLM_MIN}. ` +
        `Ответ сгенерирован LLM с учётом истории диалога и результатов поиска по разблокированным материалам (RAG).`
      );
    case "desync_light_blocked_toggle":
      return (
        `[РЕЖИМ ОТЛАДКИ] Триггер эскалации в LIGHT_LLM сработал (desyncScore=${desync} ≥ ${DESYNC_LIGHT_LLM_MIN}), ` +
        `но переключатель «Use LLM» в панели отладки выключен — вызов LLM заблокирован, показан этот текст вместо реального ответа модели.`
      );
    case "desync_full_blocked_toggle":
      return (
        `[РЕЖИМ ОТЛАДКИ] Триггер эскалации в FULL_LLM сработал (desyncScore=${desync} ≥ ${DESYNC_FULL_LLM_MIN}), ` +
        `но переключатель «Use LLM» в панели отладки выключен — вызов LLM заблокирован, показан этот текст вместо реального ответа модели.`
      );
    case "degradation_cap":
      return (
        `Эскалация до LLM перехвачена политикой деградации (desyncScore=${desync}): запас мощности ` +
        `ниже потолка слоя — выдан детерминированный отказ из пула деградации, провайдер не вызывался.`
      );
    case "subsystem_down":
      return (
        `Подсистема intent'а «${matchedIntent ?? "—"}» погашена политикой деградации — ` +
        `ответ взят из пула DEGRADED.`
      );
    case "coma":
      return (
        `Кома (computeMargin < 0.2): ход перехвачен до классификации intent'а, отвечает ` +
        `фиксированный пул комы. Состояние сессии не изменялось.`
      );
    case "memory_lost":
      return (
        `Семантический поиск попал в МЁРТВЫЙ сегмент памяти — контент необратимо утрачен, ` +
        `выдан детерминированный ответ MEMORY_LOST без вызова провайдера.`
      );
    case "desync_full_forced_debug":
      return (
        `[РЕЖИМ ОТЛАДКИ] Слой 3 (full-режим) вызван принудительно тумблером «Форсировать Слой 3» ` +
        `в панели отладки — порог desyncScore=${desync} ≥ ${DESYNC_FULL_LLM_MIN} не проверялся.`
      );
    case "local_llm_timeout":
      return (
        `Локальная LLM не ответила за отведённый лимит (60000 мс) — показана техническая ` +
        `заглушка вместо реального ответа модели.`
      );
    case null:
    case undefined:
      break;
  }

  if (handledByLayer === "DETERMINISTIC" && matchedIntent !== null) {
    return (
      `Детерминированный ответ: совпадение с intent «${matchedIntent}» (confidence=${formatConfidence(intentConfidence)}), ` +
      `desyncScore=${desync} — порог эскалации не достигнут.`
    );
  }

  return (
    `Детерминированный fallback-ответ: intent не распознан (confidence=${formatConfidence(intentConfidence)}), ` +
    `desyncScore=${desync} — использован общий шаблон ответа.`
  );
}

// Компактная строка сырых полей для встраивания в реплику вместе с explainTurn(...) —
// «насыщает» ответ ИИ техническими подробностями прямо в ленте диалога, без отдельного
// дублирующего лога.
export function formatTurnTag(input: DebugExplainInput): string {
  const { handledByLayer, matchedIntent, intentConfidence, escalationReason, desyncScore } = input;
  return (
    `LAYER=${handledByLayer} intent=${matchedIntent ?? "—"} conf=${formatConfidence(intentConfidence)} ` +
    `desync=${formatDesync(desyncScore)} escalation=${escalationReason ?? "—"} policy=${input.policyStage ?? "—"}`
  );
}

export function isBlockedByToggle(escalationReason: string | null | undefined): boolean {
  return (
    escalationReason === "desync_light_blocked_toggle" ||
    escalationReason === "desync_full_blocked_toggle"
  );
}
