# w311 — the close derives the ADR state and names the create-adr command (candidate 31, lane L4 stage 1)

Applies after the base clone of candidate 31 (it edits the same four files as the earlier delivered patches of the chain); `apply --check` against the real checkout alone is expected to exit 1 until that base is applied.
PO decision 2026-11-18: the pipeline produces an ADR draft per decision the design marks as expensive, shown at close, no new signature. Defaults D1 to D6 of the recon note
(`plans/recon-l4-adr-draft-2026-11-18.md`, delivered as `w311-recon-adr-draft-at-design-close.patch`) apply; this patch is stage 1 of that note's section 4 and nothing else.

## What it adds

- `lib/close-quality-readback.mjs`, row `adr-decision` (report-only, row shape unchanged, evidence and remedy stay free text):
  - A promised path `docs/adr/<NNNN>-<slug>.md` that does not exist by its exact path now also counts present when an accepted record with the same slug and ANOTHER number exists
    (a `<NNNN>-<slug>.md` file in `docs/adr`; a `draft-<slug>` file is not one). The design names the number before `bind-adr-proposals` assigns it, so a different final number used to read "missing".
    The evidence says which record matched (`docs/adr/0003-storage.md: exists as docs/adr/0001-storage.md`).
  - Per absent slug the remedy names the runnable command `node <plugin-root>/scripts/create-adr.mjs --root <root> --slug <slug> --title "<title>"`, the title derived from the slug (D3: `event-bus-choice` gives `Event bus choice`).
    The old remedy sentence (the architecture-decision skill) stays. A promised path without the `<NNNN>-<slug>.md` shape is read by exact path as before and gets no command.
  - An optionally injected reader `adrDraftStates()` (the entries of `inspectAdrDraftBindings`: slug, path, state, acceptedId) appends `; drafts: <path>: <state>; ...` to the evidence of the promised-path rows and of the impact-derived decision rows.
    A slug whose draft exists (unbound, bound or discarded) gets no second `create-adr` command (create-adr refuses an existing draft); its remedy names the draft and its state with the next human or agent step instead
    (finish and bind it with `bind-adr-proposals.mjs`, or discard it with `create-adr.mjs --discard --reason`; a bound draft becomes accepted through the design approval). A `materialized` draft of the promised slug counts present.
    An absent, throwing or malformed reader leaves exactly the reader-less row. A not-applicable row stays bare.
- `scripts/close-coordinator.mjs`: `readQualityRows` injects the reader, `inspectAdrDraftBindings` over the repository root with the feature folders of the plan and spec paths bound in the Pipeline State (the same `featureDirs` `submit-plan` uses).
- Tests: three new unit cases in `close-quality-readback.test.mjs`; one new process case in `close-coordinator.test.mjs` (real `drive --dry-run`, a real draft made by `create-adr.mjs`, a map module that promises `docs/adr/0003-storage.md`, then an accepted `0001-storage`; the tree is unchanged by the readback).

## QG-04 restatement

The two AC-239 cases that pin the exact-path rule and the old remedy text are NOT dropped and NOT weakened: both stay green as written (a path that exists is present, the remedy still names the architecture-decision skill).
The exact-path rule is extended by the slug match, and the "names no command" remedy gains the command; the new cases carry that statement in a comment.

## Criterion binding

AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text). The PRD and the Spec are unchanged.

## Not changed / not proven

- Stages 2 (a hint at `submit-plan`), 3 (a generated draft, `create-adr.mjs --from-design`) and 4 (README seed text) of the note are NOT built and not released. No draft is written by the close; nothing is stored, no record shape, digest or key byte changes, no gate, signature or approval changes, nothing is refused.
- Stage 1 alone would not have produced an ADR in the greenfield run whose `adrReferences` was empty (the recon note says so): it only closes the "no runnable command" and the number-mismatch gaps for a design that does declare its decisions.
- The reader is only supplied by the close coordinator; the other callers of `closeQualityReadback` (if any) see the reader-less row.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only (suites named in the hand-back).
