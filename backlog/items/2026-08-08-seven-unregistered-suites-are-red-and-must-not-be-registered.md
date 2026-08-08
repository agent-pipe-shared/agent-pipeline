---
schema: pipeline.backlog-item.v1
id: pipeline.seven-unregistered-suites-are-red
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Filed under phase-plan item R1.2 (gate integrity and residual closure) after the unregistered-suite measurement ran all 109 files. 102 are green and are being registered in batches; these 7 are red and are deliberately excluded from that registration. Machine artifact: specs/sprint-phoenix-epic/evidence/unregistered-suite-classification.md"
---

# Seven unregistered suites fail standalone — file them, do not register them

## Description

Of the 109 test files registered nowhere in `harness/scripts/verify.mjs`, **102
pass and 7 fail** when run standalone. The 102 are being registered in reviewable
batches (phase plan R1.1). These 7 are not, and this item is why.

**Registering a red suite turns the gate red on arrival**, and a gate that is red
for inherited reasons cannot distinguish a genuine regression from a pre-existing
one. That is the same failure this repository just spent a session recovering
from in a different form. The seven get owners and repairs first; registration
follows a repair, never precedes it.

## The seven, grouped by what is actually wrong

### Group 1 — stale against a module surface that does not exist (3)

These import names their target module does not export. They are **stale, not
broken**: they were written against an API this tree does not have. Nothing is
failing *at runtime*; the file cannot even load.

| Suite | Missing export |
| --- | --- |
| `harness/lib/plan-spec-state-v2.test.mjs` | `bindPlanSpecApprovalWithHumanDecision` from `./plan-spec-state-v2.mjs` |
| `harness/scripts/recovery-bridge-approval.test.mjs` | `RECOVERY_BRIDGE_DECISION_SCHEMA` from `./pipeline-state.mjs` |
| `plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs` | `observeCodexRulesetSource` from `./codex-host-plugin-list.mjs` |

**The question to answer before touching them is which side is stale.** Either
the export was removed and the suite should follow it, or the export was never
implemented and the suite is the surviving record of an intended contract. A
`SyntaxError` looks identical in both cases and the second is worth more than the
first — deleting it would erase the only evidence that something was planned.

### Group 2 — genuine assertion failures (3)

| Suite | First failure |
| --- | --- |
| `plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs` | `Expected values to be strictly equal: 1 !== 2` |
| `plugins/pipeline-core/scripts/afk-activation.test.mjs` | `Expected values to be strictly equal: false !== true` |
| `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` | `AssertionError: harness/review-protocol.md` (actual vs. expected) |

These need reading, not fixing. Each asserts something about current behaviour
and disagrees with it; whether the assertion or the behaviour is wrong is the
whole question.

### Group 3 — the one that pins the gate it is outside of (1)

`plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs` passes
23 of its 24 checks. The single failure is **`WAVR19 Verify fails before ordinary
suites with a named Windows-assurance registration step`**.

**Read what that means before triaging it.** The suite exists to pin a property of
the verify entry point itself — that a named registration step runs before
ordinary suites. It is *unregistered*, so the gate never runs it, *and* it is
failing, so the property it pins does not currently hold. A check on the gate,
outside the gate, reporting that the gate does not do what it says: that is the
same class as the duplicated registration line that stopped all 260 suites and
was invisible for as long as nobody ran the command by hand.

## An interaction with work in flight, recorded so it is not mistaken for a regression

Two of the seven touch files the R3 citation sweep is editing in the same phase:

- `codex-isolated-critic-protected-preimage.test.mjs` asserts against
  `harness/review-protocol.md`, in which the sweep repairs **12 citations,
  including one inside a heading** (which changes that heading's slug).
- `guard-git-phoenix.test.mjs` sits beside `hooks/guard-git.mjs`, in which the
  sweep repairs **5 citations**, some inside string literals.

Both suites were **already red before the sweep** and both are unregistered, so
no gate result changes either way. But the failure *text* of the first may move,
and anyone diffing these outputs across the phase should not read that movement
as new breakage. If the sweep's own test search finds that either suite pins a
string it changes, the sweep updates it in the same commit and says so.

## Affected artifact

The seven files above; `harness/scripts/verify.mjs` only in the negative sense
that none of them may be registered there until repaired. Measurement and
per-file evidence:
`specs/sprint-phoenix-epic/evidence/unregistered-suite-classification.md`.

## Proposal

**Owner: PO**, for assignment. Four repairs, not seven, because the groups differ.

1. **Group 3 first.** It is a statement about the verify entry point and it is
   currently false. Establish whether the property was removed deliberately or
   lost; the answer decides whether the suite or the entry point is repaired.
2. **Group 1 needs an archaeology pass, not an edit.** For each of the three,
   determine from history whether the export was removed or never landed. Record
   the answer in this item before anyone changes a line.
3. **Group 2 needs reading.** Three independent assertion failures with no shared
   cause; each gets its own short verdict on whether the assertion or the
   behaviour is wrong.
4. **Registration is the last step for each, individually.** A suite joins the
   gate in the commit that makes it green, never before, and never as part of a
   batch that would let one red hide inside a larger change.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
