# Pending Verify registrations — GF-057

New test suites written during this block that are **not yet registered** in
`harness/scripts/verify.mjs`, and therefore do not run under Verify.

## Why they are pending rather than registered

`project/guard-config.json` TP-3 protects `harness/scripts/verify.mjs`, and the
override that clears it follows the push-approval mode
(`guard-testpath.mjs:255`), which is `signature` in this repository. The
signature binds to a `--request-sha256` computed from the exact command, so it
cannot be pre-authorized before the final edit exists, and it cannot be
amortized across several registrations unless they are batched into one edit.

Both obvious workarounds were considered and rejected during the block: switching
the push-approval mode weakens the *push* gate to clear a *test-path* one, and
removing TP-3 drops the protection on the verify script while dispatches run
unattended. The gap itself is filed as
[`backlog/items/2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md`](../backlog/items/2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md).

This file lives under `docs/` rather than `evidence/` deliberately: `evidence/`
is covered by an over-broad ignore rule
([filed here](../backlog/items/2026-08-08-an-over-broad-ignore-rule-swallows-the-closure-evidence-the-gate-demands.md)),
so a handover artifact placed there does not survive the block that produced it.

## The human step

Add one `TEST_SUITES` entry per suite below, then commit. A human editing their
own repository's file needs no ceremony; the signed-override route is available
if the ceremony is wanted for the record.

Until that happens, each suite has been run individually by the Elephant and its
result recorded in the block's evidence — "not registered" here means "not run by
the gate", never "not run".

## The suites

| Suite | Block | What it covers |
|---|---|---|
| `plugins/pipeline-core/lib/machine-plane.test.mjs` | SETUP-2b | The machine-scoped configuration store: three-valued reader, exact key set, the enforced zero-overlap rule against the repository plane, atomic validating writer. 22 tests. |
| `harness/scripts/check-consumer-safe-paths.test.mjs` | CB-1b | The gate that fails when a shipped artifact under `plugins/pipeline-core/` names a path only this repository has. 9 tests; the gate itself sweeps 755 tracked files against 46 reasoned allowlist entries and reports unused ones. |
| `plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs` | CB-2 | The `pipeline.verify-evidence.v0` producer that had a schema and consumers but no producer, including a test that feeds its output through the real, unmodified `publication-gate-evidence.mjs`. 6 tests. |

Note that `plugins/pipeline-core/scripts/po-human-approval.test.mjs` was found
during SETUP-2b to be unregistered as well — a pre-existing gap, not created by
this block. It covers the human authority chain. Worth adding in the same pass.
