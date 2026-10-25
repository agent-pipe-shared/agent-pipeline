# Held patch: ref-updating Git is a write and is refused before bootstrap

Outcome `pipeline.greenfield.r2.ref-updating-git-runs-before-bootstrap` (PO decision Q18, AC-123, related AC-181). Slice W3-R2-PREREADY-REF-GIT (C1 + C2). Candidate `a574a7c207e4e905478ef36aa45703c679662f64`.

Patch: `r2-preready-ref-git.patch` (3 files: one kernel file, two test suites). Protected/NEVER_LIFTABLE files were edited only as scratch copies; the repository files are unchanged.

## Preimage SHA-256 at the candidate

- `plugins/pipeline-core/lib/guard/shell-grammar.mjs` 9e0b6f85b9a363cee66c3c34080a5f3bbeb5de61f2cc5475f38e14bc19908def
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` 71fa86793afaacaf3d9b3f66630b441fc24c180edb4dd5b52103a398c2b1a5cb
- `plugins/pipeline-core/lib/pins/read-only-guard-admits-execution-and-output-options.test.mjs` 1076d08dfd3bda9901a4aa63643f4ca7253fb9fa4ebf2679491c42010611004e

`git apply --check r2-preready-ref-git.patch` against the candidate working tree: exit 0.

## Change

`isReadOnlyGitSubcommand` no longer has a `fetch` branch, so `git fetch` (all spellings) is not a read-only Git command. `pull` and `remote update` were already outside the set (`remote` admits only bare/`-v`). Consequence: the pre-ready lane refuses them with `GUARD-LIFECYCLE-NOT-READY`; post-ready they follow the ordinary lifecycle gate path; local reads (status, log, show, diff, rev-parse, ls-files, ...) are untouched.

Tests: new case in `guard-lifecycle-ready.test.mjs` (pre-ready `git fetch`/`fetch origin`/`fetch origin main`/`fetch --all --prune`/`pull`/`pull origin main`/`remote update` refused with exit 2; `status`/`log`/`diff`/`rev-parse HEAD` admitted). Two existing cases that asserted fetch admission were flipped, each with a QG-04 comment tying the flip to AC-123 / Q18 (the criterion deliberately reclassifies fetch). The pin suite got the matching flip of its fetch admission example.

## Decision on the refusal wording (C2)

The case was first written expecting the refusal text to contain `pipeline-start`. The canonical non-ready refusal is `GUARD-LIFECYCLE-NOT-READY` with the typed recovery "Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction". The Coordinator decided to keep that single canonical recovery for every pre-ready write and not to fork a fetch-specific message or touch `lifecycle-gate.mjs`. Justification tied to the criterion: AC-123's intent is "refused before bootstrap with the typed recovery"; `pipeline-start` runs exactly that inspection, so the wording requirement is satisfied by the canonical recovery. The assertion was therefore changed from `/pipeline-start/` to `/project-onboarding-v3 inspection/` (the refusal code assertion and the exit code 2 assertion are unchanged; no strength was removed, the refusal is still required).

## Counts (captured with capture-evidence under scratch/agent-out/w2-preready-git/, not tracked)

- Lifecycle suite (`guard-lifecycle-ready.test.mjs`): RED before the change (new case failing against original copy, `ev-red-lifecycle.txt`); GREEN after: 395 tests, 392 pass, 0 fail (baseline 394 tests plus the one new case; pass count 391 -> 392 with the new case).
- Pin suite (`read-only-guard-admits-execution-and-output-options.test.mjs`): 75 tests, 74 pass, 0 fail (unchanged count; one case flipped).
- Host check `plugins/pipeline-core/scripts/rebind-approval.test.mjs` on the unmodified repository file: 10 tests, 9 pass, 0 fail, 1 pre-existing todo.

## Overlap with other held patches

- Shell-grammar hunk of this patch: lines 1400-1418 of the preimage only.
- `k96-read-credential-target-protected`: shell-grammar hunks at 6-13 and 1025-1047: no line overlap. `k97-ap11-git-show-pipe-protected`: shell-grammar hunks at 9-16 and 424-431: no line overlap. `k75-classifier-*`: touch `protected-test-paths.mjs` and two other pin files only: no overlap.
- Mechanical check: for the `unprotected` variants of k96 and k97, applying them to the candidate preimages and then `git apply --check` of this patch: exit 0 both. The `protected` variants do not apply by themselves to candidate preimages restricted to my three files (their own hunks fail against the bare candidate copies; likely a base/ordering matter of that patch, not a conflict with this one); for them the verdict rests on the hunk-range comparison above. Apply order tolerance is by `git apply` offsets; expect the Coordinator's bundled ceremony to apply with offsets.

## Safety

Post-ready admission is unchanged by construction: the removed branch affected only the shared read-only classification, and post-ready fetch is governed by the ordinary lifecycle/write path (the pin and lifecycle suites, run whole, stay green). Local read-only Git remains admitted pre-ready (asserted in the new case). The change only narrows what is admitted pre-ready, so it cannot widen any lane.

## Proposed commit message

`fix(pipeline): refuse ref-updating git before a ready bootstrap`
