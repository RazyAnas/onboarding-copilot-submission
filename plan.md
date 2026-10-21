\# AI Context-Aware Product Copilot — Implementation Plan

\## Context

We're building a hosted, embeddable \*\*onboarding copilot\*\* — a smarter, more resilient WalkMe/Pendo/Userpilot. Companies drop a JS SDK on their SaaS site; it understands the current page, tracks where the user is in a workflow, and reliably highlights the right UI element to guide them through flows like "Invite teammate" or "Create first project". The hard part is \*\*reliable UI understanding across arbitrary, dynamic web apps\*\* (rerenders, SPA routes, modals/portals, duplicate buttons, weak semantics).

\*\*Scope (agreed):\*\* a \*\*vertical slice\*\* — one demo SaaS app, 1–2 real flows, local dev, SQLite, multi-tenant-\*ready\* schema (single tenant in practice). Goal: nail the resilient UI-understanding + recovery core; everything else is plumbing kept deliberately thin but honest.

\*\*Decisions locked with the user:\*\*

\- \*\*AI = hybrid, AI-first but bounded.\*\* \*\*Gemini 2.5 Pro\*\* (Google \`@google/genai\`, model \`gemini-2.5-pro\`) does workflow planning, documentation understanding, navigation reasoning, and recovery decisions. Element extraction, matching, highlighting, accessibility analysis, rerender recovery, and candidate ranking stay \*\*deterministic\*\*. The LLM \*\*never reads raw DOM\*\* — it reasons over a structured semantic representation and chooses among deterministically-extracted candidates \*\*by internal id\*\*. System supports both \*\*AI-enabled\*\* and \*\*deterministic-fallback\*\* modes.

\- \*\*Transport:\*\* HTTP request/response (SDK owns cadence; debounced POST snapshot → instruction).

\- \*\*Test target:\*\* a small React demo SaaS app we control, seeded with the nasty cases, driven by Playwright.

\### Three hard truths that shape the architecture (read first)

1\. \*\*No real a11y-tree API exists for in-page JS.\*\* The AOM never shipped; Playwright/Browser-Use get the real tree via CDP, which an embedded SDK cannot use. So the SDK \*\*computes a pseudo-accessibility representation\*\* (roles + ARIA + semantics + computed visibility). Playwright's real a11y tree (\`page.accessibility.snapshot()\`) becomes a \*\*test-time oracle\*\*, not a runtime dependency.

2\. \*\*"Survives rerenders" ⇒ never cache DOM nodes.\*\* We hold a resilient \*TargetDescriptor\* and \*\*re-resolve it every tick\*\*. That re-resolution is the matcher.

3\. \*\*The LLM stays off the hot path.\*\* Per-tick re-resolution, highlighting, and recovery are deterministic and synchronous. Gemini is called only on step transitions / genuine ambiguity / unexpected-state recovery, with results cached per (flow, step, page-signature).

\---

\## Recommended Architecture

\`\`\`

Browser page

→ SDK extraction (pseudo-a11y semantic elements, stable internal ids)

→ delta compression + zod validation

→ POST /guidance (debounced, AbortController-cancellable)

→ backend: session state + flow def

→ planner: deterministic step machine; Gemini for planning/navigation/recovery (reasons over semantic rep, returns chosen element id + step + confidence, zod-validated)

→ server-side matcher validates the chosen candidate, attaches fallbacks

→ GuidanceResponse { stepId, instruction, TargetDescriptor, confidence, mode }

→ SDK matcher RE-RESOLVES descriptor against current DOM (deterministic, ordered scoring)

→ Shadow-DOM overlay highlight + tooltip (rAF-throttled)

→ event feedback (clicks, route changes, step-advance) → POST /events

\`\`\`

\*\*Division of labor is the spine of the design:\*\* deterministic code produces the \*candidates and the rendering\*; Gemini provides the \*reasoning\* over a clean structured representation and is constrained to pick by id. This keeps AI central but explainable, testable, and cheap.

\---

\## Tech Stack

\- \*\*Language:\*\* TypeScript (strict), ESM throughout.

\- \*\*Monorepo:\*\* pnpm workspaces.

\- \*\*SDK build:\*\* Vite library mode → IIFE (script-tag embed) + ESM. Zero runtime deps in the shipped bundle beyond the shared schema/scoring (tree-shaken).

\- \*\*Backend:\*\* Node + \*\*Fastify\*\* (schema-first, fast; \`fastify-type-provider-zod\` for validation). \`better-sqlite3\` for persistence (synchronous, single-node, trivial to seed).

\- \*\*AI:\*\* \`@google/genai\`, \`gemini-2.5-pro\`, behind an \`AiProvider\` interface with a \`DeterministicProvider\` fallback.

\- \*\*Validation:\*\* Zod (shared package).

\- \*\*Demo app:\*\* React + Vite, intentionally hostile fixtures.

\- \*\*Tests:\*\* Vitest (unit) + Playwright (e2e/browser).

\- \*\*Observability:\*\* structured logs (pino) + an opt-in SDK debug overlay.

\---

\## File / Folder Structure

\`\`\`

projectonboard/

package.json # pnpm workspaces root, scripts

pnpm-workspace.yaml

tsconfig.base.json

packages/

shared/ # ISOMORPHIC: used by both sdk & server

src/types.ts # SemanticElement, TargetDescriptor, ...

src/schemas/\*.ts # zod: snapshot, guidance req/res, flow def, events

src/delta/{encode,decode}.ts # repeated-sibling delta codec (+ round-trip tests)

src/scoring/{accname,score}.ts# accessible-name algo subset + candidate scoring

sdk/ # browser only

src/bootstrap.ts # Copilot.init(), lifecycle (start/pause/resume/reset)

src/extraction/\*.ts # DOM walk → SemanticElement\[\], pseudo-a11y, bbox, visibility, frame path

src/semantic-graph.ts # stable internal ids, parent chain, scroll containers

src/serialize.ts # build PageSnapshot + delta-compress + size cap

src/transport.ts # debounced POST, AbortController, retry/backoff

src/matcher.ts # ordered re-resolution of TargetDescriptor (uses shared/scoring)

src/overlay/\*.ts # Shadow-DOM highlight + tooltip, rAF reposition

src/recovery.ts # MutationObserver-driven re-resolve + escalate

src/events.ts # click/route/advance tracking

src/index.ts

server/

src/app.ts # fastify bootstrap

src/routes/{guidance,events,health}.ts

src/auth.ts # apiKey → tenant

src/session.ts # session manager + state machine

src/flow-store.ts # tenant-scoped flow definitions

src/planner.ts # deterministic step machine + AI orchestration

src/ai/{provider.ts,gemini.ts,deterministic.ts,prompt.ts}

src/matcher.ts # server-side candidate validation + fallback selection

src/knowledge.ts # naive doc retrieval for "documentation understanding"

src/db.ts # better-sqlite3 schema + migrations + seed

flows/\*.json # seeded flow definitions

demo/ # React+Vite hostile-fixture SaaS app

src/... # duplicate buttons, portals/modals, SPA routes, forced remounts, weak-semantic page

tests/

e2e/\*.spec.ts # Playwright

README.md # run + demo script

\`\`\`

\*\*Reuse note:\*\* \`accname\` and \`score\` live in \*\*shared\*\* so the SDK matcher and the server matcher use the \*same\* deterministic logic — single source of truth, unit-tested once.

\---

\## Data Model (SQLite)

\- \`tenants(id, name, api\_key\_hash, config\_json, created\_at)\`

\- \`flows(id, tenant\_id, key, name, definition\_json, version, created\_at)\`

\- \`sessions(id, tenant\_id, flow\_id, user\_ref, current\_step\_id, state\_json, status, created\_at, updated\_at)\`

\- \`events(id, session\_id, type, payload\_json, created\_at)\`

\- \`knowledge(id, tenant\_id, title, content)\` — plain text chunks; naive keyword retrieval feeds Gemini's "documentation understanding". No vector DB in v1.

\- \`snapshots(id, session\_id, page\_signature, compressed\_json, created\_at)\` — capped ring buffer, debug/observability only.

\---

\## Core Schemas (shared, Zod)

\- \*\*\`SemanticElement\`\*\*: \`{ id, role, name, text, tag, aria, bbox, cssPath, parentChain, nearbyLabels, visible, enabled, zIndex, scrollContainerId, framePath, confidence, lastSeen }\`.

\- \*\*\`PageSnapshot\`\*\*: \`{ url, title, viewport, frameTree, elements: SemanticElement\[\], deltaGroups?: DeltaGroup\[\], capturedAt }\` — decoder accepts plain \`elements\` and/or \`deltaGroups\` (backward compatible).

\- \*\*\`TargetDescriptor\`\*\* (what the SDK re-resolves): \`{ internalId?, role, name, text, testid?, ariaLabel?, ancestryHints, sectionHint, ordinalHint, bboxHint }\`.

\- \*\*\`GuidanceRequest\`\*\*: \`{ apiKey, sessionId?, flowKey?, snapshot, recentEvents }\`.

\- \*\*\`GuidanceResponse\`\*\*: \`{ sessionId, stepId, instruction: { kind: 'highlight'|'tooltip'|'navigate'|'done', target?: TargetDescriptor, content }, confidence, mode: 'ai'|'deterministic' }\`.

\- \*\*\`FlowDefinition\`\*\*: \`{ key, name, steps: Step\[\] }\`, \`Step = { id, goal, matchCriteria, advanceCondition, branch?, aiAssist?: boolean }\`.

\- \*\*\`EventReport\`\*\*: \`{ sessionId, type, payload }\`.

Gemini's structured output schema (validated, never freeform): \`{ stepId, targetElementId, rationale, confidence }\`.

\---

\## Module-by-Module Plan

1\. \*\*Extraction (SDK):\*\* walk DOM for interactive + landmark nodes. Compute implicit/explicit \*\*role\*\*; \*\*accessible name\*\* via accname subset (aria-label > aria-labelledby > \`\` > text > title > placeholder/alt); visibility (computed style + \`IntersectionObserver\`); bbox; enabled/disabled; ancestry; nearest landmark/heading (for disambiguation); scroll container; frame path. Cap to top-N (visible/in-viewport prioritized).

2\. \*\*Semantic graph + stable ids:\*\* id = stable hash of (role, name, testid, structural-path signature) — resilient to text/attribute churn so an element keeps identity across rerenders.

3\. \*\*Compression:\*\* detect repeated sibling groups (identical structural signature) → template + per-instance diffs. Server decodes to full array. Round-trip unit-tested; size-capped.

4\. \*\*Transport:\*\* debounce (settle window after mutation burst / route change), \`AbortController\` cancels stale in-flight requests, exponential backoff on failure.

5\. \*\*Server auth + session + flow-store:\*\* apiKey→tenant; session holds current step + history + last-successful-target-per-step (powers historical matching).

6\. \*\*Planner:\*\* deterministic state machine advances steps via \`advanceCondition\`. AI mode calls Gemini for: which step are we on (ambiguous), navigation reasoning (what next), recovery (unexpected page). Deterministic mode uses pre-authored \`matchCriteria\` only. Results cached per (flow, step, page-signature).

7\. \*\*Prompt builder:\*\* compact, deterministic prompt from the semantic rep + flow goal + relevant knowledge chunks. Strict JSON output schema.

8\. \*\*Matcher (the crux — shared scoring):\*\* ordered weighted candidate scoring — (1) role+name, (2) visible text, (3) ancestry/semantic context, (4) stable attrs (testid/aria-label/name/title), (5) bbox + nearby labels, (6) historical successful target, (7) vision fallback \*\*(designed as a hook/stub in v1)\*\*. \*\*Duplicate-button problem\*\* solved by context scoring: nearest landmark + nearest heading + container role + ordinal + the step's \`sectionHint\`.

9\. \*\*Overlay (SDK):\*\* Shadow-DOM root (host-CSS isolation); highlight box + tooltip positioned from \`getBoundingClientRect\`, repositioned on scroll/resize via \`rAF\` throttle; \`IntersectionObserver\` auto-scrolls target into view.

10\. \*\*Recovery (SDK):\*\* \`MutationObserver\` (debounced) → re-resolve descriptor → on confidence drop / loss, re-extract + try fallbacks → if still lost, request fresh guidance (AbortController cancels stale).

11\. \*\*Events:\*\* click/route/step-advance detection → POST; planner consumes to advance.

12\. \*\*Knowledge:\*\* naive keyword retrieval over \`knowledge\` chunks → injected into Gemini prompt for doc-grounded flows.

13\. \*\*Tenant config + safety:\*\* per-tenant config\_json; all external input zod-validated; no silent failures (typed Result/throw + logged).

14\. \*\*Observability:\*\* pino structured logs server-side; SDK debug overlay (\`debug:true\`) showing candidate scores + chosen target.

\---

\## Milestones (RAMP "Map" + "Proof")

\- \*\*M0 — Scaffold.\*\* pnpm monorepo, strict TS, shared types/schemas, scripts. \*Proof:\* \`pnpm -r typecheck\` + \`pnpm -r test\` green (empty).

\- \*\*M1 — SDK bootstrap + overlay.\*\* \`Copilot.init()\` renders a Shadow-DOM highlight on a hardcoded element in the demo app. \*Proof:\* highlight visible in browser; no host-CSS bleed.

\- \*\*M2 — Extraction + pseudo-a11y.\*\* Dump \`SemanticElement\[\]\` to console/JSON. \*Proof:\* diff against Playwright \`accessibility.snapshot()\` oracle on demo pages — roles/names align.

\- \*\*M3 — Compression + transport + server ingest.\*\* Delta-compress, POST, server decodes. \*Proof:\* delta round-trip unit test; server log shows decoded snapshot; both plain & delta arrays accepted.

\- \*\*M4 — Session + flow-store + deterministic planner.\*\* 3-step "Invite teammate" flow, no AI. \*Proof:\* Playwright walks the flow end-to-end deterministically.

\- \*\*M5 — Matcher + recovery (the hard milestone).\*\* Duplicate-button disambiguation, modal/portal targeting, SPA route change, forced React remount, scroll-into-view. \*Proof:\* dedicated Playwright spec per nasty case passes.

\- \*\*M6 — Gemini integration + dual mode.\*\* AI mode does planning/navigation/recovery over semantic rep, zod-validated output; deterministic fallback works with the API key absent. \*Proof:\* AI mode resolves an ambiguous state correctly; flip flag → deterministic still completes the flow.

\- \*\*M7 — Events + completion + observability.\*\* \*Proof:\* events logged, session reaches \`done\`; debug overlay shows scores.

\- \*\*M8 — Polish.\*\* 2nd flow ("Create first project"), knowledge-grounded step, README + demo script. \*Proof:\* both flows complete; cold-clone \`pnpm i && pnpm dev\` works from README.

\---

\## Risk Register

| Risk | Mitigation |

|---|---|

| Brittle element matching | Multi-signal weighted scoring + fallbacks + historical targets; confidence threshold triggers re-extract before giving up. |

| Bad accessibility markup | Pseudo-a11y derives implicit roles from tags; falls back to text/structural/bbox signals; vision hook as last resort. |

| SPA route churn | Route-change detection resets snapshot + re-plans; debounced settle window avoids mid-transition snapshots. |

| Duplicate buttons | Context scoring (landmark + heading + container + ordinal) + step \`sectionHint\`. |

| iframe complexity | \`framePath\` modeled in schema; v1 supports same-origin frames, cross-origin explicitly out-of-scope with clear log. |

| Overlay conflicts | Shadow DOM isolation + high z-index + pointer-events scoped to overlay only. |

| Too much LLM dependence | LLM off hot path; deterministic fallback mode is first-class and tested; AI constrained to pick-by-id. |

| Prompt drift | Strict zod output schema + deterministic post-processing + cached responses per page-signature. |

| Backend latency | SDK re-resolves locally every tick without waiting on server; server hit only on transitions. |

| Multi-tenant complexity | Tenancy is schema-level only in v1 (tenant-scoped queries); no dashboards/billing. |

| Cross-customer debugging | Structured logs keyed by tenant/session + SDK debug overlay + capped snapshot ring buffer. |

\---

\## Testing & Proof Strategy

\- \*\*Unit (Vitest):\*\* delta codec round-trip; accname computation; candidate scoring/ranking; selector fallback ordering; flow state-machine transitions; zod validation; session serialization.

\- \*\*E2E (Playwright) against demo app:\*\* overlay smoke; duplicate-button disambiguation; modal/portal targeting; SPA route-change recovery; forced-remount recovery; scroll-into-view; full flow completion in both AI and deterministic modes. Use the \*\*real a11y tree as oracle\*\* for extraction accuracy.

\- Each milestone's "Proof" line above is the gate to call it done.

\---

\## First Implementation Steps (when approved)

1\. M0 scaffold: \`pnpm init -w\`, \`pnpm-workspace.yaml\`, \`tsconfig.base.json\`, four packages with strict TS, root scripts (\`typecheck\`, \`test\`, \`dev\`, \`build\`).

2\. \`shared\`: author \`types.ts\` + zod schemas + delta codec + scoring skeleton, with round-trip + scoring unit tests.

3\. \`demo\`: minimal React+Vite app with one clean page + one hostile page (two "Invite" buttons in different sections).

4\. M1: \`Copilot.init()\` + Shadow-DOM overlay highlighting a hardcoded element on the demo app — first in-browser proof.

\## Instruction Set for the Next Agentic Coder (RAMP rules)

\> Build strictly milestone-by-milestone (M0→M8); \*\*do not advance until the current milestone's Proof passes in the browser/tests.\*\* Rules: strict TypeScript, strong types on all public APIs, validate every external input with zod, no silent failures, keep the SDK bundle lean (no heavy runtime deps), shared types/scoring live in \`packages/shared\` (single source of truth), AI output is always zod-validated and constrained to pick-by-id (never freeform DOM, never raw DOM into the prompt), deterministic fallback mode must work with no API key. The LLM is Gemini 2.5 Pro via \`@google/genai\` (\`gemini-2.5-pro\`) — \*\*not\*\* Claude. Prove each milestone with the exact command + browser check + log to inspect + failure mode listed in the plan.

\---

\## Open follow-ups (non-blocking; will default if unanswered)

\- Demo app surface: I'll default to a fake "team workspace" (Settings → Members → Invite) — the canonical duplicate-button scenario.

\- Gemini key: dev will need \`GEMINI\_API\_KEY\` for AI mode; deterministic mode runs without it. I'll read it from env, never commit it.