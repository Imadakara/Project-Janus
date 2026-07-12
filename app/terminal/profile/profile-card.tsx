"use client";

import { useRouter } from "next/navigation";

type ProfileCardProps = {
  operatorId: string;
  email: string;
  roleLabel: string;
  trustLevel: number;
  activatedAt: string;
};

export function ProfileCard({
  operatorId,
  email,
  roleLabel,
  trustLevel,
  activatedAt,
}: ProfileCardProps) {
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col gap-6 px-6 py-10 sm:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg">ПРОФИЛЬ ОПЕРАТОРА</h1>
        <button
          type="button"
          onClick={() => router.push("/terminal")}
          className="border px-3 py-1 text-sm"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          ВЫХОД
        </button>
      </div>

      <div className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
        <dl className="flex flex-col gap-2">
          <div className="flex gap-4">
            <dt className="w-56 opacity-70">ID ОПЕРАТОРА</dt>
            <dd className="break-all">{operatorId}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-56 opacity-70">ПОЗЫВНОЙ</dt>
            <dd>{email}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-56 opacity-70">РОЛЬ</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-56 opacity-70">УРОВЕНЬ ДОВЕРИЯ</dt>
            <dd>{trustLevel}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-56 opacity-70">АКТИВАЦИЯ ПРОФИЛЯ</dt>
            <dd>{activatedAt}</dd>
          </div>
        </dl>
      </div>

      <button
        type="button"
        onClick={() => router.push("/terminal/modules")}
        className="w-fit border px-4 py-2"
        style={{ borderColor: "var(--color-amber-dim)" }}
      >
        MODULES
      </button>
    </main>
  );
}
