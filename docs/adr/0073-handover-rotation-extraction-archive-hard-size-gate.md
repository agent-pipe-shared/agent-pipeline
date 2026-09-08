# ADR-0073: adopt Nova's extraction-then-archive rotation shape for Phoenix's own handover, re-derived against this repo's file — mechanism build and rotation itself are NOT done by this ADR

> Previously numbered ADR-0064 (until 2026-08-27).

> Agent-Pipeline · Sprint Phoenix · as of 2026-08-18

**Status:** accepted for the extraction-pass-first sequencing and the chosen
mechanism shape; the mechanism build (rotation script + hard-size-gate hook)
and the rotation of the live file are explicitly **not done here** — tracked
as follow-up. **Basis:**
`backlog/items/2026-08-07-handover-file-has-no-rotation-obligation.md`
(PO Decision, 2026-08-18: *"Option E — adopt Nova's already-shipped
direction ... re-derived against Phoenix's own much larger file. ... port/
adapt it, not design fresh."*). **Closes** [ADR-0060](0060-handover-placement-and-rotation.md)
Decision 5 for the *shape* question; leaves the *build* open (see
Follow-up). **Cross-references** the sibling Nova checkout's
`docs/adr/0066-handover-rotation-extraction-archive-hard-size-gate.md`,
read-only, as the origin of the mechanism this ADR adapts — this repository
never writes to that checkout.

**Governs:** docs/state.md, docs/state-archive/**, governance/observation-doc-governance.json, plugins/pipeline-core/lib/handover-rotation.mjs, plugins/pipeline-core/lib/handover-rotation.test.mjs, plugins/pipeline-core/scripts/handover-rotate.mjs, plugins/pipeline-core/scripts/handover-rotate.test.mjs, plugins/pipeline-core/hooks/guard-handover-size.mjs, plugins/pipeline-core/hooks/guard-handover-size.test.mjs, plugins/pipeline-core/scripts/rotate-handover-sections.mjs, plugins/pipeline-core/scripts/rotate-handover-sections.test.mjs, plugins/pipeline-core/skills/close-block/SKILL.md

## Context

[ADR-0060](0060-handover-placement-and-rotation.md) established the
placement rule (mid-task findings go into `docs/state.md`) and a retention
obligation (Decision 4), while explicitly leaving the rotation mechanism
undecided (Decision 5). The gap has since compounded far past Nova's own
experience of it: at the time of this ADR, Phoenix's `docs/state.md` is
**19,006 lines**, spanning 42 numbered checkpoints plus several thousand
lines of pre-checkpoint and inherited Nova-era history sections. Nova's own
`docs/state.md`, by contrast, sits at roughly 1,700 lines after its ADR-0066
rotation mechanism actually ran — Nova hit the same problem earlier, at
~7,600 lines, and solved it.

Nova's ADR-0066 records the chosen shape: (1) a one-time human/Elephant
extraction pass lifting every embedded durable rule into its correct ADR/
policy/guardrail home, BEFORE any rotation runs, because a rotation that
only deletes destroys rules that exist nowhere else; (2) two independent
rotation triggers — block/feature-boundary rotation (`rotate-handover-
sections.mjs`) and a hard byte-size gate independent of closure
(`handover-rotate.mjs` + a PreToolUse guard hook), because a single
long-running block ("riesen Sprint") can grow unbounded without ever
closing; (3) an explicit, section-scoped acknowledgment marker
(`pipeline.handover-rotation-extraction-ack.v2`) so the rotation script
never guesses at what counts as "already extracted."

Nova's own ADR-0066 is explicit that it did NOT perform the one-time
extraction pass over Nova's file — that was tracked as its own follow-up,
separate from the mechanism build. This ADR inherits the same split for
Phoenix, made sharper by scale: Phoenix's file is roughly **2.5× the size**
Nova's was at the point Nova wrote its own ADR-0066, and the extraction
work is inherently judgment-heavy (reading dense narrative history to find
every embedded standing rule), not mechanical.

## Decision

**1. The mechanism shape is adopted, not redesigned.** Phoenix re-derives,
rather than blind-copies, Nova's ADR-0066 shape:

   - **(a) Block/feature-boundary rotation**, attaching to `close-block`/
     `close-feature`, mirroring the existing ADR-0012 precedent (CLAUDE.md
     length gate at close).
   - **(b) An independent hard size gate**, because Phoenix's own current
     single open checkpoint sequence (42 numbered checkpoints under one
     still-open block) is exactly Nova's "riesen Sprint" case: a
     close-boundary-only trigger would do nothing until that block closes,
     which — per this repo's own recent history — can run for days across
     dozens of checkpoints without closing.
   - **(c) A section-scoped extraction-acknowledgment marker** (schema
     `pipeline.handover-rotation-extraction-ack.v2`, the corrected v2 shape
     Nova's own Addendum 2026-08-18 arrived at after discovering the v1
     repo-wide boolean defeated incremental extraction) — adopted directly
     rather than re-discovering the same v1 defect independently.

**2. Phoenix's checkpoint-numbering convention is compatible as-is.**
Phoenix's `docs/state.md` uses `## CHECKPOINT — <date> (<N>): <summary>`
section headers (42 numbered checkpoints as of this ADR, plus several older
unnumbered date-titled sections and inherited Nova-era history below them).
This is a superset of what Nova's rotation scripts already split on (named
block/section-boundary headers) — no format change is needed for the
mechanism to apply; the numbering is carried in the header text, not a
separate structural field the script needs to parse specially.

**3. Archive location and naming follow Nova's Decision 1/2 unchanged**:
`docs/state-archive/<ISO-date>--<short-slug>.md`, one file per rotation
event, append-only once written, self-contained with a provenance header;
the live file gains an "## Archived history" table (newest first) and
retains only still-open block(s) below it.

**4. The hard cap is NOT re-derived as a fixed number in this ADR.** Nova's
`HANDOVER_MAX_BYTES = 12,000` was sized against the *entire bootstrap
payload* ceiling (`BOOTSTRAP_PAYLOAD_MAX_BYTES = 18,000`) as a fraction of
it, not against any Phoenix-specific measurement. Per Decision 5 of Nova's
own ADR-0066, both the rotation script and the size-gate hook are meant to
live under `plugins/pipeline-core/` as a general Pipeline mechanism reading
the cap from project calibration (`handover.maxBytes`), defaulting to
12,000 when unconfigured — Phoenix, as a consumer of the same plugin,
inherits that default rather than needing its own constant. Whether 12,000
remains appropriate once Phoenix's own rotation cadence is observed is
deferred to the same Follow-up item Nova's ADR-0066 already tracks; this
ADR does not reopen that number.

**5. The one-time extraction pass over Phoenix's current 19,006-line file
is PARTIAL as of this ADR, not complete.** A first extraction sweep
(dispatch `PHX-WP-STATE-ROTATION-PORT-ADR0066`) used a targeted-search
strategy — grepping the file for rule-indicating phrases (`going forward`,
`standing rule`, `never`, `always`, `the rule is`, etc.) rather than a
full sequential read of all 19,006 lines — and, having verified each
candidate against the repo's existing ADR/policy/guardrail set, added the
following previously-unrecorded standing rules to their homes:

   - `guardrails/security.md` SEC-10 — the guard union's threat model
     defends against the agent, not a human operator (PO ruling,
     2026-08-07); no new human-facing ceremony may be added on the
     agent-vs-human-adversary premise.
   - `roles/elephant.md` EL-29 — grounding precedence: current code beats
     Spec/PRD beats the originating GitHub issue when a design leans on a
     stated source (PO correction, 2026-08-09).
   - `guardrails/quality-gates.md` QG-08 — no commit while a Verify run is
     in flight (`VERIFY-CANDIDATE-DRIFT`); suite registration is incomplete
     without the matching `product-capability-inventory` update in the same
     change; a widely-consumed module's downstream test suites are run
     before a change touching it is claimed verified.

   This is **not** a claim of exhaustive line-by-line coverage. A
   targeted-search extraction over a file this size can miss a durable
   rule phrased without any of the searched trigger words. The remaining,
   much larger fraction of the file — in particular the pre-checkpoint and
   inherited-Nova-history sections below line ~13,300, never reached by
   this pass's targeted search at all — is tracked as open per the
   Follow-up below, not silently declared complete.

**6. Because extraction is partial, NO rotation of the live file happens
under this ADR.** Per ADR-0060's own warning (a rotation that only deletes
destroys embedded rules) and per Nova's own Decision 6/7 split (the
rotation script refuses to run until extraction is acknowledged done),
running rotation against a file whose extraction coverage is known-partial
would risk exactly the failure mode both ADRs exist to prevent. `docs/
state.md` is left byte-for-byte unmodified by this dispatch.

## Consequences

**Positive.** Three genuinely load-bearing standing rules (agent-vs-human
threat model, code-beats-spec grounding precedence, verify-candidate/
suite-registration discipline) that previously existed only as narrative
inside a 19,000-line file — reachable only by a session that happened to
scroll to the right checkpoint — now have a durable, indexed home any
future session or Critic review can cite directly. The mechanism shape
question (Decision 5's "which candidate") is answered without re-deriving
Nova's already-debugged design (including its own corrected v1→v2 marker
mistake), consistent with the PO's explicit "port, don't design fresh"
instruction.

**Negative, and load-bearing.** The extraction pass is materially
incomplete — this ADR does not claim otherwise. `docs/state.md` remains at
its full 19,006-line size; the bootstrap cost this whole effort exists to
bound is unchanged today. The mechanism itself (rotation script, hard-cap
guard hook, close-block wiring) is not built in this repository at all yet
— Phoenix currently has neither Nova's `rotate-handover-sections.mjs`/
`handover-rotate.mjs` equivalents nor the guard hook wired into
`hooks.json`. Both remain real, sizeable, separately-dispatchable work.

## Alternatives considered

**Attempt a full sequential read-and-classify of all 19,006 lines in one
dispatch.** Rejected on tool-budget grounds: at ~2,000 lines per read call,
a single pass already consumes the majority of a bounded dispatch's tool
budget before any classification, cross-checking against existing ADR/
policy/guardrail homes, or edit work begins — and Phoenix's file is written
by many prior sessions with materially different rule-density per section,
making a uniform per-line read an inefficient use of a fixed budget
compared to a targeted search that surfaces the highest-confidence
candidates first.

**Port Nova's mechanism code files directly (copy, not re-derive).**
Rejected per the briefing's own instruction and this repo's general
cross-repo posture (`roles/elephant.md` EL-18): Nova's scripts are read as
reference only; a Phoenix-side implementation dispatch builds Phoenix's own
copies under `plugins/pipeline-core/`, informed by Nova's already-debugged
design (including the v1→v2 marker correction) rather than inheriting a
file that was never part of this repository's own review/commit history.

## Follow-up

- **Complete the extraction pass.** A full, systematic read-through of the
  remaining ~15,000 lines this targeted-search pass did not cover (in
  particular the pre-checkpoint and inherited-Nova-history sections below
  line ~13,300) — large, judgment-heavy, and the blocking precondition for
  any real rotation of the live file. Owner: pipeline. No due date set by
  this ADR; the file's continued growth is the live cost of leaving it
  open, as ADR-0060 already states.
- **Build the mechanism**: Phoenix-side `plugins/pipeline-core/scripts/
  handover-rotate.mjs` (or the equivalent extension of the existing
  `rotate-handover-sections.mjs` if one already exists in this repo's
  vendored plugin copy — not verified by this ADR), the hard-size-gate
  guard hook, and `close-block`/`close-feature` wiring, tested against
  synthetic fixtures first per Nova's own precedent (do not first exercise
  against the live, still-partially-extracted `docs/state.md`).
- **Wire the hard-size-gate hook into `hooks.json`** only after both the
  extraction pass and the mechanism build are complete — this is a TP-class
  protected-surface change per this repo's own guard posture and needs the
  same authorized-ceremony treatment Nova's own wiring step is still
  awaiting.
- Revisit whether `HANDOVER_MAX_BYTES = 12,000` (inherited default) is
  appropriate for Phoenix once real rotation cadence is observed here,
  mirroring the open question already tracked on Nova's ADR-0066.

## Addendum — 2026-08-19: extraction pass complete; live rotation has run

Dispatch `PHX-WP-STATE-ARCHIVE-COMPLETE` (with a follow-up finishing
dispatch `PHX-WP-STATE-ARCHIVE-FINISH` writing this addendum and the
matching backlog note) closed the Decision 5/6 gap this ADR left open at
acceptance time:

**Extraction pass is now complete.** A full, sequential Read-tool pass over
the entire remaining range this ADR's own Decision 5 marked unread — lines
13686–19155 of `docs/state.md` as it stood before this round, covering the
"Pipeline general/Nova-Cyborg-release history" block through every dated
"Nova ..." section down to "Open items and next block" — found **no new
durable/standing rule requiring extraction**. Every rule-shaped statement
encountered in this range was already captured, verbatim or in substance,
by the two prior extraction rounds: `guardrails/security.md` SEC-10,
`guardrails/quality-gates.md` QG-08/QG-09 (this round's read additionally
confirmed QG-12's coverage of the "no 'X cannot happen because Y' without a
test" pattern found here), and `roles/elephant.md`'s EL-01/EL-09/EL-22/EL-29
addenda. Full detail and the exact statement-to-extraction mapping are
recorded in the archive file's own Provenance section (see below).

**Live rotation has run.** `docs/state.md` is reduced from 19,155 lines to
its live head, ending at line 4989 (a new "## Archived history" section with
a pointer table). The archived range (original lines 4977–19155) is
preserved verbatim in `docs/state-archive/2026-08-19--pre-restart-and-nova-
inherited-history.md`, whose own `## Provenance` section documents the
source range, the PO authorization (2026-08-19 in-session decision to
archive all three candidate ranges, none deleted), and the extraction-pass
summary above in full. Committed together with the ADR-0073-required
inventory entry in `governance/observation-doc-governance.json` classifying
the new archive file (`audience: maintainer`, `lifecycle: normative-record`).

**Still open, unchanged by this addendum:** the Follow-up items above —
`--execute` in `handover-rotate.mjs` remains an unconditionally-refusing
stub, and the hard-size-gate hook is not wired into `hooks.json` (both
explicitly out of scope for the dispatches that produced this addendum;
the hook wiring in particular is a TP-class protected-surface change
needing its own authorized ceremony). This addendum closes only the
extraction-completeness and one-time-rotation questions Decision 5/6 left
open — it does not close this ADR's Follow-up section.
