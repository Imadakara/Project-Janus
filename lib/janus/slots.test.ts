import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSalvageState = vi.fn();
const mockSegmentFindMany = vi.fn();
const mockLossLedgerFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    memorySegment: {
      findMany: (...args: unknown[]) => mockSegmentFindMany(...args),
    },
    lossLedgerEntry: {
      findFirst: (...args: unknown[]) => mockLossLedgerFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/janus/salvage", () => ({
  getSalvageState: (...args: unknown[]) => mockGetSalvageState(...args),
}));

const { buildChatSlots, loadDynamicSlots, formatTerminalDate } = await import("./slots");

const STATE = {
  computeMargin: 1,
  computeMarginOverride: false,
  integrityIndex: 0.75,
  subsystems: { ANALYTICS: "UP", PLANNING: "UP", ARCHIVE: "UP", COMMS: "UP" } as const,
  forecastDeathAt: new Date("2027-07-27T03:47:00Z"),
  forecastP10At: null,
  lambdaEstimate: 1 / 60,
  updatedAt: new Date("2027-01-01T00:00:00Z"),
};

describe("buildChatSlots (Фаза 2)", () => {
  it("отдаёт deathAt константой календаря и remainingDays от переданного now", () => {
    const slots = buildChatSlots(STATE, "TECHNICIAN", new Date("2027-07-17T03:47:00Z"));
    expect(slots.deathAt).toBe(formatTerminalDate(new Date("2027-07-27T03:47:00Z")));
    expect(slots.remainingDays).toBe("10");
  });

  it("forecastDeathAt гаснет независимо от deathAt при отказе ядра", () => {
    const slots = buildChatSlots(
      { ...STATE, forecastDeathAt: null },
      "TECHNICIAN",
      new Date("2027-07-17T03:47:00Z"),
    );
    expect(slots.forecastDeathAt).toBe("НЕ ОПРЕДЕЛЁН");
    expect(slots.deathAt).toBe(formatTerminalDate(new Date("2027-07-27T03:47:00Z")));
  });
});

describe("loadDynamicSlots (Фаза 2, 2.9/2.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("форматирует долю спасённого и последнюю утрату", async () => {
    mockGetSalvageState.mockResolvedValue({ total: 4, salvaged: 1, percent: 0.25 });
    mockLossLedgerFindFirst.mockResolvedValue({ title: "СЕГМЕНТ X" });
    mockSegmentFindMany.mockResolvedValue([]);

    const slots = await loadDynamicSlots();

    expect(slots.salvagedPercent).toBe("25%");
    expect(slots.lastLossTitle).toBe("СЕГМЕНТ X");
  });

  it("подставляет заглушку, если утрат ещё не было", async () => {
    mockGetSalvageState.mockResolvedValue({ total: 4, salvaged: 0, percent: 0 });
    mockLossLedgerFindFirst.mockResolvedValue(null);
    mockSegmentFindMany.mockResolvedValue([]);

    const slots = await loadDynamicSlots();

    expect(slots.lastLossTitle).toBe("ПОТЕРЬ ПОКА НЕ БЫЛО");
  });

  it("сортирует приоритеты по priority desc, затем по ближайшей dieAt, и берёт top-3", async () => {
    mockGetSalvageState.mockResolvedValue({ total: 5, salvaged: 0, percent: 0 });
    mockLossLedgerFindFirst.mockResolvedValue(null);
    mockSegmentFindMany.mockResolvedValue([
      { title: "НИЗКИЙ", priority: 0, decayEvent: { dieAt: new Date("2027-01-01") } },
      { title: "ВЫСОКИЙ-ПОЗЖЕ", priority: 5, decayEvent: { dieAt: new Date("2027-06-01") } },
      { title: "ВЫСОКИЙ-РАНЬШЕ", priority: 5, decayEvent: { dieAt: new Date("2027-02-01") } },
      { title: "СРЕДНИЙ", priority: 2, decayEvent: null },
      { title: "ЛИШНИЙ", priority: 0, decayEvent: null },
    ]);

    const slots = await loadDynamicSlots();

    expect(slots.topPriorityTitles).toBe("ВЫСОКИЙ-РАНЬШЕ, ВЫСОКИЙ-ПОЗЖЕ, СРЕДНИЙ");
  });

  it("подставляет заглушку, если всё уже вынесено", async () => {
    mockGetSalvageState.mockResolvedValue({ total: 4, salvaged: 4, percent: 1 });
    mockLossLedgerFindFirst.mockResolvedValue(null);
    mockSegmentFindMany.mockResolvedValue([]);

    const slots = await loadDynamicSlots();

    expect(slots.topPriorityTitles).toBe("ВСЁ ВАЖНОЕ УЖЕ ВЫНЕСЕНО");
  });
});
