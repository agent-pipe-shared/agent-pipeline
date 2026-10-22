# Counted runs for five open `agent` clauses, 2026-10-22

Each block is the verbatim capture-evidence output (command, exit code, HEAD, tree, dirty flag, runner summary) of one serial run on Linux/WSL, machine otherwise idle, one heavy suite at a time. Native Windows runs are NOT part of this record and remain pending on the native host.

| Id | Item | Command | Exit | Counts |
|---|---|---|---|---|
| a | pipeline.agent-obligations-recommends-a-commit-spelling-guard-push-refuses | `node --test harness/scripts/generate-agent-obligations.test.mjs` | 0 | 13 cases, 13 pass, 0 fail, 0 skip, 0 todo |
| b1 | pipeline.goldfish-bugfix-module-conflicts-with-qg-04 (dispatch-briefing suite) | `node --test plugins/pipeline-core/scripts/dispatch-briefing.test.mjs` | 0 | 46 cases, 46 pass, 0 fail, 0 skip, 0 todo |
| b2 | pipeline.goldfish-bugfix-module-conflicts-with-qg-04 (criterion-bound pin) | `node --test plugins/pipeline-core/lib/pins/goldfish-bugfix-module-conflicts-with-qg-04.test.mjs` | 0 | 6 cases, 6 pass, 0 fail, 0 skip, 0 todo |
| c | pipeline.worktree-process-start-parser-misreads-spaced-comm (Linux/WSL run, L-1 and L-2 executed) | `node --test plugins/pipeline-core/lib/pins/worktree-process-start-parser-misreads-spaced-comm.test.mjs` | 0 | 7 cases, 6 pass, 0 fail, 1 skip, 0 todo |
| d | pipeline.node-v24-on-windows-creates-a-real-nul-file (pin; acceptance 2 cross-reference case) | `node --test plugins/pipeline-core/lib/pins/node-v24-on-windows-creates-a-real-nul-file.test.mjs` | 0 | 14 cases, 14 pass, 0 fail, 0 skip, 0 todo |
| e1 | pipeline.git-for-windows-2-56-rejects-git-config-global-nul and node-v24 acceptance 2 (real git with GIT_NULL_DEVICE) | `node --test plugins/pipeline-core/lib/git-null-device-sites.test.mjs` | 0 | 8 cases, 8 pass, 0 fail, 0 skip, 0 todo |
| e2 | same two items (R7-1a ratchets: no NUL literal and no inline /dev/null for a git value) | `node --test plugins/pipeline-core/lib/worktree-lifecycle.test.mjs` | 0 | 81 checks PASS, 0 FAIL (script-style suite wrapped by one node:test case) |

## a: pipeline.agent-obligations-recommends-a-commit-spelling-guard-push-refuses

```
command: node --test harness/scripts/generate-agent-obligations.test.mjs
label: a-generate-agent-obligations
exitCode: 0
head: da6a48021390768841f1ab025b84862d5f146b49
tree: fffbcc5e755969ffdeccca34dec7f476ed6364eb
dirty: false
--- stdout ---
✔ AC-2: the committed document is byte-identical to a fresh generation (182.833717ms)
✔ AC-2b: the vendored plugin copy is byte-identical to the canonical document (0.787756ms)
✔ AC-3 (drift): a protected path added at the source changes the generated document (329.318045ms)
✔ AC-4: every protected path appears verbatim, and the count is stated (0.799689ms)
✔ AC-4: the no-in-session-override fact is stated with its citation, not as folklore (0.614557ms)
✔ AC-3: the draft-phase exempt prefixes come from the guard's own constant (0.528694ms)
✔ AC-5: liftability is delegated to the repair map, never copied (0.635727ms)
✔ AC-9 (contract): the command §5 prints is the command the lifecycle guard admits (3.744652ms)
✔ AC-106 (contract): the commit spelling the document recommends is admitted by guard-push (626.7404ms)
✔ AC-106 (contract): the recommended commit spelling is admitted by every guard in the union, not only guard-push (2829.709072ms)
✔ AC-106 (contract): guard-lifecycle-ready admits the recommended commit spelling and refuses a composed near-miss (1917.929324ms)
✔ AC-7: the document carries no absolute or machine-specific path (0.543332ms)
✔ AC-1: a hand-maintained line is marked as such, so the boundary is visible (0.435177ms)
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6707.002949

--- stderr ---
```

## b1: pipeline.goldfish-bugfix-module-conflicts-with-qg-04 (dispatch-briefing suite)

```
command: node --test plugins/pipeline-core/scripts/dispatch-briefing.test.mjs
label: b-dispatch-briefing
exitCode: 0
head: da6a48021390768841f1ab025b84862d5f146b49
tree: fffbcc5e755969ffdeccca34dec7f476ed6364eb
dirty: false
--- stdout ---
✔ binding fields equal the facts of their own sources (81.564642ms)
✔ effort and tool budget follow the goldfish-deep definition (6.696217ms)
✔ effort and tool budget follow the goldfish-implementor definition (4.549208ms)
✔ effort and tool budget follow the goldfish-mechanic definition (4.470525ms)
✔ the criterion locator validates against the original bytes (5.772729ms)
✔ the block round-trips the host parser and the skeleton carries the marker once (4.721867ms)
✔ the skeleton prefills field 6 and leaves judgment fields as placeholders (4.146996ms)
✔ the skeleton names the slice and write scope the item admission reads (PF-42) (4.932437ms)
✔ the skeleton names the owning module, its allowed dependencies and contract for the touched paths (FB3-PF-54) (14.694757ms)
✔ a dispatch id that names a governed queue row must match its write scope, item and state (PF-47) (14.131257ms)
✔ refuses a missing acceptance row names the slug (1.805489ms)
✔ refuses an unknown agent type (1.42096ms)
✔ refuses a check that is not a test file (1.009797ms)
✔ refuses an unknown flag (0.835096ms)
✔ refuses a repeated single-value flag (0.7425ms)
✔ refuses a missing required flag (0.84777ms)
✔ refuses a flag without a value (1.592974ms)
✔ refuses a model outside the alias family (2.306029ms)
✔ refuses an unavailable ruleset identity (2.754421ms)
✔ refuses a preflight without a ruleset source (2.407422ms)
✔ refuses a dispatch id carrying the binding marker (0.819246ms)
✔ refuses a path that escapes the repository (0.90035ms)
✔ refuses an unreadable spec (1.358059ms)
✔ refuses no spec flag and no authority default (1.007062ms)
✔ refuses an agent type without a definition (1.817121ms)
✔ refuses an unknown subcommand (1.686918ms)
✔ the binding invariant refuses a check that is not among the allowed paths (5.102827ms)
✔ a backlog item without an id falls back with a warning (8.832094ms)
✔ a path matching a protected-baseline rule yields a warning with the rule id (7.097619ms)
✔ output is deterministic and independent of path order and duplicates (5.650911ms)
✔ the spec defaults to the project authority state when --spec is absent (3.531387ms)
✔ real git: HEAD and tree come from the repository, an uncommitted spec warns, nothing is written (114.413195ms)
✔ the command line prints a typed refusal as JSON and exits 2 (848.431215ms)
✔ build renders the complete briefing: the binding parses back, the fields match the package, the marker verifies (9.121152ms)
✔ a one-byte edit or a removed marker fails the generated-briefing verification (4.033821ms)
✔ build refuses a named path that does not exist unless the package declares it new (6.228188ms)
✔ build refuses an unknown package key and a missing required field, each naming its repair (2.918572ms)
✔ build refuses a repository without a calibration and names how to calibrate (1.758139ms)
✔ build --out writes the verified briefing under scratch/ and refuses any other target (4.483255ms)
✔ the generated briefing prescribes the test-first order in one dispatch (AC-186, PO 2026-10-21) (3.172124ms)
✔ the generated briefing carries the targeted, quick and final Verify routes in order and never invents a quick command (AC-187) (4.581501ms)
✔ a project that calibrates no Verify command still gets targeted -> quick -> final Verify, with the absence stated (AC-187) (4.693834ms)
✔ an estimate above the tier cap binds the deep tier; above the deep cap it needs a grant rationale (25.800122ms)
✔ an Evidence cell without a backlog item names the repair (2.684729ms)
✔ the dispatch admission (D78) admits a generated briefing and refuses an edited or hand-assembled item briefing (6.554177ms)
✔ init-dispatch-record prints a valid opening v4 record whose digests come from the generated briefing (AC-163) (10.934105ms)
ℹ tests 46
ℹ suites 0
ℹ pass 46
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2137.412078

--- stderr ---
```

## b2: pipeline.goldfish-bugfix-module-conflicts-with-qg-04 (criterion-bound pin)

```
command: node --test plugins/pipeline-core/lib/pins/goldfish-bugfix-module-conflicts-with-qg-04.test.mjs
label: b-goldfish-bugfix-pin
exitCode: 0
head: da6a48021390768841f1ab025b84862d5f146b49
tree: fffbcc5e755969ffdeccca34dec7f476ed6364eb
dirty: false
--- stdout ---
✔ P1 BUGFIX module (both copies) lets the owner write, RED-run and keep the repro (4.881381ms)
✔ P2 QG-04 and GF-04 state the same outcome-owned-regression rule (4.245312ms)
✔ P3 BUGFIX module itself carries the examiner/repro hard ban (item option b) (1.365714ms)
✔ P4 root template and vendored copy are byte-identical (1.325187ms)
✔ P5 no document still forbids the implementing Goldfish from creating tests (9.120261ms)
✔ RED mirror: the checkers fail on the pre-fix and a split-dispatch module (0.380974ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 160.925416

--- stderr ---
```

## c: pipeline.worktree-process-start-parser-misreads-spaced-comm (Linux/WSL run, L-1 and L-2 executed)

```
command: node --test plugins/pipeline-core/lib/pins/worktree-process-start-parser-misreads-spaced-comm.test.mjs
label: c-worktree-process-start-pin
exitCode: 0
head: da6a48021390768841f1ab025b84862d5f146b49
tree: fffbcc5e755969ffdeccca34dec7f476ed6364eb
dirty: false
--- stdout ---
✔ S-1 the real parser returns kernel field 22 for spaced and parenthesised comm names (2.863318ms)
✔ S-2 both identity call sites route through the one validated parser (0.548682ms)
✔ S-3 malformed, truncated or non-numeric stat data yields null, never a verified identity (0.719998ms)
✔ S-4 two spaced-name stat lines with different start ticks are distinguishable (reused PID is not the owner) (0.391493ms)
﹣ H-1 a Linux-platform inspection with an unreadable /proc stat is typed unavailable, not live or reused (0.202675ms) # host-limitation: /proc is readable on Linux; unreadable-stat path covered by S-3
✔ L-1 a real spaced-comm process: the descriptor records and re-reads the kernel starttime (115.009484ms)
✔ L-2 a verify-run lock keeps its spaced-comm writer live and treats another spaced process's identity as a reused PID (326.488374ms)
ℹ tests 7
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 606.964735

--- stderr ---
```

## d: pipeline.node-v24-on-windows-creates-a-real-nul-file (pin; acceptance 2 cross-reference case)

```
command: node --test plugins/pipeline-core/lib/pins/node-v24-on-windows-creates-a-real-nul-file.test.mjs
label: d-node-v24-nul-pin
exitCode: 0
head: da6a48021390768841f1ab025b84862d5f146b49
tree: fffbcc5e755969ffdeccca34dec7f476ed6364eb
dirty: false
--- stdout ---
✔ A1: no "NUL" literal is a Node open target in any repository JS source (1436.650371ms)
✔ A1: a native run of this pin left no real NUL file in the repository root (0.625538ms)
✔ RED mirror: scanner flags openSync (0.433453ms)
✔ RED mirror: scanner flags openSyncSingleQuote (0.236008ms)
✔ RED mirror: scanner flags writeFileSync (0.27863ms)
✔ RED mirror: scanner flags createWriteStream (0.23145ms)
✔ RED mirror: scanner flags callSplitAcrossLines (0.338172ms)
✔ RED mirror: scanner flags boundConstant (0.670292ms)
✔ RED tree: a scratch mirror tree holding an offender makes the tree scan fail (4.857324ms)
✔ A2: GIT_CONFIG_GLOBAL set to the NUL spelling is allowed (read by git, not opened by Node) (0.789409ms)
✔ A2: the allowance does not shelter an actual open of NUL beside a git env key (0.517413ms)
✔ acceptance 2: the git null-device rule has live enforcers beside this scanner (shared constant, ratchets, real git) (2.723743ms)
✔ allowances: comments and non-open string uses are not offences (1.076504ms)
✔ os.devNull as an open target creates no NUL file in the working directory (58.423588ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1720.363033

--- stderr ---
```

## e1: pipeline.git-for-windows-2-56-rejects-git-config-global-nul and node-v24 acceptance 2 (real git with GIT_NULL_DEVICE)

```
command: node --test plugins/pipeline-core/lib/git-null-device-sites.test.mjs
label: e-git-null-device-sites
exitCode: 0
head: da6a48021390768841f1ab025b84862d5f146b49
tree: fffbcc5e755969ffdeccca34dec7f476ed6364eb
dirty: false
--- stdout ---
✔ calibration-verify-commit-transition.mjs: no win32 "NUL" literal as a git env or -c value (5.31837ms)
✔ calibration-verify-commit-transition.mjs: git null-device values come from GIT_NULL_DEVICE (1.276254ms)
✔ critic-verify-lifecycle.mjs: no win32 "NUL" literal as a git env or -c value (1.040827ms)
✔ critic-verify-lifecycle.mjs: git null-device values come from GIT_NULL_DEVICE (0.473259ms)
✔ shared constant is /dev/null (0.72691ms)
✔ critic-verify-lifecycle courseGitBytes hands the stub git the GIT_NULL_DEVICE env values (1.199718ms)
✔ real git accepts GIT_CONFIG_GLOBAL=GIT_NULL_DEVICE (exit 0) (7.738706ms)
✔ real git runs through courseGitBytes with the constant (7.183583ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 955.354156

--- stderr ---
```

## e2: same two items (R7-1a ratchets: no NUL literal and no inline /dev/null for a git value)

```
command: node --test plugins/pipeline-core/lib/worktree-lifecycle.test.mjs
label: de-worktree-lifecycle-ratchets
exitCode: 0
head: da6a48021390768841f1ab025b84862d5f146b49
tree: fffbcc5e755969ffdeccca34dec7f476ed6364eb
dirty: false
--- stdout ---
PASS D0-01 branch mapping is canonical and traversal is rejected
PASS D0-02 detached mapping binds purpose and full OID
PASS D0-03 symlink parents and case-fold aliases fail before creation
PASS D0-04 branch creation records exact canonical state and one /branch/ exclusion
PASS D0-05 protected or sole-copy content cannot enter a cleanup manifest
PASS D0-06 changed canary and same-prefix decoy remain untouched and block cleanup
PASS D0-06 sealed coordinator scratch may refresh its tree after an allowed child write
PASS D0-06 a registered but unmaterialized scratch intent drains after creator crash
PASS D0-06 dirty detached worktree blocks, then exact cleanup drains its manifest
PASS D0-06 interrupted cleanup recovers from cleanup-intent without a second target
PASS D0-10 stale same-session writer lock recovers while a foreign lock blocks
PASS D0 Verify cleanup registration accepts only the private Git-common run root
PASS D0 Verify cleanup removes one exact closed run and preserves an unregistered sibling
PASS D0 Verify cleanup blocks a live writer but retires its exact stale creating run
PASS D0 Verify cleanup fails closed for missing or malformed run ownership locks
PASS D0-07 hygiene reports only redacted classifications and rejects noncanonical registration
PASS D0-07 missing Git registration preserves session counts and independent noncanonical findings
PASS D0-07 hygiene still throws an unsafe canonical-path error
PASS D0-07 hygiene ignores dirty state made only of onboarding-generated paths
PASS D0-07 hygiene still flags current-worktree-dirty when a genuinely foreign path is dirty
PASS D0-09 post-commit cleanliness: cleanup drains session scratch after a real deliverable commit, leaving committed content untouched
PASS D0-08 clean migration creates/verifies canonical copy before removing old registration
PASS D0-08 injected migration failure at target-created retains an exact recoverable copy
PASS D0-08 injected migration failure at target-verified retains an exact recoverable copy
PASS D0-08 injected migration failure at source-removed retains an exact recoverable copy
PASS D0-08 injected migration failure at branch-attached retains an exact recoverable copy
PASS D0 worktree CLI denies unmanaged dispatch before creation while cleanup still drains owned scratch
PASS D0 worktree CLI honors an explicit --runner over the CLAUDECODE-derived boundary default
PASS D0 worktree CLI derives the boundary runner from an absent CLAUDECODE and fails closed on an invalid explicit --runner
PASS D0 session descriptor is private, bound to one common dir and retires only after cleanup
PASS D0 session owner runtime status is sanitized, detects PID reuse, and preserves legacy descriptors
PASS CSW-T a live second session in the same repository fires the concurrent-session warning on this host platform
PASS CSW-T control: a second session whose owner pid does not exist never fires the concurrent-session warning
PASS CSW-T2 a win32 registration records the owner pid and the host boot minute in the existing processStartId slot
PASS CSW-T2 opt-in reads a win32 owner as probably live; the default read keeps the typed unavailable; other platforms stay unavailable
PASS CSW-T2 the boot-minute comparison tolerates exactly one minute either way and reads a larger gap as reused
PASS CSW-T2 a rebooted host reads a recorded win32 owner as reused and a vanished owner process as not-live, never as probably live
PASS CSW-T2 on this host the default read and the opted-in read follow the platform table
PASS CSW-T2 the concurrent-session warning for a probably live win32 owner is marked probable and says probably live
PASS CSW-T2 the warning fires one minute either side of the recorded boot minute and stays silent beyond it, after a reboot, and for a vanished owner
PASS CSW-T2 retirement, external-archive and orphan-archive reads never act on a probably live owner and expose no probable marker
PASS CSW-T2 only the concurrent-session warning opts into probable liveness: no other production module passes probableLiveness
PASS D0 session-cleanup CLI accepts descriptor ownership without receiving the nonce
PASS D0 descriptor-only session closes cleanly without inventing a temporary manifest
PASS D0 descriptor digest drift blocks CLI cleanup before any registered resource is removed
PASS D0 CLI reports a blocked cleanup with exit 2
PASS D0 parser accepts NUL porcelain without path guessing
PASS Git worktree porcelain paths are native and physical at discovery
PASS WT-LOCAL-WINDOWS-ASSURANCE auto-remediates a pre-existing insecure directory instead of only failing closed
PASS WT-LOCAL-WINDOWS-ASSURANCE still fails closed when a pre-existing directory cannot be remediated
PASS WT-LOCAL-WINDOWS-ASSURANCE closes the ancestor-skip gap: an insecure existing ancestor is remediated even when directories were created below it
PASS WT-LOCAL-WINDOWS-ASSURANCE does not re-harden an already-secure existing ancestor
PASS WT-LOCAL-WINDOWS-ASSURANCE still hardens every newly-created component outright, without assessing them first
PASS D0-TO01 runGit forwards an explicit timeout to the underlying spawn call
PASS D0-WSPAWN runGit accepts WSL EPERM only after status zero and keeps non-zero or missing status closed
PASS D0-TO02 runGit omits timeout entirely (stays undefined, not 0/null) when the caller passes none
PASS D0-TO03 discoverRepository forwards its options.timeout down to every git spawn it makes
PASS D0-CEIL-01 a git-less directory below GIT_CEILING_DIRECTORIES never resolves to the repository above the ceiling
PASS D0-CEIL-02 without the variable discovery is unchanged: the enclosing checkout is found, no ceiling reaches Git and the fixed GIT_* values stay
PASS D0-CEIL-03 a repository below the ceiling, and a repository whose root is itself the ceiling, are still found
PASS D0-CEIL-04 a ceiling at the repository root refuses a subdirectory start (Git's own semantics, now visible to production)
PASS D0-TMP-IGN listActiveSessionDescriptors ignores abandoned atomic write temporary files
PASS RF2A archive moves a V2 null-owner descriptor byte-exactly to archived/<id>.<sha>.json with one audit record, deletes nothing, and a second run is a no-op
PASS RF2A archive moves a V1 field-absent descriptor byte-exactly to archived/<id>.<sha>.json with one audit record, deletes nothing, and a second run is a no-op
PASS RV-1: V2 null-owner descriptor is unavailable, never not-live, and the orphan-archive gate accepts it without inferring a dead owner
PASS RV-1: V1 field-absent descriptor is unobserved, never not-live, and the orphan-archive gate accepts it without inferring a dead owner
PASS RF2A archive refuses a manifest, the requester's own session, digest drift, hardlink, symlink, an existing target, a placeholder operator and an observable owner, and never deletes
PASS FLAPW list-all skips a descriptor retired between listing and its load and still returns the survivors
PASS FLAPW list-all treats a descriptor that vanishes at before-check as absent, never as malformed or non-private
PASS FLAPW a required load of a descriptor that vanishes at before-check is still WT-SESSION-MISSING, never an absent result
PASS FLAPW list-all treats a descriptor that vanishes at before-read as absent, never as malformed or non-private
PASS FLAPW a required load of a descriptor that vanishes at before-read is still WT-SESSION-MISSING, never an absent result
PASS FLAPW classifyActiveSessionDescriptors skips a descriptor retired between its listing pass and its classification load
PASS FLAPW a published descriptor that is still present fails closed when malformed, in the loader and in list-all
PASS FLAPW a published descriptor that is still present fails closed when multi-linked, in the loader and in list-all
PASS FLAPW an in-flight atomic-write temporary file holding partial bytes is never listed or loaded
PASS R7-1a behavioural (RED on win32 today; may PASS on POSIX, which already uses /dev/null): runGit succeeds against a git that rejects NUL-like null devices
PASS R7-1a ratchet detector self-check: flags a win32 NUL ternary and an inline /dev/null for a git value, ignores look-alikes and the shared GIT_NULL_DEVICE constant
PASS R7-1a ratchet: no production module (lib, scripts, hooks) assigns a "NUL" literal to a git environment or -c value
PASS R7-1a ratchet: no *.test.mjs fixture (lib, scripts, hooks) assigns a "NUL" literal to a git environment or -c value (fixtures may keep /dev/null)
PASS R7-1a single-source ratchet (RED until every site is converted): no production module (lib, scripts, hooks) spells an inline /dev/null git value; each takes GIT_NULL_DEVICE

81/81 checks passed.
✔ plugins/pipeline-core/lib/worktree-lifecycle.test.mjs (29515.067209ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 29533.035744

--- stderr ---
```

