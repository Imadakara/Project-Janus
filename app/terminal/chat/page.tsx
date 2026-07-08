import { redirect } from "next/navigation";
import { getCurrentPlayerId } from "@/lib/auth/server";
import { ChatExitButton } from "./chat-exit-button";

// Полноценный диалоговый движок ИИ — предмет Фазы 4. Пока — заглушка экрана.
export default async function ChatPage() {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col gap-4 px-6 py-8 sm:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg">ДИАЛОГ С ИИ</h1>
        <ChatExitButton />
      </div>
      <p className="opacity-70">МОДУЛЬ В РАЗРАБОТКЕ. [TODO: Фаза 4 — диалоговый движок ИИ]</p>
    </main>
  );
}
