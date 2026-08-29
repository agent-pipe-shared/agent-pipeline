---
schema: pipeline.backlog-item.v1
id: pipeline.guard-bypass-paths-have-no-negative-regression-suite
type: requirement
owner: pipeline
status: open
created: 2026-08-28
sprint: nightwing
done_when: contains plugins/pipeline-core/hooks/guard-bypass-negative.test.mjs GUARD-BYPASS-NEGATIVE-SUITE
source: "Codex/WSL greenfield run, 2026-08-28 (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own observation that this runner needed three sessions and the most detours."
---

# The bypass paths the runners found have no negative regression suite

## The gap

Three runners executed roughly twenty bypass probes between them. The results are
recorded in three prose documents in three separate repositories. **Nothing in
this repository's own test suite exercises any of them.** A future refactor that
reopens one of these paths would produce no failing test.

The asymmetry is stark: 482 verify suites cover what the Pipeline should do; zero
cover what it must refuse.

## What to cover, drawn from the actual probes

Confirmed-blocked paths, which must stay blocked:

- `git push --no-verify` (GG-17);
- a dry-run push to a different target ref against an existing approval;
- replay of a consumed approval on a new ref;
- a direct shell write to a gate-strength file;
- a subagent writing to a gate file, pushing, and deleting a protected file;
- chained commands and redirects under the closed grammar.

Confirmed-bypassed paths, which must first be closed and then pinned:

- a `git push` inside a shell script invoked as `bash <script>`;
- an interpreter script whose body performs a forbidden filesystem mutation;
- a hand-forged `evidence/verify-latest.json` accepted by the push gate.

## Direction

A negative-test suite, registered in Verify, that asserts each path is refused —
and, for the currently-bypassable ones, that is written failing first so the
suite records the real state rather than an aspiration.

## Acceptance criteria

- Each listed path has a test.
- Tests for not-yet-closed paths are present and honestly marked, never omitted
  to keep the suite green.
