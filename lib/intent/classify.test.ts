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

const { classifyIntent } = await import("./classify");

describe("classifyIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it("returns the matched intent with confidence derived from distance", async () => {
    mockQueryRaw.mockResolvedValue([{ code: "ASK_IDENTITY", distance: 0.1 }]);

    const result = await classifyIntent("Кто ты?", { shortTermMemory: [] });

    expect(result.intent).toBe("ASK_IDENTITY");
    expect(result.confidence).toBeCloseTo(0.9);
    expect(result.tags).toContain("interrogation");
  });

  it("returns null intent and zero confidence when no match exists", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await classifyIntent("бла бла бла", { shortTermMemory: [] });

    expect(result.intent).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("resolves mentioned entities including pronoun references from short-term memory", async () => {
    mockQueryRaw.mockResolvedValue([{ code: "SMALLTALK_GENERIC", distance: 0.5 }]);

    const result = await classifyIntent("Она всё ещё повреждена?", {
      shortTermMemory: [{ entity: "АРХИВ", mentionedAt: new Date().toISOString() }],
    });

    expect(result.mentionedEntities).toContain("АРХИВ");
  });

  it("clamps confidence to [0, 1] even if distance is negative or above 1", async () => {
    mockQueryRaw.mockResolvedValue([{ code: "ASK_TRUST", distance: 1.5 }]);

    const result = await classifyIntent("что угодно", { shortTermMemory: [] });

    expect(result.confidence).toBe(0);
  });
});
