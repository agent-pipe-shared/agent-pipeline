---
schema: pipeline.backlog-item.v1
id: pipeline.codex-critic-isolation-fixture-rejects-merge-commit-head
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "Discovered running harness/scripts/verify.mjs against the NOVA-GMW-1 merge commit 8bc5ceb (first real merge commit into this repository's live main-branch history), 2026-08-07."
due: 2026-09-06
expires: 2026-09-06
---

# `codex-critic-isolation.test.mjs` fails whenever the real repository's own HEAD is a merge commit

## Description

`plugins/pipeline-core/scripts/codex-critic-isolation.mjs`'s
`buildExactFixture({ repoRoot, candidateCommit, ... })` requires its
`candidateCommit` to have exactly one parent:

```js
const ancestry = gitText(repoRoot, ["rev-list", "--parents", "-n", "1", candidateCommit], execFileSync).split(/\s+/u);
if (ancestry.length !== 2 || ancestry[0] !== candidateCommit || !isFullSha(ancestry[1])) fail("candidate must have exactly one bound parent");
```

`plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs` calls this
with `repoRoot` resolved to the actual checkout root (three directories up
from the script's own location) and `candidateCommit` set to that real
repository's own current `git rev-parse HEAD` (confirmed at roughly a dozen
call sites in the test file, e.g. lines 897, 986, 997, 1009...). It therefore
implicitly assumes this repository's own live HEAD is always a normal,
single-parent commit.

## Triggering situation

The first real `git merge` (not a fast-forward, not a squash) landing on this
repository's own main branch's tip. Measured directly: merging
`worktree-agent-ab84ec0efe49bd94a` into `feat/sprint-nova-codex-v046`
(NOVA-GMW-1's delivery) produced merge commit `8bc5ceb` with two parents;
`node harness/scripts/verify.mjs` against that exact candidate then failed
`codex-critic-isolation-tests` with `Error: candidate must have exactly one
bound parent`, in 8 of that suite's checks (the ones exercising
`buildExactFixture` directly or via `runProfileBoundIsolation`). Everything
else in the same Verify run (254 of the 255 other registered suites) passed
cleanly against the same candidate.

## Affected artifact

`plugins/pipeline-core/scripts/codex-critic-isolation.mjs` (`buildExactFixture`)
and its test file `plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs`
(every call site that derives `candidateCommit` from the real repository's own
HEAD rather than a synthetic fixture repo it controls).

## Proposal

Not yet designed in detail -- candidate directions, for the next session with
capacity:

1. Have the *test file* build its own synthetic single-parent fixture commit
   (as several of its own nearby helpers already do for other cases, e.g. the
   `linked`/`invalid`/`oversized`/`total` fixture repos) instead of depending
   on this real repository's own live HEAD shape, which this repository does
   not otherwise guarantee to stay single-parent forever.
2. Alternatively, if `buildExactFixture`'s single-parent requirement is a
   deliberate security property of the PRODUCTION isolation mechanism (not
   just an untested-fixture-building convenience) -- confirm that reasoning
   explicitly, then have the test suite exercise BOTH a normal commit AND a
   deliberately-constructed merge commit to confirm production behavior on
   each, rather than only ever exercising whatever shape this repository's
   real HEAD happens to be.
3. Either way, `guardrails/git.md`'s Conventional-Commits/atomic-commit
   convention has so far kept this repository's real history linear by
   accident, not by an enforced rule -- worth an explicit decision on whether
   a merge commit landing on this repository's own main branch is even a
   supported, expected event going forward (this session's own git safety
   protocol forbids rewriting history to avoid it after the fact).

## Triage (filled in by the Elephant of the next Pipeline session)

Not yet triaged. Not fixed in this session: `buildExactFixture` and its test
suite are guardrail/security-isolation-tier code (Codex sandbox critic
isolation), which per this repository's own dispatch discipline needs a
properly briefed Goldfish-deep + Critic round, not a same-session Elephant
patch. `harness/scripts/verify.mjs`'s overall exit code for candidate
`8bc5ceb` is `1` because of this gap alone (plus the separately-reconciled
backlog-ledger drift, now fixed) -- every GMW-relevant suite in that same run
passed cleanly; this finding is unrelated to NOVA-GMW-1's own correctness.
