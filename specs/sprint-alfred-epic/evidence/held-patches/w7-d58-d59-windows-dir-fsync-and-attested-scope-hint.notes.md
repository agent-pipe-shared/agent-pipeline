# D58/D59: Windows directory fsync EPERM and attested-record scope hint (CHECKPOINT, no patch yet)

State: RED cases written in the scratch clone and run RED against the unchanged code; NO production edit, NO GREEN, NO patch file. Candidate a79923a9df3e72cf934b858e8f5b4781555d72d1. Driver `scratch/agent-out/w7ce/driver.mjs` (modes setup, setup2, run LABEL files..., patch, check, cleanup); clones `scratch/agent-out/w7ce/clone` (holds the RED edits) and `clone2` (pristine baseline) exist. Delete with `node scratch/agent-out/w7ce/driver.mjs cleanup`. The older `scratch/agent-out/w7cd/` clones belong to PF-93 (a cleanup of them was refused by the classifier; left untouched).

## Causes re-verified at the candidate
- D58: `plugins/pipeline-core/lib/critic-generic-batch.mjs` `durable()` lines 92-102: file `fsyncSync(fd)` at line 96 (inside try/finally, any error propagates to `invoke`, which maps a non-GCB error to CGB-PHYSICAL with `cause` = errno code), then lines 98-101 open the parent directory and `fsyncSync(parent)` inside `try { } catch { fail("CGB-PHYSICAL"); }`. That bare catch drops the errno and tolerates nothing, so a Windows directory EPERM aborts every write. The file fsync at line 190 (`writeFileSync(fd,...); fsyncSync(fd)`) is a second file fsync, not a directory one.
- Other directory fsyncs in plugins/pipeline-core/lib and scripts: the rg for `fsyncSync(` was refused by the shell grammar (flag spelling) and not re-run within budget; the only file-wide hits seen in critic-generic-batch.mjs are lines 96, 99, 190. A repo-wide sweep for other directory fsync sites remains to be done (follow-up, change nothing outside the four slice files).
- D59: `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` lines 633-637: for an orchestrator-attested v4 record `attestedUncovered` (changed paths not covered by `declaredPaths(record)`) returns `result(sha, FAIL, "record-paths-do-not-cover", "record does not declare N changed path(s): ...", { taskId, uncovered })`. No queue/state class, rule or repair is named. `result(sha, verdict, classification, reason, extra)` is at line 326.
- CGB-PHYSICAL has at least two causes: this slice addresses the Windows directory fsync EPERM; PF-93 (legacy packet, CPP-COORDINATOR-BINDING hidden by the bare catch at about line 503) is covered by the other slice (w7-pf93 c4).

## Design (not implemented)
D58: add an exported mutable seam object `genericCriticBatchIo = { platform: process.platform, fsyncFileFn: fsyncSync, fsyncDirFn: fsyncSync }` (the public functions take exact-shape inputs, so `deps` cannot ride on the input; tests mutate and restore the object). In `durable()`: file fsync through `io.fsyncFileFn`, errors become `GenericCriticBatchError("CGB-PHYSICAL")` with `cause = error.code` (string) and `step = "file-fsync"`; directory fsync through `io.fsyncDirFn`, an error whose code is EPERM while `io.platform === "win32"` is tolerated (also EINVAL/ENOTSUP only if the code already treats them as unsupported elsewhere; not checked), every other error fails CGB-PHYSICAL with `cause` and `step = "directory-fsync"`. No paths in cause/step.
D59: in the attested branch compute `queueOrStatePaths = attestedUncovered.filter(p => /(^|\/)[^/]*(queue|state)[^/]*$/iu.test(p))`; reason text gains, when non-empty, "queue or state file(s) in this commit are outside the briefing; an orchestrator-attested record covers only the briefed paths (security property, not relaxed); repair: commit the queue or state file in its own commit, then the briefed paths"; add `queueOrStatePaths` to extra (empty array otherwise). Code `record-paths-do-not-cover` and `uncovered` unchanged.

## RED cases written (clone only, run against unchanged code, exit 1)
`plugins/pipeline-core/lib/critic-generic-batch.test.mjs` (completion ids extended to CGB033; adds `import * as CGB` and `fsyncSync` import; helper `withIo`):
- CGB029 directory fsync EPERM on win32 completes the write: RED
- CGB030 same EPERM on linux fails CGB-PHYSICAL with cause EPERM and step directory-fsync: RED
- CGB031 non-EPERM (EIO) directory error still fails on win32: RED
- CGB032 file fsync EPERM stays strict on win32 (step file-fsync): RED
- CGB033 default seams equal real platform and real fsync: RED (genericCriticBatchIo undefined)
`plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs`:
- "D59 an attested record refusal names the queue/state path class, the rule and the repair; the code is unchanged": RED (`queueOrStatePaths` undefined). Existing D56-3b assertions untouched.
RED log: `scratch/agent-out/w7ce/red.critic-generic-batch.test.mjs.log` and `red.dispatch-authorship-verify.test.mjs.log` (machine-written by driver `run`). Note CGB030 and CGB031 pass-through may behave differently after implementation because `invoke` maps unknown errors itself; they are RED today only because the seam is absent.

## Not done
Production edits, GREEN, whole-file runs in clone and clone2 with failing-name comparison, patch file, apply check, other-fsync sweep. No file in the repository under plugins/ was edited.
Proposed commit message: `fix(critic): tolerate the Windows directory fsync EPERM and name the attested record scope repair (Toolbox D58, D59)`.
Operator flow when the patch exists: `git apply` the patch, `git add -u` limited to the four slice paths, `--no-verify` commit, stamp, install. No file touched matches TP-1..TP-13. Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Continuation card
Done: driver, both clones at candidate, recon, design, six RED cases RED. Remaining: implement in clone `critic-generic-batch.mjs` and `dispatch-authorship-verify.mjs`, run the six cases GREEN, whole test files in clone vs clone2, `driver patch`, `driver check`, finalize this note, cleanup. Next step: Edit clone `durable()` and the attested branch as designed, then `node scratch/agent-out/w7ce/driver.mjs run green plugins/pipeline-core/lib/critic-generic-batch.test.mjs plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs`.
