# Held patch: agents may rerun and watch a CI run (D230)

Built by the Elephant (PO exception for small fixes, held patch in a scratch clone, tree untouched) on `3ea8ca5ca`. Item
`backlog/items/2026-11-01-agents-cannot-rerun-or-watch-a-ci-run.md`, decision D230 option A.

## What changes

- `plugins/pipeline-core/lib/gh-cmd.mjs` (protected kernel path):
  - New result kind `ci-rerun` (`{ kind, action: "ci-rerun", runId, failedOnly }`) for exactly `gh run rerun <numeric id> [--failed]`
    (digits only, 1 to 20; one id; no other flag, no `--debug`, `--job`, `--repo`, no `--failed=value`).
  - `gh run watch <numeric id> [--exit-status] [--compact] [--interval|-i <digits>]` is read-only. `gh run view` and `gh run list` stay read-only
    (they moved from the generic table into `classifyRun`; accepted arguments are unchanged).
  - Every other `gh run` shape stays `DELIVERY-GH-UNCLASSIFIED` (`cancel`, `delete`, `download`, a rerun or watch without id, a non-numeric id,
    a second id, an unknown flag).
  - More than one rerun in one command: `DELIVERY-GH-UNCLASSIFIED`. A `GH_REPO=` / `GH_HOST=` assignment beside a rerun:
    `DELIVERY-UNSUPPORTED-CROSS-REPO`.
  - Severity order is now `refused > delivery > ci-rerun > read-only > none`.
- No guard changes: `guard-push.mjs`, the Codex and the Antigravity adapter act only on `kind === "refused"`, so the new kind passes all three.
  The host's own permission prompt for `gh` is unaffected.

## Evidence (targeted, in the scratch clone)

- `lib/gh-cmd.test.mjs`: 103 cases green (+38 new: rerun shapes, read-only shapes, 19 unclassified shapes, two reruns, cross-repo assignment,
  substitution and shell wrappers, severity order).
- `lib/pins/gh-delivery-classifier-is-not-wired.test.mjs`: 8 cases green (+1: the real `guard-push` exits 0 for rerun/watch/view and exits 2
  with `DELIVERY-GH-UNCLASSIFIED` for cancel, delete, a rerun with `--debug`, a rerun or watch without id).
- `harness/scripts/check-verify-case-completion.mjs` valid (388 entries); `check-verify-case-completion.test.mjs` 32/32.
- `git apply --check` on `3ea8ca5ca` passes.
- Not done: revert proof (the base behaviour is the consumer's own report, rerun and watch both refused `DELIVERY-GH-UNCLASSIFIED`),
  Full Verify, batch Critic, native Windows, a real `gh` call.

## Known residue (not widened by D230)

The marker rule of the module names `pr`, `api`, `release`, `repo` and `gist`. A `gh run` shape hidden behind an UNLISTED wrapper
(`winpty gh run cancel 1`, `env -S'gh run rerun 1'`) reads as `none`, as it did before for `gh run cancel`. Adding `run` to the marker would turn
every `git commit -m "... gh run ..."` into an unclassified refusal (the same accepted false positive that `gh pr create` text already causes),
so it is left for a PO decision; the test file pins the residue in a comment.

## Follow-ups

- Agents learn the allowed shapes only from this item and the refusal text; `templates/prompts/agent-obligations.md` could name them (a
  pinned template, so not touched here).
- `docs/push-release-flow.md` describes pushes only; a rerun is not a push, so no change there.
