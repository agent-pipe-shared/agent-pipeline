# w30k20 — the close stop CLOSE-CRITIC-ADDENDA-WRITTEN names every written addendum path, says whether git status shows it, and gives the one staging command (candidate 30k, residual of the cancelled slice J15, C30-24 item 7)

Applies AFTER the integrated 30j tree (the 30i chain, every 30j lane and the 30k wave 1 lanes): the patch is the delta `525fab15d..HEAD` of a clone that starts there. It applies cleanly to that tree (`apply --check` exit 0); against the repository before that chain it is expected not to apply. Protected plugin source: the PO applies the chain (the plugin-source commit route). Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What it changes

- `plugins/pipeline-core/scripts/close-coordinator.mjs`: when the close writes Critic addenda it now runs `git check-ignore -- <written paths>` (read-only, exit 1 = none ignored is accepted) and derives, per path, whether `git status` shows it. The message names every written path with "(ignored: git status does not show it)" or "(not ignored: git status shows it)". The staging command is `git add -f -- <paths>` only when at least one path is ignored, otherwise the plain `git add -- <paths>` (before: always forced). One command, exactly the written paths.
- `pipeline.close-critic-addenda-written.v1` and the `critic-addenda` verb object keep their key sets; the facts live in the message / `commitInstruction` text only. Nothing is stored; the ignore status is derived at the moment of the stop.
- Pin `close-coordinator-refuses-a-required-critic-without-evidence.test.mjs`: the helper `assertWrittenAndUncommitted` restated (QG-04) — in its fixture no written path is ignored, so the expected command is the plain `git add --` with the per-path "not ignored" wording (it asserted the old unconditional `git add -f`). New case (k20): one addendum path excluded via `.git/info/exclude` gives the forced command, the "ignored" wording for that path, the "not ignored" wording for a visible one, nothing staged, HEAD unmoved, object keys unchanged.

## Why

The written files live under an evidence directory that a project's ignore rules can hide from `git status`; the agent otherwise cannot see what the close wrote or why a plain `git add` would silently stage nothing.

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- Deviation: the production edit was made before the new case was run, so there is no recorded RED run for (k20); the case asserts behaviour (forced command only for an ignored path, per-path wording) that the previous code could not produce (it always printed `git add -f` and no per-path wording).
- Green: `close-coordinator-refuses-a-required-critic-without-evidence.test.mjs` 37 of 37 (exit 0, final code; includes the restated helper, (k20) and (k20b) which drives the `critic-addenda` verb object and checks its keys are exactly schema, status, commitPaths, subject, message). The check test `w30k20-*.check.test.mjs` 2 of 2.
- `close-coordinator.test.mjs` is untouched; run alone in the clone: 58 of 58, exit 0.
- If `git check-ignore` itself fails, every path is treated as ignored (forced command), so the written-paths stop is never hidden by a CLOSE-GIT error.

## Not changed / not proven

- The close coordinator's `git()` disables global git config and sets no HOME, so a user-global ignore file is not consulted: such a path is reported as visible and gets the plain command.
- Other `git add -f` texts outside the write list were left as they are: `session-critic-finalizer.mjs` (lineage commit instruction), `feature-package-registration.mjs`, `finish-feature.mjs`; they are not part of this stop.

- The addendum path, every `ADDENDUM_PATH` pin, gates, evidence and record shapes are untouched. `close-coordinator.test.mjs` needed no change.
- A mixed set (some ignored, some visible) gets the forced command for all paths (force is harmless on a visible path); the message still names each one.
- Not run: Full Verify, the Critic.
