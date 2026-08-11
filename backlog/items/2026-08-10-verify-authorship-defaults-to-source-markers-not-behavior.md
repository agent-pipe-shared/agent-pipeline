---
schema: pipeline.backlog-item.v1
id: pipeline.verify-authorship-defaults-to-source-markers-not-behavior
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-10
closed_at: 2026-08-11
closure_repository: self
closure_commit: a655437ce8dbb785173b65961c60f1599670e92c
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
source: "Codex self-report from a live 2026-08-10 greenfield test session: 'Die erste Verify-Version prüfte nur Quelltextmarker. Erst nach Critic-Befund wurde sie zu Verhaltenstests ausgebaut. Es gab keine echte visuelle Browser-/Touch-Prüfung.'"
---

# A hosted project's first-drafted Verify defaulted to source-text markers instead of real behavior, only becoming a genuine test after a Critic finding

## Description

In a live 2026-08-10 Codex greenfield test (a small HTML minigame,
deliberately a toy happy-path test per the PO, not a defect in the game
itself), the FIRST version of the feature's own Verify/DoD checks only
confirmed that certain source-text markers were present in the code — not
that the feature actually behaved correctly (keyboard/touch input, visual
feedback, etc.). It took a dedicated Critic review round to find this gap and
push the Verify toward genuine behavioral tests; the runner reports there was
still no real visual browser/touch check even after that. Three fix-and-
re-review Critic rounds were needed in total, most of them driven by this
one root pattern rather than by new, unrelated defects each time.

## Triggering situation

Part of a longer self-report from a live 2026-08-10 Codex greenfield test
session, reported by the PO immediately afterward as a specific point worth
checking (distinct from the same report's other findings on kickoff CLI
friction, resume-hint handling, and the critical push blocker, all filed
separately). The PO separately confirmed the overall governance weight of
the test (kickoff/promotion/PRD/Spec/plan-approval/Critic rounds) for a tiny
toy project is intentional and not itself a complaint — this item is
specifically about the DEFAULT QUALITY of a first-drafted Verify, not about
whether the surrounding process is proportionate.

## Affected artifact

No single owning artifact confirmed yet. Candidates: `roles/goldfish.md`
(a Goldfish's own obligation when authoring DoD/Verify checks for a feature
it is implementing), `templates/prompts/goldfish-task.md` (field 3's "DoD
checks" guidance — currently generic, e.g. "Test fixtures MUST mirror the
real harness contract" — but has no explicit rule against a source-marker-
only check standing in for real behavior), or `roles/critic.md` (whether
"Verify only checks for a text marker, not actual behavior" should be a
named, standard hunt category the Critic always checks, rather than
something it happens to catch).

## Proposal

No fix designed yet. Direction to consider: add an explicit rule (likely to
`templates/prompts/goldfish-task.md` field 3, since that is where DoD checks
get authored) that a Verify/DoD check for user-facing or interactive
behavior must exercise the actual behavior (e.g. simulated input events,
rendered-state assertions) rather than only confirming that specific source
text/markers exist — a marker check proves the code was written, not that it
works. Scope this to interactive/UI-bearing features specifically; a marker
check may be entirely appropriate for non-behavioral facts (a config value,
a constant, a doc string). Whether this becomes a hard DoD requirement or a
named Critic hunt category (or both) is a design choice for whoever picks
this item up, not decided here.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed (2026-08-11) — fixed.
- **Rationale:** the item's own proposed direction — an explicit rule that DoD/Verify checks for interactive or user-facing behavior must exercise actual behavior rather than only confirm source-text markers — was landed (`closure_commit` `a655437ce8dbb785173b65961c60f1599670e92c`).
- **Assignment:** N/A — already closed.
- **Date:** 2026-08-11.
