# Known Issues

## V3 foundation transfer — 2026-07-20

The V3 Public Core transfer is recorded under an explicit PO course exception.
That earlier exception was not and is not a Critic PASS. It remains a transfer
disposition, not a review verdict or release approval.
No push was performed.

The public marketplace URL, its self-application assertions, the current
PO-language failure text, the standing-approved push-gate assertion, the public
inventory baseline, and the three reproduced documentation links were
reconciled on 2026-07-20. The inventory baseline now resolves to the committed
Public V3 Foundation candidate.

| Issue | Scope | Required follow-up |
| --- | --- | --- |
| Recovery-preview callback attestation can accept a no-op callback in the migration library. | V3 migration recovery path | Prioritized design item: [attest recovery-preview callback delivery](../backlog/items/2026-07-20-recovery-preview-callback-attestation.md). |
| Formal review/dispatch aborts can force broad repeat runs without a new domain finding. | Review workflow | Prioritized design item: [bound review retries to valid evidence](../backlog/items/2026-07-20-evidence-bound-review-retry-economics.md). |
| The installed plugin can read project-root `pipeline.user.yaml`, but `pipeline-start` does not yet validate the private-overlay core lock or load its allowlisted extension namespaces; a slim overlay has no local setup or harness fallback. | Private-overlay activation | Fail closed with no bootstrap or go-live readiness claim until the Public [private-overlay activation bridge](../backlog/items/2026-07-20-private-overlay-activation-bridge.md) is implemented and verified. |

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
