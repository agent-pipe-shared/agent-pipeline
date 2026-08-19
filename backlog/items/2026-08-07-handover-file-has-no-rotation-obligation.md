---
schema: pipeline.backlog-item.v1
id: pipeline.handover-file-has-no-rotation-obligation
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-07
source: "PO, 2026-08-07: 'state wird aber auch hoffentlich nicht unendlich lang sondern irgendwann wieder leer :) wenn etwas dauerhaft als regel geschrieben wird, dann muss es in adrs'."
due: 2026-09-06
---

# `docs/state.md` grows every session and is never rotated; the context-economy gate was placed on the file that grows slowly

## Description

[ADR-0012](../../docs/adr/0012-handover-canonicalization.md) made
`docs/state.md` the single canonical handover and established two deterministic
close gates: merge completion, and a **CLAUDE.md** length check for context
economy. No equivalent obligation exists for the handover file itself.

The result is a straightforward mismatch of gate to risk. `CLAUDE.md` is
deliberately short, changes rarely, and is length-gated. `docs/state.md` is
appended to by every session, is read first by every session under the bootstrap
mandate, and is gated by nothing. It currently stands at over 4,500 lines.

[ADR-0060](../../docs/adr/0060-handover-placement-and-rotation.md) makes this
sharper rather than better in the short term: it establishes that mid-task
findings belong in `docs/state.md` precisely *because* a fresh context is a
Goldfish and will not find anything else — which raises the growth rate — and
records a retention obligation (Decision 4) while explicitly leaving the
mechanism undecided (Decision 5). This item is that open decision.

There is a second, less obvious half. ADR-0060 Decision 3 says a durable rule
belongs in an ADR or a policy file, never in the handover. Today that is not
true of the existing file: rules, conventions and standing decisions are
embedded throughout it. Any rotation that simply deletes closed sections would
therefore destroy rules that exist nowhere else. Rotation cannot be designed as
a deletion step; it needs an extraction step first, and the extraction is a
one-time debt against the current 4,500 lines that is larger than the recurring
rotation work.

## Triggering situation

Raised by the PO on 2026-08-07 immediately after a session recorded held Critic
findings plus a standing rule into `docs/state.md`, correctly per the placement
rule but visibly adding to a file the PO expects to shrink again.

## Affected artifact

`docs/state.md`; [ADR-0012](../../docs/adr/0012-handover-canonicalization.md)
(close gates); [ADR-0060](../../docs/adr/0060-handover-placement-and-rotation.md)
Decisions 3–5; the `close-block` / `close-feature` ritual, which is where a
rotation step would most plausibly attach.

## Proposal

Not designed here — ADR-0060 Decision 5 states why: each candidate has a
different failure mode, and choosing among them is a PO decision about how much
history a fresh session genuinely needs *at bootstrap* versus on demand.
Candidates, explicitly not a commitment:

1. **A length gate in the close ritual**, mirroring what ADR-0012 already does
   for `CLAUDE.md`. Deterministic and consistent with existing precedent. Its
   failure mode is that a length trigger fires at an arbitrary moment that has
   nothing to do with whether a section's work is finished, which invites
   rotating live context to get under a number.
2. **Rotate at block/feature boundaries**, not by size: when a block closes, its
   handover sections are extracted and archived. Semantically correct — the
   lifetime of a section is the lifetime of its work — but it does nothing about
   a single long-running feature, which is exactly the present situation.
3. **Archive to a dated `docs/state-archive/`**, with the live file keeping
   pointer lines. Preserves history at the cost of reintroducing the Goldfish
   problem for archived material; acceptable only if the pointers are good
   enough that a fresh session knows when to follow one.
4. **Bound by session count rather than lines.** Closest to the real cost
   driver, but needs a session marker the file does not currently carry.
5. **Independent of the choice above:** a one-time extraction pass over the
   current file, lifting every embedded durable rule into an ADR, policy or
   guardrail file before any rotation runs. Without this, rotation is
   destructive. This is the larger piece of work and it does not depend on which
   of 1–4 wins, so it can start first.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Deferred in Phoenix, not implemented here. The rotation
  mechanism this item asks for (ADR-0060 Decision 5, left deliberately
  undecided) has already been decided and shipped — in the sibling Nova
  checkout, not this one.
- **Rationale:** The PO's standing instruction for this session was to skip
  work already solved in Nova. Nova's `docs/adr/0060-handover-placement-and-
  rotation.md` now states: "the rotation mechanism (Decision 5) is closed by
  ADR-0066 ([...]), 2026-08-17"; Nova's `docs/adr/0066-handover-rotation-
  extraction-archive-hard-size-gate.md` exists and records the chosen
  mechanism (extraction + archive + hard size gate). Nova's `docs/state.md`
  is 1700 lines — consistent with rotation actually running there — against
  this repo's `docs/state.md` at over 18,800 lines and growing, i.e. exactly
  the unbounded growth this item warns about, still happening here.
  `docs/adr/0066*.md` does not exist in this checkout. Porting/adopting
  ADR-0066 here would be exactly the duplicate work the standing instruction
  asked to skip, and adopting a rotation ADR authored against a different
  epic's `docs/state.md` without re-deriving it against Phoenix's own file is
  not a mechanical port in any case.
- **Assignment (if accepted):** Not assigned in Phoenix. Porting ADR-0066 (or
  independently re-deriving the same mechanism against this repo's own
  `docs/state.md`, which by then may be considerably larger) closes this
  item; the file's own continued growth is a live cost of leaving it open.
- **Date:** 2026-08-18

### PO Decision — 2026-08-18

- **Decision:** Option E — adopt Nova's already-shipped direction (extraction pass + archive + hard size gate, essentially porting ADR-0066), re-derived against Phoenix's own much larger file. PO confirms this is a feature Nova already built for exactly this purpose and this session should port/adapt it, not design fresh.
- **Rationale:** PO's direct choice, matching the Elephant's recommendation.
- **Assignment:** Dispatch-ready — real, nontrivial work (the extraction pass runs first, then the archive/gate mechanism).
- **Date:** 2026-08-18

### Progress note — 2026-08-19

Per the 2026-08-18 PO Decision (Option E, port/adapt Nova's ADR-0066), a
dispatch (`PHX-WP-STATE-ROTATION-PORT-ADR0066`, commit `b53019ff`) made partial
progress: a **targeted-search, not exhaustive** extraction pass found and
extracted 3 durable rules into their correct homes (`guardrails/security.md`
SEC-10, `roles/elephant.md` EL-29, `guardrails/quality-gates.md` QG-08), and
wrote `docs/adr/0064-handover-rotation-extraction-archive-hard-size-gate.md`
documenting the chosen mechanism. **Not yet built:** the rotation/archive
script itself, and the hard size gate wired into the close-block ritual —
both deferred for tool-budget reasons. **Not yet read:** roughly 15,000 of
`docs/state.md`'s ~19,000+ lines (everything below the extraction pass's
reach, including pre-checkpoint and inherited Nova-era history) — a full
extraction pass over that remainder is still needed before rotation can run
without risking destroying an un-extracted rule (the exact failure mode this
item's own Description warns against). Item stays open; needs its own
dedicated session given the remaining scale.

### Progress note — 2026-08-19, round 2 (safety-gated build, no live execution)

A follow-up dispatch (`PHX-WP-STATE-ROTATION-EXTRACT-AND-BUILD`, commit `c898536b`)
made substantial further progress, explicitly scoped to never modify
`docs/state.md` itself (a prior attempt to also EXECUTE a rotation in the same
pass was correctly blocked by a safety review as an unreviewed irreversible-
destruction risk against the canonical handover file — this round respected
that boundary throughout, confirmed: `docsStateModified: false`).

**Extraction:** 7 more durable rules extracted (beyond the prior round's 3):
`guardrails/quality-gates.md` gained a QG-08 addendum (source-text blast-radius
+ retroactive schema-consumer check) and a new QG-09 (critical-action/HGO
ceremony commit-exact binding discipline); `roles/elephant.md` gained two
EL-22 addenda (Elephant-vs-background-dispatch concurrent commit hazard;
shared non-code tracking-file hazard), an EL-01 addendum (a GMW guard-lift
does not substitute for the stage-0 fast-path conjunction), and two EL-09
addenda (Critic delta-review base-ref computation; exact-commit-list not a
range in a multi-track session). Coverage: a comprehensive multi-pattern grep
sweep across the full (now 19,072-line) file plus full-context reads around
every hit, plus one genuinely full sequential read of the one zone
(lines 13387-13686) the prior round's targeted search never reached. **Not**
a literal line-by-line read of all 19,072 lines — the dispatch calculated
this alone would cost 35-70 additional tool calls beyond what fit in the
combined read+build+test budget, and documented the grep-sweep substitute as
a deliberate, ADR-0064-consistent scope decision, not a shortcut taken
silently.

**Real, unexpected discovery:** `plugins/pipeline-core/skills/close-block/SKILL.md`
already carries a step 6c "Handover rotation (head-size discipline)"
procedural ritual — predating ADR-0064 (written 2026-08-18), which did not
know about it. The gap this item describes was never "zero rotation
mechanism," only "no automated/structural one, plus growth outpacing the
manual procedure."

**Mechanism built, deliberately not runnable yet:** `plugins/pipeline-core/scripts/handover-rotate.mjs`
(11/11 tests pass, synthetic fixtures only, never the real file) implements
`parseSections`/`computePlan`/`runCli` around a structural safety gate: a
section can NEVER enter an archive plan — in `--dry-run` OR `--execute` — 
without an explicit `pipeline.handover-rotation-extraction-ack.v2` marker.
**`--execute` is currently an unconditional-throw stub, unreachable from any
sanctioned call today** — a deliberate second gate on top of the marker
requirement. `--check-size` (read-only byte-budget check) is wired into
close-block's step 6c as an automated backstop to the existing manual size
judgment. A real dry-run against the actual `docs/state.md` correctly
produced an EMPTY proposal (0 sections) — expected, since no section carries
the ack marker, and adding that marker would itself be an edit to
`docs/state.md` this round correctly refused to make.

**What a live rotation still needs, as its own deliberate, human-reviewed
step:** (1) a decision on which specific checkpoint sections are safe to
mark ack'd/archivable; (2) actually adding those markers to `docs/state.md`
(the one edit type this round would not make unreviewed); (3) implementing
`--execute` for real (currently a stub); (4) the remaining ~13,700 lines of
`docs/state.md` never literally read line-by-line, only grep-swept — a fully
exhaustive extraction pass, if wanted, is further work beyond this round.

### Progress note — 2026-08-19, round 3

A follow-up pair of dispatches (`PHX-WP-STATE-ARCHIVE-COMPLETE`, then
`PHX-WP-STATE-ARCHIVE-FINISH` finishing its documented remaining steps)
closed the gap round 2 left open: item (4) above (the remaining ~13,700
unread lines) and the live rotation itself.

**Extraction:** a full, sequential Read-tool pass over the entire range
never before read line-by-line — `docs/state.md` lines 13686–19155,
covering the "Pipeline general/Nova-Cyborg-release history" block through
every dated "Nova ..." section down to "Open items and next block" — found
**no new durable/standing rule requiring extraction**. Every rule-shaped
statement encountered was already covered by the prior two rounds'
extractions (`guardrails/security.md` SEC-10; `guardrails/quality-gates.md`
QG-08/QG-09; `roles/elephant.md` EL-01/EL-09/EL-22/EL-29 addenda).

**Rotation:** with extraction now complete, PO authorized (2026-08-19
in-session decision) archiving all three candidate ranges (Nova-inherited
history, Phoenix pre-restart history, oldest-era + open-items tail) — none
deleted. `docs/state.md` is reduced from 19,155 lines to its live head
(ending at line 4989, with a new "## Archived history" pointer table); the
archived range (original lines 4977–19155) is preserved verbatim in
`docs/state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md`,
whose own Provenance section carries the full extraction-pass summary.
Full account: [ADR-0064's 2026-08-19 addendum](../../docs/adr/0064-handover-rotation-extraction-archive-hard-size-gate.md#addendum--2026-08-19-extraction-pass-complete-live-rotation-has-run).

**Item stays open.** ADR-0064's own Follow-up section still lists real
remaining work this round did not do and was not scoped to do:
implementing `--execute` for real (currently an unconditional-throw stub)
and wiring the hard-size-gate hook into `hooks.json` (a TP-class
protected-surface change needing its own authorized ceremony). Neither is
closed by this round.
