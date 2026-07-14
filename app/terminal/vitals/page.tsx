import { redirect } from "next/navigation";
import { getCurrentPlayerId } from "@/lib/auth/server";
import { VitalsScreen } from "./vitals-screen";

export default async function VitalsPage() {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  return <VitalsScreen />;
}
