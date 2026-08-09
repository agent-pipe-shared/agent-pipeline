---
schema: pipeline.backlog-item.v1
id: pipeline.consumer-projects-have-no-goldfish-dispatch-requirement-for-implementation
type: idea
owner: pipeline
status: open
created: 2026-08-09
source: "Live Claude+Pipeline 0.5.4 greenfield test session, 2026-08-09 (session 6c12cf91): a full three-file browser game was implemented with zero Agent/Task dispatches — confirmed by an exhaustive grep of the whole transcript. PO's direct suspicion, independently confirmed: 'er hat die Entwicklung nicht dispatched sondern im Elephant selber gemacht.'"
due: 2026-08-23
---

# Should the shipped plugin require Goldfish dispatch for implementation in EVERY project, or is that specific to this repo's own self-governance?

## What happened

In a live Claude Code greenfield test session, all three deliverable game
files (`index.html`, `styles.css`, `game.js`) were written directly by the
main/"Elephant" session via `Write`/`Edit` — zero `Agent`/`Task` tool calls,
zero `isSidechain: true` entries, anywhere in the whole 843-line transcript.
The three `pipeline-core:goldfish-*` subagent types WERE available (listed
in the session's own agent roster) but never invoked.

## Why this is a genuine open question, not an obvious bug

`plugins/pipeline-core/skills/pipeline-start/SKILL.md`'s "Gate authority and
autonomous continuation" section, read as currently written, describes
"scoped edits, focused tests, state readback, one-line commits, Verify,
Critic preparation and ordinary block continuation" as **agent work** — i.e.
the single active agent doing the implementation directly, with a Critic
review as the independent-check layer, is not obviously a violation of the
current design. The Goldfish/Elephant role split governs THIS repo's own
development (ADR-0015 self-application) at a deliberately heavier
governance tier; whether every arbitrary consumer project (including a tiny,
three-file, no-backend static game) should be held to the same fresh-context
Goldfish-dispatch discipline is a real product-design tradeoff, not a
self-evidently-correct requirement:

- Mandating it everywhere would meaningfully increase overhead for small
  projects — directly in tension with the ALREADY-FILED proportionality
  concern (`2026-08-09-push-approval-signature-ceremony-is-not-staged-by-project-profile.md`)
  from the SAME test session, about the ceremony cost for a tiny project.
- NOT mandating it means feature implementation in consumer projects has no
  independent-author guarantee at all — the audit/review value the whole
  Goldfish/Critic split exists to provide never applies outside this repo.

## A narrower, more clearly correct gap found alongside this

Independent of the dispatch question: `SKILL.md`'s own text already lists
"Critic preparation" as expected agent work, but in this same session, ZERO
`critic-review` invocations happened either — the independent-review layer
the text already calls for was silently skipped, with no dispatch mandate
required to have caught it. This narrower gap (Critic review not actually
enforced/checked before a feature is treated as done, in ANY project) is
being addressed directly this session as GF-083 — see its commit for the
concrete fix. This item is scoped to the BROADER, still-open question:
whether Goldfish dispatch itself should also become a requirement outside
this repo's own self-application.

## Direction

PO decision needed: pick one of (a) leave consumer-project implementation as
single-agent-direct, with a REQUIRED Critic review as the audit layer (the
narrower fix already applied), (b) require Goldfish dispatch universally,
accepting the overhead-for-small-projects tradeoff, or (c) stage it by
project profile (a "full-sdlc"-tier project gets full Goldfish/Critic split;
a "mini"/static-content profile gets direct-implementation + Critic-only) —
which would need to be designed together with the sibling profile-staging
question already raised for push-approval.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
