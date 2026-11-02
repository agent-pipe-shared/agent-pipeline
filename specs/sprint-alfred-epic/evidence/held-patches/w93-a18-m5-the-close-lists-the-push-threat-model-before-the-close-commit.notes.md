# w93 — the close drive lists `materialize-push-threat-model` before the Close commit (candidate 18, A18-M5)

Applies on top of w79 (base: the applied chain at a4f1afb604d8e534170ca189c84f8a6ffe38300e, which is the repository state plus w79). The patch is the delta from that base, so it does NOT apply to the real checkout until w79 is applied first. Criterion binding: AC-264 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/close-chain-guide.mjs`: `describeCloseActions(phase, { root, lifecycle, pushThreatModel })` takes an optional `{ required, present }`. When `required` is true and `present` is not, the list carries one `agent` action `materialize-push-threat-model` (command `node <plugin-root>/scripts/pipeline-state.mjs materialize-push-threat-model`, the argv shape push-prepare and pipeline-state already print, no flags) placed after `tracked-close-finalized` and immediately before `candidate-frozen`, i.e. before the commit that the freeze follows. It carries `commitWith: "project/push-threat-model.md"`. It is omitted when the file exists, when the gate does not require approval, and once the phase is already `candidate-frozen` or later. Exports `PUSH_THREAT_MODEL_FILE` and `pushThreatModelDue`.
- `scripts/close-coordinator.mjs`: `drive` (and `--dry-run`) reads the state with `gateConfig(loadManifestSafe(root), "push")?.approval === "required"` (the reader push-prepare uses) and a plain existence check of `project/push-threat-model.md`. It is read-only: `drive` materializes nothing, adds no PO action and changes no refusal code.
- `skills/close-feature/SKILL.md`, Step 3: two sentences saying the threat model is committed together with the close artefacts in the one Close commit and that `drive` lists the action with `commitWith`.

## Checks

- `close-chain-guide.test.mjs`: 8 of 8 (the new listed-before-commit case was RED first on the missing action; the absent-when case passes by construction before and after).
- `close-coordinator.test.mjs`: 49 of 49, including a new process case (gate unconfigured: absent; gate `approval: required` and file missing: listed in `drive` and `--dry-run` before `candidate-frozen`, nothing written; file present: absent). That process case was written together with the implementation, not run RED first.
- No existing pin moved or was weakened. Both new cases sit in already registered test files.

## Not changed / not proven

- `push-prepare.mjs` and `pipeline-state.mjs` are untouched. `checkPushThreatModel` checks existence only (no currency check), so "current" here means the same: currency is not checked.
- If no manifest loads (absent or invalid), the push gate counts as not requiring approval and nothing is listed.
- The action is advisory: nothing enforces that the file is in the Close commit; `prepare-push-subject` still refuses afterwards if it is not.
- The full Verify run was not made.
