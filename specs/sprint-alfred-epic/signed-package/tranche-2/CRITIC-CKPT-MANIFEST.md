# CRITIC-CKPT manifest (tranche-2)

## CRITIC-CKPT-T2 pins

Dispatch: CRITIC-CKPT-T2-20261009. Test post-image only (QG-04: the change that turns the red pins green is CRITIC-CKPT-F, a
separate dispatch). Source: Ruling 161 in `plans/0.7-execution-order.md` (corrects Ruling 159: a Critic cap of 50 means
`maxTurns` 65 under `dispatchWorkingCap`, today's effective cap is 35, and the notes Write lane exists only after the cap and
admits any `scratch/dispatch/<dir>/critic-notes.md`). Nothing above the inserted block is edited.

- Test post-image: `hooks/guard-dispatch-budget.test.mjs`, new sha256
  `1447a996c575658adcda46f4f6a26b8d5447bf3783b0b9cc319c4d7b8004a814` (144278 bytes, LF, 2265 lines). Base sha256
  `0bda864c5087f90de59216231522ae81529fe8ad8d7a44dd479092ad557e431e` (133519 bytes, 2121 lines; the TR-G-T5 value).
- Inserted block: 144 lines, lines 2122-2265, appended after `TR-G T34` (the last test). Removing exactly that block gives back
  the base sha256 / 133519 bytes (checked by the build script), so no earlier line changed. The block holds a comment header,
  two imports, a fixture builder, a derived second runner, a cap probe, and eight cases `CRITIC-CKPT-T2 (a)` to `(d5)`.
- Guard under test, read only and unchanged: `hooks/guard-dispatch-budget.mjs`, sha256
  `f7649839d83cfaad1f4163269a07284e91efe71751e3b3634f09b92ccbfa4c4f` (87604 bytes).

### Design

- The subject is a `pipeline-core:critic` subagent. Its agent definition is the SHIPPED `agents/critic.md`, read at test time
  (`new URL("../agents/critic.md", import.meta.url)`); its `maxTurns` is read from that text with `readAgentMaxTurns`, never
  hard-coded. The base cap 50 reaches the guard through a preflight-style pending binding (`baseCalls` 50, the shipped
  `maxTurns`, `effectiveCap` from `effectiveDispatchBaseCap`), so the cap the guard enforces is whatever the shipped definition
  yields: `min(50, maxTurns - 15)`.
- Real budget binding (`realBudgetBinding`), because the checkpoint notice is emitted only for a budget-bearing role.
- A second runner is derived at run time from the shared `RUNNER_SOURCE` (two string replacements, asserted present): it returns
  each call's `stdout` (the notice is stdout) and expands a `repeat` field so a 90-call scenario stays a short argv. The shared
  runner and `run()` are untouched. The bound for these children is `max(RUNNER_TIMEOUT_MS, 240000)`: a Critic scenario is 41 to
  90 sequential guard calls and the shared 10 s bound only measures the mounted-drive cost per call.
- The (d) cases reach "after the cap" with a probe run (90 reads; the first refusal index is the measured cap), so they hold
  whichever cap the shipped definition yields and their verdicts change only when the lane itself changes.
- New relative specifiers (all resolve in the installed layout, `hooks/` next to `lib/` and `agents/`): `../lib/dispatch-budget-core.mjs`,
  `../lib/dispatch-budget-binding.mjs`, `../agents/critic.md`.

### Pin table (against the CURRENT guard post-image and the shipped critic.md, `maxTurns: 50`)

| Pin | Shape | WSL | After CRITIC-CKPT-F (expected, not verified here) |
|---|---|---|---|
| (a) | 50 working calls admitted, the 51st is `DISPATCH-BUDGET-EXHAUSTED` | RED: first refusal at call 36, working cap 35 (`min(baseCalls=50, maxTurns=50 minus 15)`) | GREEN |
| (b) | the first `DISPATCH-BUDGET-CHECKPOINT` notice is on call 40, none on 39 | RED: first notice on call 28 (notices on calls 28, 33, 34, 35), expected 40 | GREEN |
| (c) | five closing acts after call 50 pass, the sixth names the exhausted allowance | RED: call 36 refused before the closing acts | GREEN |
| (d1) | after the cap, Write to `scratch/dispatch/critic-abc/critic-notes.md` is admitted | GREEN (control) | GREEN |
| (d2) | after the cap, Write to `scratch/x.md`, `evidence/other.json`, `scratch/dispatch/critic-abc/other.md`, `scratch/critic-notes.md` is refused | GREEN (control) | GREEN |
| (d3) | after the cap, Edit of `scratch/x.md` is refused | GREEN (control) | GREEN |
| (d4) | after the cap, Write to `scratch/dispatch/other/critic-notes.md` is refused | RED: admitted, `0 !== 2` | GREEN |
| (d5) | control: a goldfish-deep Write to a `critic-notes.md` path stays refused after its own cap | GREEN (control) | GREEN |

Every refusal pin asserts exit code 2, the `DISPATCH-BUDGET-EXHAUSTED` code and the ABSENCE of the allowance-exhausted text (the
TR-G-T3 helpers), so a green refusal is the shape's.

For CRITIC-CKPT-F: cap 50 needs `maxTurns` 65 in `agents/critic.md` (or a role-specific rule that the binding's
`effectiveDispatchBaseCap` also reflects); the (d4) fix is a critic-prefixed subdirectory in `CRITIC_NOTES_PATTERN`. Pre-confinement
of the Critic's Write before the cap is the `tools` frontmatter plus the post-cap lane (Ruling 161); no pin here covers it.

### Commands and results

The pins were measured with the load-hook redirect of `TR-C-F-MANIFEST.md` ("How the post-images were exercised"), exactly as
`TR-G-MANIFEST.md` TR-G-T4 "Command and result": the scratch entry appends `--import=register.mjs` to `NODE_OPTIONS` and the hook
serves the guard post-image bytes under the LIVE guard URL to every runner child. The scratch body is the test post-image with
every `../lib/` specifier, the `../agents/critic.md` URL and the guard URL re-pointed at the live plugin tree (scratch body sha256
`e9cf06ddfaca77f662c2f236610601d0a348081bba80ae335fb01d087107326f`). Scratch files (git-ignored, not committed) under
`scratch/dispatch-wip/CRITIC-CKPT-T2/`; the sidecar line `CKPT2-REDIRECT-FIRED` is in both captures.

Build (verifies the base sha, writes only scratch files and the commit message, prints the shas above):

```
node scratch/dispatch-wip/CRITIC-CKPT-T2/tool.mjs build "<phase>" <tool-use count>
```

Run, WSL, the eight new cases (final body; wrapped exit code 1; 8 tests, 4 pass, 4 fail, 0 skipped):

```
wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/CRITIC-CKPT-T2-20261009/red-ckpt.txt --label CRITIC-CKPT-T2-red-ckpt -- node --test --test-reporter=spec --test-name-pattern='CRITIC-CKPT-T2' scratch/dispatch-wip/CRITIC-CKPT-T2/guard-dispatch-budget.ckpt2.test.mjs"
```

Artifact: `evidence/CRITIC-CKPT-T2-20261009/red-ckpt.txt`. The four fails are (a), (b), (c), (d4) for the reasons in the table; (d1),
(d2), (d3), (d5) pass.

Run, WSL, the whole file (first version of the block; wrapped exit code 1; 114 tests, 101 pass, 11 fail, 2 skipped; 530 s):
`evidence/CRITIC-CKPT-T2-20261009/red.txt`. The 106 pre-existing cases: 100 pass, 4 fail, 2 skipped. The 4 fails are the three
accepted 10 s runner timeouts (orchestrating-session-never-limited, orchestrator-sink-bounded, implementor-cap-40) and
`R7-11a`, which `TR-G-MANIFEST.md` records as red in the baseline and green in a copy run. In that first version the seven Critic
scenarios used the shared 10 s bound and failed only by it (about 10 s each, no verdict); (d5) passed. That is why the bound above
was added, and why `red-ckpt.txt` is the evidence for the eight cases. No line before the block changed between the two runs
(the base-prefix sha above holds for both bodies); a second whole-file run of the final body was not done because the file alone
takes about 530 s, close to the 600 s foreground limit, before the roughly 190 s the new cases add.

Other checks: `node --test harness/scripts/check-consumer-safe-paths.test.mjs` exit 0.

Independent Critic review: pending.

## CRITIC-CKPT-T3 pins

Dispatch: CRITIC-CKPT-T3-20261009. Test post-image only (QG-04; CRITIC-CKPT-F turns the red pins green). Source: Rulings 157 and
159 bind at EVERY call, not only after the cap. The T2 block pinned only the post-cap lane, and its note above ("Pre-confinement of
the Critic's Write before the cap is the `tools` frontmatter plus the post-cap lane (Ruling 161); no pin here covers it") is
OVERRULED: a `tools` list cannot confine paths, so the confinement has to be a guard refusal and is pinned here. Nothing above the
T3 block is edited.

- Test post-image: `hooks/guard-dispatch-budget.test.mjs`, new sha256
  `006d766d2d4d28aab54066612b2070ae20a2c371ebe04c8484076f8ba38732eb` (150645 bytes, LF, 2349 lines). Base sha256
  `1447a996c575658adcda46f4f6a26b8d5447bf3783b0b9cc319c4d7b8004a814` (144278 bytes, 2265 lines; the T2 post-image above).
- Inserted block: 84 lines, lines 2266-2349, appended after `CRITIC-CKPT-T2 (d5, control)`. Removing exactly that block gives back the
  base sha256 / 144278 bytes (checked by the build script), so no earlier line changed. The block holds a comment header, one path
  table, three small helpers and a refusal checker (`ckptEdit`, `ckptMutate`, `ckptAt`, `ckpt3Problem`, `ckpt3AssertConfined`) that
  reuse the T2 fixture, runner and probe helpers, and seven test titles `CRITIC-CKPT-T3 (a)` to `(g, control)` (`(f)` is registered
  once per call, so eight cases run). No new import.
- Guard under test, read only and unchanged: `hooks/guard-dispatch-budget.mjs`, sha256
  `f7649839d83cfaad1f4163269a07284e91efe71751e3b3634f09b92ccbfa4c4f` (87604 bytes).

### Design

- Same subject as T2: a `pipeline-core:critic` subagent seeded from the shipped `agents/critic.md` with a preflight-bound base cap
  of 50, run through the derived runner. Every T3 critic scenario stays BELOW the cap (the measured cap today is 35, so call 20 and
  the calls right after it are inside it; a cap of 50 after CRITIC-CKPT-F is also above them), so none of them is an
  exhaustion case.
- Positions: call 1 (no reads before) and call 20 (19 admitted reads before). `ckptAt(call, steps)` builds the scenario; it does
  not use `ckptReads(0)`, which the runner expands to one read.
- (b) to (e): the six refused paths (the four T2 (d) paths `scratch/x.md`, `evidence/other.json`,
  `scratch/dispatch/critic-abc/other.md`, `scratch/critic-notes.md`, plus the source file `plugins/pipeline-core/lib/x.mjs` and
  `evidence/x.json`) run as ONE scenario per case, as consecutive calls: the first path is call 1 (or call 20), the rest are the calls
  right after it. Write at call 1 (b) and call 20 (c), Edit at call 1 (d) and call 20 (e). The checker collects every path that is
  not properly refused and asserts the list is empty, so a red line names all of them.
- (f): T2 open item (d4), `scratch/dispatch/other/critic-notes.md`, as a Write at call N and an Edit at call N+1, for N = 1 and
  N = 20 (two registered cases).
- The contract for "refused with a typed code" (`ckpt3Problem`): exit code 2; stderr contains `BLOCKED (guard-dispatch-budget`;
  stderr matches `DISPATCH-BUDGET-[A-Z-]+`; stderr does NOT contain `DISPATCH-BUDGET-EXHAUSTED` and does NOT contain the
  exhausted-allowance text (the cap is not reached, so either would be the wrong refusal). The concrete code name is CRITIC-CKPT-F's
  choice within the `DISPATCH-BUDGET-*` family. These pins run the dispatch-budget guard only, so they are satisfiable only if the
  pre-cap confinement lives in that guard; if CRITIC-CKPT-F places it in another guard, these pins must be revised with it.
- (a) and (g) are the regression side: the confined notes file stays admitted for both tools at both positions, and a goldfish-deep
  Write to a source file at call 1 stays admitted, so the fix cannot be satisfied by refusing all writes or by confining
  non-Critic roles.

### Pin table (against the CURRENT guard post-image and the shipped critic.md, `maxTurns: 50`; red.txt run, WSL)

| Pin | Shape | WSL | After CRITIC-CKPT-F (expected, not verified here) |
|---|---|---|---|
| (a) | Critic Write and Edit of `scratch/dispatch/critic-abc/critic-notes.md` admitted at call 1 and call 20 | GREEN (control) | GREEN |
| (b) | Critic Write of the six paths refused with a typed code, starting at call 1 | RED: `6 !== 0`, all six admitted (exit 0) | GREEN |
| (c) | same, starting at call 20 | RED: `6 !== 0` | GREEN |
| (d) | Critic Edit of the six paths, starting at call 1 | RED: `6 !== 0` | GREEN |
| (e) | same, starting at call 20 | RED: `6 !== 0` | GREEN |
| (f) | Critic Write and Edit of `scratch/dispatch/other/critic-notes.md` refused, from call 1 and from call 20 | RED (both cases): `2 !== 0`, Write (call N) and Edit (call N+1) admitted | GREEN |
| (g) | control: goldfish-deep Write to `plugins/pipeline-core/lib/x.mjs` at call 1 admitted | GREEN (control) | GREEN |

### Commands and results

Same load-hook redirect method as the T2 section: the scratch entry appends `--import=register.mjs` to `NODE_OPTIONS` and the hook serves
the guard post-image bytes under the LIVE guard URL to every runner child (sidecar line `CKPT3-REDIRECT-FIRED` in the capture). The
scratch body is the test post-image with every `../lib/` specifier, the `../agents/critic.md` URL and the guard URL re-pointed at the
live plugin tree (scratch body sha256 `55b558bb1bca6fae1a2664a04de80c8342961a921242def4dc9bedb7a3743937`). Scratch files (git-ignored,
not committed) under `scratch/dispatch-wip/CRITIC-CKPT-T3/`.

Build (verifies the base sha, writes only scratch files and the commit message, prints the shas above):

```
node scratch/dispatch-wip/CRITIC-CKPT-T3/tool.mjs build "<phase>" <tool-use count>
```

Run, WSL, the T2 block and the T3 block (final body; wrapped exit code 1; 16 tests, 6 pass, 10 fail, 0 skipped; 212.6 s):

```
wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/CRITIC-CKPT-T3-20261009/red.txt --label CRITIC-CKPT-T3-red -- node --test --test-reporter=spec --test-name-pattern='CRITIC-CKPT-T[23]' scratch/dispatch-wip/CRITIC-CKPT-T3/guard-dispatch-budget.ckpt3.test.mjs"
```

Artifact: `evidence/CRITIC-CKPT-T3-20261009/red.txt`. The ten fails are the four T2 reds (a), (b), (c), (d4) for the T2 reasons, and the six T3
refusal cases (b), (c), (d), (e), (f at call 1), (f at call 20), each because the refused write is ADMITTED today; the six passes are T2
(d1), (d2), (d3), (d5) and T3 (a), (g). A first run of an earlier body (T3 (f) a single case looping both calls, so only call 1 was
reported) gave 15 tests, 6 pass, 9 fail, 241 s; it was overwritten by the final-body run above.

Independent Critic review: pending.

## CRITIC-CKPT-F (production side of the T2 and T3 pins)

Dispatch: CRITIC-CKPT-F2-20261009 (the earlier CRITIC-CKPT-F-20261009 stopped without a commit on the DP26/DP27 pin; the test-only
predecessor `e28888585` re-pinned the Critic definition at 65 turns). Source: Rulings 157, 159, 161. No test file, no
`dispatch-budget-core.mjs`, no `agents/plan-verifier.md`, no live hook and no DP25 / default base cap is touched.

- Guard post-image: `hooks/guard-dispatch-budget.mjs`, base sha256 `f7649839d83cfaad1f4163269a07284e91efe71751e3b3634f09b92ccbfa4c4f`
  (87604 bytes), new sha256 `360a645e4b77f32bd18971d8a94463a02cd49536e12f966bd4d03cb5018f7a33` (90377 bytes, LF, 1556 lines). Five
  anchored replacements, each checked to occur exactly once on the base: (1) the header bullet, (2) `CRITIC_NOTES_PATTERN` now
  `scratch/dispatch/critic-<id>/critic-notes.md` (directory must start with `critic-`, the T2 (d4) pin) plus the exported
  `CRITIC_WRITE_CONFINED_CODE = "DISPATCH-BUDGET-CRITIC-WRITE-CONFINED"`, (3) the `closingNotesClause` wording plus the new
  `criticWriteConfined` verdict and `writesOutsideCriticNotes` predicate, (4) the checkpoint-notice wording, (5) the confinement
  inside `advanceCounter`'s `if (budget.allowed) {`, before the checkpoint notice.
- Design (forced by the pins): the confinement sits BEHIND the budget decision. A Critic Write/Edit/NotebookEdit outside its own
  notes file is refused (exit 2, code above, counted) at every call the budget admits, so T3 sees a typed non-EXHAUSTED refusal before
  the cap, while a write after the allowance still reaches the budget's own refusal and T2 (d2)-(d4) keep `DISPATCH-BUDGET-EXHAUSTED`.
  A Critic dispatch-record Write inside the allowance is a counted closing act that the confinement then refuses (accepted; the
  Critic's hand-back is `critic-notes.md`). An empty target path is outside the notes file.
- `agents/critic.md` (in tree, not the installed plugin copy): `maxTurns` 65 (working cap `min(50, 65 - 15)` = 50, notice at call 40),
  `tools: Read, Grep, Glob, Bash, Write, Edit`, comments at the old lines 8-9 and 30 rewritten, one body sentence added
  ("Your only writable file is scratch/dispatch/critic-<id>/critic-notes.md; ..."). The installed copy differs
  (`DUTY-NOT-RUNTIME-LIVE`), so the live runtime sees this only after a plugin refresh.
- No `tool.mjs build` of T3 was run. The post-image was copied to the T3 redirect location
  `scratch/dispatch-wip/CRITIC-CKPT-T3/post/hooks/guard-dispatch-budget.mjs` (git-ignored), which the scratch test entry serves under the
  live guard URL (sidecar line `CKPT3-REDIRECT-FIRED` in every capture).

Results (WSL, `<repo-root-in-wsl>`, `CLAUDECODE=1`, `timeout 540`, through `capture-evidence.mjs`, scratch entry
`scratch/dispatch-wip/CRITIC-CKPT-T3/guard-dispatch-budget.ckpt3.test.mjs`):

| Run | Pattern | Result | Artifact |
|---|---|---|---|
| T2 + T3 pins | `CRITIC-CKPT-T[23]` | wrapped exit 0; 16 tests, 16 pass, 0 fail (was 6 pass, 10 fail); 326.9 s | `evidence/CRITIC-CKPT-F2-20261009/green.txt` |
| neighbourhood 1 | `TR-G` | wrapped exit 0 | `evidence/CRITIC-CKPT-F2-20261009/neighbourhood-tr-g.txt` |
| neighbourhood 2 | `^(?!.*(TR-G\|CRITIC-CKPT))` | wrapped exit 1; 122 tests, 117 pass, 3 fail, 2 skipped. The 3 fails are the baseline reds recorded above: the two 10 s runner timeouts (orchestrating-session-never-limited, orchestrator-sink-bounded) and `R7-11a`. No new red. | `evidence/CRITIC-CKPT-F2-20261009/neighbourhood-rest.txt` |

Native: `node --test plugins/pipeline-core/lib/dispatch-policy.test.mjs` through `capture-evidence.mjs`, wrapped exit 0 (DP26 and DP27 green
at 65); the capture was written to `evidence/CRITIC-CKPT-F2-20261009/dispatch-policy.txt` but is NOT committed, because
`capture-evidence.mjs` reported an absolute host path in it outside its redaction boundary. `node --test harness/scripts/check-consumer-safe-paths.test.mjs`
exit 0 (9 tests, 9 pass).

Open items for the dispatcher (not fixed here, outside the briefed scope):

- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` (native, exit 1) compares the on-disk raw sha256 of
  six files with `codex-isolated-critic-protected-preimage.v1.json`. It was already red for five paths this change did not touch
  (`harness/review-protocol.md`, `scripts/codex-critic-host.mjs`, `skills/critic-review/SKILL.md`, `roles/critic.md`,
  `templates/prompts/critic-review.md`) and now also names `agents/critic.md`; the refresh of that inventory has to include the new
  `agents/critic.md` hash.
- `agents/critic.md` still says, in the bootstrap section, "For native isolation, confirm that no write tools are available; otherwise
  stop with bootstrap failure". With `Write, Edit` in `tools` that sentence now contradicts the definition; the briefed step list
  did not include it, so it is left for the next canon slice.
- `scripts/afk-claude-host.test.mjs:118` rewrites a `tools: Read, Grep, Glob` pair; whether it touches `critic.md` was not read.

Independent Critic review: pending.
