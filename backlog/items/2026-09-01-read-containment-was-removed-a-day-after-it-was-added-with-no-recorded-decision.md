---
schema: pipeline.backlog-item.v1
id: pipeline.read-containment-removed-with-no-recorded-decision
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-06
closure_repository: self
closure_commit: e183632fb154711cac2cb5fbde5a8ae0973863dc
closure_evidence: "backlog/items/2026-09-01-read-containment-was-removed-a-day-after-it-was-added-with-no-recorded-decision.md"
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
blanket removal `c8c7f449` made. Split into two dispatches, tracked here so
this item's own acceptance criterion 3 is not left resting only on
`docs/state.md` prose:

- **`NVA-B-READCONTAIN-1` (landed, `cbc30756`, T1 Critic round 1 = FAIL,
  rework in progress).** Restores the pre-`c8c7f449` mechanism
  (`GUARD-READ-SCOPE-OUTSIDE-ROOT`, `liftable-by-signature:cross-repository-target`
  reachability, `BOUNDED_PIPELINE_ADDITIONAL_ROOTS`) as the floor, with no new
  exception roots — deliberately, so its diff is independently reviewable.
  This alone does NOT satisfy acceptance criterion 3 below; that is expected
  and is `NVA-B-READCONTAIN-2`'s job, not a regression of this dispatch.
  Findings registry: `backlog/evidence/2026-09-06-nva-b-readcontain-1-findings.md`.
- **`NVA-B-READCONTAIN-2` (dispatching now).** Adds exactly two session-derived
  exception roots, both resolved from the PreToolUse hook's own
  `transcript_path` field the way `claudeSessionMemoryDirectory` already does
  for the write side (MEMPATH-1, never pattern-matched): the transcript file
  itself, and `dirname(transcript_path)/memory/` (reusing
  `claudeSessionMemoryDirectory` directly). **Narrowed from the original scope
  above (2026-09-06, Elephant judgement call, EL-03) to exclude the `/tmp`
  task-output directory**: that directory's naming (`/tmp/claude-<uid>/
  <encoded-cwd>/<session>/tasks/`) is not carried in any PreToolUse hook field
  the way `transcript_path` is — admitting it would mean reconstructing
  Claude Code's own tmp-layout scheme, exactly the "resolved rather than
  pattern-matched" discipline this item's own re-narrow direction requires
  MEMPATH-1-style roots to avoid. The task-output read need is left to the
  Read tool or the signature-override ceremony instead; this is recorded as
  an accepted scope limit in the ADR this item's acceptance criterion 1
  requires, not silently dropped. `NVA-B-READCONTAIN-1`'s correction round
  landed and was self-verified (two-round Critic cap exhausted with F4/F5
  fixed) rather than re-Critic'd a third time — see its own entry above.

An arbitrary external read outside every approved root stays refused,
override-reachable by human signature, exactly as before `c8c7f449` removed
it.

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

## Closed, 2026-09-06

All three acceptance criteria satisfied:

1. **Decision recorded**: `docs/adr/draft-read-scope-containment-boundary.md`
   (numbered only at PO acceptance of its text, per ADR-0069; the underlying
   technical decision was already made by the PO in this item's own Triage
   section above) plus a pointer from `guardrails/security.md` SEC-11 (the
   nearest existing threat-model-scope document — no dedicated Bash-guard
   threat-model file existed to point from, so this ADR and SEC-11 are that
   pointer, stated explicitly rather than left implicit).
2. **`2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md`
   regains a satisfied predicate**: confirmed via
   `check-backlog-done-predicate.mjs`, 2026-09-06 — 0 REGRESSION, only the
   two pre-existing, unrelated STALE-OPEN findings. That item's own
   "Resolved, 2026-09-06" section records this.
3. **External read roots admitted explicitly, covered by tests**:
   `NVA-B-READCONTAIN-2` (commits `e183632f`/`3cbb7d2a`) admits exactly the
   session transcript file and the session memory directory, both resolved
   from `input.transcript_path` (never pattern-matched), each with
   dedicated regression tests including a negative case and a symlink
   composition. T1 Critic PASS.

Not everything is closed by this — the ADR's own "current scope-gap
inventory" section lists what remains open (rg-pipe/cat-pipe lexical gaps,
denial-code accuracy, the transcript-file exact-match hardening) as
separately tracked, separately scheduled items. This item closes because
its OWN three criteria are met, not because every read-scope gap is gone.
