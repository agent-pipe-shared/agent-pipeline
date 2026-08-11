# Bootstrap step accounting (D6, backlog item 2026-08-08)

**Status:** deliberate accounting, produced in response to D6 in
`backlog/items/2026-08-08-two-cheap-costs-a-skill-invoked-without-arguments-and-a-thirteen-step-bootstrap.md`.
**Why a standalone doc rather than an addition to `harness/session-bootstrap.md`:**
the 13 steps named in D6 are not the six numbered steps of the session-bootstrap
protocol (§3 of that file, which govern ruleset/calibration/handover loading at
EVERY session start). They are the onboarding/lifecycle transaction sequence a
fresh project walks through once, spanning three scripts: step 1
(`pipeline-start-preflight.mjs`), steps 2–10 (`project-onboarding-v3.mjs`,
9 steps), steps 11–13 (`pipeline-state.mjs`, 3 steps). Folding this into
`session-bootstrap.md` would misfile it under the wrong protocol; a
standalone doc keeps the two concerns — "does this session start correctly"
versus "does this project reach a governed, approved state" — separately
addressable.

**Not every adopter necessarily executes all 13 in one run.** Per
`plugins/pipeline-core/skills/pipeline-start/SKILL.md`, the actual sequence
is dynamic: preflight returns a `nextAction`, inspect reports a status, and
the agent "executes each returned digest-bound action and readback" —
i.e. only the steps whose preconditions are currently unmet fire; a project
already past a given transition (e.g. runtime already initialized) is not
made to repeat it. The 13 named in D6 are the steps observed firing on a
fresh/first-run adopter path, which is the worst case the accounting below
is written against. Steps 5–6 (`plan-runtime`/`init-runtime`) are further
runtime-target-specific: the library code paths they invoke
(`runtime-initialization-required`, `runtime-attestation-required`,
`restart-required`) are conditioned on the runner's runtime-readback
capability, so a runner without a native runtime readback follows a
different, narrower branch of this same code rather than skipping steps
5–6 outright.

**The property that must be preserved:** per-step digest rebinding (plan →
apply pairs gated on the exact sha256 of the plan just computed; submit →
approve → set-phase gated on the exact prior lifecycle state) is what caught
every drift immediately in this session's own measured transcripts, rather
than three steps later. Any step below flagged as a merge candidate must state
whether merging it would weaken that property. Verdict up front: **none of the
13 are flagged as merge candidates** — see the closing note for why the two
most plausible candidates (plan/apply-seed and plan-runtime/init-runtime) were
considered and rejected.

## 1. preflight (`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`)

**Purpose:** resolves the loaded plugin distribution's identity only —
"which `pipeline-core` version/commit is actually running in this session" —
and nothing else. Its own `STATUS_SCOPE` constant is explicitly named
`plugin-distribution-identity`, with a code comment recording that this
narrowing is deliberate: an earlier version let a `ready` preflight status
be misread as "project setup is complete," because the check never read
`pipeline.user.yaml` but nothing said so. **Why separately digest-bound:**
distribution identity (which code is loaded) and repository state (what the
project's own files say) are different facts that can drift independently —
conflating them is the exact ambiguity the `STATUS_SCOPE` fix closed.
**Binding:** observation-only — no plan digest is produced or consumed;
this step reads live distribution identity and reports it. **Verdict:
load-bearing.** Merging it into inspect (step 2) would recreate the
documented ambiguity this step's own history exists to prevent.

## 2. inspect (`inspectProjectOnboardingV3` → `v4Inspection`)

**Purpose:** reads actual repository content — `pipeline.user.yaml`, git
capability, manifest validity, continuity state — and returns one typed
status (`fresh`, `kickoff-required`, `ready`, `partial`, etc.) that every
downstream plan step branches on. **Why separately digest-bound:** it
depends on repository content preflight deliberately never reads (see
step 1); it is the single point where "what does this repo actually look
like right now" gets established before any plan is computed against it.
**Binding:** observation-only, same as step 1 — inspect produces a status,
not a digest; the digest chain begins at step 3. **Verdict: load-bearing.**
Every later step's branch logic (e.g. `kickoff` requires status
`kickoff-required`; `promote` requires status `ready` with valid
continuity) reads this result directly; skipping it means guessing.

## 3. plan (`planProjectOnboardingLifecycleV4`, `operation: "portable"`)

**Purpose:** computes, read-only, the deterministic plan for seeding the
baseline `pipeline.user.yaml`/manifest files, without writing anything.
**Why separately digest-bound:** this is the first half of the plan/apply
two-phase-commit pattern used throughout this CLI family. Read directly
from `applyLifecycle` (`lib/project-onboarding-v3.mjs`, `operation ===
"portable"` branch): the apply call recomputes the plan itself under the
identity inspect resolved, and compares `lifecyclePlanDigest(plan)` against
the caller-supplied `planSha256` byte-for-byte; on any mismatch (or a
missing/malformed digest, or `--activate` absent) it performs **no
mutation** and returns the current inspection unchanged — a fail-closed
no-op, not a thrown error. That is the actual anti-drift mechanism, not
incidental ceremony: it catches the case where repository state changes
between planning and applying. **Binding:** produces a digest
(`lifecyclePlanDigest(plan)`), consumed by step 4. **Verdict:
load-bearing.**

## 4. apply-seed (`apply-portable-seed` → `applyProjectOnboardingLifecycleV4`)

**Purpose:** the write step that creates the seeded files, gated on the
plan's sha256 (`--plan-sha256`) plus `--activate`; see step 3 for the exact
gate mechanics (recompute-and-compare, fail-closed no-op on mismatch).
**Why separately digest-bound:** same plan/apply pairing reasoning as step
3 — the CAS check is what makes this step catch drift rather than silently
applying a plan that no longer matches the repository. **Binding:** bound
by the digest step 3 produced. **Verdict: load-bearing.**

## 5. plan-runtime (`planProjectOnboardingLifecycleV4`, `operation: "runtime"`)

**Purpose:** the same underlying `planLifecycle` function as step 3, but
targeting runtime initialization (restart-handoff/runtime state) instead of
the portable seed files — a materially different target with different
content. **Why separately digest-bound:** reusing step 3's plan digest here
would let a runtime-relevant apply be approved on stale seed-plan content;
the two targets need independent digests precisely because they can go
stale independently. **Binding:** produces its own digest via
`lifecyclePlanDigest(plan)`, distinct from step 3's. **Verdict:
load-bearing.**

## 6. init-runtime (`initialize-runtime` → `applyProjectOnboardingLifecycleV4`, `operation: "runtime"`)

**Purpose:** the write step applying the runtime plan, gated on that plan's
own digest — the same recompute-and-compare, fail-closed no-op mechanic as
step 4, confirmed in the same `applyLifecycle` function's `operation ===
"runtime"` branch. **Why separately digest-bound:** identical plan/apply
CAS reasoning as steps 3–4, applied to the runtime target. **Binding:**
bound by the digest step 5 produced. **Verdict: load-bearing.**

## 7. kickoff plan (`planProjectOnboardingKickoffV4`)

**Purpose:** computes the plan to seed a kickoff (goal + language),
requiring inspect's status to be exactly `kickoff-required` and explicitly
threading the caller's runner identity (`claude`/`codex`) rather than
defaulting it — a documented past bug class was a runner silently defaulted
to the wrong value and dropped the whole kickoff for non-Codex runners
(see the code comment citing `ADR-0051`/`ADR-0057 R1` and the backlog entry
`kickoff-apply-action-drops-the-runner-the-plan-was-made-for`).
**Why separately digest-bound:** the plan's content (goal/language) is
caller-supplied and changes every kickoff; each kickoff needs its own
digest, and the runner-identity requirement is itself a distinct guard this
step alone carries. **Binding:** produces its own digest (this CLI's plan
functions each call `reconstructOnboardingKickoffPlan`/its digest helper;
not read line-by-line here, but consumed identically to steps 3/5 by the
matching apply call). **Verdict: load-bearing.**

## 8. kickoff apply (`applyProjectOnboardingKickoffV4`)

**Purpose:** the write step; for local repositories it additionally
performs `correctSeededKickoffLanguage` and `initializeKickoffPoProfile` as
side effects, all gated on the exact kickoff plan digest
(`expectedPlanSha256: planSha256` threaded into `applyOnboardingKickoff`).
**Why separately digest-bound:** same CAS reasoning as the other apply
steps, plus it is the step that actually establishes the local PO profile —
a side effect that must not fire on a stale or mismatched plan. **Binding:**
bound by the digest step 7 produced. **Verdict: load-bearing.**

## 9. promote plan (`planProjectOnboardingKickoffPromotionV4`)

**Purpose:** a distinct lifecycle transition from kickoff — promotes the
kickoff artifacts into a profile/feature structure (`--profile
epic|feature|mini --id <id> --plan-path --prd-path --spec-path
--design-input-path`), requiring inspect's status to be exactly `ready`
with valid continuity (a stricter precondition than kickoff's
`kickoff-required`). **Why separately digest-bound:** promotion's input
shape (profile, four distinct paths) is materially different from
kickoff's (goal, language); collapsing the two digests would let a
promotion plan built for one feature id be applied against another's
context. **Binding:** produces its own digest, distinct from step 7's.
**Verdict: load-bearing.**

## 10. promote apply (`applyProjectOnboardingKickoffPromotionV4`)

**Purpose:** the write step for promotion, gated on the promotion plan's
own digest (`expectedPlanSha256: planSha256` into
`applyOnboardingKickoffPromotion`) — same CAS reasoning as every other
apply step in this list. **Binding:** bound by the digest step 9 produced.
**Verdict: load-bearing.**

## 11. submit-plan (`pipeline-state.mjs submit-plan`)

**Purpose:** the first of three steps that leave the onboarding/lifecycle
CLI family entirely and enter `pipeline-state.mjs` — "the ONLY sanctioned
writer for `.claude/pipeline-state.json`" (per its own header docstring).
`submit-plan` validates PO-gate authority and profile
(`epic|feature|mini`), binds the plan's and spec's sha256, and records the
submission. **Why separately digest-bound from steps 1–10:** this is a
different state machine — governance/approval state, not project-seeding
state — with its own audit contract (ADR-0027). **Why separately
digest-bound from step 12 (approve-plan):** submit and approve are two
different actors at two different moments — submit is the agent proposing
(`--profile`, no `--by` attribution requirement beyond the submitter), and
the code explicitly refuses `approve-plan` unless "an exact current
submitted plan" exists, i.e. `submit-plan` must have already run.
**Binding:** state-CAS-bound (`expectedStateSha256: sha256CanonicalJson(observed)`
plus a `beforeCommit` re-validation of authority/profile against the
current repository state) — a different mechanism from the plan-digest
binding of steps 3–10, but the same fail-closed principle: no match, no
write. **Verdict: load-bearing.** Collapsing submit+approve into one step would
erase the audit distinction between "proposed" and "approved," which is the
actual governance requirement this pair encodes, not a formality.

## 12. approve-plan (`pipeline-state.mjs approve-plan`)

**Purpose:** sets `planApproved=true`, records `approvedBy`/`approvedAt`
and the v2 approval binding (Plan+Spec digests), and re-validates the same
PO-gate authority under the writer lock before committing. `--by` is
mandatory and non-blank — the code explicitly refuses an "unattributed
approval" as exactly the kind of unauditable state change this CLI exists
to prevent. **Why separately digest-bound:** it is the PO-attributed
counterpart to step 11's agent-attributed submission; the two must remain
distinguishable in the audit trail. **Binding:** state-CAS-bound, same
mechanism as step 11 (requires an exact current SUBMITTED plan state).
**Verdict: load-bearing** (same reasoning as step 11).

## 13. set-phase (`pipeline-state.mjs set-phase`)

**Purpose:** sets `activeFeature.phase` (e.g. `design` → `implementation`),
a field downstream consumers read directly (`stop-suggest.mjs`, gate
scripts). The code explicitly gates a transition into `implementation` on
"an exact approved submission" — i.e. this step re-validates that steps 11
and 12 already happened correctly rather than trusting that they did.
**Why separately digest-bound:** phase advancement is a third, independent
transition following approval — a plan can be approved once and its phase
advanced multiple times across a feature's lifetime (design →
implementation, and potentially further phases later), so phase cannot be
folded into the one-time approval step without losing the ability to
represent those later transitions. **Verdict: load-bearing.**

## Closing note: candidates considered and rejected

The two pairs that looked most mergeable on first read — plan/apply-seed
(steps 3–4) and plan-runtime/init-runtime (steps 5–6) — were considered
because both target closely related outputs from the same underlying
`planLifecycle`/`applyLifecycle` functions, differing only by an
`operation` parameter. Both were rejected as merge candidates: the plan/apply
split across this entire family is a deliberate two-phase-commit mechanism
(compute a digest, then require that exact digest back before writing), and
it is precisely this CAS check that catches repository-state drift between
planning and applying — the property this accounting is required to
preserve. Merging any plan+apply pair into one transaction would remove the
window in which that drift is currently caught, trading a real anti-drift
guard for a shorter step count.

**Overall verdict: all 13 steps are load-bearing.** The count of 13 is the
sum of two distinct state machines (10 onboarding/lifecycle transactions in
`project-onboarding-v3.mjs`, 3 governance transactions in
`pipeline-state.mjs`), each internally structured as plan/apply or
propose/approve pairs specifically to preserve per-step digest rebinding.
This is the answer the source backlog item flagged as an acceptable
outcome — "all thirteen are load-bearing" — recorded here with the
per-step reasoning rather than left an accident of accumulation.
