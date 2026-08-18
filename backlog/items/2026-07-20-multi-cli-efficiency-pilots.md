---
schema: "pipeline.backlog-item.v1"
id: "pipeline.multi-cli-efficiency-pilots"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-20"
source: "Public transfer completeness review of post-v0.3 Multi-CLI design and measurement work"
due: "2026-09-08"
expires: "2026-09-15"
---

# Measure post-v0.3 Multi-CLI efficiency pilots

## Description

The portable Multi-CLI implementation from v0.3 is present in the Public Core;
no portable Multi-CLI implementation file is missing from the Public transfer.
The remaining work is future design and measurement: reduce repeated
final-delivery evidence without losing package-specific bindings, and evaluate
review-routing hypotheses without weakening independent review or gates.

## Triggering situation

The Public transfer completeness review on 2026-07-20 distinguished delivered
Multi-CLI behavior from unimplemented post-v0.3 efficiency ideas. Those ideas
need bounded pilots and observed evidence before they can support any efficiency
claim.

## Affected artifact

The public Multi-CLI final-delivery evidence contract, package binding rules,
review-wave planning, route-selection policy, PO gates, and cost evidence.

## Proposal

Design a normalization layer for evidence repeated across final-delivery
packages while retaining an explicit binding from every package to its exact
candidate, scope, route, assurance, and result. A normalized shared fact must
not replace a package-specific binding or make one package's evidence authorize
another package.

Evaluate two independent hypotheses behind explicit PO gates:

- a wave-review pilot may reduce repeated review work when package boundaries
  and independent review obligations remain intact; and
- a remote-mini-train pilot may reduce routing overhead when every included
  package remains separately attributable, reviewable, and fail-closed.

Each pilot must define a baseline, route, cost unit, success threshold, stop
condition, and rollback before execution. Efficiency claims require observed
route and cost evidence from the bounded pilot; estimates or receipt reuse
alone are insufficient. The pilots must not weaken independent Critic review,
candidate binding, PO gates, security gates, or publication admission.

## Ownership and expiry

The next Pipeline Elephant owns triage and any accepted pilot design. The
triage due date is **2026-08-10**. If no decision is recorded by
**2026-08-17**, this item expires and must be renewed with current evidence
before further implementation, experimentation, or efficiency claims.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Renewal (2026-08-18):** this item expired 2026-08-17 with an empty
  Triage section, never actually triaged in the ~4 weeks since filing.
  Multiple `docs/state.md` entries this same session (the Nova A survey, the
  NVA-A8-5 characterization) cited this item's abstract PO-gate language
  without reading the item itself, and repeatedly asserted the entire thing
  was PO-only — it is not: this item's own Ownership-and-expiry clause
  assigns triage AND any accepted pilot design to the Elephant, reserving
  only pilot EXECUTION/EVALUATION to explicit PO gates. Renewed (`due`/
  `expires` bumped above) with current evidence — Nova A's technical work is
  otherwise essentially complete per the A7 gate-review chain and per-issue
  sweep this same session — rather than left to expire silently a second
  time.
- **Decision:** accepted, current scope. Both hypotheses' pilot DESIGN (this
  Triage section, below) is completed now, per this item's own
  Ownership-and-expiry clause. Pilot EXECUTION/EVALUATION is explicitly out
  of this Triage's scope — it stays behind the PO gate the item's own
  Proposal names, and is a separate, later action once the PO chooses to
  authorize it. The evidence-normalization-layer piece of the Proposal
  (reducing repeated final-delivery evidence without losing package-specific
  bindings) is NOT designed here — it is a materially different, larger
  piece of work (a schema/contract change to the final-delivery evidence
  format, not a bounded pilot) and is split out below as its own follow-up.
- **Rationale:** re-read the defining item directly (not just the abstract
  spec/acceptance.md pointer) rather than repeating this session's own
  earlier, unverified "NVA-A8-5 is entirely PO-only" characterization —
  confirmed that characterization was wrong: only pilot execution needs the
  PO, not the triage/design step this item explicitly reserves to the
  Elephant. Doing this now closes the actual gap (a 4-week-untriaged,
  now-expired item) rather than leaving Nova A's stated remaining blocker
  mischaracterized in the matrix/state.md for a further session.
- **Assignment (if accepted):** pilot design below is complete and ready for
  PO review/authorization. Evidence-normalization-layer design: unassigned,
  flagged as its own follow-up (see below), needs a dedicated design pass,
  not this Triage.
- **Date:** 2026-08-18

### Pilot design: wave-review pilot

Reduce repeated Critic-review work across a wave of related final-delivery
packages (e.g. several small, sequential fixes touching the same file/spec
in one session) without weakening any package's independent verdict.

- **Baseline (current process):** every package/dispatch in a delivery wave
  receives its own fully independent Critic dispatch — separate bootstrap,
  separate spec/guardrail/evidence read, separate report — even when several
  packages share heavily-overlapping context (same spec, same guardrails,
  sequential commits in the same file). Cost: `policies/tooling-policy.md`'s
  own dispatch-bootstrap-token-cost finding (also
  `backlog/items/2026-08-11-goldfish-critic-dispatch-bootstrap-token-cost-is-disproportionate.md`)
  puts this at roughly 50k-150k tokens per dispatch on bootstrap alone,
  before any actual review content — a real, measured cost this pilot
  targets.
- **Route (pilot form):** for a wave of ≥3 packages sharing the same spec and
  guardrail set (the common case this session hit repeatedly with the
  `NVA-MICRO-N` bundled-dispatch pattern, though that pattern bundled
  *implementation*, not review), dispatch ONE Critic review covering all N
  packages' diffs together — one bootstrap, one spec/guardrail read — but
  require the Critic's own report to still produce N separately-labelled
  verdicts, one per package, each independently PASS/FAIL, never a single
  blended verdict for the whole wave. The dispatch's diff-range/file-list
  input names each package's own commit range explicitly (never a single
  merged diff that obscures which change belongs to which package).
- **Cost unit:** total tokens (or tool-uses, whichever the pilot's own
  measurement finds more stable) spent on Critic review per wave, summed
  across whatever dispatches the wave actually used.
- **Success threshold:** at least 20% reduction in total Critic-review
  tokens for a wave of ≥3 related packages, compared to the same wave
  reviewed via N fully independent dispatches, with **zero** reduction in
  per-package finding coverage — measured by re-running a matched sample of
  already-reviewed real waves both ways (batched vs. independent) and
  diffing the finding sets, not by assumption.
- **Stop condition:** if a batched review's per-package verdict cannot be
  cleanly separated (a finding cannot be attributed to exactly one package),
  or if a matched-sample comparison shows measurably fewer findings per
  package under batching (review depth genuinely drops, not just review
  cost), stop the pilot and revert to per-package dispatch for that wave
  shape.
- **Rollback:** purely a dispatch-pattern choice, no schema or gate change —
  reverting means simply returning to one Critic dispatch per package. No
  persisted state to unwind.

### Pilot design: remote-mini-train pilot

Reduce routing/dispatch overhead for a train of small, related packages
without weakening any package's separate attributability, reviewability, or
fail-closed behavior.

- **Baseline (current process):** each dispatch (Goldfish or Critic) pays
  its own full bootstrap/routing cost independently, even for a short chain
  of small, closely related packages delivered in sequence within one
  session (exactly the `NVA-MICRO-N` shape this session used repeatedly for
  *implementation* bundling — this pilot asks whether the same bundling
  benefit generalizes to a mixed implementation+review "train" rather than
  implementation alone).
- **Route (pilot form):** for a short sequence of small, closely related
  packages (same spec, same guardrail set, no package depending on another
  package's Critic verdict to proceed), chain them through a single
  dispatch "train" — one continuous dispatch session that commits each
  package separately as it completes, rather than N fully separate
  dispatch-and-return cycles — while preserving one Conventional Commit per
  package (never squashed) and one clearly separable evidence trail per
  package in the dispatch record's `log`.
- **Cost unit:** total tokens AND total wall-clock time per delivered
  package, compared against the same set of packages run as fully
  independent dispatches.
- **Success threshold:** at least 15% reduction in total tokens per package
  with **no increase** in the post-delivery Critic-review FAIL rate for
  those packages, compared to a baseline sample of independently-dispatched
  packages of similar size/class.
- **Stop condition:** if any package's fail-closed or independent-
  attribution property is compromised — e.g. a single dispatch record or
  commit trailer cannot cleanly attribute which content belongs to which
  package, or a later package's failure silently affects an earlier
  package's already-committed, already-accepted state — stop immediately
  and revert to independent dispatches for that train shape.
- **Rollback:** revert to fully independent dispatch chains; no persisted
  state to unwind (this is a dispatch-orchestration choice, not a schema or
  gate change).

### Follow-up, split out (not designed here)

**Evidence-normalization layer** (the Proposal's other half: "reduce
repeated final-delivery evidence without losing package-specific
bindings"). This is a schema/contract-level design question (how does a
shared fact get referenced by multiple packages' final-delivery evidence
without becoming a shared authority one package's acceptance could lean on
for another's), materially different in kind from a bounded, reversible
pilot — it needs its own dedicated design pass (and likely its own ADR,
given it touches the final-delivery evidence contract), not a Triage
paragraph. Filed here as an explicit open follow-up so it is not lost when
this item's pilot-design half closes: **owner pipeline, due 2026-09-22,
unassigned.**

### For the PO

Both pilots above are designed and ready for an explicit go/no-go per the
item's own Proposal ("behind explicit PO gates") — nothing above authorizes
running either pilot for real; that step is still yours. If accepted,
either pilot's first real run should log its cost-unit measurements from
the very first use (no retroactive estimation), per the item's own "observed
route and cost evidence... estimates or receipt reuse alone are
insufficient" rule.
