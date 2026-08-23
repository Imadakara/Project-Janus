import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockEventFindMany = vi.fn();
const mockSegmentFindMany = vi.fn();
const mockLedgerFindMany = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    event: { findMany: (...args: unknown[]) => mockEventFindMany(...args) },
    memorySegment: { findMany: (...args: unknown[]) => mockSegmentFindMany(...args) },
    lossLedgerEntry: { findMany: (...args: unknown[]) => mockLedgerFindMany(...args) },
  },
}));

const { GET } = await import("./route");

const PLAYER = { id: "player-1", email: "operator@example.com", role: "ARCHIVIST" };

describe("GET /api/terminal/journal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue(PLAYER);
    mockEventFindMany.mockResolvedValue([]);
    mockSegmentFindMany.mockResolvedValue([]);
    mockLedgerFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("выводит уникальные засвидетельствованные сегменты по первому появлению в Event-логе", async () => {
    mockEventFindMany.mockResolvedValue([
      {
        type: "SEGMENT_SALVAGED",
        payload: { segmentCode: "A" },
        createdAt: new Date("2027-01-01T00:00:00Z"),
      },
      {
        type: "SEGMENT_WITNESSED",
        payload: { segmentCode: "A" },
        createdAt: new Date("2027-01-02T00:00:00Z"),
      },
      {
        type: "SEGMENT_WITNESSED",
        payload: { segmentCode: "B" },
        createdAt: new Date("2027-01-03T00:00:00Z"),
      },
    ]);
    mockLedgerFindMany.mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    expect(data.witnessedSegmentCount).toBe(2);
    expect(mockLedgerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { segmentCode: { in: ["A", "B"] } } }),
    );
  });

  it("отдаёт сегменты, спасённые первым этим игроком", async () => {
    mockSegmentFindMany.mockResolvedValue([
      { code: "A", title: "Сегмент А", salvagedAt: new Date("2027-01-01T00:00:00Z") },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(data.firstSalvages).toEqual([
      { code: "A", title: "Сегмент А", salvagedAt: "2027-01-01T00:00:00.000Z" },
    ]);
  });

  it("отмечает wasLastWitness по совпадению позывного с lastCarrierCallsign", async () => {
    mockEventFindMany.mockResolvedValue([
      {
        type: "SEGMENT_WITNESSED",
        payload: { segmentCode: "A" },
        createdAt: new Date("2027-01-01T00:00:00Z"),
      },
    ]);
    mockLedgerFindMany.mockResolvedValueOnce([
      {
        id: 1,
        segmentCode: "A",
        title: "Сегмент А",
        diedAt: new Date("2027-02-01T00:00:00Z"),
        lastCarrierCallsign: "operator@example.com",
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(data.lossesWitnessed[0].wasLastWitness).toBe(true);
  });

  it("выводит записи, где игрок зачтён последним свидетелем в Књиге губитака", async () => {
    // witnessedCodes пуст (нет событий) — маршрут не дёргает prisma для lossesWitnessed
    // (короткая ветка Promise.resolve([])), так что единственный вызов mockLedgerFindMany —
    // это creditedAsLastWitness.
    mockLedgerFindMany.mockResolvedValueOnce([
      { id: 2, segmentCode: "B", title: "Сегмент Б", diedAt: new Date("2027-03-01T00:00:00Z") },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(data.creditedAsLastWitness).toEqual([
      { id: 2, segmentCode: "B", title: "Сегмент Б", diedAt: "2027-03-01T00:00:00.000Z" },
    ]);
  });
});
