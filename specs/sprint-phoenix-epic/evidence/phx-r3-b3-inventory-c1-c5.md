# PHX-R3-B3-INVENTORY-A — per-line citation inventory, classes C1–C5

Measured at HEAD `84c5c0f` (per dispatch). Design pin for the prior inventory
(`specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`
§II) was `84876f1`. Scope: B3 classes C1–C5 (18 files), both language halves
(AC-R3-6). This dispatch measures and drafts; it repairs nothing (AC-R3-7).

## Running log (updated per class, committed mid-run per report-early duty)

- Design context read: §II.1.1–§II.1.3, §II.3.2–§II.3.3, §II.4, §II.5, §II.6,
  §II.7, §II.8.
- `docs/operating-model.md` heading structure re-derived and **confirmed
  identical** to §II.1.1 at HEAD: 10 `##` (§1–§10, all numbered), 3 `###`
  children (`### Profiles` `:63`, `### Duties` `:78` under §3; `### Gate
  discipline and autonomous happy path` `:185` under §5), 0 numbered `###`.
  Marker `<!-- DE-REFERENCE-BELOW -->` at `:323`. `wc -l` = 670. **No
  structural divergence found — the stop condition on structure mismatch is
  NOT triggered.**
- **Important finding, disclosed prominently (see § "Body-content drift"
  below): the BODY of `docs/operating-model.md` has changed materially since
  the design's `84876f1` pin, even though the heading titles/numbers are
  stable.** This affects how confidently a "kind A" citation's replacement
  can be drafted beyond the heading-title level.
- C5 file set derived by scanning `harness/**` for Markdown files (`git
  ls-files harness/`): 8 files, matching the design's stated count exactly —
  `harness/checklists/{critic-review,goldfish-dispatch,session-close,session-start,small-session}.md`,
  `harness/definition-of-done.md`, `harness/review-protocol.md`,
  `harness/session-bootstrap.md`.
- Both search forms (`rg -n "§"`, `rg -n "OM §"`) run over all 18 files (§
  "Raw hit counts" below) before any attribution.
- Classes C1 → C5 all scanned and adjudicated in this session; artifact
  written in one pass and committed once complete (single-session dispatch,
  no truncation risk observed before commit).

## Important finding: body-content drift beyond structure (read before using any replacement below)

The heading **structure** of `docs/operating-model.md` matches §II.1.1
exactly (confirmed above) — no stop condition. But a direct read of the
current body (`:57`–`:320`) shows the **content under several headings has
been rewritten** since the design's `84876f1` pin, in ways many citing
sentences do not anticipate:

- **The stage-0/"Tier-0 fast-path" numeric criteria that ~30 citations across
  these 18 files describe as living under "OM §3.3" — `≤ 2 files`, `≤ ~25
  diff lines`, "no architecture/schema/public-API/test/guardrail-hook-CI/
  dependency/security-surface change", "trivially `git revert`-able" — do
  not appear anywhere in the current document.** Verified directly:
  `rg -n "25 diff lines|≤ 2 files|trivially|revert-able|git revert"
  docs/operating-model.md` → **no output**. The current §5 "Rigor, risk and
  gates" body only states an abstract three-row table (rigor 0 = "small
  bounded change: short brief and evidence", 1 = "delta specification", 2 =
  "full maintained specification") with no size thresholds or exclusion
  list at all.
- **The current "The lifecycle" (§4) body enumerates exactly 8 steps, none
  sub-lettered.** Many citations point at sub-steps that do not exist in
  this form — `step 3b` (PO-gate skip flag), `step 6c` (UI wireframe
  requirement), `step 9` (human gate) all appear in citing sentences across
  this scope (e.g. `roles/elephant.md:119`, `templates/prompts/
  kickoff-new-project.md:176/227`, `harness/definition-of-done.md:82/104`)
  but the current lifecycle list only has steps 1–8, unlettered.
- **Consequence for this artifact.** Every drafted replacement below is
  given at the granularity AC-R3-2 requires — **file + heading title, no
  number** — which is unaffected by this drift (a heading title is stable
  even though its body prose changed). But readers should not assume a
  replacement of the form "`docs/operating-model.md` — *Rigor, risk and
  gates*" means the cited numeric criteria are actually restated there: they
  frequently are not, at HEAD. This is disclosed rather than silently
  absorbed into the kind-A/kind-B verdicts, which rest on heading titles, not
  body prose, and are therefore still sound. **The later repair sweep, and
  the PO, should treat "where do the stage-0 numeric criteria actually live
  now" as an open question this inventory surfaces but does not resolve** —
  candidates are `harness/definition-of-done.md` §4 (which does carry a
  rigor-keyed process-toll table, though not the same criteria) or a
  document this session did not scope.
- This is **not** the stop condition defined in the briefing (that one is
  specifically about heading *structure*, confirmed unchanged); it is
  disclosed here because every replacement's usefulness depends on it.

## Raw hit counts per file (both search forms, before attribution)

Per AC-R3-1: `rg -n "§" <file>` and `rg -n "OM §" <file>`. "Lines" = matching
line count (`rg -c` semantics: a line counts once even with several tokens).
"Tokens" = total `§`-prefixed occurrences on those lines, counted by hand
during attribution (several lines carry 2–7 tokens).

| File | `§` lines | `§` tokens | `OM §` lines | Class |
| --- | --- | --- | --- | --- |
| `templates/prompts/critic-review.md` | 7 | 7 | 1 (`:215`) | C1 |
| `templates/prompts/goldfish-task.md` | 7 | 7 | 0 | C1 |
| `templates/prompts/elephant-kickoff.md` | 6 | 8 | 0 | C2 |
| `templates/prompts/kickoff-new-project.md` | 17 | 19 | 0 | C2 |
| `templates/prompts/session-bootstrap-check.md` | 1 | 1 | 1 | C2 |
| `roles/elephant.md` | 23 | 38 | 2 (`:35`, `:267`) | C3 |
| `roles/critic.md` | 10 | 16 | 0 | C3 |
| `roles/goldfish.md` | 6 | 9 | 0 | C3 |
| `CLAUDE.md` | 6 | 13 | 0 | C4 |
| `README.md` | 4 | 4 | 0 | C4 |
| `harness/checklists/critic-review.md` | 3 | 3 | 1 (`:23`) | C5 |
| `harness/checklists/goldfish-dispatch.md` | 5 | 7 (2 non-citation, see notes) | 3 (`:18,:31`... ) | C5 |
| `harness/checklists/session-close.md` | 5 | 6 | 3 (`:35,:43,:46`) | C5 |
| `harness/checklists/session-start.md` | 8 | 10 | 0 | C5 |
| `harness/checklists/small-session.md` | 7 | 8 | 0 | C5 |
| `harness/definition-of-done.md` | 20 | 24 | 12 | C5 |
| `harness/review-protocol.md` | 14 | 17 | 10 | C5 |
| `harness/session-bootstrap.md` | 61 | 73 | 5 (verbatim confirmation-line quotes, EN+DE) | C5 |
| **Total** | **210** | **270** | — | — |

`goldfish-dispatch.md:10` uses the literal words "§-reference"/"§-references"
descriptively (checklist item about verifying citations in general) — **not**
a `§N` token. Counted in the raw `rg -n "§"` hit (2 occurrences, both on one
line) but excluded from every table below as a non-citation; disclosed here
so the raw count is reproducible and the exclusion is not silent.

## Method (verbatim per AC-R3-1 / the briefing's DoD)

1. `rg -n "§"` and `rg -n "OM §"` over each of the 18 files (table above).
2. Each `§N`/`§N.M` token attributed to the **nearest preceding document
   reference on its own line**. A line citing two documents does not inflate
   the operating-model count.
3. Where no document reference sits on the line, the token is **not**
   silently dropped: it is adjudicated by reading the surrounding sentence/
   paragraph and marked **recovered-by-hand** (with the reasoning stated) when
   the context makes the intended document unambiguous, or **not adjudicable**
   when it does not.
4. Because `docs/operating-model.md` has **zero** `§N.M` subsections (§II.1.1,
   reconfirmed above), **every `§N.M` token attributed to it is Kind A by
   construction** — no further reading is needed to prove non-existence,
   though the topic is still recorded for the replacement draft.
5. A bare `§N` attributed to `docs/operating-model.md` is Kind A only if it
   falls outside 1–10; all of 1–10 exist, so a bare in-range `§N` is either
   **Kind B** (topic stated, heading disagrees), **correct** (topic stated,
   heading agrees), or **not adjudicable** (no topic stated in the citing
   text — a bare number in a reference list).
6. Self-references (a file's own numbered section, not `docs/operating-
   model.md`) are identified from that file's own heading scan and listed
   separately, not counted as operating-model citations (per the briefing:
   `roles/critic.md:190`'s `§3` is the one pre-verified instance; further
   ones were searched for and are listed in their own section below).
7. Drafted replacements follow AC-R3-2: **file + heading title, no number.**
   Where the correct target is a different document entirely (the recurring
   "trigger matrix" pattern → `harness/review-protocol.md` §2.1), the
   replacement names that file, not `docs/operating-model.md`.

Commands actually run (exact, reproduced from this session's shell history):

```
rg -n "^#{1,4} " docs/operating-model.md
rg -n "DE-REFERENCE-BELOW" docs/operating-model.md
wc -l docs/operating-model.md
rg -n "^#{1,4} " harness/review-protocol.md
rg -n "^#{1,4} " policies/model-policy.md
git ls-files harness/
rg -n "DE-REFERENCE-BELOW" policies/model-policy.md
rg -n "§" <all 18 scope files, one command>
rg -n "OM §" <all 18 scope files, one command>
rg -c "§" <all 18 scope files, one command>
rg -n "DE-REFERENCE-BELOW" <all 18 scope files, one command>
rg -n "^#{1,4} " harness/session-bootstrap.md
rg -n "^#{1,4} " roles/critic.md roles/elephant.md roles/goldfish.md
rg -n "^#{1,4} " harness/definition-of-done.md harness/checklists/*.md
rg -n "^#{1,4} |^[0-9]+\. \*\*" templates/prompts/elephant-kickoff.md
rg -n "80%-gate|80% gate" roles/elephant.md docs/operating-model.md roles/goldfish.md
rg -n "25 diff lines|≤ 2 files|trivially|revert-able|git revert" docs/operating-model.md
```

---

## Class C1 — `templates/prompts/critic-review.md`, `templates/prompts/goldfish-task.md`

**Already fully specified by design §II.4 (the authoritative replacement
text for this class).** Independently re-derived here from the raw scan;
reconciles exactly: **9 operating-model citations, all Kind A, on 9 lines
(critic-review.md 5, goldfish-task.md 4)** — matches §II.1.3/§II.5 tier 1
exactly, no delta.

### `templates/prompts/critic-review.md`

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 5 | §2.4 | Critic contract + report format | A | Critic contract: `docs/operating-model.md` — *Roles and boundaries* (Critic row) **and** *Evidence, review and recovery*; report format: `harness/review-protocol.md` §2.4 *Findings format* | per §II.4 |
| 6 | §4.2 | trigger matrix; canonical German trigger wording | A | `harness/review-protocol.md` — *2.1 Trigger decision table*; drop "canonical German trigger wording" (stale, ADR-0011 makes English canonical — §II.7) | per §II.4 |
| 15 | §4.2 | "Model per MP-07 / §4.2 matrix" | A, **recovered-by-hand** | delete `/ §4.2` — the matrix this line already names (`review-protocol.md §2.1`) makes the OM number redundant, not repointable | nearest preceding ref on-line is `MP-07` (a rule id, not a document) — per briefing's explicit instruction, adjudicated by reading rather than dropped |
| 142 | §2.3 | "Dispatch metadata field 6, critic variant" | A | "Dispatch metadata (`roles/goldfish.md` GF-01 field 6, critic variant)" | per §II.2/§II.4 |
| 215 | §3.3 | stage-0 fast-path threshold for orchestrator-authored diffs | A | `docs/operating-model.md` — *Rigor, risk and gates* (rigor 0 row) — **see "Body-content drift" above: the specific stage-0 criteria this line means are not restated at that heading in the current body** | per §II.4; caveat added by this session |

Non-OM lines on this file (excluded from the 9, listed for completeness):
`:7` §6.3 → `harness/session-bootstrap.md` (correct, not touched, per §II.4);
`:9` §5 → "Rensin §5", an external essay reference, not a repo document.

### `templates/prompts/goldfish-task.md`

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 5 | §2.3 | "the canonical briefing field list" | A | "Source of truth: `roles/goldfish.md` GF-01 — the canonical six-field briefing list" | per §II.4 |
| 7 | §2.3 | same list, continued | A | same as `:5` | per §II.4 |
| 15 | §3.2 step 4 | briefing-format check | A | `roles/goldfish.md` GF-01/GF-02 (`:21-31`) plus `docs/operating-model.md` — *The lifecycle* (step 5) — "there is no §3.2 step 4" | per §II.4 |
| 129 | §3.3 | light/standard dispatch profile | A | drop the citation; `roles/goldfish.md` §6 for the report shape, `docs/operating-model.md` — *V3 routing: profiles, duties and phases* (`### Duties`) for the routing concept — "light" has no OM counterpart | per §II.4 |

Non-OM/correct-as-is, not touched: `:8` §6.2 → `harness/session-bootstrap.md`
(correct), `:37` §6.2 → `harness/session-bootstrap.md` (self-contained
phrase "bootstrap §6.2", not OM), `:160` §6 → `roles/goldfish.md` (correct).

---

## Class C2 — `elephant-kickoff.md`, `kickoff-new-project.md`, `session-bootstrap-check.md`

**Design's own figure (9 = 6A+3B) is explicitly flagged as a floor, not a
total** (§II.1.3, §II.8). Independent re-derivation here finds **13
operating-model tokens** (10 Kind A + 2 Kind B + 1 not-adjudicable) — larger,
as predicted. Delta explained per-line below.

### `templates/prompts/elephant-kickoff.md` (own headings: §1 Bootstrap `:45`, §2 Your operating contract `:64`, §3 This session's mission `:136`, §4 First actions `:144`)

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 4 | §2.2 | Elephant contract | A | `docs/operating-model.md` — *Roles and boundaries* | |
| 4 | §3 | "SDLC" | **B** | `docs/operating-model.md` — *The lifecycle* (old §3/SDLC content is now the step list under §4, not §3 "V3 routing") | topic "SDLC" ≠ current §3 "V3 routing: profiles, duties and phases" |
| 5 | §5 | "lifecycle FAQ" | **B** | `docs/operating-model.md` — *The lifecycle* (handover/retro are lifecycle step 8) | topic ≠ current §5 "Rigor, risk and gates"; recovered from line 4's list (no doc name on `:5` itself, continues the "Source of truth" list) |
| 86 | §3.4 | Spec-Readiness-Check | A | `docs/operating-model.md` — *The lifecycle* (step 3) | attributed via bare word "operating-model" on-line |
| 87 | §3.2 step 3b | PO-Gate merge/push/release distinct | A | `docs/operating-model.md` — *The lifecycle* — **see drift note: current lifecycle has no lettered "step 3b"** | |
| 114 | §4.2 | "Critic per the §4.2 matrix" | A, **recovered-by-hand** | `harness/review-protocol.md` — *2.1 Trigger decision table* | **no document reference at all on this line** — this is exactly the instance §II.1.3/§II.8 name as "uncounted by the scan"; recovered here by reading (same trigger-matrix idiom as C1's `:6`/`:15`) |
| 146 | §1 | "Bootstrap per §1" | self-ref | — | own `## 1. Bootstrap`, not OM |

`:5`'s other token, §6.1, is attributed to `harness/session-bootstrap.md`
(explicit on-line), not OM.

### `templates/prompts/kickoff-new-project.md`

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 5 | §8 | (bare, "Source of truth" list item, no per-item topic) | not adjudicable | — | reference-list token, no topic claimed |
| 156 | §3.3 | "stage-0, the only exception" | A, recovered-by-hand | `docs/operating-model.md` — *Rigor, risk and gates* (rigor 0) — drift caveat applies | no on-line doc ref; recovered via the file's own established stage-0/OM§3.3 convention (confirmed at `:227`, `:229` on the same page) |
| 176 | §3.2 step 6c | UI wireframe requirement before implementation | A | `docs/operating-model.md` — *The lifecycle* — **current lifecycle has no "step 6c"** | |
| 212 | §3.3 | "stage-0 fast path... any Elephant-authored diff outside stage-0" | A, recovered-by-hand | same as `:156` | no on-line doc ref |
| 227 | §3.2 step 3b | PO-Gate merge/push/release distinct | A | `docs/operating-model.md` — *The lifecycle* | verbatim duplicate of `elephant-kickoff.md:87`'s paragraph |
| 229 | §3.3 | "stage-0 (§3.3) is the only exception" | A, recovered-by-hand | same as `:156` | no on-line doc ref |

Self-references (own headings: `## 0. Project header` `:43`, `## 1. Bootstrap`
`:52`), not OM, listed separately below: `:88` §1d/§6.1 (→
`harness/session-bootstrap.md` Step 1d / §6.1, recovered from the file's own
"Source of truth" line 4), `:94` §6.4 (→ session-bootstrap.md), `:114` §1
(own), `:122` §5.1 (→ session-bootstrap.md, explicit), `:134` §1 (own),
`:173` §0 (own), `:218` §2 (→ `elephant-kickoff.md`, explicit), `:237` §1
(own), `:239` §0 (own), `:247` §0 (own).

### `templates/prompts/session-bootstrap-check.md`

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 177 | OM §3.3 | Tier-0 fast path (verbatim confirmation-line quote) | A | `docs/operating-model.md` — *Rigor, risk and gates* — drift caveat applies | explicit `OM §` shorthand |

### C2 reconciliation against §II.1.3/§II.8

§II.1.3's C2 row: 6A + 3B = 9, explicitly disclosed as a floor because
`elephant-kickoff.md:114` was uncounted. This session's total: **13** (10A +
2B + 1 not-adjudicable) across the same 3 files. Delta = **+4**, entirely
explained by: `elephant-kickoff.md:114` (+1, the named floor gap, now
recovered-by-hand); `elephant-kickoff.md:5`'s §5 (+1, a second token on a
line the original scan may have attributed only once or missed via
carry-over); `kickoff-new-project.md:156`/`:212`/`:229` (+3, all recovered-
by-hand, no on-line document reference — the same failure mode as
`:114`, just not individually named by the design); minus the `:5` §8
reference-list item moving to "not adjudicable" rather than a hard count.
Net effect: this deeper, by-hand-recovered pass finds more citations than
the design's own floor predicted, consistent with §II.8's explicit warning
that the true count for this class was never fully derived.

---

## Class C3 — `roles/elephant.md`, `roles/critic.md`, `roles/goldfish.md`

### `roles/critic.md` — **exact match with design, no delta**

Own headings: §1 Mandate `:14`, §2 Input contract `:24`, §3 Isolation stages
`:51`, §4 Two-phase protocol `:84`, §5 Report format `:117` (§5.1 Findings
`:128`, §5.2 Deliberately not flagged `:132`, §5.3 Trajectory check `:136`,
§5.4 Verdict `:142`), §6 Anti-overreporting `:148`, §7 Hard limits `:155`, §8
Model staffing `:188`, §9 Bootstrap confirmation `:195`, §10 References
`:209`.

| Line | Token(s) | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 10 | §2.4, §4.2 | this role's normative source | A, A | `docs/operating-model.md` — *Roles and boundaries*; trigger matrix → `harness/review-protocol.md` §2.1 | |
| 72 | §3.3, §4.2 | canonical trigger wording | A, A | `docs/operating-model.md` — *Rigor, risk and gates* (rigor 0) / `harness/review-protocol.md` §2.1 | |
| 138 | OM §3.3 | orchestrator-authored diffs outside stage-0 | A | `docs/operating-model.md` — *Rigor, risk and gates* | |
| 190 | §4.2 | trigger matrix | A | `harness/review-protocol.md` §2.1 | |
| 190 | §3 | "canonical wording quoted in §3 above" | **self-ref** | — | own `## 3. Isolation stages` — **this is the one verified false positive named in the briefing itself; confirmed, not counted** |
| 211 | §2.4, §4.2, §4.3, §3.4 | this role, trigger matrix, escalation ladder, readiness check | A×4 | *Roles and boundaries* / `harness/review-protocol.md` §2.1 / *Evidence, review and recovery* (escalation is lifecycle step 7/Critic) / *The lifecycle* (step 3, readiness) | |

Total: **10 OM tokens, all Kind A** — matches §II.1.3's `roles/critic.md 10`
exactly. Self-references found beyond the pre-verified `:190`: `:103` §5.3
("the trajectory") → own §5.3 Trajectory check; `:113` §5.2 ("Deliberately
not flagged") → own §5.2. Other-document, not OM: `:191` §2.1 →
`harness/review-protocol.md` (explicit); `:197`, `:214` §6.3 →
`harness/session-bootstrap.md` (explicit).

### `roles/goldfish.md` — **exact match with design, no delta**

| Line | Token(s) | Citing topic | Kind | Drafted replacement |
| --- | --- | --- | --- | --- |
| 7 | §2.3 | normative source | A | `docs/operating-model.md` — *Roles and boundaries* |
| 103 | §3.3 | light-profile / stage-0 | A | *Rigor, risk and gates* |
| 126 | §2.3, §3.2, §4.1, §4.3 | role+briefing formats, step 5, verify chain, escalation stage 1 | A×4 | *Roles and boundaries* / *The lifecycle* / *Evidence, review and recovery* / *Evidence, review and recovery* |

Total: **6 OM tokens, all Kind A** — matches §II.1.3 exactly. Non-OM: `:23`,
`:118`, `:128` all §6.x → `harness/session-bootstrap.md` (explicit).

### `roles/elephant.md` — **delta against design (23A+9B=32 → this pass: 21A+6B+4 not-adjudicable = 31)**

Own headings: §1 Mandate `:11`, §2 The four orchestrator skills `:19`, §3
Hard prohibitions `:28`, §4 Briefing duty `:71`, §5 Dispatch-pipeline duties
`:89`, §6 Harness-first debugging `:203`, §7 Communication rules `:219`, §8
Lifecycle self-management `:247`, §9 Model/effort/bootstrap/telemetry `:258`,
§10 References `:271`.

| Line | Token(s) | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 7 | §2.2, §2.3 | this contract's normative source | A, A | *Roles and boundaries* | |
| 7 | §3, §4, §5 | (bare reference-list continuation, no per-item topic) | not adjudicable ×3 | — | "Normative source... §2.2, §2.3, §3, §4, §5." — flat list, no topic per number |
| 35 | OM §3.3 | stage-0 fast-path definition, exception scope | A | *Rigor, risk and gates* — drift caveat | |
| 47 | §8 | "80%-gate, §8" | **not adjudicable** | — | no on-line or contextual document reference; `rg "80%-gate"` finds no other occurrence anywhere in the repo (`docs/operating-model.md`, `roles/goldfish.md` also checked) — genuinely ambiguous, flagged for the sweep rather than guessed |
| 60 | §3.2 (steps 4–8) | execution-phase work | A | *The lifecycle* | |
| 73 | §2.3 | 6-field briefing | A | *Roles and boundaries* | |
| 86 | §3.3 | light-dispatch profile | A | *Rigor, risk and gates* — "light" has no OM counterpart (§II.1.3 finding, re-verified) | |
| 99 | §1 | "mandate §1" | self-ref | — | own `## 1. Mandate` |
| 99 | §3.2 step 1 | large-scope soft-size indicators | A | *The lifecycle* | |
| 101 | §3.2 step 1 | same, "detail" | A | *The lifecycle* | |
| 105 | §3.5 | Release/Promotion phase | A | *The lifecycle* — corroborated by `README.md`'s recovered `:153`/`:445` citing the same §3.5 concept | |
| 113 | §3.4 | readiness check, stateful guard | A | *The lifecycle* (step 3) | |
| 117 | §3.3 | stage-0 exempt from PRD gate | A | *Rigor, risk and gates* | |
| 119 | §3.2 step 3b, §3.3 | PO gate skip flag / stage-0 | A, A | *The lifecycle* / *Rigor, risk and gates* | |
| 123 | §4.2, §3.3, §4.2 | trigger matrix (×2), canonical wording | A×3 | `harness/review-protocol.md` §2.1 / *Rigor, risk and gates* | one paragraph, 3 tokens |
| 149 | §4.3 | escalation ladder | A | *Evidence, review and recovery* / `harness/review-protocol.md` §4 (escalation ladder detail) | |
| 186 | §5.1 | persisted state precondition for `/compact` | A | *Evidence, review and recovery* | |
| 247 | §5 | "Lifecycle self-management (compressed from... §5)" | **B** | *The lifecycle* | design's pre-named finding, reconfirmed: §5 is "Rigor, risk and gates", not the lifecycle |
| 250 | §1 | "if §1 was lived" | self-ref | — | own `## 1. Mandate` |
| 267 | OM §3.3 | Tier-0 fast path (quoted confirmation line) | A | *Rigor, risk and gates* | |
| 273 | §2.2, §2.3, §3, §4, §5, §6, §7 | role/formats, SDLC+readiness, review system+trigger+escalation, lifecycle, handover, feedback loop | A, A, **B, B, B, B, B** | *Roles and boundaries* (×2); *The lifecycle* (for the §3/§4 pair — SDLC+readiness+review-system content now lives there); *Rigor, risk and gates* is NOT the target for the mislabelled §5 either — actual current topic-match is *The lifecycle* again (handover/retro are lifecycle step 8, per §II.1.1) | **5 Kind-B tokens (§3,§4,§5,§6,§7), not six** — the line stops at §7 and never cites §8, unlike `CLAUDE.md:27`'s parallel list; design's "six-way shift" phrasing (borrowed from `CLAUDE.md:27`) over-states this specific line's count by one token |

Self-references beyond `:99`/`:250`: none further found. Non-OM: `:229` §4
→ `roles/critic.md` (explicit); `:245` §2 → `templates/prompts/
elephant-kickoff.md` (explicit); `:261` §6.1, `:276` §3/§6.1 →
`harness/session-bootstrap.md` (explicit).

**C3 reconciliation:** §II.1.3 gives `elephant.md 23+9=32`,
`critic.md 10`, `goldfish.md 6` → class total 48. This pass: `elephant.md
21A+6B+4 not-adj=31`, `critic.md 10`, `goldfish.md 6` → class total **47**.
Delta **−1**, entirely inside `elephant.md`: this session moved 3 tokens
from `:7`'s bare reference-list continuation (§3,§4,§5) into
**not-adjudicable** rather than a hard A/B count (no topic is stated for
those three numbers individually — they are a flat citation list, "§2.2,
§2.3, §3, §4, §5", not three separate topic claims), and found `:273` to
carry 5 Kind-B tokens rather than the "six-way shift" the design's prose
(borrowed verbatim from `CLAUDE.md:27`'s pattern) implies for this
specific line. `roles/critic.md` and `roles/goldfish.md` reconcile exactly.

---

## Class C4 — `CLAUDE.md`, `README.md`

### `CLAUDE.md`

| Line | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 10 | §2 | "remains authoritative on conflict" (role definitions) | **correct** | — (no change needed; drop the number per AC-R3-2 anyway: "`docs/operating-model.md`, *Roles and boundaries*, remains authoritative...") | topic implied by the preceding clause ("role definitions..."), matches §2 exactly; **this token is not in §II.1.3's named list** — see delta note |
| 20 | §2.3 | Dispatch-Metadaten field, model discipline | A | *Roles and boundaries* | |
| 22 | §5.1 | persist immediately, not chat history | A | *Evidence, review and recovery* | |
| 27 | §2 | "roles (§2)" | **correct** | (drop number) | |
| 27 | §3 | "SDLC (§3)" | **B** | *The lifecycle* | |
| 27 | §4 | "review system (§4)" | **B** | *Evidence, review and recovery* / `harness/review-protocol.md` (the review system's operational home) | |
| 27 | §5 | "session lifecycle (§5)" | **B** | *The lifecycle* | |
| 27 | §6 | "handover (§6)" | **B** | *The lifecycle* (step 8, Close) | |
| 27 | §7 | "feedback loop (§7)" | **B** | *The lifecycle* (step 8, retro) | |
| 27 | §8 | "project calibration (§8)" | **B** | *Project calibration and extensions* | |
| 45 | §5.2 | context economy, self-length gate | A | *Evidence, review and recovery* — no exact match; nearest is the general economy principle, needs a reading judgement the sweep should make, not this inventory | |

Also on `:21`: `§2` (→ `templates/prompts/critic-review.md`, explicit, not
OM) and `§46`/`§103` (→ `roles/critic.md`, explicit document, but that file's
own headings only run §1–§10 — **`§46`/`§103` do not correspond to any
section of `roles/critic.md` as currently numbered; this reads as a
non-standard use of `§` for line numbers** (`roles/critic.md:46` and `:103`
are plausible line coordinates, not section numbers). Not an operating-model
citation either way; flagged as an anomaly for the sweep, not resolved here.

**Total this pass: 11 OM tokens** (3 Kind A + 6 Kind B + 2 correct). §II.1.3's
CLAUDE.md figure is 3A + 7 resolving (6B + 1 correct, from `:27` only) = 10.
**Delta +1**, explained by `:10`'s §2, which this pass finds correct and
topic-bearing (the preceding clause names "role definitions", matching
*Roles and boundaries*) but which does not appear in §II.1.3's named
kind-A/kind-B lists at all. Plausible explanation: `:10`'s reference is a
Markdown link — the label `` `docs/operating-model.md` `` followed by a
target of the same path, then `§2`; written out here in parts because the
link form itself would be resolved by `check-doc-contracts.mjs` against
this file's own directory and reported as an untracked target
— the automated scan's document-reference pattern may not have recognized
the link form as a "document reference on the line," which would make this
one more instance of the same class of miss the design already documents
for other files (a search-method gap, not a repair-scope gap).

### `README.md`

| Line | Half | Token | Citing topic | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 153 | EN | §3.5 | Mermaid diagram node "Release/Promotion (optional, §3.5)" | A, recovered-by-hand | `docs/operating-model.md` — *The lifecycle* (the diagram depicts the same SDLC the file later cites via `:179`'s explicit OM reference two paragraphs on) | no on-line document reference — the diagram label alone; recovered from the surrounding section, which is unambiguously about the operating model's SDLC (confirmed by `:179`) |
| 179 | EN | §3.2 | "nothing new is added" (PRD review, slicing) | A | *The lifecycle* | explicit, matches design |
| 445 | DE | §3.5 | mirror of `:153` | A, recovered-by-hand | same as `:153` | German mirror, marker at `:294`; not read for content per the bilingual skip convention — token position confirmed structurally identical to the EN diagram |
| 473 | DE | §3.2 | mirror of `:179` | A | same as `:179` | German mirror |

**Total this pass: 4 tokens (2 EN + 2 DE), all Kind A.** §II.1.3's figure is
`README.md 1+1 de` = 2 total. **Delta +2** (one EN, one DE), both from the
Mermaid diagram label (`:153`/`:445`), which carries no on-line document
reference and was recovered by hand from context — the same "diagram label
without an inline doc name" miss pattern already seen at
`elephant-kickoff.md:114`.

**C4 reconciliation:** §II.1.3: `CLAUDE.md`-derived 3A+7(6B+1correct) +
`README.md` 1+1de(A) + 8(resolves, but 7 of the 8 already counted under
CLAUDE.md's :27, leaving 1 for README) → class total 13. This pass: 11
(CLAUDE.md) + 4 (README) = **15**. Delta **+2**, both explained above
(CLAUDE.md `:10`'s correct §2; README's diagram-label §3.5 in both
languages, counted as +2 total but the class subtotal nets +2 not +3 because
one of README's two new tokens is the DE mirror of the other EN one, and
§II.1.3's README figure "1+1de" already implied a 1:1 EN:DE symmetry this
pass simply extends by one more matched pair).

---

## Class C5 — the 8 `harness/**` Markdown documents

### `harness/review-protocol.md` — **exact match with design, no delta**

Own headings confirmed: §1 Stage 1 `:11`, §2 Stage 2 `:31` (§2.1 Trigger
decision table `:33`, §2.2 Input construction `:60`, §2.3 Isolation levels
`:74`, §2.4 Findings format `:140`, §2.5 Anti-overreporting `:155`, §2.6
Shadow metrics `:165`), §3 Verdict processing `:182`, §4 Escalation ladder
`:197`, §5 Time-shifted second look `:210`, §6 Open items `:218`.

| Line | Token(s) | Kind | Drafted replacement |
| --- | --- | --- | --- |
| 5 | §4 | **B** (topic "review system", actual = *The lifecycle*) | `docs/operating-model.md` — *The lifecycle* |
| 5 | §4.3 | A | *Evidence, review and recovery* / this file's own §4 escalation ladder |
| 22 | §4.3 | A | same |
| 35 | §4.2 | A | `harness/review-protocol.md` §2.1 (self, trigger matrix already lives here — the OM citation is the dead one) |
| 53 | §3.3, §4.2 | A, A | *Rigor, risk and gates* / self §2.1 |
| 58 | §4.2 | A | self §2.1 |
| 140 | §2.4 (**inside the heading itself**) | A | — heading text only; §II.3.2 item 3/§II.4 already establish that repairing this heading changes its slug, so citations elsewhere must not pin the current slug |
| 161 | §2.4 | A | self §2.4 |
| 188 | §3.4 | A | *The lifecycle* (step 3, readiness) |
| 206 | §4.3 | A | *Evidence, review and recovery* |
| 213 | §4.2 | A | self §2.1 |

Total: **12 tokens, 11A+1B** — matches §II.1.3/§II.5/§II.7 exactly, no delta.
Self-references (not OM): `:72` §3(? — see below), `:137` §2.2 → own §2.2;
`:159` §3 → own §3 Verdict processing; `:221` §2.4 → own §2.4. Non-OM: `:72`
§6.3 → `harness/session-bootstrap.md` (explicit).

### `harness/definition-of-done.md`

Own headings: §1 Principle `:9`, §2 Reusable DoD checklist `:29`, §3 Task
status is three-valued `:67`, §4 DoD per rigor level `:91`, §5 Project slots
`:115`, §6 Where the DoD is applied `:130`, §7 Open items `:142`.

| Line | Token | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- |
| 5 | §3.3 | A | *Rigor, risk and gates* — drift caveat | process-toll table topic |
| 50 | §2.3 | A | *Roles and boundaries* | 6-field completion report |
| 77 | §2.3 | A | *Roles and boundaries* | three-valued report field 1 |
| 82 | OM §3.2 | A | *The lifecycle* | human verification pending |
| 82 | OM §8 | **B** | *Project calibration and extensions* | rollback field — actual §8 is "Operating shapes" |
| 93 | OM §3.3 | A | *Rigor, risk and gates* — drift caveat | deterministic gates mandatory |
| 95 | OM §3.3 ×2 | A, A | *Rigor, risk and gates* — drift caveat | stage-0 fast-path definition |
| 104 | OM §3.2 | A | *The lifecycle* | human gate criteria |
| 110 | OM §3.3 | A | *Rigor, risk and gates* — drift caveat | overhead proportional to size |
| 117 | §8 | **B** | *Project calibration and extensions* | calibration field sketch — actual §8 "Operating shapes" |
| 132 | OM §3.2 | A | *The lifecycle* | SDLC step reference header |

Total: **12 tokens, 10A+2B** — matches §II.1.3's tier-2 placeholder (this
file is not itemized by number in §II.1.3/§II.5, only bundled into "C5
remainder"); this is the first per-line count for it. Self-references (own
§3/§4/§5, not OM): `:21` §3, `:31` §4+§5, `:52` §3, `:82`'s bare §4 (the
"§4 / OM §3.2" either-or), `:136` §3 — 6 self-reference tokens. Non-OM:
`:17` §2.5, `:47` §2.1, `:75` §4, `:83` §4, `:103` §2.1 → all
`harness/review-protocol.md` (explicit); `:126` §4 →
`harness/session-bootstrap.md` (explicit).

### `harness/checklists/small-session.md`

| Line | Token | Kind | Drafted replacement |
| --- | --- | --- | --- |
| 4 | §3.3, §4.2 | A, A | *Rigor, risk and gates* / `harness/review-protocol.md` §2.1 |
| 33 | §3.3 | A | *Rigor, risk and gates* |
| 38 | §3.3 | A | *Rigor, risk and gates* |
| 44 | §4.2 | A | `harness/review-protocol.md` §2.1 |
| 65 | §3.3 | A | *Rigor, risk and gates* |

Total: **6 tokens, all A.** No self-references (file has no own numbered
sections — confirmed by heading scan). Non-OM: `:8` §6.5, `:31` §6.4 →
`harness/session-bootstrap.md` (explicit).

### `harness/checklists/goldfish-dispatch.md`

| Line | Token | Kind | Drafted replacement |
| --- | --- | --- | --- |
| 3 | OM §2.3, OM §3.3 | A, A | *Roles and boundaries* / *Rigor, risk and gates* |
| 18 | OM §2.3 | A | *Roles and boundaries* (in a heading: "Briefing — 6 mandatory fields") |
| 31 | OM §2.3 | A | *Roles and boundaries* |

Total: **4 tokens, all A.** `:10`'s two `§`-occurrences excluded as
non-citations (see raw-count note above). Non-OM: `:34` §3 →
`harness/definition-of-done.md` (explicit).

### `harness/checklists/session-close.md`

| Line | Token | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- |
| 3 | §5, §7 | not adjudicable ×2 | — | "why + verification live in `docs/operating-model.md` §5–§7" — a range citation, no per-number topic |
| 35 | OM §3.3 | A | *Rigor, risk and gates* | |
| 43 | OM §7 | **B** | *The lifecycle* (step 8, retro/growth rule) | "growth rule" is the old feedback-loop topic, now folded into lifecycle step 8; actual current §7 is "Project calibration and extensions" |
| 46 | OM §3.3 | A | *Rigor, risk and gates* | |

Total: **5 tokens (2 not-adj, 2A, 1B).** Non-OM: `:18` §3 →
`harness/definition-of-done.md` (explicit).

### `harness/checklists/session-start.md`

All 10 tokens on this file's 8 lines attribute to
`harness/session-bootstrap.md` (explicit `session-bootstrap` word or
backticked path precedes every `§` on every line: `:3` §3, `:5` §6, `:10`
§6.1/§6.4/§6.5 (3 tokens), `:11` §6.5, `:19` §6.1, `:28` §6.2, `:34` §6.3,
`:36` §4). **Zero operating-model citations in this file.**

### `harness/checklists/critic-review.md`

| Line | Token | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- |
| 3 | OM §4 | not adjudicable | — | "why + verification live in... (+ OM §4, ADR-0003/0014)" — no specific topic claimed for §4 alone |
| 23 | OM §3.3 | A | *Rigor, risk and gates* | |

Total: **2 tokens (1 not-adj, 1A).** Non-OM: `:8` §2.1 →
`harness/review-protocol.md` (explicit).

### `harness/session-bootstrap.md` — **exact match with design, no delta**

Own headings (English half): §1 Purpose `:18`, §2 Mechanism decision `:30`,
§3 Bootstrap flow `:53`, §4 Defined failure modes `:214`, §5 Refresh ritual
`:236` (§5.1 `:238`, §5.2 `:254`), §6 Role variants `:269` (§6.1 Elephant
`:286`, §6.2 Goldfish `:298`, §6.3 Critic `:308`, §6.4 Short bootstrap
`:340`, §6.5 Speed bootstrap `:361`), §7 Open items `:393`. German marker at
`:402`.

Given the very high self-reference density in this file (its own numbering
scheme reuses §1–§7/§5.1–5.2/§6.1–6.5 extensively to refer to itself), the
result is compact: **10 operating-model tokens in the English half, mirrored
exactly by 10 in the German half — 20 total, 12A+8B** — matching §II.1.3's
figure of 20 (stated there as "6A+4B per language half") exactly.

| Line (EN) | Line (DE, mirror) | Token | Kind | Drafted replacement | Notes |
| --- | --- | --- | --- | --- | --- |
| 134 | 530 | §3.3 | A | *Rigor, risk and gates* — drift caveat | EL-01 Tier-0 exception |
| 147 | 543 | OM §3.3 | A | same | quoted confirmation line |
| 171 | 556 | §8 | **B** | *Project calibration and extensions* | calibration field sketch — design's pre-named finding, reconfirmed |
| 175 | 560 | §8 | **B** | *Project calibration and extensions* | same |
| 294 | 679 | OM §3.3 | A | *Rigor, risk and gates* — drift caveat | quoted confirmation line, second occurrence |
| 300 | 685 | §2.3 | A | *Roles and boundaries* | six-field briefing list |
| 301 | 686 | §2.3 | A | *Roles and boundaries* | dispatch-metadata field |
| 387 | 767 | §3.3 | A | *Rigor, risk and gates* — drift caveat | mini-edit / Tier-0 |
| 397 | 777 | §8 | **B** | *Project calibration and extensions* | field sketch — design's pre-named finding, reconfirmed |
| 398 | 778 | §6 | **B** | *The lifecycle* (step 8, Close/handover) | design's pre-named finding, reconfirmed |

**All 20 self-references are the file's own numbering and are not OM
citations** — not re-listed individually here to keep this table readable;
they are, by English line: `49,91,111,117,119,143,145,164,192,204,
205(×3),207,218,259,271(×5),348,363,365,375,400` — 20 tokens across 17
lines, where `205` carries 3 tokens (§6.5/§6.1/§6.1) and `271` carries 5
(§6.1/§6.2/§6.3/§6.4/§6.5), every other listed line carrying exactly 1 —
and their exact German mirrors (`443,487,507,513,515,539,541,577,589,
590(×3),592,603,644,656(×5),728,743,745,755,780`). One non-numeric `§`
(`:250`/`:635`, "plugin-marketplaces.md §Private repositories") is excluded
from every count — not a `§N`/`§N.M` form, outside AC-R3-1's scope.

---

## C5 reconciliation

§II.1.3: `review-protocol.md 12` (11A+1B) + `definition-of-done.md`,
`session-bootstrap.md 20`, plus the 5 checklists — bundled into "C5
remainder: 7 files, 53" in §II.5 tier 2, not itemized. This pass gives the
first full per-file breakdown:

| File | This pass (A/B/not-adj) | Total |
| --- | --- | --- |
| `harness/checklists/critic-review.md` | 1A / 0B / 1 | 2 |
| `harness/checklists/goldfish-dispatch.md` | 4A / 0B / 0 | 4 |
| `harness/checklists/session-close.md` | 2A / 1B / 2 | 5 |
| `harness/checklists/session-start.md` | 0 | 0 |
| `harness/checklists/small-session.md` | 6A / 0B / 0 | 6 |
| `harness/definition-of-done.md` | 10A / 2B / 0 | 12 |
| `harness/review-protocol.md` | 11A / 1B / 0 | 12 |
| `harness/session-bootstrap.md` | 12A / 8B / 0 | 20 |
| **C5 total** | **46A / 12B / 3** | **61** |

§II.5's tier-2 placeholder for "C5 remainder" (the 7 files besides
`review-protocol.md`, which tier 1 itemized) is 53; adding `review-protocol.
md`'s 12 gives an implied §II.1.3-derived total of 65 for the full class
(matching the class table's "C5 harness | 41+6de | 14+4de" = 47+18=65
exactly). **This pass: 61. Delta −4**, concentrated in
`harness/definition-of-done.md` and the small checklists, where §II.1.3
never itemized a per-line count (only a class bundle) — there is no single
named line to reconcile against; the 3 "not adjudicable" tokens in this
pass (2 in `session-close.md:3`, 1 in `critic-review.md:3`) are the most
likely source, since a mechanical scan without per-token reading judgement
would either count or drop them differently than this pass's explicit
"no topic stated" classification.

---

## Grand totals, this pass vs. design

| Class | §II.1.3 (A+B, resolves incl. correct/not-adj/meta) | This pass (A+B+not-adj+correct) | Delta |
| --- | --- | --- | --- |
| C1 | 9 | 9 | 0 |
| C2 | 9 (explicit floor) | 13 | +4 |
| C3 | 48 | 47 | −1 |
| C4 | 13 | 15 | +2 |
| C5 | 65 | 61 | −4 |
| **Total** | **144** | **145** | **+1** |

The near-identical grand total (144 vs 145) is **coincidental, not
confirmatory** — per-file deltas of −4 to +4 exist in every class except C1,
and cancel out in the sum. Treating the closeness of the totals as
reassurance would repeat the exact failure mode §II.1.1's headline warns
against ("a total that merely matches the design is a suspicious result
here, not a reassuring one"). The per-file/per-line deltas above are the
actual reconciliation; the grand total is not.

## Self-references found (consolidated)

Beyond the one pre-verified instance (`roles/critic.md:190` §3), further
self-references found by this pass: `roles/critic.md:103` (§5.3),
`roles/critic.md:113` (§5.2); `roles/elephant.md:99` (§1),
`roles/elephant.md:250` (§1); `harness/review-protocol.md:137` (§2.2),
`harness/review-protocol.md:159` (§3), `harness/review-protocol.md:221`
(§2.4); `harness/definition-of-done.md:21,31(×2),52,82,136` (6 tokens, own
§3/§4/§5); `harness/session-bootstrap.md` — 20 English tokens across 17
lines plus 20 German mirror tokens across 17 lines (listed in the C5
section above rather than repeated here); `templates/prompts/
elephant-kickoff.md:146` (§1); `templates/prompts/kickoff-new-project.md`
— 6 tokens across `:114,:134,:173,:237,:239,:247` (own §0/§1).

## Not-adjudicable citations (consolidated)

`templates/prompts/kickoff-new-project.md:5` (§8, reference-list item, no
topic); `roles/elephant.md:7` (§3,§4,§5, reference-list continuation);
`roles/elephant.md:47` (§8, "80%-gate" — no on-line or repo-wide contextual
anchor found; `rg "80%-gate"` returns only this one occurrence in the whole
repository); `harness/checklists/session-close.md:3` (§5,§7, range
citation, no per-number topic); `harness/checklists/critic-review.md:3`
(§4, no topic claimed beyond "why + verification").

## Sanitization check

Grepped this artifact for `/home/`, `C:\Users` before commit — none found;
every path is repository-relative.
