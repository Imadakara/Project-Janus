import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/auth/server";
import { trackEvent } from "@/lib/analytics/track";

function normalizePath(raw: string | null): string {
  if (!raw || raw === "") return "/";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export async function GET(request: Request) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const path = normalizePath(searchParams.get("path"));
  const parentPath = path === "/" ? null : path;

  const [folders, files] = await Promise.all([
    prisma.terminalFolder.findMany({
      where: {
        parentPath,
        OR: [{ visibleToRole: null }, { visibleToRole: player.role }],
      },
      orderBy: { name: "asc" },
    }),
    prisma.terminalFile.findMany({
      where: {
        folderPath: path,
        OR: [{ visibleToRole: null }, { visibleToRole: player.role }],
      },
      select: {
        id: true,
        filename: true,
        extension: true,
        requiredModuleKey: true,
      },
      orderBy: { filename: "asc" },
    }),
  ]);

  await trackEvent("FILE_MANAGER_OPENED", player.id, { path });

  return NextResponse.json({
    path,
    folders: folders.map((f) => ({ path: f.path, name: f.name })),
    files,
  });
}
