# D181b held patch: heal retires legacy finalizer stop-failure records and move-aside says what it cannot clear

State: COMPLETE as a held patch, tested in a scratch clone only. Not applied to the repository. Stacks on the D180b patch
(`d180b-stop-failure-diagnostic-lives-outside-the-authority-namespace.patch`); it applies only AFTER D180b (baseline = D180b applied).
The patch touches only `plugins/pipeline-core/scripts/session-authority-repair.mjs` and its `.test.mjs`.

## Cause
A stop-failure record written by the finalizer before D180b sits in `<git common dir>/agent-pipeline/run/native-goldfish-host-commit/`
as `stop-failure-<32 hex>.json` (schema `pipeline.native-goldfish-host-stop-failure.v1`). The native Goldfish inventory refuses it
(`native-managed-unknown-native-entry`), blocking dispatch and heal. `move-aside` never said it does not clear such a record.

## Change
- `retireLegacyStopFailures(repository, asideDir)`: scans the old directory. Kept with a reason: symlink, malformed JSON, array JSON,
  other schema, a record whose dispatch has an unsettled pending state, and every record when a pending file is unreadable/malformed.
  The rest are renamed (never deleted) into `session-authority-abandoned/<timestamp>-<8hex>-stop-failure/`.
- Called in the heal branch after the cleanup-lock retirement; a fault refuses `SAR-UNAVAILABLE`.
- `retiredStopFailures` (`[{name, dispatchId, code, observedAt}]`) and `keptStopFailures` are spread into the SAR-HEAL-INCOMPLETE
  refusal, the catch refusal and the final healed result (omitted when empty).
- Sentence "move-aside does not clear a finalizer stop-failure record (heal clears it); the registry is retained aside and restarts fresh"
  added to the inspect move-aside `next.why` and to the move-aside usage refusal.

## Cases (session-authority-repair.test.mjs)
- SAR17 retire a valid legacy record aside, registry readable, second heal empty: RED before, GREEN after
- SAR18 unsettled pending state keeps the record, listed with reason: RED, GREEN
- SAR19 other schema / array / symlink never moved, listed kept: RED, GREEN
- SAR20 record in the new diagnostics directory untouched: GREEN before and after (pin)
- SAR21 inspect next text for move-aside contains "does not clear a finalizer stop-failure record": RED, GREEN
RED measured earlier (4 failing: SAR17, SAR18, SAR19, SAR21; SAR20 passed), exit 1, log `scratch/agent-out/wd181b/red.session-authority-repair.test.mjs.log`.

## Whole-file comparison (clone vs clone2, same D180b baseline commit)
- Baseline (clone2, SAR01-SAR16): tests 16, pass 16, fail 0, exit 0. Failing-name set: empty.
- Patched (clone, SAR01-SAR21): tests 21, pass 21, fail 0, exit 0. Failing-name set: empty.
- Sets identical (both empty); the only difference is the five new cases.
- Apply check: `git apply --check` of the patch in clone2 (at the D180b baseline commit): exit 0.

## Open assumption
An unsettled pending state means a `pending-*.json` with `binding.dispatchId` equal to the record's dispatch and no
`authority-terminal-<sha256>` sibling. A differing digest keeps a settled dispatch record (conservative). That the sha is the file-bytes
digest is unconfirmed against the producer.

## Proposed commit message
fix(authority): heal retires legacy finalizer stop-failure records and move-aside says what it cannot clear (D181b)

## Operator flow
Apply the D180b patch first, then this one: apply the diff, `git add -u` with a path limit, `--no-verify` commit, stamp, install.
Native Goldfish authority is a gate component, so an independent Critic review stays a parent-owned batch gate.

## Not done
Checkpoint outcome of the budget item; the unindexed-registry-entry finding of 2026-10-27 is unexplained and heal does not clear it;
no consumer-run proof; Full Verify, batch Critic and PO acceptance pending.
