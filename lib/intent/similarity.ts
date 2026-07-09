import { prisma } from "@/lib/db";
import { toVectorLiteral } from "@/lib/embeddings/client";

export type IntentMatch = { code: string; distance: number };

// На MVP-масштабе (единицы intent'ов, 5-10 примеров на каждый) брутфорс без ANN-индекса
// достаточно быстр — группируем по intent'у и берём ближайший пример каждого, затем
// глобальный минимум по дистанции.
export async function findBestIntentMatch(vector: number[]): Promise<IntentMatch | null> {
  const rows = await prisma.$queryRaw<Array<{ code: string; distance: number }>>`
    SELECT i.code AS code, MIN(ie.embedding <=> ${toVectorLiteral(vector)}::vector) AS distance
    FROM "IntentExample" ie
    JOIN "Intent" i ON i.id = ie."intentId"
    WHERE ie.embedding IS NOT NULL
    GROUP BY i.code
    ORDER BY distance ASC
    LIMIT 1
  `;

  const row = rows[0];
  return row ? { code: row.code, distance: row.distance } : null;
}
