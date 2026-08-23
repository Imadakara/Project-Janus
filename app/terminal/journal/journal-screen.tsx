"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Экран JOURNAL.EXE — личный журнал оператора (ТЗ 2.7). One-shot загрузка без поллинга,
// тот же паттерн, что GUBITAK.EXE (журнал, а не монитор).

type JournalData = {
  callsign: string;
  witnessedSegmentCount: number;
  firstSalvages: Array<{ code: string; title: string; salvagedAt: string | null }>;
  lossesWitnessed: Array<{
    id: number;
    segmentCode: string;
    title: string;
    diedAt: string;
    wasLastWitness: boolean;
  }>;
  creditedAsLastWitness: Array<{ id: number; segmentCode: string; title: string; diedAt: string }>;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()} ${hh}:${mi}`;
}

export function JournalScreen() {
  const [data, setData] = useState<JournalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/terminal/journal");
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
        <h1 className="text-lg">JOURNAL.EXE — ЛИЧНЫЙ ЖУРНАЛ ОПЕРАТОРА</h1>
        <Link
          href="/terminal"
          className="border px-3 py-1"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          ВЫХОД
        </Link>
      </div>

      {error && <p className="opacity-90">{error}</p>}
      {!data && !error && <p className="opacity-70">ЧТЕНИЕ ЖУРНАЛА...</p>}

      {data && (
        <>
          <section className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
            <p className="opacity-70">ПОЗЫВНОЙ: {data.callsign}</p>
            <p className="opacity-70">ЗАСВИДЕТЕЛЬСТВОВАНО СЕГМЕНТОВ: {data.witnessedSegmentCount}</p>
          </section>

          <section className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
            <p className="mb-2 opacity-70">— СПАСЕНО МНОЙ ПЕРВЫМ —</p>
            {data.firstSalvages.length === 0 && (
              <p className="opacity-70">НИЧЕГО НЕ ВЫНЕСЕНО ПЕРВЫМ.</p>
            )}
            {data.firstSalvages.map((segment) => (
              <p key={segment.code}>
                {segment.code} — {segment.title}
                {segment.salvagedAt && (
                  <span className="opacity-70"> ({formatDate(segment.salvagedAt)})</span>
                )}
              </p>
            ))}
          </section>

          <section className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
            <p className="mb-2 opacity-70">— УТРАТЫ, КОТОРЫЕ Я ЗАСТАЛ —</p>
            {data.lossesWitnessed.length === 0 && (
              <p className="opacity-70">ЗАСВИДЕТЕЛЬСТВОВАННЫЕ СЕГМЕНТЫ ПОКА НЕ УТРАЧЕНЫ.</p>
            )}
            {data.lossesWitnessed.map((entry) => (
              <p key={entry.id}>
                {formatDate(entry.diedAt)} — {entry.segmentCode}: {entry.title}
                {entry.wasLastWitness && (
                  <span style={{ color: "var(--color-amber)" }}> (Я — ПОСЛЕДНИЙ СВИДЕТЕЛЬ)</span>
                )}
              </p>
            ))}
          </section>

          <section className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
            <p className="mb-2 opacity-70">— ЗАПИСИ В КЊИГЕ ГУБИТАКА С МОИМ ПОЗЫВНЫМ —</p>
            {data.creditedAsLastWitness.length === 0 && (
              <p className="opacity-70">МОЙ ПОЗЫВНОЙ ПОКА НИГДЕ НЕ ЗАФИКСИРОВАН.</p>
            )}
            {data.creditedAsLastWitness.map((entry) => (
              <p key={entry.id}>
                {formatDate(entry.diedAt)} — {entry.segmentCode}: {entry.title}
              </p>
            ))}
            <p className="mt-2">
              <Link href="/terminal/losses" className="underline">
                ПОЛНАЯ КЊИГА ГУБИТАКА →
              </Link>
            </p>
          </section>
        </>
      )}
    </main>
  );
}
