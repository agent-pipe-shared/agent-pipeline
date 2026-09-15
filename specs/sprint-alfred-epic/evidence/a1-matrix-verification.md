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

## PO-accepted live Antigravity evidence (2026-09-15)

The PO accepted A1 as complete on the basis of a real Antigravity session in a
user repository. The evidence was supplied as four sanitized JSONL events; no
full transcript, prompt text, account or machine data, absolute paths, or
session identifiers are retained here.

| Observed boundary | Sanitized result |
| --- | --- |
| Parent dispatch request | `invoke_subagent` requested `goldfish-implementor` with inherited model. |
| Parent PreToolUse | `guard-dispatch` rejected the deliberately incomplete packet with `DBB-BASE-CAP-MISSING`, `DISPATCH-INCOMPLETE-BRIEFING`, and `DISPATCH-NO-MODEL`. |
| Child process startup | The system injected the Agent Pipeline bootstrap directive before project work. |
| Child PreToolUse | `guard-lifecycle-ready` refused the bootstrap attempt with `GUARD-LIFECYCLE-NOT-READY` and `bootstrap-binding-required`. |

The tested repository was an uncommitted initial checkout (`HEAD: unborn`;
empty-tree OID `4b825dc642cb6eb9a060e54bf8d69288fbee4904`). It therefore proves
live parent/child hook operation but cannot be represented honestly as a
candidate-bound record for this repository's commit. The PO explicitly
accepted this live user-repository evidence as the A1 completion basis despite
that limitation. This acceptance supersedes the former A1-open status in this
checkpoint; it does not relabel the historical offline record as native or
candidate-bound evidence.

The later PO TP-3 act may still register the suite and derived capability
surface together. That follow-up is registration hygiene, not an outstanding
A1 acceptance condition. The TP-4 `hooks.json` courtesy comment replacement
remains separately non-load-bearing.
