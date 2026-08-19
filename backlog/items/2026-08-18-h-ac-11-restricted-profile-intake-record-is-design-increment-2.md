---
schema: pipeline.backlog-item.v1
id: pipeline.h-ac-11-restricted-profile-intake-record-is-design-increment-2
type: requirement
owner: pipeline
status: closed
created: 2026-08-18
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "a910ed069f0df9d4d49bd4dfdd8d1be17b7f4366"
closure_evidence: "backlog/items/2026-08-18-h-ac-11-restricted-profile-intake-record-is-design-increment-2.md"
source: "Formalizing EPIC-AC-05's disposed bar for H-AC-11's O-4 scoping decision (PO, 2026-08-17, specs/sprint-phoenix-epic/acceptance.md), which named the fix but was never filed as a backlog item with an owner and trigger. See acceptance.md H-AC-11's 2026-08-18 disposition note."
---

# Build the restricted machine-local attribution record (GMW/HGO design D-1)

## Description

H-AC-11's no-join-handle clause was proved unsatisfiable for the GMW half
(`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`
§5.2, O-4). The PO's 2026-08-17 amendment scoped the clause correctly (it
binds only the restricted machine-local decision record of that design's
§3.4, not a producer's own enforcement material) — but no intake path yet
produces that restricted record at all. The design itself
(§93 "D-1 — the restricted machine-local attribution record (increment 2)")
already places this build outside Phoenix's own increment 1 scope.

This item exists only to give that already-decided disposition the backlog
entry EPIC-AC-05 requires (an owner and a named trigger) — it does not
change or add scope beyond what the design document already specifies.

## Triggering situation

`specs/sprint-phoenix-epic/acceptance.md` H-AC-11's 2026-08-18 disposition
note, filed during the Sprint Phoenix closure sweep after finding the O-4
scoping decision had no corresponding backlog item.

## Affected artifact

`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`
(D-1, increment 2); the restricted machine-local decision record it
specifies has no producer anywhere in this codebase yet.

## Proposal

Build D-1 as scoped in the design document's own increment 2, once that
increment is undertaken. No target sprint named yet by the PO — the next
Pipeline session's Elephant should propose one at triage, or ask the PO to
name one, before this item is assigned.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### PO Decision — 2026-08-18

- **Decision:** Option C — since D-1's design is already complete and narrow, check whether it fits as a small, bounded dispatch at the tail end of the CURRENT sprint rather than waiting for or naming a whole new future sprint.
- **Rationale:** PO's direct choice.
- **Assignment:** Candidate for a bounded dispatch before this sprint closes — not deferred to a named future sprint.
- **Date:** 2026-08-18

### Progress note — 2026-08-19 (design completed, mostly implemented)

A first attempt (`PHX-WP-HAC11-D1-ATTRIBUTION-RECORD`) correctly stopped:
the design document's §5.4 was only a two-sentence sketch, not an
implementation spec. A follow-up dispatch (`PHX-WP-HAC11-D1-DESIGN-SPEC`,
commit `22d8ef09`) wrote the missing design specification directly into
§5.4 (the closed 9-key `pipeline.human-decision-attribution.v1` payload
shape, the validator module's exact contract, the producer/consumer wiring
points) and implemented it: `lib/human-decision-attribution.mjs` (validator),
`governance/schemas/human-decision-attribution.schema.json`, the
`governance-event.mjs` wiring, and a new `buildWindowAttributionEvent`
builder — 11 files, all new/existing tests pass (108 cases across 5 suites,
zero regressions). **Not implemented:** the final CLI call site in
`scripts/guard-maintenance-window.mjs` (reading `subject.reason`/
`proof.keyReference` at `install`) — correctly deferred, since it depends
on increment 1's own portable-side CLI wiring for that script, which does
not exist in this checkout yet. Item stays open for that one remaining,
genuinely-blocked-on-a-prerequisite piece; the design and core producer are
done.

### Investigation — 2026-08-19, checked against the sibling Nova checkout

PO asked whether Nova has already built increment 1's portable-side CLI
wiring and could be ported. Checked directly:
`rg -n "human-decision-attribution|subject.reason|proof.keyReference|attribution"
/home/skar667/src/agent-pipeline-share_nova/plugins/pipeline-core/lib/guard-maintenance-window.mjs`
— zero hits. Nova's `guard-maintenance-window.mjs prepare|install|status|close`
CLI surface is the same shape as Phoenix's own (confirmed via `--help`
usage string comparison); neither carries the increment-1 attribution
wiring this item's remaining piece depends on. There is nothing to port —
this is a genuine gap in both checkouts, not a Phoenix-specific one Nova
already solved. Stays open, blocked exactly as before; no action taken.

### Triage — closed 2026-08-19

- **Decision:** Closed. Increment 1's own prerequisite (portable-side CLI
  wiring) landed this session (`PHX-WP-GMW-LEDGER-EMISSION`, commit
  `3504b707`), unblocking the one remaining piece this item was tracking.
  `PHX-WP-HAC11-D1-GMW-WIRING` (commit `a910ed06`) then built it: `install`
  accepts an optional `--attribution-key-file`; when supplied, after the
  portable append-and-arm sequence succeeds, it appends one restricted
  `pipeline.human-decision-attribution.v1` event carrying `subject.reason`
  and the verified signer's `{keyReference, publicKeySha256}` — fail-open,
  additive, never blocking `install` or the window's arming. Independently
  re-verified by the Elephant directly (not just trusted from the dispatch
  report): `node --test scripts/guard-maintenance-window.test.mjs` → 9/9
  pass, including a structural no-correlator assertion on the stored record.
- **HGO needs no corresponding wiring** — design §5.4 already establishes
  HGO exposes no attribution/rationale to move in the first place (digest-only
  `reasonSha256`); this item's own scope names only GMW's D-1 piece.
- **Open, disclosed, not blocking closure:** `harness/scripts/verify.mjs`
  registration for the extended suite remains TP-3 protected, no in-session
  edit path — the suite passes standalone. `--attribution-store-root` was not
  a named CLI flag; the store root is derived deterministically
  (`~/.pipeline/governance-restricted/guard-maintenance-window/<fingerprint>`),
  documented in the design doc's own 2026-08-19 addendum (§5.4) as a disclosed
  implementation choice.
- **Date:** 2026-08-19
