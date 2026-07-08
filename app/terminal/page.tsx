import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth/server";
import { ROLE_LABELS } from "@/lib/auth/role";
import { TerminalHub } from "./terminal-hub";

export default async function TerminalPage() {
  const player = await getCurrentPlayer();
  if (!player) {
    redirect("/login");
  }

  return <TerminalHub email={player.email} roleLabel={ROLE_LABELS[player.role]} />;
}
