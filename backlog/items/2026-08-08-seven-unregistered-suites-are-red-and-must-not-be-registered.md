---
schema: pipeline.backlog-item.v1
id: pipeline.seven-unregistered-suites-are-red
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Filed under phase-plan item R1.2 (gate integrity and residual closure) after the unregistered-suite measurement ran all 109 files. 102 are green and are being registered in batches; these 7 are red and are deliberately excluded from that registration. Machine artifact: specs/sprint-phoenix-epic/evidence/unregistered-suite-classification.md"
due: 2026-09-07
---

# Five unregistered suites fail standalone — file them, do not register them
(filed as seven; one has since been deleted rather than repaired, one repaired and registered)

## Description

Of the 109 test files registered nowhere in `harness/scripts/verify.mjs`, **102
pass and 7 fail** when run standalone. The 102 are being registered in reviewable
batches (phase plan R1.1). These 7 were not, and this item is why. **Five remain**
— see "Two left the set" below.

**Registering a red suite turns the gate red on arrival**, and a gate that is red
for inherited reasons cannot distinguish a genuine regression from a pre-existing
one. That is the same failure this repository just spent a session recovering
from in a different form. They get owners and repairs first; registration
follows a repair, never precedes it.

## Two left the set (2026-08-08, 2026-08-09)

`plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs` **was deleted, not
repaired and registered**: every case in it exercised `observeCodexRulesetSource`,
a function retired by PO decision and superseded (design
`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
§A.3, "Explicitly not revived"), so the suite followed the export out of the tree
rather than becoming a repair task. Its exclusion entry in
`harness/scripts/check-verify-suite-registration.mjs` was removed in the same
commit.

`plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs` **left
by repair, the route this item asks for** (2026-08-09): WAVR19 was repaired in
`afa00fd` (24/24 standalone), and registration followed the repair in a separate
commit — `TEST_SUITES` entry `windows-assurance-verify-registration-tests`,
exclusion entry removed, product surface added. See "Group 3" below.

**Five** entries remain; this item's `id` and filename keep the original count
because they are referenced by the append-only backlog ledger.

## The five remaining, grouped by what is actually wrong

### Group 1 — stale against a module surface that does not exist (2 remaining of 3)

These import names their target module does not export. They are **stale, not
broken**: they were written against an API this tree does not have. Nothing is
failing *at runtime*; the file cannot even load.

| Suite | Missing export |
| --- | --- |
| `harness/lib/plan-spec-state-v2.test.mjs` | `bindPlanSpecApprovalWithHumanDecision` from `./plan-spec-state-v2.mjs` |
| `harness/scripts/recovery-bridge-approval.test.mjs` | `RECOVERY_BRIDGE_DECISION_SCHEMA` from `./pipeline-state.mjs` |

(The third member of this group, `codex-host-plugin-list.test.mjs`, was resolved
by deletion — see above. Its archaeology answer: the export was removed
deliberately, so the suite followed it.)

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

### Group 3 — the one that pins the gate it is outside of (0 remaining of 1, CLOSED 2026-08-09)

`plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs` passed
23 of its 24 checks when this item was filed. The single failure was **`WAVR19 Verify fails before ordinary
suites with a named Windows-assurance registration step`**.

**Read what that means before triaging it.** The suite exists to pin a property of
the verify entry point itself — that a named registration step runs before
ordinary suites. It is *unregistered*, so the gate never runs it, *and* it is
failing, so the property it pins does not currently hold. A check on the gate,
outside the gate, reporting that the gate does not do what it says: that is the
same class as the duplicated registration line that stopped all 260 suites and
was invisible for as long as nobody ran the command by hand.

**Resolved.** The cause was in the suite's own fixture, not in the entry point:
its hand-enumerated module list had gone stale against `verify.mjs`'s import
graph, so the child died at import and the silence read as a failing property
(`afa00fd`). The suite is now green and registered, which is exactly the order
proposal item 4 below prescribes.

## An interaction with work in flight, recorded so it is not mistaken for a regression

Two of the five touch files the R3 citation sweep is editing in the same phase:

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

The five files above; `harness/scripts/verify.mjs` only in the negative sense
that none of them may be registered there until repaired. Measurement and
per-file evidence:
`specs/sprint-phoenix-epic/evidence/unregistered-suite-classification.md`.

## Proposal

**Owner: PO**, for assignment. Two repairs left, not five, because the groups
differ (Group 1's third member is closed by deletion, Group 3 by repair).

**UPDATE 2026-08-18: all five now pass standalone, re-confirmed live, not assumed.**
Ran each of the five directly (`node --test <file>`) rather than trusting this
item's own stale claims:
- `harness/lib/plan-spec-state-v2.test.mjs` — 8/8 pass. `bindPlanSpecApprovalWithHumanDecision`
  now exists in `plugins/pipeline-core/lib/plan-spec-state-v2.mjs:932`; Group 1's premise
  (missing export) no longer holds.
- `harness/scripts/recovery-bridge-approval.test.mjs` — 1/1 pass.
- `plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs` — 1/1 pass.
- `plugins/pipeline-core/scripts/afk-activation.test.mjs` — 13/13 pass.
- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` — 4/4 pass.

None of these fixes are visible in this item's own history — they were repaired
piecemeal elsewhere in the epic without this item being updated. **Registration
(step 4 of this proposal) is the only remaining step**, and it is blocked on the
same constraint as everything else touching `harness/scripts/verify.mjs` (TP-3):
needs a PO-signed GMW window, not available from an unattended session. Not
closing this item yet — repair is done, registration is not — but reducing scope
to exactly that one remaining, mechanical, already-scoped step.

1. ~~**Group 3 first.** It is a statement about the verify entry point and it is
   currently false.~~ **Done 2026-08-09** — the suite was stale, not the entry
   point; repaired in `afa00fd` and registered thereafter.
2. **Group 1 needs an archaeology pass, not an edit.** For each of the two left,
   determine from history whether the export was removed or never landed. Record
   the answer in this item before anyone changes a line.
3. **Group 2 needs reading.** Three independent assertion failures with no shared
   cause; each gets its own short verdict on whether the assertion or the
   behaviour is wrong.
4. **Registration is the last step for each, individually.** A suite joins the
   gate in the commit that makes it green, never before, and never as part of a
   batch that would let one red hide inside a larger change.

## Triage — 2026-08-18

- **Decision:** still_open_dispatch_ready — not closing. Independently re-verified 2026-08-18: all five suites currently pass standalone (`harness/lib/plan-spec-state-v2.test.mjs` 8/8, `harness/scripts/recovery-bridge-approval.test.mjs` 1/1, `plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs` 1/1, `plugins/pipeline-core/scripts/afk-activation.test.mjs` 13/13 — live-run confirmed, `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` 4/4), matching this item's own 2026-08-18 Proposal update and the `EXCLUSIONS` entries in `harness/scripts/check-verify-suite-registration.mjs:203-227` (each carries a "GREEN, not red" reason naming its repair commit — except `afk-activation.test.mjs`'s entry at line 218-222, which is stale text still reading "red (R1.2)").
- **Rationale:** Repair work is done; the only remaining step is registering the five entries in `harness/scripts/verify.mjs`, which is mechanical and needs no PO judgment call — it is blocked purely on TP-3's protected-test-path gate requiring a signed GMW window, the standard prerequisite for any edit to this file.
- **Assignment (if accepted):** Goldfish, dispatched once a TP-3-scoped GMW window is signed and open; the dispatch should also correct the stale "red" reason text for `afk-activation.test.mjs` in `check-verify-suite-registration.mjs` while it edits the same file's exclusion list.
- **Date:** 2026-08-18
