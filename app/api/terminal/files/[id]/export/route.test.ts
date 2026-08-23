import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockFindUnique = vi.fn();
const mockGetUnlockedModuleKeys = vi.fn();
const mockTrackEvent = vi.fn();
const mockRecordSegmentWitness = vi.fn();
const mockNow = vi.fn();
const mockIsRateLimited = vi.fn();

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

vi.mock("@/lib/janus/salvage", () => ({
  recordSegmentWitness: (...args: unknown[]) => mockRecordSegmentWitness(...args),
}));

vi.mock("@/lib/janus/clock", () => ({
  now: (...args: unknown[]) => mockNow(...args),
}));

vi.mock("@/lib/terminal/rate-limit", () => ({
  isTerminalFilesRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
}));

const { GET } = await import("./route");

const PLAYER = { id: "player-1", role: "TECHNICIAN" };
const FILE = {
  id: "file-1",
  filename: "SITREP-004",
  extension: ".LOG",
  requiredModuleKey: "TEXT_VIEWER",
  requiredModule: { key: "TEXT_VIEWER" },
  fullContent: "СЕКРЕТНОЕ СОДЕРЖИМОЕ",
  visibleToRole: null,
  segment: null,
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/terminal/files/[id]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue(PLAYER);
    mockIsRateLimited.mockReturnValue(false);
    mockFindUnique.mockResolvedValue(FILE);
    mockGetUnlockedModuleKeys.mockResolvedValue(["TEXT_VIEWER"]);
    mockNow.mockResolvedValue(new Date("2027-01-01T00:00:00Z"));
    mockRecordSegmentWitness.mockResolvedValue(undefined);
    mockTrackEvent.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await GET(new Request("http://test"), makeParams("file-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the file is not visible to the player's role", async () => {
    mockFindUnique.mockResolvedValue({ ...FILE, visibleToRole: "SECURITY_OFFICER" });
    const res = await GET(new Request("http://test"), makeParams("file-1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the module is not unlocked", async () => {
    mockGetUnlockedModuleKeys.mockResolvedValue([]);
    const res = await GET(new Request("http://test"), makeParams("file-1"));
    expect(res.status).toBe(403);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("отдаёт содержимое как attachment и пишет SEGMENT_EXPORTED", async () => {
    const res = await GET(new Request("http://test"), makeParams("file-1"));
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toBe(FILE.fullContent);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("SITREP-004.LOG");
    expect(mockTrackEvent).toHaveBeenCalledWith("SEGMENT_EXPORTED", "player-1", {
      fileId: "file-1",
      segmentCode: null,
    });
  });

  it("усиливает счётчик выноса тем же критерием, что открытие, для живого сегмента", async () => {
    mockFindUnique.mockResolvedValue({
      ...FILE,
      segment: { id: "seg-1", code: "ARHIV-114", status: "ALIVE" },
    });

    await GET(new Request("http://test"), makeParams("file-1"));

    expect(mockRecordSegmentWitness).toHaveBeenCalledWith(
      "seg-1",
      "player-1",
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith("SEGMENT_EXPORTED", "player-1", {
      fileId: "file-1",
      segmentCode: "ARHIV-114",
    });
  });

  it("не трогает счётчик выноса для уже мёртвого сегмента, но SEGMENT_EXPORTED всё равно пишет", async () => {
    mockFindUnique.mockResolvedValue({
      ...FILE,
      segment: { id: "seg-1", code: "ARHIV-114", status: "DEAD" },
    });

    await GET(new Request("http://test"), makeParams("file-1"));

    expect(mockRecordSegmentWitness).not.toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith("SEGMENT_EXPORTED", "player-1", {
      fileId: "file-1",
      segmentCode: "ARHIV-114",
    });
  });
});
