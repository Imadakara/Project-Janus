import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockGetJanusState = vi.fn();
const mockRecomputeDerivedState = vi.fn();
const mockSegmentFindMany = vi.fn();
const mockLedgerFindMany = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/janus/state", () => ({
  getJanusState: (...args: unknown[]) => mockGetJanusState(...args),
  recomputeDerivedState: (...args: unknown[]) => mockRecomputeDerivedState(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memorySegment: { findMany: (...args: unknown[]) => mockSegmentFindMany(...args) },
    lossLedgerEntry: { findMany: (...args: unknown[]) => mockLedgerFindMany(...args) },
  },
}));

const { GET } = await import("./route");

const FRESH_STATE = {
  computeMargin: 1.0,
  integrityIndex: 0.9,
  subsystems: { ANALYTICS: "UP", PLANNING: "UP", ARCHIVE: "UP", COMMS: "UP" },
  forecastDeathAt: new Date("2026-10-22T05:34:00Z"),
  forecastP10At: new Date("2026-09-29T14:23:00Z"),
  lambdaEstimate: 1 / 60,
  updatedAt: new Date(),
};

describe("GET /api/terminal/vitals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue({ id: "player-1", role: "ARCHIVIST" });
    mockGetJanusState.mockResolvedValue(FRESH_STATE);
    mockRecomputeDerivedState.mockResolvedValue(FRESH_STATE);
    mockSegmentFindMany.mockResolvedValue([
      {
        code: "JEZGRO-01",
        title: "Ядро",
        status: "ALIVE",
        sharesAlive: 30,
        sharesTarget: 30,
        k: 5,
      },
    ]);
    mockLedgerFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("отдаёт показатели, прогноз и CORE-сегменты без пересчёта при свежем состоянии", async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.computeMargin).toBe(1.0);
    expect(data.forecast.deathAt).toBe("2026-10-22T05:34:00.000Z");
    expect(data.forecast.coreDead).toBe(false);
    expect(data.coreSegments).toHaveLength(1);
    expect(mockRecomputeDerivedState).not.toHaveBeenCalled();
  });

  it("устаревшее состояние пересчитывается при чтении (recompute-on-read)", async () => {
    mockGetJanusState.mockResolvedValue({
      ...FRESH_STATE,
      updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    });

    await GET();

    expect(mockRecomputeDerivedState).toHaveBeenCalledOnce();
  });

  it("мёртвый CORE-сегмент даёт coreDead: true", async () => {
    mockSegmentFindMany.mockResolvedValue([
      { code: "JEZGRO-01", title: "Ядро", status: "DEAD", sharesAlive: 0, sharesTarget: 30, k: 5 },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(data.forecast.coreDead).toBe(true);
  });
});
