// Генератор предопубликованного расписания распада (ТЗ 2.2). Разработчик запускает его
// вручную (npm run generate-schedule) при изменении набора сегментов; результат коммитится
// (content/decay-schedule.json) и просто читается сидом — не пересчитывается на каждый
// npm run prisma:seed. Идемпотентен: одинаковые входы дают побайтово одинаковый файл (buildSchedule
// детерминирована целиком входными данными, см. lib/janus/schedule.ts).

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import memorySegmentsData from "@/content/memory-segments.json";
import { buildSchedule, serializeSchedule, type ScheduleSegmentInput } from "@/lib/janus/schedule";
import { DEATH_AT, EPOCH_AT, SCHEDULE_SEED } from "@/lib/janus/calendar";

const segments: ScheduleSegmentInput[] = memorySegmentsData.segments.map((s) => ({
  code: s.code,
  tier: s.tier as "CORE" | "PERIPHERAL",
}));

const entries = buildSchedule({ segments, epoch: EPOCH_AT, deathAt: DEATH_AT, seed: SCHEDULE_SEED });
const outPath = resolve(process.cwd(), "content/decay-schedule.json");
writeFileSync(outPath, serializeSchedule(entries), "utf8");

console.log(
  `generate-schedule: ${entries.length} events written to content/decay-schedule.json ` +
    `(epoch=${EPOCH_AT.toISOString()}, deathAt=${DEATH_AT.toISOString()}, seed=${SCHEDULE_SEED}).`,
);
