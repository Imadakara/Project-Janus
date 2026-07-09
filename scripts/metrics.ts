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

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
