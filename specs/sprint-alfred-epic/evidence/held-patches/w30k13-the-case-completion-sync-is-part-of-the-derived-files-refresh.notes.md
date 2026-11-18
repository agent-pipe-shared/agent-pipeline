# w30k13 — the case-completion augmentation sync is part of the derived-files refresh (candidate 30k, C30K-K13)

Applies AFTER the integrated 30j tree (every 30j lane applied): it is a delta on that state and does not apply to the real checkout before the 30j lanes. Order: 30i tree, 30j lanes, K13.

## What it changes

- `scripts/refresh-derived-files.mjs`: a new step, `case-completion-augmentations`, spawns the root's own `harness/scripts/check-verify-case-completion.mjs --sync-augmentations --root <root> --since <baseline> [--check]`. `<baseline>` is the commit the inventory `sourceBaseline` names (the last point the derived files were refreshed; nothing new is stored), read before the inventory step. The step runs BEFORE the inventory step: when it fails (FAILED, exit 2) the inventory baseline is NOT moved (`inventory-baseline: SKIPPED`), otherwise the next run would select no suite and forget the failure. A baseline commit that does not resolve is the exception (the inventory step moves it: that is the way out, not a deadlock). A root without the checker or the augmentation file reports `current`.
- `harness/scripts/check-verify-case-completion.mjs`: new export `syncVerifyCaseCompletionAugmentations` and the CLI mode `--sync-augmentations [--check] --since <ref> [--root <dir>]`. It selects the registered suites that have a policy and whose test file differs between `<since>` and the working tree, runs each the Full Verify way (plain `node <file>`, descriptor 3 a file in a private temp directory outside the root), reads the `DECLARED` ids and extends the row. All or nothing: any problem writes nothing. The composed result is checked with `applyVerifyCaseCompletionAugmentations` before the write.
- `harness/scripts/verify-case-completion-augmentation.mjs`: new export `growAugmentationRow`, the one growth step. It reuses `isStrictMonotoneExtension` and `policySha256`, so what is written is exactly what the checker accepts. A suite with only a source policy gets ONE new row bound to `verifyCaseCompletionPolicySha256(<source policy>)`; an id set that is not a strict ordered superset (a dropped id, a smaller `maxBytes`) is `not-extension` and written nowhere.
- `docs/operating-tools.md`: one sentence in the existing refresh row names the one-command usage.
- `scripts/refresh-derived-files.test.mjs`: cases RDF09 to RDF18 (a real fixture with the real checker, augmentation module and completion helper; suites are real `registerTestCaseCompletion` files; one suite has its policy inline in `verify.mjs`). RDF01 to RDF08 are unchanged and green.

Journey coverage for AC-112 (all covered by the fixture runs): suite grows by one id, new row (RDF09); second run after the refresh (RDF10); `--check` (RDF11); existing row extended in place (RDF12); dropped id (RDF13); suite that cannot run (RDF14); a second run after either failure still fails and the baseline did not move (RDF17); inline policy (RDF18); root without the files (RDF15); unresolvable baseline (RDF16). Not covered: a reload in the middle of the write (the file is written once, after every suite ran), a concurrent run.

## Why

Plan `duplicated-state-and-rules-count-2026-11-18.md`, finding K1-01, stage 4: a developer had to know a second command (`cc-sync`) to write the augmentation rows after a suite declares one more case id. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## Test first

RED before any production edit: `node scratch/agent-out/test-in.mjs scratch/agent-out/c30k/k13 scripts/refresh-derived-files.test.mjs` exited 1 with 8 pass (RDF01-08) and 8 fail (RDF09-16). GREEN after: 16 of 16, exit 0. No machine-written evidence file exists for the RED run (it would lie outside the three-file write scope); the record is the command, exit code and counts. RDF17 (baseline kept after a failure) and RDF18 (inline policy) were added afterwards, after a review of the step order; RDF17 was shown red by a temporary mutation of the guard (`inventory-baseline` refreshed instead of SKIPPED), then restored and green. RDF18 is coverage of an entry path, green on first run.

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- `scripts/refresh-derived-files.test.mjs`: 18 of 18.
- `harness/scripts/check-verify-case-completion.mjs` run plain on the clone tree: `Verify case-completion registry valid: 393 entries, 368 conservatively classified suites.`
- `harness/scripts/verify-case-completion-augmentation.test.mjs`: 19 of 19 (not edited, no VAC case added).
- `harness/scripts/check-verify-case-completion.test.mjs`: 31 of 32. The red case VCR01 (pinned assertion counts of six suites such as `critic-course-admission`) is red identically on the integrated 30j clone without this change; none of its files is touched here. Pre-existing, not investigated.
- The sync CLI run with `--check --since HEAD` on the real 47-row augmentation file: `current` (the file is canonical, every registration parses).
- Held-patch check test: 2 of 2 (patch non-empty, touches only the briefed files).

## Decision for the Coordinator

- An existing row (a suite already grown by an earlier candidate) is extended IN PLACE, exactly as `cc-sync` does: `previousPolicySha256` and `file` stay, the ids are a strict superset of the row's current ids. Without this the one command would not be enough for most suites. If "no existing row changes" is meant to forbid even that, `growAugmentationRow` can return a printed `cc-sync` command for that case instead: say so and it is a one-branch change.

- All or nothing: one red or non-extending changed suite makes the whole refresh exit 2 and writes no augmentation row, where `cc-sync` skipped that suite and wrote the rest. Chosen so a refused operation leaves no state.
- New CLI surface on the checker: `--sync-augmentations`, with `--since <ref>`, `--check`, `--root <dir>`. The plain checker CLI is unchanged.

## Open items for the Coordinator (files outside the write list)

- `scripts/export-held-chain.mjs` line 68 stages only `docs plugins/pipeline-core backlog` after the refresh, so `harness/config/verify-case-completion-augmentations.v1.json` would stay uncommitted in a generated apply script; add `harness/config` there. The script runs under `set -e`, so a failed step stops the apply loudly. In that flow the selection spans the whole chain (every registered suite with a policy whose test file changed since the baseline is run).
- The doc contract for the other callers (`apply-candidate*.mjs`, held-patch notes) was only searched, not read.

## Not changed

- No stored status, record shape, digest or key byte; no gate, signature, approval, Critic evidence or security-scan change; `previousPolicySha256` is never re-bound; the source policy (`verify-suites.json`, `verify.mjs`) is never edited; nothing is deleted.
- `scripts/clone-slice/cc-sync.mjs` (outside the write list) still holds its own copy of the logic and its `CC_RESET` checkout; it stays as the clone-slice route tool. Reported, not edited.
- The two harness config JSON files and `verify-suites.json` are untouched (protected lists).
- The plan cites `check-verify-case-completion.mjs:343-357` as the matcher of ids "inside the suite's own test file": that code parses the policy of the Verify registration, not the test file. The declared ids only exist at run time, so the step runs the suites (bounded to those changed since the baseline).

## Not proven

- `scripts/refresh-derived-files.test.mjs` is not registered in the Verify suite list (it was not before); registering it is a protected-list operator step. The new cases therefore run only when that file is run.
- A real-tree run of the step with changed suites was not made (it executes those suites); only the fixture and the `--since HEAD` read of the real file.
- Integrated Verify, Critic review and PO acceptance are pending (Coordinator).
