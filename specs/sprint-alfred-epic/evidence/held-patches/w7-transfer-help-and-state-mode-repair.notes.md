# Transfer: every state verb answers --help, and the State-file mode refusal names its repair (Elephant small item, 2026-10-30)

Held patch `w7-transfer-help-and-state-mode-repair.patch`, built by the Elephant in a scratch clone at 22345a04d (candidate 6 applied).
Nothing applied. Item: `backlog/items/2026-10-26-transfer-invalidates-plan-approval.md`, acceptance "--help on any lifecycle verb prints
help and never executes" and "a transferred clone's State-file mode is restored by onboarding or named with its repair before the first
dispatch".

## Behaviour

- `pipeline-state.mjs <command> --help` (or `-h`, anywhere after the command) prints that command's usage line and the command list,
  exits 0 and runs nothing, for every command in `PIPELINE_STATE_COMMANDS` plus `configure-verify` (a command the list does not name).
  `rebind-approval` keeps its own usage text from the earlier patch. Before, a lifecycle verb given `--help` executed.
- `staleApprovalRepair('CVCT-FILE')` (the repair of the item-course dispatch refusal) names the State-file mode repair of a transferred
  clone (`chmod 600 .claude/pipeline-state.json` on POSIX, an owner-only ACL on Windows) instead of the generic "read inspect".
  The mode is named, not restored automatically: onboarding does not change the mode of a file it did not write.

## Evidence (scratch/agent-out/w7allhelp logs)

- New case R7-5h in `scripts/rebind-approval.test.mjs`: eleven lifecycle verbs with `--help` and `-h`, and `--help` after a flag, exit 0
  with the verb's usage; State bytes, private records and worktree unchanged. Suite 11 pass, 1 todo (the known inspect todo).
- New case SAR04 in `lib/pins/stale-approval-repair-names-rebind-approval.test.mjs`; pin 6/6.
- Revert proof: with both production files reverted, R7-5h and SAR04 fail; restored byte-equal.
- Clone and baseline both green: pipeline-state.test.mjs, cli-help 8/8, po-only-discard-boundary 8/8, pipeline-state-inspect 26/26,
  g23-read-help 3/3; native-goldfish-host-state 62/62 in the clone.
- Apply-check on the plain candidate exit 0.

## Not verified

The bootstrap offering rebind-approval after a transfer, the local-readiness split and the R75_INSPECT trigger state (PO decision),
a cross-machine run, Windows ACL wording live, Full Verify, Critic, PO acceptance.
