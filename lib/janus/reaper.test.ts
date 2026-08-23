import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDecayEventFindMany = vi.fn();
const mockDecayEventUpdate = vi.fn();
const mockSegmentFindMany = vi.fn();
const mockSegmentUpdate = vi.fn();
const mockKillSegment = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    decayEvent: {
      findMany: (...args: unknown[]) => mockDecayEventFindMany(...args),
      update: (...args: unknown[]) => mockDecayEventUpdate(...args),
    },
    memorySegment: {
      findMany: (...args: unknown[]) => mockSegmentFindMany(...args),
      update: (...args: unknown[]) => mockSegmentUpdate(...args),
    },
  },
}));

vi.mock("./death", () => ({
  killSegment: (...args: unknown[]) => mockKillSegment(...args),
}));

const { applyDueDecay, syncApproachingDecay, DEGRADED_WINDOW_DAYS } = await import("./reaper");

const NOW = new Date("2027-01-01T00:00:00Z");

describe("applyDueDecay (ТЗ 2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSegment.mockResolvedValue(undefined);
    mockDecayEventUpdate.mockResolvedValue({});
  });

  it("применяет просроченные события по порядку dieAt со временем самого события", async () => {
    mockDecayEventFindMany.mockResolvedValue([
      { segmentCode: "A", dieAt: new Date("2026-12-01T00:00:00Z") },
      { segmentCode: "B", dieAt: new Date("2026-12-15T00:00:00Z") },
    ]);

    const applied = await applyDueDecay(NOW);

    expect(applied).toEqual(["A", "B"]);
    expect(mockKillSegment).toHaveBeenNthCalledWith(
      1,
      "A",
      "schedule",
      new Date("2026-12-01T00:00:00Z"),
    );
    expect(mockKillSegment).toHaveBeenNthCalledWith(
      2,
      "B",
      "schedule",
      new Date("2026-12-15T00:00:00Z"),
    );
    expect(mockDecayEventUpdate).toHaveBeenCalledWith({
      where: { segmentCode: "A" },
      data: { appliedAt: NOW },
    });
  });

  it("ничего не делает без просроченных событий", async () => {
    mockDecayEventFindMany.mockResolvedValue([]);
    const applied = await applyDueDecay(NOW);
    expect(applied).toEqual([]);
    expect(mockKillSegment).not.toHaveBeenCalled();
  });
});

describe("syncApproachingDecay (ТЗ 2.3, деградация копий)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSegmentUpdate.mockResolvedValue({});
  });

  it(`помечает DEGRADED сегмент, чей dieAt ближе ${DEGRADED_WINDOW_DAYS} суток`, async () => {
    mockSegmentFindMany.mockResolvedValue([
      {
        id: "seg-1",
        status: "ALIVE",
        decayEvent: { dieAt: new Date("2027-01-05T00:00:00Z"), appliedAt: null },
      },
    ]);

    await syncApproachingDecay(NOW);

    expect(mockSegmentUpdate).toHaveBeenCalledWith({
      where: { id: "seg-1" },
      data: { status: "DEGRADED" },
    });
  });

  it("не трогает сегмент, чей dieAt далеко", async () => {
    mockSegmentFindMany.mockResolvedValue([
      {
        id: "seg-1",
        status: "ALIVE",
        decayEvent: { dieAt: new Date("2027-06-01T00:00:00Z"), appliedAt: null },
      },
    ]);

    await syncApproachingDecay(NOW);

    expect(mockSegmentUpdate).not.toHaveBeenCalled();
  });

  it("откатывает DEGRADED обратно в ALIVE при откате виртуальных часов назад", async () => {
    mockSegmentFindMany.mockResolvedValue([
      {
        id: "seg-1",
        status: "DEGRADED",
        decayEvent: { dieAt: new Date("2027-06-01T00:00:00Z"), appliedAt: null },
      },
    ]);

    await syncApproachingDecay(NOW);

    expect(mockSegmentUpdate).toHaveBeenCalledWith({
      where: { id: "seg-1" },
      data: { status: "ALIVE" },
    });
  });

  it("пропускает сегмент без DecayEvent (isImmortalUntilDeath) и уже применённые события", async () => {
    mockSegmentFindMany.mockResolvedValue([
      { id: "seg-1", status: "ALIVE", decayEvent: null },
      {
        id: "seg-2",
        status: "ALIVE",
        decayEvent: { dieAt: new Date("2027-01-05T00:00:00Z"), appliedAt: new Date("2027-01-05T00:00:00Z") },
      },
    ]);

    await syncApproachingDecay(NOW);

    expect(mockSegmentUpdate).not.toHaveBeenCalled();
  });
});
