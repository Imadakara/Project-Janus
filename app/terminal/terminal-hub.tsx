"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BootSequence } from "@/components/terminal/boot-sequence";
import { JUST_AUTHENTICATED_KEY } from "@/lib/auth/boot-flag";

function consumeJustAuthenticatedFlag(): boolean {
  // Ленивый инициализатор useState выполняется синхронно при монтировании, до первой отрисовки —
  // в отличие от useEffect (который срабатывает уже ПОСЛЕ первого paint'а и раньше вызывал
  // видимую вспышку хаба на один кадр перед boot-экраном). На сервере sessionStorage недоступен,
  // но сюда мы попадаем только при клиентской навигации после логина, так что SSR-ветка ниже —
  // просто защита от падения, а не реальный путь показа boot-экрана.
  if (typeof window === "undefined") return false;
  if (!sessionStorage.getItem(JUST_AUTHENTICATED_KEY)) return false;
  sessionStorage.removeItem(JUST_AUTHENTICATED_KEY);
  return true;
}

type Program = {
  key: string;
  file: string;
  desc: string;
  href?: string;
};

const PROGRAMS: Program[] = [
  { key: "chat", file: "CHAT.EXE", desc: "ДИАЛОГ С ИИ", href: "/terminal/chat" },
  { key: "files", file: "FILEMGR.EXE", desc: "МЕНЕДЖЕР ФАЙЛОВ", href: "/terminal/files" },
  { key: "logout", file: "LOGOUT.EXE", desc: "ЗАВЕРШИТЬ СЕАНС" },
];

export function TerminalHub({ email, roleLabel }: { email: string; roleLabel: string }) {
  const router = useRouter();
  const [showBoot, setShowBoot] = useState(consumeJustAuthenticatedFlag);
  const [selected, setSelected] = useState(0);

  const handleBootDone = useCallback(() => {
    setShowBoot(false);
  }, []);

  const launch = useCallback(
    async (program: Program) => {
      if (program.key === "logout") {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
        return;
      }
      if (program.href) router.push(program.href);
    },
    [router],
  );

  useEffect(() => {
    if (showBoot) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (s + 1) % PROGRAMS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => (s - 1 + PROGRAMS.length) % PROGRAMS.length);
      } else if (e.key === "Enter") {
        void launch(PROGRAMS[selected]);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showBoot, selected, launch]);

  if (showBoot) {
    return <BootSequence onDone={handleBootDone} />;
  }

  return (
    <main className="flex min-h-screen flex-col gap-8 px-6 py-10 sm:px-12">
      <div>
        <p>ПОЗЫВНОЙ: {email}</p>
        <p>РОЛЬ: {roleLabel}</p>
      </div>
      <div>
        <p className="mb-3 opacity-70">C:\JANUS\PROGRAMS&gt; DIR</p>
        <ul>
          {PROGRAMS.map((program, index) => (
            <li key={program.key}>
              <button
                type="button"
                onClick={() => launch(program)}
                onMouseEnter={() => setSelected(index)}
                className="flex w-full gap-4 px-2 py-1 text-left"
                style={
                  index === selected
                    ? { background: "var(--color-amber)", color: "var(--color-crt-bg)" }
                    : undefined
                }
              >
                <span className="w-4">{index === selected ? ">" : " "}</span>
                <span className="w-36">{program.file}</span>
                <span>{program.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
