# Codex advisory V3 route evidence

## Scope and authority

The Codex advisory adapter resolves its model and effort from the validated,
candidate-bound V3 `advisory.codex` duty. The current cell selects
`gpt-6-astra` at `max` and has no fallback array. The model-free host policy
therefore permits one bounded attempt only; it does not select a model or
synthesize a fallback.

The generic sandbox request and execution receipts remain `{ runner, model }`.
The duty-specific advisory binding carries model and effort and requires the
selected App Server response identity to match both values.

## Verification

On 2026-09-07, the following host-authorized WSL command exited 0 and wrote
machine evidence at `evidence/NVA-B-ADVISORY-ROUTING-2-verify.json`:

```text
node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/NVA-B-ADVISORY-ROUTING-2-verify.json --label NVA-B-ADVISORY-ROUTING-2 -- node --test plugins/pipeline-core/scripts/codex-host-advisor-route.test.mjs plugins/pipeline-core/lib/advisory-lifecycle-v2.test.mjs plugins/pipeline-core/skills/advisor-consult/advisor-consult-v3.test.mjs plugins/pipeline-core/scripts/advisory-host-bridge.test.mjs plugins/pipeline-core/scripts/codex-advisory-app-server.test.mjs
```

It reported 33 passing tests. It covers the model-free one-attempt policy, the
empty Codex fallback disposition, demand and evidence rejections, candidate
route propagation into the selected transport, dynamic response-identity
rejection, and native App Server failure paths.

The required consumer-safe-path check also exited 0 and wrote
`evidence/NVA-B-ADVISORY-ROUTING-2-consumer-safe-paths.json`:

```text
node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/NVA-B-ADVISORY-ROUTING-2-consumer-safe-paths.json --label NVA-B-ADVISORY-ROUTING-2-consumer-safe-paths -- node --test harness/scripts/check-consumer-safe-paths.test.mjs
```

## Limits

These are local test results. No live provider or model call, installed-plugin
edit, full Verify, independent Critic review, commit, or publication occurred.

## History correction

NVA-B-ADVISORY-ROUTING-1 implemented and tested the candidate-bound adapter
route but omitted this tracked evidence. Its follow-up description incorrectly
treated `codex-host-advisor-route.mjs` as outside that dispatch's listed
ownership. That file was listed in the original scope. This package completes
the compatibility-policy and lifecycle cleanup without erasing the earlier
record or its machine-written verification artifact.
