---
schema: pipeline.backlog-item.v1
id: pipeline.baseline-only-verify-needs-an-actionable-release-recovery
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — the intentionally permitted baseline-only verify state becomes expensive when it is discovered late at push time and a runner cannot discover the exact recovery through its normal driver."
source: "evidence/pipeline-analysis-agy-062-103.md; evidence/pipeline-retrospective-2026-09-13.md."
---

# A deliberate `verify: null` state has no uniformly discoverable late recovery

Fresh onboarding deliberately seeds `verify: null` so a project with no tests
does not need an invented command before implementation.  That policy is sound.
The current reports nevertheless show that a runner can reach release with the
state still unset, receive a failing verification gate, and need an improvised
scratch-script route instead of an exact driver action.

This is not a request to make an empty verify contract pass.  It needs one
driver-visible, PO-confirmed command-collection/replacement route that works
both before implementation and when push readiness first detects the omission.

## Acceptance criteria

- Baseline-only verification stays honestly non-passing for push/release.
- Every runner's ordinary onboarding/push driver exposes the same typed recovery
  action without shell reconstruction.
- A test follows fresh seed → implementation → late discovery → confirmed
  configured verify → push readiness without scratch files or a human guard
  override.

## Current-boundary readback — 2026-09-18

The current source confirms the Greenfield diagnosis remains open, rather than
being a stale report assertion. `pipeline-state.mjs` has one sanctioned
configuration path: `set-phase --phase implementation --verify-command ...`.
It is intentionally limited to the design → implementation transition, and
the commit backstop admits only that exact three-file transaction (the two
calibration twins plus the matching lifecycle transition). This preserves the
strong baseline-only-onboarding policy.

Once a project is already `implementing`, `pipeline-state` instead directs the
operator to `push-init`; `push-init` can aggregate the resulting baseline-only
release blocker, but it cannot return a typed action that configures the
contract. The missing work is therefore a narrowly bounded, post-implementation
writer/action with the same twin-consistency and exact-command invariants — not
an expansion of the baseline-only state and not a generic protected-file
exception.

Existing source coverage demonstrates each half separately:

- `project-onboarding-v3.test.mjs` covers the intentional baseline-only seed.
- `pipeline-state.test.mjs` covers the design → implementation transition.
- `pre-commit-hook-install.mjs` restricts the current commit admission to that
  exact transition.

The new end-to-end late-recovery contract is still absent. It should be
designed as one lifecycle package before implementation so it cannot silently
weaken either the protected calibration boundary or release blocking.

## Implementation and rollback plan — 2026-09-18

The implementation is deliberately limited to a named `configure-verify`
writer that is available only after a valid, already-approved implementation
lifecycle is established.  It may replace only two identical baseline
calibration twins with the same non-empty verify command.  `inspect` and the
ordinary `push-init` driver must both expose that exact typed recovery action;
neither may emit a reconstructed shell command or turn a baseline contract
into a passing release state.

The commit backstop must admit this post-implementation twin-only transaction
only when the committed lifecycle state satisfies the same plan-authority
validation as the writer.  Drift, malformed twins, missing or stale approval
authority, a non-baseline command, or any simultaneous protected-file change
must fail closed without a calibration write.

Rollback is code-only and does not alter a consumer's declared verify command:
before publication, revert the bounded implementation commit; after
publication, deliver the same reversal in the next normal immutable plugin
build.  A consumer that already used the sanctioned writer retains its explicit
verify contract and continues to be subject to ordinary push verification.
The rollback must never delete or blank that contract merely to restore an
older plugin behavior.

## Local implementation result — 2026-09-18

The bounded recovery is implemented locally across commits `45125761`,
`9af3878f`, and `9a18c3b3`.  Both ordinary discovery points (`inspect` and
`push-init`) now return the same structured, copy-safe `collect-input` action.
Its mutating `configure-verify` apply action requires a fresh confirmation;
the canonical writer still enforces a current approved implementation
lifecycle, two identical baseline twins, a non-empty command, and exact
zero-write replay only.

The pre-commit backstop uses that canonical lifecycle predicate rather than a
shallow plan-approval shape.  The focused end-to-end recovery, Push Init
(26/26), and late pre-commit regressions pass locally.  Two initial
diff-scoped Critic runs found and drove the reachable-push, lifecycle-authority
and confirmation corrections; the final correction-diff Critic returned PASS
with no findings.  A clean-worktree full candidate Verify then correctly found
that the new focused suite is missing its protected central Verify-registry
entry.  Its exact one-line registration is currently blocked by `TP-3`; no
override was requested or consumed.  This is not yet full candidate Verify
evidence or a plugin publication: the item remains open for that bounded
registry decision, normal qualification and release path.
