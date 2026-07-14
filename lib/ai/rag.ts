import type { Role } from "@/app/generated/prisma/client";
import { embedText, toVectorLiteral } from "@/lib/embeddings/client";
import { prisma } from "@/lib/db";

export type RagResult = { fileId: string; filename: string; snippet: string };

// Итог поиска: либо сниппеты живых материалов, либо маркер утраты — топ семантического
// поиска пришёлся на tombstone мёртвого сегмента (ТЗ 1.3). Маркер перехватывается в
// app/api/chat/route.ts детерминированным ответом MEMORY_LOST до вызова провайдера.
export type RagSearchOutcome =
  { kind: "hits"; results: RagResult[] } | { kind: "lost"; segmentCode: string };

const SNIPPET_LENGTH = 400;

// Порог косинусной дистанции, ближе которого tombstone считается «попаданием в утраченное».
// Калибровка по живым замерам (приёмка Фазы 1, multilingual-MiniLM): прямой вопрос о
// содержимом сегмента ≈0.45, тематически близкий ≈0.60, нерелевантный ≈1.0. Менять в одном месте.
export const MEMORY_LOST_MAX_DISTANCE = 0.6;

// Чистый решатель (юнит-тестируется без БД): вопрос считается попавшим в мёртвый сегмент,
// если tombstone ближе порога и ближе лучшего живого файла (или живых файлов нет вовсе).
export function isLostTopHit(
  bestFileDistance: number | null,
  tombstoneDistance: number | null,
  maxDistance: number,
): boolean {
  if (tombstoneDistance === null || tombstoneDistance > maxDistance) return false;
  return bestFileDistance === null || tombstoneDistance < bestFileDistance;
}

// RAG-фоллбэк для Слоя 3 (полный режим): семантический поиск по TerminalFile,
// отфильтрованный тем же правилом видимости, что уже используется в
// app/api/terminal/files/route.ts, и по модулям, реально разблокированным игроком
// (requiredModuleKey должен быть в unlockedModuleKeys — как в lib/modules/access.ts).
// Смертность памяти (Фаза 1): файлы мёртвых сегментов исключены (их эмбеддинги и так
// обнулены killSegment'ом — фильтр по status страхует окно между смертью и гигиеной),
// а tombstone-эмбеддинги мёртвых сегментов ищутся отдельно ради маркера утраты.
export async function searchUnlockedMaterials(
  query: string,
  unlockedModuleKeys: string[],
  playerRole: Role,
  limit = 3,
): Promise<RagSearchOutcome> {
  if (unlockedModuleKeys.length === 0) return { kind: "hits", results: [] };

  const vector = await embedText(query);
  const vectorLiteral = toVectorLiteral(vector);

  const [fileRows, tombstoneRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{ id: string; filename: string; fullContent: string; distance: number }>
    >`
      SELECT tf.id, tf.filename, tf."fullContent",
             tf.embedding <=> ${vectorLiteral}::vector AS distance
      FROM "TerminalFile" tf
      LEFT JOIN "MemorySegment" ms ON ms.id = tf."segmentId"
      WHERE tf."requiredModuleKey" = ANY(${unlockedModuleKeys})
        AND (tf."visibleToRole" IS NULL OR tf."visibleToRole" = ${playerRole}::"Role")
        AND tf.embedding IS NOT NULL
        AND (tf."segmentId" IS NULL OR ms.status = 'ALIVE')
      ORDER BY distance
      LIMIT ${limit}
    `,
    prisma.$queryRaw<Array<{ code: string; distance: number }>>`
      SELECT code, embedding <=> ${vectorLiteral}::vector AS distance
      FROM "MemorySegment"
      WHERE status = 'DEAD' AND embedding IS NOT NULL
      ORDER BY distance
      LIMIT 1
    `,
  ]);

  const tombstone = tombstoneRows[0] ?? null;
  const bestFileDistance = fileRows[0]?.distance ?? null;

  if (isLostTopHit(bestFileDistance, tombstone?.distance ?? null, MEMORY_LOST_MAX_DISTANCE)) {
    return { kind: "lost", segmentCode: tombstone!.code };
  }

  return {
    kind: "hits",
    results: fileRows.map((row) => ({
      fileId: row.id,
      filename: row.filename,
      snippet: row.fullContent.slice(0, SNIPPET_LENGTH),
    })),
  };
}
