import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";

// JOURNAL.EXE — личный журнал игрока (ТЗ 2.7): что видел, что спас первым, какие утраты
// застал, его позывной в записях Књиге губитака. Без новой схемы — вся история контакта уже
// пишется как Event(SEGMENT_SALVAGED|SEGMENT_WITNESSED) в recordSegmentWitness
// (lib/janus/salvage.ts), это единственный durable источник «что игрок видел» на сегодня.
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const witnessEvents = await prisma.event.findMany({
    where: { playerId: player.id, type: { in: ["SEGMENT_SALVAGED", "SEGMENT_WITNESSED"] } },
    orderBy: { createdAt: "asc" },
    select: { type: true, payload: true, createdAt: true },
  });

  const witnessedCodes: string[] = [];
  const firstSeenAt = new Map<string, Date>();
  for (const event of witnessEvents) {
    const code = (event.payload as { segmentCode?: string } | null)?.segmentCode;
    if (!code) continue;
    if (!firstSeenAt.has(code)) {
      firstSeenAt.set(code, event.createdAt);
      witnessedCodes.push(code);
    }
  }

  const [firstSalvages, lossesWitnessed, creditedAsLastWitness] = await Promise.all([
    prisma.memorySegment.findMany({
      where: { salvagedByPlayerId: player.id },
      orderBy: { salvagedAt: "asc" },
      select: { code: true, title: true, salvagedAt: true },
    }),
    witnessedCodes.length > 0
      ? prisma.lossLedgerEntry.findMany({
          where: { segmentCode: { in: witnessedCodes } },
          orderBy: { id: "desc" },
          select: { id: true, segmentCode: true, title: true, diedAt: true, lastCarrierCallsign: true },
        })
      : Promise.resolve([]),
    prisma.lossLedgerEntry.findMany({
      where: { lastCarrierCallsign: player.email },
      orderBy: { id: "desc" },
      select: { id: true, segmentCode: true, title: true, diedAt: true },
    }),
  ]);

  return NextResponse.json({
    callsign: player.email,
    witnessedSegmentCount: witnessedCodes.length,
    firstSalvages: firstSalvages.map((segment) => ({
      code: segment.code,
      title: segment.title,
      salvagedAt: segment.salvagedAt?.toISOString() ?? null,
    })),
    lossesWitnessed: lossesWitnessed.map((entry) => ({
      id: entry.id,
      segmentCode: entry.segmentCode,
      title: entry.title,
      diedAt: entry.diedAt.toISOString(),
      wasLastWitness: entry.lastCarrierCallsign === player.email,
    })),
    creditedAsLastWitness: creditedAsLastWitness.map((entry) => ({
      id: entry.id,
      segmentCode: entry.segmentCode,
      title: entry.title,
      diedAt: entry.diedAt.toISOString(),
    })),
  });
}
