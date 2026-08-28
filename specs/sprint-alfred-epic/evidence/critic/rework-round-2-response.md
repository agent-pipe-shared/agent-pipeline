# Elephant response — rework cycle, round 2 delta (2026-08-28)

Round 2 (`rework-round-2-2026-08-28.md`) returned **PASS**, scoped to the
delta `2c867ea9 → e3613ffe` against registry F1/F2/F3/F5, with two minor
accuracy findings on the fixed lines and one deliberately-not-flagged
legibility note. This closes the rework cycle.

## Rework-cycle table

| Round | Kind | Candidate | Verdict | Follow-up |
|---|---|---|---|---|
| 1 | full first-pass (3 new documents) | `2c867ea9` | FAIL — F1/F2 major, F3–F5 minor | fixes `e3613ffe`; F4 dispositioned |
| 2 | bounded delta (registry as neutral input) | `e3613ffe` | **PASS** (scoped); 2 minor residue findings | residue fixed post-PASS in `361d6dc6` |

## Post-PASS residue dispositions (commit `361d6dc6`)

| Item | Disposition |
|---|---|
| Round-2 Finding 1 (signal list framed as a closed set vs. #104's "for at least" floor) | **Fixed** — §2.2 now reads "#104 derives them 'for at least' the following eleven, a floor rather than a closed set (items verbatim)". |
| Round-2 Finding 2 (frontmatter row's "#104 §2 … verbatim" self-description vs. its ten-item merged superset) | **Fixed** — the cell now describes itself honestly: "All six #104 §2 contract-sufficiency fields, plus the module-identity fields of #104's governed-module-inventory list — merged here because the concept file is where both physically live". The false "verbatim" self-description is gone. |
| Deliberately-not-flagged legend regression (coverage-class legend swallowed by the inserted currency paragraph) | **Fixed** — the legend is its own paragraph again. |
| "Currency check is self-reported transcription" note | **Accepted as-is** — the transcription in the gap analysis names command, date, and per-issue values; upgrading to stored raw tool output would require an evidence-directory artifact for a one-line check. Recorded here as the deliberate evidence-class decision. |
| Unverified cross-reference (fitness-model block sits in doctrine §4(1)) | **Confirmed by the Elephant** — the block sits directly under "§4 … (1) The enforcement invariant", before "(2)"; the `gap-analysis` §D reference "doctrine §4(1)" is accurate. |

## Reviewed-surface statement (honest coverage)

- `design/po-input-2026-08-28.md`: reviewed in full at `2c867ea9` (round 1);
  unchanged since.
- `design/agent-first-architecture.md` and
  `design/gap-analysis-2026-08-28.md`: reviewed in full at `2c867ea9`
  (round 1); the `e3613ffe` delta reviewed line-level in round 2 (PASS).
  The final tip `361d6dc6` contains exactly three line-level edits beyond
  the PASS-reviewed bytes — each a direct execution of a round-2 finding or
  note (the table above), none introducing new content. Per the cycle-1
  precedent (round-4 reviewed-surface statement), these response-to-review
  edits are documented rather than re-reviewed; the four-round budget is
  reserved for substantive review, not for notarizing one-line responses to
  the reviewer's own residue notes. The PO sees this statement at the gate.

## Elephant-side dispatch defect, owned

Round 2's briefing violation is mine and is the same class as cycle-1
R4-F1: the dispatch named bound base `2c867ea9` while enumerating only
`e3613ffe`, leaving `6313d653` (a `docs(state)` commit — inadmissible
Critic input by content anyway) inside the range but outside the
enumeration. The Critic resolved it per the dispatch's own precedence rule.
Correction adopted for future delta dispatches: the bound base is always
the enumerated head's own parent.

## Fresh live evidence for filed defects (recorded, not re-filed)

- **Critic scratch persistence** (
  `backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`):
  round 2 adds the sharpest measurement yet — no Write tool in the lane,
  `>` refused by the closed grammar, and `node -e` refused by
  `guard-devplan` as `opaque-interpreter-code` **even when the target is
  the exempt `scratch/` prefix**. CR-06-D's duty is structurally
  unsatisfiable in this lane; both rounds disclosed it honestly.
- **Guard-refusal budget tax** (
  `backlog/items/2026-08-27-a-read-only-command-is-refused-for-naming-a-protected-path.md`
  class): 4 of 16 round-2 tool uses were consumed by guard refusals
  (chained `mkdir`, host-scratchpad `mkdir` → `GUARD-CROSS-REPO-MUTATION`,
  an `rg --glob` pipeline outside the admitted lane, the notes write) —
  a 25% dispatch-budget tax, exactly the C1 receipt class the design
  measures.

## Cycle status

The design-phase review duty (spec §12; PO constraint item 3) is satisfied
for the rework package: every document ≥1 independent round, fail-then-fix
documented, final residue dispositions recorded. Next step per
`docs/state.md`: PO re-review of the reworked package (EL-19), then the
verified acknowledge → submit → reopen → edit → resubmit → approve route.
