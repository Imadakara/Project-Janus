import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockGetDebugTimeOffsetMs = vi.fn();
const mockSetDebugTimeOffsetMs = vi.fn();
const mockNow = vi.fn();
const mockApplyDueDecay = vi.fn();
const mockSyncApproachingDecay = vi.fn();
const mockRecomputeDerivedState = vi.fn();
const mockGetSnapshot = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/janus/clock", () => ({
  getDebugTimeOffsetMs: (...args: unknown[]) => mockGetDebugTimeOffsetMs(...args),
  setDebugTimeOffsetMs: (...args: unknown[]) => mockSetDebugTimeOffsetMs(...args),
  now: (...args: unknown[]) => mockNow(...args),
}));

vi.mock("@/lib/janus/reaper", () => ({
  applyDueDecay: (...args: unknown[]) => mockApplyDueDecay(...args),
  syncApproachingDecay: (...args: unknown[]) => mockSyncApproachingDecay(...args),
}));

vi.mock("@/lib/janus/state", () => ({
  recomputeDerivedState: (...args: unknown[]) => mockRecomputeDerivedState(...args),
}));

vi.mock("@/lib/janus/debug-snapshot", () => ({
  getJanusDebugSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
}));

const { POST } = await import("./route");

const DEBUG_PLAYER = { id: "player-1", isDebug: true };

function jsonRequest(body: unknown) {
  return new Request("http://test", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/debug/janus/time (ТЗ 2.11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue(DEBUG_PLAYER);
    mockGetDebugTimeOffsetMs.mockResolvedValue(0);
    mockSetDebugTimeOffsetMs.mockResolvedValue(undefined);
    mockNow.mockResolvedValue(new Date("2027-01-01T00:00:00Z"));
    mockApplyDueDecay.mockResolvedValue([]);
    mockSyncApproachingDecay.mockResolvedValue(undefined);
    mockRecomputeDerivedState.mockResolvedValue({});
    mockGetSnapshot.mockResolvedValue({ state: {}, segments: [] });
  });

  it("401 без авторизации", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await POST(jsonRequest({ action: "reset" }));
    expect(res.status).toBe(401);
  });

  it("403 для не-дебаг игрока", async () => {
    mockGetCurrentPlayer.mockResolvedValue({ id: "player-1", isDebug: false });
    const res = await POST(jsonRequest({ action: "reset" }));
    expect(res.status).toBe(403);
  });

  it("400 на некорректное тело", async () => {
    const res = await POST(jsonRequest({ action: "advance", deltaMs: "не число" }));
    expect(res.status).toBe(400);
    expect(mockSetDebugTimeOffsetMs).not.toHaveBeenCalled();
  });

  it("advance: прибавляет к текущему смещению", async () => {
    mockGetDebugTimeOffsetMs.mockResolvedValue(1000);
    await POST(jsonRequest({ action: "advance", deltaMs: 86_400_000 }));
    expect(mockSetDebugTimeOffsetMs).toHaveBeenCalledWith(86_401_000);
  });

  it("reset: сбрасывает смещение в 0", async () => {
    await POST(jsonRequest({ action: "reset" }));
    expect(mockSetDebugTimeOffsetMs).toHaveBeenCalledWith(0);
  });

  it("jumpToDeathMinus: целится в DEATH_AT минус margin от реального системного времени", async () => {
    const realNow = Date.now();
    await POST(jsonRequest({ action: "jumpToDeathMinus", marginMs: 60 * 60 * 1000 }));

    const [offsetMs] = mockSetDebugTimeOffsetMs.mock.calls[0];
    const deathAtMs = new Date("2027-07-27T03:47:00Z").getTime();
    const expectedOffset = deathAtMs - 60 * 60 * 1000 - realNow;
    // ±2с допуск на реальное время выполнения теста между Date.now() здесь и внутри роута.
    expect(Math.abs(offsetMs - expectedOffset)).toBeLessThan(2000);
  });

  it("после сдвига догоняет планировщик и возвращает дебаг-снапшот", async () => {
    const res = await POST(jsonRequest({ action: "reset" }));
    const data = await res.json();

    expect(mockApplyDueDecay).toHaveBeenCalledWith(new Date("2027-01-01T00:00:00Z"));
    expect(mockSyncApproachingDecay).toHaveBeenCalledWith(new Date("2027-01-01T00:00:00Z"));
    expect(mockRecomputeDerivedState).toHaveBeenCalledWith(new Date("2027-01-01T00:00:00Z"));
    expect(data).toEqual({ state: {}, segments: [] });
  });
});
