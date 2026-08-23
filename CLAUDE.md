# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

**Project Janus** is an ARG/LiveOps game built around talking to a secret AI from the final
days of socialist Yugoslavia. The player finds an old terminal, becomes its new "operator," and
slowly recovers the AI's damaged memory by exploring a digital archive. Long-term vision: two
platforms — a text-only website terminal (where the AI lives) and a companion mobile app (where
the player does "fieldwork" and earns access codes to unlock more of the terminal) — plus
seasonal LiveOps, player roles, and a community-driven mystery with no single final answer.

**This repository is the MVP of the first wave only: the website terminal.** No mobile app, no
access-code system, no LiveOps seasons, no monetization, no admin CMS. See
"Out of scope" below before adding anything that smells like those.

Full design/product docs live outside this repo, in the Obsidian vault at
`C:\Users\PC\Documents\Personal Vault\Project Janus Docs` (`Концепт-документ`, `Разработка/`,
`Нарратив/`, `Аналитика/`). Treat them as source of truth for narrative/product intent; this repo
and its README/`ТЗ` docs referenced from there are source of truth for what's actually built.

## What's actually built

A Next.js site simulating a terminal into a decommissioned SFRY supercomputer. Player registers,
gets a random role, talks to an AI, and digs through an in-fiction file manager. The AI dialogue
runs through a **hybrid three-layer engine** rather than a raw LLM passthrough — see
"Dialogue engine architecture" below. Full narrative/technical detail: `Разработка/MVP - Project Janus (сайт+приложение)` and `Разработка/Тех.Описание реализации — Гибридный диалоговый движок (Слои 1-3).md` and `Разработка/Тех.Описание реализации MVP (сайт).md` in the vault.

## Stack

- Next.js 16 (App Router), TypeScript (`strict: true`), Tailwind CSS v4
- PostgreSQL + **pgvector**, Prisma 7 (`prisma-client` generator, driver adapter `@prisma/adapter-pg`,
  client output goes to `app/generated/prisma`, not `node_modules` — import types from
  `@/app/generated/prisma/client`)
- `@anthropic-ai/sdk` for Layer 3 generation, behind a provider abstraction
  (`LLM_PROVIDER=claude|local`) so a self-hosted OpenAI-compatible LLM can be swapped in without
  touching call sites
- `@xenova/transformers` — local multilingual embedding model, used for both intent
  classification (Layer 2) and RAG lookups over unlocked archive files; no external API, no
  per-token cost
- Own auth (JWT via `jose`, `bcryptjs` for hashing) — no NextAuth; chosen because Edge-runtime
  `proxy.ts` can't use Node-`crypto`-based `jsonwebtoken`
- Vitest for unit tests

Rationale for these choices (Prisma 7 driver-adapter migration, why not SQLite, why `jose` over
`jsonwebtoken`, etc.) is written up in `Разработка/Стек и инструменты MVP (сайт).md` in the
vault — check there before re-litigating a stack decision.

## Getting started

```powershell
scripts\start.bat        # dev (npm run dev, hot-reload) — default
scripts\start.bat prod   # production build + npm run start
```

This spins up Postgres via `docker-compose.yml` (persistent volume), runs migrations, seeds the
DB, and launches the site. First run copies `.env.example` → `.env` — you still need to fill in
`ANTHROPIC_API_KEY`. Stop with `scripts\stop.bat` (or close the site window / Ctrl+C, which
auto-stops Postgres too). Manual step-by-step equivalent is in `README.md`.

Debug login seeded by `prisma/seed.ts`: `test@example.com` / `testpassword123` — also the
site-wide debug account (`Player.isDebug = true`): shows a "⚙ DEBUG" panel on every page with
scenario-session state, per-turn decision explanation, a "Use LLM" toggle, and chat clearing.

## Commands

| Command                               | Purpose                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `npm run dev`                         | Dev server (Next.js + Turbopack) — assumes env already up |
| `npm run build` / `npm run start`     | Production build / server                                 |
| `npm run lint`                        | ESLint                                                    |
| `npm run format` / `format:check`     | Prettier write / check                                    |
| `npm test`                            | Full Vitest suite                                         |
| `npx vitest run path/to/file.test.ts` | Single test file (drop `run` for watch mode)              |
| `npm run prisma:seed`                 | Reseed modules + draft filesystem content + debug player  |
| `npm run metrics`                     | MVP metrics incl. dialogue-engine layer distribution      |
| `npm run generate-schedule`           | Regenerate `content/decay-schedule.json` (commit the result, don't run it as part of seeding) |

## Project structure

```
/app
  /terminal            — terminal shell (hub/greeting)
    /chat               — AI dialogue screen
    /files              — file manager screen
    /vitals              — PULS.EXE: countdown to DEATH_AT + salvaged% + upcoming DEGRADED (polling)
    /losses              — GUBITAK.EXE: loss ledger («Књига губитака») with chain check
    /journal             — JOURNAL.EXE: player's personal witness/salvage/loss record
  /api
    /chat               — dialogue endpoint (hybrid engine, Layers 1-3 + degradation policy)
    /terminal/modules    — modules unlocked for the player
    /terminal/files       — folder/file listing, open, analyze, [id]/export ("ВЫНЕСТИ" download)
    /terminal/vitals      — JanusState snapshot for PULS (recompute-on-read every call)
    /terminal/losses      — loss-ledger entries + server-side hash-chain verification
    /terminal/journal      — player's witness/salvage history, read from the Event log
    /terminal/countdown    — lightweight DEATH_AT/remainingMs for the persistent corner widget
    /debug/janus           — isDebug-only mortality controls (M, override clear, ±shares, kill,
                            churn tick, virtual clock)
    /auth               — register/login/logout
  /(auth)/login, /register
  /generated/prisma     — generated Prisma client (do not hand-edit)
/lib
  /scenario             — Layer 1: deterministic scenario engine (routing, disposition, desyncScore)
  /intent                — Layer 2: intent classification (embeddings + heuristics)
  /ai
    /providers           — Layer 3: LlmProvider abstraction (Claude / self-hosted OpenAI-compatible)
    prompt-builder.ts, guards.ts, rag.ts, system-prompt.ts, client.ts, rate-limit.ts
  /janus                 — "Смертный ЯНУС": global JanusState singleton (state.ts), degradation
                           policy (degradation.ts, subsystems.ts), segment death (death.ts — the
                           ONLY code path to DEAD), loss-ledger hash chain (ledger.ts), integrity
                           index, synthetic churn (debug-only), chat slots/brief. Phase 2 additions:
                           fixed death date + virtual clock (calendar.ts, clock.ts), pre-published
                           decay schedule (schedule.ts + content/decay-schedule.json), the scheduler
                           that applies it and marks segments DEGRADED ahead of time (reaper.ts),
                           the wear curve computeMarginAt (wear.ts), and salvage/witness tracking
                           (salvage.ts). forecast.ts (seeded Monte-Carlo) is kept only as the input
                           to the Phase-2 schedule generator's seed — no longer drives
                           forecastDeathAt, which is now the DEATH_AT constant.
  /embeddings            — local embedding client (@xenova/transformers)
  /auth                  — sessions (JWT), passwords, role assignment
  /db                    — Prisma client singleton
  /modules               — command-module registry, access checks
  /chat                  — active dialogue session handling
  /analytics             — MVP event tracking
/prisma                  — schema.prisma, migrations/, seed.ts
/content                 — seed-files.json, intents.json, response-pools.json, memory-segments.json,
                           decay-schedule.json (generated by scripts/generate-schedule.ts, committed)
/scripts                 — start/stop scripts, launch-app.ps1, metrics.ts, generate-schedule.ts
proxy.ts                 — Next 16's middleware-equivalent; guards /terminal/* and /api/*
```

## Dialogue engine architecture

Per player message, orchestrated in `app/api/chat/route.ts`:

1. **Layer 2 — intent classification** (`lib/intent/`): embeds the message with the local
   multilingual model, runs pgvector similarity search against `IntentExample` rows to get an
   intent code + confidence, plus rule-based tag/entity extraction.
2. **Layer 1 — scenario routing** (`lib/scenario/resolve.ts`): consumes that result, updates
   `disposition` (trust/tension), and computes `desyncScore` (`lib/scenario/desync.ts` /
   `thresholds.ts`) — it accumulates on low/medium-confidence matches (with a streak bonus for two
   low-confidence hits in a row), negation tags, and multi-entity queries that "require
   synthesis"; a single high-confidence match resets it to 0. Score decides the response tier:
   `>= 6` → `full_llm`, `>= 3` → `light_llm`, else a deterministic fragment from
   `ResponsePool`/`ResponseFragment` (NORMAL/REPEATED/ANNOYED).
3. **Layer 3 — generation** (`lib/ai/`), only invoked when the scenario layer escalates: builds a
   prompt (`prompt-builder.ts` + `system-prompt.ts`, role-tinted character text), optionally
   injects RAG snippets from the player's unlocked `TerminalFile`s (`rag.ts`, same pgvector
   pattern), calls the active `LlmProvider` (`ClaudeProvider` or `LocalLlmProvider`, selected via
   `LLM_PROVIDER`), then runs `guards.ts` (forbidden-topic deflection, sentence-count truncation)
   as defense-in-depth. Full-LLM calls have their own hourly rate budget separate from the general
   chat rate limit — exceeding it returns a deterministic in-fiction refusal, never a silent
   failure or a raw error.

**Mortality layer («Смертный ЯНУС», `lib/janus/`)** wraps all three layers per turn. All new
domain code reads time only through `lib/janus/clock.ts::now()` — never `new Date()`/`Date.now()`
directly — so a debug-panel time offset (`JanusState.debugTimeOffsetMs`) can fast-forward the
whole simulation for testing. Per turn, `app/api/chat/route.ts` does, in order:
`now()` → `applyDueDecay(now)` (kills any segment whose pre-published `DecayEvent.dieAt` has
passed, in `dieAt` order — catches up correctly after any real-world downtime) →
`syncApproachingDecay(now)` (marks segments `DEGRADED` within 7 days of their scheduled death,
reversibly) → `recomputeDerivedState(now)` (refreshes `computeMargin` from the wear curve
`wear.ts::computeMarginAt`, unless a debug override is active) → `resolveDegradationPolicy()`.
The policy caps the max layer by compute margin M (coma `< 0.2` is intercepted before intent
classification — never reached in the active phase except via the debug lever; `0.2–0.4` forces
the EMERGENCY pool and blocks full_llm with `escalationReason: "degradation_cap"`; `0.4–0.7`
shuts subsystems down in a published order — their intents answer from the DEGRADED pool), adds
memory-decay noise (`desyncScore` per-turn bonus + probabilistic «провалы») when `integrityIndex`
drops, and returns `replyDelayMs` the chat client honors as queue diegetics.

Memory segments (`MemorySegment`) die only through `lib/janus/death.ts::killSegment(code, cause,
diedAt)` — it nulls the bound files' RAG embeddings, appends a SHA-256 hash-chained
`LossLedgerEntry` (crediting the segment's last reader as `lastCarrierCallsign`, or leaving it
`null` — surfaced in the UI as "НИКТО НЕ УСПЕЛ" if nobody ever read it), and recomputes derived
state. The death **date** is fixed (`calendar.ts::DEATH_AT`), not forecast — `forecast.ts`'s
seeded Monte-Carlo now only supplies the seed for the pre-published decay schedule
(`schedule.ts` + committed `content/decay-schedule.json`, generated once via
`npm run generate-schedule`), not a live prediction. RAG detects questions about dead content via
segment tombstone embeddings (`RagSearchOutcome {kind:"lost"}` → deterministic MEMORY_LOST reply,
no provider call). Seed never touches DEAD segments and never re-embeds their files, and never
resets an already-applied `DecayEvent`.

Salvage/witness tracking (`lib/janus/salvage.ts::recordSegmentWitness`) fires on two paths — full
file open (`POST /api/terminal/files/[id]/open`) and a segment landing in a full_llm RAG hit —
and feeds both the public "spared %" counter (counts against ALL segments, including dead ones —
an unread dead segment permanently lowers the ceiling) and the player's personal `JOURNAL.EXE`
log. `{{deathAt}}`/`{{remainingDays}}`/`{{salvagedPercent}}`/`{{lastLossTitle}}`/
`{{topPriorityTitles}}` chat slots are built the same way as the Phase-1 slots (`lib/janus/
slots.ts`) — pure `buildChatSlots(state, role, now)` plus DB-backed `loadDynamicSlots()`.

Full spec and implementation notes (including the manual acceptance checklists run before
release): `Разработка/ТЗ - Смертный ЯНУС (Фазы 1-4) для Claude Code.md`,
`Разработка/Тех.Описание реализации — Смертный ЯНУС (Фаза 1).md`,
`Разработка/Тех.Описание реализации — Смертный ЯНУС (Фаза 2).md` and
`Разработка/Тех.Описание реализации — Гибридный диалоговый движок (Слои 1-3).md` in the vault.

All in-fiction narrative text (system prompt character text, response-pool fragments, archive
file content in `content/*.json`) is currently placeholder/draft, marked
`[TODO: заменить финальным текстом от нарративного дизайнера]` — don't treat its content as
final copy when reasoning about tone or lore; do treat its _structure_ as load-bearing.

## Conventions

- Imports use the `@/*` alias, not relative paths.
- API routes follow one repeated shape: `getCurrentPlayer()` → 401 if null → rate-limit check →
  429 → `zod` `safeParse` on the body → 400 → business logic → `NextResponse.json(...)`. Errors
  returned to the client are Russian, all-caps, in-fiction strings (e.g.
  `"СЛИШКОМ МНОГО ЗАПРОСОВ. ПОДОЖДИТЕ."`) — never raw error messages. Unexpected provider errors
  are `console.error`'d server-side and mapped to a 502 in-fiction message.
- `proxy.ts` gates `/terminal/*` and `/api/*` at the edge, but route handlers still re-check
  `getCurrentPlayer()` themselves — defense in depth, don't rely solely on the proxy.
- Comments in this codebase are written in Russian and explain _why_, with cross-references to
  related files by path — match that style rather than switching to English or restating _what_
  the code does.
- Pure logic is deliberately pulled out of routes/DB access into small, DB-free functions (e.g.
  `lib/modules/access.ts`, `lib/scenario/desync.ts`) specifically so it's unit-testable without a
  live Postgres — keep following that split when adding logic to Layers 1-3.
- `lib/modules/registry.ts` (`IMPLEMENTED_MODULE_KEYS`) is the source of truth for which
  `CommandModule`s actually work; modules that exist in the DB but not in that list
  (`SEARCH`, `MEMORY_MANAGER`, `MAP_VIEWER`, ...) are intentional scaffolding and should return an
  in-fiction "access denied," not real functionality.
- Raw pgvector queries go through `prisma.$queryRaw` + a `toVectorLiteral()` helper — Prisma
  Client doesn't speak the `vector` type natively. `TerminalFile.embedding` is populated only by
  `prisma/seed.ts`, never at request time.

## Testing

- Tests are colocated as `*.test.ts` next to the source file, no `__tests__` directory.
- Mock at the boundary with `vi.mock` (e.g. `@/lib/ai/client`'s `getAnthropicClient`, or
  `global.fetch` for the local provider), then dynamically `await import(...)` the module under
  test after the mock is set up.
- `describe.each` is used to run the same contract assertions against both `LlmProvider`
  implementations, to keep them interface-compatible.
- Manual acceptance scenario (run before release, not automated): register → greeting → AI
  dialogue → file manager (analyze a file) → back to hub → logout → re-login with preserved
  state. A separate manual e2e checklist for the dialogue engine (deterministic path, repeated
  intent, escalation to light/full LLM, handoff back to Layer 1) is documented in the vault's
  implementation-notes doc referenced above.

## Environment variables

See `.env.example` for the full list and comments. Notable ones: `LLM_PROVIDER` (`claude` by
default; `local` needs `LOCAL_LLM_BASE_URL`/`LOCAL_LLM_MODEL` for an OpenAI-compatible
self-hosted backend — see `lib/ai/providers/local.ts`), `AUTH_SECRET` (session JWT signing,
`openssl rand -base64 32`), `POSTGRES_*`/`DATABASE_URL` (must stay in sync — no SQLite fallback,
datasource provider is hardcoded `postgresql` with the `vector` extension).

## Gotchas

- The local embedding model (~470MB via `@xenova/transformers`) downloads lazily on first use —
  fine for dev, but should be warmed at container startup in a real deployment, not left lazy.
- `scripts/start.bat` auto-starts Docker Desktop if it isn't running and launches the site in a
  separate window via `scripts/launch-app.ps1` — Windows-specific; `scripts/start.sh` is the
  Linux/macOS equivalent used for server deploys.
- If a `janus-postgres` container exists from an old manual `docker run` (pre-docker-compose), it
  must be removed once (`docker rm -f janus-postgres`) before the compose-based scripts will work.
- `.env` needs `AUTH_SECRET` set for login to work at all (JWT signing throws otherwise, 500 on
  `/api/auth/login`) — `scripts/start.bat`/`.sh` only copy `.env.example` on first run, they don't
  validate that every required var actually got filled in.
  `openssl rand -base64 32` (or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  if `openssl` isn't on PATH).
- Debug-panel mortality actions (`killSegment`, virtual-clock jumps) mutate real DB state and are
  irreversible by design — seed never resurrects a DEAD segment or un-applies a `DecayEvent`. After
  exploratory testing that kills segments, the dev DB is left in that state; to get back to a
  pristine one, `docker compose down -v && docker compose up -d`, then `npx prisma migrate deploy`
  and `npm run prisma:seed` (a plain re-seed alone won't undo it).
- Passing Cyrillic text through `curl`/shell args on this machine can get mangled by the Windows
  console codepage before it reaches the server (garbles into `???`, silently accepted as a valid
  but garbled message — intent classification then looks broken when it isn't). For manual API
  smoke tests with Cyrillic payloads, write the JSON to a file and use
  `curl --data-binary @file.json` instead of an inline `-d '...'` argument.

## Out of scope (do not build without an explicit ask)

Mobile app, access-code system, AI-issued field assignments, non-default command modules beyond
stubs, the full 9-role list (3 implemented), monetization, public landing page, narrative-designer
admin UI (content is hand-edited JSON in `/content` for now), multiple independent AI
"subsystems," LiveOps seasons, and actually deploying a self-hosted LLM (the `LocalLlmProvider`
code path exists but is untested against a real GPU server). Full boundary list:
"Явно вне рамок этого ТЗ" sections in the two `ТЗ` docs in the vault.
