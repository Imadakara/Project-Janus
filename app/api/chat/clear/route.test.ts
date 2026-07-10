import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockGetOrCreateActiveSession = vi.fn();
const mockDeleteMany = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn((ops: unknown[]) => Promise.all(ops));

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(args[0] as unknown[]),
    chatMessage: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    chatSession: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/lib/chat/session", () => ({
  getOrCreateActiveSession: (...args: unknown[]) => mockGetOrCreateActiveSession(...args),
}));

const { POST } = await import("./route");

const PLAYER = { id: "player-1", role: "TECHNICIAN", isDebug: true };
const SESSION = { id: "session-1" };

describe("POST /api/chat/clear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue(PLAYER);
    mockGetOrCreateActiveSession.mockResolvedValue(SESSION);
    mockDeleteMany.mockResolvedValue({ count: 0 });
    mockUpdate.mockResolvedValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-debug player", async () => {
    mockGetCurrentPlayer.mockResolvedValue({ ...PLAYER, isDebug: false });
    const res = await POST();
    expect(res.status).toBe(403);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes messages and resets scenario state for a debug player", async () => {
    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessionId).toBe(SESSION.id);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION.id } });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: SESSION.id },
      data: {
        disposition: { trust: 0, tension: 0 },
        activeContext: null,
        shortTermMemory: [],
        intentRepeatCount: {},
        desyncScore: 0,
        lastConfidenceTier: null,
      },
    });
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});
