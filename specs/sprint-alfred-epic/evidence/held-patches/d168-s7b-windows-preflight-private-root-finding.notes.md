# D168 S7b held patch: Windows preflight finds an inherited-grant private-state root

Patch: `d168-s7b-windows-preflight-private-root-finding.patch` (git diff --binary against candidate dd1b149b0, applies cleanly to a fresh shared clone: `git apply --check` exit 0).
Backlog item: `backlog/items/2026-10-26-windows-private-state-check-counts-acls-inherited-from-above-the-repository.md`, point 1.

## Cause
`assessWindowsAuthorityReadiness` never looked at the `<project>/project` private-state root, so a root whose ACL carries grants inherited from above the repository passed preflight and failed later. The plugin writes no ACL; the fix only observes and names one operator instruction.

## Changed lines (three files; the patch touches `scripts/pipeline-start-preflight.test.mjs` too)
- `plugins/pipeline-core/lib/windows-authority-readiness.mjs` (only production edit):
  - import `assessWindowsPrivateRoot` from `./windows-private-state.mjs`;
  - new injectable option `assessPrivateRoot = assessWindowsPrivateRoot`;
  - after the existing loop, `stateRoot = win32.join(projectRoot, 'project')`; if it exists, assess inside try/catch. `secure` adds no cause; `insecure` appends cause `private-state` / `WIN-AUTH-PRIVATE-ROOT` with an operator-review nextAction (mutation false) and a repairPreview of two `icacls <stateRoot> /inheritance:r /grant:r <current user>:(OI)(CI)F` commands (powershell and cmd; empty `commands` if the path has a double quote); any other verdict or a throw appends `WIN-AUTH-OBSERVATION-UNAVAILABLE` with the generic guidance and no command.
- `plugins/pipeline-core/lib/windows-authority-readiness.test.mjs`: import, a secure `assessPrivateRoot` fixture on the shared roots object, new cases WAR010-WAR014 (D168-S7b).
- `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`: new case "D168-S7b private-state root cause with repairPreview reaches nextAction.causes unchanged" (built with the real assessor).

## Counts
- RED (tests only): windows-authority-readiness exit 1, pass 9 fail 5 (WAR010-WAR014); pipeline-start-preflight exit 1, pass 96 fail 2 (new case plus "trusted Windows custody leaves bootstrap ready").
- GREEN (with change): windows-authority-readiness exit 0, pass 14 fail 0; pipeline-start-preflight exit 1, pass 97 fail 1; windows-private-state.test.mjs exit 0, pass 20; guard-maintenance-window-kernel-closure exit 0, 11 passed.
- Remaining red: only "trusted Windows custody leaves bootstrap ready" (returns `plugin-refresh-required` instead of `ready`). Pristine baseline: a second shared clone at HEAD dd1b149b0 without the patch gives pipeline-start-preflight exit 1, pass 96 fail 1, the same case red. It is red at HEAD too, so pre-existing and environmental, not caused by this patch.

## Documentation to change later
`skills/pipeline-start/references/onboarding-recovery.md` (Windows section) and `skills/pipeline-start/SKILL.md`: name `WIN-AUTH-PRIVATE-ROOT` and the icacls instruction.

## Existing `<git-dir>/agent-pipeline` probe
Whether `inspectWindowsOwnedAuthorityPath` also flags inherited foreign grants: not checked.

## Open native-Windows questions
- Behaviour of `icacls /inheritance:r` on a folder that already has children (are existing children re-secured, is `/T` needed).
- `pipeline-state.json` is re-created by rename under the hardened folder: does the new file inherit the narrow rights.
No native Windows run was possible here; both are unverified.

## Proposed commit message
`fix(windows): find an inherited-grant private-state root at preflight and name the one icacls instruction (D168 S7b)`

## Operator flow
Apply the diff (`git apply`), `git add -u` with a path limit to the three files, commit with `--no-verify`, stamp, install.

## Review
All touched files are custody paths; an independent Critic review stays a parent-owned batch gate. Full Verify and PO acceptance are pending.
