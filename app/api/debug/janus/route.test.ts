import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockGetSnapshot = vi.fn();
const mockSetComputeMargin = vi.fn();
const mockRecomputeDerivedState = vi.fn();
const mockKillSegment = vi.fn();
const mockTickChurn = vi.fn();
const mockGetJanusState = vi.fn();
const mockSegmentFindUnique = vi.fn();
const mockSegmentFindMany = vi.fn();
const mockSegmentUpdate = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/janus/debug-snapshot", () => ({
  getJanusDebugSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
}));

vi.mock("@/lib/janus/state", () => ({
  setComputeMargin: (...args: unknown[]) => mockSetComputeMargin(...args),
  recomputeDerivedState: (...args: unknown[]) => mockRecomputeDerivedState(...args),
  getJanusState: (...args: unknown[]) => mockGetJanusState(...args),
}));

vi.mock("@/lib/janus/death", () => ({
  killSegment: (...args: unknown[]) => mockKillSegment(...args),
}));

vi.mock("@/lib/janus/synthetic-churn", () => ({
  tickChurn: (...args: unknown[]) => mockTickChurn(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memorySegment: {
      findUnique: (...args: unknown[]) => mockSegmentFindUnique(...args),
      findMany: (...args: unknown[]) => mockSegmentFindMany(...args),
      update: (...args: unknown[]) => mockSegmentUpdate(...args),
    },
  },
}));

const { GET } = await import("./route");
const { POST: postCompute } = await import("./compute/route");
const { POST: postShares } = await import("./shares/route");
const { POST: postKill } = await import("./kill-segment/route");
const { POST: postChurn } = await import("./tick-churn/route");

const DEBUG_PLAYER = { id: "player-1", role: "ARCHIVIST", isDebug: true };
const SNAPSHOT = { state: { computeMargin: 1 }, segments: [] };

function jsonRequest(body: unknown) {
  return new Request("http://test", { method: "POST", body: JSON.stringify(body) });
}

describe("дебаг-роуты /api/debug/janus/*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue(DEBUG_PLAYER);
    mockGetSnapshot.mockResolvedValue(SNAPSHOT);
    mockSetComputeMargin.mockResolvedValue({});
    mockRecomputeDerivedState.mockResolvedValue({});
    mockKillSegment.mockResolvedValue(undefined);
    mockGetJanusState.mockResolvedValue({ lambdaEstimate: 1 / 60 });
    mockSegmentFindUnique.mockResolvedValue({
      id: "seg-1",
      code: "ARHIV-114",
      status: "ALIVE",
      k: 5,
      sharesAlive: 10,
    });
    mockSegmentFindMany.mockResolvedValue([]);
    mockSegmentUpdate.mockResolvedValue({});
  });

  it.each([
    ["GET /", () => GET()],
    ["POST /compute", () => postCompute(jsonRequest({ computeMargin: 0.5 }))],
    ["POST /shares", () => postShares(jsonRequest({ segmentCode: "X", delta: 1 }))],
    ["POST /kill-segment", () => postKill(jsonRequest({ segmentCode: "X" }))],
    ["POST /tick-churn", () => postChurn()],
  ])("%s: 401 без авторизации", async (_name, call) => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
  });

  it.each([
    ["GET /", () => GET()],
    ["POST /compute", () => postCompute(jsonRequest({ computeMargin: 0.5 }))],
    ["POST /shares", () => postShares(jsonRequest({ segmentCode: "X", delta: 1 }))],
    ["POST /kill-segment", () => postKill(jsonRequest({ segmentCode: "X" }))],
    ["POST /tick-churn", () => postChurn()],
  ])("%s: 403 для не-дебаг игрока", async (_name, call) => {
    mockGetCurrentPlayer.mockResolvedValue({ ...DEBUG_PLAYER, isDebug: false });
    const res = await call();
    expect(res.status).toBe(403);
  });

  it("GET отдаёт снапшот", async () => {
    const res = await GET();
    expect(await res.json()).toEqual(SNAPSHOT);
  });

  it("compute: зодовская валидация диапазона", async () => {
    const res = await postCompute(jsonRequest({ computeMargin: 5 }));
    expect(res.status).toBe(400);
    expect(mockSetComputeMargin).not.toHaveBeenCalled();
  });

  it("compute: устанавливает M и возвращает снапшот", async () => {
    const res = await postCompute(jsonRequest({ computeMargin: 0.3 }));
    expect(res.status).toBe(200);
    expect(mockSetComputeMargin).toHaveBeenCalledWith(0.3);
  });

  it("shares: прибавляет доли и пересчитывает прогноз", async () => {
    const res = await postShares(jsonRequest({ segmentCode: "ARHIV-114", delta: 2 }));
    expect(res.status).toBe(200);
    expect(mockSegmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sharesAlive: 12 } }),
    );
    expect(mockKillSegment).not.toHaveBeenCalled();
    expect(mockRecomputeDerivedState).toHaveBeenCalledOnce();
  });

  it("shares: падение ниже k убивает сегмент единственным штатным путём", async () => {
    mockSegmentFindUnique.mockResolvedValue({
      id: "seg-1",
      code: "ARHIV-114",
      status: "ALIVE",
      k: 5,
      sharesAlive: 5,
    });
    await postShares(jsonRequest({ segmentCode: "ARHIV-114", delta: -1 }));
    expect(mockKillSegment).toHaveBeenCalledWith("ARHIV-114", "shares_below_threshold");
  });

  it("shares: мёртвому сегменту доли не возвращаются (409)", async () => {
    mockSegmentFindUnique.mockResolvedValue({
      id: "seg-1",
      code: "ARHIV-114",
      status: "DEAD",
      k: 5,
      sharesAlive: 0,
    });
    const res = await postShares(jsonRequest({ segmentCode: "ARHIV-114", delta: 5 }));
    expect(res.status).toBe(409);
    expect(mockSegmentUpdate).not.toHaveBeenCalled();
  });

  it("kill-segment: 404 для неизвестного кода", async () => {
    mockSegmentFindUnique.mockResolvedValue(null);
    const res = await postKill(jsonRequest({ segmentCode: "NEMA-0" }));
    expect(res.status).toBe(404);
    expect(mockKillSegment).not.toHaveBeenCalled();
  });

  it("kill-segment: вызывает killSegment с причиной по умолчанию", async () => {
    await postKill(jsonRequest({ segmentCode: "ARHIV-114" }));
    expect(mockKillSegment).toHaveBeenCalledWith("ARHIV-114", "debug_kill");
  });

  it("tick-churn: живые сегменты чурнятся, упавшие ниже k умирают через killSegment", async () => {
    mockSegmentFindMany.mockResolvedValue([
      { id: "seg-1", code: "ZDRAV-1", status: "ALIVE", k: 5, sharesAlive: 10 },
      { id: "seg-2", code: "SLAB-2", status: "ALIVE", k: 5, sharesAlive: 5 },
    ]);
    mockTickChurn.mockReturnValueOnce(9).mockReturnValueOnce(4);

    const res = await postChurn();

    expect(res.status).toBe(200);
    expect(mockSegmentUpdate).toHaveBeenCalledTimes(2);
    expect(mockKillSegment).toHaveBeenCalledOnce();
    expect(mockKillSegment).toHaveBeenCalledWith("SLAB-2", "churn");
    expect(mockRecomputeDerivedState).toHaveBeenCalled();
  });
});
