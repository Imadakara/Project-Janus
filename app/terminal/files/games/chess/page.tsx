import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth/server";
import { getUnlockedModuleKeys } from "@/lib/modules/unlocks";
import { hasModuleAccess } from "@/lib/modules/access";
import { ChessGame } from "./chess-game";

export default async function ChessPage() {
  const player = await getCurrentPlayer();
  if (!player) {
    redirect("/login");
  }

  const unlockedModuleKeys = await getUnlockedModuleKeys(player.id);
  if (!hasModuleAccess(unlockedModuleKeys, "CHESS")) {
    redirect("/terminal/files");
  }

  return <ChessGame />;
}
