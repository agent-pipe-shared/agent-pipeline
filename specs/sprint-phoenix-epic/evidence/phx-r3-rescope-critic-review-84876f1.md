# Critic review — PHX-R3-RESCOPE (`84876f1`), round 1 of 4

**Review object:** `84876f1`, parent `7dc97cf`. One file:
`specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`,
Part II (residual R3).

**Verdict: FAIL.** 1 major (F1) + 3 minor (F2, F3, F4).

**Transcription note.** Persisted by the Elephant from the dispatch's returned
report. Content is verbatim apart from this header and the transcription of one
machine-specific absolute path in the review-object line to its repo-relative
form. The reviewer's own report contained no other absolute paths.

**Recovery note, recorded because it is a measured defect and not an aside.** This
dispatch first returned a one-sentence fragment under `status: completed` — the
seventh occurrence of that failure in this session
(`backlog/items/2026-08-07-dispatches-report-completed-on-a-truncated-fragment.md`).
The report below arrived after the agent was resumed with a message. The fragment
was an announcement of the reviewer's *next* tool call, which is evidence for
output truncation rather than an early stop.

---

Bootstrap check passed: ruleset 2914a55713d714d95323231edaddccec5e1d6c2e5a4fbfaaaaa9d913a5fb1efc loaded · Project agent-pipeline · Calibration pipeline.json · State n/a (Critic sees no history) · Role Critic

**Requested route:** claude-opus-5 at max. **Effective model identity: unknown**
(no direct same-dispatch route evidence observed; not inferred from any selector
or host label).
**T1 assurance:** `functional-equivalent-read-only; OS isolation not asserted`.
Write capability is a residual host limitation, not an isolation claim. I invoked
no write tool and did not delegate; my one `mkdir` attempt was refused by the
guard (`GUARD-CROSS-REPO-MUTATION`), so I built no evidence files — all evidence
below is read-only command output.

**Review object:** `84876f1` (parent `7dc97cf`), one file:
`specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`.
All measurements are pinned to that tree via `git grep <rev>` /
`git show <rev>:<path>`, never to the working tree, except where the file is
provably unchanged since `84876f1`.

## 1. Findings

### F1 — `major` — A dead citation inside R3's narrowest scope is missing from the inventory, and the correction table asserts it is not there

- **Gap:** `templates/prompts/critic-review.md:15` reads
  `1. Model per MP-07 / §4.2 matrix, TIERED (review-protocol.md §2.1 T0/T3/T4):`.
  That `§4.2` resolves in no candidate document: `docs/operating-model.md` §4 has
  no numbered children (the document's own §II.1.1 finding);
  `harness/review-protocol.md` §4 is *Escalation ladder (complete)* at `:197` with
  no children; `policies/model-policy.md` §4 is *Cache Discipline* at `:250` with
  `### MP-xx` children only. It is therefore kind A under §II.1.2's own
  definition. The inventory counts `critic-review.md` at four kind-A citations
  (`:5`, `:6`, `:142`, `:215`) and class C1 at 8; §II.4's row for `:15` states, of
  that exact line, *"This is a path repair, **not an operating-model
  citation**"*.
- **Risk:** An implementation executing §II.4 verbatim leaves a dead `§4.2` in a
  normative dispatch template and fails the document's own **AC-R3-1**; C1 = 8 and
  §II.6's B1 size are understated by one; and the miss is produced by the same
  mechanism the document diagnoses in its predecessor and builds AC-R3-1 around
  (§II.1.3 attributes each token to "the nearest preceding document reference **on
  its line**" — on `:15` nothing precedes `§4.2` but the rule id `MP-07`, so the
  token falls out of the scan). Severity `major`: the deliverable's central
  artifact is incomplete in the one file class that is in scope under every
  option, and affirmatively denies the defect.
- **Evidence:** `templates/prompts/critic-review.md:15` @`84876f1`; design doc
  §II.1.3 (C1 row `| **C1 …** | 2 | 8 | 0 | critic-review.md 4, goldfish-task.md 4 |`)
  and the kind-A named list; §II.4 row for `critic-review.md:15`; heading scans of
  `harness/review-protocol.md` (`:197`) and `policies/model-policy.md` (`:250`).
- **Spec-ref:** AC-R3-1 (the document's own criterion, §II.5); §II.1.3's stated
  completeness ("Named instances, each confirmed by reading the file"); backlog
  item Proposal item 1.

### F2 — `minor` — §II.8's verification claim is falsified by at least two of the coordinates it covers

- **Gap:** §II.8 states *"**Every `file:line` quoted in Part II was confirmed by
  reading the file**, not by trusting a search hit."* Two counter-examples: (a)
  `docs/state.md:700`, cited twice (§II.1.3 and §II.7) as the meta-note about the
  defect — at `84876f1` line 700 is
  `**Two adjacent defects found and deliberately NOT fixed**, both correctly out`,
  while the quoted note (`` `:22` "operating-model §5.1", `:44` "§5.2/P5"; §5 has
  no numbered children ``) is at `:727`; (b) `templates/CLAUDE.project.md:4`, named
  as one of three lines that "each preserve an old topic label next to its old
  number" — `:4` is
  `Source of truth: docs/operating-model.md §5/§6/§7/§8, ADR-0011 (language).`,
  bare numbers with no topic labels (the labelled instances in that file are at
  `:21`, `:60`, `:70`, `:98`).
- **Risk:** §II.8's assertion is the document's warrant for the ~40 coordinates a
  reader cannot cheaply re-check; two falsifications weaken it. Bounded: neither
  error changes a count, a class or a decision, and the reconstruction in §II.1.1
  remains carried by `CLAUDE.md:27` and `roles/elephant.md:273`, both of which I
  confirmed.
- **Evidence:** `git show 84876f1:docs/state.md` lines 699–701 and 725–728;
  `git grep -n "§" 84876f1 -- templates/CLAUDE.project.md`.
- **Spec-ref:** §II.8's own literal verification claim.

### F3 — `minor` — "31 anchors for 20 headings" does not reproduce

- **Gap:** §II.3.2 item 1 reports, "all from `collectAnchors` run over
  `docs/operating-model.md`", **31 anchors for 20 headings**. The file has **29**
  slug-generating headings: 29 ATX heading lines, no setext headings (the only
  `---` line is `:321`, preceded by blank `:320`, so `collectAnchors`' setext
  branch does not fire), and no fenced code blocks that could hide one.
  `collectAnchors` emits one unique slug per heading plus the two `<a id>` values,
  i.e. 31 anchors for 29 headings. 20 is the count of `##` headings only (10 EN +
  10 DE).
- **Risk:** The statistic is offered as evidence that the anchor namespace is
  inflated relative to real headings; the true ratio is 31:29, not 31:20. The
  substantive claim it supports — EN and DE slugs share one flat namespace, so
  `#4-the-lifecycle` and `#4-der-lifecycle` are both valid — is independently
  true, so the conclusion survives; only the measurement does not.
- **Evidence:** `collectAnchors` at `harness/scripts/check-doc-contracts.mjs:160-188`
  (`addHeading` adds exactly one suffixed slug per heading; `<a id>` adds raw +
  lowercase, both already lowercase here); 29 heading lines in
  `docs/operating-model.md`; `docs/operating-model.md:320-321`; the two anchors at
  `:563`/`:583`.
- **Spec-ref:** §II.3.2's own "measured rather than assumed" standard, invoked in
  §II.3.1 and §II.8.

### F4 — `minor` — the "68" subset's stated definition yields 78

- **Gap:** §II.1.3: "Of the 114, the 68 that sit in live artifacts (i.e. **outside
  `specs/`/`backlog/`**) were topic-checked one by one". Outside `specs/`/`backlog/`
  is C1–C9 = 114 − 36 (C10) = **78**. The 68 additionally excludes the 10
  German-mirror resolving citations (C5 4 de + C6 2 de + C9 4 de). That exclusion
  is stated in the method paragraph and visible as the table's `de` columns, but
  not in the definition that names the number.
- **Risk:** A reader re-deriving the headline subset from its stated definition
  gets 78 and cannot reconcile it with 51+5+11+1 — in a document whose deliverable
  is a re-derivable measurement. No count or decision is wrong.
- **Evidence:** design doc §II.1.3 totals paragraph and the C1–C10 table (I
  re-summed it: files 57, A 230, B 114, total 344 — all internally consistent).
- **Spec-ref:** §II.1.3's method statement; the document's own re-derivability
  standard.

## 2. Deliberately not flagged

Cleared, hunt categories 1–10, with the re-derivation status stated separately
below.

- **Scope (2):** exactly one file changed (`git show --name-status`), matching
  `filesChanged` in the dispatch record; `filesDeliberatelyNotChanged` lists the
  seven citing artifacts; no code, schema or test touched. Edits outside Part II
  (the header note at `:22-27`, the R3 triage correction in §0.2, the R3 line in
  the closing residual list) are all R3-scoped; §III.4 is untouched as claimed.
- **Test integrity (4):** no test touched. Comparing old and new acceptance
  criteria in the diff, every AC was strengthened or added (AC-R3-1 broadened from
  `§N.M` to `§N` and from a string search to a `§` search; AC-R3-2 now rejects a
  bare link; AC-R3-6/7 added). Nothing weakened, skipped or made newly tolerant.
- **Documented-instead-of-fixed (8):** the un-run verify gate is not a TODO-style
  dodge. `verifyGateRan: false` carries a reason in the dispatch record, §II.8
  discloses it in the same terms and refuses to treat the substitute as the gate,
  AC-R3-3 is explicitly written against the gate rather than the substitute, and
  the evidence artifact carries `coverageNote`: exit 0 "is NOT evidence that the
  citation inventory in Part II is correct or complete." Follow-ups in §II.6 are
  recorded as separate briefed tasks, not as mitigations.
- **Dependency reality check (9):** no new import, package, action or image;
  design document only.
- **Language (10):** agent-facing English throughout. German appears only as quoted
  heading text of the reference half (`## 6. Evidenz, Review und Recovery`,
  `#8-projekt-kalibrierungsschicht`, `### H5 Close-Koordinator`) — quotation of a
  measured artifact, not authoring.
- **Security (7):** no secret, token or machine-specific absolute path anywhere in
  the diff (I read all of it). The only absolute path in my evidence set is `cwd`
  in the uncommitted `.git/` artifact, which is not in the tree and not part of the
  review object.
- **Dropped candidates:** "the file is 671 lines" vs. 670 newline-terminated (a
  trailing-newline display convention; no consequence). "English part only
  (`:1-322`)" where English content ends at `:319` (`:321` is the rule, `:323` the
  marker). `CLAUDE.md:27` described as "six labelled citations, six wrong topics …
  Only `roles (§2)` is right" when the line carries seven citations of which six
  are wrong (loose phrasing; the counts in the table are right).
  `goldfish-task.md:37`'s correct `bootstrap §6.2` not listed among the
  re-checked-correct citations (no action was needed). None survives the evidence
  gate with a consequence.

**Measurements I re-derived independently and found CORRECT:**

1. The structure of `docs/operating-model.md`: 10 `##` sections at exactly
   `:16, :38, :57, :87, :164, :227, :244, :280, :288, :302`; exactly 3 unnumbered
   `###` children at `:63, :78, :185`; no numbered subsection anywhere; DE marker
   at `:323`; `### H5 Close-Koordinator` at `:649` with no English counterpart.
2. `harness/review-protocol.md`: **exactly 12** OM citations across **exactly the
   10 lines enumerated** (`:5`×2, `:22`, `:35`, `:53`×2, `:58`, `:140`, `:161`,
   `:188`, `:206`, `:213`), with `:5`'s `§4` the single kind B. Token-for-token.
3. `roles/elephant.md`: **23 kind A + 9 resolving**, reproduced by an independent
   token-by-token count under the stated attribution rule.
4. `roles/critic.md` **10**, `roles/goldfish.md` **6** (`:7`, `:103`, `:126`×4),
   `CLAUDE.md` **3 + 8** with six wrong topics on `:27`,
   `templates/prompts/goldfish-task.md` **4** (no miss there).
5. The hand-dropped false positive is real: `roles/critic.md:190` does carry both a
   self-referential `§3 above` and a genuine OM `§4.2`.
6. **The load-bearing refutation in §II.3.2, in full:** 5 fragment links to the
   operating model, all from `backlog/README.md` (`:16`, `:35`, `:54`, `:68`,
   `:77`); 4 name headings that no longer exist; they stay green only through
   `<a id="7-feedback-loop">` at `:563` (above the **German**
   `## 6. Evidenz, Review und Recovery` at `:565`) and
   `<a id="8-projekt-kalibrierungsschicht">` at `:583` (above the German
   `## 7. Projektkalibrierung…` at `:585`); only `#6-evidence-review-and-recovery`
   is genuinely correct; those two are the only HTML anchors in the repository
   outside the checker's own tests.
7. The **13 anchor checks**: I enumerated them independently — 12 cross-file `.md#`
   links plus one same-file `](#decision)` at
   `docs/adr/0038-runner-neutral-advisory-v3.md:65`.
8. Checker behaviour from source: validates links/fragments only, never prose `§`
   or backticked paths; `stripFencedCode` but **no** `stripHtmlComments`, so links
   in the templates' comment headers are checked; inline-code spans not exempt;
   destinations resolved relative to the citing file. `collectAnchors` at
   `:160-188` (the first revision's `:163-187` was corrected); "anchor not found"
   at `:445-455` (`:446`/`:451`/`:454`).
9. `harness/scripts/check-claude-md-lines.mjs:59` does put `(operating-model §7)`
   inside the operator-visible fix string.
10. `harness/session-bootstrap.md` `:171`/`:175`/`:397` cite §8 for the calibration
    field sketch and `:398` cites §6 for the handover — all kind B, as claimed. The
    `session-bootstrap.md 20` note reconciles as a per-file total (6 A + 4 B
    English, 6 A + 4 B German).
11. Every §II.4 replacement target: `review-protocol` §2.1 `:33`, §2.3 `:74`, §2.4
    `:140`; `session-bootstrap` §6.2 `:298`, §6.3 `:308`; `goldfish.md` §2 `:19`,
    GF-01 `:21`, §6 `:86`; `elephant.md` EL-01's exception `:35`, which does
    enumerate the stage-0 criteria exactly as described and does itself cite
    `§3.3`.
12. Class-table arithmetic: files 57, A 230, B 114, total 344; 51+5+11+1 = 68; and
    114 = 36 archival + 10 German + 68 live.
13. `templates/prompts/critic-review.md:215` `OM §3.3` exists and is dead — the
    instance the first revision and the backlog item missed.

**Measurements I did NOT re-derive:** the full 344/57 whole-repository scan (I
verified the class-table arithmetic and spot-checked eight files token-by-token,
all of which reproduced exactly, but did not re-run an attribution-aware scan over
every tracked file); the per-class subtotals for C2, C7, C8 and the
non-spot-checked C5/C6/C9 files; `490 Markdown file(s), 776 link(s)` (I did not
execute the checker — the 13 anchor checks I confirmed by independent enumeration
instead).

**Not fully assessed, disclosed rather than claimed as cleared:** I did not read
`guardrails/global.md`, `guardrails/quality-gates.md`, `guardrails/token-budget.md`,
`docs/adr/0011-language-policy.md`, `roles/goldfish.md` prose, or
`specs/sprint-phoenix-epic/spec.md`. My findings are anchored on the backlog item,
the document's own acceptance criteria and stated verification claims, and
`CLAUDE.md` (auto-injected in full). Category 6 (guardrail violations) and category
1 (epic-level spec fidelity) are therefore assessed only against those sources.

## 3. Trajectory check

**`consistent`, with one stated exception.**

- The evidence artifact binds to the review object: `headAtRun` =
  `84876f14f42043ded461f9c899e57f2800adf27b`, exactly the reviewed commit.
  Timestamps (`19:19:36.876Z` → `19:19:43.261Z`) sit ~7 s after the commit's
  `21:19:29 +0200`, i.e. verify-after-commit; the shape (`exitCode`,
  `signal: null`, ms-precision ISO timestamps, `stdoutTail`/`stderrTail`) is
  machine-written, and `writtenBy` names the generator.
- The claimed outputs match reality: `stdoutTail` "…13 anchor check(s)" equals the
  figure quoted in §II.3.1, and I confirmed 13 by independently enumerating every
  fragment link in the tree.
- The one check **not** run — the project's configured verify gate — is disclosed
  as not run in both the dispatch record and §II.8, with the substitute explicitly
  labelled a substitute and AC-R3-3 written against the gate rather than against
  it. Disclosure, not substitution.
- **Authorship:** the diff originates from a dispatched fresh-context session, not
  the orchestrator. Commit trailer `Dispatch: PHX-R3-RESCOPE (goldfish)`; the
  dispatch record under `.git/` records `role: goldfish`, `dispatcher: elephant`,
  `model: claude-opus-5`, `effort: xhigh` with a stated design-tier rationale, and
  a `rulesetSha` identical to the SHA in my own dispatch. No EL-01/EL-16 lifecycle
  violation. No provider/model co-author trailer, no session URL or ID, no account
  identifier beyond the repository's configured git author.
- The measurement was genuinely performed: `roles/elephant.md` 23+9 and
  `harness/review-protocol.md` 12-across-10 reproduce exactly under an independent
  count, and the hand-dropped false positive at `roles/critic.md:190` is real.
- **Exception:** F2 — the §II.8 claim that every `file:line` in Part II was
  confirmed by reading the file is false for at least two coordinates. This is a
  precision defect in the verification log's coverage statement, not evidence of
  fabricated work.

## 4. Briefing violations observed

**None.** The dispatch supplied references only — spec paths, an enumerated commit
SHA, guardrail paths, two evidence artifact paths, ruleset SHA, project,
criticality, route and T1 assurance. It carried no rationale, summary, prior
verdict, praise or expected conclusion; the "bare facts" block bounded scope
without characterising the work.

Disclosures (accepted, not defects):

- **Auto-injected context:** `CLAUDE.md` project instructions in full; a git status
  / recent-commits snapshot from the **parent session's start**, which I did not
  use as a freshness reference (all commit and tree state came from my own
  `git show` / `git rev-list --parents` / `git grep 84876f1`); the user's
  auto-memory summary; MCP server instructions (Supabase, irrelevant here); the
  environment block.
- **Pre-existing scratch state:** the scratchpad root already contained an empty
  `pre-diff-design.md` (0 bytes, timestamped before this dispatch). I did not read
  into it, build on it, or reuse it. My attempt to create a fresh per-dispatch
  subdirectory was refused by the guard, so I produced no files at all.
- **`.git/` reads:** exactly the two referenced artifacts, nothing else.
- **`docs/state.md`:** read solely as a *measured artifact* to resolve one
  line-number claim, pinned to `git show 84876f1:docs/state.md` — never the current
  file, whose lines have shifted. The tool surfaced an automatic ~2 KB preview of
  the file head (narrative about a different package's Critic rounds); beyond that
  I read exactly two bounded windows, lines 699–701 and 725–728. None of it was
  used as review input other than for the F2 line-number check.
- The referenced backlog item carries entries dated after `84876f1` that restate
  the reviewed document's own conclusions and record a subsequent PO scope
  decision. I treated only the pre-commit Description/Proposal/Triage as the
  contract and did not use the later entries as a measuring stick or as
  corroboration.

## 5. Verdict

**FAIL.**

One `major` (F1) plus three `minor` findings. The fix is bounded: count
`templates/prompts/critic-review.md:15`'s `§4.2` as kind A, give it a target in
§II.4 instead of declaring the line free of operating-model citations, correct C1
from 8 to 9 and B1's size accordingly, and repair the two `file:line` coordinates
in F2 or soften §II.8's coverage claim to what was actually done.

What is *not* in question: the re-derived structure of `docs/operating-model.md`,
the two-defect-kind separation, the anchor-drift refutation that withdraws the
first revision's justification, and the boundary framing all survived independent
re-derivation intact — in several places token-for-token.
