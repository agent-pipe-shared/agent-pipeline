---
schema: pipeline.backlog-item.v1
id: pipeline.the-rebase-authority-is-resolved-and-advertised-but-not-executable
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-03
closure_repository: self
closure_commit: afb2e3c0f11f7bb0f6af31bec94a376616d31cb4
closure_evidence: backlog/evidence/2026-09-03-nva-rebdead-round2-findings.md
created: 2026-09-02
source: "Field report from a second session (sprint-alfred) blocked mid-rebase on Pipeline 0.6.1, cross-checked against guard-lifecycle-ready.mjs by direct reading"
sprint: nova-b
---

# The 0.6.1 rebase authority resolves and advertises correctly, then refuses every action it just promised

## Description

A second session rebasing `feat/sprint-alfred` onto the released `main`
(`6262d408`) is deadlocked. `activeRebaseAuthority()` does its job: it
recognises the rebase, validates the `orig-head`, names the single conflict path,
and prints that Edit/Write on that path, `checkout`/`restore`/`add` for it, and
`rebase --continue` afterwards are all permitted, with no push and no
session-wide authority. Every one of those statements is then contradicted by a
later check in the same evaluation.

The rebase in question:

```
git rebase --onto 6262d408aa616651232b46ab8ecbfd88ce4055b0 \
  dfd26254ffa040a50af28d3b3f46737245d4c5cd feat/sprint-alfred
```

It stops at commit 2 of 53. The conflict path is `project/pipeline-state.json`.

This is a defect in what `v0.6.1` shipped two hours before it was reported, and
the release notes currently claim the opposite — "a session that has never heard
of this authority is carried through by the refusals themselves". That sentence
is true of the refusal TEXT and false of the behaviour.

## Triggering situation

Reported from the field, then verified against
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` by direct reading rather
than accepted as described. Three findings, of which the third corrects the
report.

**1 — CONFIRMED. The writer-owned-State refusal never consults the authority.**
Around line 4340, inside the `WRITE_TOOLS` block:

```js
if (!memoryWrite && !machineWrite) {
  const requested = resolve(root, target);
  if (requested === join(root, ".claude", "pipeline-state.json")
    || requested === join(root, "project", "pipeline-state.json")) {
    return withLifts(lifts, protectedStateWriterOnly());
  }
  ...
}
```

An unconditional `return`. No branch reaches `activeRebaseAuthority()`, so an
Edit/Write on the conflict path is refused however validly the authority
resolved — and `project/pipeline-state.json` is exactly one of the two paths
named.

**2 — CONFIRMED. The shell admission is a lift, and readiness still runs after
it.** The rebase relief pushes onto `shellLifts` rather than returning, by
design; the code says so: "A lift rather than a return: every later check still
runs." The last of those later checks is
`evaluateAfterGrammarAdmission()` (called at line 4429), which calls
`requireProjectOnboardingReady()`. While the rebase is stopped, the conflicted
`project/pipeline-state.json` carries Git conflict markers and is not valid
JSON, so the continuity observation fails and readiness refuses with
`GUARD-LIFECYCLE-NOT-READY`.

The circularity is the whole defect: **the file whose conflict the authority
exists to let you resolve is the same file whose unreadability withdraws the
authority.**

**3 — THE REPORT IS PARTLY WRONG HERE, and the correction matters.** The report
states that the guard's own returned read-only retry actions can hang on the
same readiness check, naming three commands. Measured by reading
`isReadOnlyGitSubcommand()` (line 2252) together with the early return at line
~4365, which precedes the readiness call at 4429:

- `git status --short` → subcommand `status` → read-only → returns `verdict(0)`
  BEFORE readiness. **Not blocked.**
- `git diff --name-only --diff-filter=U` → subcommand `diff` → read-only →
  **not blocked.**
- `git rebase --show-current-patch` → subcommand `rebase` is **not** in the
  read-only list (`status, diff, log, show, rev-parse, ls-files, ls-tree,
  for-each-ref`, plus narrow `branch`/`remote`/`fetch`/`config` forms). It is
  admitted by the rebase shape check, pushed as a lift, and then falls through
  to readiness. **Blocked — and it is the only one of the three that is.**

So the diagnostic surface is not uniformly broken; exactly one command in it is.
Whoever fixes this must not "fix" the two that already work.

**4 — No existing test covers the reported case.** `rbFixture()`
(`guard-lifecycle-ready.test.mjs`, line 7722) builds its conflict on
`REBWIRE_CONFLICT_PATH` and writes the lifecycle state to `LEGACY_STATE` — not
to `project/pipeline-state.json`. The fourteen rebwire cases therefore all pass
while the reported deadlock is fully live. The fixture gap is why this shipped.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` — the writer-owned
  return (~4340), the lift-not-return relief (~4279), `evaluateAfterGrammarAdmission()`
  (3982), `isReadOnlyGitSubcommand()` (2252)
- `plugins/pipeline-core/lib/rebase-authority.mjs` — the resolver, which is
  correct and is not the defect
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` — `rbFixture()`
  and the fourteen rebwire cases
- `plugins/pipeline-core/lib/rebase-authority.test.mjs`

## Proposal

A narrow admission for an already-validated active rebase. Two framing decisions
must be made deliberately, because the obvious readings of the field report are
both wrong.

**Key the admission on `conflictPaths` membership, never on "a rebase is
active".** A rebase conflicting on file X must not make file Y writable. The
`memoryWrite`/`machineWrite` carve-outs sitting in that same block are the wrong
template to copy: they skip the check unconditionally for a fixed path. What is
needed here is the opposite — a check that consults the resolved authority's own
path set, and admits exactly its members.

**Do not lift readiness for these actions; re-base it.** The field report asks
that lifecycle readiness "not be a precondition" for the bounded rebase actions.
Taken literally that lets a session reach a not-ready state, claim a rebase and
act — which inverts the gate. The resolver already establishes the narrower and
correct framing: authority is read from `orig-head`, whose tree contains a valid,
uncorrupted state file. Readiness for these exact actions should therefore
resolve against `orig-head` rather than against the conflicted worktree. That
removes the circularity while keeping the gate.

What the admission must permit, and nothing else:

- Edit/Write/apply_patch on a path in `conflictPaths`, including when that path
  is `project/pipeline-state.json` or `.claude/pipeline-state.json`.
- The `checkout`/`restore`/`add` shapes the resolver already lists, for those
  paths.
- `git rebase --continue` once the resolution is fully staged.
- `git rebase --show-current-patch` — the one read-only diagnostic currently
  falling through. The other two already work and must be left alone.

What it must continue to refuse, unchanged: any path outside `conflictPaths`;
`--skip`, `--edit-todo`, `--exec`, an arbitrary `-c`; push, force-push and any
remote mutation; session-wide write authority; HGO or GMW as a substitute
authority; and any authority at all when `orig-head` is not validly approved,
the `onto` is wrong, or the rebase has ended or been aborted.

No new human signature may be required anywhere in this path.

## Acceptance

1. A fixture exists whose conflict path IS `project/pipeline-state.json`, with a
   validly approved `orig-head` and the correct `onto`, so the reported deadlock
   is reproducible as a test before any fix is written.
2. Regression tests cover, at minimum: Edit/Write/apply_patch admitted on that
   exact conflict path; the `checkout --ours`/`--theirs` and `restore` variants
   admitted; `git add -- <exact conflict path>` admitted; `git rebase --continue`
   admitted after staging; all three read-only diagnostics reachable despite the
   invalid conflict JSON; a foreign path still refused; `skip`/`edit-todo`/
   `exec`/push/force-push still refused; the admission gone entirely once the
   rebase ends or is aborted; and no human signature demanded anywhere.
3. `plugins/pipeline-core/lib/rebase-authority.test.mjs` and
   `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` both green, then
   full `node harness/scripts/verify.mjs`.
4. An independent Critic round. This is a guard admission change; the T1
   functional-equivalent lane does not cover it.
5. The `v0.6.1` release notes are corrected: the discoverability claim is true
   of the refusal text and false of the behaviour, and it is currently published.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

## Triage, 2026-09-03 — closed after two Critic rounds

The reported deadlock is fixed and the fix is reviewed. Nine commits, two
independent Critic rounds, and a full `verify.mjs` run green across all 506
suites.

**Round 1** returned eight findings. Three were dispatcher-side and closed
separately. F1 was **refuted by measurement** — `apply_patch` was never blocked,
because the outer tool-name gate admits any tool outside `SHELL_TOOLS`/
`WRITE_TOOLS` before either relief; the fix built against it was reverted. F5's
first rework was **rejected**: it pinned the relief to `continuity-damaged`,
measured against the test's own stub rather than the production chain, and an
unparseable state file actually yields `continuity-observation-unavailable` —
so the narrowing would have re-opened this very deadlock while the suite stayed
green. The second rework admits the measured two-value set. F7 and F8 closed.

**Round 2** (higher-capability review model at max, MP-07: guardrail diff)
returned two findings and two briefing violations against the dispatcher, all
four recorded in
`backlog/evidence/2026-09-03-nva-rebdead-round2-findings.md`:

- **F1 (major), a lifecycle violation, not a code defect.** `43413349` was
  written by the orchestrating session rather than dispatched, breaking three of
  EL-01's five stage-0 conditions independently. Recorded rather than remedied:
  re-doing the revert through a dispatch would churn a guardrail hook to launder
  authorship. It stands as the violation it was.
- **F2 (minor), fixed.** After that revert took code and tests together, nothing
  asserted acceptance criterion 2's third named tool. `afb2e3c0` adds
  `rebdead positive-1 (apply_patch)`, asserting the admission itself rather than
  the mechanism that currently provides it — so it survives a refactor and fails
  if the admission disappears.

**Acceptance criteria.** 1, 3, 4 and 5 were verified met by the Critic against
artifacts; 2 is now met in full. Criterion 5's release-notes correction was
already satisfied outside the reviewed diff — `CHANGELOG.md` withdraws the
discoverability claim verbatim and states that it was true of the refusal text
and false of the behaviour.

**One limitation is carried forward rather than buried.** Two package commits
modify the round-1 findings registry, which the round-2 dispatch excluded as
dispatcher rationale. The Critic honoured the exclusion, so 38 lines of the
reviewed diff went unreviewed. A findings registry is both the honest record of
a round and, once committed, part of the next round's diff; excluding it keeps
the review independent and leaves part of the diff unseen. The tension has no
resolution inside a single round and is named so a later one does not
rediscover it as a gap.
