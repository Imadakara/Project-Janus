import type { Role } from "@/app/generated/prisma/client";
import { embedText, toVectorLiteral } from "@/lib/embeddings/client";
import { prisma } from "@/lib/db";

export type RagResult = { fileId: string; filename: string; snippet: string };

const SNIPPET_LENGTH = 400;

// RAG-фоллбэк для Слоя 3 (полный режим): семантический поиск по TerminalFile,
// отфильтрованный тем же правилом видимости, что уже используется в
// app/api/terminal/files/route.ts, и по модулям, реально разблокированным игроком
// (requiredModuleKey должен быть в unlockedModuleKeys — как в lib/modules/access.ts).
export async function searchUnlockedMaterials(
  query: string,
  unlockedModuleKeys: string[],
  playerRole: Role,
  limit = 3,
): Promise<RagResult[]> {
  if (unlockedModuleKeys.length === 0) return [];

  const vector = await embedText(query);

  const rows = await prisma.$queryRaw<Array<{ id: string; filename: string; fullContent: string }>>`
    SELECT id, filename, "fullContent"
    FROM "TerminalFile"
    WHERE "requiredModuleKey" = ANY(${unlockedModuleKeys})
      AND ("visibleToRole" IS NULL OR "visibleToRole" = ${playerRole}::"Role")
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${toVectorLiteral(vector)}::vector
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    fileId: row.id,
    filename: row.filename,
    snippet: row.fullContent.slice(0, SNIPPET_LENGTH),
  }));
}
