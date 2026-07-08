import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockFindUnique = vi.fn();
const mockGetUnlockedModuleKeys = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    terminalFile: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/modules/unlocks", () => ({
  getUnlockedModuleKeys: (...args: unknown[]) => mockGetUnlockedModuleKeys(...args),
}));

vi.mock("@/lib/analytics/track", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const { POST } = await import("./route");

const PLAYER = { id: "player-1", role: "TECHNICIAN" };
const FILE = {
  id: "file-1",
  requiredModuleKey: "MAP_VIEWER",
  requiredModule: { key: "MAP_VIEWER" },
  fullContent: "СЕКРЕТНОЕ СОДЕРЖИМОЕ",
  visibleToRole: null,
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/terminal/files/[id]/open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue(PLAYER);
    mockFindUnique.mockResolvedValue(FILE);
  });

  it("denies access and logs an event when the module is not unlocked", async () => {
    mockGetUnlockedModuleKeys.mockResolvedValue(["FILE_MANAGER", "FILE_ANALYZER"]);

    const res = await POST(new Request("http://test"), makeParams("file-1"));
    const data = await res.json();

    expect(data.granted).toBe(false);
    expect(data.message).toContain("MAP_VIEWER");
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "FILE_OPEN_DENIED",
      "player-1",
      expect.objectContaining({ fileId: "file-1" }),
    );
  });

  it("grants access and returns full content when the module is unlocked", async () => {
    mockGetUnlockedModuleKeys.mockResolvedValue(["MAP_VIEWER"]);

    const res = await POST(new Request("http://test"), makeParams("file-1"));
    const data = await res.json();

    expect(data.granted).toBe(true);
    expect(data.content).toBe(FILE.fullContent);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no authenticated player", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);

    const res = await POST(new Request("http://test"), makeParams("file-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the file is not visible to the player's role", async () => {
    mockFindUnique.mockResolvedValue({ ...FILE, visibleToRole: "SECURITY_OFFICER" });
    mockGetUnlockedModuleKeys.mockResolvedValue(["MAP_VIEWER"]);

    const res = await POST(new Request("http://test"), makeParams("file-1"));
    expect(res.status).toBe(404);
  });
});
