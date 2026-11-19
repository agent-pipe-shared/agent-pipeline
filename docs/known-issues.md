# Known Issues

## V3 foundation transfer — 2026-07-20

The V3 Public Core transfer is recorded under an explicit PO course exception.
That earlier exception was not and is not a Critic PASS. It remains a transfer
disposition, not a review verdict or release approval.
The stabilized candidate is published only on
`feat/v3-public-core-foundation`; Public `main` remains unchanged.

The public marketplace URL, its self-application assertions, the current
PO-language failure text, the standing-approved push-gate assertion, the public
inventory baseline, and the three reproduced documentation links were
reconciled on 2026-07-20. The inventory baseline now resolves to the committed
Public V3 Foundation candidate.

| Issue | Scope | Required follow-up |
| --- | --- | --- |
| Formal review/dispatch aborts can force broad repeat runs without a new domain finding. | Review workflow | Prioritized design item: [bound review retries to valid evidence](../backlog/items/2026-07-20-evidence-bound-review-retry-economics.md). |
| The installed plugin can read project-root `pipeline.user.yaml`, but `pipeline-start` does not yet validate the private-overlay core lock or load its allowlisted extension namespaces. | Private-overlay activation | Use the authenticated Public [private-overlay activation bridge](../backlog/items/2026-07-20-private-overlay-activation-bridge.md); legacy consumers without runtime projections use the documented [V3 consumer onboarding](v3-consumer-onboarding.md) migration path rather than hand-authoring an overlay lock. |
| The generic plugin validator rejects the committed manifest `hooks` extension and requires `disable-model-invocation: false` for `close-block` and `critic-review`; the Public parity tests passing is not native validator admission evidence. | Plugin admission parity | Complete the same-candidate native/generic A/B evidence required by [Sentinel go-live completion](../backlog/items/2026-07-20-sentinel-go-live-completion.md) before release admission. |
| A cross-repository guarded operation can bind its one-time override ledger to the coordinator checkout rather than the command's target repository. | Guard override audit boundary | Keep cross-repository audit data out of Public history and implement the [target-bound override ledger](../backlog/items/2026-07-20-cross-repository-override-ledger-binding.md). |

## 0.7.0 candidate: limits you can meet on the feature path

Found in greenfield runs on all three runners and listed with what to do. None
of them is hidden by a green check; each ends in a typed refusal or notice. The
path itself is in [usage](usage.md#from-an-idea-to-the-implementation-phase).

| Limit | Where you meet it | What to do |
| --- | --- | --- |
| A design signed after a **third** review round could not be read back (the retained approval was bounded at two receipts). | `set-phase implementation` after the signature, on a candidate older than the interim fix. | Install a candidate that carries the fix; the refusal names the cause. A project already signed needs no new signature. |
| A node installed under a version manager may not start inside a runner's sandbox. | The start preflight reports `NODE-SANDBOX-UNREACHABLE`; on Codex a published `node` action failed with `EPERM`. | The onboarding Driver now runs its own interpreter for the actions it spawns. For the rest, follow the one-time remedy the preflight prints: a system `node`, or allow the version-manager directory in the runner's sandbox. |
| A wildcard in the architecture block's owned paths is refused. | The design inspection, before the review. | Write the exact files or directories; the refusal names the field, the rule and the rejected value. |
| A very long hyphenated word in a resume-hint field is read as a key and refused. | `resume-hint.mjs capture`. | The refusal names the word; shorten it or write it as separate words. |
| A commit between `present-plan` and the signature makes the presented request stale. | The next `present-plan`, refused with `DWP-REQUEST-EXISTS-DRIFT`. | Delete the one scratch file the refusal names, present again, and make no commit before the signature. |
| A project command that already uses the reserved Verify id `browser-smoke` for another tool is taken over by the browser preflight. | The browser smoke step of the Verify. | Rename the project command ([Verify reference](usage.md#verify-reference)). |
| The Full Verify of the installed candidate, the independent Critic review and your acceptance are not complete. | Every statement about `0.7.0`. | See [what's new in 0.7.0](whats-new-0.7.0.md#what-remains-open). |

## Rollback path

While this state is local and unpublished, it may be withdrawn only with
explicit PO approval after identifying the exact local scope. After any
publication or other sharing, rollback uses ordinary revert commits on shared
history only. `reset`, `rebase`, force-pushes, and other rewrites of shared
history are excluded.

The rollback scope is not documentation-only. It includes the committed
marketplace coordinate in `.claude/settings.json`, changed from
`agent-pipeline/agent-pipeline` to `agent-pipe-shared/agent-pipeline`, together
with its `extraKnownMarketplaces.agent-pipeline` and enabled
`pipeline-core@agent-pipeline` binding. It also includes the portable Verify
aggregate change: `harness/scripts/verify.mjs` no longer runs
`po-gate-authority-check`, so the machine-local CLI remains excluded from
portable Verify. The portable `po-gate-authority-fixture-tests` Verify phase
retains isolated fail-closed fixture coverage, and
`docs/product-capability-inventory.json` records that coverage rather than the
excluded CLI.

The security rollback scope includes the three scanner-safe fixture identifier
changes in `harness/scripts/pipeline-state.test.mjs` and only these Gitleaks
suppression changes: the three removed worktree fingerprints at lines 1468,
1593, and 1641; the three immutable-history fingerprints for commit
`89c3c2ebf73d2b8cd3b43ee0ea463d2819c5f49f` at lines 1601, 1726, and 1774; and
the three equivalent immutable-history fingerprints for commit
`5add084a1be90f0ec780c07d671d68927eeac634` at those same lines. No path-wide
or rule-wide Gitleaks suppression was added. There is no schema, data, or
runtime migration, so no migration or downgrade step is required.

An ordinary revert must restore or remove exactly the corresponding marketplace
configuration, Verify/test, inventory, and commit-bound Gitleaks changes in the
reverted commits; it must not substitute a broad Gitleaks allowlist or a
history rewrite.

TP-3 and TP-5 were temporarily removed under explicit PO authorization solely
for these briefed edits and restored exactly before the final gates. This narrow
course authorization is not a Critic PASS, review verdict, or release approval.

For the PHX-0A lifecycle-writer implementation session, the PO explicitly
authorized temporary removal of TP-1, TP-3, and TP-5 only. The authorization
is limited to the briefed Goldfish scope and must be restored before its
independent Critic review and final gates; it does not authorize any other
guard-config change, a bypass of Verify, or a remote action.

The temporary PHX-0A exception was restored without an implementation change
when the accepted #22 planner rejected the required absent-manifest draft
bootstrap. The next attempt requires a PO-approved resolution of that planner
contract before another writer dispatch.

After that PO-approved contract revision received its renewed Plan/Spec gate,
the same session authorization reactivated only TP-1, TP-3, and TP-5 for the
single renewed PHX-0A dispatch. The rules remain subject to the same immediate
restoration requirement before independent review and final gates.

That renewed dispatch restored the rules without a code commit after the
repository topology validator exposed stale authority digests in the existing
Phoenix draft lifecycle manifest. The pending worktree remains subject to a
separate exact PO disposition for that manifest reconciliation.

The PO subsequently authorized PHX-0A to include that manifest and reconcile
only its stale PRD, Spec, acceptance, and architecture digests through the new
writer's preview → exact PO-bound apply → readback path. After the revised
Plan/Spec gate was renewed, this same session exception reactivated only
TP-1, TP-3, and TP-5 for the single Goldfish completion dispatch. It remains
limited to the listed writer/topology/test work and must again be restored
before any independent review, aggregate final gate, or remote action.

That Goldfish dispatch completed its exact writer preview → PO-bound apply →
readback transaction and committed the corresponding public-safe receipt. The
TP-1, TP-3, and TP-5 rules are restored before aggregate verification and any
independent review; the exception grants no further implementation or remote
authority.

The aggregate Security gate then identified two `generic-api-key` false
positives in the PHX-0A receipt and its negative fixture. The PO's existing
session exception reactivates only TP-5 for one bounded Goldfish sanitation
patch to the writer receipt and `pipeline-state` suite; it does not authorize a
Gitleaks allowlist expansion, unrelated scanner suppression, or a lifecycle
manifest change. TP-5 must be restored before the rerun of Security, Verify,
and independent review.

The bounded writer sanitation patch committed a replay-generated public receipt
with a compact correlation fingerprint, retained the exact internal authority
checks, and left the lifecycle manifest unchanged. TP-5 is restored before
Security and Verify are rerun; no scanner suppression was added.

The subsequent Security scan proved that the remaining false positives are
immutable local-history findings from the earlier R3 receipt and fixture
commits. The current receipt and fixture are minimized, but a historical scan
cannot remove prior commit contents without prohibited history rewriting. TP-5
is restored while the PO decides whether to authorize exact, immutable-history
fingerprints in `.gitleaksignore`; no broad allowlist or scanner bypass is
permitted.
