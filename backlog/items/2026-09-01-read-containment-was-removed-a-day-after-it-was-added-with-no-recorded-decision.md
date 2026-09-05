---
schema: pipeline.backlog-item.v1
id: pipeline.read-containment-removed-with-no-recorded-decision
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
tracking: "Nova B — the project-root containment check on read-only shell commands was added on 2026-08-29 to close a hole and removed wholesale on 2026-08-30. The removal is deliberate and undocumented outside its own commit message, and it silently invalidates a closed item's recorded remedy."
done_when: manual
source: "Surfaced by check-backlog-done-predicate.mjs as a REGRESSION finding on 2026-09-01, then traced to commit c8c7f449 and confirmed empirically in the same session."
---

# Read containment was removed a day after it was added, with no decision recorded anywhere

## How this surfaced

`check-backlog-done-predicate.mjs` reported
`backlog/items/2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md`
as REGRESSION: status `closed`, predicate not satisfied. The item's own
`closure_commit` is `9639d91e`, whose message describes adding
`isOutsideRootSingleCommandRead()` — "the single-command sibling of the existing
piped-shape containment check" — because "a single un-piped read (rg/cat/head/etc.)
had no containment check at all, so protection against reading outside the
project root depended on shell shape rather than the actual target read".

No function of that name, and no `isOutsideRoot*` function at all, exists in
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` today.

## What actually happened — deliberate, not decay

Commit `c8c7f449` (2026-08-30, `NVA-GF-GREENFIELD-READONLY-1`), one day after
the fix landed, states it plainly in its own first bullet:

> Remove project-root containment from the closed read-only command lane.

It is a net −252/+216 change to the guard and −369/+333 to its suite. So this is
not a silent regression and not a merge accident. It is a deliberate reversal of
a security boundary that had been added the previous day specifically to close
a hole, made by a different dispatch, and the two never met.

## Confirmed live, not inferred

The current behaviour is not in doubt. In this session on 2026-09-01, reads of
`/tmp/claude-1000/.../tasks/*.output` — outside the project root — were admitted
by the guard, repeatedly, in both single-command and piped shapes. The lane is
open as the commit says.

## What is actually wrong here

Not necessarily the decision. Reads are less dangerous than writes, and the need
that motivated it is real: an agent must be able to read its own dispatch
transcripts and runner output, which live outside the repository by
construction. Something had to give.

What is wrong is that a legitimate narrow need was met by removing the boundary
**entirely** rather than by widening it to the paths that need admitting — the
session's own task-output directory, the runner transcript location — and that
the trade-off is recorded in exactly one place: a three-line commit message.

Three concrete consequences:

1. **A closed item now misrepresents the codebase.** Anyone reading
   `2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md`
   sees `status: closed` and a closure commit, and would reasonably conclude the
   containment check is in force. It is not.
2. **The threat model does not mention it.** No ADR, no entry in `docs/state.md`,
   no backlog item, and nothing in any threat-model document references
   `c8c7f449` or the removal. The only file in the repository that mentions the
   dispatch id at all is the guard's own test suite.
3. **The remaining boundary is unstated.** With containment gone from the
   read-only lane, what an agent may read is bounded by the closed command
   grammar alone — which admits `cat`, `rg`, `head`, `sed`, `find` and read-only
   `git` against any path the process can reach, including a home directory,
   another repository, or a credential file. Whether that is acceptable is a
   judgement someone should make on the record.

## Direction to evaluate

Two candidate shapes, deliberately not pre-selected:

- **Re-narrow.** Restore containment and admit an explicit, enumerated set of
  external read roots — the session task-output directory and the runner
  transcript path — resolved rather than pattern-matched. Costs a mechanism for
  discovering those roots at guard time.
- **Accept and document.** Keep the open read lane, and record the decision as
  an ADR with its reasoning: reads are not writes, the guard is not the security
  boundary for reads, and the real boundary is the host process's own
  permissions. This is a legitimate answer, but it must be written down, because
  right now the repository asserts the opposite through a closed item.

Whichever is chosen, the 2026-08-29 item's status must stop claiming a remedy
that no longer exists.

## Triage, 2026-09-06 — PO decision

**PO decision: Re-narrow.** Restore project-root containment on the closed
read-only Bash lane in `guard-lifecycle-ready.mjs`, admitting an explicit,
resolved (never pattern-matched) set of external read roots rather than the
blanket removal `c8c7f449` made. A dispatch implementing this is in progress
(`NVA-B-READCONTAIN-1`); it restores the pre-`c8c7f449` mechanism
(`GUARD-READ-SCOPE-OUTSIDE-ROOT`, `liftable-by-signature:cross-repository-target`
reachability, `BOUNDED_PIPELINE_ADDITIONAL_ROOTS`) as the floor, then adds new
session-derived exception roots (this session's own transcript-adjacent tree
and task-output tree, both resolved from the PreToolUse hook's own
`transcript_path` field the way `claudeSessionMemoryDirectory` already does
for the write side, MEMPATH-1) so the legitimate need stays met without a
blanket-open lane. An arbitrary external read outside every approved root
stays refused, override-reachable by human signature, exactly as before
`c8c7f449` removed it.

## Acceptance criteria

- The decision is recorded where a reader looking for the read-boundary would
  find it — an ADR, and a pointer from the relevant threat-model document.
- `2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md`
  either regains a satisfied predicate or is reopened, so that
  `check-backlog-done-predicate.mjs` stops reporting a REGRESSION that is
  actually an undocumented reversal.
- If containment is restored, the external read roots that motivated its removal
  are admitted explicitly and covered by tests, so the next legitimate need does
  not get met by removing the boundary again.
