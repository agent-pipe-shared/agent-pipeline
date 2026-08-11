---
schema: pipeline.backlog-item.v1
id: pipeline.happy-path-turn-and-wall-clock-cost-is-not-externally-defensible
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-10
source: "PO, 2026-08-10, after reviewing two live greenfield happy-path tests: 'die pipeline nimmt durch ihre ineffizienz einfach zu viel zeit weg. Das ist so noch nicht extern vertretbar... Claude Code braucht jetzt 2h für das mini spiel mit push etc.'"
---

# A trivial happy-path run (one small HTML minigame, kickoff through push) costs ~2 hours wall-clock — not externally defensible yet

## Description

The PO ran two live greenfield happy-path tests on 2026-08-10 (Claude Code
and Codex) for a deliberately tiny scope: kickoff a small local HTML
minigame, implement it, get it reviewed, and push it. The Claude Code
session alone took roughly 2 hours end to end. Quality was noticeably
higher than in other comparable tests (see the separate EGM-dispatch
feedback from the same conversation) — this item is specifically about
wall-clock/turn cost, not about quality regressing. The PO's own framing:
this level of overhead is not yet externally defensible, and turn/manual-
command-search inefficiency needs to come down significantly before the
pipeline can be tested more broadly.

## Triggering situation

PO statement, 2026-08-10, made deliberately as a distinct, higher-priority
concern from the individual bug reports filed earlier the same session —
those are concrete defects; this item is about the AGGREGATE cost even
after those defects are fixed, and should be treated as its own focus area,
not assumed solved once the individual items close.

## Affected artifact

No single artifact — this is a cross-cutting cost problem. Concrete,
already-quantified contributors identified this same session via forensic
transcript review (see `references/transcript-forensics.md` for the
methodology used):

- **Kickoff CLI parameter discovery.** Before GF-092's fix, ~43% of the
  15-minute kickoff-to-implementation window in the Claude session was
  parameter-discovery detours (guessing `kickoff plan`/`kickoff promote`
  flags undocumented in `kickoff-design.md`), including two ad-hoc research
  subagent dispatches costing 132s/21 tool-uses/~50k tokens and
  188s/36 tool-uses/~83k tokens respectively, purely to reverse-engineer
  correct CLI syntax from source. GF-092 closed the specific documentation
  gap that caused THIS instance, but the pattern — an agent burning a
  subagent dispatch to discover correct invocation syntax instead of finding
  it in the loaded reference — is a general risk wherever a reference is
  incomplete, and nothing currently catches this class of gap before an
  agent hits it live.
- **Host-boundary command-relay cycles.** Before GF-094's fix, the Codex
  session spent ~6 turns purely on command-relay-and-fix cycling for two
  kickoff commands that should have taken one turn each, because the
  human-facing command text was unrendered/unquoted.
- **Multiple Critic re-review rounds.** The Codex session needed 3
  fix-and-re-review Critic rounds for one small feature, most driven by one
  root pattern (Verify defaulting to source-marker checks instead of real
  behavior — filed separately). Each round is a full fresh-context dispatch
  cycle, not a quick fix — this is probably one of the single largest time
  contributors in the 2-hour total, and is not yet quantified precisely.
- **Governance sequencing itself** (kickoff, promotion, PRD, Spec, plan
  submission, human plan approval, phase change, Verify evidence,
  threat-model commit) is deliberately NOT in scope for cost-cutting per the
  PO's own separate statement the same session ("das ist bewusst dafür ist
  die pipeline nicht gedacht") — the toy project's small size doesn't mean
  the governance steps themselves are the problem; the turn-cost problem is
  in HOW EXPENSIVE each step is to execute correctly (rediscovery, retries,
  re-review), not in the number of steps.

## Proposal

No fix designed yet — this needs its own scoped investigation, not a quick
patch, given it's a systemic cost problem rather than one defect. Candidate
starting points for whoever picks this up:
- Quantify precisely where the ~2 hours actually went (a full transcript
  time-accounting pass, similar to the forensic analyses already done this
  session but focused specifically on wall-clock/turn attribution per phase:
  kickoff, plan/design, implementation dispatch, Critic rounds, push).
  Without this, further optimization is guesswork.
- Treat "an agent had to burn a subagent dispatch or multiple retries to
  discover correct CLI syntax" as its own named defect class going forward
  (not just fixed reactively per-instance as GF-092/094 did) — possibly a
  standing check: before shipping a candidate, confirm every CLI surface an
  agent is expected to invoke during the happy path is fully and correctly
  documented in the reference an agent would actually load at that point.
- Investigate whether the Critic-round count (3 rounds for one small
  feature) can be brought down by raising the bar on what a Goldfash submits
  as "done" the first time (see the separate verify-authorship backlog item)
  rather than relying on Critic rounds to catch it after the fact each time
  — catching something on round 1 of 1 is far cheaper than catching it on
  round 1 of 3.
- Consider whether some of the fixed sequential steps (kickoff → promote →
  submit-plan → approve-plan → set-phase) could be safely collapsed for a
  profile that has already been fully decided, without weakening the actual
  gates, purely to remove round-trip count.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted — do the time-accounting pass first, before any
  optimization work.
- **Rationale:** PO, 2026-08-11: "A" of this item's own Proposal. Quantify
  precisely where the ~2h went via a full transcript time-accounting pass
  (kickoff, plan/design, implementation dispatch, Critic rounds, push),
  before picking any of candidates B (name "CLI-syntax rediscovery" as its
  own defect class), C (reduce Critic-round count by raising the bar on a
  Goldfish's first submission) or D (collapse fixed sequential steps for an
  already-decided profile).
- **Assignment (if accepted):** Unassigned — a research/forensics-tier
  dispatch once picked up; not started this session.
- **Date:** 2026-08-11
