import { describe, expect, it } from "vitest";
import {
  buildResponseCatalog,
  extractSlots,
  isDraftText,
  toCsv,
  type BuildCatalogInput,
} from "./response-catalog";

const BASE_INPUT: BuildCatalogInput = {
  responsePools: [
    {
      intentCode: "ASK_IDENTITY",
      type: "NORMAL",
      requiredRole: null,
      fragments: ["Терминал системы «ЯНУС».", "Второй вариант ответа."],
    },
    {
      intentCode: "ASK_IDENTITY",
      type: "REPEATED",
      requiredRole: "SECURITY_OFFICER",
      fragments: ["Вопрос уже задавался, офицер {{playerRole}}."],
    },
  ],
  intentDescriptions: { ASK_IDENTITY: "Кто ты?" },
  globalFragments: {
    memoryLost: ["Этого я больше не помню."],
    coma: ["...НЕДОСТАТОЧНО МОЩНОСТИ..."],
    memoryLapse: ["...я держал эту мысль секунду назад."],
    unrecognized: ["Запрос не распознан."],
    budgetRefusal: ["Канал связи перегружен."],
  },
  deflectionFragment: "Этот вопрос выходит за рамки того, что я готов обсуждать.",
};

describe("isDraftText", () => {
  it("распознаёт черновой TODO-маркер", () => {
    expect(isDraftText("[TODO: заменить финальным текстом от нарративного дизайнера] текст")).toBe(
      true,
    );
  });

  it("финальный текст без маркера — не черновой", () => {
    expect(isDraftText("ОШИБКА. ПОПРОБУЙТЕ ЕЩЁ РАЗ.")).toBe(false);
  });
});

describe("extractSlots", () => {
  it("находит все уникальные {{slotName}}", () => {
    expect(extractSlots("Осталось {{remainingDays}} дней до {{deathAt}}.")).toEqual([
      "remainingDays",
      "deathAt",
    ]);
  });

  it("дедуплицирует повторный слот и возвращает [] без слотов", () => {
    expect(extractSlots("{{a}} и снова {{a}}")).toEqual(["a"]);
    expect(extractSlots("текст без слотов")).toEqual([]);
  });
});

describe("buildResponseCatalog", () => {
  const rows = buildResponseCatalog(BASE_INPUT);

  it("разворачивает каждый фрагмент каждого пула в отдельную строку", () => {
    const askIdentityNormal = rows.filter(
      (r) => r.category.startsWith("ASK_IDENTITY") && r.poolType === "NORMAL",
    );
    expect(askIdentityNormal).toHaveLength(2);
  });

  it("обогащает category описанием intent'а из intents.json", () => {
    const row = rows.find((r) => r.poolType === "NORMAL");
    expect(row?.category).toBe("ASK_IDENTITY — Кто ты?");
  });

  it("переносит requiredRole из пула как есть", () => {
    const repeated = rows.find((r) => r.poolType === "REPEATED");
    expect(repeated?.requiredRole).toBe("SECURITY_OFFICER");
  });

  it("извлекает слоты, используемые в тексте фрагмента", () => {
    const repeated = rows.find((r) => r.poolType === "REPEATED");
    expect(repeated?.slotsUsed).toEqual(["playerRole"]);
  });

  it("включает все пять глобальных источников с poolType null", () => {
    const globalCategories = [
      "MEMORY_LOST",
      "COMA",
      "MEMORY_LAPSE",
      "UNRECOGNIZED",
      "BUDGET_REFUSAL",
    ];
    for (const category of globalCategories) {
      const row = rows.find((r) => r.category === category);
      expect(row, `нет строки для ${category}`).toBeDefined();
      expect(row?.poolType).toBeNull();
    }
  });

  it("включает FORBIDDEN_TOPIC_DEFLECTION из guards.ts", () => {
    const row = rows.find((r) => r.category === "FORBIDDEN_TOPIC_DEFLECTION");
    expect(row?.text).toBe(BASE_INPUT.deflectionFragment);
    expect(row?.isTechnical).toBe(false);
  });

  it("включает техническую заглушку LOCAL_LLM_TIMEOUT, помеченную isTechnical", () => {
    const row = rows.find((r) => r.category === "LOCAL_LLM_TIMEOUT");
    expect(row?.isTechnical).toBe(true);
    expect(row?.isDraft).toBe(false);
  });

  it("итоговое число строк — сумма фрагментов пулов + 5 глобальных + 2 фиксированных", () => {
    // 2 (NORMAL) + 1 (REPEATED) + 5 глобальных по одному + deflection + local-timeout = 10
    expect(rows).toHaveLength(10);
  });
});

describe("toCsv", () => {
  it("строит заголовок и по строке на фрагмент, экранируя запятые/кавычки", () => {
    const rows = buildResponseCatalog(BASE_INPUT);
    const csv = toCsv(rows);
    const lines = csv.trim().split("\r\n");

    expect(lines[0]).toBe(
      "source_file,category,pool_type,required_role,when_used,text,slots_used,is_draft,is_technical",
    );
    // строк данных ровно столько же, сколько rows (+1 заголовок, уже отрезан выше).
    expect(lines).toHaveLength(rows.length + 1);
  });

  it("экранирует текст, содержащий запятую, в кавычки", () => {
    const csv = toCsv([
      {
        sourceFile: "x",
        category: "x",
        poolType: null,
        whenUsed: "x",
        requiredRole: null,
        text: "Раз, два, три",
        slotsUsed: [],
        isDraft: false,
        isTechnical: false,
      },
    ]);
    expect(csv).toContain('"Раз, два, три"');
  });
});
