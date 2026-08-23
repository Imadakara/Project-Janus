// Планировщик утрат (ТЗ 2.3): применяет предопубликованное расписание распада
// (lib/janus/schedule.ts, content/decay-schedule.json → таблица DecayEvent при сиде).
// Recompute-on-read — та же практика, что forecastDeathAt-пересчёт в Фазе 1
// (lib/janus/state.ts): джоб-раннера нет, applyDueDecay вызывается на входе в
// /api/chat, /api/terminal/vitals и публичные роуты Фазы 3. Идемпотентно — «догоняет»
// любой простой сервера в правильном порядке dieAt.

import { prisma } from "@/lib/db";
import { killSegment } from "./death";

// «Деградация копий» перед плановой утратой (ТЗ 2.3, рекомендованная часть): за
// DEGRADED_WINDOW_DAYS до dieAt сегмент помечается DEGRADED — integrity.ts уже учитывает эту
// стадию частичным весом, так что спасение действительно становится «гонкой», а не только
// текстовым флагом. Не через killSegment: тот владеет только необратимым переходом в DEAD.
export const DEGRADED_WINDOW_DAYS = 7;
const DEGRADED_WINDOW_MS = DEGRADED_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Recompute-on-read в обе стороны (а не однократная «пометка при пересечении порога»):
// откат виртуальных часов назад дебаг-кнопкой (2.11) обязан снять DEGRADED так же честно,
// как forecastDeathAt/computeMargin пересчитываются заново на каждый вызов (state.ts).
export async function syncApproachingDecay(now: Date): Promise<void> {
  const threshold = new Date(now.getTime() + DEGRADED_WINDOW_MS);
  const segments = await prisma.memorySegment.findMany({
    where: { status: { not: "DEAD" } },
    select: {
      id: true,
      status: true,
      decayEvent: { select: { dieAt: true, appliedAt: true } },
    },
  });

  for (const segment of segments) {
    if (!segment.decayEvent || segment.decayEvent.appliedAt) continue;
    const nextStatus = segment.decayEvent.dieAt <= threshold ? "DEGRADED" : "ALIVE";
    if (segment.status !== nextStatus) {
      await prisma.memorySegment.update({ where: { id: segment.id }, data: { status: nextStatus } });
    }
  }
}

export async function applyDueDecay(now: Date): Promise<string[]> {
  const due = await prisma.decayEvent.findMany({
    where: { dieAt: { lte: now }, appliedAt: null },
    orderBy: { dieAt: "asc" },
    select: { segmentCode: true, dieAt: true },
  });

  const applied: string[] = [];
  for (const event of due) {
    // killSegment идемпотентен (no-op на уже мёртвом сегменте), но appliedAt всё равно
    // проставляем — иначе следующий вызов applyDueDecay возьмёт ту же строку снова.
    // diedAt = запланированный event.dieAt, а не момент прогона catch-up (см. death.ts) —
    // после простоя сервера в виртуальном времени утраты не должны все схлопнуться в один
    // момент времени в Књиге губитака.
    await killSegment(event.segmentCode, "schedule", event.dieAt);
    await prisma.decayEvent.update({
      where: { segmentCode: event.segmentCode },
      data: { appliedAt: now },
    });
    applied.push(event.segmentCode);
  }
  return applied;
}
