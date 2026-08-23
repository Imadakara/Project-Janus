// Решает, нужен ли семантический поиск по файлам архива (lib/ai/rag.ts) для данного intent'а
// в full_llm-ответе. До этой правки searchUnlockedMaterials() гонялся на КАЖДЫЙ full_llm-вызов
// вслепую по сырому тексту сообщения, полностью игнорируя то, что Слой 2 уже классифицировал
// intent — лишний эмбеддинг + 2 похода в БД на вопросы, которые заведомо не про содержимое
// файлов, плюс риск подсунуть модели нерелевантный сниппет не по теме.
//
// Список — явный deny-list (не allow-list): по умолчанию (intent не в списке, включая null —
// нераспознанный intent) RAG выполняется, как и раньше — это самый безопасный дефолт для нового
// intent'а, который сюда забудут добавить. В список попадают только intent'ы, для которых
// содержательно понятно, что ответ идёт из системного состояния/слотов/характера, а не из
// TerminalFile: календарь и жизнеобеспечение (Фаза 2, lib/janus/slots.ts) и small-talk о самом
// ЯНУСе. ASK_HISTORY и REPORT_ARCHIVE_FOUND намеренно не в списке — это ровно те intent'ы, где
// вопрос вероятнее всего об архивных материалах.
const RAG_SKIP_INTENTS = new Set<string>([
  "ASK_IDENTITY",
  "ASK_TRUST",
  "SMALLTALK_GENERIC",
  "ASK_VITALS",
  "ASK_LOSSES",
  "ASK_DEATH_DATE",
  "ASK_PRIORITY",
  "ASK_WHY_CONTACT",
]);

export function needsRagSearch(intent: string | null): boolean {
  if (intent === null) return true;
  return !RAG_SKIP_INTENTS.has(intent);
}
