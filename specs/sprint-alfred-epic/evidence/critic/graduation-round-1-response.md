# Elephant response — doctrine graduation, round 1 (2026-08-28)

Round 1 (`graduation-round-1-2026-08-28.md`) returned **FAIL (scoped)** on the
enumerated SHAs `2b0ee8c7`, `9c9d9819`, `eba804e6`, with F1/F2 major and
F3–F5 minor. The verdict is accepted; F1 in particular is a defect I would
not have found by re-reading my own work, because it is an *omission* against
a promise made in a document I wrote myself.

## Dispositions

| Finding | Severity | Disposition |
|---|---|---|
| **F1** — the PO decision surface promised in gap-analysis §E is absent from the reworked PRD §9, which then declares "Open at this gate: none" | major | **Fixed, and re-opened rather than defaulted.** PRD §9 gains decision 6 ("Should D-track work be pulled earlier than Wave 2?") with the recommendation, its reason (§1.2: D3's conformance claims are only honest on measured enforcement), and the honest cost (the headline capability starts in Wave 2, so the first visible architecture artifact arrives later). The closing line now reads "Open at this gate: decision 6". The finding's own framing — either unexecuted or unpersisted, both defects — is correct: it was unexecuted. |
| **F2** — no `Dispatch:` trailer of either sanctioned form on any of the three commits | major | **Acknowledged as a real mechanical gap; not fixed here, and deliberately not papered over.** The Critic's caveat names the adjudication exactly right: a register-recorded position would be invisible to it. That position exists — `backlog/items/2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits.md`, carried as a standing gate-visible item in `docs/state.md`. Its substance: `Dispatch: stage-0 (elephant)` is bound by `docs/operating-model.md` §3.3 to the fast path — small, disclosed, judgment-light work. A 474-line rework of the epic's authority documents is none of those things, so stamping that trailer on it would make the record *wrong* rather than complete, and `dispatch-authorship-verify` would then report a pass over a false classification — strictly worse than the honest `UNVERIFIABLE` it reports today. The finding is not dissolved by that position, only correctly located: the gap is in the canon's trailer vocabulary, not in these commits' compliance with it, and it stays open until the canon offers a third form. |
| **F3a** — duplicate `5.` in spec §15 | minor | **Fixed.** The inserted alternative moved to the end of the list as `8.`; the pre-existing 5/6/7 sequence is restored untouched. |
| **F3b** — dangling `(§2.9)` in spec §7.2 | minor | **Fixed.** Now reads "(doctrine §2.9, refactorability without structural churn)" — the same citation convention every other doctrine reference in the section uses. |
| **F4** — two divergent re-entry reading orders | minor | **Fixed at the governed end.** Spec §1's own conflict rule says the doctrine governs and the spec is corrected, so the spec's six-step order is replaced with doctrine §3.2's verbatim sequence (AGENTS.md → map index → in-scope concept files → compiled decision summary → lifecycle state/sanctioned next actions → owned implementation surface), plus its defining rule about foreign implementation reads. My original list had silently substituted "module inventory rows" and "the fitness model" for the last two steps. |
| **F5a** — map says three rework documents were added to design-inputs; two were, the third was elevated | minor | **Fixed in the map, not the execution.** The gap-analysis §D preamble bullet now describes the two-plus-elevation shape and records the deviation explicitly. The elevation is the better placement; what was missing was the record, which is the finding's actual point. |
| **F5b** — "A/B/C as what makes D true" landed in §1.2/§2, not §4 | minor | **Recorded as an executed deviation.** The map bullet now says so and gives the reason (the substructure argument belongs with the problem and the outcomes; §4 keeps its per-track structure). No document moved. |
| **F5c** — `eba804e6`'s message omits several substantive edits it made | minor | **Owned, not rewritten.** History is not rewritten for a message defect. The omitted edits are: PRD §5 entry-condition rewrite (#100 substance-on-`main` claim), PRD §6 non-goals rewrite (Batman/Nightwing moves), PRD §7 criterion 4 count, spec §1 (basis anchor + count), §13 (S1–S10), §14 (doctrine mapping paragraph). They are the queued §9-decision edits travelling in the graduation commit, which is also the one-concern-per-commit half of the finding. Both are correct: the two concerns should have been two commits, and the message should have enumerated what it did. The complete list is recorded here so the record is whole even though the message is not. |

## Elephant-side dispatch defect, owned

The dispatch stated that two commits sit between `9c9d9819` and `eba804e6`;
there are three (`c2db10cc`, `010c21f4`, `f8998d9a`). Immaterial to the
enumerated-SHA construction the Critic actually used, but it is a factual
error in a metadata field, and the Critic was right to record it. Same class
as the round-2 base-binding defect of the prior cycle: I am describing
history from memory instead of reading it. Correction adopted: any commit
count or adjacency claim in a dispatch is read from `git log` at
dispatch-construction time, never asserted.

## Fresh live evidence for a filed defect (recorded, not re-filed)

Third independent measurement of
`backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`:
this round could persist neither notes nor report — compound shell, redirect,
and opaque-interpreter lanes are all closed to the dispatch, and the guard's
offered remedy is an attended human-override ceremony, which is correctly
outside a Critic's mandate. The Critic handled it exactly as CR-06-D's
fallback prescribes (emit the report as the deliverable, carry Phase 1 in the
visible trajectory) and disclosed it. The report was persisted by the
Elephant instead, which is the workaround, not the fix.

## Cycle status

Round 1 of the graduation package: FAIL → fixes. Three rounds remain in the
four-round budget. F1's fix does not close the finding on its own: it
restores a **question**, and the question is the PO's to answer. The package
therefore returns to the PO with one open decision rather than with a clean
"nothing open" claim — which is the honest state, and the state the design
promised in the first place.
