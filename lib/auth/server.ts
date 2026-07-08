import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export async function getCurrentPlayerId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  return session?.playerId ?? null;
}

export async function getCurrentPlayer() {
  const playerId = await getCurrentPlayerId();
  if (!playerId) return null;
  return prisma.player.findUnique({ where: { id: playerId } });
}
