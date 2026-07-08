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

async function main() {
  const totalPlayers = await prisma.player.count();
  const reachedFileManager = await countDistinctPlayers("FILE_MANAGER_OPENED");
  const returnedForLogin = await countDistinctPlayers("LOGIN");

  const pct = (n: number) =>
    totalPlayers === 0 ? "0.0%" : `${((n / totalPlayers) * 100).toFixed(1)}%`;

  console.log(`Всего зарегистрировано игроков: ${totalPlayers}`);
  console.log(`Дошли до файлового менеджера: ${reachedFileManager} (${pct(reachedFileManager)})`);
  console.log(`Вернулись на повторный логин: ${returnedForLogin} (${pct(returnedForLogin)})`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
