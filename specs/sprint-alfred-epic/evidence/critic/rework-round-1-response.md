# Elephant response — rework cycle, round 1 (2026-08-28)

Cycle framing: the PO's gate-1 rejection (2026-08-28,
`design/po-input-2026-08-28.md`) directed a material rework of the design
package; the four-round cycle that closed at `3f2fcb31` reviewed the
*previous* package revision. The rework documents are a new review cycle
("rework cycle"); this file responds to its round 1
(`rework-round-1-2026-08-28.md`, candidate `2c867ea9`, verdict FAIL).

**Fix commit: `e3613ffe`** (design documents only). Per-finding:

| ID | Disposition | What changed |
|---|---|---|
| F1 | **Fixed** | The §3.1 concept-file frontmatter row now carries all six #104 §2 fields — "compatibility and lifecycle expectations" inserted between authority/effect ownership and verification entry points. The row's "verbatim" claim is now true against `issues-snapshot-2026-08-27.md` (#104 §2). |
| F2 | **Fixed** | Doctrine §2.2 now enumerates all eleven contract-sufficiency signals verbatim (with the issue's own uncertainty rule and their consumers: receipts, optimization loop, rigor floor). Doctrine §4(1) gains the eleven-item #106 fitness-model representation block (with the no-inference-from-directory-tree rule). The §D integration map routes both into spec §7.2/§7.3 explicitly **as absorbed text, not issue pointers**. |
| F3 | **Fixed** | The currency claim in the gap analysis now carries its artifact: the exact `gh issue list … --json number,updatedAt` command, run 2026-08-28, and the returned per-issue table (#99…#109; every value ≤ 2026-08-11T16:21:36Z, all predating the 2026-08-27 capture), plus the note that label-only edits also refresh `updatedAt`, making the check conservative. |
| F4 | **Dispositioned (no change)** — standing decision, unchanged from cycle-1 round 1 (`round-1-response.md`) | `agent-obligations.md` §6 defines exactly two trailer forms. `Dispatch: <TASK_ID> (goldfish)` requires a dispatch record that does not exist for Elephant design authoring. `Dispatch: stage-0 (elephant)` is bound by the same §6 text to "the stage-0 fast path (operating-model §3.3): small, disclosed, judgment-light work" — a multi-hundred-line design package definitionally is not stage-0, so stamping it would assert a false classification to the very tool (`dispatch-authorship-verify`) the trailer exists to satisfy. The honest state is `UNVERIFIABLE`-by-tool with authorship declared in `design-authoring-record.json`, until the canon gap is closed by `backlog/items/2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits.md` (open, `sprint: alfred`). The Critic's own severity reasoning concurs: attribution defect, not lifecycle violation. |
| F5 | **Fixed** | §3.3 now reads "the mechanical answer to finding-things-again (the PO's \"wiederfinden\")" — English-first gloss, matching the pattern the report cites as correct. |

Notes:

- The report's trajectory exception (F3) is resolved by the F3 fix; the
  one deliberately-unverifiable claim (the `docs/state.md` route citation)
  is outside the Critic input boundary by design and stands as written.
- The Critic's disclosed persistence failure (`critic-notes.md` refused by
  the guard union inside the dispatch) is a fresh live measurement of the
  already-filed defect
  `backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`;
  recorded here as additional evidence rather than a new item, matching how
  the second observation of the discard-feature defect was handled.
- The report is persisted verbatim in `rework-round-1-2026-08-28.md` with
  exactly two mechanical sanitizations (host-absolute path → repo-relative;
  transport HTML entities decoded), declared in that file's header.

Round 2 (delta re-review per template item 4) dispatches against the fix
commit with this round's registry as neutral input.
