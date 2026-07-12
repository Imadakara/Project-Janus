import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth/server";
import { ROLE_LABELS } from "@/lib/auth/role";
import { ProfileCard } from "./profile-card";

function formatDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()}`;
}

export default async function ProfilePage() {
  const player = await getCurrentPlayer();
  if (!player) {
    redirect("/login");
  }

  return (
    <ProfileCard
      operatorId={player.id}
      email={player.email}
      roleLabel={ROLE_LABELS[player.role]}
      trustLevel={player.trustLevel}
      activatedAt={formatDate(player.createdAt)}
    />
  );
}
