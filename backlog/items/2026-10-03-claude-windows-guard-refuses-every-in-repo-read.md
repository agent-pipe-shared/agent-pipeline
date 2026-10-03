---
schema: pipeline.backlog-item.v1
id: pipeline.claude-windows-guard-refuses-every-in-repo-read
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Manual observation, Claude Code session on Windows, 2026-10-03; reproduced after a clean session start on feat/sprint-alfred at a0d83ce78 with the locally installed 0.7.0 candidate."
sprint: alfred
done_when: manual
---

# Claude on Windows: the lifecycle guard refuses every in-repository read

## Description

In a Claude Code session on Windows whose working directory is the repository
root, `guard-lifecycle-ready.mjs --runner claude` refuses every ordinary read of
a tracked in-repository file:

- native `Read` of `docs/state.md` with a backslash drive path, a forward-slash
  drive path, or a bounded `limit`: `GUARD-READ-TARGET: use an exact passive
  path outside protected credential roots.`
- Bash `head -n 40 docs/state.md` (relative path):
  `GUARD-READ-SCOPE-OUTSIDE-ROOT`, which claims the read target lies outside the
  project root.

At the same time `pwd` reports the repository root, `git status -sb` works, and
read-only `git show HEAD:<path>` works. The session can therefore only read
committed bytes through Git, never the working tree. That makes uncommitted or
ignored material (scratch, stash restores, drafts) unreadable. It also forces
every bootstrap read through a workaround the guard was never designed to be
the primary route for.

**PO statement, 2026-10-03:** blocking reads this broadly was never intended
and is definitively a defect. Ordinary passive reading of the repository must
be possible in every lifecycle phase. Priority: first correction for the next
local 0.7.0 candidate.

Follow-up evidence, same session: the block persists after mandatory hooks were
provisioned and after the preflight returned `ready`, so it is not caused by
missing bootstrap readiness. Read-only `git show HEAD:<path>` and `git grep`
remain admitted, and so do exact backslash-spelled plugin script invocations.

It also persists after `project-onboarding-v3.mjs inspect --intent session
--runner claude` returned `ready` with `sessionCapability: passed`.

Static reading of the source at HEAD (identical code to the installed build)
names fail-closed branches that refuse **every** read rather than just the
offending one. These are candidate causes only, none measured yet:

- `lib/passive-read-policy.mjs` `isAllowedPassiveReadTarget` returns `false` for
  any target when `readMachinePlane()` is not `valid`/`absent`, or when
  `resolveRepoScopedDirectory(rootDir)` is not `valid`/`absent`. This clone
  reports an `invalid` PO profile receipt, which may be related.
- The same function returns `false` for any target when a single entry of
  `additionalRecursiveRoots` (session read-scope roots plus registered plugin
  roots, passed by `readToolScopeVerdict`) does not satisfy
  `realpath(boundary) === boundary`. On Windows, drive-letter case, 8.3 short
  names or junctions would trip this. The session scratchpad also lives under
  `%LOCALAPPDATA%`, which the same function treats as a protected root.
- The project root is `realpath(CLAUDE_PROJECT_DIR ?? cwd)` in
  `guard-lifecycle-ready.mjs`. A spelling mismatch between that root and the
  `realpathSync.native` identity of the target would yield the
  `GUARD-READ-SCOPE-OUTSIDE-ROOT` seen for Bash `head`.

**Measured root cause (2026-10-03, `scratch/read-guard-probe.mjs`, run by the
PO):** it is the third candidate. Claude Code supplies `transcript_path` under
`~/.claude/projects/D--Dev-agent-pipeline-share/`, while the directory on disk
is spelled `D--dev-agent-pipeline-share`, probably created by a session started
from a lower-case cwd. `guard-lifecycle-ready.mjs` derives the transcript and
`memory/` session roots with JS `realpathSync`, which keeps the input casing.
`isAllowedPassiveReadTarget` re-checks each root with `realpathSync.native`,
which returns the on-disk casing, and requires exact equality. The check fails
and every read is refused. Probe verdicts: `docs/state.md` is allowed without
extra roots (`true`) and refused with either session root (`false`). Machine
plane `valid`, repo key directory `absent`, so neither is involved. The PO
profile receipt is unrelated.

Fix direction: derive and compare roots with one consistent realpath
implementation (native), compare Windows paths case-insensitively, and have an
unusable auxiliary root skipped rather than failing every target. Add a Windows
regression with a case-differing session directory.

**Workaround applied and verified (same session, no restart):** renaming the
on-disk Claude project directory to the casing Claude Code supplies (two-step
rename) immediately restored native Read, Grep and Bash `head` on in-repo files.
This only removes the trigger. Any session whose runner-supplied path casing
differs from the on-disk casing still hits the defect, so the source fix
remains required.

A single unhealthy auxiliary root or plane must not deny ordinary in-root reads.
Fail closed per target, with a typed diagnostic naming the failing input.

## Triggering situation

This was first observed in the previous session right after a branch switch and
attributed to that switch. It reproduced unchanged after a clean session start
on 2026-10-03, so a stale session cannot explain it.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` read-scope and
read-target classification (project-root resolution under Windows and Git Bash
path spellings). The installed copy lives in the local marketplace and may
differ from the source at HEAD.

## Proposal

Root cause not yet measured. Hypothesis only: the project root and the read
target are normalised through different path spellings, such as an MSYS
`/d/...` form versus a `D:\...` drive form, or the root comes from a source
other than the session cwd. Reproduce with a fixture covering drive-letter,
forward-slash, MSYS and relative spellings for both Read and Bash, and add
regression tests that admit in-root reads on Windows while still refusing
out-of-root and credential-root reads (keep
`2026-09-30-read-only-guard-admits-execution-and-output-options.md` intact).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
