# K120-NODE-TEST-CONTEXT-CHECK-VERDICT notes (Goldfish, clone scratch/clones/k120)

Ruleset 0.7.0+claude.20261022204428.79cda46. Base: main (clone HEAD 485520ec5, `git pull --ff-only`: already up to date).

## Cause
Under `node --test <file>` the parent sets NODE_TEST_CONTEXT=child-v8. `executeGovernedItemDeliveryChecks`
(plugins/pipeline-core/lib/native-goldfish-host-state.mjs) builds the check child env with `agyHostGitEnvironment()`
(strips GIT_* only); a nested `node --test unit.test.cjs` that inherits the variable exits 0 with EMPTY output although
its test fails -> `SQ-TARGETED-CHECKS-PASSED` (NGHS09 wants FAILED), NGHS13 `requalified` instead of `targeted-failed`.

## Change (smallest, one line + comment)
`delete checkEnv.NODE_TEST_CONTEXT;` in `executeGovernedItemDeliveryChecks`, next to the existing
`PIPELINE_VERIFY_CASE_COMPLETION_*` deletions. Decision: strip in the delivery-check spawn only, NOT in
`agyHostGitEnvironment`. Reasons: the builder's contract is "git's ambient controls" (its doc comment) and it has 15+
call sites (git spawns in native-goldfish-host-state, agy-host-commit-execution, agy-host-observed-local-readback,
agy-host-commit-admission, portable-agy-authorship-export); NODE_TEST_CONTEXT is meaningless to git, so a builder
change would alter nothing useful and widen the blast radius of a kernel module. The only `node --test` spawn fed by a
builder env is this one. Other callers of `executeGovernedItemDeliveryChecks` (agy-session-dispatch.mjs:339, host-state
lines 826 and 1377) get the fix through the function; none behaves differently otherwise. The existing source-fact pin
`consumer-spec-criterion-binds-the-first-item-delivery` (regex on the spawn line) is untouched by the change.

## Pin (RED first)
`plugins/pipeline-core/lib/pins/governed-check-child-ignores-inherited-node-test-context.test.mjs` (2 cases; sets
NODE_TEST_CONTEXT=child-v8 itself, real git fixture, real product path; failing check must be FAILED with non-empty
child output; passing check must stay PASSED).
- RED on unchanged product: `node --test scratch/clones/k120/.../governed-check-child-ignores-inherited-node-test-context.test.mjs` -> 0 pass / 2 fail
  (case 1: got SQ-TARGETED-CHECKS-PASSED, status 0, stdoutSha256 e3b0c442... = empty; case 2: empty stdout assertion).
- GREEN with the fix: same command -> 2 pass / 0 fail.

## Counted results (all commands run from the main checkout, one at a time)
- `node --test --test-name-pattern=NGHS09 scratch/clones/k120/plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`: before (K119) red; after 1/1 green.
- same with `NGHS13`: before red; after 1/1 green (~71 s).
- whole file ONCE, alone: `node --test scratch/clones/k120/plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`
  -> tests 38, pass 38, fail 0, cancelled 0, skipped 0, duration ~1014 s (before, K119: 38 tests, 2 failing = 36/38; the
  briefing's "37/39" figure was not reproduced: the file registers 38 cases).
- `node --test scratch/clones/k120/harness/scripts/check-consumer-safe-paths.test.mjs`: 9/9 pass.
No assertion in NGHS or elsewhere was weakened, skipped or removed.

## Deliverables
- Clone commit (unprotected): `c58580028 test(host-state): pin that a governed delivery check verdict ignores an inherited NODE_TEST_CONTEXT` (the pin file only; trailers AI-Assisted: true, Dispatch: K120-NODE-TEST-CONTEXT-CHECK-VERDICT (goldfish)).
- Protected diff (2 files: native-goldfish-host-state.mjs [kernel path], harness/verify-suites.json [TP-13]):
  `scratch/agent-out/K120-NODE-TEST-CONTEXT-CHECK-VERDICT-k120-protected.diff`. Operator commit message draft:
  `scratch/agent-out/K120-msg.txt` (trailers `AI-Assisted: true`, `Dispatch: stage-0 (elephant)`).
- Clone working tree reverted by hand: `git -C scratch/clones/k120 status --short` is empty.
- Note: the pin is green only with the protected diff applied (it documents the contract); it fails without it by design.

## Applicability
- `git apply --check` of the diff in the main checkout: clean.
- Throwaway clone `scratch/clones/k120-check` of `scratch/clones/k108` (HEAD cf977e3b8, index read via `git read-tree HEAD`, no checkout), via `node scratch/k120-apply.mjs` (`git apply --check --cached`): clean with plain apply, status 0; `--3way` also clean. Operator uses the diff as is; no rebased variant needed. (The native-goldfish-host-state.mjs hunk is at line ~1232 and the verify-suites.json hunk sits in the pins block; both context windows match the k108 state.)

## NODE_TEST_CONTEXT in runners (read-only)
`rg -n NODE_TEST_CONTEXT scripts harness`: `scripts/sitting-count-pass.mjs:113` and `scripts/run-quiet.mjs:23`, `scripts/run-parallel.mjs:73` DELETE it from the child env (and sitting-count-pass.test.mjs SCP05 pins that). `harness/` has no occurrence. The verify runner (`plugins/pipeline-core/scripts/verify-journal.mjs`, `executeSuite`) starts each suite as `node <suite file>` (no `--test`), so it never sets the variable and passes the caller's env through untouched (off win32). Conclusion: the counted run via sitting-count-pass.mjs was not affected; a verify run started from a plain shell was not affected either; only a run launched as `node --test <file>` (as K119 did) inherits it.

## Risks / open
- Only delivery-check children are changed; a check that intentionally relied on the outer runner context (none found) would now run as a normal top-level `node --test`.
- Architecture ratchet (architecture/boundary-policy.json): not run; change adds 0 imports and 1 code line (+2 comment lines) in an existing module.
- Open: independent Critic read, operator commit of the protected parts (host-state fix + verify-suites registration), PO acceptance; verify gate not run.

## Proposed commit message (clone pin commit, as committed)
test(host-state): pin that a governed delivery check verdict ignores an inherited NODE_TEST_CONTEXT
AI-Assisted: true
Dispatch: K120-NODE-TEST-CONTEXT-CHECK-VERDICT (goldfish)
