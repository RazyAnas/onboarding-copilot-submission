# Onboarding Copilot

> 📖 **New here? Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — a full reviewer's map: every file and what it does, the libraries and why, each problem and how it's solved, and a "where to find what" index.

An embeddable **AI onboarding copilot** for SaaS products — a smarter, more resilient WalkMe/Pendo. Drop a JS SDK on your site; it understands the live page, compiles a step-by-step guide for any user goal, and reliably spotlights the right UI element — surviving rerenders, SPA routes, modals, and duplicate buttons.

**Mental model: GPS navigation for software.** The route (plan) is computed up front by AI, turn-by-turn execution is local and instant, going off-route triggers recalculation, and telemetry silently improves routes for everyone.

```
User asks "how do I invite a teammate?"
  → server: retrieval → cached plan → or ONE LLM call compiles a full guide
  → SDK receives the whole plan and executes it locally (zero network per step)
  → soft spotlight + companion card guide the user step by step
  → checkpoints + events flow back → funnel analytics + self-healing plan cache
```

## How it works

Three planes:

- **Runtime** (customer site, deterministic, latency-critical): the SDK extracts a pseudo-accessibility semantic graph from the DOM, executes the compiled plan with a shared deterministic step machine, renders a themeable Shadow-DOM "companion" (spotlight ring + card + checklist), and reports events asynchronously. The server is touched only at session start, resume, and checkpoint.
- **Intelligence** (offline, LLM-bounded): the plan compiler turns a free-form goal + tenant docs into a validated `FlowDefinition` — **one** structured LLM call, cached per goal. The LLM never reads raw DOM and never emits selectors; it picks among deterministically-extracted candidates **by id**, and everything it returns is Zod-validated. Works fully without an API key (deterministic mode).
- **Control** (observability): server-emitted funnel events, `/v1/stats`, and a **self-healing plan cache** — if a compiled plan's target can't be grounded across 3 distinct sessions, the plan is evicted and recompiled fresh against the current UI/docs.

## Quickstart

```bash
pnpm install
pnpm dev          # backend :8787 (SQLite, auto-seeded) + demo app :5173
```

Open http://localhost:5173 → "Start guide", or ⌘K for chat → ask *"How do I invite a teammate?"* → **Guide me**.

AI mode (optional — everything degrades gracefully without it): create `packages/server/.env`

```
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
AI_API_KEY=<your key>
```

Tests:

```bash
pnpm -r typecheck && pnpm -r test     # 23 shared + 31 server unit tests
# e2e starts its own fresh in-memory backend on :8787 — stop `pnpm dev` first.
cd tests && pnpm exec playwright test # 28 e2e specs (hostile-fixture demo app)
```

## Project structure

```
packages/
  shared/    # isomorphic: zod schemas, delta codec, scoring, plan EXECUTOR (runs in SDK + server)
  sdk/       # browser: extraction, local execution, matcher, companion overlay, theming, chat
  server/    # fastify: sessions/guidance/chat/events/stats routes, plan compiler, telemetry,
             # AI providers (Gemini via Vercel AI SDK + deterministic fallback), SQLite
  demo/      # React demo SaaS app seeded with the nasty cases (duplicate buttons, portals, remounts)
tests/e2e/   # Playwright specs (real a11y tree as extraction oracle)
docs/M9.6-COMPANION-UX.md  # companion UX design
paper/                 # IEEE research paper (PDF + LaTeX), benchmark, results
```

## Milestones (all complete)

### Delivered ✅

- [x] **M0 — Scaffold.** pnpm monorepo, strict TS, shared Zod schemas.
- [x] **M1 — SDK bootstrap + overlay.** Shadow-DOM highlight, no host-CSS bleed.
- [x] **M2 — Extraction + pseudo-a11y.** Semantic elements validated against Playwright's real a11y tree.
- [x] **M3 — Compression + transport.** Delta codec (round-trip tested) + server ingest.
- [x] **M4 — Sessions + flows + deterministic planner.** Invite-teammate flow end-to-end, no AI.
- [x] **M5 — Matcher + recovery (the hard one).** Duplicate buttons, modals/portals, SPA routes, forced remounts — a Playwright spec per hazard.
- [x] **M5.5 — Guidance UX.** Non-blocking coachmark, waiting/active step gating, launcher pill.
- [x] **M6 — AI integration, dual mode.** Vendor-agnostic `AiProvider` (Gemini + deterministic); pick-by-id over shortlisted candidates; graceful fallback proven live.
- [x] **M6.5 — Chat + live guides.** Grounded chat widget (⌘K, voice input), "Guide me" launches a real on-screen guide.
- [x] **M6.6 — Plan compiler.** Free-form goals compile into full flows (ONE LLM call, knowledge-grounded), cached in the flows table; honest "can't guide that here" on infeasible goals.
- [x] **M7 — Events + observability + self-healing.** Server-emitted funnel events, `/v1/events`, `/v1/stats` (per-step drop-off), debug overlay, and the self-healing plan cache.
- [x] **M9 — Runtime split.** Plan ships whole to the SDK; every step executes locally (zero per-step network); sessions resume across refresh (`localStorage` + `/v1/sessions`); publishable/secret key split.
- [x] **M9.5 — Companion UX/UI.** Token-driven theming (light/dark/auto with host-luminance sampling, brand accent with contrast clamping, density/radius/placement), motion system (traveling spotlight, reduced-motion safe), celebration state, completion-bug fix (event-class-aware tick scheduling).
- [x] **M9.6 — Onboarding-first companion (3 layers).** *Discovery:* adaptive placement engine (rises above host fixed bars, dodges support/cookie widgets, never the support corner) + a low-footprint progress dock → recommended-flows checklist (`GET /v1/onboarding`). *Guidance:* the M9.5 companion card, launched from the checklist. *Intelligence:* a summoned ⌘K command palette (page-aware, single-shot, "Guide me" → live guide) that **replaced the chatbot-style widget** — the bottom-right "?" toggle is gone. See [docs/M9.6-COMPANION-UX.md](docs/M9.6-COMPANION-UX.md).

## Locked principles

1. **The LLM stays off the hot path.** Per-tick resolution, highlighting, and recovery are deterministic and synchronous; AI plans once, offline, cached.
2. **AI picks by id, never selectors.** It reasons over deterministically-extracted candidates; output is always schema-validated; hallucinated ids are rejected.
3. **Never cache DOM nodes.** A resilient `TargetDescriptor` is re-resolved every tick — that's what survives rerenders.
4. **A wrong highlight is worse than no highlight.** Confidence-gated spotlighting with honest text-only degradation.
5. **Deterministic mode is first-class.** Everything works without an API key.
6. **Tokens are the only theming surface.** Customers brand the companion; they can't break its layout or legibility.
