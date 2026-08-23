import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockRecomputeDerivedState = vi.fn();
const mockSegmentFindMany = vi.fn();
const mockLedgerFindMany = vi.fn();
const mockLedgerCount = vi.fn();
const mockNow = vi.fn();
const mockApplyDueDecay = vi.fn();
const mockSyncApproachingDecay = vi.fn();
const mockGetSalvageState = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/janus/state", () => ({
  recomputeDerivedState: (...args: unknown[]) => mockRecomputeDerivedState(...args),
}));

vi.mock("@/lib/janus/clock", () => ({
  now: (...args: unknown[]) => mockNow(...args),
}));

vi.mock("@/lib/janus/reaper", () => ({
  applyDueDecay: (...args: unknown[]) => mockApplyDueDecay(...args),
  syncApproachingDecay: (...args: unknown[]) => mockSyncApproachingDecay(...args),
}));

vi.mock("@/lib/janus/salvage", () => ({
  getSalvageState: (...args: unknown[]) => mockGetSalvageState(...args),
}));

// Один и тот же mockSegmentFindMany обслуживает и CORE-сегменты, и DEGRADED-сегменты —
// маршрут вызывает findMany дважды с разными where, поэтому тесты задают mockImplementation,
// а не единый mockResolvedValue, там где обе выборки важны одновременно.
vi.mock("@/lib/db", () => ({
  prisma: {
    memorySegment: { findMany: (...args: unknown[]) => mockSegmentFindMany(...args) },
    lossLedgerEntry: {
      findMany: (...args: unknown[]) => mockLedgerFindMany(...args),
      count: (...args: unknown[]) => mockLedgerCount(...args),
    },
  },
}));

const { GET } = await import("./route");

const STATE = {
  computeMargin: 0.92,
  computeMarginOverride: false,
  integrityIndex: 0.9,
  subsystems: { ANALYTICS: "UP", PLANNING: "UP", ARCHIVE: "UP", COMMS: "UP" },
  forecastDeathAt: new Date("2027-07-27T03:47:00Z"),
  forecastP10At: null,
  lambdaEstimate: 1 / 60,
  updatedAt: new Date("2027-01-01T00:00:00Z"),
};

describe("GET /api/terminal/vitals (Фаза 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue({ id: "player-1", role: "ARCHIVIST" });
    mockNow.mockResolvedValue(new Date("2027-01-01T00:00:00Z"));
    mockApplyDueDecay.mockResolvedValue([]);
    mockSyncApproachingDecay.mockResolvedValue(undefined);
    mockRecomputeDerivedState.mockResolvedValue(STATE);
    mockSegmentFindMany.mockResolvedValue([
      { code: "JEZGRO-01", title: "Ядро", status: "ALIVE", sharesAlive: 30, sharesTarget: 30, k: 5 },
    ]);
    mockLedgerFindMany.mockResolvedValue([]);
    mockLedgerCount.mockResolvedValue(0);
    mockGetSalvageState.mockResolvedValue({ total: 4, salvaged: 1, percent: 0.25 });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("догоняет расписание и синхронизирует деградацию перед каждым чтением", async () => {
    await GET();
    expect(mockApplyDueDecay).toHaveBeenCalledWith(new Date("2027-01-01T00:00:00Z"));
    expect(mockSyncApproachingDecay).toHaveBeenCalledWith(new Date("2027-01-01T00:00:00Z"));
  });

  it("отдаёт фиксированный отсчёт вместо прогноза", async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.countdown.deathAt).toBe("2027-07-27T03:47:00.000Z");
    expect(data.countdown.remainingMs).toBeGreaterThan(0);
    expect(data.countdown.isDead).toBe(false);
    expect(data.countdown.coreDead).toBe(false);
    expect(data.forecast).toBeUndefined();
  });

  it("мёртвый CORE-сегмент даёт coreDead: true", async () => {
    mockSegmentFindMany.mockImplementation(({ where }: { where?: { status?: string } } = {}) =>
      where?.status === "DEGRADED"
        ? Promise.resolve([])
        : Promise.resolve([
            { code: "JEZGRO-01", title: "Ядро", status: "DEAD", sharesAlive: 0, sharesTarget: 30, k: 5 },
          ]),
    );

    const res = await GET();
    const data = await res.json();

    expect(data.countdown.coreDead).toBe(true);
  });

  it("отдаёт долю спасённого и число утрат", async () => {
    mockLedgerCount.mockResolvedValue(2);

    const res = await GET();
    const data = await res.json();

    expect(data.salvage).toEqual({ total: 4, salvaged: 1, percent: 0.25 });
    expect(data.lossCount).toBe(2);
  });

  it("сортирует ближайшие DEGRADED-сегменты по dieAt", async () => {
    mockSegmentFindMany.mockImplementation(({ where }: { where?: { status?: string } } = {}) =>
      where?.status === "DEGRADED"
        ? Promise.resolve([
            {
              code: "B",
              title: "Б",
              decayEvent: { dieAt: new Date("2027-02-01T00:00:00Z") },
            },
            {
              code: "A",
              title: "А",
              decayEvent: { dieAt: new Date("2027-01-05T00:00:00Z") },
            },
          ])
        : Promise.resolve([]),
    );

    const res = await GET();
    const data = await res.json();

    expect(data.degradingSegments.map((s: { code: string }) => s.code)).toEqual(["A", "B"]);
  });
});
