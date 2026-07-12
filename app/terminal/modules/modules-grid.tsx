"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isModuleImplemented } from "@/lib/modules/registry";

type ModuleEntry = { key: string; name: string; description: string };

const SLOT_COUNT = 9;

export function ModulesGrid() {
  const router = useRouter();
  const [modules, setModules] = useState<ModuleEntry[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/terminal/modules")
      .then((res) => res.json())
      .then((data) => setModules(data.modules ?? []))
      .catch(() => setModules([]));
  }, []);

  const sorted = [...(modules ?? [])].sort((a, b) => a.key.localeCompare(b.key));
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => sorted[i] ?? null);
  const selected = sorted.find((m) => m.key === selectedKey) ?? null;

  function select(module: ModuleEntry) {
    setSelectedKey(module.key);
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 px-6 py-10 sm:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg">УСТАНОВЛЕННЫЕ МОДУЛИ</h1>
        <button
          type="button"
          onClick={() => router.push("/terminal/profile")}
          className="border px-3 py-1 text-sm"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          ВЫХОД
        </button>
      </div>

      <div className="grid w-fit grid-cols-3 gap-3">
        {slots.map((module, index) => (
          <button
            key={module?.key ?? `empty-${index}`}
            type="button"
            disabled={!module}
            onClick={() => module && select(module)}
            className="flex h-24 w-40 flex-col items-center justify-center gap-1 border p-2 text-center text-sm disabled:opacity-30"
            style={{
              borderColor: "var(--color-amber-dim)",
              ...(module && module.key === selectedKey
                ? { background: "var(--color-amber)", color: "var(--color-crt-bg)" }
                : {}),
            }}
          >
            <span>{module ? module.name : "СВОБОДНЫЙ СЛОТ"}</span>
            {module && !isModuleImplemented(module.key) && (
              <span className="text-xs opacity-70">[НЕ АКТИВИРОВАН]</span>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
          <p className="mb-2">{selected.name}</p>
          <p className="opacity-70">{selected.description}</p>
          {!isModuleImplemented(selected.key) && (
            <p className="mt-3">МОДУЛЬ УСТАНОВЛЕН, НО НЕ АКТИВИРОВАН.</p>
          )}
        </div>
      )}
    </main>
  );
}
