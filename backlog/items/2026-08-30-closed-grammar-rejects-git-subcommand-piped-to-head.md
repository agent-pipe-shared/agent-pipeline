---
schema: pipeline.backlog-item.v1
id: pipeline.closed-grammar-rejects-git-subcommand-piped-to-head
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-30
closed_at: "2026-08-30"
closure_repository: "self"
closure_commit: "272d772aa2fb1c1b7a0b827f8c22a7a747f6dc46"
closure_evidence: "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs"
tracking: "Retrospective-analysis follow-up item #6, PO-confirmed 2026-08-30 ('ja bitte umsetzen')"
source: "PO's greenfield-test relay, 2026-08-30: repeated live GUARD-PARSE-UNSUPPORTED hits on ordinary `git log --oneline | head` / `git <read-only subcommand> | head` diagnostic commands, both in this Elephant session and in the PO's own relayed Codex session."
---

# Closed shell grammar admits `git` only as a single un-piped command — `git <read-only subcommand> | head` is refused

## What happened

`2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md`
(closed) already widened the grammar for `&&`-chained read-only `git`
commands and a grep-to-head pipeline family. It never covered a `git`
subcommand piped directly to `head` (e.g.
`git log --oneline -i --grep="eperm" | head -30`) — this session hit that
exact refusal live and had to fall back to `git log ... -n 30` (no pipe)
instead.

## Fix

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` gained
`isBoundedGitPipeline()` (mirroring the existing rg-to-head/grep-to-head/
cat-to-head families), extracted `isReadOnlyGitSubcommand()` as a shared
classifier, and wired both into `isReadOnlyDiagnosticCommand()` and
`isForbiddenCrossRepositoryMutation()`. The refusal message's "complete
admitted grammar" text documents the new shape. Every existing fail-closed
guarantee is preserved — a non-read-only git subcommand, an out-of-range
`head` count, or an out-of-root path still refuses exactly as before.

Dispatch `NVA-CF-GITPIPEALLOWLIST` (goldfish-implementor, medium). Evidence:
`guard-lifecycle-ready.test.mjs` 186/186 (3 new tests: both `head` forms
admitted, exactness refusals, admitted-grammar-shape execution proof; one
pre-existing `&&`-chain assertion updated because the new admission makes it
factually stale, per the same "no new authority" union principle already
applied for the grep-to-head case), `check-consumer-safe-paths.test.mjs`
9/9. Commit `272d772a`.

## Known follow-on (not a blocker)

The live PreToolUse hook in this session resolves against the installed
marketplace copy, not the just-edited repo source, so a live `git ... | head`
call in this same session stays refused until a marketplace sync happens —
expected, out of scope for a source-only fix, tracked by the standing
marketplace-sync discipline already in memory/session practice.

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized, recurring friction hit live by both the
  Elephant session and a relayed Codex session on the same day
- **Date:** 2026-08-30
