import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { verifyLedgerChain } from "@/lib/janus/ledger";

// Книга потерь: полный журнал + серверная проверка хеш-цепочки при каждом чтении.
// Расхождение отдаётся клиенту явно (brokenAtIndex) — UI обязан показать ошибку
// целостности, а не тихо пропустить (ТЗ 1.5).
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const entries = await prisma.lossLedgerEntry.findMany({ orderBy: { id: "asc" } });
  const chain = verifyLedgerChain(entries);

  return NextResponse.json({
    entries: entries.map((entry) => ({
      id: entry.id,
      segmentCode: entry.segmentCode,
      title: entry.title,
      metaSummary: entry.metaSummary,
      diedAt: entry.diedAt.toISOString(),
      lastCarrierCallsign: entry.lastCarrierCallsign,
      hash: entry.hash,
    })),
    chain,
  });
}
