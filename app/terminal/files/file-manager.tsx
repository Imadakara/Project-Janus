"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TypedText } from "@/components/terminal/typed-text";

type FolderEntry = { path: string; name: string };
type FileEntry = { id: string; filename: string; extension: string; requiredModuleKey: string };

function parentOf(path: string): string {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments.length ? "/" + segments.join("/") : "/";
}

// Исполняемые файлы (.EXE) — не текстовый контент: вместо вывода fullContent в <pre>
// открывают отдельный интерактивный экран терминала. Ключ — имя файла без расширения.
const PROGRAM_ROUTES: Record<string, string> = {
  CHESS: "/terminal/files/games/chess",
};

export function FileManager() {
  const router = useRouter();
  const [path, setPath] = useState("/");
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [unlockedModules, setUnlockedModules] = useState<string[] | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [actionOutput, setActionOutput] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/terminal/modules")
      .then((res) => res.json())
      .then((data) => setUnlockedModules(data.modules.map((m: { key: string }) => m.key)))
      .catch(() => setUnlockedModules([]));
  }, []);

  useEffect(() => {
    // Сброс состояния и загрузка листинга при смене пути — стандартный паттерн
    // синхронизации с внешним API по изменению зависимости.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setSelectedFileId(null);
    setActionOutput(null);
    fetch(`/api/terminal/files?path=${encodeURIComponent(path)}`)
      .then((res) => res.json())
      .then((data) => {
        setFolders(data.folders ?? []);
        setFiles(data.files ?? []);
      })
      .finally(() => setIsLoading(false));
  }, [path]);

  const runAction = useCallback(async (fileId: string, action: "open" | "analyze") => {
    setActionOutput("ОБРАБОТКА...");
    const res = await fetch(`/api/terminal/files/${fileId}/${action}`, { method: "POST" });
    const data = await res.json();
    if (action === "analyze") {
      setActionOutput(data.summary ?? data.error ?? "ОШИБКА.");
    } else {
      setActionOutput(data.granted ? data.content : (data.message ?? data.error ?? "ОШИБКА."));
    }
  }, []);

  // «ВЫНЕСТИ» (ТЗ 2.7): скачивание через blob — без хранилищ на устройстве игрока
  // (договорённость 0.6), файл просто уходит в браузерную загрузку и всё.
  const exportFile = useCallback(async (fileId: string, filename: string) => {
    const res = await fetch(`/api/terminal/files/${fileId}/export`);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setActionOutput(data?.error ?? "ОШИБКА ВЫНОСА.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const canAnalyze = unlockedModules?.includes("FILE_ANALYZER") ?? false;
  const selectedFile = files.find((f) => f.id === selectedFileId) ?? null;
  const programRoute =
    selectedFile?.extension === ".EXE" ? PROGRAM_ROUTES[selectedFile.filename] : undefined;

  return (
    <main className="flex min-h-screen flex-col gap-4 px-6 py-8 sm:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg">МЕНЕДЖЕР ФАЙЛОВ</h1>
        <button
          type="button"
          onClick={() => router.push("/terminal")}
          className="border px-3 py-1 text-sm"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          ВЫХОД
        </button>
      </div>

      <p className="opacity-70">PATH: {path}</p>

      <ul className="flex flex-col">
        {path !== "/" && (
          <li>
            <button
              type="button"
              onClick={() => setPath(parentOf(path))}
              className="flex w-full gap-4 px-2 py-1 text-left hover:opacity-80"
            >
              <span className="w-24">&lt;DIR&gt;</span>
              <span>..</span>
            </button>
          </li>
        )}
        {folders.map((folder) => (
          <li key={folder.path}>
            <button
              type="button"
              onClick={() => setPath(folder.path)}
              className="flex w-full gap-4 px-2 py-1 text-left hover:opacity-80"
            >
              <span className="w-24">&lt;DIR&gt;</span>
              <span>{folder.name}</span>
            </button>
          </li>
        ))}
        {files.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              onClick={() => {
                setSelectedFileId(file.id === selectedFileId ? null : file.id);
                setActionOutput(null);
              }}
              className="flex w-full gap-4 px-2 py-1 text-left hover:opacity-80"
              style={
                file.id === selectedFileId
                  ? { background: "var(--color-amber)", color: "var(--color-crt-bg)" }
                  : undefined
              }
            >
              <span className="w-24" />
              <span>
                {file.filename}
                {file.extension}
              </span>
            </button>
          </li>
        ))}
        {!isLoading && folders.length === 0 && files.length === 0 && (
          <li className="px-2 py-1 opacity-70">ПАПКА ПУСТА.</li>
        )}
      </ul>

      {selectedFile && (
        <div className="mt-2 border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
          <p className="mb-3">
            {selectedFile.filename}
            {selectedFile.extension}
          </p>
          <div className="flex gap-4">
            {canAnalyze && (
              <button
                type="button"
                onClick={() => runAction(selectedFile.id, "analyze")}
                className="border px-3 py-1"
                style={{ borderColor: "var(--color-amber-dim)" }}
              >
                АНАЛИЗИРОВАТЬ
              </button>
            )}
            {unlockedModules?.includes(selectedFile.requiredModuleKey) ? (
              <button
                type="button"
                onClick={() =>
                  programRoute ? router.push(programRoute) : runAction(selectedFile.id, "open")
                }
                className="border px-3 py-1"
                style={{ borderColor: "var(--color-amber-dim)" }}
              >
                {programRoute ? "ЗАПУСТИТЬ" : "ОТКРЫТЬ"}
              </button>
            ) : (
              <p className="opacity-70">
                ОТКРЫТИЕ НЕДОСТУПНО: ТРЕБУЕТСЯ МОДУЛЬ {selectedFile.requiredModuleKey}
              </p>
            )}
            {!programRoute && unlockedModules?.includes(selectedFile.requiredModuleKey) && (
              <button
                type="button"
                onClick={() =>
                  exportFile(selectedFile.id, `${selectedFile.filename}${selectedFile.extension}.TXT`)
                }
                className="border px-3 py-1"
                style={{ borderColor: "var(--color-amber-dim)" }}
              >
                ВЫНЕСТИ
              </button>
            )}
          </div>
          {actionOutput && (
            <pre className="mt-4 whitespace-pre-wrap">
              <TypedText text={actionOutput} />
            </pre>
          )}
        </div>
      )}
    </main>
  );
}
