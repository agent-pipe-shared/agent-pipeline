---
schema: pipeline.backlog-item.v1
id: pipeline.bounded-diagnostic-outside-repo-refused-under-wrong-reason
type: defect
owner: pipeline
status: closed
created: 2026-08-08
due: 2026-08-22
closed_at: 2026-08-17
closure_repository: self
closure_commit: 2f466462dbe97bc1330e7578bd21af2d958f1488
closure_evidence: backlog/items/2026-08-08-a-bounded-diagnostic-outside-the-repo-is-refused-under-the-wrong-reason.md
source: "Reported by a Goldfish during the 2026-08-08 hardening block and then reproduced and isolated directly by the Elephant."
---

# A bounded diagnostic reading outside the repository is refused under the wrong reason

## Reproduction, isolated

Inside the project root, the bounded pipeline the guard's own message names as
admitted works:

    rg -n 'Overall' <repo>/evidence/verify-latest.json | head -n 5      -> runs

The identical shape reading a file outside the project root is refused:

    rg -n 'Overall' <path outside the repo> | head -n 5                 -> BLOCKED

    GUARD-OPERATOR-UNAPPROVED: The command contains an unapproved shell operator.
    Use one simple shell command per tool call ...
    Do not construct a new composed command with &&, ;, pipelines, redirects ...
    Only bounded rg-to-rg and rg-to-head diagnostic pipelines are admitted as exceptions.

Controls that isolate it: an alternation inside the quoted pattern is not the
cause (`rg -n 'FAIL|failed' <in-repo file>` runs); the pipeline is not the cause
(the same pipeline runs in-repo); a simple `rg` against the outside path runs.
The single differing variable is whether the read target lies inside the project
root.

## Why this is a defect

Restricting reads outside the repository may well be correct — that is not what
is being questioned here. The defect is that the refusal **names a reason that is
not the reason**, and then gives advice that cannot work:

- The code says the command contains an unapproved shell **operator**. It does
  not; the same operator is admitted one directory over.
- The remedy says to issue the parts as separate simple commands. Splitting the
  pipeline changes nothing, because the pipeline was never the problem. An
  operator following the instruction exactly will fail again and conclude the
  guard is arbitrary.
- The message then lists bounded rg-to-head as admitted, in the same breath as
  refusing one. A guard that contradicts itself inside a single message teaches
  operators to stop reading it.

This is the same class as the two false denials repaired in `88d316d`: a guard
refusing for a real reason under a code that describes a different one. That
commit's own lesson was that the fix is to name what is actually wrong, and this
one was missed because it only appears when the target is outside the root.

There is a second-order cost specific to unattended work. Background task output
lands outside the repository by design, so an agent inspecting its own long-running
job's log hits this on the most ordinary diagnostic it can run, and the message
sends it looking for a grammar problem that does not exist.

## Direction, not a design

Not designed here.

1. **Name the real reason.** If the refusal is about the read target's location,
   it needs its own code and its own message. Whether that code belongs in the
   cross-repository family or is a narrower read-scope refusal is the substantive
   question, and it decides whether a signed human override can reach it.
2. **Make the remedy true or omit it.** Advice that cannot resolve the refusal is
   worse than none.
3. **Check the other exemptions for the same asymmetry.** The bounded rg-to-rg
   pipeline is documented alongside rg-to-head and was not tested here against an
   outside target; the read-only diagnostic lane may have the same shape.

## Triggering situation

Reproduced directly at commit `07bc70b` while reading a background job's output
file. Independently hit by a Goldfish in the same block, which reported it as a
bounded pipeline being refused despite the message admitting it — the same
observation from the other side, and the reason neither of us found it was that
the in-repo control passes.

## Related

- `88d316d` — the two guard false denials repaired in this block, same class.
- [ADR-0059](../../docs/adr/0059-signed-human-guard-override.md) — whether the
  corrected code is override-reachable is a decision, not an implementation
  detail.
- `2026-08-08-a-guard-reclassification-changed-what-a-signature-can-lift.md` —
  the companion item on exactly that consequence.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Elephant's recommendation accepted — name the real reason
  under its own code, classified as a narrower, override-reachable
  read-scope-refusal class rather than the never-liftable
  cross-repository-mutation family (reading is not the mutation risk that
  family exists to stop); make the remedy text true or omit it; audit the
  other rg-to-rg/rg-to-head exemption for the same asymmetry.
- **Rationale:** PO, 2026-08-12: "empfehlung."
- **Assignment (if accepted):** queued for implementation this session.
- **Date:** 2026-08-12

## Closure (2026-08-17)

Verified against current source: `guard-lifecycle-ready.mjs:192` defines
`READ_SCOPE_DENIAL_CODE = "GUARD-READ-SCOPE-OUTSIDE-ROOT"`, with commentary
confirming it is "Deliberately NOT the cross-repository-mutation family:
nothing here writes anywhere" — exactly direction 1's decided outcome.
Landed commit `2f466462dbe97bc1330e7578bd21af2d958f1488`, "fix(guard): give
the outside-root bounded diagnostic its own code and a true remedy".
Closing.
