---
schema: pipeline.backlog-item.v1
id: pipeline.projection-drift-fault-after-design-implementation-transition-forces-restart
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: e5504d3f704602aa90b88e7fddb72ea5ad9e15cd
closure_evidence: backlog/items/2026-08-29-projection-drift-fault-after-design-implementation-transition-forces-restart.md
sprint: nova
done_when: manual
source: "Codex/WSL report, delivered inline in chat by the PO, plus the PO's own observations naming the design→implementation handover as the likely driver defect, during the 2026-08-29 three-runner greenfield test."
---

# A projection-drift readiness fault fires immediately after the design→implementation phase transition, requiring a runtime restart

## What happened

Codex hit a `projection-drift` readiness status twice, both times immediately
after the phase transition from design to implementation, and both times the
only recovery was a runtime restart. The PO independently names the
design→implementation handover as the likely driver defect. This is not a
happy path — a normal, successful phase transition should not routinely land
the session in a state that requires restarting.

## Where it is

`projection-drift` is a real, named status in this repository's readiness
machinery: `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs`, in
`PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES` (line 30, among ~24 other
non-ready statuses including `restart-required` itself). Its presence in that
array means the gate treats it as a controlling non-ready state — one that
blocks a mutating entrypoint the same way `restart-required` does.

**UPDATE (NVA-R40-PROJDRIFT, 2026-08-29, follow-up dispatch):** the producer
is now located, and the phase-transition hypothesis is REFUTED by a
controlled reproduction in this repository.

- **Producer, exact citation:** `plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
  `legacyInspection()`-driven `legacy.status === "partial"` handler (starting
  ~line 3864), specifically the `runtimePlan.status === "ready"` branch —
  status assigned at **line 3985** (`status: initialize ?
  "runtime-initialization-required" : "projection-drift"`), the `runtime`
  object built at **line 3960**, and the diagnostic emitted at **line 3993**
  (`"projection_drift", "generated runtime bytes differ from the V3
  projection"`). It is reached when `planRunnerProfileMigrationV3()`
  (`runner-profile-migration-v3.mjs`) finds every V3 runtime-projection
  target (`.claude/settings.json`, `.claude/pipeline.json`,
  `.claude/pipeline.yaml`, `.codex/config.toml`, `.codex/agents/*.toml` —
  the full list in
  `plugins/pipeline-core/config/runtime-projection-v3-owned-keys.json`)
  already present on disk (nothing `missing`), but with bytes that no longer
  match a fresh render from the CURRENT `pipeline.user.yaml`.
- **Reproduction method:** a real `mkdtemp` temp repo, driven through the
  REAL code path — `initializeRestartRequiredRoot`/`clearRuntimeBarrier` →
  `applyProjectOnboardingKickoffV4` → `applyProjectOnboardingKickoffPromotionV4`
  → `pipeline-state.mjs submit-plan/present-plan/approve-plan/set-phase`,
  runner `"codex"` throughout — never a hand-constructed state fixture. Ported
  as permanent regression coverage:
  `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`, test
  `"NVA-R40-PROJDRIFT: set-phase --phase implementation does not itself cause
  projection-drift; an untracked pipeline.user.yaml edit does, at the very
  next inspection"` (153 passed, 0 failed in the full suite; 152 baseline + 1
  new).
- **Finding 1 (REFUTES the literal hypothesis):** a CLEAN
  `set-phase --phase implementation` transition, via the real code path,
  never produces `projection-drift`. Status stays `"ready"` throughout —
  before, during, and immediately after the transition.
- **Finding 2 (the actual mechanism):** an untracked edit to
  `pipeline.user.yaml` (the V3 runtime-projection source) made WITHOUT going
  through the regeneration/repair tool reliably reproduces the exact
  reported status and diagnostic (`"generated runtime bytes differ from the
  V3 projection"`) at the very next inspection — whether the edit happens
  before or after `set-phase`. This is the best available explanation for
  the "immediately after the transition" timing Codex/the PO observed: `set-
  phase`'s own successful transition is the point where the runner next asks
  "what now?" (its `nextAction` proposal is exactly what a runner calls
  next), so it is the first inspection to SURFACE drift that was already
  present from an earlier, unrelated edit to `pipeline.user.yaml` sometime
  during design — not something the transition itself caused. What that
  earlier edit specifically was in the real Codex/WSL session is not
  determinable from this reproduction; the mechanism that WOULD explain the
  reported timing is confirmed to exist and behave exactly as described.
- **Finding 3 (recovery already exists, and its restart requirement is
  structural for Codex, not a code defect):** the documented narrower repair
  (`project-onboarding-v3.mjs plan-repair` → `apply-repair`, established by
  the closed sibling item
  `2026-08-09-kickoff-design-names-the-wrong-repair-for-projection-drift.md`)
  is real and already ships — but for a runner requiring native runtime
  readback (Codex), `apply-repair` on a `projection-drift` state still
  resolves to `restart-required`, not `ready` (reproduced directly). Codex
  has no way to re-read its own runtime target bytes
  (`.codex/config.toml`/`.codex/agents/*.toml`) without a fresh process
  (ADR-0057 decision 2a) — a narrower, non-restart recovery is not available
  at this layer for Codex without changing that structural constraint, which
  is out of this item's/this dispatch's scope (a broader redesign, not a
  narrow mechanism-specific fix).

**No code fix applied.** Per this item's own Acceptance criteria, the
"causal link NOT confirmed" branch applies: the reported hypothesis (the
design→implementation transition itself is the trigger) does not hold up
under reproduction. The DoD is satisfied by the reproduction test (permanent
coverage) plus this update. A residual, narrower question — "what specific
tool or step in a design-phase session edits `pipeline.user.yaml` without
regenerating the runtime projection, and should that be made auto-
regenerating?" — is a new, distinct question outside this item's scope; not
opened as a new backlog item here since no second source of evidence (beyond
this reproduction's plausibility) currently supports it.

## Proposal

1. A future session (or the PO) should trace `projection-drift`'s actual
   producer in `project-onboarding-v3.mjs` and confirm or refute whether it is
   coupled to the design→implementation transition specifically.
2. If confirmed: whatever comparison flags `projection-drift` immediately after
   a transition that the transition itself just performed should either (a)
   not fire on data the transition just wrote (a staleness check racing its
   own write), or (b) have a narrower, non-restart recovery than a full
   process restart — the same complaint raised independently in F09 (a pure
   manifest/language repair forcing a full restart) suggests `restart-required`
   is over-used as the default remedy for readiness faults that could be
   resolved by re-reading current state instead.

## Acceptance

- A controlled reproduction exists in this repository: perform an actual
  design→implementation phase transition (via the real code path, not a
  hand-constructed state fixture) and observe whether `projection-drift`
  fires. This is the missing piece the triage explicitly calls out — Codex's
  report is the only evidence today.
- Once reproduced, the actual producing function/comparison is named with a
  file/line reference, replacing this item's honest "could not locate" note.
- If the causal link to the phase transition is confirmed, a fix is proposed
  and tested that either prevents the false trigger or narrows the recovery
  below "restart the whole runtime."
- If the causal link is NOT confirmed (the PO's hypothesis does not hold up
  under reproduction), this item is updated to say so explicitly rather than
  carried forward on an unverified premise.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Hit twice by one runner in the same run, with the PO's own
  independent observation pointing at the same transition — two-source
  corroboration even without a controlled repro in this repository. `manual`
  `done_when` because the mechanical work this item calls for (tracing the
  actual producer function) has not happened yet in this dispatch and the
  falsifiable predicate depends on that trace's outcome.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate per the triage's L
  group. Independent of the F05/F06/F07 chain; may share a root cause with F09
  (restart over-used as the default readiness remedy) — worth checking both
  together.
- **Date:** 2026-08-29

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** close
- **Rationale:** re-verified 2026-08-29: the producer is located at
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs` ~L3864-3993 (per the
  item's own "UPDATE" section above); commit `e5504d3f` ports the controlled
  reproduction as permanent regression coverage in
  `project-onboarding-v3.test.mjs` ("NVA-R40-PROJDRIFT: set-phase --phase
  implementation does not itself cause projection-drift..."), refuting the
  phase-transition hypothesis and identifying the real trigger (an untracked
  `pipeline.user.yaml` edit bypassing regeneration). Per this item's own
  Acceptance criteria, the "causal link NOT confirmed" branch applies and is
  satisfied by the reproduction test plus this item's own update — no further
  code fix is required to close this item.
- **Date:** 2026-08-29
