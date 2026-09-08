# PO-authorized Critic pin transcription — 2026-09-08

## Authority and separation

The PO explicitly authorized action on the four enumerated substitutions on
2026-09-08, after the three concrete steps were presented: “okay ja gehen wir
direkt die 3 PO schritte an!”. This is action authorization for this frozen
inventory update, not an inference from an earlier review-launch approval.

The actor transcribing these bytes was separate from the authors of the
underlying Critic changes. This record makes no judgment about those changes,
the Critic transport, or Critic correctness.

## Frozen inventory data

The pre-transcription inventory SHA-256 was
`c5a4e05eb84bb42c50740431cd9e7e2a75fb9a675553c9a1ff44827f2178a5c9`.
The reviewed proposed bytes SHA-256 and final inventory SHA-256 are both
`938e5f78b0213ad4cf6e32ab0eb1e8d0e72b4bbc0868e9f80850c31a90df7076`.

Exactly these four `rawSha256` fields were transcribed:

- `plugins/pipeline-core/scripts/codex-critic-host-return.schema.json`
- `plugins/pipeline-core/scripts/codex-critic-host.mjs`
- `plugins/pipeline-core/scripts/codex-critic-receipt.schema.json`
- `plugins/pipeline-core/skills/critic-review/SKILL.md`

The nine protected source-file hashes and the complete four-field before/after
mapping are machine-recorded in
`scratch/NVA-B-CRITIC-PINS-PO-1/frozen-inventory-after.json`.

## Verification evidence

| Check | Result | Machine evidence |
| --- | --- | --- |
| `node --test plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` before transcription | expected RED, exit 1 | `scratch/NVA-B-CRITIC-PINS-PO-1/protected-preimage-red.json` |
| `node scratch/NVA-B-CRITIC-PINS-PO-1/check.mjs` after transcription | pass, exit 0 | `scratch/NVA-B-CRITIC-PINS-PO-1/frozen-inventory-after.json` |
| `node --test plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` after transcription | pass, exit 0 | `scratch/NVA-B-CRITIC-PINS-PO-1/protected-preimage-green.json` |
| `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | pass, exit 0 | `scratch/NVA-B-CRITIC-PINS-PO-1/consumer-safe-paths.json` |

No Critic source, schema, test, skill, guard, policy, routing, provider,
receipt, signature, installation, or global-state change was made. No
independent Critic pass or effective-model identity is asserted here.
