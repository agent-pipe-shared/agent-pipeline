---
schema: pipeline.backlog-item.v1
id: pipeline.strip-for-dispatch-misses-resolution-heading
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — discovered while assembling the T1 Critic dispatch for NVA-B-TILDEFIX-1. The backlog item being cited as spec had accumulated a '## Resolution' section (implementor narrative: which commit fixed it, how, and why the fix is believed correct) after its originating dispatch landed. backlog-item-strip-for-dispatch.mjs's output still carried that section verbatim — it only strips known Triage/Closure verdict-shaped headings, and 'Resolution' is not one of the patterns it recognizes."
done_when: manual
source: "Elephant, 2026-09-06, while building the NVA-B-TILDEFIX-1 Critic dispatch: ran the strip script, then noticed the output still contained '## Resolution' with the fix's own justification prose, and manually removed it from the scratch copy used as SPEC_PATH before dispatching."
---

# `backlog-item-strip-for-dispatch.mjs` does not remove a `## Resolution` section

## The gap

`templates/prompts/critic-review.md`'s "Input contract" rule (also cited by
`goldfish-task.md`'s backlog-item citation rule) is explicit: a backlog item
handed to a Critic or Goldfish as spec/reference must carry requirements and
references only — never a prior verdict, implementor narrative, or
"why/how it was fixed" prose. `backlog-item-strip-for-dispatch.mjs` exists to
enforce exactly this, but its heading-pattern list evidently does not include
`## Resolution` (or similarly-named headings a goldfish naturally adds when
asked to record what it fixed — e.g. from a briefing instruction like "add a
short note under a new '## Resolution' heading naming the commit(s)").

Confirmed live, 2026-09-06: `backlog/items/2026-09-06-a-leading-tilde-path-argument-is-admitted-as-inside-the-project-root.md`
had a `## Resolution` section added by the `NVA-B-TILDEFIX-1` dispatch,
naming the fixing commit and describing the fix's design rationale. Running
`backlog-item-strip-for-dispatch.mjs --item <path> --out <stripped-path>`
against it left that section fully intact in the output.

## Why this matters

This is exactly the "circular measuring stick" contamination shape
(`backlog/items/2026-08-18-triage-verdict-text-can-contaminate-a-backlog-item-as-a-later-spec-reference.md`)
the strip script exists to prevent — except for a heading name that script's
pattern list does not yet recognize. Undetected, a Critic reviewing a fix
would receive the implementor's own account of why the fix is correct
alongside (formally, disguised as part of) the spec it is meant to review
independently against.

## How it was worked around this time

The Elephant read the stripped output, noticed the `## Resolution` section
survived, and manually deleted it from the scratch copy before using that
copy as the Critic dispatch's `SPEC_PATH` reference. This is a one-off,
manual mitigation — not a fix to the script, and easy to miss on a less
careful pass.

## Acceptance criteria

- `backlog-item-strip-for-dispatch.mjs` also strips a `## Resolution` heading
  and its content (and any other heading name already established by this
  repository's convention for "what a dispatch did to close this item" —
  survey recent closed items for the actual set of names in use before
  hard-coding just one).
- A regression test using a fixture backlog item with a `## Resolution`
  section confirms it is stripped.
- Existing strip-script tests/behavior for Triage/Closure headings are
  unchanged.

## Recurred, 2026-09-06 (NVA-B-CODEXGUARDIMPORT-1 T1 Critic round 1) — this time NOT caught before dispatch

The same gap, different heading name: the stripped spec handed to the
Critic dispatch for `d398a662` still carried its own
`## Progress note (2026-09-06, NVA-B-CODEXGUARDIMPORT-1)` section
(implementor conclusions: "byte-identical function, zero behavior change",
"38/38 pass, zero assertion changes") — unlike the `NVA-B-TILDEFIX-1` case
above, this was NOT caught by the Elephant before dispatch; the Critic
itself flagged it as a briefing violation and reported that no finding in
its review rested on the contaminated text. Widens this item's acceptance
criteria: the heading survey must also include `## Progress note (...)`,
which is now confirmed as a second real, recurring instance of the same
pattern, not a one-off.
