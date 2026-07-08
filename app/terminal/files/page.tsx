import { redirect } from "next/navigation";
import { getCurrentPlayerId } from "@/lib/auth/server";
import { FileManager } from "./file-manager";

export default async function FilesPage() {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  return <FileManager />;
}
