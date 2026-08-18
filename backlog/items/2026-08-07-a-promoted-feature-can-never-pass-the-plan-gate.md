---
schema: pipeline.backlog-item.v1
id: pipeline.a-promoted-feature-can-never-pass-the-plan-gate
type: defect
owner: pipeline
status: closed
created: 2026-08-07
due: 2026-08-21
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "72a293d59694e6184f190bb3c141f7b2d509b8da"
closure_evidence: "plugins/pipeline-core/lib/po-gate-authority.test.mjs"
source: "PO, live greenfield onboarding with the Claude runner, 2026-08-07: 'der status wird initial falsch gesetzt und es gibt keinen sauberen lauf zum PRD und Freigabe'. The session located both halves in code before reporting."
---

# Kickoff promotion and the plan gate demand contradictory things, so neither can be satisfied

## Description

Two components disagree about what `activeFeature.planPath` is, and both enforce
their reading:

- **Kickoff promotion requires `planPath === specPath`**
  (`plugins/pipeline-core/lib/onboarding-continuity.mjs:3400`).
- **The PO plan gate requires `activeFeature.planPath` to point at a `prd_*.md`**
  (`plugins/pipeline-core/lib/po-gate-authority.mjs:535`).

A feature that was promoted through the sanctioned kickoff flow therefore
carries a `planPath` the plan gate will always reject. There is no ordering that
satisfies both, so `approve-plan` is unreachable for any promoted feature — which
is every feature created through the documented path.

The rebind route that would otherwise repair the binding does not apply: it
requires phase `implementation`, and a feature blocked at its plan gate has not
reached that phase.

**Second half, and it is the reason nobody noticed:** the dev-plan gate is not
active in a fresh project at all. `gateConfig` returns `null` when the manifest
carries no `gates` section (`plugins/pipeline-core/lib/manifest.mjs:793-799`),
and a freshly onboarded project's manifest has none, so the guard exits 0. Plan
approval in a new project is bookkeeping, not a gate. The contradiction above is
therefore invisible until someone tries to record the approval — and harmless
right up to the moment a project turns its gates on, at which point it becomes
a hard block.

## The symptom the PO actually experienced

*"ich wurde nie um freigabe der PRD/Spec gebeten. Die Pipeline ist dann irgendwie
direkt in die Umsetzung gegangen."*

That is the same defect from the operator's side, and it is the one that matters
most. The session wrote a real PRD, a real Spec and a real source-evidence file,
promoted them into digest-bound State — and then went straight to writing
`index.html`, because the gate that should have stopped it there reported
nothing to stop for. No approval was requested, none was recorded, and none was
missed by any check.

Note what the session did **not** do, and was right not to do: it declined to
hand-repair the State to make the gate passable, because that would have broken
the hash-bound PRD/Spec entries to satisfy a gate that was not enforcing
anything. The reasoning was sound; the situation it was reasoning about should
not exist.

The PO's own framing is the acceptance criterion for any fix: for a `feature`
profile there must be a point at which the human is **asked**, and implementation
must not begin before that point. Whether that is the plan gate repaired, a
separate acceptance gate, or a default `gates` section in a new project's
manifest is the design question — but "the human was never asked" is the bug,
not the missing config.

## Why the two halves belong in one item

Separately they read as a validation mismatch and a config default. Together they
describe something worse: the documented path from kickoff to an approved PRD
does not work, and the mechanism that should have surfaced that is switched off
by default. A project that enables its gates — which is the point of the
Pipeline — discovers on that day that its features cannot pass the first one.

The PO's phrasing was *"der status wird initial falsch gesetzt und es gibt keinen
sauberen lauf zum PRD und Freigabe"*, and that is the accurate summary: the
initial state is written in a shape the next step rejects.

## Triggering situation

Greenfield onboarding of `rune_test1_claude_052_28` with the Claude runner
against the local `0.5.3+claude.20260807221336.14e7b97` build, 2026-08-07. The
session promoted a real design package (`specs/2026-08-07_runen-spiel/`), hit the
gate, read both call sites, and correctly declined to "repair" the state by hand
— which would have broken the digest-bound PRD/Spec entries to satisfy a gate
that was not even enforcing.

**Not independently reproduced in this repository.** The two line references
above come from that session and should be re-read before any fix is designed.

## Affected artifact

`plugins/pipeline-core/lib/onboarding-continuity.mjs` (promotion binding),
`plugins/pipeline-core/lib/po-gate-authority.mjs` (plan-gate validation),
`plugins/pipeline-core/lib/manifest.mjs` (gate config default).

## Proposal

Not designed here. Three questions, and the third is the one that generalises:

1. **Which reading of `planPath` is correct?** If a plan is the PRD, promotion is
   wrong to equate it with the spec. If a plan is the spec, the gate is wrong to
   demand `prd_*.md`. One of the two has to yield, and the answer decides what
   `approve-plan` means.
2. **Should a project without a `gates` section have no gates?** A silent `null`
   meaning "nothing is enforced" is a defensible default for a consumer project
   and an indefensible one for a project that believes it is gated. At minimum
   the bootstrap confirmation should state which gates are actually live, rather
   than leaving an operator to infer it from a guard that exits 0.
3. **Nothing tests that a gate can be satisfied.** This is the second recorded
   instance of a gate that cannot be passed by any legal input; the first is
   `backlog/items/2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md`,
   which proposed exactly the check that would have caught this. That item should
   be triaged together with this one — this is its evidence, not a separate idea.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Question 1 resolved — "A", with a concrete answer: the plan
  gate's actual criterion is "PRD is content-sound AND consistent with/
  matches the Spec," not a mechanical `planPath === specPath` /
  `prd_*.md`-path check. Question 2 (should a gate-less project have zero
  gates by default) is NOT answered by this decision — remains open.
  Question 3 (this item is a second confirmed instance of
  `2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md`'s gap) —
  see that item's own 2026-08-11 update, which picked a narrower scope
  (step 4 QG rule only) than the full systematic gate-walk framework that
  would have caught this class structurally.
- **Rationale:** PO, 2026-08-11, verbatim: "A und PRD inhaltlich okay und
  passend zur Spec ist das gate." Redefines what `approve-plan` actually
  validates: not a path-identity check between promotion's `planPath` and
  the gate's expected `prd_*.md` naming, but a content-coherence property.
  Neither `onboarding-continuity.mjs`'s promotion binding nor
  `po-gate-authority.mjs`'s validation survives unmodified under this
  reading — one of the two current mechanical checks has to be replaced,
  not just relaxed.
- **Assignment (if accepted):** Unassigned — real design + implementation
  work. Open sub-question the PO's answer does not itself mechanically
  resolve: HOW "PRD content-sound and Spec-consistent" is actually checked
  — a property the human judges at the approval prompt itself (most likely
  reading, given ADR-0061's "human decides, agent acts on it once decided"
  framing elsewhere this session), an automatable heuristic, or something
  else. Flag back to the PO if a design/implementation dispatch hits this
  fork rather than picking one silently.
- **Date:** 2026-08-11

### Re-verification, 2026-08-17 — narrowed, not closed

Checked against current source rather than assumed: the ORIGINAL mechanical
contradiction this item opened with (kickoff promotion writing
`planPath === specPath` vs. the plan gate demanding a `prd_*.md`-named
`planPath`) is gone. `promotionInput()`
(`plugins/pipeline-core/lib/onboarding-continuity.mjs:3984-4012`, commit
`b64956723`, 2026-08-08 — landed the day after this item was filed, from
independent contemporaneous work, not a dispatch against this item) now
explicitly REJECTS `planPath === specPath`
(`KICKOFF-PROMOTION-PLAN-IS-SPEC`) and requires `planPath === prdPath` with
`PROMOTION_PRD_BASENAME.test(basename(prdPath))`
(`KICKOFF-PROMOTION-PLAN-NOT-PRD`) — exactly the `prd_*.md` shape
`po-gate-authority.mjs:651`'s `PRD_NAME.test(basename(planPath))` requires. A
freshly promoted feature's `planPath` now satisfies the plan gate mechanically;
the two components no longer disagree structurally. Remaining, still-real,
still-unimplemented scope: the PO's own richer 2026-08-11 answer to Q1 ("PRD
content-sound AND Spec-consistent is the gate") is a semantic/content check
that does not exist anywhere in code today — only the mechanical path/name
check does. Q2 (should a gate-less project have zero gates by default) and Q3
(systematic gate-satisfiability testing, tracked in
`2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md`) are both
still open, unchanged. Kept open, current-scope (Nova/Phoenix-adjacent gate
correctness, not deferred) — narrowed from "gate is unpassable" to "gate is
passable but not yet checking what the PO decided it should check."

### Dispatch decision, 2026-08-18

**Decision:** Queued for dispatch, current scope (Nova/Phoenix-adjacent, not
deferred to any named future sprint) — bounded to the last open fork the
2026-08-11/2026-08-17 Triage entries left unresolved: HOW the PO's "PRD
content-sound AND Spec-consistent" criterion is actually checked. Bounded
scope for the dispatch: add a mandatory, explicit PO-facing acknowledgement
step at `approve-plan` time in `po-gate-authority.mjs` — the human affirms
content-soundness and Spec-consistency at the approval prompt itself (the
"most likely reading" already flagged in the 2026-08-11 entry, consistent
with ADR-0061's "human decides, agent acts on it once decided"), rather than
building an automated heuristic. This is additive to the existing mechanical
`prd_*.md`/path check, not a replacement of it. Needs a real implementation
plus a test run to trust (gate-tier code) — not attempted in this read-only
triage pass. Q2 (gate-less-project defaults) and Q3 (systematic
gate-satisfiability testing) remain tracked as already noted, out of this
dispatch's bounded scope.
- **Date:** 2026-08-18

### Closure, 2026-08-18 (evening)

**Decision:** Closed. Between the dispatch decision above being written and
its dispatch actually running, a separate same-day dispatch
(`NVA-SWEEP-C2`, commit `72a293d5`) independently delivered exactly the
scope this item's Triage decided: `po-gate-authority.mjs` now exports
`PRD_ACKNOWLEDGEMENT_MARKER` and gates its check on `requireAcknowledgement`
(true only for an ACTIVE `expectedPlanSha256`/`expectedSpecSha256`
validation, never a passive diagnostic read). Confirmed by direct read that
`pipeline-state.mjs`'s `approve-plan` (and `submit-plan`) already call
`poGateAuthority()` with both expected digests in their `beforeCommit` step,
so the marker requirement is live at the real approval path today, not
merely defined. Confirmed by running `harness/scripts/pipeline-state.test.mjs`
against the current tip: 314/314 cases pass, including `PS06a approve-plan
exit 0` — no regression.

A parallel wave-1 dispatch against this same item (queued from the
"Dispatch decision, 2026-08-18" entry above, before this closure was known)
independently built a second, CLI-flag-based enforcement mechanism
(`--content-sound-and-spec-consistent <token>` on `approve-plan`) without
finding the marker mechanism already existed. Its diff was **not merged**:
it would have required both mechanisms simultaneously (confusing, redundant)
and its own report confirmed it broke `harness/scripts/pipeline-state.test.mjs`
(314-case canonical suite, ~8 `approve-plan` call sites not updated for the
new flag) in a way requiring a TP-3 signed ceremony to fix — a regression
the already-landed marker mechanism does not have, since it reuses the
digest-revalidation step `approve-plan` already performed. Discarded in
favor of the existing, cleaner, already-tested implementation.

Q2 (gate-less-project defaults) and Q3 (systematic gate-satisfiability
testing) remain open, tracked in
`2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md` — this
item's own scope is fully resolved.
- **Date:** 2026-08-18
