"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Экран GUBITAK.EXE — Книга потерь («Књига губитака», ТЗ 1.5). Журнал, а не монитор:
// one-shot загрузка без поллинга. Проверка хеш-цепочки выполняется на сервере
// (app/api/terminal/losses) — расхождение показывается явным баннером, не тихим пропуском.

type LossEntry = {
  id: number;
  segmentCode: string;
  title: string;
  metaSummary: string;
  diedAt: string;
  lastCarrierCallsign: string | null;
  hash: string;
};

type LossesData = {
  entries: LossEntry[];
  chain: { valid: true } | { valid: false; brokenAtIndex: number };
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()} ${hh}:${mi}`;
}

export function LossesScreen() {
  const [data, setData] = useState<LossesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/terminal/losses");
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(payload.error ?? "ОШИБКА СВЯЗИ.");
          return;
        }
        setData(payload);
      } catch {
        if (!cancelled) setError("ОШИБКА СВЯЗИ.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col gap-6 px-6 py-8 sm:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg">GUBITAK.EXE — КЊИГА ГУБИТАКА</h1>
        <Link
          href="/terminal"
          className="border px-3 py-1"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          ВЫХОД
        </Link>
      </div>

      {error && <p className="opacity-90">{error}</p>}
      {!data && !error && <p className="opacity-70">ЧТЕНИЕ РЕЕСТРА ПОТЕРЬ...</p>}

      {data && !data.chain.valid && (
        <div
          className="border p-4"
          style={{ borderColor: "var(--color-amber)", background: "rgba(255,0,0,0.15)" }}
        >
          <p className="text-lg">!! НАРУШЕНИЕ ЦЕЛОСТНОСТИ РЕЕСТРА !!</p>
          <p>
            ХЕШ-ЦЕПОЧКА РАЗОРВАНА НА ЗАПИСИ #{data.chain.brokenAtIndex + 1}. ИСТОРИЯ ПОТЕРЬ МОГЛА
            БЫТЬ ПЕРЕПИСАНА ЗАДНИМ ЧИСЛОМ.
          </p>
        </div>
      )}

      {data && data.entries.length === 0 && (
        <p className="opacity-70">РЕЕСТР ПУСТ. СИСТЕМА ЕЩЁ НИЧЕГО НЕ ПОТЕРЯЛА БЕЗВОЗВРАТНО.</p>
      )}

      {data &&
        data.entries.map((entry) => (
          <section
            key={entry.id}
            className="border p-4"
            style={{ borderColor: "var(--color-amber-dim)" }}
          >
            <p className="text-lg">
              #{entry.id} {entry.segmentCode} — {entry.title}
            </p>
            <p className="opacity-70">ВРЕМЯ СМЕРТИ: {formatDate(entry.diedAt)}</p>
            <p>{entry.metaSummary}</p>
            {entry.lastCarrierCallsign ? (
              <p className="opacity-70">ПОСЛЕДНИЙ СВИДЕТЕЛЬ: {entry.lastCarrierCallsign}</p>
            ) : (
              // Никто не читал сегмент до утраты (ТЗ 2.8) — явный маркер, не тихая
              // заглушка: снижает потолок счётчика спасённого навсегда (lib/janus/salvage.ts).
              <p style={{ color: "var(--color-amber)" }}>!! НИКТО НЕ УСПЕЛ !!</p>
            )}
            <p className="text-xs opacity-50">SHA-256: {entry.hash.slice(0, 16)}…</p>
          </section>
        ))}
    </main>
  );
}
