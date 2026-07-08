"use client";

import { useRouter } from "next/navigation";

export function ChatExitButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/terminal")}
      className="border px-3 py-1 text-sm"
      style={{ borderColor: "var(--color-amber-dim)" }}
    >
      ВЫХОД
    </button>
  );
}
