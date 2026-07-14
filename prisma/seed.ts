import "dotenv/config";
import { prisma } from "@/lib/db";
import seedFiles from "@/content/seed-files.json";
import intentsData from "@/content/intents.json";
import responsePoolsData from "@/content/response-pools.json";
import memorySegmentsData from "@/content/memory-segments.json";
import { embedText, toVectorLiteral } from "@/lib/embeddings/client";
import { hashPassword } from "@/lib/auth/password";
import { recomputeDerivedState } from "@/lib/janus/state";
import type {
  MemoryClass,
  MemoryTier,
  Role,
  ResponsePoolType,
} from "@/app/generated/prisma/client";

const DEBUG_PLAYER_EMAIL = "test@example.com";
const DEBUG_PLAYER_PASSWORD = "testpassword123";

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
      key: "CHESS",
      name: "CHESS",
      description: "Шахматы против искусственного интеллекта.",
      isDefault: true,
    },
    {
      key: "PULS",
      name: "PULS",
      description: "Монитор жизненных показателей системы и прогноз отказа ядра.",
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

  // --- Тестовый дебаг-аккаунт (панель отладки гибридного движка в /terminal/chat) ---
  const existingDebugPlayer = await prisma.player.findUnique({
    where: { email: DEBUG_PLAYER_EMAIL },
  });
  if (existingDebugPlayer) {
    await prisma.player.update({
      where: { id: existingDebugPlayer.id },
      data: { isDebug: true },
    });
  } else {
    const defaultModuleKeys = modules.filter((mod) => mod.isDefault).map((mod) => mod.key);
    await prisma.player.create({
      data: {
        email: DEBUG_PLAYER_EMAIL,
        passwordHash: await hashPassword(DEBUG_PLAYER_PASSWORD),
        role: "ARCHIVIST",
        isDebug: true,
        moduleUnlocks: { create: defaultModuleKeys.map((moduleKey) => ({ moduleKey })) },
      },
    });
  }

  // Бэкафилл: игроки, зарегистрированные до появления нового isDefault-модуля (например
  // CHESS), не получают его автоматически при повторном запуске сида — добираем недостающие
  // разблокировки вручную для всех существующих аккаунтов.
  const defaultModuleKeys = modules.filter((mod) => mod.isDefault).map((mod) => mod.key);
  const allPlayers = await prisma.player.findMany({ select: { id: true } });
  for (const player of allPlayers) {
    for (const moduleKey of defaultModuleKeys) {
      await prisma.playerModuleUnlock.upsert({
        where: { playerId_moduleKey: { playerId: player.id, moduleKey } },
        create: { playerId: player.id, moduleKey },
        update: {},
      });
    }
  }

  // --- Смертные сегменты памяти (Фаза 1, ТЗ 1.1) ---
  // Сидятся ДО файлового цикла: файлам нужен segmentId, а файлы мёртвых сегментов нельзя
  // ре-эмбеддить (иначе повторный сид воскресит RAG-индекс — нарушение необратимости).
  const deadSegmentFileKeys = new Set<string>();
  const segmentIdByFileKey = new Map<string, string>();
  const fileKeyOf = (folderPath: string, filename: string) => `${folderPath}|${filename}`;

  for (const segmentDef of memorySegmentsData.segments) {
    const existingSegment = await prisma.memorySegment.findUnique({
      where: { code: segmentDef.code },
    });

    // Мёртвый сегмент неприкосновенен: ни метаполя, ни tombstone, ни эмбеддинги файлов.
    // Смерть необратима на уровне кода (lib/janus/death.ts), сид не исключение.
    if (existingSegment && existingSegment.status === "DEAD") {
      for (const fileRef of segmentDef.files) {
        const key = fileKeyOf(fileRef.folderPath, fileRef.filename);
        deadSegmentFileKeys.add(key);
        segmentIdByFileKey.set(key, existingSegment.id);
      }
      continue;
    }

    // Рантайм-состояние (sharesAlive, status, diedAt) сид никогда не перезаписывает —
    // только метаполя из контента. sharesAlive задаётся один раз при создании.
    const segmentMeta = {
      class: segmentDef.class as MemoryClass,
      tier: segmentDef.tier as MemoryTier,
      k: segmentDef.k,
      sharesTarget: segmentDef.sharesTarget,
      title: segmentDef.title,
      metaSummary: segmentDef.metaSummary,
    };

    const segment = existingSegment
      ? await prisma.memorySegment.update({ where: { id: existingSegment.id }, data: segmentMeta })
      : await prisma.memorySegment.create({
          data: {
            code: segmentDef.code,
            sharesAlive: segmentDef.sharesAliveInitial,
            ...segmentMeta,
          },
        });

    // Tombstone-эмбеддинг от публичных метаданных (title+metaSummary): нужен, чтобы RAG
    // распознавал вопрос про утраченный сегмент после смерти (lib/ai/rag.ts). Содержимого
    // файлов не содержит — гигиена индекса соблюдена. Плейсхолдер-маркеры вырезаются:
    // одинаковый [TODO:...]-префикс во всех текстах стягивает эмбеддинги друг к другу и
    // ломает калибровку порога MEMORY_LOST_MAX_DISTANCE (замерено при приёмке Фазы 1).
    const tombstoneText = `${segmentDef.title}\n${segmentDef.metaSummary}`.replaceAll(
      "[TODO: заменить финальным текстом от нарративного дизайнера]",
      "",
    );
    const tombstoneVector = await embedText(tombstoneText.trim());
    await prisma.$executeRaw`
      UPDATE "MemorySegment" SET embedding = ${toVectorLiteral(tombstoneVector)}::vector WHERE id = ${segment.id}
    `;

    for (const fileRef of segmentDef.files) {
      segmentIdByFileKey.set(fileKeyOf(fileRef.folderPath, fileRef.filename), segment.id);
    }
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

    const fileKey = fileKeyOf(file.folderPath, file.filename);
    const data = {
      folderPath: file.folderPath,
      filename: file.filename,
      extension: file.extension,
      requiredModuleKey: file.requiredModuleKey,
      fullContent: file.fullContent,
      analysisSummary: file.analysisSummary,
      visibleToRole: file.visibleToRole as Role | null,
      segmentId: segmentIdByFileKey.get(fileKey) ?? null,
    };

    const terminalFile = existing
      ? await prisma.terminalFile.update({ where: { id: existing.id }, data })
      : await prisma.terminalFile.create({ data });

    // RAG-фоллбэк Слоя 3 (lib/ai/rag.ts) ищет по этому эмбеддингу — считается один раз
    // при сиде, не в рантайме. Файлы мёртвых сегментов НЕ ре-эмбеддятся: killSegment
    // обнулил их индекс навсегда, повторный сид не имеет права его воскрешать
    // (fullContent при этом обновлять можно — шифрование контента появится в Фазе 2,
    // гигиена Фазы 1 касается только поискового слоя).
    if (!deadSegmentFileKeys.has(fileKey)) {
      const fileVector = await embedText(file.fullContent);
      await prisma.$executeRaw`
        UPDATE "TerminalFile" SET embedding = ${toVectorLiteral(fileVector)}::vector WHERE id = ${terminalFile.id}
      `;
    }
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

  // Глобальное состояние ЯНУСа: ensure-row (id=1) + пересчёт производных (integrityIndex,
  // прогноз отказа ядра) — прогноз должен гореть на PULS сразу после сида.
  const janusState = await recomputeDerivedState();

  console.log(
    `Seed complete: ${modules.length} modules, ${seedFiles.folders.length} folders, ${seedFiles.files.length} files, ` +
      `${intentsData.intents.length} intents, ${poolCount} response pools, ${fragmentCount} fragments, ` +
      `${memorySegmentsData.segments.length} memory segments, ` +
      `forecastDeathAt=${janusState.forecastDeathAt?.toISOString() ?? "null"}, ` +
      `debug account ${DEBUG_PLAYER_EMAIL}.`,
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
