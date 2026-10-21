# Architecture Guide

A reviewer's map of the whole system: what exists, where it lives, what each file does, which libraries we use and why, and which problem each piece solves. Read top-to-bottom once; after that, jump via [Where to find what](#where-to-find-what).

---

## 1. The big picture

**Product:** an embeddable AI onboarding copilot. A SaaS company adds our SDK to their site; end users ask for help ("how do I invite a teammate?") or start a configured guide, and the copilot spotlights the right UI element step by step — reliably, on a live, re-rendering, SPA-routed page.

**Mental model: GPS navigation for software.**

| GPS | Copilot |
|---|---|
| Route computed up front | AI compiles a full plan (once, cached) |
| Turn-by-turn is local & instant | SDK executes the plan locally, zero network per step |
| Recalculating when off-route | JIT repair / honest degradation |
| Traffic data improves routes | Telemetry → self-healing plan cache |

**The three hard problems and our answers:**

1. **Understanding arbitrary pages without site-specific code.** Browsers expose no accessibility-tree API to in-page JS, so the SDK *computes* a pseudo-accessibility representation: every interactive element gets a role, an accessible name, a section label, visibility, bounds, and a stable id ([`sdk/src/extraction/`](../packages/sdk/src/extraction)). Roles and names are framework-agnostic — this is why one SDK works on React, Vue, or jQuery soup.
2. **Surviving rerenders/route changes/modals.** We never hold DOM nodes. Steps carry a semantic `TargetDescriptor` (role + name + section + testid + ordinal + bbox hints) that is **re-resolved against the live DOM every tick** by a weighted scorer shared between SDK and server ([`shared/src/scoring/`](../packages/shared/src/scoring)).
3. **Using an LLM without inheriting its latency, cost, and hallucinations.** The LLM is a *compiler*, not an interpreter: one structured call turns a goal + docs into a full plan, which is cached and then executed deterministically. When the LLM does choose, it picks among deterministically-extracted candidates **by id** — never raw DOM, never CSS selectors — and every output is Zod-validated with hallucinated ids rejected.

**Three planes:**

```
RUNTIME (customer site — deterministic, instant)
  SDK: extract semantic graph → execute plan locally → render companion → buffer events
  Server touchpoints: start session (get plan) · resume · checkpoint (async)

INTELLIGENCE (offline — LLM-bounded, amortized)
  goal → retrieval → plan cache → or ONE authorFlow call (doc-grounded) → cached FlowDefinition

CONTROL (observability — console app lands in M10)
  server-emitted funnel events → /v1/stats → self-healing plan cache
```

---

## 2. Monorepo layout & libraries

pnpm workspaces, strict TypeScript, ESM everywhere.

| Package | Runs in | Purpose |
|---|---|---|
| `packages/shared` | browser + node | Single source of truth: Zod schemas, scoring, delta codec, **plan executor** |
| `packages/sdk` | browser | The embeddable copilot (extraction, execution, UI, chat) |
| `packages/server` | node | Fastify API: sessions, plan compiler, AI providers, SQLite, telemetry |
| `packages/demo` | browser | Hostile-fixture React app we test against |
| `tests/` | node | Playwright e2e suite |

**Libraries and why:**

- **Zod** — every external input (HTTP bodies, LLM outputs, theme configs) is schema-validated; types are *inferred from* schemas so runtime validation and compile-time types can't drift.
- **Fastify + better-sqlite3** — schema-first HTTP and synchronous, zero-ops persistence for the vertical slice. The repo layer ([`server/src/db/repos.ts`](../packages/server/src/db/repos.ts)) is the seam where Postgres slots in (M12).
- **Vercel AI SDK (`ai` + `@ai-sdk/google`)** — gives us `generateObject` (Zod-validated structured LLM output) and retries/backoff for free, and makes the model vendor swappable in one file. Model: **Gemini 2.5 Flash** (env-configured).
- **Vite** — demo dev server + SDK library build (IIFE script-tag embed). The SDK ships **zero runtime dependencies** beyond tree-shaken `shared` code: no UI framework, no animation library — Shadow DOM + CSS only.
- **Vitest / Playwright** — unit and e2e. Playwright's *real* accessibility tree is used as a test-time **oracle** to validate our pseudo-a11y extraction (something an embedded SDK can't access at runtime).
- **pino** — structured logs via Fastify's logger.

---

## 3. `packages/shared` — the single source of truth

Anything both sides need lives here **once**. This is the design's spine.

| File | What it is |
|---|---|
| `src/schemas/common.ts` | `BoundingBox`, `TextMatcher` (contains/equals text predicates) |
| `src/schemas/element.ts` | **`SemanticElement`** — one extracted page element (id, role, name, text, aria, bbox, sectionLabel, visible, enabled, filled…). **`TargetDescriptor`** — the resilient locator steps carry. |
| `src/schemas/snapshot.ts` | `PageSnapshot` — url/title/viewport + elements (plain or delta-compressed) |
| `src/schemas/flow.ts` | **`FlowDefinition` / `Step`** — the plan format: per step a `MatchCriteria` (what to highlight), an `AdvanceCondition` (when it's done: `url` / `elementVisible` / `elementGone` / `inputFilled` / `click` / `manual`), optional `activateWhen` gating (waiting vs active), `aiAssist` flag |
| `src/schemas/guidance.ts` | `GuidanceRequest/Response`, `Instruction` (highlight/tooltip/done + content), `AiDecision` + `AiGuideDecision` (the only shapes an LLM may return) |
| `src/schemas/sessions.ts` | M9 runtime-split API: `SessionStartRequest/Response` (ships the whole plan, or an honest `answer`), `CheckpointRequest` |
| `src/schemas/events.ts` | `EventType` enum (flow_started, step_advanced, step_skipped, target_lost, flow_completed, ai_flow_compiled, plan_invalidated, …) + `EventReport` |
| `src/schemas/theme.ts` | `ThemeConfig` — tenant theming tokens (mode/accent/radius/shadow/font/density/placement/scrim/celebration), clamped |
| `src/scoring/text.ts` | text matching used by criteria |
| `src/scoring/score.ts` | **the matcher core**: weighted candidate scoring (role+name, text, testid/aria, section, ordinal, bbox), `bestMatch`/`rankCandidates`, ambiguity detection. Solves the **duplicate-button problem** via section/landmark context. |
| `src/delta/codec.ts` | repeated-sibling delta compression for snapshots (template + per-instance diffs), round-trip tested |
| `src/executor/plan.ts` | **the deterministic step machine `planNext`** — given (plan, current step, page elements, url, events, control) returns the full `PlanResult` (step index/total, waiting/active state, instruction with confidence-gated target, manual mode). Controls: next/back/skip latch manual; `resume` re-arms auto. `HIGHLIGHT_THRESHOLD = 0.6`: below it we show text without a spotlight — *a wrong highlight is worse than no highlight*. Runs **in the SDK** (every tick) and on the server (legacy route) — one implementation. |

---

## 4. `packages/sdk` — the embeddable copilot

| File | What it does |
|---|---|
| `src/index.ts` | public exports (`Copilot`) |
| `src/config.ts` | `CopilotConfig` (apiKey, serverUrl, flowKey, debug, autoStart, theme) + resolution |
| `src/bootstrap.ts` | **the orchestrator** (thin facade — public API + render loop only). `Copilot.init()` → lifecycle, observer wiring (via the host adapter), `applyGuidance()` (tick → render to overlay), `resolveRect()`, theming, and the public surface (`start/pause/resume/reset/destroy`, `requestGuidance`, `startFlow/startAiGuide`, `openChat`, `setTheme`). Holds no host globals and no guidance state — those live in the modules below. **Event-class-aware scheduling**: user-intent events (click/input/route) re-plan after 50ms; anonymous DOM mutations get a 120ms settle. |
| `src/engine/guidance-engine.ts` | **the headless guidance engine** (M9.8 extraction). Owns the local-execution state machine: fetch/resume the compiled plan, run `planNext` every tick, checkpoint asynchronously, self-healing `target_lost` reporting, session persistence. Renders nothing and touches no globals — talks to the page only through the host adapter, so it's reusable/testable off any host. `tick()`, `setGoal/setFlow/reset`, `recordEvent/report`. |
| `src/host/host-adapter.ts` | **the host-integration boundary** (M9.8). A `HostAdapter` interface + `browserHost()` wrapping every DOM/history/storage/clock/matcher touch (`extractElements`, `buildSnapshot`, `resolveElement`, route/mutation/click/input subscriptions, `storage`). Swap this one file to run the core on a different host environment. |
| `src/discovery/discovery-controller.ts` | **the discovery boundary** (M9.8). Owns the progress dock + the `GET /v1/onboarding` feed + composer suggestion hints; evolves independently of the engine. |
| `src/extraction/dom.ts` | DOM walking, visibility computation, bounds |
| `src/extraction/roles.ts` | implicit/explicit ARIA role computation per tag |
| `src/extraction/accname.ts` | accessible-name algorithm subset (aria-label > labelledby > `<label>` > text > title > placeholder) |
| `src/extraction/extract.ts` | orchestrates a full page scan → `SemanticElement[]` (with section labels from nearest landmark/heading) |
| `src/semantic-graph.ts` | stable internal ids (hash of role+name+testid+structural signature) so elements keep identity across rerenders |
| `src/serialize.ts` | builds the delta-compressed `PageSnapshot` |
| `src/matcher.ts` | re-resolves a `TargetDescriptor` to a live DOM node using shared scoring (the rerender-survival mechanism) |
| `src/transport.ts` | typed fetch wrappers: `startSession`, `resumeSession`, `postCheckpoint` (keepalive — survives tab close), `postGuidance` (legacy), `postChat` |
| `src/overlay/renderer.ts` | **the Companion** — Shadow-DOM surface: soft spotlight ring that *travels* between targets, frosted card (hairline progress, instruction hero, Back/Skip/Next, Resume-auto, skip-reason chips, expandable checklist), launcher pill, celebration state (animated check, auto-rest). Exposes `data-cp-state` (idle/active/waiting/celebrating/paused/hidden) for tests/CSS, and `data-cp="…"` hooks on every control. |
| `src/overlay/styles.ts` | all companion CSS — **token-driven** (`--cp-*` only, no hardcoded colors), motion keyframes, `prefers-reduced-motion` support |
| `src/ui/theme.ts` | `ThemeConfig` → CSS custom properties; `auto` mode samples host background luminance to pick light/dark; brand accents are contrast-clamped |
| `src/overlay/debug-panel.ts` | `debug:true` panel showing live engine state (step, mode, confidence, reasoning) |
| `src/chat/widget.ts` | the chat panel (bottom-center, drag handle, mic via Web Speech, "Guide me" action, ⌘K toggle) |
| `src/log.ts` | leveled console logger |

**SDK data flow (one tick, all local):**

```
DOM → extract.ts → SemanticElement[] → shared/executor planNext(plan, state, elements, url, events)
    → PlanResult → renderer (spotlight travels, card updates) → matcher re-resolves target per frame (rAF)
    → if step/status changed: postCheckpoint (async, fire-and-forget)
```

---

## 5. `packages/server` — API + intelligence plane

| File | What it does |
|---|---|
| `src/index.ts` / `src/app.ts` | boot + Fastify wiring (CORS, routes, SQLite open/seed) |
| `src/config.ts` | env config (`PORT`, `DB_PATH`, `AI_PROVIDER/AI_MODEL/AI_API_KEY` from `packages/server/.env`) |
| `src/routes/sessions.ts` | **the M9 runtime-split API.** `POST /v1/sessions`: resolve a plan (flowKey directly, or aiGoal via `compile.ts`) and **ship it whole**; infeasible/no-AI goals get `kind:"answer"` — never a fake guide. `GET /v1/sessions/:id`: resume. `POST /v1/sessions/:id/checkpoint`: persist pointer, flush events, emit funnel edges, route `target_lost` into self-healing. |
| `src/compile.ts` | **the plan compiler pipeline** `resolvePlanForGoal`: authored-flow retrieval → cached AI plan (`flows` key `ai:<normalized-goal>`) → ONE `authorFlow` LLM call grounded in knowledge chunks → validated `FlowDefinition`, cached. Returns flow / infeasible / none. |
| `src/routes/guidance.ts` | legacy per-tick endpoint (pre-M9 SDKs; also hosts the JIT reactive guide fallback). Same compile pipeline, same telemetry. |
| `src/routes/chat.ts` | grounded Q&A: builds a **page-aware context** (leads with the user's current URL + visible sections/actions, then doc chunks, then the reference workflow, with an explicit "answer from where they already are" instruction) → `provider.chat`. Deterministic flow-summary fallback when AI is off. |
| `src/routes/events.ts` | `POST /v1/events` — SDK/integrator events; tenant-validated, foreign sessions dropped not errored |
| `src/routes/stats.ts` | `GET /v1/stats?apiKey=<SECRET>` — the funnel: per-flow sessions/completions/completion-rate/stuck-by-step/target-lost + AI compile health. Publishable keys are rejected. |
| `src/telemetry.ts` | `recordEvent` + `recordTargetLost` — dedup per session+step, and the **self-healing cache**: `target_lost` from ≥3 distinct sessions on an `ai:*` flow evicts it (next equivalent goal recompiles against the current UI/docs) |
| `src/knowledge.ts` | naive keyword retrieval over tenant doc chunks (top-3) — the embedding-retrieval seam for M12 |
| `src/planner.ts` | re-exports the shared executor + `planGuidance`: AI disambiguation wrapper (only when a step opts in via `aiAssist` AND the deterministic match is ambiguous) |
| `src/ai/provider.ts` | **the vendor seam** — `AiProvider`: `decide` (pick element by id), `chat`, `authorFlow` (compile a full guide), `guide` (one reactive step; JIT fallback) |
| `src/ai/gemini.ts` | Gemini implementation via Vercel AI SDK; `generateObject` + Zod = no freeform output, automatic retries |
| `src/ai/deterministic.ts` | the no-API-key stand-in — AI-off mode is first-class, every path degrades honestly |
| `src/ai/prompt.ts` | prompt builders (decide / authorFlow / guide) — terse, schema-shaped, candidates as JSON |
| `src/ai/select.ts` | `selectWithAi`: deterministic shortlist (top-8) → model picks by id → hallucinated-id guard → null = fall back deterministic |
| `src/ai/authored-flow.ts` | the FLAT Zod schema the LLM fills when authoring (semantic criteria only — names/sections/testids, never selectors) + conversion to `FlowDefinition` |
| `src/ai/retrieve.ts` | lexical retrieval over authored flows (the RAG step) + `goalFlowKey` cache-key normalization |
| `src/ai/guide.ts` | the reactive per-step AI guide (demoted to JIT fallback when compiling fails) |
| `src/db/connection.ts` | SQLite schema + additive migrations (WAL mode) |
| `src/db/repos.ts` | all SQL behind typed functions — the Postgres seam |
| `flows/*.json` | seeded authored flows (invite-teammate, ai-demo) |

**Data model (SQLite):** `tenants(id, name, api_key /*publishable*/, secret_key, config_json)` · `flows(id, tenant_id, key, name, definition_json, version)` — both authored and AI-compiled (key `ai:*`) plans live here · `sessions(id, tenant_id, flow_id, current_step_id, state_json, status)` · `events(id, session_id, type, payload_json)` · `knowledge(id, tenant_id, title, content)`.

**API surface:** `POST /v1/sessions` · `GET /v1/sessions/:id` · `POST /v1/sessions/:id/checkpoint` · `POST /v1/guidance` (legacy) · `POST /v1/chat` · `POST /v1/events` · `GET /v1/stats` (secret key) · `GET /health`.

---

## 6. `packages/demo` + `tests` — the proving ground

The demo is a deliberately hostile React workspace app: **duplicate Invite buttons** (top-nav vs Members section), a **portal modal**, **SPA hash routing**, a **Force remount** button, and a dev toolbar driving the SDK. `tests/e2e/` proves every hazard:

| Spec | Proves |
|---|---|
| `extraction.spec.ts` | pseudo-a11y matches Playwright's real accessibility tree (oracle) |
| `transport.spec.ts` | delta compression round-trips losslessly over HTTP |
| `flow.spec.ts` | full deterministic flow walk, duplicate-button disambiguation |
| `recovery.spec.ts` | forced remount, modal/portal targeting, SPA route change |
| `guidance-ux.spec.ts` | waiting→active gating, Next/Back/Skip, pause, hide/launcher, dismiss |
| `chat.spec.ts` | grounded chat + "Guide me" launches a live spotlight guide |
| `observability.spec.ts` | funnel events flow into `/v1/stats`; debug overlay |
| `m9-runtime.spec.ts` | refresh-resume (same session+step), full-journey checklist |
| `companion.spec.ts` | completion transitions to celebration with no stale Next; runtime theming |

---

## 7. Problems → solutions (the design rationale)

| Problem | Solution | Where |
|---|---|---|
| No a11y-tree API for in-page JS | Compute pseudo-a11y (roles+accname+visibility); validate against Playwright's real tree in tests | `sdk/extraction/`, `extraction.spec.ts` |
| Rerenders destroy DOM references | Never cache nodes; semantic `TargetDescriptor` re-resolved every tick | `shared/scoring`, `sdk/matcher.ts` |
| Duplicate buttons (same name twice) | Section/landmark context scoring + step `sectionHint` | `shared/scoring/score.ts` |
| LLM latency/cost per step | **Compile, don't interpret**: one LLM call per goal, cached, executed deterministically | `server/compile.ts` |
| LLM hallucination | Pick-by-id over extracted candidates; Zod-validated; unknown ids rejected; no selectors ever | `server/ai/select.ts`, `authored-flow.ts` |
| Per-step network latency | M9 runtime split: plan ships whole, every tick local | `shared/executor`, `sdk/bootstrap.ts` |
| Page refresh loses progress | Server sessions + localStorage resume | `routes/sessions.ts`, `bootstrap.ts` |
| UI drift breaks cached plans | `target_lost` telemetry → self-healing eviction → recompile | `server/telemetry.ts` |
| Wrong highlight destroys trust | Confidence threshold: below 0.6 → text-only, no spotlight | `shared/executor/plan.ts` |
| Funnel data you can't fake | Lifecycle events emitted **server-side** on transitions | `routes/sessions.ts`, `telemetry.ts` |
| Browser key could read analytics | Publishable vs secret key split | `db/repos.ts`, `routes/stats.ts` |
| One dark card on every brand | Token-only theming, auto light/dark via host luminance, contrast clamping | `sdk/ui/theme.ts`, `overlay/styles.ts` |
| Stale UI after final action | Event-class-aware tick scheduling + completion as an FSM state | `bootstrap.ts`, `renderer.ts` |
| Chat ignoring where the user is | Context leads with current URL + visible sections + "answer from here" instruction | `routes/chat.ts` |

---

## Where to find what

- **"How does it know what's on the page?"** → `sdk/src/extraction/` (start at `extract.ts`)
- **"How does a step find its element after a rerender?"** → `sdk/src/matcher.ts` + `shared/src/scoring/score.ts`
- **"Where do steps advance / progress / back/next/skip live?"** → `shared/src/executor/plan.ts`
- **"Where does the AI compile a guide from a question?"** → `server/src/compile.ts` → `server/src/ai/authored-flow.ts`
- **"What exactly can the LLM see and return?"** → `server/src/ai/prompt.ts` + the schemas in `shared/src/schemas/guidance.ts`
- **"Where is the spotlight/card drawn?"** → `sdk/src/overlay/renderer.ts` (+ `styles.ts`, `ui/theme.ts`)
- **"Where do analytics come from?"** → `server/src/telemetry.ts` + `routes/stats.ts`
- **"Where does self-healing happen?"** → `server/src/telemetry.ts` (`recordTargetLost`)
- **"What runs when the page loads?"** → `sdk/src/bootstrap.ts` (`Copilot.init`)
- **"What's planned next?"** → [`PLATFORM-PLAN.md`](PLATFORM-PLAN.md) (M10 console, M11 voice, M12 hardening)
