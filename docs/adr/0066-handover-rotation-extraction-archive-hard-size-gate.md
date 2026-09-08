# ADR-0066: the handover rotates via extraction-then-archive, gated by a hard size cap that fires independently of block closure

> Agent-Pipeline · Sprint Nova · as of 2026-08-17

**Status:** accepted (2026-08-17, PO instruction, chat: *"ja mach das aber nicht
nur close dazu auch ein hard gate wegen riesen sprints"* — build it, and do not
gate rotation on block/feature closure alone; add a hard gate, because a single
sprint/block can grow huge long before it ever closes). **Basis:**
`backlog/items/2026-08-07-handover-file-has-no-rotation-obligation.md`, whose
Triage already recorded the PO's 2026-08-12 *"empfehlung"* — accept the
Elephant's recommended sequencing (candidate 5, one-time extraction, then
candidate 2, rotate at block/feature boundaries) — which today's instruction
extends with the hard-cap gate below. **Closes** [ADR-0060](0060-handover-placement-and-rotation.md)
Decision 5, left explicitly open there. **Extends** [ADR-0012](0012-handover-canonicalization.md)'s
close-gate precedent (the existing CLAUDE.md length check) to the handover
file itself.

**Governs:** plugins/pipeline-core/lib/handover-rotation.mjs, plugins/pipeline-core/lib/handover-rotation.test.mjs, plugins/pipeline-core/scripts/handover-rotate.mjs, plugins/pipeline-core/scripts/handover-rotate.test.mjs, plugins/pipeline-core/hooks/guard-handover-size.mjs, plugins/pipeline-core/hooks/guard-handover-size.test.mjs, plugins/pipeline-core/hooks/hooks.json, plugins/pipeline-core/hooks/codex-pretool-guard.mjs, plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs, plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs, plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs, plugins/pipeline-core/scripts/rotate-handover-sections.mjs, plugins/pipeline-core/scripts/rotate-handover-sections.test.mjs, plugins/pipeline-core/skills/close-block/SKILL.md, plugins/pipeline-core/skills/close-feature/SKILL.md, plugins/pipeline-core/scripts/pipeline-state.mjs, plugins/pipeline-core/scripts/pipeline-state.test.mjs

## Context

[ADR-0060](0060-handover-placement-and-rotation.md) established that mid-task
findings belong in `docs/state.md` — a fresh session is a Goldfish, and the
handover is the only artifact the bootstrap mandate guarantees it will read —
and recorded a retention obligation (Decision 4) while explicitly leaving the
rotation mechanism undecided (Decision 5), tracked as this ADR's basis item.

The growth this was meant to answer has not stopped. At filing (2026-08-07)
`docs/state.md` was "over 4,500 lines." The item's 2026-08-17 update measured
7,574 lines. As of this ADR, direct measurement: **7,633 lines, 787,508
bytes.** Using this codebase's own established conservative metric
(`lib/bootstrap-payload-budget.mjs`'s `utf8-byte-upper-bound`, one UTF-8 byte
as one token unit upper bound — the same metric `pipeline-start-preflight.mjs`
budgets the entire bootstrap payload against, ceiling `18,000` units), the
handover file ALONE is now **~44× the ceiling the whole bootstrap payload is
supposed to respect.** Every session pays this at bootstrap, by mandate,
before it can do anything else.

The 2026-08-12 Triage on the basis item already answered the "how" in
principle: start with a one-time extraction pass (lift every durable rule
embedded in the current file into an ADR/policy/guardrail file — a rotation
that does not do this first is destructive, per ADR-0060's own Consequences
warning), then rotate at block/feature boundaries going forward. What that
Triage did not anticipate, and what today's PO instruction adds, is the
**"riesen Sprints" problem**: this repository's own current single open
block (`**Current block:** PO-directed autonomous AFK session (2026-08-11...`)
has been running for a week and has accreted dozens of dense paragraph-length
bullets without ever closing — a purely block-boundary-triggered rotation
does nothing for a block that simply never closes. The mechanism needs a
second, independent trigger that does not wait for a close event at all.

## Correction, 2026-08-17 (discovered while dispatching this ADR's own Follow-up)

This ADR was drafted on the mistaken premise that no rotation mechanism
existed yet — the basis backlog item's own 2026-08-17 update said so
("no `docs/state-archive/` or equivalent extraction target exists"), and
that check was not re-verified against actual repository history before
writing Decision-level text implying a from-scratch build. It was
incomplete: `plugins/pipeline-core/scripts/rotate-handover-sections.mjs`
already existed, landed 2026-08-12 (commit `93f638e5`), already implements
candidate 2 (block/feature-boundary rotation) from this ADR's own basis
item, and was already wired into `close-block/SKILL.md` step 6c. It had
simply never been run with `--apply` against the real file, which is why
`docs/state-archive/` did not exist on disk — a true fact that was read as
"no mechanism exists" rather than "an existing mechanism has never fired."

**This does not make Decisions 3(b)/4 (the hard size gate) redundant.**
`rotate-handover-sections.mjs`'s own fail-safe design retains any section
carrying an open marker ("(current)"/"(in progress)") unconditionally — by
construction, it can never rotate a single still-OPEN block, which is
exactly the "riesen Sprint" case this ADR's hard gate exists for. The two
mechanisms address genuinely different triggers, not the same one twice.

**It does leave a real, disclosed inconsistency**: two archive-naming
conventions now coexist under `docs/state-archive/` — `rotate-handover-
sections.mjs`'s monthly `<YYYY-MM>.md` buckets (with a pointer-line
in-place marker) and this ADR's own per-event `<ISO-date>--<slug>.md` files
(with a table-based "Archived history" index). Reconciling this into one
convention, or explicitly documenting why two conventions is the right
permanent shape (one heuristic/close-time, one explicit/forced), is
tracked as its own Follow-up item below — not decided here, and not
attempted by the `NVA-HANDOVER-ROT-1` dispatch that built Decisions 3(b)/4
(explicit coordinator instruction: disclose, do not reconcile
unilaterally).

## Decision

**1. Archive format.** Rotated content moves to `docs/state-archive/`, one
file per rotation event, named `<ISO-date>--<short-slug>.md`. Each archive
file is self-contained: a short provenance header (source file, rotation
date, the block/section title and date range it carries, the rotating
script's own identity) followed by the rotated content verbatim. Archive
files are append-only once written — never edited after the fact, matching
this repository's general append-rather-than-rewrite posture for historical
record (the backlog ledger's hash chain is the sibling precedent; this ADR
does not require hash-chaining the archive, since `docs/state.md` is not a
security-relevant audit trail — a plain immutability convention is
proportionate).

**2. Live-file structure after rotation.** `docs/state.md` keeps its existing
header block (Last updated / Project status / Release version+state)
unchanged, gains a new **"## Archived history"** section — a table of archive
files, newest first, each row a date range and a one-line summary — and below
that, only the **still-open block(s)**, verbatim. A fresh session's first read
therefore costs roughly what the open work costs, not what the project's
entire history costs; the full history stays one link away, on demand, never
silently lost.

**3. Two independent rotation triggers — not one.** This is the amendment
today's instruction adds to the 2026-08-12 plan:
   - **(a) Block/feature-boundary rotation** (the accepted candidate 2): when
     a block closes, through `close-block`/`close-feature`, its content is
     archived as part of that ritual, mirroring how ADR-0012 already gates
     `CLAUDE.md` length at a close boundary.
   - **(b) A hard size gate, independent of closure.** A PreToolUse guard on
     writes to the project's configured handover path refuses any edit that
     would leave the file's `utf8-byte-upper-bound` measurement AT OR ABOVE a
     hard cap, UNLESS the edit is itself a net size decrease (a rotation).
     This is the mechanism that actually bounds a single long-running block:
     trigger (a) only fires at a close event a "riesen Sprint" may not reach
     for a long time, exactly the situation this repository is in right now.
     Below the cap, both triggers are inert and every session behaves exactly
     as today.

**4. The hard cap.** `HANDOVER_MAX_BYTES = 12,000` (utf8-byte-upper-bound
units), a new, independently-justified constant — deliberately not a re-use
of `BOOTSTRAP_PAYLOAD_MAX_BYTES` (18,000), which budgets the entire bootstrap
payload, of which the handover is meant to be a fraction, not the whole.
12,000 leaves headroom for the rest of a bootstrap read under the existing
18,000 ceiling while still being generous enough that a single realistic
current block does not thrash against it constantly. This number is the
Elephant's reasoned default, not a PO-specified figure, and is expected to be
revisited once real rotation cadence is observed (see Follow-up).

**5. Generalized as a Pipeline mechanism, not a Nova-repo-specific one.** Per
the PO's explicit framing ("einen allgemeinen Mechanismus für alle
User-Repos"), both the rotation script and the size-gate hook live under
`plugins/pipeline-core/` (shipped to consumer projects via the plugin), not
under this repository's own `harness/` (Pipeline-repo-only tooling). Neither
hardcodes `docs/state.md`: the handover path and the byte cap are read from
project calibration (`pipeline.json`/`pipeline.yaml`, a `handover.path` /
`handover.maxBytes`-shaped key), defaulting to `docs/state.md` /
`12,000` when a project has not configured either — so an unconfigured
consumer project gets the same protection this repository is adopting for
itself, not a silent no-op.

**6. The rotation script never guesses at rule-extraction.** Per ADR-0060's
own warning (a rotation that only deletes destroys embedded rules), the
rotation script performs a purely mechanical operation — split at a named
block boundary, write the archive file, rewrite the live file's head and
index — and refuses to run against a file it has not been told extraction is
complete for (an explicit `--acknowledge-extraction-done` flag, checked once
per repository via a small marker file it writes, not re-asked every
invocation). It never inspects content for "does this look like a durable
rule" — that judgment stays human/Elephant work, done once, before rotation
is ever exercised for real on a given file's accumulated history.

## Addendum 2026-08-18 (Decision 6 amendment — schema v2, section-scoped marker)

Decision 6's marker, as originally shipped (`NVA-HANDOVER-ROT-1`), was a
repo-wide, one-time boolean: checked once per repository, never re-asked.
In use, this defeated the incremental-extraction posture Decision 7 assumes
— once ANY section's extraction pass set the marker, the script no longer
gated ANY future rotation on extraction being done for that specific
content. A rotation of sections added, or edited, long after the marker
was set — and never actually reviewed by anyone — went through with no
further check at all (discovered 2026-08-18 while planning an incremental,
oldest-sections-first extraction pass; PO reaction on reading the actual
behavior back: *"das macht auch keinen Sinn und sollte angepasst
werden"*). Tracked as
`backlog/items/2026-08-18-handover-rotation-extraction-acknowledgment-is-repo-wide-not-section-scoped.md`.

`handover-rotate.mjs`'s marker is amended to schema
`pipeline.handover-rotation-extraction-ack.v2` (`NVA-W3-R3`): it now
records, per acknowledged section, its title AND a content hash (sha256 of
that section's own lines) at the moment of acknowledgment, instead of one
repo-wide flag. A rotation naming a never-acknowledged section still
refuses exactly as an entirely un-acknowledged repository did before; a
section edited after acknowledgment but before rotation refuses again too,
since its current content hash no longer matches what was reviewed; a
multi-section rotation where only some sections are acknowledged fails
closed for the entire requested set, never a partial rotation of just the
acknowledged subset. An old-schema (v1) or missing marker file is treated
as fully unacknowledged, never grandfathered into the new semantics. The
CLI's `--acknowledge-extraction-done` now requires at least one
`--section-heading` — the whole-repository, no-argument form no longer
exists. This does not change Decision 6's underlying principle (the script
still never guesses at rule-extraction; that judgment stays human/Elephant
work); it only closes the gap between "acknowledged once" and "actually
covers the content being rotated."

**7. The one-time extraction pass over this repository's current 7,633-line
file is NOT done by this ADR.** It is real, judgment-heavy work — reading
dense narrative history to find every embedded standing rule and lift it
into an ADR, policy, or guardrail file — and is tracked as its own follow-up
(see Follow-up below), unblocked by but not required for the mechanism build
this ADR authorizes. Until that pass completes, the live `docs/state.md`
cannot be safely rotated for real; the mechanism can and should still be
built and tested against synthetic/small fixtures now.

## Decision 7 extraction audit — 2026-08-20 (`NVA-HANDOVER-EXTRACT-01`)

The current live handover was read in full (313 lines, 31,443 bytes). Every
normative statement in it was classified as an existing durable rule, current
candidate/open-work state, or historical provenance. The durable rules found
already had authoritative homes; no new policy or guardrail file was needed:

| Rule or standing instruction | Authoritative home |
|---|---|
| `docs/state.md` is the sole public current/open/next handover; durable decisions do not live there | [ADR-0012](0012-handover-canonicalization.md), [ADR-0015](0015-self-application.md) |
| Goldfish/Elephant/Critic separation, fixed dispatch briefing, and Verify-before-Critic sequencing | [Operating Model](../operating-model.md), [ADR-0026](0026-role-split-elephant-goldfish-critic.md), [ADR-0014](0014-critic-contract.md) |
| Repository directory, scratch, evidence, and archive placement | [ADR-0063](0063-repository-directory-contract.md) |
| Retention of normative PRD/Spec authority and the Sentinel recovery surface | `governance/spec-retention.json`, [Sentinel recovery package](../../specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md) |
| Verify, security, Critic, push, and approval gate behavior | [quality-gates](../../guardrails/quality-gates.md), [ADR-0017](0017-push-policy-standing-approval.md), [ADR-0027](0027-gate-philosophy.md), [ADR-0065](0065-a-voided-gate-is-re-earned-from-declared-inputs.md) |
| Honest runner/model/isolation claims and functional-equivalent disclosure | [ADR-0035](0035-codex-native-normal-critic.md), [ADR-0036](0036-runner-honest-profiles-v2.md), [ADR-0014](0014-critic-contract.md) |

Candidate OIDs, Verify and Critic outcomes, backlog counts, open items, PO
instructions, historical authorizations, and release facts are state/evidence
rather than reusable rules. They remain in the bounded current snapshot or
the existing archive links; none was silently converted into a standing
policy. The extraction is complete for the live handover's current sections.
This audit does not acknowledge any future edited section.

## Consequences

**Positive.** Bootstrap cost for a fresh session is bounded going forward,
not just in principle (ADR-0060 Decision 4) but by an enforced ceiling
(Decision 4 above). The "riesen Sprint" failure mode — a single block
growing unbounded because nothing closes it — is specifically closed by
trigger (b), which ADR-0060's own Decision 5 discussion did not anticipate.
The mechanism generalizes to every Pipeline-governed project by construction
(Decision 5), not as a later port. History is preserved, never deleted
(Decision 1/2) — the negative Decision-3-judgment risk ADR-0060 flagged
(sometimes wrongly leaving a rule in the handover) is bounded by Decision 6's
refusal to rotate before extraction is acknowledged done, not eliminated.

**Negative, and load-bearing.** The hard gate can refuse a legitimate,
urgent handover write mid-emergency once the file is already at cap — this
is deliberate (a growing file that can always grow more never gets rotated)
but is a real friction cost, mitigated only by the always-permitted
shrinking edit (a rotation is never itself blocked by the cap it exists to
enforce). The one-time extraction debt (Decision 7) is real, large, and not
discharged by this ADR — until it lands, this repository's own
`docs/state.md` sits at ~65× the new cap and the hard gate will refuse
essentially any further growing edit to it, which is the intended, if
uncomfortable, forcing function.

## Alternatives considered

**A pure length gate in the close ritual only (candidate 1 alone, no
independent hard gate).** This was the natural reading of the 2026-08-12
"empfehlung" before today's instruction. Rejected as insufficient by the PO
directly: it does nothing between close events, and this repository's own
current block is the live counterexample — a week-old, still-open block that
a close-only trigger would have left growing throughout.

**Bound by session count rather than size (candidate 4).** Closest to the
real cost driver in principle, but needs a session marker the file does not
currently carry, and does not address the "riesen Sprint" case either (one
session can itself run long enough to blow past any reasonable per-session
budget, as this repository's own current block demonstrates). Not pursued;
may be worth revisiting once the size-based mechanism has real operating
data.

**Reuse `BOOTSTRAP_PAYLOAD_MAX_BYTES` (18,000) as the handover's own cap.**
Rejected: that constant budgets the *entire* bootstrap payload, and the
handover is meant to be one part of it, not consume the whole ceiling by
itself — reusing it would leave zero headroom for everything else a
bootstrap read carries.

**Have the rotation script attempt automatic durable-rule detection.**
Rejected per ADR-0060's own stated risk: a false negative here silently
destroys a standing rule with no ADR/policy/guardrail home, which is strictly
worse than requiring an explicit, once-per-repository human/Elephant
acknowledgment that extraction is complete.

## Follow-up

- **Done (2026-08-17, `NVA-HANDOVER-ROT-1`):** the rotation script
  (`plugins/pipeline-core/scripts/handover-rotate.mjs`), the measurement/
  config library (`plugins/pipeline-core/lib/handover-rotation.mjs`), and
  the hard-cap guard hook (`plugins/pipeline-core/hooks/guard-handover-size.mjs`)
  are built and tested against synthetic fixtures — below-cap is inert,
  at/over-cap refuses a growing edit, a shrinking edit is always admitted,
  the `--acknowledge-extraction-done` refusal fires for an un-acknowledged
  repository. `close-block/SKILL.md` gained step 6d pointing at the new
  script. **Not done:** the guard hook is NOT wired into `hooks.json` (TP-4
  protected, no in-session override) — the exact wiring snippet was recorded
  in `evidence/dispatch-record-NVA-HANDOVER-ROT-1.json`'s `report` field,
  awaiting an authorized session. **Owner:** pipeline. **Due:** 2026-09-08
  (three weeks out; a TP-4 wiring ceremony, not tied to any other sprint
  milestone).
- **Correction, 2026-08-18 (`NVA-W2-7`):** the pointer above is now stale —
  `evidence/` is gitignored (ADR-0063, machine-regenerated evidence), so
  that dispatch record does not survive into a fresh checkout of this
  repository and no longer exists. `NVA-W2-7` re-attempted the identical
  wiring edit, confirmed the same live TP-4 refusal, and the current exact
  edit is recorded in that dispatch's own report (`pendingProtectedEdit`)
  and in the backlog item's `2026-08-18 (wave 2, dispatch NVA-W2-7)`
  section — read those for the exact snippet, not the now-missing evidence
  file. Still not wired; still awaiting an authorized/signed ceremony.
- **New, discovered during the above (see Correction section):** reconcile
  `rotate-handover-sections.mjs` (candidate 2, heuristic/close-time,
  monthly archive buckets) and `handover-rotate.mjs` (this ADR's own
  explicit/forced mechanism, per-event archive files) — either converge on
  one archive-naming convention, or explicitly document the two-mechanism
  shape (one per trigger type) as the permanent design. Not urgent
  (no correctness bug, just an inconsistency a browsing human/agent would
  notice), but should not be silently forgotten either.
- The one-time extraction pass over this repository's own current
  `docs/state.md` (Decision 7) — a large, separate, judgment-heavy dispatch;
  the live file cannot be rotated for real until it completes.
- Revisit `HANDOVER_MAX_BYTES` (12,000) once real rotation cadence across at
  least one full block/feature cycle is observed — it is a reasoned default,
  not a measured one.
