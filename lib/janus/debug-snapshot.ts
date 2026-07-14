// Снапшот для секции «ЯНУС» дебаг-панели: каждый дебаг-роут (/api/debug/janus/*) возвращает
// его после своей мутации, чтобы панель обновлялась мгновенно без второго запроса.

import { prisma } from "@/lib/db";
import { getJanusState, type JanusStateSnapshot } from "./state";

export type JanusDebugSegment = {
  code: string;
  tier: "CORE" | "PERIPHERAL";
  status: "ALIVE" | "DEGRADED" | "DEAD";
  k: number;
  sharesAlive: number;
  sharesTarget: number;
};

export type JanusDebugSnapshot = {
  state: JanusStateSnapshot;
  segments: JanusDebugSegment[];
};

export async function getJanusDebugSnapshot(): Promise<JanusDebugSnapshot> {
  const [state, segments] = await Promise.all([
    getJanusState(),
    prisma.memorySegment.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true,
        tier: true,
        status: true,
        k: true,
        sharesAlive: true,
        sharesTarget: true,
      },
    }),
  ]);
  return { state, segments };
}
