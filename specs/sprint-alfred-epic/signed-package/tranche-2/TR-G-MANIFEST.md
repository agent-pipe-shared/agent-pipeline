# TR-G manifest: dispatch-budget behaviour pins (tranche-2 post-image, test-only)

Dispatch: TR-G-T2-20261009 (continuation of TR-G-T-20261009). Test-only. No production file is touched.

## Target

- Install target: `plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs` (a protected test path; the post-image is
  delivered here as a signed-package artifact and is never written by an agent to the live path).
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-dispatch-budget.test.mjs`
- Post-image sha256: `33411458451a7dabd4c067f6b7e94601739ccdd0f7e5fc2e27b6a1325a1b817d` (121431 bytes, LF).
- Live file it extends: sha256 `e92bc503189bec44737699058643d6023230f38c196ad53e581765de2dc52a4d` (109358 bytes, LF).

The post-image is the live file plus one appended block (a comment header carrying assumptions A1-A4, helper
constants, and 7 new `test(...)` cases). No existing line is changed. It is produced by a build script (live bytes plus
the block), so the prefix is byte-identical to the live file by construction. The relative imports are those of the
live file, so the post-image works only when installed at the target path above.

## Verification command (WSL, foreground)

The run used a scratch copy of the post-image whose only difference is two import anchors re-pointed at the live
plugin tree (`../lib/governance-scope.mjs` and `./guard-dispatch-budget.mjs`), scratch copy sha256
`43ad22368883ea4a67579dad9274e18672dcee6474289decc958ecc263f8230e`.

```
wsl.exe -e bash -lc "cd <repo-root-under-/mnt>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-G-T2-20261009/red.txt --label TR-G-T2-red -- node --test --test-reporter=spec scratch/dispatch-wip/TR-G-T/guard-dispatch-budget.test.mjs"
```

Wrapped exit code 1 (expected: red pins by design plus the baseline reds). Artifact: `evidence/TR-G-T2-20261009/red.txt`.
Baseline of the unmodified live file, same runner: `evidence/TR-G-T-20261009/baseline.txt` (85 tests, 81 pass, 4 fail).
Copy run: 92 tests, 86 pass, 6 fail.

## Per-pin state against the unchanged guard

| Pin | State | Reason / role |
|---|---|---|
| T49 (a) producer is an admitted closing act after the cap, and stays counted | RED | Right reason: the producer call after the working cap is refused with `DISPATCH-BUDGET-EXHAUSTED` (only `git add`/`git commit` are closing verbs today). |
| T49 (b) nothing but the named closing acts is admitted after the cap | GREEN | Control: four refusals stay refusals. |
| T49 (c) the producer cannot renew the closing allowance (5 pass, 6th refused) | RED | Right reason: producer closing call 1 of 5 is refused with `DISPATCH-BUDGET-EXHAUSTED`. |
| T37 (a) a second same-role child under one parent tool id is bound per dispatch, or refused naming a re-dispatch action | RED | Right reason: refused with `DISPATCH-BUDGET-INPUT-INVALID` (`DBB-PENDING-BINDING-MISSING`), no re-dispatch wording. |
| T37 (b) concurrent launches under distinct parent tool ids each resolve their own binding | GREEN | Control. |
| T57 this guard's own denial shows the budget charge (counted attempts, working cap, remaining closing slots) | GREEN | Regression guard. The guard already prints the charge (`guard-dispatch-budget.mjs`); the Elephant accepted this reading of Ruling 115 / TR-K4. |
| T34 a governance state change between two guard calls takes effect on the second call | GREEN | Invariant for a future cache. Fixed in this dispatch (see below). |

Pre-existing cases against the baseline: the same three 10 s runner timeouts are red (orchestrating-session-never-limited,
orchestrator-sink-bounded, implementor-cap-40). R7-11a is green in the copy run and was red in the baseline; it is a
timing-sensitive concurrency case and is treated as flaky, not as a change. No other pre-existing case changed.

### T34 fixture correction (this dispatch)

The predecessor's T34 case threw `GS-PLAN` from `applyGovernanceScopeDecision`
(`plugins/pipeline-core/lib/governance-scope.mjs:287`): `applyDecision` refuses unless `activate` is true and
`planSha256` equals the plan's digest. The case now calls
`applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 })`, the same arguments the live
`activeGovernanceRoot` helper passes for enroll. The `decline` plan is expressible; no corrupt-state-file variant and no
drop were needed. The fixture's own precondition assertion (`requiresEnforcement === false` after the decline) holds.

## Assumptions (stated in the appended block's header, repeated here)

- A1 (T37): the construction is two children of the SAME agentType launched under ONE parent tool id (one pending
  record, one binding for the role). The first child consumes the binding, so the second finds none. The pin accepts
  either cure named by the row: the second child is admitted with the briefed cap, or it is refused with a message that
  names a re-dispatch action (matched by `/re-?dispatch/i`). Side finding: the current refusal also says the persisted
  counter was left unchanged and to repair it through the trusted host path, which is misleading for a first-call
  binding miss.
- A2 (T49): the commit-flow producer is `goldfish-commit-command-flow.mjs`. Its argument spelling is not pinned; only the
  script name is. The admitted location is the plugin root the guard itself resolves. "Nothing else" is pinned with
  refusals that stay refusals: another script, the producer chained with `&&` or `;`, and two non-closing git verbs.
- A3 (T57): the budget guard's own exhaustion denial already names the charge, the working cap and the remaining closing
  slots, so that half is pinned GREEN to stop TR-K4 regressing it. The half Ruling 115 found unmet (refusals by other
  guards) cannot be expressed in this file and is left to TR-K4's own pins in the owning suites.
- A4 (T34): the cache is a performance change with no seam in this guard and no decided cache location, so its speed-up
  cannot be pinned here. Only the row's invariant is pinned: any change recomputes. The pin retires the governance scope
  (decision `decline`) between two guard calls and requires the very next call to see it. It is GREEN today and goes RED
  if a future cache serves a stale "active" verdict.

## Not done here

- The tranche `README.md` is not edited by this dispatch.
- Installing the post-image at the target path is a signed-package step for the PO ceremony, not part of this commit.
- Independent Critic review: pending.
