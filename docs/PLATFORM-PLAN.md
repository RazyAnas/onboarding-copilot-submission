# Platform Plan — M9 → M12 (succeeds the M0–M8 vertical-slice plan)

**Mental model: GPS navigation for software.** Route computed up front (compiled plan),
turn-by-turn executed locally (SDK), recalculation when off-route (repair), traffic data
improves routes for everyone (telemetry → self-healing cache). Voice is optional narration
over the same route.

**Three planes:**
- **Runtime** (customer site, latency-critical, deterministic): SDK extraction → local plan
  execution → overlay/voice → async event flush. Server touched only at: session start
  (fetch plan), checkpoint (persist pointer), repair (rare), event flush.
- **Intelligence** (offline, LLM-heavy, amortized): doc ingestion → knowledge index → plan
  compiler → plan cache; telemetry feedback → invalidation → recompile.
- **Control plane** (separate admin product, separate auth): funnel analytics, session
  inspector, flow studio, knowledge manager, cache health, tenants/envs/keys.

Locked principles carried forward: pseudo-a11y semantic extraction; AI picks by id over
deterministic candidates, never raw DOM; deterministic hot path; a wrong highlight is worse
than no highlight; honest infeasibility; every guide shows its steps (no step-less mode).

---

## M9 — Runtime split + UX reset  *(the architectural milestone)*

- **Shared local executor:** move the deterministic step machine (`planNext`, condition
  evaluation, confidence ladder) from `server/src/planner.ts` into `shared/src/executor/` —
  one implementation, run by both SDK (hot path) and server (checkpoint validation).
- **Sessions API:** `POST /v1/sessions` (start: retrieval → cache → compile → full plan
  returned; infeasible/no-AI → honest `answer`, **no step-less guide**), `GET /v1/sessions/:id`
  (resume), `POST /v1/sessions/:id/checkpoint` (async pointer persistence + event flush;
  server emits funnel edges; `target_lost` feeds self-healing).
- **SDK local engine:** plan fetched once, every tick local (extract → execute → render);
  checkpoint async. Session persisted to `localStorage` → refresh resumes mid-flow.
- **Key split:** publishable key (browser: sessions/guidance/chat/events) vs secret key
  (stats/admin). `/v1/stats` requires the secret key.
- **UX reset:** unified card; expandable step checklist (trust artifact); explicit
  "Resume auto-guide" replacing the permanent manual latch; skip-with-reason; review-mode Back.
- *Deferred within M9:* full off-path re-plan ("route me from here") — the confidence ladder
  (text-only degrade + target_lost + self-heal) covers drift until M10.
- **Proof:** invite flow completes with the network throttled (instant local steps); page
  refresh mid-flow resumes at the same step (Playwright); stats rejects publishable key;
  checklist + skip reasons visible in browser; all prior unit/e2e suites stay green.

## M10 — Control plane v1
- Admin API under `/v1/admin/*` (secret key): stats overview/funnel/goals, session list +
  timeline, event search, flow CRUD + versions + recompile + promote (`ai:*` → authored),
  plan-cache list/evict, knowledge CRUD + URL ingest job.
- `packages/console`: React app — funnel dashboard (home), session inspector, flow studio
  (JSON-with-validation first), knowledge manager, cache health w/ recompile budget + flap alert.
- *Proof:* diagnose a broken flow end-to-end in the console (notice → inspect → fix → verify).

## M11 — Voice v1
- `VoiceController` interface in SDK; narration of engine instructions (TTS), local intent
  grammar for next/back/repeat/skip/stop (<100ms, **no LLM**), free-form speech → existing
  `/v1/chat` → narrated answer; barge-in cancels TTS.
- Tier 1 default: Web Speech API (free, zero bundle). Tier 2 flag: Gemini Live API duplex
  (ephemeral tokens via server). Degrade: no SpeechRecognition → voice-out + buttons.
- *Proof:* complete the invite flow hands-free in Chrome; Firefox degrades gracefully.

## M12 — Platform hardening
- Postgres behind the repo layer (SQLite stays for dev/tests); embedding retrieval replacing
  lexical (seams marked in `knowledge.ts`/`retrieve.ts`); doc-URL/sitemap ingestion pipeline;
  webhooks (`plan_invalidated`, `completion_rate_drop`, `goal_infeasible_spike`);
  app-fingerprint plan-cache keying (UI redesign auto-invalidates).

**Deferred deliberately:** RL; vision in the runtime; cross-origin iframes; mobile SDKs;
on-device speech.

**Risks:** executor fork (mitigation: single implementation in `shared`); plans visible in
devtools (acceptable — document it); self-heal flapping (recompile budget); console scope
creep (dashboard + inspector first); SQLite→Postgres no later than M12.
