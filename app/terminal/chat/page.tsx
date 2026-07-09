import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getOrCreateActiveSession } from "@/lib/chat/session";
import { prisma } from "@/lib/db";
import { ChatClient } from "./chat-client";
import type { Disposition, ConfidenceTier } from "@/lib/scenario/types";

export default async function ChatPage() {
  const player = await getCurrentPlayer();
  if (!player) {
    redirect("/login");
  }

  const session = await getOrCreateActiveSession(player.id);
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <ChatClient
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ...(player.isDebug
          ? {
              handledByLayer: m.handledByLayer,
              matchedIntent: m.matchedIntent,
              intentConfidence: m.intentConfidence,
              escalationReason: m.escalationReason,
            }
          : {}),
      }))}
      isDebugUser={player.isDebug}
      initialSessionDebug={
        player.isDebug
          ? {
              desyncScore: session.desyncScore,
              lastConfidenceTier: session.lastConfidenceTier as ConfidenceTier | null,
              disposition: session.disposition as unknown as Disposition,
              activeContext: session.activeContext,
            }
          : null
      }
    />
  );
}
