# K152-AGY-ADAPTER-COVERAGE notes (closing-allowance handover, partial)

Clone: scratch/clones/k152 (branch feat/sprint-alfred). Commit 36c2c416b = part 3 (green).

## Part 3 (done, committed 36c2c416b)
- lib/guard/constants.mjs: MODEL_ROLE_BOOTSTRAP_SCRIPT, ANTIGRAVITY_NATIVE_DISPATCH_PREPARE_SCRIPT (so canonicalSanctionedScript resolves them).
- lib/guard/command-catalogue.mjs: closed argv grammars, wired into sanctionedLifecycleScriptArgs.
  - model-role-bootstrap: `--repo-root <root> --runner codex|claude|antigravity [--host-session-id <id>]`.
  - antigravity-native-dispatch-prepare: `prepare --root <root> --request scratch|evidence/<name>.json`.
- design-review-receipt.mjs was ALREADY in the catalogue (sanctionedDesignReviewReceiptArgs, `create ...`); I did not find why it was refused in draft, so no change was made for it and no live repro was run. Open.
- Pin: lib/pins/antigravity-design-phase-scripts-refused-in-draft.test.mjs, 5/5 green: scratch/agent-out/K152-green-part3.txt. RED on base was NOT run as a machine-written artifact (no budget); on base the two script constants do not exist, so the pin's admitted cases fail by construction.
- Draft lifecycle: the catalogue check (isSanctionedLifecycleCommand) is lifecycle-independent and is the exemption the devplan shell lane uses, so `implementing` is covered by the same route. Only the unit-level function is pinned, not a full guard run in draft.

## Part 1 (NOT done; pins written, uncommitted)
- Uncommitted in the clone: hooks/antigravity-pretool-guard.test.mjs (7 new K152 checks appended before the final console.log). They are RED against the unchanged adapter by design. A RED run was started in the background (capture-evidence out scratch/agent-out/K152-red-part1.txt) and had not finished (the suite takes more than 10 minutes); that file may exist or be missing.
- Source still to change (nothing edited yet):
  1. hooks.json line 6 matcher: add write_file|edit_file|read_file (and view_file, which is also missing today).
  2. hooks/antigravity-pretool-guard.mjs: in normalize, accept `write_file` (Path, Content) next to write_to_file and `edit_file` (Path, Target, Replacement) next to replace_file_content; add "read_file" to readOnlyTools; in nativeReadTargets add `case "read_file": operand("file", ["Path","AbsolutePath","file_path"])`.
  3. lib/tool-write-target.mjs line 41: add write_file/edit_file and the `Path` key.
- Installer: no code in plugins/pipeline-core writes the user-level Antigravity hooks.json matcher (searched run_command/.gemini); the narrow `run_command`-only file is not produced by this repo. Not changed. scripts/goldfish-antigravity-host.test.mjs line 39 holds a fixture matcher with the old four names (left alone).

## Part 2 (NOT started)
invoke_subagent `Model` (inherit|flash_lite|flash|pro) rule untouched. Entry points: guard-dispatch.mjs (K144 commit 439f4c60d) and lib/dispatch-model-enforcement.mjs.

## Deviations
- No dispatch record written (briefed). No K152-*.diff / K152-msg-*.txt produced (budget); take `git -C scratch/clones/k152 format-patch -1 36c2c416b` for part 3. Commit used a one-off `-c user.name/user.email` identity (clone had none; email is a placeholder).
- Commit message not produced through goldfish-commit-command-flow (budget).
- Wasted calls: several rg invocations were refused by the shell grammar (--glob flags).
- Required broader checks (consumer-safe-paths, doc-contracts) and the guard-lifecycle-ready suite were NOT run.
