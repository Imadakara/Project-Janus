// Единый справочник всех детерминированных реплик ЯНУСа — по запросу пользователя (не понимал,
// где вообще искать все реплики и как их редактировать). Собирает воедино content/response-pools.json
// (пер-интентные пулы NORMAL/REPEATED/DEGRADED/EMERGENCY) и «глобальные» пулы, живущие константами
// в коде (lib/scenario/refusal-fragments.ts, lib/scenario/resolve.ts, lib/ai/guards.ts) — единственные
// источники истины для их содержимого, здесь ничего не задублировано вручную (см. buildResponseCatalog).
// Разработчик запускает вручную (npm run export-response-catalog) после правки любого источника;
// результат коммитится, по тому же паттерну, что content/decay-schedule.json + generate-schedule.ts.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import responsePoolsData from "@/content/response-pools.json";
import intentsData from "@/content/intents.json";
import {
  COMA_FRAGMENTS,
  MEMORY_LAPSE_FRAGMENTS,
  MEMORY_LOST_FRAGMENTS,
} from "@/lib/scenario/refusal-fragments";
import { BUDGET_REFUSAL_FRAGMENTS, UNRECOGNIZED_FRAGMENTS } from "@/lib/scenario/resolve";
import { DEFLECTION_FRAGMENT } from "@/lib/ai/guards";
import {
  buildResponseCatalog,
  SLOTS_REFERENCE,
  toCsv,
  type ResponsePoolEntry,
} from "@/lib/content/response-catalog";

const intentDescriptions = Object.fromEntries(
  intentsData.intents.map((i) => [i.code, i.description]),
) as Record<string, string>;

const rows = buildResponseCatalog({
  responsePools: responsePoolsData.pools as ResponsePoolEntry[],
  intentDescriptions,
  globalFragments: {
    memoryLost: MEMORY_LOST_FRAGMENTS,
    coma: COMA_FRAGMENTS,
    memoryLapse: MEMORY_LAPSE_FRAGMENTS,
    unrecognized: UNRECOGNIZED_FRAGMENTS,
    budgetRefusal: BUDGET_REFUSAL_FRAGMENTS,
  },
  deflectionFragment: DEFLECTION_FRAGMENT,
});

const jsonOutPath = resolve(process.cwd(), "content/response-catalog.json");
const csvOutPath = resolve(process.cwd(), "content/response-catalog.csv");

writeFileSync(
  jsonOutPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), slots: SLOTS_REFERENCE, rows }, null, 2) +
    "\n",
  "utf8",
);
// BOM (U+FEFF) — иначе Excel на Windows при двойном клике по .csv показывает кириллицу
// битой (принимает UTF-8 без BOM за latin-1/cp1251). Google Таблицы/LibreOffice BOM тоже
// понимают корректно, так что это чистый плюс, а не костыль под один редактор.
writeFileSync(csvOutPath, String.fromCharCode(0xfeff) + toCsv(rows), "utf8");

const draftCount = rows.filter((r) => r.isDraft).length;
console.log(
  `export-response-catalog: ${rows.length} реплик (${draftCount} черновых, помечены TODO) ` +
    `→ content/response-catalog.json, content/response-catalog.csv`,
);
