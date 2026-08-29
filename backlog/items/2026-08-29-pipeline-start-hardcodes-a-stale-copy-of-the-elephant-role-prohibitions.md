---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-start-hardcodes-a-stale-copy-of-the-elephant-role-prohibitions
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/skills/pipeline-start/SKILL.md GENERATED FROM roles/elephant.md
source: "Claude/Windows self-audit section 5.7 from the 2026-08-29 three-runner greenfield test (finding F22 of scratch/greenfield-triage-2026-08-29.md)."
---

# `pipeline-start` hardcodes a stale, partial copy of the Elephant role prohibitions instead of deriving them from `roles/elephant.md`

## What happened

The `pipeline-start` skill prints a role-prohibition summary at session
bootstrap so a session need not read `roles/elephant.md` in full just to get
the mandatory confirmation line out. That summary is typed directly into the
skill's own markdown, as a fixed list of EL ids and short paraphrases, not
derived from the role contract it summarizes. A future edit to
`roles/elephant.md` — a new prohibition, a reworded one, a renumbered one —
has no mechanism that would propagate it into this printed line; the two
files can silently disagree indefinitely.

## Where it is

`plugins/pipeline-core/skills/pipeline-start/SKILL.md:261-269`:

```
**Role prohibitions (Elephant, embedded — read no file for this):** EL-01 no
production code (sole exception: the stage-0 fast path per `roles/elephant.md`
— EL-01) · EL-02 delegate once, via the 6-field briefing, never step by step ·
EL-03 judgment stays at its level · EL-04 no silent fundamental decision
(register + ADR) · EL-16 delegate-first: EVERY implementation is a briefed
Goldfish dispatch · EL-18 one repo, one Elephant · EL-19 PO gate: present the
PRD readably, wait for "approved". Print verbatim under the Model/Effort line:

> Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — implementation only via Goldfish dispatch (Tier-0 per roles/elephant.md — EL-01; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'
```

**Correction to the triage row this item is based on:** the triage describes
this as "naming six EL ids"; the text actually names **seven** —
EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19. Both the prose list and the
verbatim confirmation line agree on seven, so the discrepancy is in the
triage's own count, not in the code. Recorded here per the briefing's
stop-condition instruction (contradiction between the triage row and the
repo, noted rather than treated as a reason to stop).

`roles/elephant.md` §3 ("Hard prohibitions") in fact defines a longer,
numbered list than EL-01/02/03/04/16/18/19 alone — EL-05, EL-08, EL-09,
EL-21, EL-31 and others exist in that file and are never mentioned in the
`pipeline-start` summary at all. This confirms the triage's underlying point
even though its literal count was off: the printed summary is a hand-picked
subset, not a generated projection of the full contract, and there is no
test pinning the two artifacts to each other.

## Proposal

Generate the printed summary from `roles/elephant.md` mechanically, the same
pattern `templates/prompts/agent-obligations.md` already uses for guard-owned
obligations (its own header: "Produced by:
`harness/scripts/generate-agent-obligations.mjs`", "Pinned by:
`harness/scripts/generate-agent-obligations.test.mjs` (byte equality)").
Concretely: a small generator script reads the numbered `### EL-NN (MUST
NOT)` headings and their one-line `Rule:` text out of `roles/elephant.md` and
emits the summary block that `pipeline-start/SKILL.md` embeds, with a byte-
equality test pinning the generated block to what is actually shipped in the
skill file — so an edit to the role contract that is not followed by
regenerating the skill text fails a test instead of silently drifting.

## Acceptance

- A generator script (or an extension of the existing
  `generate-agent-obligations.mjs`) derives the `pipeline-start` role-
  prohibition block from `roles/elephant.md`'s own numbered EL headings,
  rather than the block being hand-typed in the skill file.
- A test pins the generated block against what `SKILL.md` currently ships,
  byte-for-byte, and fails on drift the same way
  `generate-agent-obligations.test.mjs` does for its own artifact.
- Every EL id that carries a MUST/MUST NOT rule in `roles/elephant.md` either
  appears in the generated summary or is explicitly, deliberately excluded
  with a stated reason in the generator's own source (not silently dropped).
- Editing a prohibition's rule text in `roles/elephant.md` and re-running the
  generator changes the emitted `pipeline-start` block accordingly, verified
  by a test that edits a fixture copy and re-runs the generator.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** small, self-contained, mirrors an existing shipped pattern
  (`generate-agent-obligations.mjs`/`.test.mjs`) exactly, and closes a real
  silent-drift class between a role contract and a printed summary of it.
- **Assignment:** `sprint: nova` — Nova B work, not a 0.6.0 candidate
  blocker, but in scope for this sprint's backlog sweep.
- **Date:** 2026-08-29

Fixed, 2026-08-29 (dispatch NVA-R17-SKILLGEN): `harness/scripts/generate-elephant-role-prohibitions.mjs`
+ `.test.mjs` added; `plugins/pipeline-core/skills/pipeline-start/SKILL.md`'s
role-prohibitions block regenerated from it, commit `81cde83e`. The generated
per-id text now differs in wording from the old hand-typed paraphrase (it is
mechanically extracted from each included id's own `Rule:` sentence, not a
free-hand summary) — see the dispatch report for the full deviation
disclosure. `status` and `done_when` left untouched for the Elephant to
verify and close.
