---
schema: pipeline.backlog-item.v1
id: pipeline.repair-map-crashes-on-a-fresh-repository-with-no-head
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Second, independent Codex happy-path test (PO, project 'Rune_Test1_Codex_055_50' / 'ruinen-browsergame', 2026-08-17), relayed as an AI-authored forensic report and independently re-verified against this checkout's own current source and the raw rollout transcripts before being filed."
---

# `repair-map.mjs`/the human-guard-override flow crash with `HGO-GIT` on a freshly-initialized repository with no `HEAD` (unborn branch)

## Description

An unborn `HEAD` (`git rev-parse HEAD` failing because no commit exists
yet) is a completely normal, expected state for a freshly-initialized git
repository — and the repair-map/HGO flow does not handle it. Confirmed live
in the raw transcript: an uncaught `HumanGuardOverrideError: repository
identity is unavailable (operation=rev-parse-HEAD, outcome=exit-128)`,
`code: 'HGO-GIT'`. Source confirms the generic handling:
`plugins/pipeline-core/lib/human-guard-override.mjs:133-144` treats any
non-zero git exit uniformly as `HGO-GIT` with no unborn-branch special case,
and `plugins/pipeline-core/scripts/repair-map.mjs:170,218` has no
try/catch around the call — the error propagates uncaught. The only
workaround observed was a manual, unnecessary empty initial commit purely
to give the repair-map something to `rev-parse`.

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.mjs` (~133-144, git-exit
handling), `plugins/pipeline-core/scripts/repair-map.mjs` (~170, ~218, the
uncaught call sites).

## Proposal

Not designed here. Direction: detect the unborn-HEAD case specifically
(e.g. `git symbolic-ref HEAD` succeeding while `git rev-parse HEAD` fails
with the specific "unknown revision or path not in the working tree" /
"ambiguous argument 'HEAD'" shape, or checking `.git/HEAD` for a ref with no
matching object) and either (a) use git's well-known empty-tree hash
(`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) as a defined baseline, or (b)
return a typed status (e.g. `head-absent`) with a concrete, idempotent
`nextAction` (e.g. an `ensure-repository-identity` helper) instead of an
uncaught crash.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope — confirmed live crash in current
  source, no existing handling.
- **Rationale:** independently re-verified against this checkout's own
  current source and the raw transcript before filing; not trusted from the
  relayed report alone.
- **Assignment (if accepted):** goldfish-deep, guardrail-tier (MP-07), plus
  Critic review before considered done.
- **Date:** 2026-08-17
