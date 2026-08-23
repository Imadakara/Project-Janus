import { redirect } from "next/navigation";
import { getCurrentPlayerId } from "@/lib/auth/server";
import { JournalScreen } from "./journal-screen";

export default async function JournalPage() {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  return <JournalScreen />;
}
