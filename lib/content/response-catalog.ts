// Чистый строитель единого справочника всех детерминированных реплик ЯНУСа (DETERMINISTIC-слой
// диалога) — из content/response-pools.json и «глобальных» пулов, живущих константами в коде
// (lib/scenario/refusal-fragments.ts, lib/scenario/resolve.ts, lib/ai/guards.ts). Пользователь не
// понимал, где вообще искать все реплики и как их редактировать — этот модуль (+ тонкий CLI
// scripts/export-response-catalog.ts) даёт один файл-обзор со ссылкой на источник каждой строки.
// DB-free, без побочных эффектов — тестируется без Prisma (см. конвенцию lib/modules/access.ts).

export type CatalogRow = {
  // Куда идти редактировать эту конкретную строку.
  sourceFile: string;
  // intentCode для пер-интентных пулов ИЛИ фиксированное имя глобального пула/константы.
  category: string;
  // NORMAL/REPEATED/DEGRADED/EMERGENCY для пер-интентных пулов, null для глобальных констант.
  poolType: string | null;
  // Человекочитаемое описание, когда ЯНУС реально скажет именно эту строку.
  whenUsed: string;
  // Код роли, требуемой ResponsePool.requiredRole, или null — доступно любой роли.
  requiredRole: string | null;
  // Сам текст фрагмента, как он есть в источнике (с [TODO:...]-префиксом, если черновой).
  text: string;
  // Имена {{slotName}}-плейсхолдеров, найденные в тексте (lib/scenario/fragments.ts).
  slotsUsed: string[];
  // true, если текст помечен как черновой (см. isDraftText) — ещё не финальный текст от
  // нарративного дизайнера.
  isDraft: boolean;
  // true — не диегетическая реплика ЯНУСа, а техническая заглушка (не отдавать нарративному
  // дизайнеру как материал для правки тона/лора).
  isTechnical: boolean;
};

export type SlotReferenceRow = {
  name: string;
  sourceFile: string;
  description: string;
};

const DRAFT_MARKER = "TODO: заменить финальным текстом от нарративного дизайнера";

export function isDraftText(text: string): boolean {
  return text.includes(DRAFT_MARKER);
}

export function extractSlots(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
    found.add(match[1]);
  }
  return Array.from(found);
}

// Тип содержимого content/response-pools.json (см. prisma/seed.ts для того же контракта).
export type ResponsePoolEntry = {
  intentCode: string;
  type: "NORMAL" | "REPEATED" | "DEGRADED" | "EMERGENCY";
  requiredRole: string | null;
  fragments: string[];
};

const POOL_TYPE_EXPLANATION: Record<ResponsePoolEntry["type"], string> = {
  NORMAL:
    "Обычный уверенный ответ по этому intent'у (desyncScore ниже порогов эскалации, вопрос не повторялся 3+ раза подряд).",
  REPEATED:
    "Тот же intent распознан 3-й раз подряд в сессии (INTENT_REPEAT_THRESHOLD, lib/scenario/thresholds.ts).",
  DEGRADED:
    "Подсистема этого intent'а погашена политикой деградации (computeMargin 0.4–0.7) — либо тот же пул использован как деградированный отказ при потолке эскалации.",
  EMERGENCY:
    "Аварийный режим (computeMargin 0.2–0.4) — обычный детерминированный ответ заменяется аварийным, либо потолок эскалации сработал в аварийном режиме.",
};

// Глобальные (не пер-интентные) пулы — источник lib/scenario/refusal-fragments.ts +
// module-private константы lib/scenario/resolve.ts, экспортированные специально для этого
// каталога (см. комментарии на месте экспорта — не дублировать эти строки больше нигде).
export type GlobalFragmentSources = {
  memoryLost: string[];
  coma: string[];
  memoryLapse: string[];
  unrecognized: string[];
  budgetRefusal: string[];
};

const GLOBAL_FRAGMENT_META: Record<
  keyof GlobalFragmentSources,
  { category: string; sourceFile: string; whenUsed: string }
> = {
  memoryLost: {
    category: "MEMORY_LOST",
    sourceFile: "lib/scenario/refusal-fragments.ts",
    whenUsed:
      "Вопрос семантически попал в МЁРТВЫЙ сегмент памяти — RAG (lib/ai/rag.ts) вернул маркер утраты вместо результатов поиска.",
  },
  coma: {
    category: "COMA",
    sourceFile: "lib/scenario/refusal-fragments.ts",
    whenUsed:
      "Кома: computeMargin < 0.2. Перехватывается в app/api/chat/route.ts до классификации intent'а — генеративные слои недоступны вовсе.",
  },
  memoryLapse: {
    category: "MEMORY_LAPSE",
    sourceFile: "lib/scenario/refusal-fragments.ts",
    whenUsed:
      "«Провал» памяти: вероятностная замена обычного детерминированного ответа при деградации integrityIndex (policy.memoryLapseProbability, lib/janus/degradation.ts).",
  },
  unrecognized: {
    category: "UNRECOGNIZED",
    sourceFile: "lib/scenario/resolve.ts",
    whenUsed:
      "Fallback: intent не распознан вовсе, и для него нет ни одного подходящего пула фрагментов (или пул пуст).",
  },
  budgetRefusal: {
    category: "BUDGET_REFUSAL",
    sourceFile: "lib/scenario/resolve.ts",
    whenUsed:
      "Эскалация в FULL_LLM сработала бы, но часовой бюджет full_llm-вызовов игрока исчерпан (10/час, lib/ai/rate-limit.ts).",
  },
};

export type BuildCatalogInput = {
  // content/response-pools.json — { pools: ResponsePoolEntry[] }.
  responsePools: ResponsePoolEntry[];
  // code -> description из content/intents.json — обогащает category человекочитаемым
  // описанием темы, а не только opaque-кодом.
  intentDescriptions: Record<string, string>;
  globalFragments: GlobalFragmentSources;
  // lib/ai/guards.ts::DEFLECTION_FRAGMENT.
  deflectionFragment: string;
};

function buildRow(params: {
  sourceFile: string;
  category: string;
  poolType: string | null;
  whenUsed: string;
  requiredRole: string | null;
  text: string;
  isTechnical?: boolean;
}): CatalogRow {
  return {
    sourceFile: params.sourceFile,
    category: params.category,
    poolType: params.poolType,
    whenUsed: params.whenUsed,
    requiredRole: params.requiredRole,
    text: params.text,
    slotsUsed: extractSlots(params.text),
    isDraft: isDraftText(params.text),
    isTechnical: params.isTechnical ?? false,
  };
}

export function buildResponseCatalog(input: BuildCatalogInput): CatalogRow[] {
  const rows: CatalogRow[] = [];

  for (const pool of input.responsePools) {
    const description = input.intentDescriptions[pool.intentCode];
    const category = description ? `${pool.intentCode} — ${description}` : pool.intentCode;
    for (const text of pool.fragments) {
      rows.push(
        buildRow({
          sourceFile: "content/response-pools.json",
          category,
          poolType: pool.type,
          whenUsed: POOL_TYPE_EXPLANATION[pool.type],
          requiredRole: pool.requiredRole,
          text,
        }),
      );
    }
  }

  for (const key of Object.keys(GLOBAL_FRAGMENT_META) as Array<keyof GlobalFragmentSources>) {
    const meta = GLOBAL_FRAGMENT_META[key];
    for (const text of input.globalFragments[key]) {
      rows.push(
        buildRow({
          sourceFile: meta.sourceFile,
          category: meta.category,
          poolType: null,
          whenUsed: meta.whenUsed,
          requiredRole: null,
          text,
        }),
      );
    }
  }

  rows.push(
    buildRow({
      sourceFile: "lib/ai/guards.ts",
      category: "FORBIDDEN_TOPIC_DEFLECTION",
      poolType: null,
      whenUsed:
        "Ответ LLM (light_llm/full_llm) упомянул запрещённую тему из GenerationTask.forbiddenTopics — весь ответ целиком заменяется этой фразой (applyGuards), точечная редактура не делается намеренно.",
      requiredRole: null,
      text: input.deflectionFragment,
    }),
  );

  // Техническая заглушка таймаута локальной LLM (app/api/chat/route.ts) — не диегетика ЯНУСа,
  // а явно технический текст (пользователь видит его только в дебаг-режиме при тумблере
  // «Локальная LLM»). Строка продублирована здесь намеренно: route.ts — обработчик Next.js
  // роута, тянуть его как библиотечный модуль в скрипт (next/server, server-only и т.п.)
  // архитектурно неверно ради одной строки; при правке текста в route.ts проверить и это место.
  rows.push(
    buildRow({
      sourceFile: "app/api/chat/route.ts",
      category: "LOCAL_LLM_TIMEOUT",
      poolType: null,
      whenUsed:
        "[ТЕХНИЧЕСКОЕ, не диегетика] Локальный LLM-провайдер (дебаг-тумблер «Локальная LLM») не ответил за 60 секунд (LocalLlmTimeoutError, lib/ai/providers/local.ts).",
      requiredRole: null,
      text: "ОШИБКА. ПОПРОБУЙТЕ ЕЩЁ РАЗ.",
      isTechnical: true,
    }),
  );

  return rows;
}

// Полный реестр {{slotName}} — lib/janus/slots.ts::buildChatSlots/loadDynamicSlots — чтобы
// редактирующий текст видел, какие токены безопасно использовать. lib/scenario/fragments.ts
// оставляет нераспознанный {{slotName}} в тексте как есть (не вырезает и не пустует) — опечатка
// в имени слота молча утечёт в ответ игроку буквальной строкой "{{...}}".
const CSV_COLUMNS: Array<{ header: string; get: (row: CatalogRow) => string }> = [
  { header: "source_file", get: (r) => r.sourceFile },
  { header: "category", get: (r) => r.category },
  { header: "pool_type", get: (r) => r.poolType ?? "—" },
  { header: "required_role", get: (r) => r.requiredRole ?? "любая" },
  { header: "when_used", get: (r) => r.whenUsed },
  { header: "text", get: (r) => r.text },
  { header: "slots_used", get: (r) => r.slotsUsed.join(", ") },
  { header: "is_draft", get: (r) => (r.isDraft ? "да" : "нет") },
  { header: "is_technical", get: (r) => (r.isTechnical ? "да" : "нет") },
];

// Экранирование по RFC 4180: поле в кавычках, если содержит запятую/кавычку/перевод строки;
// внутренние кавычки удваиваются. BOM для Excel на Windows добавляет вызывающий скрипт при
// записи файла (это забота записи в файл, не построения строки) — см.
// scripts/export-response-catalog.ts.
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function toCsv(rows: CatalogRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const lines = rows.map((row) => CSV_COLUMNS.map((c) => csvEscape(c.get(row))).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

export const SLOTS_REFERENCE: SlotReferenceRow[] = [
  {
    name: "forecastDeathAt",
    sourceFile: "lib/janus/slots.ts",
    description:
      "Текущий прогноз отказа ядра (ДД.ММ.ГГГГ ЧЧ:ММ UTC) — гаснет при отказе ядра, в отличие от deathAt.",
  },
  {
    name: "integrityIndex",
    sourceFile: "lib/janus/slots.ts",
    description: "Целостность памяти в процентах, округлено.",
  },
  {
    name: "playerRole",
    sourceFile: "lib/janus/slots.ts",
    description: "Человекочитаемая метка роли текущего игрока (ROLE_LABELS).",
  },
  {
    name: "deathAt",
    sourceFile: "lib/janus/slots.ts",
    description: "Фиксированная дата смерти (календарь, не гаснет вместе с forecastDeathAt).",
  },
  {
    name: "remainingDays",
    sourceFile: "lib/janus/slots.ts",
    description: "Сколько дней осталось до deathAt, округлено вверх.",
  },
  {
    name: "salvagedPercent",
    sourceFile: "lib/janus/slots.ts",
    description: "Доля «спасённого» (засвидетельствованного) контента в процентах.",
  },
  {
    name: "lastLossTitle",
    sourceFile: "lib/janus/slots.ts",
    description:
      "Заголовок последней записи в Књиге губитака, либо заглушка «ПОТЕРЬ ПОКА НЕ БЫЛО».",
  },
  {
    name: "topPriorityTitles",
    sourceFile: "lib/janus/slots.ts",
    description: "2–3 названия сегментов с наивысшим приоритетом спасения через запятую.",
  },
];
