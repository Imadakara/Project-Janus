// Случайный выбор фрагмента из пула + подстановка плейсхолдеров {{slotName}}.
// Синтаксис плейсхолдеров — MVP-решение, ожидает финального слот-реестра от
// нарративного дизайнера.
export function pickFragment(fragments: string[], slots: Record<string, string> = {}): string {
  if (fragments.length === 0) {
    throw new Error("pickFragment: пустой пул фрагментов");
  }

  const template = fragments[Math.floor(Math.random() * fragments.length)];
  return template.replace(/\{\{(\w+)\}\}/g, (match, slotName: string) => slots[slotName] ?? match);
}
