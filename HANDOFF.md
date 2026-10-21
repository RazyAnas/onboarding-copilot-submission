# projectonboard — Full Context Handoff

> Self-contained context dump for continuing this build in a fresh assistant session.
> As of 2026-06-18. Read this top-to-bottom; it assumes zero prior knowledge.

---

## 1. What this project is

`projectonboard` is an **embeddable AI onboarding copilot** for SaaS products — a
smarter, more resilient WalkMe/Pendo. You drop a JS SDK on your site; it understands
the live page, compiles a step-by-step guide for any user goal, and reliably
spotlights the right UI element — surviving rerenders, SPA routes, modals, and
duplicate buttons.

**Mental model: GPS navigation for software.**
- Route (plan) computed up front by AI.
- Turn-by-turn execution is local + instant (SDK, deterministic).
- Going off-route triggers recalculation (repair).
- Telemetry silently improves routes for everyone (self-healing plan cache).
- Voice is optional narration over the same route.

**Scope:** a vertical slice — one demo app, a couple of flows, SQLite, multi-tenant-
*ready* schema (not full multi-tenant ops).

### Locked principles (do not violate)
1. **LLM stays off the hot path.** Per-tick resolution, highlighting, recovery are
   deterministic + synchronous. AI plans once, offline, cached.
2. **AI picks by id, never selectors.** It reasons over deterministically-extracted
   candidates; output is always Zod-validated; hallucinated ids are rejected.
3. **Never cache DOM nodes.** A resilient `TargetDescriptor` is re-resolved every
   tick — that's what survives rerenders.
4. **A wrong highlight is worse than no highlight.** Confidence-gated spotlighting,
   honest text-only degradation, honest "can't guide that here" infeasibility.
5. **Deterministic mode is first-class.** Everything works with no API key.
6. **Tokens are the only theming surface.** Customers brand the companion; they
   can't break its layout/legibility.
7. **Every guide shows its steps** (no step-less mode).

---

## 2. Tech stack & key decisions

- **LLM is Gemini 2.5 (flash)** via the Vercel AI SDK / `@google/genai`, **NOT Claude.**
  Bounded role: workflow planning, doc understanding, navigation reasoning, recovery.
  Extraction/matching/highlighting/recovery stay deterministic. The LLM never reads
  raw DOM; it picks among deterministically-extracted candidates by internal id.
  - `gemini-2.5-pro` is paid-only (free-tier limit 0); **use `gemini-2.5-flash`.**
  - Must support AI + deterministic-fallback modes. Live AI has been proven with flash.
- **pnpm monorepo** (`pnpm@9.15.0`, Node ≥20): `packages/{shared,sdk,server,demo}` + `tests`.
  - `shared` is buildless (exports `./src/*.ts` directly).
  - **pnpm is NOT on PATH** — installed via corepack shim. See toolchain note below.
- **Server:** Fastify + better-sqlite3 (SQLite). **SDK/demo:** Vite + React (demo).
- **Tests:** Vitest (unit) + Playwright (e2e).
- Strict TypeScript throughout, shared Zod schemas.

### Toolchain gotcha (pnpm via corepack)
pnpm is not on PATH; it's reached through a corepack shim. If `pnpm` isn't found,
enable corepack (`corepack enable`) or use the project's shim. Ports: backend **:8787**,
demo dev **:5173** (Vite preview), Playwright **:5180** (historically) — but note e2e
now spins up its **own fresh in-memory backend on :8787**, so stop `pnpm dev` before
running e2e.

---

## 3. Quickstart / commands

```bash
pnpm install
pnpm dev          # backend :8787 (SQLite, auto-seeded) + demo app :5173
```

Open http://localhost:5173 → "Start guide", or ⌘K for the composer → ask
*"How do I invite a teammate?"* → **Guide me**.

AI mode (optional; degrades gracefully without it): create `packages/server/.env`
(gitignored, loaded via `process.loadEnvFile`):
```
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
AI_API_KEY=<your key>
```

Tests:
```bash
pnpm -r typecheck && pnpm -r test      # 23 shared + 31 server unit tests
# e2e starts its own fresh in-memory backend on :8787 — stop `pnpm dev` first.
cd tests && pnpm exec playwright test   # 28 e2e specs (hostile-fixture demo app)
```

SQLite dev DB lives at `packages/server/data/copilot.db` (+ `-shm`/`-wal`).

---

## 4. Architecture — three planes

- **Runtime** (customer site, deterministic, latency-critical): SDK extracts a
  pseudo-accessibility semantic graph from the DOM → executes the compiled plan with
  the shared deterministic step machine → renders a themeable Shadow-DOM "companion"
  (spotlight ring + card + checklist) → reports events async. Server touched only at
  session start, resume, checkpoint, repair, event flush.
- **Intelligence** (offline, LLM-bounded): plan compiler turns free-form goal + tenant
  docs into a validated `FlowDefinition` — **one** structured LLM call, cached per goal.
- **Control** (observability today, console in M10): server-emitted funnel events,
  `/v1/stats`, and the self-healing plan cache.

### Plan compiler resolution order (free-form goal → guide)
1. RAG (lexical) match against authored flows.
2. Cached AI-authored flow (flows table, key `ai:<sorted-goal-tokens>` via `goalFlowKey`).
3. ONE `provider.authorFlow` call (grounded in knowledge chunks + knownPaths) →
   `toFlowDefinition` → cached + run through deterministic `planNext` (real progress,
   Back/Next/Skip).
4. Infeasible → honest tooltip, no step-less guide.
5. Authoring error → reactive `planAiGuide` JIT fallback (demoted).

### Self-healing plan cache
`target_lost` from ≥3 distinct sessions on an `ai:` flow → `deleteFlow` +
`plan_invalidated` event → next equivalent goal recompiles fresh against current UI/docs.

---

## 5. Repo layout (current files)

```
packages/
  shared/    # isomorphic: zod schemas, delta codec, scoring, plan EXECUTOR, placement scorer
    src/
      schemas/   common, element, snapshot, flow, guidance, sessions, chat, events,
                 theme, onboarding, index
      executor/  plan.ts (planNext + descriptorFromElement — ONE impl, SDK+server), index.ts
      scoring/   score.ts, text.ts, index.ts
      delta/     codec.ts, index.ts
      placement/ place.ts (pure pickPlacement scorer), index.ts
      types.ts, index.ts
      __tests__/ delta, score, text, placement, helpers
  sdk/       # browser: extraction, local execution, matcher, overlay, theming, composer, discovery
    src/
      bootstrap.ts, config.ts, index.ts, log.ts, matcher.ts, semantic-graph.ts,
      serialize.ts, transport.ts
      extraction/ extract.ts, dom.ts, roles.ts, accname.ts
      executor is in shared; engine/guidance-engine.ts wires guidance→overlay
      engine/     guidance-engine.ts (MutationObserver + SPA hooks + rAF rect tracking + rerender recovery)
      host/       host-adapter.ts
      discovery/  discovery-controller.ts
      overlay/    renderer.ts, styles.ts, debug-panel.ts, discovery-dock.ts, composer.ts
                  (chat/widget.ts was DELETED in M9.6)
      ui/         theme.ts (resolves ThemeConfig → --cp-* CSS vars), placement.ts (DOM prober)
  server/    # fastify: routes, plan compiler, telemetry, AI providers, SQLite
    src/
      app.ts, index.ts, config.ts, compile.ts (resolvePlanForGoal), planner.ts
        (re-export of shared executor + AI-disambiguation wrapper planGuidance),
      knowledge.ts (naive keyword searchKnowledge), telemetry.ts, target.ts
      routes/  sessions.ts, guidance.ts, chat.ts, events.ts, stats.ts, onboarding.ts
      db/      connection.ts, repos.ts, seed.ts
      ai/      provider.ts (decide/chat/authorFlow/guide seam), gemini.ts, deterministic.ts,
               index.ts (createAiProvider factory), prompt.ts, retrieve.ts, select.ts,
               guide.ts, authored-flow.ts, embeddings.ts, smoke.ts
      __tests__/ guidance, guidance-ai, planner-ai, observability, sessions, onboarding,
                 retrieve-scale
  demo/      # React demo SaaS app seeded with nasty cases (dup buttons, portals, remounts)
    src/ App.tsx, router.ts, version.ts, main.tsx
         components/ TopNav.tsx, InviteModal.tsx
         pages/ Dashboard.tsx, Members.tsx
tests/e2e/   companion, composer, discovery, extraction, flow, guidance-ux, m9-runtime,
             observability, recovery, transport
docs/        ARCHITECTURE.md (reviewer map), PLATFORM-PLAN.md (M9→M12), M9.6-COMPANION-UX.md
README.md, plan.md, HANDOFF.md (this file)
```

---

## 6. Milestone status

### DONE ✅
- **M0** Scaffold — pnpm monorepo, strict TS, shared Zod schemas.
- **M1** SDK bootstrap + overlay — Shadow-DOM highlight, no host-CSS bleed (browser-proven).
- **M2** Extraction + pseudo-a11y — semantic elements validated vs Playwright's real a11y tree.
- **M3** Compression + transport — delta codec (round-trip tested) + server ingest + Fastify `/v1/guidance`.
- **M4** Sessions + flows + deterministic planner — invite-teammate flow end-to-end, no AI; SQLite tenants/flows/sessions/events, seeded Acme tenant.
- **M5** Matcher + recovery (the hard one) — descriptor→live node re-resolution via shared scorer; engine loop (MutationObserver + SPA-route hooks + rAF rect tracking + rerender recovery). 4 hazards proven in Playwright: duplicate-button, forced remount, modal/portal, SPA route.
- **M5.5** Guidance UX — non-blocking coachmark card (Pause/Hide/Next/Back/Skip/Dismiss) + launcher pill; waiting/active step states gating highlights on preconditions; `control` field switches session to manual mode.
- **M6** AI integration, dual mode — vendor-agnostic `AiProvider` (Gemini + Deterministic + `createAiProvider` factory); planner consults AI for aiAssist+ambiguous+active steps, pick-by-id over an 8-candidate shortlist, zod-validated, hallucinated-id guarded; falls back deterministic on error/no-key. Graceful fallback proven live (429 → deterministic).
- **M6.5** Chat + live guides — shared ChatRequest/Response, `AiProvider.chat()`, `/v1/chat` with flow+page context + deterministic flow-summary fallback; "Guide me" launches a LIVE on-screen guide; server does lexical RAG retrieval — confident match runs that flow deterministically, else agentic page-grounded planner (`provider.guide` picks next element BY ID from live candidates). Both paths proven LIVE with flash.
- **M6.6** Plan compiler ("compile, don't interpret") — free-form goal → RAG → cached AI flow → ONE `authorFlow` call → cached + run through deterministic planNext → infeasible honest tooltip → JIT fallback. Added `knowledge` table + naive keyword `searchKnowledge` + 3 seeded Acme doc chunks.
- **M7** Events + observability + self-healing — EventType enum + plan-compiler types (ai_flow_compiled/ai_flow_infeasible/ai_authoring_failed/plan_invalidated); server-emitted lifecycle events via `telemetry.ts`; self-healing plan cache; `POST /v1/events`; `GET /v1/stats?apiKey=` funnel; SDK recentEvents ring buffer + DebugPanel shadow-DOM overlay (`debug:true`).
- **M9** Runtime split (the architectural milestone) — deterministic executor moved to `shared/src/executor/` (one impl, SDK+server); sessions API (`POST /v1/sessions` ships WHOLE plan via `resolvePlanForGoal` in `compile.ts`; infeasible/no-AI → `kind:"answer"`, NO step-less guide; `GET /v1/sessions/:id` resume; `POST .../checkpoint` persists pointer + flushes events, emits edges, target_lost→self-heal); SDK executes locally every tick (zero network), localStorage session resume; **key split** (publishable vs `tenants.secret_key`; `/v1/stats` requires secret); UX: expandable checklist, Resume-auto navbtn, skip-reason chips. Old `/v1/guidance` + JIT guide kept for back-compat.
- **M9.5** Companion UX/UI redesign — fixed completion bug (event-class-aware tick scheduling: SETTLE_INTENT_MS=50, SETTLE_MUTATION_MS=120; completion is an FSM state); theming (`ThemeConfigSchema` mode light/dark/auto + accent + radius + shadow + fontFamily + density + placement + scrim + celebration → `--cp-*` vars w/ host-luminance sampling + accent contrast clamping); `Copilot.setTheme()` runtime override; token-driven visual system; traveling spotlight motion; `data-cp-state` FSM attr; celebration state (animated SVG check, auto-collapse).
- **M9.6** Onboarding-first companion (3 layers) — see `docs/M9.6-COMPANION-UX.md`.
  - **Layer 1 Discovery:** adaptive placement engine (pure `pickPlacement` scorer in `shared/src/placement/` + DOM prober in `sdk/src/ui/placement.ts`; rises above host fixed bars, dodges support/cookie widgets, never the support corner) + low-footprint progress dock → recommended-flows checklist (`GET /v1/onboarding`), `Copilot.startFlow()`, self-retires when done.
  - **Layer 2 Guidance:** companion card detaches from dock on `startFlow`; "Ask" affordance → Layer 3.
  - **Layer 3 Intelligence:** summoned ⌘K command palette (`sdk/src/overlay/composer.ts`), centered, single-shot, page-aware answer + "Guide me", Esc to close. **Replaced the chatbot-style widget** — bottom-right "?" toggle is GONE, `chat/widget.ts` deleted.
  - Tests at M9.6: 23 shared + 31 server unit, 28 e2e. e2e runs against a fresh in-memory backend.

### LEFT TO DO 🚧
- **M8 — Polish (partial).** Second flow ("Create first project") + knowledge-grounded
  step + cold-clone demo script. (README marks it done but progress notes flag the
  remainder as still open — reconcile this.)
- **M10 — Control plane v1.** Admin API under `/v1/admin/*` (secret key): stats
  overview/funnel/goals, session list + timeline, event search, flow CRUD + versions +
  recompile + promote (`ai:*` → authored), plan-cache list/evict, knowledge CRUD + URL
  ingest job. `packages/console` React app: funnel dashboard (home), session inspector,
  flow studio (JSON-with-validation first), knowledge manager, cache health.
  Off-path "route me from here" re-planning lands here too.
  *Proof goal:* diagnose a broken flow end-to-end in the console.
- **M11 — Voice v1.** `VoiceController` interface in SDK; TTS narration of engine
  instructions; local intent grammar for next/back/repeat/skip/stop (<100ms, no LLM);
  free-form speech → `/v1/chat` → narrated answer; barge-in cancels TTS. Tier 1 default
  Web Speech API; Tier 2 flag Gemini Live API duplex. *Proof:* invite flow hands-free in
  Chrome; Firefox degrades gracefully.
- **M12 — Platform hardening.** Postgres behind the repo layer (SQLite stays for
  dev/tests); embedding retrieval replacing lexical (seams marked in
  `knowledge.ts`/`retrieve.ts`; `ai/embeddings.ts` exists); doc-URL/sitemap ingestion;
  webhooks (`plan_invalidated`, `completion_rate_drop`, `goal_infeasible_spike`);
  app-fingerprint plan-cache keying.

**Deferred deliberately:** RL; vision in runtime; cross-origin iframes; mobile SDKs;
on-device speech.

---

## 7. Key API surface

- `POST /v1/sessions` — start: retrieval → cache → compile → returns full plan.
  Infeasible/no-AI → `kind:"answer"`. Body carries `aiGoal` for free-form.
- `GET /v1/sessions/:id` — resume.
- `POST /v1/sessions/:id/checkpoint` — async pointer persist + event flush; emits
  funnel edges; `target_lost` feeds self-heal.
- `POST /v1/guidance` — legacy per-tick (back-compat; SDK no longer uses it).
- `POST /v1/chat` — page-aware chat; `buildContext` LEADS with current URL + visible
  sections/actions + knowledge chunks (page-awareness bug fixed).
- `POST /v1/events` — SDK/integrator events (foreign sessions dropped, not errored).
- `GET /v1/stats?apiKey=` — funnel (requires **secret** key; publishable → 401).
- `GET /v1/onboarding` — recommended flows + completion status (read-only, Layer 1).

Session kinds: `flow` | `ai_guide` | `answer`. `GuidanceRequest.aiGoal` carries the
free-form goal. Flow source tags: configured | retrieval | cache | compiled | jit_guide.

---

## 8. Working conventions (the user's preferences)

- **Run ONE milestone at a time, with a check-in after each.** Don't do an autonomous
  multi-milestone run. Finish a milestone, prove it (browser/tests), report, then wait
  for go-ahead.
- **Prove work** in the browser preview and/or with tests before declaring done.
- The build plan file: `~/.claude/plans/users-mariyafatima-downloads-prompt-1-m-shimmering-meerkat.md`
  (original M0–M8); `docs/PLATFORM-PLAN.md` supersedes it for M9→M12.

---

## 9. Git / uncommitted state (as of 2026-06-18)

Branch `main`. Recent commits: `5961bd5 major updates + readme update`, `aa84ee0 major
updates`, `900d5aa update chat interface`, `a03c4be plan`, `60e9308 first commit`.

**A large amount of M9.6 work is UNCOMMITTED** (working tree has modified + untracked
files: `discovery/`, `engine/`, `host/`, `composer.ts`, `discovery-dock.ts`,
`ui/placement.ts`, `routes/onboarding.ts`, `ai/embeddings.ts`, `placement/`,
`schemas/onboarding.ts`, e2e `composer.spec.ts` + `discovery.spec.ts`, etc.). The old
`chat/widget.ts` and `tests/e2e/chat.spec.ts` are deleted but not committed.

**A PR was requested then deferred — NOT yet created.** Ask the user before creating
one. Likewise, commit/push only when the user asks.

---

## 10. Where to find what
- Reviewer's file-by-file map, libraries + why, problems→solutions table: `docs/ARCHITECTURE.md`.
- Platform roadmap M9→M12: `docs/PLATFORM-PLAN.md`.
- M9.6 companion UX design (placement scorer, 3 layers, form rules): `docs/M9.6-COMPANION-UX.md`.
- README quickstart + milestone checkboxes: `README.md`.

---

## 11. Suggested next step
Pick ONE: (a) finish **M8 remainder** (2nd "Create first project" flow + knowledge-
grounded step + cold-clone demo), (b) start **M10 control plane** (admin API + console),
or (c) commit the uncommitted M9.6 work + open the deferred PR (ask user first).
Reconcile the M8 done/not-done discrepancy between README and progress notes before
claiming M8 complete.
```
