// Смерть сегмента памяти — ЕДИНСТВЕННАЯ функция, переводящая сегмент в DEAD (ТЗ 1.3).
// Необратимо на уровне кода: функции воскрешения не существует, сид мёртвые сегменты не
// трогает (prisma/seed.ts). Все вызывающие (дебаг-роуты Фазы 1, heartbeat-джоб Фазы 2)
// обязаны идти через killSegment — никакой другой код не пишет MemorySegment.status.

import { prisma } from "@/lib/db";
import { GENESIS_HASH, computeEntryHash } from "./ledger";
import { recomputeDerivedStateTx } from "./state";

// `diedAt` — момент смерти по домашним часам вызывающего (lib/janus/clock.ts, договорённость
// 0.8): для планового распада (reaper.ts) это запланированный `dieAt`, не момент прогона
// catch-up после простоя сервера; для дебаг-убийства — текущее виртуальное время.
export async function killSegment(code: string, cause: string, diedAt: Date): Promise<void> {
  // Интерактивная транзакция (а не массив операций): чтение prevHash последней записи
  // Книги потерь и запись новой должны быть атомарны, иначе параллельные смерти порвут
  // цепочку. Событие пишется здесь же, а не через trackEvent (fire-and-forget): смерть без
  // следа в телеметрии недопустима — отступление от конвенции зафиксировано в тех.описании.
  await prisma.$transaction(async (tx) => {
    const segment = await tx.memorySegment.findUnique({ where: { code } });
    if (!segment) {
      throw new Error(`killSegment: сегмент ${code} не существует`);
    }
    // Идемпотентность: повторный вызов по мёртвому сегменту — no-op, не вторая запись в
    // Книге потерь.
    if (segment.status === "DEAD") return;

    await tx.memorySegment.update({
      where: { id: segment.id },
      data: { status: "DEAD", diedAt, sharesAlive: 0 },
    });

    // Гигиена индекса: RAG не должен переживать память (ТЗ 1.3). Эмбеддинги файлов
    // обнуляются навсегда; tombstone-эмбеддинг самого сегмента намеренно остаётся — по
    // нему lib/ai/rag.ts распознаёт вопрос про утраченное. Unsupported-тип — только raw.
    await tx.$executeRaw`
      UPDATE "TerminalFile" SET embedding = NULL WHERE "segmentId" = ${segment.id}
    `;

    // Последний свидетель (ТЗ 2.8): переносим позывного (email) игрока, который последним
    // читал сегмент, в Књигу губитака — семантика поля сменилась с «последнего синтетического
    // носителя» (всегда null в Фазе 1) на «последнего живого свидетеля». Невынесенный сегмент
    // (lastWitnessPlayerId = null) даёт явный маркер «никто не успел» в UI (losses-screen.tsx).
    const lastWitness = segment.lastWitnessPlayerId
      ? await tx.player.findUnique({
          where: { id: segment.lastWitnessPlayerId },
          select: { email: true },
        })
      : null;

    const lastEntry = await tx.lossLedgerEntry.findFirst({ orderBy: { id: "desc" } });
    const entryData = {
      segmentCode: segment.code,
      title: segment.title,
      metaSummary: segment.metaSummary,
      diedAt,
      lastCarrierCallsign: lastWitness?.email ?? null,
      prevHash: lastEntry?.hash ?? GENESIS_HASH,
    };
    await tx.lossLedgerEntry.create({
      data: { ...entryData, hash: computeEntryHash(entryData) },
    });

    await tx.event.create({
      data: { type: "SEGMENT_DIED", playerId: null, payload: { segmentCode: code, cause } },
    });

    await recomputeDerivedStateTx(tx, diedAt);
  });
}
