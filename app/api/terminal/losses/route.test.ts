import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENESIS_HASH, computeEntryHash } from "@/lib/janus/ledger";

const mockGetCurrentPlayer = vi.fn();
const mockLedgerFindMany = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    lossLedgerEntry: { findMany: (...args: unknown[]) => mockLedgerFindMany(...args) },
  },
}));

const { GET } = await import("./route");

function makeEntry(id: number, prevHash: string) {
  const data = {
    segmentCode: `SEG-${id}`,
    title: `Сегмент ${id}`,
    metaSummary: "Метаданные",
    diedAt: new Date(Date.UTC(2026, 6, 14, id)),
    lastCarrierCallsign: null,
    prevHash,
  };
  return { id, ...data, hash: computeEntryHash(data), createdAt: data.diedAt };
}

describe("GET /api/terminal/losses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue({ id: "player-1", role: "ARCHIVIST" });
    mockLedgerFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("отдаёт записи и валидную цепочку", async () => {
    const first = makeEntry(1, GENESIS_HASH);
    const second = makeEntry(2, first.hash);
    mockLedgerFindMany.mockResolvedValue([first, second]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.entries).toHaveLength(2);
    expect(data.chain).toEqual({ valid: true });
  });

  it("сломанная цепочка отдаётся явно с индексом разрыва", async () => {
    const first = makeEntry(1, GENESIS_HASH);
    const tampered = { ...makeEntry(2, first.hash), metaSummary: "переписано задним числом" };
    mockLedgerFindMany.mockResolvedValue([first, tampered]);

    const res = await GET();
    const data = await res.json();

    expect(data.chain).toEqual({ valid: false, brokenAtIndex: 1 });
  });
});
