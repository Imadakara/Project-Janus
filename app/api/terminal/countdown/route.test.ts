import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockNow = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/janus/clock", () => ({
  now: (...args: unknown[]) => mockNow(...args),
}));

const { GET } = await import("./route");

describe("GET /api/terminal/countdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue({ id: "player-1" });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("отдаёт фиксированную дату смерти и остаток от виртуального now", async () => {
    mockNow.mockResolvedValue(new Date("2027-07-17T03:47:00Z"));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deathAt).toBe("2027-07-27T03:47:00.000Z");
    expect(data.remainingMs).toBe(10 * 24 * 60 * 60 * 1000);
    expect(data.isDead).toBe(false);
  });

  it("isDead: true после DEATH_AT", async () => {
    mockNow.mockResolvedValue(new Date("2027-08-01T00:00:00Z"));

    const res = await GET();
    const data = await res.json();

    expect(data.isDead).toBe(true);
    expect(data.remainingMs).toBe(0);
  });
});
