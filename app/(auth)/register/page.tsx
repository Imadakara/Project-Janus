"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { JUST_AUTHENTICATED_KEY } from "@/lib/auth/boot-flag";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "НЕ УДАЛОСЬ ЗАРЕГИСТРИРОВАТЬСЯ.");
        return;
      }

      sessionStorage.setItem(JUST_AUTHENTICATED_KEY, "1");
      router.push("/terminal");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm border p-8" style={{ borderColor: "var(--color-amber-dim)" }}>
        <h1 className="mb-6 text-center text-xl tracking-wide">РЕГИСТРАЦИЯ ОПЕРАТОРА</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            EMAIL:
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border bg-transparent px-3 py-2 outline-none"
              style={{ borderColor: "var(--color-amber-dim)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ПАРОЛЬ (МИНИМУМ 8 СИМВОЛОВ):
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border bg-transparent px-3 py-2 outline-none"
              style={{ borderColor: "var(--color-amber-dim)" }}
            />
          </label>
          {error && <p className="text-sm">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 border py-2 disabled:opacity-50"
            style={{ borderColor: "var(--color-amber-dim)" }}
          >
            {isSubmitting ? "СОЗДАНИЕ..." : "СОЗДАТЬ АККАУНТ"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm opacity-70">
          УЖЕ ЕСТЬ АККАУНТ?{" "}
          <Link href="/login" className="underline">
            ВОЙТИ
          </Link>
        </p>
      </div>
    </main>
  );
}
