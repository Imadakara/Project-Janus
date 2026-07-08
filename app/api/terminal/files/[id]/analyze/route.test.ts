import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
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
    playerFileAnalysis: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
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
  analysisSummary: "АНАЛИЗ: содержимое искажено.",
  visibleToRole: null,
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/terminal/files/[id]/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue(PLAYER);
    mockFindUnique.mockResolvedValue(FILE);
    mockUpsert.mockResolvedValue({});
  });

  it("returns 403 when FILE_ANALYZER is not unlocked", async () => {
    mockGetUnlockedModuleKeys.mockResolvedValue(["FILE_MANAGER"]);

    const res = await POST(new Request("http://test"), makeParams("file-1"));
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns the analysis summary and records the analysis when unlocked", async () => {
    mockGetUnlockedModuleKeys.mockResolvedValue(["FILE_ANALYZER"]);

    const res = await POST(new Request("http://test"), makeParams("file-1"));
    const data = await res.json();

    expect(data.summary).toBe(FILE.analysisSummary);
    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "FILE_ANALYZED",
      "player-1",
      expect.objectContaining({ fileId: "file-1" }),
    );
  });

  it("returns 404 when the file is not visible to the player's role", async () => {
    mockGetUnlockedModuleKeys.mockResolvedValue(["FILE_ANALYZER"]);
    mockFindUnique.mockResolvedValue({ ...FILE, visibleToRole: "ARCHIVIST" });

    const res = await POST(new Request("http://test"), makeParams("file-1"));
    expect(res.status).toBe(404);
  });
});
