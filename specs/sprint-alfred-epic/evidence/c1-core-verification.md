# C1 pure receipt core — verification checkpoint

Checkpoint: 2026-09-06. This records the first pure core under
[spec §§6.1 and 12](../spec.md) and [the C1 plan](../plans/c1-core.md),
not completion or acceptance of C1 or Wave 0.

## Implemented source and behavior

Plan commit: `2d791bcec9e89708e4970699a91898375d42d123`.
Core commit: `a6ab08abe56d1c834e541131876e71a1781727fb`.
Classifier boundary fix: `a87677726d7d451862585b8e4870ddebb1325c4d`.
Sources are `plugins/pipeline-core/lib/interruption-receipts.mjs`, its
`interruption-receipts.test.mjs` sibling and
`policies/interruption-registry.v1.json`.

The pure core validates closed receipt/registry shapes, constructs canonical
digest-bound receipts and deterministically classifies generic and seeded
observations. Unknown, missing-code and conflicting evidence stay visible;
TP waits classify as external waits. Fixtures cover lineage joins and replay
deduplication, attempt/recovery counts, elapsed-time endpoints, status-tagged
missing/estimated/measured values, privacy rejection and classifier input
boundaries. Valid data does not assert authority, successful recovery or live
source authenticity. No filesystem, clock or network producer is supplied.

## Recorded machine evidence

These ignored root logs were read back; this tracked note is their summary.

| Artifact | Exact tested command and result |
|---|---|
| `evidence/c1-classifier-boundary-red.log` | `node --test plugins/pipeline-core/lib/interruption-receipts.test.mjs`: historical exit 1, 39 tests, 34 pass, 5 fail before the classifier fix |
| `evidence/c1-core-independent-final.log` | Same command: exit 0, 39 tests, 39 pass, 0 fail after the fix |
| `evidence/a1-after-c1-regression.log` | `node --test plugins/pipeline-core/scripts/enforcement-conformance.test.mjs`: exit 0, 25 tests, 25 pass, 0 fail |
| `evidence/alfred-wave0-full-verify.log` | `node harness/scripts/verify.mjs`: exit 2 |
| `evidence/alfred-wave0-verify-summary.log` | Machine summary of Full Verify: 506 steps, only `verify-suite-registration-check` exits 2; the other 505, including `security-scan`, exit 0 |

Full Verify binds exactly to source commit
`a87677726d7d451862585b8e4870ddebb1325c4d`, tree
`ab73c82fe6678a545e8e8a44f2d16d622af057cc`, clean at start and finish.
It is historical exact-source-candidate evidence, not proof of a later HEAD
containing this documentation. A1/C1 standalone passes do not mean those
unregistered suites ran inside Full Verify.

## Required continuation

The one observed integrated blocker is two missing suite registrations:
`evidence/alfred-registration-current.log` records exit 2, two unregistered,
four honoured exclusions and zero malformed/expired exclusions. Capability
reachability exits 0 in `evidence/alfred-capability-readback.log`.
The next non-agent step is PO review and execution of the exact coupled
[A1/C1 suite and capability payload](a1-registration-preparation.md) through
the sanctioned protected-edit mechanism. The existing batch helper contains
no A1/C1 payload; this note supplies no executable signing/apply route.
A1 option-1 approval stands; the additional C1 scope is proposed, with no
claim that the combined payload has already been approved or applied.

After registration, rerun Full Verify on the exact unchanged new candidate.
Independent T1 Critic review and PO acceptance remain pending. A1 native
measurements remain pending; [offline evidence](a1-matrix-verification.md)
reports unavailable execution, not measured enforcement. C1 aggregation,
emission, source-authenticity validation, local reports and baseline collection
have not started. No baseline start is inferred from fixtures or these commits;
the measured 14-day requirement remains. Alfred is still implementing, with
no new schema/profile decision, feature close or acceptance in this handoff.
