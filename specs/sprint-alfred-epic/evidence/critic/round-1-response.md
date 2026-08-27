# Round-1 response — finding-by-finding disposition (fix commit `ea392b28`)

Documented fail-then-fix cycle for the sprint-alfred-epic design package.
Round 1A (base `74e5a4d4`, intakes, route claude-sonnet-5 at max): **PASS**
with 2 minor findings. Round 1B (base `584acbda`, PRD/spec/acceptance, route
claude-opus-5 at max, ARCHITECTURE class): **FAIL** with 3 major + 7 minor
findings. Full verbatim reports: `round-1-A-2026-08-27.md`,
`round-1-B-2026-08-27.md`. Neutral registry (round-2 input):
`round-1-findings-registry.md`. All fixes land in commit `ea392b28`
(2026-08-27); the PRD's `technical-spec-sha256` marker was recomputed there
for the edited spec
(`e57a2d1ffa9bae538078303f6f999a166ffe0bc16cbc66ab2abd77c8823e3223`).

| Finding | Severity | Disposition |
|---|---|---|
| B-F1 | major | **Fixed in `ea392b28`.** The duty is homed as spec §12 "Design-phase review duty" (source: `design/po-input-2026-08-27.md` item 3); PRD §10's traceability row now points there; acceptance AC-14 extends its criterion to design documents. |
| B-F2 | major | **Fixed in `ea392b28`.** PRD §5 carries #108's fifth entry condition verbatim in bold, with an explicit reconciliation (PO switch decision of 2026-08-27; own branch/push target; implementation gated on the post-Nova rebase); §8 A-1 cross-references it. |
| B-F3 | major | **Fixed in `ea392b28`.** Spec §4.1 now routes the `hooks.json` `$comment` replacement through the existing TP-4 human-guard-override signature ceremony inside A1's Wave-0 slot and states explicitly that B2-ii's TP-3 registration route does not cover it; the `batbatchable` corruption is gone. |
| B-F4 | minor | **Fixed in `ea392b28`.** Acceptance criteria renamed `AC-1`…`AC-15` and `IR-1`…`IR-4`; header states the id-namespace rule; WP references in Evidence columns are now collision-free. |
| B-F5 | minor | **Fixed in `ea392b28`.** `acceptance.md`'s closure bar restated to match PRD §7 criterion 2 exactly (satisfied, or deviations explicitly PO-accepted at closure). |
| B-F6 | minor | **Fixed in `ea392b28`.** "`spec.md` §V" → "`spec.md` §12". |
| B-F7 | minor | **Fixed in `ea392b28`.** The D1-to-Wave-2 reordering vs. #108 stage 1 is declared in PRD §5 as a sequencing deviation with its argument, and mirrored as a third `**Deviate (argued):**` entry in `design/issue-intake.md` (#108). |
| B-F8 | minor | **Fixed in `ea392b28`.** `pipeline.verify-suite-registration.v1` added to the E1 freeze table; C2's `{invariantPinned, nonOverlapNote}` fields are declared there as a pre-announced `revisions[]` bump. |
| B-F9 | minor | **Fixed in `ea392b28`.** Path fully qualified: `plugins/pipeline-core/skills/architecture-decision/`. |
| A-F2 | minor | **Fixed in `ea392b28`.** The four C1 seed codes now carry accurate per-class dates and named provenance in `design/issue-intake.md` #103 (read-only refusal and readiness-`partial` deadlock: 2026-08-27 backlog items; TP-ceremony cost: 2026-08-18, `CLAUDE.md` guard-testpath rule + `docs/state.md` prior handovers, no standalone item; dispatch truncation: 2026-08-08 item). PRD §7.3 and spec §6.1 restated to match. Note: the round-1A search missed that the readiness-`partial` deadlock *is* the 2026-08-27 `discard-feature` item (phrase split across sentences defeated the regex); the finding's core — the blanket "on 2026-08-27" dating — was nevertheless real and is fixed. |
| A-F1 / B-F10 | minor | **Dispositioned without a document change; canon gap filed as a backlog item.** `agent-obligations.md` §6 defines exactly two trailer forms. `Dispatch: <TASK_ID> (goldfish)` requires a dispatch record — none exists, this is direct Elephant work. `Dispatch: stage-0 (elephant)` binds to `docs/operating-model.md` §3.3, whose five criteria (≤2 files, ≤~25 diff lines, trivially revertable, EL-01 implementation exception) a multi-hundred-line design package flagrantly fails — stamping it on these commits would be an inaccurate attribution, worse than an `UNVERIFIABLE` one. Design-phase document authoring is ordinary Elephant duty (EL-01 concerns production code only), so the true defect is that §6 offers no sanctioned form for it. Filed as `backlog/items/2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits.md` (proposal: a third generated form, e.g. `Dispatch: design-phase (elephant)`, plus verifier support — a B3 rules-as-code candidate). Until the canon decides, the recorded practice stays `AI-Assisted: true` only, with `design-authoring-record.json` as the explicit authorship binding; that record is extended to cover `ea392b28`. |

## Shared disclosure from both rounds, converted to a durable defect

Both round-1 Critics independently reported that `critic-notes.md`
persistence was **unavailable** (no `Write` tool in the critic toolset;
shell redirection and `node -e` writes guard-refused even into their own
`scratch/dispatch/` subdirectories — round 1A named the
`GUARD-DEVPLAN-SHELL` `opaque-interpreter-code` lane). This structurally
defeats the truncation-recovery mechanism the review protocol itself
mandates (CR-06-D report durability; template recovery item 6). Filed as
`backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`.

## Round 2

A delta re-review (template item 4; round 2 of at most 4 per package) is
dispatched on the correction commit `ea392b28` with this directory's
registry as the neutral findings input. Its report will be persisted beside
this file on arrival.
