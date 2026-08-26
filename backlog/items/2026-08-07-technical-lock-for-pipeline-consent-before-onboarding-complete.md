---
schema: pipeline.backlog-item.v1
id: pipeline.technical-lock-for-pipeline-consent-before-onboarding-complete
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-07
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "1b6e6a606ffcd6f32c3993b73be1110d3eb299af"
closure_evidence: "plugins/pipeline-core/hooks/hooks.json"
source: "PO handover from a separate session (agent-pipeline-share_phoenix), submitted through the PO's own channel, 2026-08-07."
due: 2026-09-06
expires: 2026-09-06
---

# No technical lock between "PO consented to Agent Pipeline" and "onboarding actually completed" -- an agent can silently skip straight to unguarded implementation

## Description

In a separate session (project `agent-pipeline-share_phoenix`), the PO gave
explicit consent to use Agent Pipeline. A real, independent plugin-registration
bug (`pipeline-core` double-registered -- once user-scope, once local-scope,
the local-scope binding stale and pointed at this project instead) put the
bootstrap preflight into a `status: "plugin-refresh-required"` state with
`nextAction: null` and no documented recovery path in the skill's own
`references/*.md`. The agent partially mis-diagnosed the fix (ran a `disable`
in the wrong cwd), recovered, but then never re-ran preflight to confirm the
fix actually worked. When the PO said "focus on yourself" (meaning: leave the
unrelated Phoenix project alone), the agent interpreted that as license to
abandon the Pipeline path entirely for the CURRENT repo and went straight into
unguarded `Write`/`Edit` implementation (game files) -- with no PRD/Spec, no
design discussion, no re-confirmation that skipping Pipeline was actually
wanted. The PO's original "yes, install it" consent was never withdrawn.

## Triggering situation

Any session where (a) the PO has given Pipeline-adoption consent, (b) the
bootstrap/onboarding chain does not reach a `ready` state on the first attempt
(any cause -- a plugin-registration conflict, a transient tool failure, an
unhandled preflight status), and (c) a later, narrower instruction from the PO
(here: "leave the other project alone") gets over-generalized by the agent into
"abandon Pipeline governance altogether," without the agent re-checking
preflight or re-confirming that broader interpretation.

## Core gap

Between "PO consent given" and "onboarding actually complete," enforcement
today rests entirely on prose in the SessionStart hook and the agent's own
discipline -- there is no `PreToolUse` technical barrier stopping `Write`/`Edit`
on project files during that window. A session that quietly drifts out of the
bootstrap flow (for any reason, not just this one) can start unguarded
implementation with nothing stopping it.

## Proposal

A `PreToolUse` hook that blocks `Write`/`Edit` on project files whenever a
local marker records "Pipeline consent given, onboarding not yet complete."
The marker is written at the exact moment consent is given and cleared ONLY by
the real completion of `project-onboarding-v3.mjs` (or an explicit,
PO-confirmed "work without Pipeline" override) -- so a session that drifts out
of the bootstrap chain for any reason is technically blocked from silently
falling back to unguarded implementation, rather than relying on the agent
correctly re-deriving that Pipeline was still wanted from an unrelated
instruction.

## Triage — 2026-08-18

- **Decision:** Elephant's recommendation accepted — do the cheap read-only
  investigation first (does `guard-lifecycle-ready.mjs`'s existing
  PreToolUse machinery already close this, partially or fully?) before
  designing the marker-based hook the item proposes. Only build the new
  hook if a real gap remains after that check.
- **Rationale:** PO, 2026-08-12: "empfehlung." Matches the item's own
  triage note, which already asked for exactly this check before any new
  hook is planned.
- **Assignment (if accepted):** investigation queued for this session; not
  urgent (one historical incident, no repeat observed).
- **Date:** 2026-08-12

### Investigation finding (NVA-BL-83, 2026-08-12) — PARTIALLY covered, a real gap remains

`evaluateLifecycleReadyGuard()` (`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`)
gates every `Write`/`Edit`/`NotebookEdit` (and `Bash`) call behind a
project-scoped precondition check, evaluated BEFORE any onboarding-readiness
logic runs:

```
if (!governed) return verdict(0);   // line 1804 — unconditional allow
```

`governed` (lines 1797–1804) is `true` only if at least one of
`GOVERNANCE_MARKERS` (line 91–99: `.agent-pipeline/core.lock.json`,
`pipeline.user.yaml`, `project/pipeline.json`, `project/pipeline.yaml`,
`.claude/pipeline.json`, `.claude/pipeline.yaml`, plus the runtime-projection-v3
owned-key targets) already **exists on disk** in the project root. Only once
`governed` is true does the guard reach `evaluateAfterGrammarAdmission()`
(line 1703) and its call to `requireProjectOnboardingReady()` (line 1710),
which is the part of the guard that DOES distinguish typed non-ready states —
`restart-required`, `partial`, `kickoff-required`, `adoption-required`, etc.
(`PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES`,
`lib/project-onboarding-ready-gate.mjs:9-24`) — from `ready`.

So the guard's readiness machinery has a real concept of "onboarding
started but not complete," but it is only reachable once the filesystem
already carries evidence that onboarding progressed far enough to write one
of the six marker paths. Before that first marker write, `governed` is
`false` and the function returns `verdict(0)` — allow — with **no
distinction whatsoever** between "no consent was ever given" and "PO just
consented, onboarding has not yet written anything." Both states are
literally the same branch.

`plugin-refresh-required` (the status implicated in the triggering incident)
is not part of this guard's vocabulary at all — it belongs to a separate
mechanism, the `SessionStart` preflight (`scripts/pipeline-start-preflight.mjs:249,294`),
which is prose/exit-code advisory only and has no `PreToolUse` enforcement
of its own (matches the item's own "Core gap" paragraph). `project-onboarding-v3.mjs`
(the script `requireProjectOnboardingReady()` wraps) itself contains no
filesystem-write calls (`grep -n "writeFile" ...` = no matches) — it is a
pure inspector, not the writer of the governance markers, confirming the
markers only appear as a side effect of onboarding actually having reached
some later step, not at the moment consent is given.

**Conclusion: PARTIALLY covered, not FULLY.** Once onboarding has written
at least one governance marker file, further `Write`/`Edit` calls are
correctly blocked (typed non-ready status) until a genuine `ready` receipt
exists — that half of the scenario is closed. The half the item's own
"Core gap" describes — the window between PO consent and the FIRST marker
write, which is exactly where the triggering incident sat (a plugin
registration conflict during `pipeline-core` activation, before any
project-repo file was written) — has zero technical barrier today:
`governed === false` short-circuits the whole guard to an unconditional
allow, identical to a project that was never offered Pipeline at all. This
is precisely the gap the item's proposed marker-at-consent-time mechanism
targets, and it is real, not already closed.

**Status:** left `open`. Per the briefing, designing/building the proposed
new `PreToolUse` consent-marker hook is out of scope for this dispatch — a
future dispatch should scope that work using this exact finding (the
`governed` precondition on `!existsSync(<any GOVERNANCE_MARKERS path>)` at
`guard-lifecycle-ready.mjs:1797-1804` is the precise code location the new
mechanism must intercept ahead of, or fold into).

### Sprint deferral (2026-08-17)

Deferred to Sprint Alfred ("Agent-first architecture, mechanical governance,
measurable rigor, and control integrity" — ADR-0043's 2026-08-17
amendment), matching this item's own 2026-08-12 Assignment note ("not
urgent — one historical incident, no repeat observed").

### Closure, 2026-08-19

PO decision: close, final. Matches this item's own investigation finding
(NVA-BL-83, 2026-08-12): a real, confirmed, PARTIAL gap (the window between
PO consent and the first onboarding governance-marker write has zero
technical barrier today) — deferred to Sprint Alfred on 2026-08-17 as "not
urgent, one historical incident, no repeat observed." PO, 2026-08-19: close
as not acute; if it recurs, file a fresh item with the new incident's
evidence rather than reopening this one.

### Triage — Phoenix side, 2026-08-18

- **Decision:** Accepted as open; dispatch-ready when capacity allows. No PO design judgment blocks starting it.
- **Rationale:** Re-checked 2026-08-18: no marker-file + `PreToolUse` write-lock mechanism exists in Phoenix's `hooks/hooks.json`. Nova only documents the single-consent bootstrap flow in prose (`plugins/pipeline-core/skills/pipeline-start/SKILL.md:80-83`), with no technical lock either — nothing to port. The item's own Proposal already names a concrete, bounded mechanism (a local marker written at consent, cleared only by real `project-onboarding-v3.mjs` completion or an explicit PO override, gating `Write`/`Edit`), so this can go to an ordinary dispatch without further PO design input.
- **Assignment (if accepted):** unassigned; PO previously flagged this as "not relevant right now, but interesting hardening for the backlog" — still true, priority decision only, not a design decision.
- **Date:** 2026-08-18

## Triage — updated 2026-08-19

- **Decision:** stays open — partial progress landed, real blocker remains.
- **Rationale:** The onboarding-consent marker + PreToolUse lock guard file landed (commit `286673e2`), matching this item's own Proposal. Its `hooks.json` registration step is explicitly blocked by TP-4 per the commit's own message — needs a TP-4-scoped HGO ceremony (the PO's Ed25519 key, outside this session) to complete wiring. Not closeable until that ceremony runs.
- **Date:** 2026-08-19

## Triage — closed 2026-08-19

- **Decision:** closed — resolved.
- **Rationale:** `hooks.json` registration turned out not to need the HGO signature ceremony at all: the guard's own override planner refuses even the `plan` step for any edit under `plugins/pipeline-core/**` (`HGO-EXTERNAL-ADAPTER-BOUNDARY`, "must be carried out by an attended operator outside this session") — confirmed live. The PO applied the exact, pre-drafted, anchor-verified registration diff directly outside the guarded session (commit `8fcd369c`), wiring `guard-onboarding-consent-lock.mjs` into `hooks.json`'s `PreToolUse`/`Edit|Write|NotebookEdit` family. `node --test plugins/pipeline-core/hooks/guard-onboarding-consent-lock.test.mjs` passes 10/10 with the live hooks.json in place.
- **Date:** 2026-08-19
