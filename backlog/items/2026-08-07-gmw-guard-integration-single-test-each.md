---
schema: pipeline.backlog-item.v1
id: pipeline.gmw-guard-integration-single-test-each
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Elephant observation while assembling the guard-blocked registration patch applied by the PO in commit 550b21f; surfaced rather than left unstated, per the operating model's rule that a finding is fixed, accepted with a reason, or escalated — never silently discarded.
---

# The Guard Maintenance Window's two guard integrations have one test each

## Description

The Guard Maintenance Window (GMW, ADR-0058) lets a PO-signed, time-boxed
record turn a guard's unconditional refusal into an allow for a narrow set of
rule ids. Its core module is well covered: `guard-maintenance-window.test.mjs`
carries 14 checks including tamper, replay, expiry-extension and
non-liftable-id defence (`GMW01`-`GMW13`).

Its two *integration* points — the places where the window actually causes a
guard to stop refusing — carry **one test each**:

- `plugins/pipeline-core/hooks/guard-gate-strength-gmw.test.mjs` — a single
  check, `GST20` ("a real armed GS-6 window lifts an ordinary plugin file but
  a kernel path stays refused").
- `plugins/pipeline-core/hooks/guard-testpath-gmw.test.mjs` — a single check,
  `TP09` ("real armed GMW window scoped to TP-1 lifts the matching Edit").

Both are happy-path-plus-one-negative. For a feature whose entire purpose is
to lift a guard refusal, the integration surface is where a defect becomes a
security consequence rather than a unit-test failure: the core module can be
perfectly correct while the call site checks the wrong rule id, checks the
kernel list too late, swallows the wrong exception, or fires on a path the
window does not actually cover.

Uncovered at the integration layer, by inspection of the two suites against
the two call sites (`guard-gate-strength.mjs:196-209`,
`guard-testpath.mjs:215-223`): an expired window at the call site; a window
scoped to a *different* liftable id than the one the guard matched; the
`catch` branch both call sites wrap the lookup in (an unusable window must
leave the refusal standing — asserted nowhere); the GS-side interaction with
`matchedLivePluginRoot` being null; and, for guard-testpath, the ordering
relationship between the GMW branch and the `chat`-mode human-guard-override
branch directly below it.

## Triggering situation

Noted while verifying which test suites were unregistered in
`harness/scripts/verify.mjs` for the patch the PO applied in `550b21f`. Until
that commit **none** of the three GMW suites ran in the Verify gate at all, so
the thinness had never been visible in a gate result. It is pre-existing — the
suites arrived in this shape with the marketplace snapshot merged at `cca5ad8`
— and is not a regression introduced by any dispatch in this repository.

## Affected artifact

`plugins/pipeline-core/hooks/guard-gate-strength-gmw.test.mjs`,
`plugins/pipeline-core/hooks/guard-testpath-gmw.test.mjs`, covering the call
sites at `plugins/pipeline-core/hooks/guard-gate-strength.mjs:196-209` and
`plugins/pipeline-core/hooks/guard-testpath.mjs:215-223`.

Note both *canonical* suites (`guard-gate-strength.test.mjs`,
`guard-testpath.test.mjs`) are TP-protected, which is why the GMW coverage was
added as separate sibling files in the first place; any extension follows the
same sibling-file pattern rather than editing the protected suites.

## Proposal

**Owner: PO.** Candidate directions, disclosed rather than pre-selected:

1. Extend both sibling suites to cover the uncovered cases listed above. Cheap,
   no design decision, follows the existing pattern — but it is test authorship
   against guardrail code, so it belongs in a briefed task with a Critic pass,
   not an ad-hoc edit (QG-04 / GF-04).
2. Accept the current coverage on the grounds that the core suite's 14 checks
   carry the real risk and the integration is a thin, reviewed call site.
   Defensible, but it should then be recorded as an accepted risk with that
   reasoning, not left implicit.

Sequencing note: GMW is not yet wired into the WP5/PHX-2 external push-ledger
path — the PO named that as separate follow-up work when the snapshot was
merged. If that wiring goes ahead, this item should be resolved before or with
it, because that wiring adds a third integration point to the same mechanism.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
