import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetJanusState = vi.fn();
const mockSegmentFindMany = vi.fn();
const mockGetDebugTimeOffsetMs = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    memorySegment: { findMany: (...args: unknown[]) => mockSegmentFindMany(...args) },
  },
}));

vi.mock("./state", () => ({
  getJanusState: (...args: unknown[]) => mockGetJanusState(...args),
}));

vi.mock("./clock", () => ({
  getDebugTimeOffsetMs: (...args: unknown[]) => mockGetDebugTimeOffsetMs(...args),
}));

const { getJanusDebugSnapshot } = await import("./debug-snapshot");

describe("getJanusDebugSnapshot (ТЗ 2.11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJanusState.mockResolvedValue({ computeMargin: 1 });
    mockSegmentFindMany.mockResolvedValue([]);
  });

  it("отдаёт смещение и производное виртуальное время", async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    mockGetDebugTimeOffsetMs.mockResolvedValue(dayMs);
    const before = Date.now();

    const snapshot = await getJanusDebugSnapshot();

    expect(snapshot.debugTimeOffsetMs).toBe(dayMs);
    const virtualNowMs = new Date(snapshot.virtualNow).getTime();
    expect(virtualNowMs).toBeGreaterThanOrEqual(before + dayMs);
    expect(virtualNowMs).toBeLessThanOrEqual(Date.now() + dayMs + 1000);
  });

  it("нулевое смещение → виртуальное время совпадает с системным", async () => {
    mockGetDebugTimeOffsetMs.mockResolvedValue(0);

    const snapshot = await getJanusDebugSnapshot();

    expect(Math.abs(new Date(snapshot.virtualNow).getTime() - Date.now())).toBeLessThan(1000);
  });
});
