"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
        setError(data?.error ?? "Не удалось зарегистрироваться.");
        return;
      }

      router.push("/terminal");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-neutral-100">
      <div className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-950 p-8">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-wide">
          РЕГИСТРАЦИЯ ОПЕРАТОРА
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-neutral-700 bg-black px-3 py-2 text-neutral-100 outline-none focus:border-neutral-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Пароль (минимум 8 символов)
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-neutral-700 bg-black px-3 py-2 text-neutral-100 outline-none focus:border-neutral-400"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded bg-neutral-100 py-2 font-medium text-black transition hover:bg-neutral-300 disabled:opacity-50"
          >
            {isSubmitting ? "Создание..." : "Создать аккаунт"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-neutral-400">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-neutral-100 underline">
            Войти
          </Link>
        </p>
      </div>
    </main>
  );
}
