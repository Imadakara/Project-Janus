import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth/server";
import { LogoutButton } from "./logout-button";

// Временный экран хаба — полноценная терминальная оболочка (Фаза 3) заменит эту страницу.
export default async function TerminalPage() {
  const player = await getCurrentPlayer();
  if (!player) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-4 text-neutral-100">
      <div className="text-center">
        <p className="text-sm text-neutral-400">ПОЗЫВНОЙ: {player.email}</p>
        <p className="text-sm text-neutral-400">РОЛЬ: {player.role}</p>
      </div>
      <LogoutButton />
    </main>
  );
}
