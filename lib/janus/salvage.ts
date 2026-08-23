// Счётчик спасённого (ТЗ 2.6): сегмент "вынесен", если его содержимое хотя бы раз дошло до
// живого игрока до момента утраты. Два пути контакта — полное открытие привязанного файла
// (app/api/terminal/files/[id]/open) и попадание в RAG-контекст ответа full_llm
// (app/api/chat, lib/ai/rag.ts). Оба вызывают recordSegmentWitness; идемпотентно по факту
// первого выноса — witnessCount растёт при каждом повторном контакте.

import { prisma } from "@/lib/db";

export async function recordSegmentWitness(
  segmentId: string,
  playerId: string,
  now: Date,
): Promise<void> {
  const segment = await prisma.memorySegment.findUnique({ where: { id: segmentId } });
  if (!segment) return;

  const isFirstSalvage = segment.salvagedAt === null;

  await prisma.memorySegment.update({
    where: { id: segmentId },
    data: {
      salvagedAt: segment.salvagedAt ?? now,
      salvagedByPlayerId: segment.salvagedByPlayerId ?? playerId,
      witnessCount: { increment: 1 },
      // Последний свидетель (2.8) — переносится в Књигу губитака при killSegment.
      lastWitnessPlayerId: playerId,
      lastWitnessAt: now,
    },
  });

  await prisma.event.create({
    data: {
      type: isFirstSalvage ? "SEGMENT_SALVAGED" : "SEGMENT_WITNESSED",
      playerId,
      payload: { segmentCode: segment.code },
    },
  });
}

export type SalvageState = { total: number; salvaged: number; percent: number };

// Считается от ВСЕХ сегментов, включая уже мёртвые (ТЗ 2.6): мёртвый невынесенный сегмент
// навсегда снижает потолок счётчика — принципиально не пересчитывать только по живым.
export async function getSalvageState(): Promise<SalvageState> {
  const [total, salvaged] = await Promise.all([
    prisma.memorySegment.count(),
    prisma.memorySegment.count({ where: { salvagedAt: { not: null } } }),
  ]);
  return { total, salvaged, percent: total === 0 ? 0 : salvaged / total };
}
