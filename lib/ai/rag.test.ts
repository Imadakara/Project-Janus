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

const { searchUnlockedMaterials } = await import("./rag");

describe("searchUnlockedMaterials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedText.mockResolvedValue([0.1, 0.2]);
  });

  it("returns an empty list without querying the DB when no modules are unlocked", async () => {
    const result = await searchUnlockedMaterials("архив", [], "ARCHIVIST");
    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("maps matched rows to RagResult with a truncated snippet", async () => {
    mockQueryRaw.mockResolvedValue([
      { id: "file-1", filename: "SITREP-004", fullContent: "A".repeat(500) },
    ]);

    const result = await searchUnlockedMaterials("архив", ["TEXT_VIEWER"], "ARCHIVIST");

    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe("file-1");
    expect(result[0].filename).toBe("SITREP-004");
    expect(result[0].snippet.length).toBe(400);
  });
});
