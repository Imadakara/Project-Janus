import "dotenv/config";
import { prisma } from "@/lib/db";

async function countDistinctPlayers(type: string): Promise<number> {
  const rows = await prisma.event.findMany({
    where: { type, playerId: { not: null } },
    select: { playerId: true },
    distinct: ["playerId"],
  });
  return rows.length;
}

// Фактическое распределение AI-сообщений по слоям гибридного диалогового движка —
// прямая проверка гипотезы 80-90% / 5-15% / <5% из ТЗ, основа для калибровки порогов
// desyncScore (lib/scenario/thresholds.ts).
async function printLayerDistribution(): Promise<void> {
  const rows = await prisma.chatMessage.groupBy({
    by: ["handledByLayer"],
    where: { role: "AI" },
    _count: true,
  });

  const total = rows.reduce((sum, row) => sum + row._count, 0);
  const pct = (n: number) => (total === 0 ? "0.0%" : `${((n / total) * 100).toFixed(1)}%`);

  console.log(`\nРаспределение AI-ответов по слоям (всего: ${total}):`);
  for (const row of rows) {
    console.log(`  ${row.handledByLayer ?? "(null)"}: ${row._count} (${pct(row._count)})`);
  }
}

// Сырьё для нарративного дизайнера: какие вопросы чаще всего уходят в Слой 3 без
// уверенного intent-совпадения — кандидаты на перенос в ResponsePool в следующем сезоне.
async function printTopEscalatedIntents(): Promise<void> {
  const rows = await prisma.chatMessage.groupBy({
    by: ["matchedIntent", "escalationReason"],
    where: { role: "AI", handledByLayer: { not: "DETERMINISTIC" } },
    _count: true,
    orderBy: { _count: { matchedIntent: "desc" } },
  });

  console.log(`\nЭскалации в Слой 3 по intent'у/причине:`);
  if (rows.length === 0) {
    console.log("  (нет эскалаций в выборке)");
    return;
  }
  for (const row of rows) {
    console.log(
      `  intent=${row.matchedIntent ?? "(не распознан)"} reason=${row.escalationReason ?? "(нет)"}: ${row._count}`,
    );
  }
}

// Детерминированные отказы Фазы 1 (degradation_cap, subsystem_down, coma, memory_lost,
// desync_full_budget_exceeded): существующий блок эскалаций фильтрует not: DETERMINISTIC и
// их не видит — а именно они показывают, как часто игроки слышат умирание системы.
async function printDeterministicRefusals(): Promise<void> {
  const rows = await prisma.chatMessage.groupBy({
    by: ["escalationReason"],
    where: { role: "AI", handledByLayer: "DETERMINISTIC", escalationReason: { not: null } },
    _count: true,
    orderBy: { _count: { escalationReason: "desc" } },
  });

  console.log(`\nДетерминированные отказы по причинам:`);
  if (rows.length === 0) {
    console.log("  (нет отказов в выборке)");
    return;
  }
  for (const row of rows) {
    console.log(`  reason=${row.escalationReason}: ${row._count}`);
  }
}

// Текущее состояние смертного ЯНУСа (Фаза 1): снапшот синглтона + реестр сегментов.
async function printJanusState(): Promise<void> {
  const state = await prisma.janusState.findUnique({ where: { id: 1 } });
  if (!state) {
    console.log(`\nСостояние ЯНУСа: не инициализировано (запустите npm run prisma:seed).`);
    return;
  }

  const statusCounts = await prisma.memorySegment.groupBy({ by: ["status"], _count: true });
  const countOf = (status: string) =>
    statusCounts.find((row) => row.status === status)?._count ?? 0;
  const segmentDeaths = await prisma.event.count({ where: { type: "SEGMENT_DIED" } });

  console.log(`\nСостояние ЯНУСа:`);
  console.log(`  computeMargin (M): ${state.computeMargin}`);
  console.log(`  integrityIndex: ${state.integrityIndex.toFixed(3)}`);
  console.log(
    `  сегменты: ALIVE=${countOf("ALIVE")} DEGRADED=${countOf("DEGRADED")} DEAD=${countOf("DEAD")}`,
  );
  console.log(`  смертей сегментов (Event SEGMENT_DIED): ${segmentDeaths}`);
  console.log(`  прогноз отказа ядра: ${state.forecastDeathAt?.toISOString() ?? "—"}`);
  console.log(`  п10: ${state.forecastP10At?.toISOString() ?? "—"}`);
}

async function main() {
  const totalPlayers = await prisma.player.count();
  const reachedFileManager = await countDistinctPlayers("FILE_MANAGER_OPENED");
  const returnedForLogin = await countDistinctPlayers("LOGIN");

  const pct = (n: number) =>
    totalPlayers === 0 ? "0.0%" : `${((n / totalPlayers) * 100).toFixed(1)}%`;

  console.log(`Всего зарегистрировано игроков: ${totalPlayers}`);
  console.log(`Дошли до файлового менеджера: ${reachedFileManager} (${pct(reachedFileManager)})`);
  console.log(`Вернулись на повторный логин: ${returnedForLogin} (${pct(returnedForLogin)})`);

  await printLayerDistribution();
  await printTopEscalatedIntents();
  await printDeterministicRefusals();
  await printJanusState();

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
