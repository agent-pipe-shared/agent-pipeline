# Parallel-sprint integration handoff for the 0.4.7 baseline

> Handoff proposal from Sprint Nova. It is non-authoritative until the Product
> Owner accepts it in the central 0.4.7/main governance path. It changes no
> current bootstrap, branch, rebase, remote or release behavior by itself.

## Problem observed

Nova, Cyborg and Phoenix run as independent long-lived delivery branches.
Treating every newer `main` commit as an immediate rebase requirement creates
three recurring costs: repeated conflict resolution, invalidated focused
evidence, and less time for the actual Sprint scope. It also makes the first
release-ready Sprint wait for unrelated work.

## Proposed central rule

**A rebase is a candidate-promotion gate, not a steady-state Sprint gate.**

Each active Sprint records its base and one of these exact dispositions:

| Disposition | Meaning | Required action |
| --- | --- | --- |
| `baseline-current` | Sprint base equals the selected integration baseline. | Ordinary work may continue. |
| `baseline-stale-deferred` | `main` advanced, but the Sprint remains inside an approved disjoint write-set. | Record the observed advance and continue; do not nag or force a rebase. |
| `baseline-impact-review-required` | `main` advanced through a shared, security, guardrail, runtime or overlapping surface. | Perform a bounded impact review. Rebase only if the review finds an incompatibility or the PO selects the Sprint for integration. |
| `rebase-required-for-promotion` | The Sprint is selected as the next release/merge candidate, needs a protected shared surface, or has a confirmed material incompatibility. | Freeze the Sprint candidate, rebase onto the exact selected `main` commit/tree, regenerate affected bindings and run final candidate gates. |

`baseline-stale-deferred` is a valid operational state. It is not a success
claim, a freshness claim, or permission to merge. It must never suppress a
security/guardrail impact review.

## Candidate selection rule

The next integration candidate is the first Sprint that is actually
merge-ready, not necessarily the oldest branch or the largest initiative. A
candidate is selected only when its own approved scope, candidate evidence and
required gates are ready. Then only that Sprint receives the exact-main rebase
and final-gate tail. Other Sprints retain their own bases until they reach the
same promotion point.

## Mandatory exceptions

An immediate impact review remains mandatory after a `main` change that touches
any of:

- security or release controls;
- guard/configuration/permission surfaces;
- bootstrap, installation, runtime projection or native-readback boundaries;
- a path/resource in the Sprint's declared write-set; or
- an accepted compatibility contract consumed by the Sprint.

The review may conclude `baseline-stale-deferred`, but it must preserve the
observed main commit/tree, changed surface class, Sprint write-set comparison,
decision and PO exception where one is needed.

## 0.4.7/main adoption handoff

The 0.4.7 owner should, after its own stable delivery evidence, create one
central PO decision that:

1. identifies the exact stable 0.4.7 `main` commit and tree;
2. adopts the four baseline dispositions above in the central lifecycle/policy
   source, including UI/status wording that avoids a generic rebase nag;
3. requires an impact-review receipt rather than an immediate rebase for every
   stale active branch;
4. requires `rebase-required-for-promotion` before merge/release candidate
   gates; and
5. keeps protected/safety-surface changes fail-closed until the impact review
   or a rebase resolves them.

The central decision must name the policy artifact, PO authority, candidate
commit/tree and applicable release version. It must not silently rewrite
existing Sprint state or claim that an unrebased branch is merge-ready.

## Nova application after 0.4.7

Nova initially records `baseline-impact-review-required` because 0.4.7 contains
the #63 V4 recovery change. Its existing rebase dossier owns that review. Once
the exact impact is known, Nova either rebases as the selected candidate or
records `baseline-stale-deferred` for still-disjoint work. Nova A acceptance,
protected-path work, immutable candidate evidence and any Nova B activation
remain governed by their existing exact gates; this handoff does not relax
them.

## Acceptance evidence for the central policy

- Fixtures demonstrate that an ordinary non-overlapping `main` advance becomes
  `baseline-stale-deferred`, not a rebase failure or repeated prompt.
- Fixtures demonstrate that guardrail/security/shared-runtime advances produce
  `baseline-impact-review-required` and cannot merge without a resolution.
- Candidate promotion requires an exact main commit/tree, an actual rebase and
  regenerated candidate-bound evidence.
- Status/readiness output distinguishes deferred staleness from a blocked
  promotion, with no false freshness or merge claim.
- Nova, Cyborg and Phoenix can each retain an independent base until selected;
  only the chosen candidate is rebased and final-gated.
