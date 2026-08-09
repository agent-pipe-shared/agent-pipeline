---
schema: pipeline.backlog-item.v1
id: pipeline.language-selection-scope-is-unclear-and-arrives-too-late
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-09
source: "Live observation of the PO's private Claude+Pipeline and Codex+Pipeline 0.5.4 happy-path test runs (fifth local candidate), 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
closed_at: 2026-08-09
closure_repository: self
closure_commit: 485613cfd9d336ee8c6d9abed63aa5e84892ff07
closure_evidence: backlog/evidence/2026-08-09-language-selection-scope-fix-closure.md
---

# The bootstrap language question is scoped to documents only, but that scope isn't clear enough in practice, and it surfaces too late

## What happened

`references/kickoff-design.md`'s bootstrap language question is already
correctly scoped in its own wording — it asks specifically "Which language
should the PRD, Spec, and this project's working documents use", not the
language of the project's own deliverable/content. In both the Claude and
the Codex 0.5.4 happy-path re-test runs on the same day, the actual session
still hit friction over language: the Codex run restarted at least once
partly over language-selection confusion (losing its session context in the
process — see the sibling resume-hint items), and the Claude run needed one
or two repair cycles via the documented
`PO-GATE-PRD-LANGUAGE-MISMATCH` → `projection-drift` two-step repair path
(`po-gate-profile-repair.mjs`).

The scope being correct in the reference text is not the same as it being
communicated clearly and early enough in practice: a documented repair path
for the drift it can cause is a mitigation for the friction, not a removal
of it.

## Root cause (found by code reading, 2026-08-09)

Unlike the project `goal`, which `kickoff plan`/`kickoff apply`
(`planProjectOnboardingKickoffV4`/`applyProjectOnboardingKickoffV4`,
`project-onboarding-v3.mjs`) accept as a real, structurally-required
parameter, the document language has **no parameter anywhere in the
onboarding-through-kickoff call chain**:

- The provisional kickoff-seed PRD's `<!-- po-language: … -->` marker is
  written by `initialPrdContent()` (`lib/onboarding-continuity.mjs:2990`),
  using a value from `kickoffLanguage(root)` (`:2946`) — which reads it back
  from whatever `pipeline.user.yaml`/the runtime manifest were already
  seeded with at portable-seed time, **not** from anything asked during
  kickoff itself.
- The portable-seed step (`project-onboarding-v3.mjs`) has no
  `humanFacingLanguage`/`--human-facing`-style input anywhere — grepping the
  whole file for it returns nothing. Whatever seeds `pipeline.user.yaml`'s
  language field does so with a fixed default, not a live answer.
- `references/kickoff-design.md` tells the AGENT, in prose, to ask the
  human for language "together with the goal" — but there is no code path
  for the agent to actually deliver that answer into either of the two
  points above. The only place a human's real choice can land today is
  reactively, in a hand-authored PRD's marker, once promotion or drift
  detection notices it disagrees with the already-seeded default —
  exactly the `PO-GATE-PRD-LANGUAGE-MISMATCH` → `po-gate-profile-repair.mjs`
  cycle this item's "What happened" section observed live, on both runners.

This is why "ask it earlier" alone would not fully close the gap even if an
agent reliably remembered to: there is currently nowhere for the answer to
go before kickoff, only after.

## Direction

Give `kickoff plan`/`kickoff apply` a real `language` parameter (`de`/`en`),
enforced the same way `goal` already is (the command should refuse to
proceed without a valid value, not merely have a reference document
recommend asking for one), and thread it through to both places that
currently either default or read a stale value: `initialPrdContent()`'s
`po-language` marker and whatever seeds `pipeline.user.yaml`'s language
field at portable-seed time. Update the state-machine's `collect-input`
guidance so an agent is told, structurally, that language is a required
input alongside goal — not only via `kickoff-design.md` prose. Backward
compatibility for existing internal/test call sites that omit the
parameter (many hardcode `en` today) is a judgment call for whoever
implements this; the load-bearing property is that the live onboarding CLI
path a real session drives treats it as required, exactly like `goal`.

## Related

- `2026-08-09-bootstrap-and-kickoff-teach-their-own-constraints-only-by-live-rejection.md`
  (closed, fixed by GF-063 same day) — a related but distinct class of
  "learned only by live rejection" bootstrap gap; this item is scoped
  specifically to the language question's clarity/timing, not the general
  pattern.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
