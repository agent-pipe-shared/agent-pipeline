# PHX-R3-B3-INVENTORY-B — per-line citation inventory for R3 scope classes C6–C8

Dispatch: `PHX-R3-B3-INVENTORY-B (goldfish)`. Measured at HEAD `84c5c0f`. This artifact **measures
and drafts only** — no file listed below was edited by this dispatch. Scope: classes C6–C8 of
`specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md` §II.1.3, both
language halves (AC-R3-6), plus the one named C8-adjacent instance in
`harness/scripts/check-claude-md-lines.mjs:59`.

Running evidence log: this file was built incrementally, class by class (C6 → C7 → C8 → deltas →
guard table), and committed once mid-run per the report-early duty; the section order below is the
order the classes were completed in.

## 0. Method (AC-R3-1, prescribed, not negotiable)

For every file in scope: `rg -n "§" <path>` and `rg -n "OM §" <path>` (the second is a subset of the
first; run for completeness per the DoD, never `rg` for the string `operating-model`). Raw hit counts
below are **matching-line counts** from `rg -n "§"` (ripgrep's default -n mode reports one line per
match, not per occurrence); a line's own **token count** (how many `§` characters/citations it
carries) is stated separately in each per-file table, since one line can carry more than one
citation (e.g. `templates/CLAUDE.project.md:4` carries four).

**Attribution rule applied literally:** each `§` token is attributed to the nearest preceding
document reference **on its own physical line**. Where a sentence wraps across a hard line break
with no document reference on the token's own line, but the wrap is an unbroken continuation of the
immediately preceding line's cited sentence (no closing punctuation, same list item), the token is
attributed by **reading** the continuation and labelled `(continuation of :N)` in the notes column —
this is the DoD's "reading, not matching" instruction applied to a case the plain per-line rule would
otherwise silently drop. Where no such continuation exists and no document name appears anywhere
near the token, it is labelled `not adjudicable`. This produces a small, disclosed divergence from
§II.1.3's per-file totals in two files (`templates/retro.md`, `plugins/pipeline-core/skills/close-block/SKILL.md`)
— see §4 Deltas.

**Rule-id-nearest-preceding check (the `critic-review.md:15`/`MP-07` class):** every line in C6–C8
was checked for a rule id (`MP-`, `GF-`, `EL-`, `QG-`, `TP-`, `GS-`, …) sitting nearer to the token
than any document name. **None found in C6–C8** — the one instance of this pattern in the whole
repository (§II.1.3) is in `templates/prompts/critic-review.md`, class C1, outside this dispatch's
scope. Nothing here needed hand-recovery for that reason.

**Kind classification:** **A** = target does not resolve (any `§N.M`, since no numbered `###`
subsection exists anywhere in `docs/operating-model.md`; or `§N` outside 1–10). **B** = resolves to
an existing `##` section whose heading topic does not match the citing sentence's stated topic.
**Correct** = resolves and the topic matches. **Not adjudicable** = no topic is stated for the token
(a bare number in a reference/canon-pointer list). Every kind-B and kind-A call below was made by
reading the citing sentence against `docs/operating-model.md`'s actual §1–§10 content (read in full,
§0 below), not by pattern-matching the number.

## 0.1 Structure check against §II.1.3 (stop-condition gate)

`docs/operating-model.md` was read in full (English part, `:1-322`) and its heading structure derived
independently:

```
rg -n "^#{1,4} " docs/operating-model.md
rg -n "DE-REFERENCE-BELOW" docs/operating-model.md
wc -l docs/operating-model.md
```

Result: **10 `##` sections numbered 1–10** (§1 `:16` What the model protects · §2 `:38` Roles and
boundaries · §3 `:57` V3 routing: profiles, duties and phases · §4 `:87` The lifecycle · §5 `:164`
Rigor, risk and gates · §6 `:227` Evidence, review and recovery · §7 `:244` Project calibration and
extensions · §8 `:280` Operating shapes · §9 `:288` Authority precedence · §10 `:302` Glossary), **3
unnumbered `###` children** (`### Profiles` `:63`, `### Duties` `:78` under §3; `### Gate discipline
and autonomous happy path` `:185` under §5), marker `:323`, file **670 lines**. **This matches
§II.1.1's measured structure exactly — no divergence found.** No `§N.M` subsection exists anywhere,
confirming §II.1.2's premise that every `§N.M` citation is kind A by construction. The lifecycle (§4)
has exactly **8** numbered steps (Bootstrap … Close); several citations below cite a non-existent
step number (e.g. "step 9", "step 11") on top of the dead `§N.M`/wrong-`§N` defect — noted per row.

`docs/operating-model.md` §6's own content ends: *"Recover from the named artifact or start a newly
briefed task; do not continue by relying on remembered chat context."* — this sentence is the
correct-resolving target for several "persist immediately, never rely on chat" citations below that
are currently misfiled at `§5.1` (kind A) elsewhere in the repository; it is flagged per row where it
applies.

## 1. Class C6 — `guardrails/**` + `policies/**` (5 files)

**Derived file set.** `git ls-files 'guardrails/**' 'policies/**'` returns 10 files: `guardrails/deploy.md`,
`guardrails/git.md`, `guardrails/global.md`, `guardrails/quality-gates.md`, `guardrails/security.md`,
`guardrails/token-budget.md`, `policies/language-policy.md`, `policies/model-policy.md`,
`policies/neutral-leakage-policy.v1.json`, `policies/tooling-policy.md`. Raw `§` search
(`rg -c "§" <each>`) hits only 6 of the 10; of those, `policies/language-policy.md:19`'s sole `§` cites
`plugins/pipeline-core/skills/critic-review/SKILL.md §4` (a different document, not operating-model)
so it carries **zero** operating-model citations. **The 5-file set that actually cites
`docs/operating-model.md` is: `guardrails/global.md`, `guardrails/git.md`,
`guardrails/quality-gates.md`, `guardrails/security.md`, `policies/model-policy.md`** — matching
§II.1.3's stated class size exactly. `guardrails/deploy.md`, `guardrails/token-budget.md`,
`policies/tooling-policy.md`, `policies/neutral-leakage-policy.v1.json` and
`policies/language-policy.md` carry 0 operating-model citations and are **not** part of this class
(reported for completeness, not touched).

Bilingual check (`rg -l "DE-REFERENCE-BELOW" guardrails policies`): only `policies/model-policy.md`
carries a German half (marker `:320`). The other four C6 files are English-only.

### 1.1 `guardrails/global.md` (no DE half)

Raw hits: `rg -n "§" guardrails/global.md` → 5 matching lines (`:19,:45,:52,:58,:64`); `rg -n "OM §"` → 0.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 19 | §2.3 | evidence artifact mandatory field, "report field 2" | A | `docs/operating-model.md`, *The lifecycle* (step 5, Dispatch) — the six-field list itself is canonically `roles/goldfish.md` GF-01 | 2 tokens on this line |
| 19 | §3.3 | "verify + evidence are invariant on ALL rigor levels" | A | `docs/operating-model.md`, *Rigor, risk and gates* | |
| 45 | §3.2 | human-gate step in the SDLC, "step 9" | A | `docs/operating-model.md`, *The lifecycle* (step 4, Human plan gate) | lifecycle has only 8 steps; "step 9" is a second, independent defect |
| 45 | §4.3 | escalation ladder level 4 | A | `harness/review-protocol.md` §4 *Escalation ladder (complete)* | wrong **document**, not only wrong number — the escalation ladder lives there, not in the operating model |
| 52 | §2.3 | stop conditions route ambiguity, "field 5" | A | `docs/operating-model.md`, *The lifecycle* (step 5, Dispatch) / `roles/goldfish.md` GF-01 | |
| 58 | §2.2 | "the file is the authority, not the counter-argument" | A | `docs/operating-model.md`, *Authority precedence* | |
| 64 | §5.1 | "session is a volatile cache... must lose nothing" | A | `docs/operating-model.md`, *Evidence, review and recovery* | §6's own closing sentence ("do not continue by relying on remembered chat context") is the correct-resolving target |

Subtotal: 7 tokens, 7A, 0B. Matches §II.1.3's named figure "`global.md` 7" exactly.

### 1.2 `guardrails/git.md` (no DE half)

Raw hits: `rg -n "§" guardrails/git.md` → 2 matching lines (`:81,:99`); `rg -n "OM §"` → 0.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 81 | §4.2 | Critic per risk class trigger | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |
| 99 | §4.1 | "ruleset that claims more than the guard enforces... gate honesty" | A | `docs/operating-model.md`, *What the model protects* (rule 3, "Prefer deterministic checks") | nearest matching principle; "gate honesty" as a named topic has no single owning section — flagged, not forced |

Subtotal: 2 tokens, 2A, 0B.

### 1.3 `guardrails/quality-gates.md` (no DE half)

Raw hits: `rg -n "§" guardrails/quality-gates.md` → 4 matching lines (`:6,:16,:66,:67`); `rg -n "OM §"` → 0.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 6 | §4 | "deterministic before probabilistic — machines gate first, LLM judgment reviews after" | B | `docs/operating-model.md`, *What the model protects* (rule 3) | resolves to §4 *The lifecycle*; the actual rule is §1 rule 3, read and confirmed word-for-word ("Prefer deterministic checks... run before semantic review") |
| 16 | §3.3 | "verify + evidence are invariant on ALL rigor levels" | A | `docs/operating-model.md`, *Rigor, risk and gates* | |
| 66 | §2.3 | "self-validation is the core failure mode... an agent that can edit its own examiner" | A | `docs/operating-model.md`, *Roles and boundaries* (Goldfish row: "does not own... weakening its own examiner") | |
| 67 | §2.3 | briefing prohibitions field, "canonical field 4" | A | `docs/operating-model.md`, *The lifecycle* (step 5, Dispatch) / `roles/goldfish.md` GF-01 | |

Subtotal: 4 tokens, 3A, 1B.

### 1.4 `guardrails/security.md` (no DE half)

Raw hits: `rg -n "§" guardrails/security.md` → 4 matching lines (`:6,:17,:31,:37`); `rg -n "OM §"` → 0.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 6 | §4.2 | "canonical trigger wording" | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |
| 17 | §7 | "briefings and reports are persisted and quoted (three-artifacts archive)" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | resolves to §7 *Project calibration*; topic is the old feedback-loop/archive concept, now folded into lifecycle step 8 |
| 31 | §2.3 | briefing format check, "6 mandatory fields" | A | `docs/operating-model.md`, *The lifecycle* (step 5, Dispatch) / `roles/goldfish.md` GF-01 | |
| 37 | §4.2 | Critic trigger per matrix | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |

Subtotal: 4 tokens, 3A, 1B.

### 1.5 `policies/model-policy.md` (HAS a DE half, marker `:320`)

Raw hits: `rg -n "§" policies/model-policy.md` → 20 matching lines; `rg -n "OM §"` → 0. Of the 20
lines, 6 (`:25,:72,:73` EN and `:338,:387,:388` DE) cite `harness/session-bootstrap.md §6.5` — a
**different document**, correctly resolved there (confirmed: `harness/session-bootstrap.md` really
has `### 6.5 Speed bootstrap`) — and are **not** operating-model citations; excluded from this
file's OM count, listed here for the raw-hit-count requirement.

EN half:

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 101 | §2.3 | canonical briefing field list, dispatch metadata | A | `docs/operating-model.md`, *The lifecycle* (step 5) / `roles/goldfish.md` GF-01 | |
| 124 | §2.3 | same, Critic briefing template | A | same | |
| 129 | §3.2 | "Triage through...Spec-Readiness-Check, steps 1–3" | A | `docs/operating-model.md`, *The lifecycle* (steps 1–3) | |
| 130 | §3.2 | "Goldfish dispatch through merge, steps 4–8" | A | `docs/operating-model.md`, *The lifecycle* (steps 4–8) | |
| 218 | §5 | "session topic drift is a bootstrap/close-ritual check item" | B | `docs/operating-model.md`, *The lifecycle* (steps 1 Bootstrap, 8 Close) | resolves to §5 *Rigor, risk and gates*; topic is bootstrap/close, owned by §4 |
| 292 | §7 | "Maturity-metric collection (benefit/self-measurement)" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close — retro) | resolves to §7 *Project calibration*; topic is the old feedback-loop concept |
| 295 | §4.3 | "Budget-escalation criterion... stage 4" | A | no clean single-section match; nearest `docs/operating-model.md`, *Rigor, risk and gates* | flagged, not forced |

DE half (mirrors the EN rows line-for-line; same tokens, same kinds):

| Line | Token | Mirrors | Kind | Drafted replacement |
| --- | --- | --- | --- | --- |
| 416 | §2.3 | `:101` | A | same as `:101` |
| 439 | §2.3 | `:124` | A | same as `:124` |
| 446 | §3.2 | `:129` | A | same as `:129` |
| 447 | §3.2 | `:130` | A | same as `:130` |
| 537 | §5 | `:218` | B | same as `:218` |
| 613 | §7 | `:292` | B | same as `:292` |
| 616 | §4.3 | `:295` | A | same as `:295` |

Subtotal: EN 7 tokens (5A+2B) + DE 7 tokens (5A+2B) = **14 tokens**. Matches §II.1.3's named figure
"`model-policy.md` 14" exactly.

### 1.6 C6 subtotal, reconciled against §II.1.3

| | A | B | Total |
| --- | --- | --- | --- |
| `global.md` | 7 | 0 | 7 |
| `git.md` | 2 | 0 | 2 |
| `quality-gates.md` | 3 | 1 | 4 |
| `security.md` | 3 | 1 | 4 |
| `model-policy.md` (EN+DE) | 10 | 4 | 14 |
| **C6 total** | **25** | **6** | **31** |
| §II.1.3 C6 (20+5 de A, 4+2 de B) | 25 | 6 | 31 |

**Exact match, both directions, no delta.** EN-only A = 20 (`global.md`7 + `git.md`2 + `quality-gates.md`3
+ `security.md`3 + `model-policy.md`EN5 = 20), DE A = 5, EN B = 4 (quality-gates 1 + security 1 +
model-policy EN 2), DE B = 2 — reproduces §II.1.3's "20+5 de A, 4+2 de B" split precisely.

## 2. Class C7 — project-facing templates under `templates/`, not `templates/prompts/**` (9 files)

**Derived file set.** `git ls-files 'templates/**'` returns 23 files, 5 of them under
`templates/prompts/**` (excluded — those are C1/C2, not C7). Of the remaining 18, raw `§` search
(`rg -c "§"`) hits exactly 9: `templates/spec.md`, `templates/adr.md`, `templates/roadmap.md`,
`templates/CLAUDE.project.md`, `templates/retro.md`, `templates/prd.md`,
`templates/pipeline.json.example`, `templates/dev-plan.md`, `templates/handover.md`. **This is the
9-file set** — matches §II.1.3's stated class size exactly. The other 9 non-prompt template files
(`architecture-doc.md`, `costs.md`, `cutover-checklist.md`, `deploy-adapter.md`,
`guard-config.json.example`, `pipeline.yaml.example`, `release-manifest.md`, `risks.md`,
`three-scope-fixtures.md`) carry 0 `§` hits and are not part of this class. None of the 9 carries a
`DE-REFERENCE-BELOW` marker (bilingual check run, no hits) — C7 is English-only.

**A same-file structural note applies to `templates/spec.md`:** this template has its own internal
numbered sections (PART A `### 1`…`### 6`, PART B references back to "PART A §N"). Several `§`
tokens in it are **self-references to the template's own section numbering**, not to
`docs/operating-model.md`, and per the attribution rule (no document name on that line, and reading
confirms the referent is the template's own heading) they are excluded from the OM count below —
listed in §5 for transparency, exactly as `roles/critic.md:190`'s self-reference was excluded in the
original scan.

### 2.1 `templates/spec.md`

Raw hits: `rg -n "§" templates/spec.md` → 16 matching lines. Of these, 6 lines (`:64,:152,:154,:169,:177,:178`)
are self-references to the template's own PART A/B section numbers (excluded, §5), `:32` cites
"Rensin K4" (not a document, excluded, §5), and `:145`/`:146` cite `harness/definition-of-done.md`
§2/§4 (a different document, excluded, §5). `rg -n "OM §"` → 0.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 4 | §3.2 | "SDLC, readiness check" | A | `docs/operating-model.md`, *The lifecycle* | |
| 4 | §3.4 | same | A | `docs/operating-model.md`, *The lifecycle* | |
| 45 | §4.2 | risk class field | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |
| 48 | §3.4 | readiness check requirement | A | `docs/operating-model.md`, *The lifecycle* (step 3) | |
| 102 | §2.3 | "deviations reported, never silently built in", report format item 5 | A | `docs/operating-model.md`, *The lifecycle* (step 5) / `roles/goldfish.md` GF-01 | |
| 126 | §4.1 | evidence artifact mandatory, "never model-written prose" | A | `docs/operating-model.md`, *Evidence, review and recovery* | |
| 127 | §4.2 | Critic trigger per matrix | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |
| 143 | §4.2 | canonical trigger wording, "German text authoritative" | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |

Subtotal: 8 tokens, 8A, 0B. Matches §II.1.3's named figure "`spec.md` 8" exactly.

### 2.2 `templates/CLAUDE.project.md`

Raw hits: `rg -n "§" templates/CLAUDE.project.md` → 6 matching lines (`:4,:21,:60,:70,:98,:115`).

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 4 | §5 | "Source of truth: ... §5/§6/§7/§8, ADR-0011 (language)" | not adjudicable | — | 4 bare numbers, no per-section topic (confirmed by design §II.8 F2); a replacement needs a PO/implementor decision on what the line means, not a mechanical substitution |
| 4 | §6 | same | not adjudicable | — | |
| 4 | §7 | same | not adjudicable | — | |
| 4 | §8 | same | not adjudicable | — | |
| 21 | §6 | "the close ritual" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | |
| 60 | §8 | "Denies do NOT live in pipeline.json" | B | `docs/operating-model.md`, *Project calibration and extensions* | |
| 70 | §6 | "merge-completion gate" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) / *Evidence, review and recovery* | |
| 98 | §7 | "Lehren entry names the changed rule/artifact" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close — retro) | |
| 115 | §4.2 | "guardrail-relevant → risk class high" | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |

Subtotal: 9 tokens, 1A, 4B, 4 not adjudicable. Matches §II.1.3's named figure "`CLAUDE.project.md` 9"
exactly (these 4 labelled instances are the ones §II.1.1/§II.8 used to reconstruct the pre-restructure
numbering).

### 2.3 `templates/pipeline.json.example`

Raw hits: `rg -n "§" templates/pipeline.json.example` → 4 matching lines (`:2,:13,:29,:31`).

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 2 | §8 | "$comment" schema pointer for project calibration | B | `docs/operating-model.md`, *Project calibration and extensions* | |
| 13 | §5 | "$wipLimit... may be open at once in this project" | B (tentative) | `docs/operating-model.md`, *Project calibration and extensions* | topic is a calibration dial; compound `§5/§6` citation, both read against the same sentence |
| 13 | §6 | same sentence | B (tentative) | `docs/operating-model.md`, *Project calibration and extensions* | |
| 29 | §4.2 | "$riskZones" trigger | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |
| 31 | §6 | "$handover... default when absent: docs/state.md (convention)" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | ADR-0012 is the document that actually fixes the filename |

Subtotal: 5 tokens, 1A, 4B. Matches §II.1.3's named figure "`pipeline.json.example` 5" exactly.

### 2.4 `templates/adr.md`

Raw hits: `rg -n "§" templates/adr.md` → 1 matching line (`:5`).

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 5 | §2.2 | "no silently made fundamental decisions" | A | `docs/operating-model.md`, *Authority precedence* | |

Subtotal: 1 token, 1A, 0B.

### 2.5 `templates/roadmap.md`

Raw hits: `rg -n "§" templates/roadmap.md` → 1 matching line (`:5`).

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 5 | §6 | "handover owns" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | old §6 = handover, matches this topic exactly |

Subtotal: 1 token, 0A, 1B.

### 2.6 `templates/retro.md`

Raw hits: `rg -n "§" templates/retro.md` → 6 matching lines (`:4,:5,:22,:37,:72,:73`).
**Method disclosure specific to this file:** `:5` is a continuation of `:4`'s sentence (no closing
punctuation before the wrap); `:72` and `:73` carry no document name on their own line at all, but
this template only ever cites `docs/operating-model.md`, `policies/model-policy.md` and
`tooling-policy` by name, and both bullets are read in place among the file's other §7/§6 citations —
attributed by reading per the DoD, labelled below. A strict same-line-only reading would drop these
three tokens entirely (3 fewer, giving 3 rather than 6) — see §4 Deltas.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 4 | §7 | "feedback loop: mandatory question, maturity metrics, growth rule, three-artifact archive" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | |
| 5 | §3.2 | "step 11" (continuation of `:4`) | A | `docs/operating-model.md`, *The lifecycle* | lifecycle has only 8 steps; "step 11" does not exist even under the new structure |
| 22 | §7 | "the forced answer... lessons loop" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | |
| 37 | §7 | heading: "Elephant Retro... operating-model §7" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | |
| 72 | §7 | "Three-artifact archive... NO chat logs" | B `(read-attributed, no doc name on this line)` | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | |
| 73 | §6 | "Handover file updated (merge-close gate)" | B `(read-attributed, no doc name on this line)` | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | |

Subtotal: 6 tokens, 1A, 5B.

### 2.7 `templates/prd.md`

Raw hits: `rg -n "§" templates/prd.md` → 2 matching lines (`:11,:14`).

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 11 | §3.2 | "Step 3b" | A | `docs/operating-model.md`, *The lifecycle* (step 3) | |
| 11 | §3.3 | compound "/ §3.3 /" | A | `docs/operating-model.md`, *Rigor, risk and gates* | |
| 14 | §3.3 | "stage-0 fast-path... is exempt" (continuation of `:11`) | A `(read-attributed)` | `docs/operating-model.md`, *Rigor, risk and gates* | no doc name on this line itself |

Subtotal: 3 tokens, 3A, 0B.

### 2.8 `templates/dev-plan.md`

Raw hits: `rg -n "§" templates/dev-plan.md` → 2 matching lines (`:5,:22`).

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 5 | §3.2 | "Step 3b (booking statement)" | A | `docs/operating-model.md`, *The lifecycle* (step 3) | |
| 22 | §3.2 | "recorded deterministically... Step 3b" | A | `docs/operating-model.md`, *The lifecycle* (step 3) | |

Subtotal: 2 tokens, 2A, 0B.

### 2.9 `templates/handover.md`

Raw hits: `rg -n "§" templates/handover.md` → 1 matching line (`:32`).

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 32 | §5.1 | "persist immediately, never rely on chat history: a session is a cache" | A | `docs/operating-model.md`, *Evidence, review and recovery* | |
| 32 | §6 | same sentence | **correct** | (no change needed beyond dropping the number per AC-R3-2) | §6's closing sentence ("do not continue by relying on remembered chat context") matches this topic; unlike `guardrails/global.md:64`, this file already cites the section that carries it |

Subtotal: 2 tokens, 1A, 0B, 1 correct.

### 2.10 C7 subtotal, reconciled against §II.1.3

| | A | B | not-adj | correct | Total |
| --- | --- | --- | --- | --- | --- |
| `spec.md` | 8 | 0 | 0 | 0 | 8 |
| `CLAUDE.project.md` | 1 | 4 | 4 | 0 | 9 |
| `pipeline.json.example` | 1 | 4 | 0 | 0 | 5 |
| `adr.md` | 1 | 0 | 0 | 0 | 1 |
| `roadmap.md` | 0 | 1 | 0 | 0 | 1 |
| `retro.md` | 1 | 5 | 0 | 0 | 6 |
| `prd.md` | 3 | 0 | 0 | 0 | 3 |
| `dev-plan.md` | 2 | 0 | 0 | 0 | 2 |
| `handover.md` | 1 | 0 | 0 | 1 | 2 |
| **C7 total** | **18** | **14** | **4** | **1** | **37** |
| §II.1.3 C7 (17 A, 17 B) | 17 | 17 | — | — | 34 |

**Delta: +3 against §II.1.3, entirely in `templates/retro.md`** (§II.1.3 implies 3 for this file if
using strict same-line attribution only; this dispatch's read-attributed `:5`, `:72`, `:73` add 3).
§II.1.3's own A/B split (17/17) does not separate out a "not adjudicable" bucket the way this
dispatch does for `CLAUDE.project.md:4`'s 4 tokens — if those 4 are folded back into "B (resolves)"
as §II.1.3's own methodology does (§II.1.3 states "11 state no topic at all... not adjudicable" as
part of the resolving/"B" column, not a fourth column), C7's resolves count becomes 14+4+1=19 against
§II.1.3's 17, a smaller +2 delta, with the remaining +1 attributable to the same retro.md continuation
reads landing in the resolves bucket rather than the dead bucket. Either way, the source of the
delta is fully accounted for by the three retro.md rows and is disclosed, not hidden.

## 3. Class C8 — shipped plugin artifacts under `plugins/pipeline-core/**` (7 files) + 1 named exception

**Derived file set.** Candidates checked: `git ls-files` under `plugins/pipeline-core/agents/**`,
`plugins/pipeline-core/skills/**`, `plugins/pipeline-core/hooks/**`. Raw `§` search across all 8
agent files finds hits in exactly 4: `goldfish-implementor.md`, `goldfish-mechanic.md`,
`goldfish-deep.md`, `critic.md` (the other 4 — `afk-claude-worker.md`, `consult-advisor.md`,
`plan-verifier.md`, `readiness-reviewer.md` — carry 0). Raw `§` search across the skill/hook
candidates named in the briefing finds hits in `skills/close-block/SKILL.md`,
`skills/critic-review/SKILL.md` and `hooks/guard-git.mjs` (the other checked hooks —
`guard-gate-strength.mjs`, `guard-lifecycle-ready.mjs`, `guard-testpath.mjs` — carry 0 or are outside
this specific 7-file set). **The 7-file set: `skills/close-block/SKILL.md`,
`skills/critic-review/SKILL.md`, `agents/goldfish-implementor.md`, `agents/goldfish-mechanic.md`,
`agents/goldfish-deep.md`, `agents/critic.md`, `hooks/guard-git.mjs`** — matches §II.1.3's stated "4
agent files" + 2 skills + 1 hook shape exactly. None of the 7 carries a `DE-REFERENCE-BELOW` marker —
C8 is English-only (bilingual check run, no hits under `plugins/pipeline-core/**`).

**Post-merge coordinate warning honoured.** These coordinates are re-derived from the tree at
`84c5c0f`, after the `35d9e11` plugin merge the briefing flags — none of them is carried over from
§II.1.3's pre-merge scan.

### 3.1 `plugins/pipeline-core/skills/close-block/SKILL.md`

Raw hits: `rg -n "§" .../close-block/SKILL.md` → 13 matching lines. Two (`:115` → `harness/definition-of-done.md`
§3, `:143` → `policies/tooling-policy.md` §4) cite a **different document**, excluded from the OM
count (listed for the raw-hit-count requirement, not touched here). `:75` is a range citation
`§5–§8` — 2 literal `§` characters matched by `rg -n "§"`, treated as 2 tokens below; this is a
likely source of a ±1 delta against §II.1.3's count for this file, see §4.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 75 | §5 | "Normative sources... §5–§8" canon-pointer list | not adjudicable | — | range citation, no per-section topic |
| 75 | §8 | same | not adjudicable | — | |
| 90 | §6 | "`handover`... `docs/state.md` (convention)" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) / *Project calibration and extensions* | the field is a calibration dial; ADR-0012 fixes the actual filename |
| 94 | §8 | "File missing or required fields missing → fail-safe" | B | `docs/operating-model.md`, *Project calibration and extensions* | named kind-B instance in §II.1.3 |
| 116 | §4.2 | "mandatory-trigger tasks have a findings report before merge" | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |
| 123 | §7 | "CLAUDE.md length gate... consolidate" | B | no clean single-section match; nearest `docs/operating-model.md`, *What the model protects* | named kind-B instance in §II.1.3; flagged imprecise rather than forced |
| 132 | §3.3 (`OM §` shorthand) | "the OM §3.3 stage-0 fast path" | A | `docs/operating-model.md`, *Rigor, risk and gates* | |
| 138 | §4.2 | "bundled at the gate... approval-fatigue" | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |
| 142 | §7 | "MANDATORY part of EVERY close... self-retro" | B | `docs/operating-model.md`, *The lifecycle* (step 8, Close) | named kind-B instance in §II.1.3 |
| 147 | §3.3 | "Rigor-0 lessons may be bundled" | A | `docs/operating-model.md`, *Rigor, risk and gates* | |
| 168 | §5.2 | "Session cut recommendation" | A | no clean single-section match; nearest `docs/operating-model.md`, *The lifecycle* (steps 1, 8) | |
| 207 | §3.3 (`OM §`) | "rigor-0 bundling per OM §3.3" | A | `docs/operating-model.md`, *Rigor, risk and gates* | |

Subtotal: 12 tokens, 6A, 4B, 2 not adjudicable.

### 3.2 `plugins/pipeline-core/skills/critic-review/SKILL.md`

Raw hits: `rg -n "§" .../critic-review/SKILL.md` → 2 matching lines (`:26,:114`).

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 26 | §2.4 | "canon pointers" | A | `docs/operating-model.md`, *Roles and boundaries* (Critic row) and *Evidence, review and recovery* | |
| 26 | §4.2 | same, trigger matrix | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |
| 114 | §3.3 | "canonical English wording... mirrors" | A | `docs/operating-model.md`, *Rigor, risk and gates* | |
| 114 | §4.2 | same | A | `harness/review-protocol.md` §2.1 *Trigger decision table* | |

Subtotal: 4 tokens, 4A, 0B. Matches §II.1.3's named figure "`critic-review/SKILL.md` 4" exactly.

### 3.3 `plugins/pipeline-core/hooks/guard-git.mjs` — CODE FILE

Raw hits: `rg -n "§" .../guard-git.mjs` → 4 matching lines (`:7,:84,:134,:155`); line `:7` carries 2
tokens. **All 5 citations sit inside the file's top-of-file `/** ... */` JSDoc header comment**
(confirmed by reading `:1-160`, every `*`-prefixed line) — **none is in a string literal and none is
emitted to a human or to another tool at runtime.** No test file pins any of these comment strings
(`rg -l "check-claude-md-lines"` / equivalent search for a `guard-git` test naming these lines found
none touching them — the guard's own `guard-git.test.mjs` tests behaviour, not header-comment text).
A replacement here is a pure comment edit with no behaviour-visible surface.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes | Code-surface |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | §4.1 | "Canon:... gate honesty" | A | `docs/operating-model.md`, *What the model protects* (rule 3) | | comment |
| 7 | §8 | "+ §8 (calibration)" | B | `docs/operating-model.md`, *Project calibration and extensions* | | comment |
| 84 | §4.1 | "HONESTY NOTE (gate honesty, operating-model §4.1/M20)" | A | same as `:7` | | comment |
| 134 | §8 | "denies live here... NOT in .claude/pipeline.json" | B | `docs/operating-model.md`, *Project calibration and extensions* | | comment |
| 155 | §4.1 | "WHAT THIS GUARD DOES NOT BLOCK (gate honesty)" | A | same as `:7`/`:84` | | comment |

Subtotal: 5 tokens, 3A, 2B. Matches §II.1.3's named figure "`guard-git.mjs` 5" exactly.

### 3.4 `plugins/pipeline-core/agents/goldfish-implementor.md`

Raw hits: `rg -n "§" .../goldfish-implementor.md` → 2 matching lines (`:31,:41`). `:41` cites
`harness/session-bootstrap.md §6.2` — a **different document**, confirmed correct there (§II.4 already
verified `goldfish-task.md:8`'s identical citation as correct and "not to be touched"); excluded from
the OM count.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 31 | §4.3 | "maxTurns: 50 = hard leash... stage 1" (a code comment inside the agent-definition frontmatter) | A | no clean single-section match; nearest `docs/operating-model.md`, *The lifecycle* (step 5) or *Rigor, risk and gates* | |

Subtotal: 1 token, 1A, 0B.

### 3.5 `plugins/pipeline-core/agents/goldfish-mechanic.md`

Raw hits: `rg -n "§" .../goldfish-mechanic.md` → 2 matching lines (`:32,:52`). `:52` cites
`harness/session-bootstrap.md §6.2` — different document, excluded, same as above.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 32 | §4.3 | "same leash as goldfish-implementor... stage 1" | A | same as `goldfish-implementor.md:31` | |

Subtotal: 1 token, 1A, 0B.

### 3.6 `plugins/pipeline-core/agents/goldfish-deep.md`

Raw hits: `rg -n "§" .../goldfish-deep.md` → 2 matching lines (`:30,:45`). `:45` cites
`harness/session-bootstrap.md §6.2` — different document, excluded, same as above.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 30 | §4.3 | "same leash as goldfish-implementor... stage 1" | A | same as `goldfish-implementor.md:31` | |

Subtotal: 1 token, 1A, 0B.

### 3.7 `plugins/pipeline-core/agents/critic.md`

Raw hits: `rg -n "§" .../critic.md` → 1 matching line (`:83`), `OM §` search also hits it.

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 83 | §3.3 (`OM §` shorthand) | "Orchestrator-authored production diffs outside the OM §3.3 stage-0 fast path" | A | `docs/operating-model.md`, *Rigor, risk and gates* | |

Subtotal: 1 token, 1A, 0B.

### 3.8 The named exception: `harness/scripts/check-claude-md-lines.mjs:59` (own row, not part of the 7-file set)

This file is **outside** C8's directory scope (`harness/scripts/**` is class C5, excluded from this
dispatch per field 4) but the briefing names line `:59` specifically because §II.1.3's kind-B list
calls it out as **the only instance in the whole inventory that reaches an operator through tool
output**, and this dispatch is told to record it in its own row.

Read `:1-66` in full. The file actually carries **3** `§` citations, not 1 — `rg -n "§"
harness/scripts/check-claude-md-lines.mjs` → `:4, :17, :59`. Only `:59` is in scope per the briefing's
explicit instruction; `:4` and `:17` are disclosed here as a finding (not added to any inventory row,
since expanding into `harness/**` beyond the two named reads is out of this dispatch's scope) —
**delta note, not a row**: `:4` is a JSDoc header comment ("CLAUDE.md length gate (context economy,
E10 / operating-model §6)"), `:17` is also a header comment ("growing means consolidating,
operating-model §7)") — both mirror `:59`'s topic but cite a *different* number from `:59` and from
each other, an internal inconsistency worth flagging to whoever owns C5.

| Line | Token | Citing topic | Kind | Code surface | Emitted? | Test pinning the string? | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 59 | §7 | "Fix: consolidate rules, move procedures to skills/hooks, or delete — do not raise the limit to get green" | B | template-literal string argument to `console.error` | **yes — emitted to the human operator running the CLAUDE.md length gate** | **No dedicated test file found.** `find harness/scripts -iname "check-claude-md-lines*"` and `rg -l "check-claude-md-lines" harness/scripts` both return only the `.mjs` file itself; no `check-claude-md-lines.test.mjs` exists, and no other test file references this string. A replacement here changes the exact text a human reads at gate-red time; there is no test to update alongside it, and none to break | `docs/operating-model.md`, *What the model protects* (no clean single-section match for "CLAUDE.md length gate" specifically) | resolves to §7 *Project calibration*; topic doesn't match cleanly — same imprecision already flagged for `close-block/SKILL.md:123`'s identical topic |

### 3.9 C8 subtotal, reconciled against §II.1.3

| | A | B | not-adj | Total |
| --- | --- | --- | --- | --- |
| `close-block/SKILL.md` | 6 | 4 | 2 | 12 |
| `critic-review/SKILL.md` | 4 | 0 | 0 | 4 |
| `guard-git.mjs` | 3 | 2 | 0 | 5 |
| `goldfish-implementor.md` | 1 | 0 | 0 | 1 |
| `goldfish-mechanic.md` | 1 | 0 | 0 | 1 |
| `goldfish-deep.md` | 1 | 0 | 0 | 1 |
| `critic.md` | 1 | 0 | 0 | 1 |
| **C8 total (7-file set)** | **17** | **6** | **2** | **25** |
| §II.1.3 C8 (16 A, 8 B) | 16 | 8 | — | 24 |

**Delta: +1 total against §II.1.3.** Fully explained by the `:75` range citation in
`close-block/SKILL.md` — read as 2 literal tokens per `rg -n "§"`'s output (`§5–§8` contains 2 `§`
characters), where the prior scan may have counted the range as a single citation. The A/B split also
moved (17/6/2-not-adj here vs. 16/8 there): `close-block/SKILL.md:123`'s and `:142`'s kind-B
classification matches §II.1.3's own named list exactly, but this dispatch additionally classifies
`guard-git.mjs:7`'s second token (`§8`) and `:134` as kind B (calibration topic, §8 resolves to
*Operating shapes*) — consistent with §II.1.3's own named instance for exactly these two lines
("`guard-git.mjs` `:7`/`:134` §8 for calibration"), so this is a **presentation** difference (this
dispatch separates "not adjudicable" from "B", §II.1.3 folds bare-list citations into "B (resolves)")
rather than a substantive disagreement — see §4 for the reconciled view.

## 4. Deltas against §II.1.3, both directions

| Class | This dispatch | §II.1.3 | Delta | Explained by |
| --- | --- | --- | --- | --- |
| C6 | 31 (25A/6B) | 31 (25A/6B) | 0 | exact match |
| C7 | 37 (18A/14B/4 not-adj/1 correct) | 34 (17A/17B) | +3 | `templates/retro.md:5,:72,:73` — read-attributed continuations/bare-file-context citations this dispatch counts and a strict same-line-only reading would not (§2.6). If §II.1.3's own convention of folding "not adjudicable" into "B (resolves)" is applied to `CLAUDE.project.md`'s 4 not-adjudicable tokens, the practical delta narrows to +2/+1 as noted in §2.10 |
| C8 (7-file set) | 25 (17A/6B/2 not-adj) | 24 (16A/8B) | +1 | `close-block/SKILL.md:75`'s range citation `§5–§8`, counted as 2 literal `§` tokens by `rg -n "§"` (§3.1, §3.9); the A/B split difference is presentational (not-adjudicable vs. folded-into-B), not a disagreement on which lines are kind B |
| harness exception | 1 named row (`:59`) + 2 disclosed-not-counted (`:4`,`:17`) | 1 named instance (`:59`) | +2 disclosed, 0 counted | `:4`/`:17` are new findings, not part of the briefed row; not added to any inventory total since they sit outside this dispatch's `harness/**` read exception |

No file in C6–C8 was found with **fewer** citations than §II.1.3 states; every delta in this section
runs in the "found more" direction, and each is explained by a named line rather than left as an
unexplained gap.

## 5. Excluded — citations found by the raw search that are not operating-model citations

Listed for the raw-hit-count transparency requirement; none of these rows count toward any class
subtotal above, and none was touched.

| File:line | Token | Attributed to (nearest preceding reference) | Why excluded |
| --- | --- | --- | --- |
| `policies/language-policy.md:19` | §4 | `plugins/pipeline-core/skills/critic-review/SKILL.md` | different document |
| `policies/model-policy.md:25,72,73,338,387,388` | §6.5 (×6) | `harness/session-bootstrap.md` | different document; confirmed correct there (own `### 6.5 Speed bootstrap`) |
| `templates/spec.md:32` | §5 | "Rensin K4" | not a document reference at all |
| `templates/spec.md:64,152,154,169,177,178` | §4/§§1–3/§4-§5/§4/§6/§4.2 | spec.md's own PART A/PART B section numbering | self-reference, same class as the original scan's dropped `roles/critic.md:190` false positive |
| `templates/spec.md:145,146` | §2, §4 | `harness/definition-of-done.md` | different document |
| `plugins/pipeline-core/skills/close-block/SKILL.md:115` | §3 | `harness/definition-of-done.md` | different document |
| `plugins/pipeline-core/skills/close-block/SKILL.md:143` | §4 | `policies/tooling-policy.md` | different document |
| `plugins/pipeline-core/agents/goldfish-implementor.md:41` | §6.2 | `harness/session-bootstrap.md` | different document, already verified correct (§II.4) |
| `plugins/pipeline-core/agents/goldfish-mechanic.md:52` | §6.2 | `harness/session-bootstrap.md` | same |
| `plugins/pipeline-core/agents/goldfish-deep.md:45` | §6.2 | `harness/session-bootstrap.md` | same |

## 6. Recovered-by-hand (rule-id-nearest-preceding-reference cases)

**None found in C6–C8.** Every line in scope was checked for a rule id (`MP-`, `GF-`, `EL-`, `QG-`,
`TP-`, `GS-`, `CR-`, `AC-`, `SEC-`) sitting nearer to a `§` token than any document name — this is the
`templates/prompts/critic-review.md:15`/`MP-07` pattern (class C1, out of scope here). No such
instance exists in C6, C7 or C8.

## 7. Not adjudicable — full list

| File:line | Token | Reason |
| --- | --- | --- |
| `templates/CLAUDE.project.md:4` | §5, §6, §7, §8 | bare reference list, "Source of truth: ... §5/§6/§7/§8, ADR-0011 (language)" — no per-section topic stated |
| `plugins/pipeline-core/skills/close-block/SKILL.md:75` | §5, §8 | range citation in a canon-pointer list, "Normative sources... §5–§8" — no per-section topic stated |

`templates/pipeline.json.example:13`'s `§5`/`§6` pair and `guard-git.mjs:7`'s `§4.1`/`§8` pair are
**not** listed here — both state an actual topic (WIP limit; gate honesty + calibration
respectively) and were adjudicated as kind B/A per §2.3 and §3.3 rather than marked not adjudicable.

## 8. Guard protection, per file (C6, C7, C8, + the harness exception)

**Method.** `guard-gate-strength.mjs`'s `GATE_STRENGTH_PATHS` table was read in full
(`rg -n "path:|id:" plugins/pipeline-core/hooks/guard-gate-strength.mjs`): the only path-table entries
are `pipeline.user.yaml` (GS-1), `project/critical-human-proof.json` (GS-2), `project/pipeline.yaml`
(GS-3), `project/guard-config.json` (GS-4), `.claude/pipeline.yaml` (GS-5),
`plugins/pipeline-core/lib/public-core-origin-allowlist.mjs` (GS-8),
`plugins/pipeline-core/lib/self-application-attestation-gate.mjs` (GS-9, already landed in this tree —
see below) and `.claude/guard-config.json` (GS-7); GS-6 is the separate live-plugin rule. **None of
this dispatch's C6/C7/C8 files, nor `harness/scripts/check-claude-md-lines.mjs`, appears in this
table** — no GS-1..GS-5/GS-7/GS-8/GS-9 path-table rule matches any file in scope.

**GS-9 side note (not this dispatch's concern, disclosed because it was seen while reading the same
table):** the design document's Part I (R1) proposes creating
`plugins/pipeline-core/lib/self-application-attestation-gate.mjs` and a GS-9 entry for it — reading
the table shows **both already exist** in this tree at `84c5c0f`. R1 appears already landed; this is
outside R3's scope and is reported, not investigated further.

**GS-6 (live-plugin rule) determination — established, not assumed, per the briefing's instruction.**
`GS-6` refuses `Edit`/`Write`/`NotebookEdit` on **any** path inside the *currently-enforcing* plugin
root, which is resolved at guard-run time from the guard's own location plus `CLAUDE_PLUGIN_ROOT`, not
from this repository's own directory tree. This session's user-level Claude settings enable
`pipeline-core` from a **directory-source marketplace whose configured path is outside this
repository entirely** (a sibling directory on the same machine, not a subdirectory of this checkout,
and not a symlink into it — confirmed with `find <candidate> -maxdepth 0 -printf "%l\n"`, which
returned nothing, i.e. a real directory, not a link). **Consequence: in this checkout, this
repository's own `plugins/pipeline-core/**` tree is a source checkout, not the live/enforcing copy —
GS-6 does not match edits inside it.** This matches the design document's own independently-derived
finding for a different file in the same tree (§I.1.6, "this repository's `.claude/settings.json`
wires no hooks at all... the source-tree copy [is] refused... only after [wiring to] the *installed*
copy" — i.e. the source tree is deliberately left writable). This determination is **session/host
config dependent**: a differently-configured session (one whose enabled plugin resolves to this exact
checkout) would see GS-6 fire for all of C8. It is reported as measured for **this** session, not as a
permanent property of the files.

| File | Class | GS-* path-table match | GS-6 (live-plugin) match in this session | protectedTestPaths (TP-*) match | Refused? |
| --- | --- | --- | --- | --- | --- |
| `guardrails/global.md` | C6 | none | n/a (not in any plugin root) | none | **No** |
| `guardrails/git.md` | C6 | none | n/a | none | **No** |
| `guardrails/quality-gates.md` | C6 | none | n/a | none | **No** |
| `guardrails/security.md` | C6 | none | n/a | none | **No** |
| `policies/model-policy.md` | C6 | none | n/a | none | **No** |
| `templates/spec.md` | C7 | none | n/a | none | **No** |
| `templates/CLAUDE.project.md` | C7 | none | n/a | none | **No** |
| `templates/pipeline.json.example` | C7 | none | n/a | none | **No** |
| `templates/adr.md` | C7 | none | n/a | none | **No** |
| `templates/roadmap.md` | C7 | none | n/a | none | **No** |
| `templates/retro.md` | C7 | none | n/a | none | **No** |
| `templates/prd.md` | C7 | none | n/a | none | **No** |
| `templates/dev-plan.md` | C7 | none | n/a | none | **No** |
| `templates/handover.md` | C7 | none | n/a | none | **No** |
| `plugins/pipeline-core/skills/close-block/SKILL.md` | C8 | none | **no — this checkout is not the live root in this session** | none | **No** |
| `plugins/pipeline-core/skills/critic-review/SKILL.md` | C8 | none | no (same reason) | none | **No** |
| `plugins/pipeline-core/hooks/guard-git.mjs` | C8 | none | no (same reason) | `TP-1` protects `guard-git.test.mjs`, a **different** file — no match on `guard-git.mjs` itself | **No** |
| `plugins/pipeline-core/agents/goldfish-implementor.md` | C8 | none | no (same reason) | none | **No** |
| `plugins/pipeline-core/agents/goldfish-mechanic.md` | C8 | none | no (same reason) | none | **No** |
| `plugins/pipeline-core/agents/goldfish-deep.md` | C8 | none | no (same reason) | none | **No** |
| `plugins/pipeline-core/agents/critic.md` | C8 | none | no (same reason) | none | **No** |
| `harness/scripts/check-claude-md-lines.mjs` | exception | none | n/a | none (not a `.test.mjs`, and `TP-3` protects `verify.mjs`, a different file) | **No** |

**Bottom line for the sweep this dispatch's replacements are drafted for:** none of C6, C7, C8's files,
nor the named `harness/scripts/check-claude-md-lines.mjs` exception, is currently gate-strength- or
protected-test-path-refused in this checkout under this session's plugin configuration. **No
human-signed maintenance window is indicated by this measurement** for any file in this inventory —
but per the note above, C8's answer is host/session-configuration-dependent and should be re-confirmed
by whoever runs the sweep, in their own session, before assuming it.

## 9. Exact commands run (chronological)

```
rg -n "^#{1,4} " docs/operating-model.md
rg -n "DE-REFERENCE-BELOW" docs/operating-model.md
wc -l docs/operating-model.md
rg -n "^#{1,4} " harness/review-protocol.md
rg -n "^#{1,4} " policies/model-policy.md
rg -n "DE-REFERENCE-BELOW" policies/model-policy.md
git ls-files 'guardrails/**' 'policies/**'
git ls-files 'templates/**'
find . -iname "pipeline.json.example" -not -path "./.git/*"
rg -c "§" guardrails/*.md policies/*.md          # per-file, see §1
rg -n "§" guardrails/security.md
rg -n "§" policies/language-policy.md
rg -n "§" guardrails/quality-gates.md
rg -n "§" guardrails/global.md
rg -n "§" guardrails/git.md
rg -n "§" policies/model-policy.md
rg -c "§" templates/*.md (non-prompt set)         # per-file, see §2
rg -n "§" templates/spec.md
rg -n "§" templates/CLAUDE.project.md
rg -n "§" templates/retro.md
rg -n "§" templates/adr.md templates/roadmap.md templates/prd.md templates/pipeline.json.example templates/dev-plan.md templates/handover.md
git ls-files 'plugins/pipeline-core/agents/**' 'plugins/pipeline-core/skills/**' 'plugins/pipeline-core/hooks/**'
rg -c "§" plugins/pipeline-core/skills/*/SKILL.md plugins/pipeline-core/hooks/guard-*.mjs (candidate set)
rg -c "§" plugins/pipeline-core/agents/*.md        # all 8, see §3
rg -n "§" plugins/pipeline-core/hooks/guard-git.mjs
rg -n "§" plugins/pipeline-core/skills/close-block/SKILL.md
rg -n "§" plugins/pipeline-core/skills/critic-review/SKILL.md
rg -n "§" plugins/pipeline-core/agents/goldfish-implementor.md plugins/pipeline-core/agents/goldfish-mechanic.md plugins/pipeline-core/agents/goldfish-deep.md plugins/pipeline-core/agents/critic.md
rg -n "OM §" guardrails/*.md policies/*.md templates/*.md (C6/C7 set, per §1.5/§3.7)
harness/scripts/check-claude-md-lines.mjs read in full (:1-66)
rg -n "operating-model|Fix:" harness/scripts/check-claude-md-lines.mjs
rg -l "check-claude-md-lines" harness/scripts
plugins/pipeline-core/hooks/guard-git.mjs read in full context (:1-160) — comment-vs-string determination
rg -n "path:|id:" plugins/pipeline-core/hooks/guard-gate-strength.mjs
find <user Claude config dir> -maxdepth 5 -iname "*pipeline-core*"  # plugin-cache discovery, machine-local config dir, not a repo path
read of the user-level Claude settings file enabling the plugin (marketplace + directory source)
find <candidate live-root dir> -maxdepth 0 -printf "%l\n"           # confirms real directory, not a symlink into this checkout
rg -n "protectedTestPaths" -A 30 project/guard-config.json
rg -l "DE-REFERENCE-BELOW" guardrails policies templates plugins/pipeline-core/skills plugins/pipeline-core/agents plugins/pipeline-core/hooks
```

Sanitization: this artifact was grepped for `/home/`, `C:\Users`, and the repository's own absolute
root before commit; no absolute path appears above. The plugin-cache discovery and live-root
determination behind §8's GS-6 finding were run against a machine-local Claude config directory and a
sibling directory-source marketplace path outside this repository; neither literal path is
reproduced here — §8 states only the derived fact (source checkout vs. live-enforcing copy), never
the coordinates.
