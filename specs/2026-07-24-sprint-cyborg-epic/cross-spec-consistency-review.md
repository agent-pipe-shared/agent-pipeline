# Cross-spec consistency review (AFK continuation, design-phase)

> **Status: DRAFT, design-phase, informational.** Elephant self-review of the
> ten package specs (CYB-1 … CYB-9, CYB-A0) plus CYB-1F against `spec.md`,
> `prd_cyborg-epic.md` and `backlog-acceptance-matrix.md`. Not a Critic
> review, not a substitute for one; no runtime artifact changes, no dispatch.
> Explicitly flagged as a gap in the prior AFK block's close-out note
> (`docs/state.md`, "AFK continuation — all nine CYB-N feature specs
> drafted, block complete") — this document closes that gap.

## 1. What was checked

Each of the eleven design documents (`cyb-1f-schema-boundary-draft.md`,
`cyb-1`…`cyb-9-feature-spec.md`, `cyb-a0-feature-spec.md`) was compared
against three anchors: `spec.md` §4 (work packages, ordering, dependency
spine) and §3 (deviations D1–D10), `prd_cyborg-epic.md` ("Order of work",
open decisions A–E), and `backlog-acceptance-matrix.md` (AC cluster counts,
absorbed-item mapping).

## 2. Findings — consistent (no action needed)

- **Dependency spine.** Every package spec's own "Dependencies"/"Gate"
  section matches `spec.md`'s stated spine exactly: CYB-1F → all; CYB-2 →
  {CYB-6, CYB-8}; CYB-3 → {CYB-7, CYB-8}; CYB-4 → CYB-6; CYB-8 → CYB-9. No
  spec claims a dependency the spine doesn't have, and none omits one the
  spine does have.
- **AC coverage counts.** Every spec's "Coverage note" (e.g. CYB-9: 12,
  CYB-8: 12, CYB-7: 13, CYB-6: 13, CYB-3: 17) matches
  `backlog-acceptance-matrix.md`'s per-issue AC cluster count exactly. No
  silent drop or double-count found.
- **Phase/parallelism claims.** Each spec's own gate text ("can proceed once
  X lands", "hard blocker is Y") matches both `spec.md` §4's Phase I–IV
  table and the PRD's "Order of work" section, including the two named
  Phase-II exceptions (CYB-A0 first-in-Phase-I, CYB-5c's override-ledger fix
  startable early).
- **Deviation ↔ package binding.** D1–D10 in `spec.md` §3 each name the
  package spec that must carry them; every named spec's scope section does
  carry the corresponding deviation content (checked D2/D4/D5 most closely
  since they narrow delivery — CYB-3, CYB-6, CYB-7 all state the narrowed
  scope explicitly, not implicitly).
- **Absorbed backlog items.** All six items in
  `backlog-acceptance-matrix.md`'s "Absorbed backlog items" table appear in
  exactly the package spec their PRD disposition names (CYB-A0, CYB-5b ×2,
  CYB-5c, CYB-1's waiver class, CYB-2), each with the item's own acceptance
  language carried into that spec's ACs, not paraphrased away.

## 3. Findings — worth the PO's attention (non-blocking)

1. **CYB-1F binding map omits CYB-5.** CYB-1F §9 ("Downstream binding map")
   lists CYB-2, CYB-6, CYB-4, CYB-8, CYB-3/CYB-7, CYB-9 as consumers of the
   frozen identifiers, but not CYB-5 — even though `spec.md` §4 states CYB-5
   "Depends: CYB-1 (module/control IDs)". This is a real completeness gap in
   the draft (not a design defect): CYB-1F should add a row naming which
   frozen identifiers CYB-5's catalog-waiver-class and control entries bind
   to (likely the control-ID grammar §4 and the module registry §6, for the
   "PO-waived direct implementation" waiver type and any `ctl.risk.ai-agent.*`
   controls). Low cost to fix at the next CYB-1F edit; does not block
   anything since CYB-1F is pre-freeze.
2. **"Frozen" language used before the freeze checkpoint.** Several package
   specs (CYB-6 most explicitly: "the 13 capability families are verbatim
   identical to CYB-1F §3's frozen `cap.*` roots") describe CYB-1F content
   as already frozen. CYB-1F's own header is explicit that nothing in it is
   ratified until the mid-CYB-1 PO checkpoint resolves F-1…F-5. The
   downstream specs are not wrong to build on the draft (CYB-1F's own
   rationale: these identifiers are stable "under every scope/slicing
   variant the PO may choose"), but the word "frozen" in a downstream spec
   should read "CYB-1F-drafted, pending freeze" until the PO checkpoint
   actually happens — otherwise a reader skimming CYB-6/CYB-7/CYB-8 in
   isolation could mistake draft content for ratified content. Editorial
   fix, not a scope fix.
3. **F-4's outcome is silently assumed.** CYB-1F open decision F-4 asks
   whether license-check is a catalog control or a fourteenth capability
   family; every downstream spec's capability-family lists (CYB-6 in
   particular) already assume "control, not family" (13 families, no
   license). This matches CYB-1F's own draft recommendation, so it is
   probably the right assumption — but it means F-4's ratification at the
   freeze checkpoint is not actually a free choice anymore without touching
   multiple already-drafted specs. Worth naming to the PO explicitly at the
   freeze checkpoint rather than let it pass as a formality.
4. **No independent cross-check of the eleven advisor findings.** The PRD's
   "Advisory record" section states two advisor consults' findings were
   "incorporated"/"applied at this gate revision", but nothing in the spec
   tree traces each of the eleven second-consult findings to the exact
   spec-text change that resolved it. This review did not attempt that
   trace (it would need the original advisor transcripts, not available in
   this context) — flagged as a residual gap for whoever runs the next
   formal readiness pass, not something this review can close.

## 4. What this review does not cover

No Critic review ran over any spec. No fixture content, schema field types,
or the CYB-1F grammar regexes were validated against the issue text
character-by-character (the per-spec AC tables were already cross-checked
against `backlog-acceptance-matrix.md` counts, which is a weaker check than
re-reading all nine GitHub issues verbatim again). No attempt was made to
verify the two named Windows-verify-brittleness backlog items or the two
PO-gate-authority bugs — those remain tracked separately in
`backlog/items/2026-07-25-*.md` and are explicitly out of scope for this
document.

## 5. Net assessment

No blocking inconsistency found across the ten package specs, `spec.md`, the
PRD, or the acceptance matrix. The one real gap (finding 1) is a one-line
addition to CYB-1F, not a redesign. Findings 2–3 are precision/communication
items best raised explicitly at the mid-CYB-1 PO freeze checkpoint rather
than fixed unilaterally by the Elephant, since they touch open decisions
(F-4) and PO-facing wording that the checkpoint itself is supposed to
ratify.
