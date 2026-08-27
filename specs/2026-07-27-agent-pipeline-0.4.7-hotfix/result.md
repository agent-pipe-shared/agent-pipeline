# Result — Agent Pipeline 0.4.7 hotfix

## Delivery status

The 0.4.7 implementation is code-complete for the approved hotfix scope. The
public release surfaces are aligned to `0.4.7`. This Result records the
implemented product outcome; it does not by itself claim publication, tag,
GitHub Release, Issue closure, or remote readback.

The Stage-1 exact-candidate gate completed on commit
`afdfcb0a019f96ee4831f23f80e7d50413136ef3` and tree
`0aee5c59a0fefb7ae0d33532cc7c306f772bd232`: Full Verify exited zero and the
integrated Security scan was CLEAN (Gitleaks 0, Semgrep 0, license findings 0;
OSV reported no package sources). The later tracked Result/close transition is
therefore required to receive a fresh exact-candidate Verify, Security and
independent Critic review before publication.

The Product Owner approved the Feature implementation and final stable
versioning/release intent, selected the repository update channel `alpha` for
this Pipeline source checkout, granted the recorded TP1/TP3/TP5 test lifts,
and granted TP4 for the bounded SessionStart hook correction. Those approvals
do not waive final candidate, publication, tag, release, or readback gates.

## Delivered behavior

- V4 onboarding failure states now expose typed, executable diagnosis,
  migration, manifest-repair, cleanup-privatization, and recovery paths instead
  of invalid states with unusable or null repair actions.
- Machine-local session-cleanup identity remains in private runtime storage.
  Neutral portable State persists `sessionCleanup: null`; active historical
  bindings can be privatized through a read-only plan and explicitly confirmed
  digest/CAS-bound apply.
- A post-privatization kickoff seed is recognized only for the exact revision-1
  history shape. Promotion preserves the authentic kickoff transaction,
  advances monotonically, and rejects drift, work, blockers, queue changes, or
  forged history.
- Editing an approved PRD or Spec revokes its approval and returns the feature
  to design. PRD/Spec remain editable throughout design and
  `awaiting_approval`; only a new exact PO approval permits implementation.
- The final review-to-close edge has a dedicated read-only Result-binding plan
  and confirmed apply. It binds an existing physical Result, advances only the
  Continuity revision/Result/resume and `review -> close`, supports zero-write
  replay, and makes the unified H5 close coordinator reachable without a
  manual State edit.
- Repository freshness compares the checked-out branch only with its configured
  upstream. Pipeline distribution availability is a separate advisory signal
  and cannot retarget, rebase, restart, update, or block ordinary writes.
- Pipeline update channels are explicit and configurable per repository:
  `alpha` follows the development head, `beta` follows the newest prerelease,
  and `stable` follows the newest final release. Stable is the silent default;
  changing the installed local/official plugin source remains a separately
  documented host-global action affecting all repositories.
- Parallel Sprints keep independent bases. The four dispositions
  `baseline-current`, `baseline-stale-deferred`,
  `baseline-impact-review-required`, and `rebase-required-for-promotion`
  distinguish normal work, protected-surface review, and candidate promotion.
  Only the PO-selected first merge-ready candidate is rebased and final-gated.
- Guard recovery commands returned by the current lifecycle are executable
  before general readiness when they are exact shipped diagnostics/planners.
  Mutation remains separately confirmation-bound. Shell-operator denials now
  include durable runner guidance to use one simple command/tool call, avoiding
  repeated grammar deadlocks and token loss.
- Release selection explicitly distinguishes beta from stable, binds the exact
  candidate commit/tree/version/tag, and rejects alpha as a publishable tag.
  A fixed publication executor permits only the authorized exact candidate to
  fast-forward `refs/heads/main`, followed by isolated remote OID/tree readback.
- Core Verify is runner-neutral and exact-candidate-bound, uses full required
  Git history, and separates deterministic offline adapter conformance from
  optional live runner certification.
- Project-authority adoption binds source/destination provenance and rejects
  mixed, dirty, stale, partial, conflicting, or unapproved cross-checkout
  transfer.
- The Codex WSL IPC path preserves typed local-socket failure classification
  and offers only the bounded, session-scoped compatibility profile after its
  fixed probe and explicit adoption.

## Mandatory `hotfix:0.4.7` Issue disposition

Code and current tests are authoritative where historical Issue implementation
sketches differ.

| Issue | 0.4.7 disposition |
| --- | --- |
| #63 | Delivered: closed V4 diagnosis/action matrix, generated-manifest repair, exact pre-ready diagnostic guard admission, and hostile recovery fixtures. |
| #70 | Delivered: canonical managed-onboarding backlog transition/ledger relationship is admitted and the canonical checker is green. |
| #71 | Delivered: typed WSL IPC probe/failure projection and bounded session compatibility path; broader upstream sandbox behavior is not claimed fixed. |
| #73 | Delivered: guarded bootstrap, runtime initialization/readback, cleanup privatization/recovery, and non-deadlocking repair routes. |
| #77 | Delivered: unified close coordinator plus the missing digest-bound Result-to-close entry transition; checkpoint, close, publication and release remain distinct gates. |
| #81 | Delivered: exact-candidate main fast-forward executor, single-use authority, isolated readback and uncertainty/recovery behavior; no generic Git override. |
| #82 | Code-truth disposition: the referenced local-worker supervisor and heartbeat suite are not shipped in the current repository. No timeout was weakened and no absent product surface was invented; the exact Full Verify is green. Close with this non-applicability evidence after release. |
| #83 | Delivered: provenance-consistent project-authority adoption and mixed-source rejection, without copying or rebasing Phoenix/Nova/Cyborg. |
| #84 | Delivered: full-history topology preflight, runner-neutral Core Verify, offline adapter conformance, optional live certification, and retained integrity/rollback regressions. |

Remote Issue comments/status changes remain a separate explicit operation after
the published commit, tag, Release and remote readback are known. If local
GitHub issue authentication is unavailable, the exact close comments are
handed to the operator instead of making an unverified mutation claim.

## Verification summary

Focused evidence before the final tracked close includes:

- project onboarding V4: 62/62;
- onboarding Continuity: 84/84;
- Continuity State: 95/95 after the Result-close transition;
- Result-close CLI: 5/5;
- Pipeline State: 306/306;
- cleanup binding: 33/33;
- project authority: 18/18;
- project-authority migration: 13/13;
- guard lifecycle/readiness: 22/22;
- Codex PreTool guard: 17/17;
- Pipeline start contract: 30/30;
- update channels: 19/19;
- ruleset freshness: 14/14;
- staleness hook: 10/10;
- parallel Sprint integration: 14/14;
- release-version selection: 17/17;
- publication executor: 15/15;
- publication journal: 15/15;
- publication authority: 14/14;
- repository freshness host suite: 23/23;
- WSL IPC compatibility: 24/24;
- product-capability inventory: 15/15; and
- Stage-1 Full Verify plus integrated Security: exit 0 / CLEAN.

The release is eligible only after the post-Result tracked candidate receives
fresh Full Verify/Security evidence, an independent T1 Critic pass, exact
anonymous-Public-SSH publication, tag and GitHub Release creation, and remote
OID/tree/tag/release readback.

## Security and privacy outcome

- No credential, private account identity, hostname, session identifier,
  cleanup tuple, absolute private path, or raw runner configuration is stored
  in this Result.
- No new runtime dependency was introduced.
- Release/update checks never auto-install, auto-restart, retarget an upstream,
  or rebase a project.
- Fail-closed recovery paths retain typed, explicitly confirmed repair routes;
  they do not make PO override a substitute for executable recovery.

## Deferred work and non-claims

- The broader worker-pool design remains owned by #21; 0.4.7 does not invent a
  worker supervisor absent from the shipped code.
- Native platform certification beyond the recorded supported cells remains
  separately scoped. Synthetic evidence is not labelled as native assurance.
- Nova, Phoenix and Cyborg adoption occurs later through the accepted baseline
  impact-review/promotion policy. This release does not mutate, rebase, copy,
  merge, or publish those Sprint branches.
- Issue mutation is not release evidence and may be handed to the operator when
  authenticated GitHub Issue access is unavailable.

```pipeline-result
{
  "decisionBriefs": [],
  "courseDecisionIntents": [],
  "courseDecisionReceipts": [],
  "finalIntegrations": []
}
```
