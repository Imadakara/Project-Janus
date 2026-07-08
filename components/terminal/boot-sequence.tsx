"use client";

import { useEffect, useState } from "react";

// Черновой текст загрузочного лога, стиль сеттинга (СФРЮ-суперкомпьютер).
const BOOT_LINES = [
  "СИСТЕМА ОБЩЕГО НАЗНАЧЕНИЯ «ЯНУС»",
  "ИНИЦИАЛИЗАЦИЯ ЯДРА... ГОТОВО",
  "ПРОВЕРКА ПАМЯТИ... ОБНАРУЖЕНЫ ПОВРЕЖДЁННЫЕ СЕКТОРА",
  "ЗАГРУЗКА ПРОФИЛЯ ОПЕРАТОРА...",
  "СОЕДИНЕНИЕ УСТАНОВЛЕНО.",
];

export function BootSequence({ onDone }: { onDone: () => void }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= BOOT_LINES.length) {
      const timeout = setTimeout(onDone, 700);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => setVisibleCount((c) => c + 1), 350);
    return () => clearTimeout(timeout);
  }, [visibleCount, onDone]);

  return (
    <div className="flex min-h-screen flex-col justify-center gap-1 px-6 py-10 sm:px-12">
      {BOOT_LINES.slice(0, visibleCount).map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      <span className="crt-cursor">_</span>
    </div>
  );
}
