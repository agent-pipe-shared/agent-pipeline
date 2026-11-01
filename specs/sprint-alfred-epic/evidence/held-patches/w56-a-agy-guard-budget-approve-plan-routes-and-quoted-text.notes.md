# w56 — the AGY guard stays inside the host's hook timeout, admits the proof-bearing approve-plan routes and ignores quoted `node -e` text (candidate 17, slice 10)

Applies on the nine-patch chain (w48 to w55); touches only `hooks/antigravity-pretool-guard.mjs` and its test. Slice 13 and slice 11 touch other hunks.

Three adapter defects found while running the guard on Antigravity (AGY):

1. **Budget.** `HOOK_BUDGET_MS` was 42 s while the AGY hook manifest (`hooks.json`) gives the hook 30 s: the host could kill the hook before it produced a typed denial.
   The lifecycle readback share was a fixed 4 s, but a cold readback takes about 10 s, which ended in ETIMEDOUT and a fail-closed denial for an ordinary command.
2. **approve-plan.** The shared admission knows three proof-bearing transports (`--design-approval-request`, `--design-workflow-approval-request`,
   `--bootstrap-acknowledgement-receipt`); AGY knew one and refused the others as self-approval.
3. **Containment.** The inline-code check (`node -e`, `python -c`, `bash -c`) ran over the raw command, so `git commit -m "... node -e ..."` or `echo "node -e is blocked"`
   was denied as inline execution.

## Change

- `HOOK_BUDGET_MS` is 28 s, under the 30 s manifest timeout. The lifecycle share is derived from it (`capMs` = half, `reserveMs` = one sixth, so a cold readback fits);
  `guard-push.mjs` has its own larger share (16 s cap, 6 s reserve).
- `proofBearingRoute` accepts the two further transports, only when `isSanctionedLifecycleCommand` admitted the whole command. A bare `--by` stays refused.
- The containment test runs on the command with quoted segments replaced by a placeholder, unless the quoted content starts with `-` (`node '-e' 'code'` still runs inline code).
- Tests: three `17 ...` cases (the approve-plan routes with positive and negative commands; the budget pin against the manifest timeout; the quoted-text containment on a READY fixture).
  Mutation-checked: with the quoted-text replacement removed, the containment case is red and names `echo "node -e is blocked"`; the original restored from backup.

## Not changed / not proven

- The AGY tool matcher (`view_file`, `grep_search`, `list_dir`, `find_by_name` credential reads and other write tools do not reach this guard at all). That needs a manifest edit, a
  tool-name normalisation and an AGY tool schema that is not verified here. It stays a named open item.
- Nothing ran on a real AGY session; the timing numbers come from the repository's own fixtures and the manifest.
- Suite: `antigravity-pretool-guard.test.mjs` passes (whole suite, about four minutes).
