import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEmbedText = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock("@/lib/embeddings/client", () => ({
  embedText: (...args: unknown[]) => mockEmbedText(...args),
  toVectorLiteral: (vector: number[]) => `[${vector.join(",")}]`,
}));

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) },
}));

const { searchUnlockedMaterials, isLostTopHit, MEMORY_LOST_MAX_DISTANCE } = await import("./rag");

describe("isLostTopHit (чистый решатель маркера утраты)", () => {
  it("tombstone дальше порога — не утрата", () => {
    expect(isLostTopHit(null, MEMORY_LOST_MAX_DISTANCE + 0.1, MEMORY_LOST_MAX_DISTANCE)).toBe(
      false,
    );
  });

  it("tombstone ближе порога и ближе лучшего файла — утрата", () => {
    expect(isLostTopHit(0.4, 0.2, MEMORY_LOST_MAX_DISTANCE)).toBe(true);
  });

  it("живой файл ближе tombstone — материал есть, утраты нет", () => {
    expect(isLostTopHit(0.1, 0.2, MEMORY_LOST_MAX_DISTANCE)).toBe(false);
  });

  it("живых файлов нет вовсе, tombstone в пороге — утрата", () => {
    expect(isLostTopHit(null, 0.3, MEMORY_LOST_MAX_DISTANCE)).toBe(true);
  });

  it("нет ни файлов, ни tombstone — нечего маркировать", () => {
    expect(isLostTopHit(null, null, MEMORY_LOST_MAX_DISTANCE)).toBe(false);
  });
});

describe("searchUnlockedMaterials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedText.mockResolvedValue([0.1, 0.2]);
  });

  it("returns an empty hits outcome without querying the DB when no modules are unlocked", async () => {
    const result = await searchUnlockedMaterials("архив", [], "ARCHIVIST");
    expect(result).toEqual({ kind: "hits", results: [] });
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("maps matched rows to RagResult with a truncated snippet", async () => {
    // Два $queryRaw в порядке Promise.all: сначала файлы, затем tombstone-запрос.
    mockQueryRaw
      .mockResolvedValueOnce([
        { id: "file-1", filename: "SITREP-004", fullContent: "A".repeat(500), distance: 0.1 },
      ])
      .mockResolvedValueOnce([]);

    const result = await searchUnlockedMaterials("архив", ["TEXT_VIEWER"], "ARCHIVIST");

    expect(result.kind).toBe("hits");
    if (result.kind === "hits") {
      expect(result.results).toHaveLength(1);
      expect(result.results[0].fileId).toBe("file-1");
      expect(result.results[0].filename).toBe("SITREP-004");
      expect(result.results[0].snippet.length).toBe(400);
    }
  });

  it("возвращает маркер утраты, когда tombstone мёртвого сегмента ближе живых файлов", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { id: "file-1", filename: "OTHER", fullContent: "B".repeat(100), distance: 0.45 },
      ])
      .mockResolvedValueOnce([{ code: "ARHIV-114", distance: 0.15 }]);

    const result = await searchUnlockedMaterials("сводки объекта", ["TEXT_VIEWER"], "ARCHIVIST");

    expect(result).toEqual({ kind: "lost", segmentCode: "ARHIV-114" });
  });

  it("далёкий tombstone не мешает обычным результатам", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { id: "file-1", filename: "SITREP-004", fullContent: "C".repeat(100), distance: 0.2 },
      ])
      .mockResolvedValueOnce([{ code: "ARHIV-114", distance: 0.9 }]);

    const result = await searchUnlockedMaterials("архив", ["TEXT_VIEWER"], "ARCHIVIST");

    expect(result.kind).toBe("hits");
  });
});
