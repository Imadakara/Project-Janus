import { prisma } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";

export async function trackEvent(
  type: string,
  playerId: string | null,
  payload?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.event.create({ data: { type, playerId, payload } });
  } catch (error) {
    console.error(`Failed to track event "${type}":`, error);
  }
}
