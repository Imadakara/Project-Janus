import "dotenv/config";
import { prisma } from "@/lib/db";
import seedFiles from "@/content/seed-files.json";
import type { Role } from "@/app/generated/prisma/client";

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

    if (existing) {
      await prisma.terminalFile.update({ where: { id: existing.id }, data });
    } else {
      await prisma.terminalFile.create({ data });
    }
  }

  console.log(
    `Seed complete: ${modules.length} modules, ${seedFiles.folders.length} folders, ${seedFiles.files.length} files.`,
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
