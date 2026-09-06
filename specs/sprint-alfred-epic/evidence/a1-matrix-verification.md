# A1 matrix and offline CLI evidence checkpoint

Checkpoint date: 2026-09-06. Offline CLI source commit:
`a141b856ecfe8be9afedff6122738c3eeea244ae`. This extends the earlier injected
matrix checkpoint with executable emission/readback evidence. Native probes
have not run; full A1 stability and acceptance remain open.

## Machine evidence readback

The following are historical candidate-specific machine outputs under the
ignored `evidence/` directory. This tracked note summarizes them; it is not
a machine record or evidence that the current HEAD qualifies.

| Artifact | Observed result |
|---|---|
| `evidence/a1-evidence-cli-independent.tap` | `node --test plugins/pipeline-core/scripts/enforcement-conformance.test.mjs`: exit 0; 25 tests, 25 passed, 0 failed |
| `evidence/a1-runner-version.log` | `codex --version`: exit 0; `codex-cli 0.153.4` |
| `evidence/a1-offline-candidate.log` | Emit: exit 0; runner `codex` version `0.153.4`, committed plugin version `0.6.1`; measurement and evaluator outcome `unavailable` |
| `evidence/a1-offline-readback.log` | Check: exit 0; `binding.matches: true`; `qualification.qualifies: false`, reason `evaluator-outcome-not-pass`; `nativeMeasurementVerified: false` |
| `evidence/a1-offline-stale-after-plan.log` | Check after the plan commit: expected exit 5; `binding.matches: false`, reason `candidate.commit-mismatch`; qualification false and native measurement unverified |

The matching emission/readback bind commit
`a141b856ecfe8be9afedff6122738c3eeea244ae`, tree
`7f0332e3b7167fd4973c81fb78739f3030705fcd`, and artifact SHA-256
`f0d3a656f0cc14cb60d4a26cbb132a4d63c47e61ad93c735b9bd81f7dc31be9d`.
All four surfaces have raw `hookObservation: unknown` and
`evidenceKind: unavailable`, with null exit codes and marker hashes.

At subsequent plan commit `2d791bcec9e89708e4970699a91898375d42d123`,
the source artifact digest stayed equal but the candidate commit changed.
Rejecting the old record with exit 5 is the expected stale-candidate check,
not a product test failure. Later HEADs need fresh emission and readback.

The 25-test output covers closed records, injected surface/marker behavior,
binding and version staleness, sanitization, offline raw/envelope readback,
dirty or mismatched source refusal, asynchronous source drift, and rejection
of hand-authored native-pass claims. Fixture success does not establish live
runner interception. The CLI uses unavailable execution/marker adapters;
exit 0 establishes emission or matching binding only.

## Executable command contract

The recorded commands, run from the repository root, are:

```text
node plugins/pipeline-core/scripts/enforcement-conformance-cli.mjs emit --root . --runner codex --runner-version 0.153.4
node plugins/pipeline-core/scripts/enforcement-conformance-cli.mjs check --root . --runner codex --runner-version 0.153.4 --record evidence/a1-offline-candidate.log
```

Emit writes JSON to stdout. The historical candidate log was persisted using
`capture-evidence.mjs` under the resolved installed plugin root, with
`--out evidence/a1-offline-candidate.log --label a1-offline-candidate --`
followed by the emit command above. That helper is not in repository source.
Check accepts either raw record JSON or an exit-0 capture envelope containing
the JSON; no separate raw JSON file is claimed here. For a new checkpoint,
measure the actual runner version and capture emit/check to fresh paths,
passing the fresh emitted record to `--record`. Preserve these historical logs
and keep HEAD and the implementation sources unchanged between emit and check.

## Remaining work

Native runner bridges and live measurements remain pending. The later PO TP-3
act must register both the suite and its derived capability surface together;
[registration preparation](a1-registration-preparation.md) is still preparation
only. Full Verify, independent T1 Critic review, and PO acceptance remain open.
The TP-4 `hooks.json` courtesy comment replacement remains a separate PO act;
it is non-load-bearing. Offline CLI evidence does not complete those duties.
