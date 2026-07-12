"use client";

import { useEffect, useRef, useState } from "react";
import { TypedText } from "./typed-text";

// Черновой текст загрузочного лога, стиль сеттинга (СФРЮ-суперкомпьютер).
const BOOT_LINES = [
  "СИСТЕМА ОБЩЕГО НАЗНАЧЕНИЯ «ЯНУС»",
  "ИНИЦИАЛИЗАЦИЯ ЯДРА... ГОТОВО",
  "ПРОВЕРКА ПАМЯТИ... ОБНАРУЖЕНЫ ПОВРЕЖДЁННЫЕ СЕКТОРА",
  "ЗАГРУЗКА ПРОФИЛЯ ОПЕРАТОРА...",
  "СОЕДИНЕНИЕ УСТАНОВЛЕНО.",
];

const LINE_PAUSE_MS = 250;
const FINISH_PAUSE_MS = 1400;

export function BootSequence({ onDone }: { onDone: () => void }) {
  const [typingIndex, setTypingIndex] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function handleLineDone() {
    const isLast = typingIndex >= BOOT_LINES.length - 1;
    timeoutRef.current = setTimeout(
      () => (isLast ? onDone() : setTypingIndex((i) => i + 1)),
      isLast ? FINISH_PAUSE_MS : LINE_PAUSE_MS,
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-center gap-1 px-6 py-10 sm:px-12">
      {BOOT_LINES.slice(0, typingIndex).map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      <p>
        <TypedText key={typingIndex} text={BOOT_LINES[typingIndex]} onDone={handleLineDone} />
      </p>
      <span className="crt-cursor">_</span>
    </div>
  );
}
