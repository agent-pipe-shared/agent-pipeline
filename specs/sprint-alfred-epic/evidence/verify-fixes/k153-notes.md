# K153-AGY-APPROVE-PUSHGUARD notes (Goldfish, closing allowance)

Clone commit: 72e0a1d3a (scratch/clones/k153), base 54bde5613. Deviation: no dispatch record written (briefed, row 59).
All four changed files are protected plugin source (hooks/): K153-protected.diff holds everything; there is no unprotected diff.

## Part 1 (G9a)
- Claude path: guard side is only `sanctionedPipelineStateArgs` / `isSanctionedLifecycleCommand` (lib/guard/sanctioned-args-scripts.mjs, command-catalogue.mjs):
  `approve-plan [--by X] --design-approval-request scratch/design-approval-request-<64hex>.json` is admitted (existing physical-scratch regular file, own script).
  The proof itself (PO signature, commit/tree/intent binding, policy) is verified only by pipeline-state.mjs approve-plan (observeDesignApprovalRequest). The guard does NOT verify the proof on Claude either.
- Antigravity now delegates: PO Gate admits approve-plan when `isLifecycleTool` (already computed from the shared catalogue) AND the argv has `--design-approval-request <path>`; otherwise the old denial (message extended).
- Bare `--by` form, missing/foreign/spliced request, foreign script stay refused. A no / invalid / foreign-bound proof is refused by the writer, not by the guard: not pinned at guard level (no writer e2e run, budget).
- Extra finding fixed: the gate regex `pipeline-state(.mjs)?\s+approve-plan` did not match a quoted script path (`"...pipeline-state.mjs" approve-plan`), so that spelling bypassed the PO Gate; now `["']?` is tolerated. Existing chat-attribution test used that quoted form, so it was vacuous before.
- Pins (RED on base): antigravity-pretool-guard.test.mjs, two new checks (admit; refuse eight shapes). Evidence: scratch/agent-out/k153-evidence/agy-red.txt (exit 1), agy-green.txt (exit 0).

## Part 2 (G11)
- guard-push.mjs `NON_PUSH_MARKER_SUBCOMMANDS` + rev-parse, rev-list, cat-file, ls-tree. Quoted braces are literal in `provenNonPushMarkerCandidate`; unquoted braces, `;`, `&`, push in substitution still refused. lib/git-cmd.mjs untouched (its marker rule is PO-decision-bound).
- Pins PG-K153-01..10 in guard-push.test.mjs. Evidence: gp-red.txt (exit 1, shell-expansion refusal), gp-green.txt (exit 0).

## Not done (budget)
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` and `node harness/scripts/check-doc-contracts.mjs`: NOT run. Coordinator must run.
- `git apply --check` of the diff in scratch/clones/k153-check: NOT run. Message K153-msg-protected.txt in agent-out is the text of the commit (clone copy: clone scratch/).
- Full Verify, Critic, PO acceptance: pending.
