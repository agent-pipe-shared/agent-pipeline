---
schema: pipeline.backlog-item.v1
id: pipeline.no-check-validates-prose-section-citations
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-07
source: "Measured by the PHX-R3-RESCOPE dispatch (344 stale citations across 57 files). PO decision (APS, 2026-08-07): accepted for implementation, as the follow-up that makes the defect class non-recurring."
due: 2026-09-06
---

# Nothing in the repository validates prose `§N` / `§N.M` citations

## Description

Documents across this repository cite `docs/operating-model.md` by section
number — `operating-model.md §2.3`, `OM §4.2`, `§3.2 step 3b`. Nothing checks
those references. `harness/scripts/check-doc-contracts.mjs` validates Markdown
links and link fragments; a `§N.M` written in prose, or a path written as a
backtick code span, is invisible to it.

The measured result of that blind spot: **344 such citations across 57 files**,
of which **230 point at subsections that do not exist at all** (the operating
model has ten numbered `##` sections and three `###` children, none of them
numbered) and **51 confirmed** point at a section that exists but describe it
wrongly. `CLAUDE.md` itself carries 11.

The drift happened silently over at least one restructuring, and would have
continued: the only reason it surfaced is that a Critic happened to try
resolving one reference supplied in a dispatch briefing.

## Why a lint and not just a cleanup

The one-time cleanup is separately decided (PO decision 2026-08-07: sweep all 39
live agent-facing artifacts). That fixes the instances. It does not stop the
next restructuring from doing the same thing again, and the evidence that it
would is direct: this is the second drift of the same kind, and no mechanism
noticed either.

There is a second-order reason too. The dispatch templates are normative under
CLAUDE.md's "dispatch from the template, never freehand" rule, and the Elephant
copies their reference list into every Goldfish and Critic briefing. A stale
citation there is not a documentation blemish — it is a broken reference handed
to a fresh-context agent that has no other way to resolve it. That is exactly how
this was found.

## Triggering situation

2026-08-07, re-deriving residual R3's inventory. The dispatch proposed this lint
and the sibling anchor-hygiene fix as follow-ups rather than filing them, since
its scope was design-only.

## Affected artifact

A new check under `harness/scripts/`, registered in `harness/scripts/verify.mjs`.
Note the registration file is TP-3-protected, so the new suite needs a briefed
test-change task — see
`backlog/items/2026-08-07-ruleset-source-test-unregistered-in-the-verify-gate.md`,
where the same hand-off is the recorded structural cause of three unregistered
suites.

## Proposal

**Owner: PO.** Accepted; the design question is what the lint should accept, not
whether to build it.

1. **Minimum useful form:** parse `§N` and `§N.M` references naming
   `operating-model` (in prose or a code span), resolve them against that file's
   real heading structure, and fail on a subsection that does not exist. This
   alone would have caught 230 of the 344.
2. **The harder half — kind B.** A citation like "§4 (review system)" resolves
   *structurally* but describes the wrong section (§4 is "The lifecycle"). This
   needs comparing the citation's parenthetical against the heading text, which
   is fuzzy. Options: require the cited heading title verbatim (strict, and it
   forces the migration the sweep is doing anyway), or warn rather than fail on
   a mismatch.
3. **Generalisation, deliberately deferred:** the same blind spot applies to
   backticked `path:line` citations, which several design documents use
   heavily — a doc-contract green currently says nothing about any of them. That
   is a larger check with a real false-positive risk on line numbers, and it
   should not be bundled in.

**Sequencing.** Build the lint *after* the sweep, not before: introduced first,
it turns 344 existing references red at once and the sweep becomes a red-gate
emergency instead of planned work. Introduced after, it holds the line the sweep
establishes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** ACCEPTED for implementation. PO decision (APS, 2026-08-07),
  taken together with the anchor-hygiene fix and the operator-visible fix string
  in `harness/scripts/check-claude-md-lines.mjs:59`.
- **Rationale:**
- **Assignment (if accepted):**
- **Date:** 2026-08-07
