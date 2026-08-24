---
schema: pipeline.backlog-item.v1
id: pipeline.elephant-notes-and-critic-scratch-share-one-directory
type: defect
owner: pipeline
status: closed
created: 2026-08-23
source: "Observed 2026-08-23 while dispatching the sprint-agy-runner delta Critic review; templates/prompts/critic-review.md scratchpad-isolation block"
due: 2026-08-30
---

# Orchestrator notes and Critic scratch share one directory, so verdict-bearing material sits where a dispatched Critic is guaranteed to look

## Description

`templates/prompts/critic-review.md`'s scratchpad-isolation block sends every
Critic to the repository's own `scratch/` directory, tells it to create a fresh
`scratch/<codename>-<hex>/` subdirectory with a bare `mkdir`, to stay inside it,
and to treat pre-existing sibling content as a disclosure item rather than as
evidence.

That rule assumes the other occupants of `scratch/` are other dispatches. They
are not. The Elephant's own working notes live in the same flat directory. In
the 2026-08-23 sprint-agy-runner session, `scratch/` held the session handover
(prior FAIL verdict, per-finding disposition, PO decisions), the PO-disposition
text, the replacement `docs/state.md` block, and the full text of the Critic's
own dispatch prompt.

That is precisely the material the fail-closed reference boundary spends two
pages excluding: prior verdict, implementor rationale, summary of intent, and
the frame the Critic is supposed to construct for itself. And the Critic cannot
avoid opening the directory — the isolation rule requires it to create a
subdirectory there, and a bare `mkdir` collision check invites listing it.

## Why this is a design gap rather than one session's mistake

Every other contamination vector in the Critic contract is closed structurally:
paths instead of prose, bare finding IDs instead of titles, fresh context, no
chat history, no implementor characterization. This one is closed by asking the
Critic not to look, inside the one directory it is guaranteed to enter. A
behavioural rule guarding the highest-value contamination source is the weakest
link in an otherwise mechanical contract.

The 2026-08-23 delta review reported no briefing violation and its findings show
no sign of contamination, so no harm is evidenced in that round. The exposure is
the defect, not a specific outcome.

## Candidate fixes

1. **Separate the two uses by directory.** Dispatches get `scratch/dispatch/`
   and the Critic's isolation rule points there, so its listing never shows
   orchestrator notes. Keeps everything in-repo and gitignored, consistent with
   ADR-0063.
2. **Give the orchestrator a distinct location.** Requires a writable path that
   the containment guard admits; a host-temp session scratchpad is refused by
   `GUARD-CROSS-REPO-MUTATION`, so this needs an in-root home anyway, which
   collapses into option 1.

Option 1 is the smaller change and the one that actually closes the exposure.

## Interim discipline

Until this is fixed, an Elephant preparing a Critic dispatch keeps
verdict-bearing notes out of `scratch/` — or accepts and discloses that the
dispatched Critic can read them.

## Acceptance

- A dispatched Critic listing its scratch location cannot see orchestrator
  notes.
- `templates/prompts/critic-review.md` names the separated location.
- The change is reflected in the vendored plugin copy of the template.

## Closure, 2026-08-24

Fixed via `AGY-SCRATCHSEP-1` (goldfish-implementor), commit `816331c3`. The
Critic's isolation subdirectory moved from `scratch/<codename>-<hex>/` to
`scratch/dispatch/<codename>-<hex>/` in both `templates/prompts/critic-review.md`
and its vendored plugin copy — confirmed byte-identical before and after
(`diff`, zero output). No other section of either template changed;
`check-consumer-safe-paths.test.mjs` 9/9 green. All three Acceptance
criteria above are met. Independently re-verified by the Elephant: `git
show 816331c3` confirms the diff is confined to the intended paragraph
(the larger line count is a text-reflow artifact of the longer path, not
scope creep).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Candidate fix 1 (`scratch/dispatch/` as the Critic's target,
  keeping orchestrator notes in flat `scratch/`) is narrow and does not
  touch the contamination-boundary logic itself, only where the isolation
  rule points — but it does edit the mandatory Critic dispatch template
  (`templates/prompts/critic-review.md` + its vendored plugin copy), which
  CLAUDE.md treats as sensitive ("dispatch from the template, never
  freehand"). Real exposure, no evidenced harm yet (2026-08-23 delta review
  found no contamination), not urgent enough to interrupt the current
  verify-tuner priority.
- **Assignment (if accepted):** this sprint, as its own small scoped
  dispatch (2 files, no design latitude beyond picking the new path name) —
  not done inline in this session.
- **Date:** 2026-08-24
