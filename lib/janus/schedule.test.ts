import { describe, expect, it } from "vitest";
import { buildSchedule, serializeSchedule, type ScheduleSegmentInput } from "./schedule";

const EPOCH = new Date("2026-10-01T00:00:00Z");
const DEATH_AT = new Date("2027-07-27T03:47:00Z");
const SEED = 1988;

function makeSegments(nPeripheral: number, nCore: number): ScheduleSegmentInput[] {
  const segments: ScheduleSegmentInput[] = [];
  for (let i = 0; i < nPeripheral; i += 1) {
    segments.push({ code: `PERIPH-${i}`, tier: "PERIPHERAL" });
  }
  for (let i = 0; i < nCore; i += 1) {
    segments.push({ code: `CORE-${i}`, tier: "CORE" });
  }
  return segments;
}

describe("buildSchedule", () => {
  it("is deterministic across runs with the same inputs", () => {
    const segments = makeSegments(40, 12);
    const a = buildSchedule({ segments, epoch: EPOCH, deathAt: DEATH_AT, seed: SEED });
    const b = buildSchedule({ segments, epoch: EPOCH, deathAt: DEATH_AT, seed: SEED });
    expect(serializeSchedule(a)).toBe(serializeSchedule(b));
  });

  it("produces one entry per non-immortal segment, all within [epoch, deathAt]", () => {
    const segments = makeSegments(40, 12);
    const entries = buildSchedule({ segments, epoch: EPOCH, deathAt: DEATH_AT, seed: SEED });
    expect(entries).toHaveLength(52);
    for (const entry of entries) {
      expect(entry.dieAt.getTime()).toBeGreaterThanOrEqual(EPOCH.getTime());
      expect(entry.dieAt.getTime()).toBeLessThanOrEqual(DEATH_AT.getTime());
    }
  });

  it("output is sorted by dieAt ascending", () => {
    const segments = makeSegments(40, 12);
    const entries = buildSchedule({ segments, epoch: EPOCH, deathAt: DEATH_AT, seed: SEED });
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i].dieAt.getTime()).toBeGreaterThanOrEqual(entries[i - 1].dieAt.getTime());
    }
  });

  it("excludes segments marked isImmortalUntilDeath", () => {
    const segments = makeSegments(2, 2);
    segments[0].isImmortalUntilDeath = true;
    const entries = buildSchedule({ segments, epoch: EPOCH, deathAt: DEATH_AT, seed: SEED });
    expect(entries.find((e) => e.segmentCode === "PERIPH-0")).toBeUndefined();
    expect(entries).toHaveLength(3);
  });

  it("keeps core losses out of the first half of the active phase", () => {
    const segments = makeSegments(0, 12);
    const entries = buildSchedule({ segments, epoch: EPOCH, deathAt: DEATH_AT, seed: SEED });
    const midpoint = (EPOCH.getTime() + DEATH_AT.getTime()) / 2;
    for (const entry of entries) {
      expect(entry.dieAt.getTime()).toBeGreaterThanOrEqual(midpoint);
    }
  });

  it("serializeSchedule is stable regardless of input array order", () => {
    const segments = makeSegments(5, 2);
    const entries = buildSchedule({ segments, epoch: EPOCH, deathAt: DEATH_AT, seed: SEED });
    const reversed = [...entries].reverse();
    expect(serializeSchedule(entries)).toBe(serializeSchedule(reversed));
  });
});
