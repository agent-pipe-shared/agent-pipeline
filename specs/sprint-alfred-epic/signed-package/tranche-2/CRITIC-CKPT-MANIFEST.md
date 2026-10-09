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
