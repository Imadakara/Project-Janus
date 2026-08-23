// Снапшот для секции «ЯНУС» дебаг-панели: каждый дебаг-роут (/api/debug/janus/*) возвращает
// его после своей мутации, чтобы панель обновлялась мгновенно без второго запроса.

import { prisma } from "@/lib/db";
import { getDebugTimeOffsetMs } from "./clock";
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
  // Виртуальные часы (ТЗ 2.11) — панель обязана показывать текущее смещение и производное
  // от него время, а не только «выставленное значение», без второго запроса.
  debugTimeOffsetMs: number;
  virtualNow: string;
};

export async function getJanusDebugSnapshot(): Promise<JanusDebugSnapshot> {
  const [state, segments, debugTimeOffsetMs] = await Promise.all([
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
    getDebugTimeOffsetMs(),
  ]);
  return {
    state,
    segments,
    debugTimeOffsetMs,
    // Та же формула, что clock.ts::now() — не вызываем его повторно только чтобы не платить
    // вторым обращением к БД за одно и то же значение debugTimeOffsetMs.
    virtualNow: new Date(Date.now() + debugTimeOffsetMs).toISOString(),
  };
}
