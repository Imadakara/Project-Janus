import { describe, expect, it } from "vitest";
import { GENESIS_HASH, computeEntryHash, verifyLedgerChain, type LedgerEntryData } from "./ledger";

function buildChain(count: number): Array<LedgerEntryData & { hash: string }> {
  const entries: Array<LedgerEntryData & { hash: string }> = [];
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < count; i += 1) {
    const data: LedgerEntryData = {
      segmentCode: `SEG-${i}`,
      title: `Сегмент ${i}`,
      metaSummary: `Метаданные ${i}`,
      diedAt: new Date(Date.UTC(2026, 6, 14, i)),
      lastCarrierCallsign: i % 2 === 0 ? null : `LAZAR-${i}`,
      prevHash,
    };
    const hash = computeEntryHash(data);
    entries.push({ ...data, hash });
    prevHash = hash;
  }
  return entries;
}

describe("computeEntryHash", () => {
  it("детерминирован и чувствителен к каждому полю", () => {
    const [entry] = buildChain(1);
    expect(computeEntryHash(entry)).toBe(entry.hash);
    expect(computeEntryHash({ ...entry, title: "другой" })).not.toBe(entry.hash);
    expect(computeEntryHash({ ...entry, lastCarrierCallsign: "X" })).not.toBe(entry.hash);
    expect(computeEntryHash({ ...entry, diedAt: new Date(0) })).not.toBe(entry.hash);
  });
});

describe("verifyLedgerChain", () => {
  it("пустая и корректная цепочки валидны", () => {
    expect(verifyLedgerChain([])).toEqual({ valid: true });
    expect(verifyLedgerChain(buildChain(3))).toEqual({ valid: true });
  });

  it("порча содержимого записи ломает проверку на её индексе", () => {
    const chain = buildChain(3);
    chain[1].metaSummary = "переписанная история";
    expect(verifyLedgerChain(chain)).toEqual({ valid: false, brokenAtIndex: 1 });
  });

  it("подмена hash ломается на самой записи, разрыв prevHash — на следующей", () => {
    const tamperedHash = buildChain(3);
    tamperedHash[2].hash = "f".repeat(64);
    expect(verifyLedgerChain(tamperedHash)).toEqual({ valid: false, brokenAtIndex: 2 });

    const removedMiddle = buildChain(3).filter((_, i) => i !== 1);
    expect(verifyLedgerChain(removedMiddle)).toEqual({ valid: false, brokenAtIndex: 1 });
  });

  it("первая запись обязана ссылаться на GENESIS_HASH", () => {
    const chain = buildChain(2).slice(1);
    expect(verifyLedgerChain(chain)).toEqual({ valid: false, brokenAtIndex: 0 });
  });
});
