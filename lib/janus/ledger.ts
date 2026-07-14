// Хеш-цепочка Книги потерь («Књига губитака», концепт смертности, раздел 4.6): каждая запись
// включает хеш предыдущей — историю смертей нельзя переписать задним числом. Чистый модуль
// (node:crypto, без БД): запись цепочки — lib/janus/death.ts, проверка при рендере —
// app/api/terminal/losses. В Фазе 2 та же дисциплина используется для публичных снапшотов.

import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export type LedgerEntryData = {
  segmentCode: string;
  title: string;
  metaSummary: string;
  diedAt: Date;
  lastCarrierCallsign: string | null;
  prevHash: string;
};

// Каноническая сериализация — JSON-массив фиксированного порядка, а не объект: снимает
// вопрос порядка ключей и делает пересчёт тривиальным на любом языке (публичная
// верифицируемость, концепт раздел 6). Дата — ISO-8601 UTC.
export function computeEntryHash(entry: LedgerEntryData): string {
  const canonical = JSON.stringify([
    entry.segmentCode,
    entry.title,
    entry.metaSummary,
    entry.diedAt.toISOString(),
    entry.lastCarrierCallsign,
    entry.prevHash,
  ]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export type LedgerChainCheck = { valid: true } | { valid: false; brokenAtIndex: number };

// Проверка всей цепочки: записи подаются в порядке id ASC. Расхождение — явная ошибка с
// индексом первой сломанной записи (UI обязан показать её, не тихо пропустить — ТЗ 1.5).
export function verifyLedgerChain(
  entries: Array<LedgerEntryData & { hash: string }>,
): LedgerChainCheck {
  let expectedPrevHash = GENESIS_HASH;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.prevHash !== expectedPrevHash) return { valid: false, brokenAtIndex: i };
    if (computeEntryHash(entry) !== entry.hash) return { valid: false, brokenAtIndex: i };
    expectedPrevHash = entry.hash;
  }
  return { valid: true };
}
