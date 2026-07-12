import { redirect } from "next/navigation";
import { getCurrentPlayerId } from "@/lib/auth/server";
import { ModulesGrid } from "./modules-grid";

export default async function ModulesPage() {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  return <ModulesGrid />;
}
