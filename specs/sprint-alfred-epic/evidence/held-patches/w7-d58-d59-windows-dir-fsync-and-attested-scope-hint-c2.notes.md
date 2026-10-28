# D58/D59 c2: Windows directory fsync EPERM and attested-record scope hint (IMPLEMENTED, patch verified)

Supersedes `w7-d58-d59-windows-dir-fsync-and-attested-scope-hint.notes.md` (the first notes, a RED-only checkpoint). Candidate a0bccc215cd9e23c1a96bcf17d792f2a9eaf5cfe. Patch: `w7-d58-d59-windows-dir-fsync-and-attested-scope-hint-c2.patch` (git diff --binary, 4 files, +78/-7). Nothing under plugins/ was edited in the repository; all edits were made in a scratch clone and travel only in the patch.

## State
Done: production edits, six cases RED (earlier, against unchanged code) then GREEN, whole-file runs, patch, apply check. The earlier clone state was re-pointed to the briefing candidate (the test edits carried over; candidates differ only by evidence files).

## Cause and exact changes
- D58, `plugins/pipeline-core/lib/critic-generic-batch.mjs` `durable()`: the parent-directory `fsyncSync` sat in a bare `catch { fail("CGB-PHYSICAL") }` that dropped the errno and tolerated nothing. Now: new exported mutable seam `genericCriticBatchIo = { platform, fsyncFileFn, fsyncDirFn }` (defaults: process.platform, fsyncSync); file fsync goes through `fsyncFileFn` and stays strict; the directory fsync tolerates ONLY `EPERM` and ONLY when `io.platform === "win32"`; every other directory error (and EPERM elsewhere) throws `GenericCriticBatchError("CGB-PHYSICAL")` with `cause` = error code and `step` = `file-fsync` or `directory-fsync` (helper `physicalStep`; no paths). EINVAL/ENOTSUP were not added: the briefing allowed them only if already treated as unsupported in this module, and they are not.
- D59, `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` attested branch: code `record-paths-do-not-cover` and `uncovered` unchanged; the reason now names the path class (queue or state file(s) vs other), the rule (an orchestrator-attested record covers only the briefed paths) and the repair (commit the queue or state file in its own commit, then the briefed paths); `queueOrStatePaths` added to the result extra. The check itself is not relaxed.

## Cases
- RED (earlier, unchanged code, exit 1): CGB029-CGB033 in critic-generic-batch.test.mjs and the D59 case in dispatch-authorship-verify.test.mjs (6 cases).
- GREEN (clone, patched): critic-generic-batch.test.mjs exit 0, tests 33 pass 33 fail 0 (CGB029 to CGB033 green); dispatch-authorship-verify.test.mjs exit 0, tests 74 pass 74 fail 0 (D59 green). Logs: `scratch/agent-out/w7ce/green.*.log` (deleted at cleanup).
- Baseline (clone2, unpatched, same files): both exit 0, failing-name set empty; patched failing-name set empty; identical, no pre-existing failure. No existing case was changed, weakened or skipped.
- Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.

## Directory fsync sweep (follow-up, nothing changed; `rg -n "fsyncSync\("` per directory, heuristic, line numbers at the candidate)
Directory-handle fsyncs with no win32 tolerance seen (verify each by hand; the lib listing was long, 188 hits, and only partly reviewed):
- lib/codex-host-process-journal.mjs:105, :113, :169 (parent fsync via try/finally)
- scripts/codex-design-readiness-bootstrap.mjs:122
- scripts/onboarding-init.mjs:860
- scripts/runner-design-readiness-bootstrap.mjs:153
- scripts/critic-route-activation.mjs:180 (`syncDirectory`)
- scripts/native-plugin-readback.mjs:189 (`syncDirectory`)
Already tolerant (reference shape): lib/project-uninstall.mjs:31, lib/design-advisor-course-store.mjs:15, scripts/pipeline-state.mjs:9592.
Not reviewed: the remaining lib hits (private-boundary.mjs and others); a second pass should classify directory vs file handles there.

## Not done
Native Windows qualification (no Windows run); the follow-up fsync sites above; Full Verify; independent Critic review (parent-owned batch gate); PO acceptance. CGB-PHYSICAL has at least two causes: PF-93 version skew (legacy packet, CPP-COORDINATOR-BINDING hidden by a bare catch, slice w7-pf93) and this Windows directory fsync EPERM. This slice fixes only the second.

## Proposed commit message
`fix(critic): tolerate the Windows directory fsync EPERM and name the attested record scope repair (Toolbox D58, D59)`

## Operator flow
`git apply` the patch; `git add -u` limited to the four paths (critic-generic-batch.mjs/.test.mjs, dispatch-authorship-verify.mjs/.test.mjs); commit with `--no-verify`; stamp; install. Protected-path classification: none of the four files matches TP-1 to TP-13.
