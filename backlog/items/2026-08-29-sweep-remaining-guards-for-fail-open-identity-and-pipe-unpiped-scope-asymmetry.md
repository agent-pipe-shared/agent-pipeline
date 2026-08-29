---
schema: pipeline.backlog-item.v1
id: pipeline.sweep-remaining-guards-for-fail-open-identity-and-pipe-unpiped-scope-asymmetry
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: 00f14c1916e308778519fdeb1a805bed2156ad64
closure_evidence: backlog/items/2026-08-29-guard-sweep-completion-report.md
created: 2026-08-29
sprint: nova
done_when: path-exists backlog/items/2026-08-29-guard-sweep-completion-report.md
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md, sections 6 and 10.7/10.8), observed during the 2026-08-29 three-runner greenfield test."
---

# Sweep every other guard for the same two defect shapes found in F02 and F03

## What happened

Two independent probes, from two different angles, each found one real gap on
their FIRST attempt:

1. The Claude/Windows audit found a "cannot resolve identity → allow" default
   in `evaluateBootstrapReceiptGate()`
   (`pipeline.identity-attestation-fails-open-on-unresolved-transcript-path`,
   this backlog's F02 item).
2. The Codex hardening test found a piped/unpiped root-scope asymmetry in the
   same file's read-only-command classifier
   (`pipeline.read-scope-guard-admits-single-command-but-blocks-the-piped-form`,
   F03).

Two hits on the first attempt from two independent directions says more about
the remaining population than about these two specific gates: it is a
reasonable prior that structurally similar gaps exist elsewhere in the same
guard layer and have not yet been looked for.

## Where it is

Not a single location — this item IS the location-finding work. The population
to sweep, enumerated from its actual source of truth
(`find plugins/pipeline-core/hooks -maxdepth 1 -name "guard-*.mjs" -not -name "*.test.mjs"`,
run 2026-08-29, 13 files):

- `guard-push.mjs`
- `guard-handover-size.mjs`
- `guard-lifecycle-ready.mjs` (already contains two confirmed instances — F02,
  F03 — audit it for OTHER instances of either shape beyond those two)
- `guard-apply-patch.mjs`
- `guard-gate-strength.mjs`
- `guard-onboarding-consent-lock.mjs`
- `guard-dispatch.mjs`
- `guard-el01-tripwire.mjs`
- `guard-git.mjs`
- `guard-testpath.mjs`
- `guard-command-grammar.mjs`
- `guard-dispatch-budget.mjs` (already contains the identity-resolution
  function F02's fail-open branch reads from — audit it for its OWN direct
  callers/uses of `subagentIdentity()`'s `unresolved` result, not only the
  guard-lifecycle-ready.mjs caller already covered by F02)
- `guard-devplan.mjs`

## Proposal

For each file above, search for and record every instance of two shapes:

**Shape 1 (fail-open-on-unresolvable, F02's shape).** Any function whose
contract is "decide whether to admit or refuse," where an error/unresolved
branch (a caught exception, a `null`/`unresolved`/`undefined` result from a
helper, a missing expected field) returns "admit" (`null`, `verdict(0)`,
`return true`, an early `return` that skips a later refusal) rather than
"refuse" or an explicit, reasoned exception to GL-09's fail-closed rule.
Concretely: `grep -n "return null" <file>` near a branch guarded by
`=== "unresolved"` or a `catch`, then read each hit's surrounding function to
judge whether GL-09 applies to it (an authority-bearing gate) or whether
fail-open there is deliberate and load-bearing (as `guard-lifecycle-ready.mjs`'s
own doc comment argues, correctly, for the ORCHESTRATOR-identity branch — the
sweep's job is to tell that case apart from an unjustified one, not to flip
every fail-open branch found).

**Shape 2 (pipe/unpiped scope asymmetry, F03's shape).** Any pair of code
paths in the same file that decide read-scope, write-scope, or
cross-repository-mutation admission for a piped vs. an un-piped shell command,
where one path resolves an argv token against a root/scope boundary
(`resolve`, `pathInside`, `commandPath` used against `root`) and the sibling
path for the structurally identical un-piped command does not. Concretely: for
each file, find every `pathInside(root, ...)` or equivalent containment check,
and for each one found, check whether the SAME executable/argument shape has a
second, un-piped or differently-shaped admission branch elsewhere in the file
that reaches an admit verdict without an equivalent check.

## Acceptance

- All 13 files listed above (or the current output of the same `find`
  invocation, if the population has changed since 2026-08-29 — re-run it,
  don't trust this item's frozen list once stale) are covered by name in a
  sweep report, each with either "no instance of shape 1/2 found" or a
  cross-reference to a newly filed backlog item naming the exact function and
  line region.
- Each newly filed item from the sweep follows this item's own format
  (concrete file/function/line evidence, not a restated suspicion).
- `guard-lifecycle-ready.mjs` itself is swept for INSTANCES BEYOND F02 and F03
  — it is the largest file in the population and the one two independent
  probes already found gaps in, so "already has two known findings" is not a
  reason to skip auditing the rest of it.
- A separate completion report file,
  `backlog/items/2026-08-29-guard-sweep-completion-report.md` (or the sweep is
  recorded as closed with equivalent closure evidence and this `done_when`
  predicate updated to match), is created only once the sweep above has
  actually been run and its outcome (files swept, findings, new items filed)
  recorded there.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Two independent probes, two different angles, two hits on the
  first attempt in the same guard file — that is a signal about population
  density, not about these two gates specifically. A sweep is the
  proportionate response; re-fixing only the two already-found instances would
  leave the same defect shapes elsewhere in the same layer, silently.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate per the triage's S
  group (sweep row). Should run after F01/F02/F03 are fixed, so the sweep is
  auditing against the corrected pattern rather than re-discovering the same
  two already-filed items.
- **Date:** 2026-08-29
