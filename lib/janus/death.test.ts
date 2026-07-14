import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENESIS_HASH, computeEntryHash } from "./ledger";

const mockFindUnique = vi.fn();
const mockSegmentUpdate = vi.fn();
const mockExecuteRaw = vi.fn();
const mockLedgerFindFirst = vi.fn();
const mockLedgerCreate = vi.fn();
const mockEventCreate = vi.fn();
const mockRecompute = vi.fn();

const tx = {
  memorySegment: {
    findUnique: (...args: unknown[]) => mockFindUnique(...args),
    update: (...args: unknown[]) => mockSegmentUpdate(...args),
  },
  $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  lossLedgerEntry: {
    findFirst: (...args: unknown[]) => mockLedgerFindFirst(...args),
    create: (...args: unknown[]) => mockLedgerCreate(...args),
  },
  event: {
    create: (...args: unknown[]) => mockEventCreate(...args),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (fn: (txClient: unknown) => Promise<unknown>) => fn(tx),
  },
}));

vi.mock("./state", () => ({
  recomputeDerivedStateTx: (...args: unknown[]) => mockRecompute(...args),
}));

const { killSegment } = await import("./death");

const ALIVE_SEGMENT = {
  id: "seg-1",
  code: "ARHIV-114",
  status: "ALIVE",
  title: "Архивный пласт",
  metaSummary: "Сводки объекта",
};

describe("killSegment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(ALIVE_SEGMENT);
    mockSegmentUpdate.mockResolvedValue({});
    mockExecuteRaw.mockResolvedValue(0);
    mockLedgerFindFirst.mockResolvedValue(null);
    mockLedgerCreate.mockResolvedValue({});
    mockEventCreate.mockResolvedValue({});
    mockRecompute.mockResolvedValue(undefined);
  });

  it("бросает ошибку для несуществующего сегмента", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(killSegment("NEMA-0", "debug_kill")).rejects.toThrow("NEMA-0");
    expect(mockSegmentUpdate).not.toHaveBeenCalled();
  });

  it("повторный вызов по мёртвому сегменту — no-op без второй записи в Книге потерь", async () => {
    mockFindUnique.mockResolvedValue({ ...ALIVE_SEGMENT, status: "DEAD" });
    await killSegment("ARHIV-114", "debug_kill");
    expect(mockSegmentUpdate).not.toHaveBeenCalled();
    expect(mockLedgerCreate).not.toHaveBeenCalled();
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("убивает живой сегмент: статус, гигиена индекса, леджер, событие, пересчёт", async () => {
    await killSegment("ARHIV-114", "churn");

    expect(mockSegmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "seg-1" },
        data: expect.objectContaining({ status: "DEAD", sharesAlive: 0 }),
      }),
    );
    // Обнуление эмбеддингов файлов сегмента (raw из-за Unsupported-типа).
    expect(mockExecuteRaw).toHaveBeenCalledOnce();

    const ledgerData = mockLedgerCreate.mock.calls[0][0].data;
    expect(ledgerData.segmentCode).toBe("ARHIV-114");
    expect(ledgerData.prevHash).toBe(GENESIS_HASH);
    expect(ledgerData.hash).toBe(
      computeEntryHash({
        segmentCode: ledgerData.segmentCode,
        title: ledgerData.title,
        metaSummary: ledgerData.metaSummary,
        diedAt: ledgerData.diedAt,
        lastCarrierCallsign: ledgerData.lastCarrierCallsign,
        prevHash: ledgerData.prevHash,
      }),
    );

    expect(mockEventCreate).toHaveBeenCalledWith({
      data: {
        type: "SEGMENT_DIED",
        playerId: null,
        payload: { segmentCode: "ARHIV-114", cause: "churn" },
      },
    });
    expect(mockRecompute).toHaveBeenCalledWith(tx);
  });

  it("вторая смерть цепляется prevHash за hash предыдущей записи", async () => {
    mockLedgerFindFirst.mockResolvedValue({ hash: "a".repeat(64) });
    await killSegment("ARHIV-114", "debug_kill");
    expect(mockLedgerCreate.mock.calls[0][0].data.prevHash).toBe("a".repeat(64));
  });
});
