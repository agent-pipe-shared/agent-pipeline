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

## TR-G-T4 pins

Dispatch: TR-G-T4-20261009. Test post-image only (QG-04: the guard fix that turns these pins green is TR-G-F4, a separate
dispatch). Source: Ruling 150 in `plans/0.7-execution-order.md` (TR-G delta Critic, findings 1 to 3). Nothing above this
section is edited; the Target section's test sha256 `33411458...` and the TR-G-F manifest's TR-G-T3 line (`2967751f...`)
describe the file BEFORE this section and are superseded by the value below.

- Test post-image: `hooks/guard-dispatch-budget.test.mjs`, new sha256
  `5dc3c2940ba7a0ed48e65b23711c2d37001b1e6cad200191a5b1c18ea80e8617` (133023 bytes, LF, 2116 lines). Previous value
  `2967751fb1c536eda5a8bcbbd2d50923d0293b9c95cd728604771b68a275b019` (127070 bytes).
- Inserted block: 85 lines, lines 1943-2027, between `TR-G T49 (j)` and `function trgTwoChildrenOneParentFiles()`: a comment header,
  five helpers (`TRG4_TAIL`, `TRG4_PLUGIN_ROOT`, `TRG4_ADMITTED`, `trg4Comparable`, `trg4RelativeCommand`) plus the typed skip
  constant `TRG4_WIN32_ONLY_SKIP`, and seven cases `TR-G T49 (k)` to `(q)`. Removing exactly that block gives back
  sha256 `2967751f...` / 127070 bytes (checked by the build script), so no earlier line changed.
- Guard under test, read only and unchanged: `hooks/guard-dispatch-budget.mjs`, sha256
  `2ec5a564dc05f47d188bd3486919ee05dc9d232ba232b277ad8f76756012d808` (86028 bytes), the TR-G-F3 value.

### Pin table (against the CURRENT guard post-image)

| Pin | Shape after the working cap | WSL | Native win32 | After TR-G-F4 (expected, not verified here) |
|---|---|---|---|---|
| T49 (k) | `node plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs ...` (relative spelling) is refused | GREEN (control) | GREEN | GREEN |
| T49 (l) | the refusal text of that call names `<plugin root>/scripts/goldfish-commit-command-flow.mjs` (compared after `\` to `/`, lower-cased on win32) | RED: refused, but the text only says "from the plugin scripts directory" | RED | GREEN |
| T49 (m) | `git commit-graph write` is refused | RED (admitted: 0 !== 2) | RED | GREEN |
| T49 (n) | `git commit-tree HEAD` is refused | RED (admitted: 0 !== 2) | RED | GREEN |
| T49 (o) | the exact admitted producer command (quoted; bare with forward slashes) and `git commit -F <f> -- <p>` stay admitted | GREEN (control) | GREEN | GREEN |
| T49 (p) | win32: bare producer path, every separator a backslash, is refused | skipped (typed reason `TRG4-WIN32-ONLY`) | RED (admitted: 0 !== 2) | GREEN |
| T49 (q) | win32: bare producer path with a backslash only before the script name is refused | skipped (typed reason) | RED (admitted: 0 !== 2) | GREEN |

(m) and (n) carry no shell control character, so today they are admitted for the verb pattern alone (`\b` matches between "t" and
"-"); the fix pattern is `^git\s+(add|commit)(\s|$)`. Every refusal pin asserts exit code 2, the `DISPATCH-BUDGET-EXHAUSTED`
code and the ABSENCE of the allowance-exhausted text (the TR-G-T3 helpers), so a green refusal is the shape's. Each test spends at
most three post-cap calls (allowance: five). Controls (i) and (j) of TR-G-T3 and the new (k) and (o) are the controls the
briefing names: the exact admitted producer command and `git commit -F <file> -- <paths>` after the cap.

### Scope and limits

- **(p) and (q) are win32-native only.** The guard reads `process.platform` directly and this runner has no platform seam; the typed
  probe-based skip (`process.platform === "win32" ? false : "TRG4-WIN32-ONLY: ..."`) skips them on WSL, and no injected-win32
  variant is invented. The native capture ran only the `TR-G T49` cases (`--test-name-pattern`), not the whole file.
- **Adjacency for TR-G-F4 (not changed here): pre-existing T49 (j) will turn red natively once the bare-backslash refusal lands.**
  On win32 `FAKE_ROOT` comes from `mkdtempSync` and contains backslashes, so (j)'s "bare forward-slash" command contains a
  backslash in its script token; it is admitted natively today (green in `red-native.txt`) and is refused by the Finding 2 fix.
  Pins (o) was written to avoid this (its bare spelling maps `\` to `/`). (j) cannot be edited in this dispatch.
  The skip reason text of T49 (d) and (e) ("that spelling stays admitted" on win32) becomes half-true after Finding 2 for the bare
  spelling (e); also left untouched.
- Whether `guard-lifecycle-ready` and the other guards of the union admit the same shapes is not decided here.

### Command and result

The pins were measured with the load-hook redirect of `TR-C-F-MANIFEST.md` ("How the post-images were exercised"): the scratch
entry appends `--import=register.mjs` to `NODE_OPTIONS`, and the hook serves the guard post-image bytes under the LIVE guard URL
to every runner child, so the guard behaves as if installed (same relative imports, the live `lib/`, module-relative plugin root
unchanged) and no live hook file is written. The scratch body is the test post-image with only two import anchors re-pointed
(`../lib/governance-scope.mjs` and the `GUARD` URL), scratch body sha256
`6afe2798fab180f5d40545b94b2709d931718b6a1445236bffc17afc040e5f55`. Scratch files (git-ignored, not committed) under
`scratch/dispatch-wip/TR-G-T4/`; the sidecar line `TRG4-REDIRECT-FIRED` is in both captures (WSL: 137 runner-child loads; native: 15).

Build (reads the two post-images, writes only scratch files and prints the shas above):

```
node scratch/dispatch-wip/TR-G-T4/tool.mjs build "<phase>" <tool-use count>
```

Run, WSL (whole file, foreground):

```
wsl.exe -e bash -lc "cd <repo-root-under-/mnt>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-G-T4-20261009/red.txt --label TR-G-T4-red -- node --test --test-reporter=spec scratch/dispatch-wip/TR-G-T4/guard-dispatch-budget.trg4.test.mjs"
```

Wrapped exit code 1. Artifact: `evidence/TR-G-T4-20261009/red.txt`: 106 tests, 98 pass, 6 fail, 2 skipped. The 6 fails are the three accepted
10 s runner timeouts (orchestrating-session-never-limited, orchestrator-sink-bounded, implementor-cap-40) and the new reds (l), (m),
(n). Baseline `evidence/TR-G-F3-20261009/green.txt` (99 tests, 96 pass, 3 fail): 99 + 7 new cases = 106; 96 + 2 new green ((k),
(o)) = 98; 3 + 3 new reds = 6; the two skips are (p) and (q). Every pre-existing case keeps its state.

Run, native Windows (the `TR-G T49` cases only):

```
node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-G-T4-20261009/red-native.txt --label TR-G-T4-red-native -- node --test --test-reporter=spec --test-name-pattern="TR-G T49" scratch/dispatch-wip/TR-G-T4/guard-dispatch-budget.trg4.test.mjs
```

Wrapped exit code 1. Artifact: `evidence/TR-G-T4-20261009/red-native.txt`: 17 tests, 10 pass, 5 fail ((l), (m), (n), (p), (q)), 2 skipped
((d) and (e), their own win32 skip). T49 (a)-(c), (f)-(k) and (o) are green natively; there is no earlier native capture of these
cases to diff against, so "no pre-existing case changed" rests on the prefix-hash proof above.

Other checks: `node --test harness/scripts/check-consumer-safe-paths.test.mjs` exit 0.

Independent Critic review: pending.

## TR-G-T5 T49 (j) and the (e) skip text

Dispatch: TR-G-T5-20261009. Test post-image only (QG-04). Resolves the adjacency recorded under TR-G-T4 "Scope and limits".

- Test post-image: `hooks/guard-dispatch-budget.test.mjs`, new sha256
  `0bda864c5087f90de59216231522ae81529fe8ad8d7a44dd479092ad557e431e` (133519 bytes, LF, 2121 lines). Previous value (TR-G-T4)
  `5dc3c2940ba7a0ed48e65b23711c2d37001b1e6cad200191a5b1c18ea80e8617` (133023 bytes).
- Edited blocks: (1) `TR-G T49 (j)`: the commands are now built from `FAKE_ROOT.replaceAll("\\", "/")`, quoted and bare, so the script
  token is forward-slash on every platform; the assertion (both admitted after the cap) is unchanged. (2) New constant
  `TRG_SKIP_BARE_ON_WIN32` (skip text true once the bare-backslash refusal lands) used by `TR-G T49 (e)` only; `TRG_SKIP_ON_WIN32`
  and (d) are unchanged. No other case, no pins (k) to (q).
- Guard post-image, read only and unchanged: sha256 `2ec5a564dc05f47d188bd3486919ee05dc9d232ba232b277ad8f76756012d808` (86028 bytes).
- Method: the TR-G-T4 load-hook redirect, scratch under `scratch/dispatch-wip/TR-G-T5/` (git-ignored); sidecar `TRG5-REDIRECT-FIRED`
  in both captures; scratch body sha256 `c9907cbff1f98cea95594f6a878032430155b5163b7e9cf3a99434d881862cae`.

Native, `TR-G T49` cases only (wrapped exit 1, 17 tests, 10 pass, 5 fail, 2 skipped; identical to `evidence/TR-G-T4-20261009/red-native.txt`
except that (j) is now green by construction):

```
node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-G-T5-20261009/native.txt --label TR-G-T5-native -- node --test --test-reporter=spec --test-name-pattern="TR-G T49" scratch/dispatch-wip/TR-G-T5/guard-dispatch-budget.trg5.test.mjs
```

WSL, whole file (wrapped exit 1, 106 tests, 98 pass, 6 fail, 2 skipped; identical to `evidence/TR-G-T4-20261009/red.txt`: the three accepted
10 s timeouts plus (l), (m), (n)):

```
wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-G-T5-20261009/wsl.txt --label TR-G-T5-wsl -- node --test --test-reporter=spec scratch/dispatch-wip/TR-G-T5/guard-dispatch-budget.trg5.test.mjs"
```

Not shown by these captures: (j) red-then-green against the TR-G-F4 guard (not run here; expected green because no backslash remains in either token).

Other checks: `node --test harness/scripts/check-consumer-safe-paths.test.mjs` exit 0.

Independent Critic review: pending.
