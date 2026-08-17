---
schema: pipeline.backlog-item.v1
id: pipeline.codex-critic-isolation-fixture-rejects-merge-commit-head
type: defect
owner: pipeline
status: closed
created: 2026-08-07
closed_at: 2026-08-17
closure_repository: self
closure_commit: 05e6f1fe9ffa254841373bdc7a801aec9f1bffe8
closure_evidence: backlog/items/2026-08-07-codex-critic-isolation-fixture-rejects-merge-commit-head.md
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

- **Decision:** accepted, stays open, current scope (not deferred to a
  later sprint). Re-verified 2026-08-17: `buildExactFixture`'s single-parent
  requirement (`plugins/pipeline-core/scripts/codex-critic-isolation.mjs:1816`)
  is unchanged since filing; the gap is real and current.
- **Rationale:** `verify.mjs` fails outright (exit 1) the next time this
  repository's own HEAD is a merge commit — a real, currently-live risk to
  the Nova A candidate-freeze ceremony if any merge lands before this is
  fixed. Guardrail/security-isolation-tier code (MP-07) needs a properly
  briefed goldfish-deep + Critic round per this repo's dispatch discipline,
  not a same-session Elephant patch or a deferral to a future sprint.
- **Assignment (if accepted):** needs a goldfish-deep dispatch with a
  concrete design choice from this item's own three candidate directions
  (synthetic single-parent test fixture; or confirm/extend the single-parent
  requirement as a deliberate production property with dual-shape coverage;
  or an explicit decision on whether a merge commit on this repo's own main
  branch is a supported event) before briefing — not yet written.
- **Date:** 2026-08-17

### PO decision, 2026-08-17

Direction 1 (synthetic single-parent test fixture): the test file builds its
own single-parent fixture commit instead of depending on this repository's
real live HEAD shape. Dispatched.

### Closure, 2026-08-17 — already fixed before this dispatch ran

`NVA-TRIAGEFIX-1`'s sub-task A found, before writing any code, that this was
already fixed on 2026-08-11/12 by commits `33f6734f6e4fefca2af04818db658873bcc57c83`
("test(codex-critic): bind isolation fixtures to a synthetic single-parent
candidate") and `05e6f1fe9ffa254841373bdc7a801aec9f1bffe8` ("test(codex-critic-
isolation): add permanent merge-head rejection regression test") — both on this
branch, both predating this item's closure but landing after its 2026-08-07
filing. Every `candidateCommit` derivation in
`codex-critic-isolation.test.mjs` now uses `syntheticRepo()`/
`candidateFixtureRepo()` helpers (lines 899-912, 1115-1139) instead of this
repository's live HEAD; `buildExactFixture`'s single-parent requirement
itself is unchanged. Verified live: `node --test plugins/pipeline-core/
scripts/codex-critic-isolation.test.mjs` — 58/58 passed, exit 0.

This item's own 2026-08-17 re-verification (the full-backlog triage pass,
batch 1) checked only whether `buildExactFixture`'s requirement had changed
(it had not) and missed that the TEST FILE's own derivation had been fixed
separately — a real miss, not a hypothetical one; caught only because the
dispatched fix attempt read the code before writing anything.
