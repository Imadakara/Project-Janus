import { redirect } from "next/navigation";
import { getCurrentPlayerId } from "@/lib/auth/server";
import { LossesScreen } from "./losses-screen";

export default async function LossesPage() {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  return <LossesScreen />;
}
