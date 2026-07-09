import "dotenv/config";
import { prisma } from "@/lib/db";
import seedFiles from "@/content/seed-files.json";
import intentsData from "@/content/intents.json";
import responsePoolsData from "@/content/response-pools.json";
import { embedText, toVectorLiteral } from "@/lib/embeddings/client";
import type { Role, ResponsePoolType } from "@/app/generated/prisma/client";

async function main() {
  const modules = [
    {
      key: "FILE_MANAGER",
      name: "МЕНЕДЖЕР ФАЙЛОВ",
      description: "Навигация по файловой системе терминала.",
      isDefault: true,
    },
    {
      key: "FILE_ANALYZER",
      name: "АНАЛИЗАТОР ФАЙЛОВ",
      description: "Грубый автоматический разбор файла неизвестного формата.",
      isDefault: true,
    },
    {
      key: "TEXT_VIEWER",
      name: "ТЕКСТОВЫЙ ПРОСМОТРЩИК",
      description: "Полное отображение текстовых файлов.",
      isDefault: true,
    },
    {
      key: "MAP_VIEWER",
      name: "ПРОСМОТРЩИК КАРТ",
      description: "Визуализация тактических карт (.TAC). Не реализован в MVP.",
      isDefault: false,
    },
    {
      key: "SEARCH",
      name: "ПОИСК",
      description: "Полнотекстовый поиск по архиву терминала. Не реализован в MVP.",
      isDefault: false,
    },
    {
      key: "MEMORY_MANAGER",
      name: "МЕНЕДЖЕР ПАМЯТИ",
      description:
        "Диагностика и восстановление повреждённых секторов памяти. Не реализован в MVP.",
      isDefault: false,
    },
  ];

  for (const mod of modules) {
    await prisma.commandModule.upsert({
      where: { key: mod.key },
      create: mod,
      update: mod,
    });
  }

  for (const folder of seedFiles.folders) {
    await prisma.terminalFolder.upsert({
      where: { path: folder.path },
      create: {
        path: folder.path,
        name: folder.name,
        parentPath: folder.parentPath,
        visibleToRole: folder.visibleToRole as Role | null,
      },
      update: {
        name: folder.name,
        parentPath: folder.parentPath,
        visibleToRole: folder.visibleToRole as Role | null,
      },
    });
  }

  for (const file of seedFiles.files) {
    const existing = await prisma.terminalFile.findFirst({
      where: { folderPath: file.folderPath, filename: file.filename, extension: file.extension },
    });

    const data = {
      folderPath: file.folderPath,
      filename: file.filename,
      extension: file.extension,
      requiredModuleKey: file.requiredModuleKey,
      fullContent: file.fullContent,
      analysisSummary: file.analysisSummary,
      visibleToRole: file.visibleToRole as Role | null,
    };

    const terminalFile = existing
      ? await prisma.terminalFile.update({ where: { id: existing.id }, data })
      : await prisma.terminalFile.create({ data });

    // RAG-фоллбэк Слоя 3 (lib/ai/rag.ts) ищет по этому эмбеддингу — считается один раз
    // при сиде, не в рантайме.
    const fileVector = await embedText(file.fullContent);
    await prisma.$executeRaw`
      UPDATE "TerminalFile" SET embedding = ${toVectorLiteral(fileVector)}::vector WHERE id = ${terminalFile.id}
    `;
  }

  // --- Гибридный диалоговый движок: intent'ы, эталонные фразы, пулы ответов ---

  const intentIdByCode = new Map<string, string>();

  for (const intentDef of intentsData.intents) {
    const intent = await prisma.intent.upsert({
      where: { code: intentDef.code },
      create: { code: intentDef.code, description: intentDef.description },
      update: { description: intentDef.description },
    });
    intentIdByCode.set(intentDef.code, intent.id);

    for (const phrase of intentDef.examples) {
      const example = await prisma.intentExample.upsert({
        where: { intentId_phrase: { intentId: intent.id, phrase } },
        create: { intentId: intent.id, phrase },
        update: {},
      });

      const vector = await embedText(phrase);
      await prisma.$executeRaw`
        UPDATE "IntentExample" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${example.id}
      `;
    }
  }

  let poolCount = 0;
  let fragmentCount = 0;

  for (const poolDef of responsePoolsData.pools) {
    const intentId = intentIdByCode.get(poolDef.intentCode);
    if (!intentId) {
      throw new Error(`response-pools.json ссылается на неизвестный intent: ${poolDef.intentCode}`);
    }

    // Prisma не даёт использовать null внутри composite-unique where (requiredRole
    // nullable) — ищем и создаём/обновляем вручную, как для TerminalFile выше.
    const poolRequiredRole = poolDef.requiredRole as Role | null;
    const existingPool = await prisma.responsePool.findFirst({
      where: { intentId, type: poolDef.type as ResponsePoolType, requiredRole: poolRequiredRole },
    });
    const pool = existingPool
      ? existingPool
      : await prisma.responsePool.create({
          data: {
            intentId,
            type: poolDef.type as ResponsePoolType,
            requiredRole: poolRequiredRole,
          },
        });
    poolCount += 1;

    // ResponseFragment не имеет естественного ключа — пересобираем содержимое пула
    // из JSON при каждом запуске сида (это чистый контент без зависимой истории).
    await prisma.responseFragment.deleteMany({ where: { poolId: pool.id } });
    await prisma.responseFragment.createMany({
      data: poolDef.fragments.map((template) => ({ poolId: pool.id, template })),
    });
    fragmentCount += poolDef.fragments.length;
  }

  console.log(
    `Seed complete: ${modules.length} modules, ${seedFiles.folders.length} folders, ${seedFiles.files.length} files, ` +
      `${intentsData.intents.length} intents, ${poolCount} response pools, ${fragmentCount} fragments.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
