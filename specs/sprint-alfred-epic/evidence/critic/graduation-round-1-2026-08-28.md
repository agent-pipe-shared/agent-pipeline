# Critic report — doctrine graduation, round 1 (2026-08-28)

Verbatim report as returned by the dispatched Critic. Persisted by the
Elephant because the lane could not persist it itself (see the closing note
in the report: every write lane granted to the dispatch is refused by the
guard union — the standing measurement of
`backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`,
now observed a third time).

Dispatch: ARCHITECTURE route, `claude-fable-5` at `max` (MP-07 mandatory),
tool-layer `model` parameter set (MP-29), lane
`functional-equivalent-read-only; OS isolation not asserted`. Review object:
enumerated SHAs `2b0ee8c7`, `9c9d9819`, `eba804e6`. Contract:
`design/agent-first-architecture.md`, `design/gap-analysis-2026-08-28.md`,
`evidence/issues-snapshot-2026-08-27.md`.

---

The guard union also refuses the Node-based scratchpad write (lane: opaque-interpreter-code, fail-closed under GL-09). I do not touch the offered human-override ceremony — that is an attended-operator route and no part of a Critic's mandate. Per CR-06-D's fallback: **report persistence was unavailable in this environment** (every write lane — compound shell, redirect, opaque interpreter — is closed to this session), so the report is emitted now, immediately after Phase 2, as the durable deliverable. Phase 1 candidates are carried in the visible trajectory above instead of a notes file.

---

# Critic review — sprint-alfred doctrine graduation (commits `2b0ee8c7f819cb7c35874e290c8bb58214d7ef0e`, `9c9d9819d3405f31d492774cde353eaea7ca5f21`, `eba804e6e6371355f04d0ffd191c6a4403344041`)

Route: requested `claude-fable-5` at `max`; effective identity `claude-fable-5` from this dispatch's own runtime prompt — match. Auto-injected context (disclosed, not used as freshness reference): CLAUDE.md copy, parent-session git snapshot, user memory, user email; `CLAUDE.md` was re-read from disk. Write-capable Bash host disclosed as the `functional-equivalent-read-only; OS isolation not asserted` residual limitation; no mutating command executed (four write-shaped calls were attempted only for guard-sanctioned notes persistence and were all refused pre-execution; no bytes changed anywhere). Tool budget: 22 of 24 review uses (2 lost to my own initial closed-shell-grammar violations, disclosed), 1 closing-allowance use on the refused notes write.

## 1. Findings (most severe first)

**F1 — Promised PO decision surface omitted from the reworked PRD §9, which now affirmatively claims none is open. Severity: major.**
- **Gap:** The contract document commits, in `specs/sprint-alfred-epic/design/gap-analysis-2026-08-28.md` §E (lines 203–207): "If the PO wants D-work pulled even earlier at the cost of running it on unmeasured enforcement, that is a PO call the PRD §9 rework will offer explicitly — the design's recommendation is the current order with the reweighted story." Commit `eba804e6` performs exactly that §9 rework (`par-9 turned from open questions into the decided register`) — and the resulting §9 (`specs/sprint-alfred-epic/prd_sprint-alfred-epic.md` lines 536–563) contains no such offer. It records the five pre-existing gate questions as decided and closes with "**Open at this gate:** none. The remaining gate act is the PO's `approve-plan` on the resubmitted plan."
- **Risk:** A sequencing trade-off the design explicitly promised to put before the PO was silently defaulted to the design's own recommendation, and the register now forecloses it ("none"). Either the offer was never made (unexecuted contract item) or it was made live and never persisted (what exists only in chat does not exist) — both shapes are defects at a PO gate document.
- **Evidence:** `git show eba804e6 -- specs/sprint-alfred-epic/prd_sprint-alfred-epic.md`, hunk `@@ -344,28 +533,42` (full §9 replacement, quoted above); gap-analysis §E quoted above; no other hunk in the PRD/spec/acceptance diffs carries the offer.
- **Spec reference:** gap-analysis §E (part of the named contract); `guardrails/global.md` GL-05 (judgment stays with the PO; ambiguity/decisions routed, not resolved locally) and GL-07 (persist decisions).

**F2 — All three commits are unbound to any authorship evidence: no `Dispatch:` trailer of either legitimate form. Severity: major.**
- **Gap:** `templates/prompts/agent-obligations.md` §6 (lines 151–175, generated from the enforcing components) requires every commit to carry `AI-Assisted: true` **plus exactly one** `Dispatch:` trailer — `Dispatch: <TASK_ID> (goldfish)` for dispatched work or `Dispatch: stage-0 (elephant)` for disclosed orchestrator work — and states that a commit with neither form is reported `UNVERIFIABLE` by `dispatch-authorship-verify`, never a pass. My own `git show --stat` of all three commits shows each carries only `AI-Assisted: true`. The dispatch briefing discloses orchestrator authorship to me, but the commits are the durable record, and they claim neither form — a +474/−83 rework of the epic's three authority documents is exactly the kind of work the trailer pair exists to make attributable.
- **Risk:** Authorship of the epic's binding authority documents is mechanically unverifiable; the stage-0 disclosure exists only in a transient dispatch text, not in the record.
- **Evidence:** trailer blocks of `2b0ee8c7`, `9c9d9819`, `eba804e6` (my `git show --stat` output); agent-obligations.md §6 as cited.
- **Caveat, stated for the adjudicating Elephant:** every sibling commit I could see (e.g. `c1a57c44`) shares the same pattern, so this looks systemic rather than specific to the review object; and a register-recorded exception in `docs/state.md` would be invisible to me by design. If the register sanctions the current practice, this finding dissolves there — that adjudication is not mine to make.
- **Spec reference:** agent-obligations.md §6 (GIT-03-adjacent commit discipline); `roles/critic.md` authorship check (EL-01/EL-16).

**F3 — Reference-integrity defects introduced by `eba804e6` in spec.md. Severity: minor.**
- **Gap (a):** §15 "Rejected alternatives" now contains two items both hard-numbered `5.` — `spec.md:801` ("One merged property list for #104 and #106", the new item) and `spec.md:809` ("Building org policy-pack resolution inside Alfred", pre-existing), followed by `6.` at `spec.md:811`. The source sequence reads 1,2,3,4,5,5,6.
- **Gap (b):** The new §7.2 remedy-comparison bullet ends "…subject to the same anti-churn boundary as every other structural change (§2.9)". Spec §2's deltas are list items 2.1–2.3 only (`spec.md:26–48`) and §7 has only 7.1–7.4; no §2.9 exists in spec.md. The intended target is doctrine §2.9 (anti-churn), but every other doctrine reference in the same commit is written "doctrine §…", while bare "(§2.2)" in this document resolves to the spec's own conventions — so the reference is dangling as written.
- **Risk:** Cross-references by alternative number ("§15 alternative 5") are ambiguous, and agents — which read source bytes, not rendered lists — follow "(§2.9)" to a section that does not exist.
- **Evidence:** rg line hits quoted above; `git show eba804e6 -- …spec.md` hunks `@@ -625,6 +798,14` and `@@ -453,9 +542,38`.
- **Spec reference:** internal consistency of the resulting documents (dispatch review question); GL-02 (docs must match what a reader can actually resolve).

**F4 — Two divergent normative statements of the re-entry reading order, introduced under a conflict rule that makes them a live contradiction. Severity: minor.**
- **Gap:** Doctrine §3.2 (`specs/sprint-alfred-epic/design/agent-first-architecture.md:234–252`) declares the order: AGENTS.md → map index → in-scope concept files → compiled decision summary → **lifecycle state / sanctioned next actions** → **owned implementation surface**. Spec §7.2's new "Re-entry reading order" bullet declares: AGENTS.md → map bundle entry point → in-scope concept files → compiled decision summary → **module inventory rows for the write surface** → **the fitness model** — and states "The order is part of the contract, not a convention: PRD S8 measures re-entry against it", while PRD S8 says the fresh session follows "the declared reading order (doctrine §3)". Spec §1 (added by the same commit) rules that where spec and doctrine disagree on an architectural property or enforcement semantic, "the doctrine governs and this document is corrected".
- **Risk:** The measured target of success measure S8 is stated differently in the two places that both claim to be its contract; the commit that introduced the doctrine-governs rule simultaneously introduced the first divergence it applies to.
- **Evidence:** the spec §7.2 hunk (quoted in full above), doctrine lines cited, PRD S8 hunk (`@@ -128,6 +226,21`).
- **Spec reference:** doctrine §3.2 (contract document); spec §1 normative-basis conflict rule.

**F5 — Map↔execution↔message reconciliation drift, both directions, unrecorded. Severity: minor.**
- **Gap:** `eba804e6` declares "Executes the integration map of design/gap-analysis-2026-08-28.md par-D", but: (a) the map's preamble bullet (added by `2b0ee8c7`) says the PRD design-inputs list "gains the three rework documents" — only two were added (`po-input-2026-08-28.md`, `gap-analysis-2026-08-28.md`); `agent-first-architecture.md` was elevated to the normative-basis line instead, a substantively stronger placement, but the map was not corrected and the deviation is nowhere recorded; (b) the map item "Tracks A/B/C re-introduced as 'what makes D true'" landed in §1.2 and §2, not in §4 where the map places it; (c) the commit performs substantive edits its otherwise-exhaustive message enumeration omits: the PRD §5 entry-condition rewrite (the #100 "substance already accepted on `main` at `2ae06d91`" claim with fixture IDs), the PRD §6 non-goals rewrite (Batman/Nightwing moves), PRD §7 criterion 4 (24 → live 27), and spec §1 (basis anchor + count), §13 (S1–S10), §14 (doctrine mapping paragraph).
- **Risk:** The map cannot be reconciled 1:1 against the diff in either direction, which is precisely the audit the "executes the map" framing invites; a gate-decision-recording concern and the graduation concern travel in one commit (one-concern-per-commit rule) with the former only partially declared.
- **Evidence:** all hunks quoted in my trajectory; commit message of `eba804e6`; gap-analysis §D preamble bullet.
- **Spec reference:** gap-analysis §D (the declared contract of the commit); `CLAUDE.md` "Conventional Commits; small, atomic commits — one concern per commit".

## 2. Deliberately not flagged (examined, in order)

1. **Fidelity of every enumerated list carried into spec §7 against the doctrine and the snapshot** — verified item-by-item and clean: #99's five significance axes, seven conflict cases, seven skill capabilities, waiver record fields, five-value close-impact enum; #104's eleven contract-sufficiency signals (verbatim, with the "floor, not a closed set" qualifier preserved), six concept-file contract fields (including the previously missing compatibility/lifecycle), governed-inventory rows; #106's eleven-item fitness-model list (verbatim) and the 9↔10 declared↔evaluated mapping table (identical to doctrine §2.10, all ten classes covered); #109's five adoption states and `measured | estimated | unavailable` statuses. No invented content found in the carried enumerations.
2. **Acceptance AC-17–AC-23** — exactly the seven rows the map demands, numbering continuous after AC-16, each with a named fixture/evidence class; AC-17's deferral semantics match #109 §3.
3. **PRD §1/§2/§3/§4/§7/§10 map items** — executed faithfully: architecture-first inversion fixed, four PO questions answered with correct doctrine-section mapping (§2/§4/§3/§5), S8–S10 as mapped, Track D expanded to the four-face capability, criteria 7–8, doctrine traceability row.
4. **Orchestrator authorship of design documents as such** — disclosed in the dispatch, and design-phase authority documents are the orchestrating role's legitimate surface; only the missing record binding is flagged (F2), not the authorship itself.
5. **German terms** ("Pflicht-Basis" in `2b0ee8c7`'s message, "*Wiederfinden*" in PRD Track D) — dropped: quoted PO terms, marked and inline-translated, within ADR-0011's stable-term allowance; no unmarked mixed-language content, no parallel translations in any touched file.
6. **ADR-0063 conformance** — all changes land in existing tracked files of the `specs/sprint-alfred-epic/` package; no new files, no misplaced kinds; spec §7.1 itself respects the ADR-0063 sidecar note.
7. **#9-interface field compression** (spec §7.1 parenthetical omits #99's "status and supersession relationship") — dropped: the spec matches the doctrine's §3.4 wording exactly, and that compression sits in pre-existing doctrine text outside the three enumerated commits; supersession semantics are carried elsewhere in the same section.
8. **Backlog-count claims (24→27, later 28)** — arithmetic internally consistent (24 − 2 + 5 = 27; c1a57c44's 24 − 2 + 6 = 28); the live GitHub set is outside my closed inputs and the documents themselves mark the live set authoritative over the written number — the correct honesty shape.
9. **PRD §7.8 "complete in both directions" vs §15's "no single declared parent"** — dropped after analysis: the mapping table's class-1 row is "foundation for all", i.e. all nine parents, not none; no contradiction.
10. **`2ae06d91`** — exists locally with the exactly matching subject "fix(guard-push): fail closed when the blocking evaluation itself faults"; the PRD claim's own evidence class is honestly labelled "read-verified … not run-verified". Whether it is on `main` with the named fixtures was not reached (outside the enumerated diff scope).
11. **Scope of the diffs** — `eba804e6` touches exactly the three named package files; the two design commits touch exactly the two design documents; no stray paths, no test/CI surface touched (docs-only), no new dependencies/imports (SEC-04 slopsquatting n/a), no absolute paths or secrets in any added line (GL-03 checked across all hunks).
12. **QG-06 documented-instead-of-fixed** — deferred items in the touched text carry owners/bindings (ledger event 41 mechanical reason; AC-16's wave-0 re-derivation), no ownerless TODO found in the diffs.
13. **Post-object separation** — `c1a57c44`'s three count lines and marker recompute identified and excluded from every judgment about the review object.

## 3. Trajectory check

**Consistent**, with named unverifiable pieces. Every item in `eba804e6`'s enumerated message was located in its diff (including the two undeclared-edit gaps recorded as F5, which are omissions from the enumeration, not false claims). The `technical-spec-sha256` recompute claim is verified at HEAD: my `sha256sum` of current spec.md is `fc653b7252aa9b6dd6fa6235e7a9d30b794eaa7c06425cd889e876584d347ec9`, byte-identical to the marker at `prd_sprint-alfred-epic.md:4`; `eba804e6`'s own historical value (`6a373d93…`) is verified only transitively via its successor's correct recompute of a one-line delta — not directly. The "PO cleared the bound-document route" / "PO directive at the re-review gate" claims rest on `design/po-input-2026-08-28.md` and the register, neither of which is in my admissible references — not verifiable here, by design. No claimed check was found to be un-run; no evidence artifact was claimed for this docs-only object, consistent with the dispatch's "n/a".

## 4. Briefing violations observed

One dispatch-metadata inaccuracy: the dispatch states two commits sit between `9c9d9819` and `eba804e6`; my own log shows three (`c2db10cc`, `010c21f4`, `f8998d9a`). Immaterial to the enumerated-SHA construction, recorded for the Elephant's dispatch hygiene. No contamination: no expected conclusions, no implementor characterization, no hunt list — the review question was stated as scope, correctly.

## 5. Verdict (binary requested, scoped)

Ruleset identity `0.6.0+claude.20260827211222.562aadb` and candidate identity (the three full SHAs above, resolved by my own `git show`) are both concretely bound — a binary verdict is permitted.

**FAIL (scoped).** Scope examined: the three enumerated commits' full diffs; the two contract design documents and the complete 1440-line issue snapshot; the four named guardrail artifacts; the current bytes of the three result documents for structure, numbering, and marker verification, with `c1a57c44` excluded. Not reached: the live GitHub issue/backlog set, `docs/state.md` and `design/po-input-2026-08-28.md` (excluded by the input contract), `2ae06d91`'s presence on `main` and its fixture contents, and `eba804e6`'s own historical sha256 marker value beyond successor verification. The carrying of the doctrine's enumerated content into PRD/spec/acceptance is of high fidelity — every verbatim list checked matched its source, and the four PO questions are answered where the map says they must be. The FAIL rides on F1 (a contract-promised PO decision surface absent from the gate document that now claims none is open) and F2 (the epic's authority documents committed with mechanically unverifiable authorship), with F3–F5 as accompanying minors. Findings go to the Elephant exactly once; no negotiation loop.

Report persistence: unavailable in this environment (guard union refuses all write lanes granted to this session — disclosed above); this message is the report of record.
