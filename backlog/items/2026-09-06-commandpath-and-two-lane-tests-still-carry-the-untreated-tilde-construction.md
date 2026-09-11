---
schema: pipeline.backlog-item.v1
id: pipeline.commandpath-sibling-tilde-gap-and-test-pins
type: defect
owner: pipeline
status: closed
created: 2026-09-06
closed_at: 2026-09-11
closure_repository: self
closure_commit: 94fe6cc6e38bd690ee87af68092ac75789af00a0
closure_evidence: plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
sprint: nova-b
tracking: "Nova B — T1 Critic review of NVA-B-TILDEFIX-1 (PASS, 4 minor findings). F3: commandPath() in guard-lifecycle-ready.mjs still builds resolve(root, value) with no tilde reject, so a leading-~ argument still resolves as inside root wherever a caller trusts that result directly (named call sites: lines 2783, 2956, 2979, 2987) -- not proven exploitable, disclosed as such. F1: the cat-pipeline and git-pipeline lane tests added by NVA-B-TILDEFIX-1 assert only exitCode 2, not the specific denial code, unlike their single-command/rg siblings, so a future refactor could silently change which code those two lanes report with the suite still green."
done_when: manual
source: "T1 Critic review of NVA-B-TILDEFIX-1 (opus, max), findings F1 and F3, `scratch/dispatch/tildefix-critic-7f3a9c21/critic-notes.md` (scratch, not durable -- this item is the durable record)."
---

# `commandPath()` and two lane tests still carry the untreated tilde construction

## F3 — `commandPath()` sibling gap (minor, unproven exploitability)

`guard-lifecycle-ready.mjs`'s `commandPath()` (~line 2688) is unchanged by
`NVA-B-TILDEFIX-1` and still builds `resolve(root, value)` with no leading-`~`
reject, so calling it directly on a `~`-prefixed argument still classifies
the (nonexistent, literal) result as inside `root`. The fix landed in
`rawReadCandidatePath()` (a different function, used by the read-scope
containment checks) and in `approvedReadPath()` (`guard-command-grammar.mjs`)
— `commandPath()` itself was deliberately left untouched by that dispatch's
scope, and this is the resulting gap.

Call sites the Critic identified: lines 2783, 2956, 2979, 2987 use
`commandPath()`'s result directly. Lines 2999/2005 are already
`isAbsolute(arg) &&`-guarded (a tilde argument is skipped there, not
misclassified) and line 2884 uses `resolve()` directly rather than
`commandPath()`. **Not proven exploitable** — the Critic explicitly named
this as unverified rather than confirmed, and no live reproduction was
attempted from the unguarded sites. Investigate each named call site's
actual reachability and consequence before fixing; a call site that never
receives a tilde-prefixed value in practice is not the same defect as one
that does.

## F1 — cat-pipeline/git-pipeline lane tests pin exit code only, not the denial code (minor)

The four new regression tests `NVA-B-TILDEFIX-1` added for the cat-pipeline
and git-pipeline lanes assert `exitCode === 2` and nothing about which denial
code fired, unlike the single-command and `rg`-pipe lane tests, which do pin
their exact code. The commit message for `afc6af70` explicitly claims the
self-lift mechanism "route[s] the refusal to GUARD-READ-SCOPE-OUTSIDE-ROOT"
for these two lanes — a stated behavioral claim with no test enforcing it, so
a future refactor could silently move either lane onto a different denial
code with the full suite still green.

## Acceptance criteria

- For F3: each of the four named call sites is checked for whether it can
  actually receive a `~`-prefixed value from a real command path, and either
  (a) shown not to matter (state why), or (b) fixed using the same
  fail-closed technique `rawReadCandidatePath`/`approvedReadPath` already
  use, with a regression test.
- For F1: the cat-pipeline and git-pipeline lane tests for the leading-`~`
  case are extended to assert the specific denial code
  (`GUARD-READ-SCOPE-OUTSIDE-ROOT`, per the commit message's own claim, or
  whatever the actual current behavior is if that claim turns out wrong on
  closer inspection — do not assume the commit message is correct without
  checking).
- Full existing regression suite for both touched files stays green.

## Closure — 2026-09-11

Commit `94fe6cc6` closes the still-relevant mutation gap. A leading tilde is
now treated as an external shell target by `commandPath()` without attempting
user-directory expansion. Redirects, the local cachebuster, mutating `git -C`,
generic file mutators and `sed -i` all route to the exact
`GUARD-CROSS-REPO-MUTATION` refusal. Normal relative targets remain unchanged.

The older F1 expectation that the cat and Git read pipelines should report
`GUARD-READ-SCOPE-OUTSIDE-ROOT` was superseded by the later runner-neutral
policy that permits bounded read-only diagnostics outside the project root.
Their tests now pin that intended result directly: exit 0 with no `GUARD-*`
code. This keeps the newer read policy while closing the real write-target
bypass identified by F3.

Focused mutation/read regressions and syntax checks passed; the independent
Critic returned PASS with no blocker or major finding.
