import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockClearOverride = vi.fn();
const mockGetSnapshot = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/janus/state", () => ({
  clearComputeMarginOverride: (...args: unknown[]) => mockClearOverride(...args),
}));

vi.mock("@/lib/janus/debug-snapshot", () => ({
  getJanusDebugSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
}));

const { POST } = await import("./route");

describe("POST /api/debug/janus/compute/clear (ТЗ 2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue({ id: "player-1", isDebug: true });
    mockClearOverride.mockResolvedValue({});
    mockGetSnapshot.mockResolvedValue({ state: {}, segments: [] });
  });

  it("401 без авторизации", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("403 для не-дебаг игрока", async () => {
    mockGetCurrentPlayer.mockResolvedValue({ id: "player-1", isDebug: false });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("снимает override и возвращает снапшот", async () => {
    const res = await POST();
    expect(mockClearOverride).toHaveBeenCalledOnce();
    expect(await res.json()).toEqual({ state: {}, segments: [] });
  });
});
