# Closure evidence: `guard-lifecycle-ready` PO signing command derivation

- **Task ID:** `ALF-B2-5-SIGNING-DERIVATION`
- **Backlog item:** `backlog/items/2026-08-07-lifecycle-guard-does-not-know-the-human-signing-commands.md`
- **Candidate commit:** `e87aac79b4f01d6084aa58fcdc75d439bb771da1`
- **Ruleset SHA:** `0.6.2+antigravity.20260913103423.c1e799c / 3b369293d1888c919c1240ffc996d47c85ba495589d54a2cf1d7234421b780f0`

## Summary

Previously, `guard-lifecycle-ready.mjs` maintained a hardcoded array in `isHumanPoSigningCommand` that had drifted from `po-human-approval.mjs`. Sprint Alfred Roadmap item B2-5 resolves this by deriving the recognized human PO signing commands directly from `po-human-approval.mjs`:

1. `plugins/pipeline-core/scripts/po-human-approval.mjs`:
   Exports `HUMAN_SIGNING_COMMANDS` as an immutable frozen array containing all human signing commands:
   ```javascript
   export const HUMAN_SIGNING_COMMANDS = Object.freeze([
     "setup",
     "approve",
     "approve-all",
     "approve-critical",
     "authorize-critical",
     "sign-intent",
     "approve-fork-disposition",
   ]);
   ```

2. `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`:
   Imports `HUMAN_SIGNING_COMMANDS` from `../scripts/po-human-approval.mjs` and exports `isHumanPoSigningCommand`:
   ```javascript
   export function isHumanPoSigningCommand(command, root) {
     const args = poApprovalArgs(command, root, PO_HUMAN_APPROVAL_SCRIPT);
     return args !== null && HUMAN_SIGNING_COMMANDS.includes(args[0]);
   }
   ```

3. `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`:
   Imports `HUMAN_SIGNING_COMMANDS` and `isHumanPoSigningCommand` and adds a dedicated unit test asserting:
   - `isHumanPoSigningCommand` recognizes every command in `HUMAN_SIGNING_COMMANDS` (`setup`, `approve`, `approve-all`, `approve-critical`, `authorize-critical`, `sign-intent`, `approve-fork-disposition`).
   - `isHumanPoSigningCommand` rejects all non-signing subcommands (`prepare`, `prepare-all`, `verify`, `verify-all`, `prepare-critical`, `verify-critical`, `prepare-fork-disposition`, `verify-fork-disposition`).

## Verification

- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`: 258/258 passed (including dedicated `isHumanPoSigningCommand recognizes every HUMAN_SIGNING_COMMANDS command and rejects non-signing commands` test).
- `node --test plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs`: passed 6/6 tests, confirming transitive closure of `NEVER_LIFTABLE_KERNEL_PATHS` under first-party relative imports.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs`: passed 9/9 tests.
- `git diff --check`: clean, 0 whitespace or formatting errors.
