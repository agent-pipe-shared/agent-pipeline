# Critic review — rework cycle, round 1 (2026-08-28)

Dispatch metadata (recorded by the Elephant; the report below is the
Critic's verbatim final message):

- Candidate: `2c867ea9` (enumerated single SHA — the rework design package)
- Documents under review: `design/agent-first-architecture.md`,
  `design/gap-analysis-2026-08-28.md`, `design/po-input-2026-08-28.md`
- Requested route: claude-opus-5 at max (ARCHITECTURE class, MP-07
  mandatory; tool-layer model parameter per MP-29)
- Lane: `functional-equivalent-read-only; OS isolation not asserted`
- Template: `templates/prompts/critic-review.md`, full first-pass review
  (new documents; no delta base)
- Verdict: **FAIL** — F1/F2 major, F3–F5 minor
- Sanitization applied to the verbatim text below, per the standing
  convention: host-absolute paths rewritten repo-relative (one occurrence);
  transport HTML entities decoded (one occurrence). No other edits.

---

Bootstrap check passed: ruleset 0.6.0+claude.20260827211222.562aadb loaded · Project Agent-Pipeline · Calibration pipeline.user.yaml · State n/a (Critic sees no history) · Role Critic

**Route pre-check (ARCHITECTURE / MP-07).** Requested route: `claude-opus-5 at max`. Effective model identity from direct same-dispatch evidence — this dispatch's own runtime prompt states verbatim: "You are powered by the model named Opus 5 (1M context). The exact model ID is `claude-opus-5[1m]`." That matches the requested route; effort level is not directly observable in this dispatch and is disclosed as unobserved rather than asserted. Substantive review proceeds.

**Assurance lane:** `functional-equivalent-read-only; OS isolation not asserted`. No write tool invoked; no delegation; no mutating command outside the fresh scratch subdirectory I created (`scratch/dispatch/critic-alfred-3f4d2dc4/`, `mkdir`, CSPRNG suffix).

**Report durability — persistence UNAVAILABLE (disclosed).** The scratch subdirectory exists, but writing `critic-notes.md` into it is refused by the guard union: `node -e` writing to a `scratch/` path is classified by `guard-devplan` as `lane: opaque-interpreter-code` against the draft-lifecycle feature (`GUARD-DEVPLAN-SHELL`), and the closed shell grammar forbids redirects, so no shell write route exists; a write tool is excluded by this lane. Per `agent-obligations.md` §2, needing an override is a stop condition, not a route to hunt — and a scratch note does not warrant a human ceremony. The report is therefore emitted as text immediately after Phase B, as CR-06-D directs for that case.

**Auto-injected context disclosure (accepted, not silent):** CLAUDE.md project instructions, a git status/recent-commits snapshot from the parent session's start, and the user's memory file were injected. None was used as evidence. The commit state under review comes exclusively from my own `git show 2c867ea9`. Pre-existing scratch state found and NOT built upon: `alfred-critic-7f3ab91c`, `critic-648f9adb54`, `critic-alfred-f1677baf`, `critic-r3-53c83294`, `critic-r4-4568ae61`.

---

## 1. Findings

### F1 — `major` — The concept-file field list claims to be the #104 §2 list "verbatim" and drops one of its six fields

- **Gap:** `agent-first-architecture.md:217` declares the per-module concept-file frontmatter to be "The #104 §2 contract-sufficiency field list, verbatim — this is where those fields physically live", then enumerates nine fields that omit **compatibility and lifecycle expectations**. The same document states the complete six-field list correctly at §2.2 (`agent-first-architecture.md:88-91`), so the doctrine contradicts itself.
- **Risk:** `gap-analysis-2026-08-28.md:143` routes exactly this row ("the concept-file frontmatter field list") into `spec.md` §7.2. The defect therefore graduates: the shipped contract schema would omit a field the issue requires, and the omission is invisible because the row asserts verbatim completeness. Severity **major** — it is an elementary requirement of the primary issue, in the row whose whole claim is completeness.
- **Evidence:**
  - `specs/sprint-alfred-epic/design/agent-first-architecture.md:217` — `… authority/effect ownership · verification entry points · accepted decision references · implementation-revision binding | The #104 §2 contract-sufficiency field list, verbatim`
  - `specs/sprint-alfred-epic/evidence/issues-snapshot-2026-08-27.md:543` — `- compatibility and lifecycle expectations;`
  - `specs/sprint-alfred-epic/design/agent-first-architecture.md:90` — `compatibility and lifecycle expectations; verification entry points; …` (the same document, complete)
- **Spec-ref:** `po-input-2026-08-28.md:37-39` Directive 1 (audit against elementary requirements; absorb content, do not reference); #104 §2 acceptance ("Contract presence, identity, freshness, coverage class, and implementation agreement require mechanical evidence").

### F2 — `major` — A gap the package's own audit classifies as **missing** is neither absorbed nor scheduled: the eleven contract-sufficiency signals

- **Gap:** `gap-analysis-2026-08-28.md:38` audits "Contract-sufficiency signals (11 signals incl. 'foreign implementation inspection required')" as `absent | absent | **missing**`. The doctrine that is supposed to close that gap names only three of the eleven (§2.2 "contradiction-with-implementation and staleness"; §3.2 "foreign implementation inspection required beyond the accepted boundary"); the other eight — repeated cross-boundary lookup, hidden dependency or cyclic traversal, missing required contract, late scope expansion, review-discovered architecture assumption, verification not locally available, authority/side-effect ownership unclear, sufficient contract for the bounded task — appear nowhere. The integration map (`gap-analysis-2026-08-28.md:136-153`) contains no entry routing them into `spec.md` either. A second, weaker instance of the same pattern: the #106 §Scope-2 eleven-item fitness-model representation list is audited absent (`gap-analysis-2026-08-28.md:66-71`) and then scheduled *by pointer to the issue* (`:147` "the fitness-model representation list (#106 §Scope-2)") rather than absorbed anywhere in the reworked text.
- **Risk:** the rework is measured by exactly one test — whether the elementary requirements now live in the design's own text. A self-identified missing requirement that silently leaves both the doctrine and the integration map will not resurface at the unfreeze step, because the map is the only carrier from analysis to bound documents. The next gate would re-present a package that still cannot say what the contract-sufficiency signal set is. Severity **major**.
- **Evidence:**
  - `specs/sprint-alfred-epic/design/gap-analysis-2026-08-28.md:38` (audited `**missing**`)
  - `specs/sprint-alfred-epic/evidence/issues-snapshot-2026-08-27.md:672-686` (the eleven signals)
  - `rg -in 'signal'` over both new documents returns nine hits, all evidence-class prose plus the three named above — no enumeration
  - `specs/sprint-alfred-epic/design/gap-analysis-2026-08-28.md:141-146` (spec §7.2 map entry; no signal-list item)
- **Spec-ref:** `po-input-2026-08-28.md:37-39` Directive 1 — "close the gaps in the design's own text — absorbing content, not referencing it."

### F3 — `minor` — The audit's foundational currency claim has no supporting artifact

- **Gap:** `gap-analysis-2026-08-28.md:5-7` states the method as a full re-read of the snapshot "(all nine bodies; snapshot verified current — no issue changed since 2026-08-11)". Nothing in the package supports that verification. The snapshot was captured with `--json number,title,state,labels,body` (`issues-snapshot-2026-08-27.md:3-4`) and therefore carries no `updatedAt`; `rg -in 'updatedAt|2026-08-11'` over the snapshot returns zero relevant hits; `design-authoring-record.json:101-105` `declaredFacts` records no currency check. The nine-body count is correct (#99, #101, #102, #103, #104, #105, #106, #108, #109) — only the currency assertion is unsupported.
- **Risk:** every coverage verdict in §B is computed against the snapshot. If an architecture issue changed after 2026-08-27, the "missing/covered" classification silently mis-scopes the rework, and the claim as written would prevent anyone from re-checking. Severity **minor** (the snapshot is only one day old at authoring time), but the claim is stated as a verified fact and is not one.
- **Evidence:** `specs/sprint-alfred-epic/design/gap-analysis-2026-08-28.md:6-7`; `specs/sprint-alfred-epic/evidence/issues-snapshot-2026-08-27.md:3-4`; `specs/sprint-alfred-epic/evidence/design-authoring-record.json:101-105`.
- **Spec-ref:** CLAUDE.md — "Persist immediately; never rely on chat history … a session is a cache on the persisted artifact"; ADR-0014 evidence discipline (a claimed check needs an artifact).

### F4 — `minor` — Commit `2c867ea9` carries no `Dispatch:` trailer

- **Gap:** the commit message ends at `AI-Assisted: true` with no `Dispatch:` trailer. `templates/prompts/agent-obligations.md` §6 (generated from the enforcing components) requires "Only `AI-Assisted: true`, plus exactly one `Dispatch:` trailer saying who did the work", with `Dispatch: stage-0 (elephant)` as the applicable form for orchestrator-authored work with no dispatch record behind it.
- **Risk:** "A commit with neither form is unbound to any evidence, and the `dispatch-authorship-verify` tool … reports it `UNVERIFIABLE`, never a pass." The design package's authorship is asserted only in `design-authoring-record.json:5`, which that tool does not read. This is systemic rather than isolated: all five preceding commits on the branch (`git log -n 6 --format=%B`) are likewise trailer-less. Severity **minor** — design-document authoring by the Elephant is within `roles/elephant.md` design duties, so this is an attribution defect, not a lifecycle violation; there is no production code in the diff.
- **Evidence:** `git show --format=full 2c867ea9` message body; `templates/prompts/agent-obligations.md:157-175`.
- **Spec-ref:** `agent-obligations.md` §6 (Commit discipline); GIT-03.

### F5 — `minor` — Unglossed German term in an English-canonical agent-facing artifact

- **Gap:** `agent-first-architecture.md:259` reads `This is the mechanical answer to "wiederfinden": …`. ADR-0011 permits German only in the named public front doors (`README.md`, `SETUP.md`, `docs/overview.md`, `docs/usage.md`) as an explicitly marked, bounded reader aid. A design-phase specification artifact is neither. Note the contrast with `po-input-2026-08-28.md:17`, which handles the same situation correctly by glossing English-first (`bycatch ("Beifang")`).
- **Risk:** a fresh agent or non-German reader cannot resolve the term at the exact point where the document states its answer to PO question 3. Severity **minor**.
- **Evidence:** `specs/sprint-alfred-epic/design/agent-first-architecture.md:259`; `docs/adr/0011-language-policy.md:16-17`.
- **Spec-ref:** ADR-0011; CLAUDE.md language rule.

---

## 2. Deliberately not flagged (examined and found in order)

1. **Spec fidelity — the four PO questions.** All four are answered at depth: Q1 by §2 (nine properties, each with definition, agent-specific rationale, first-increment evidence class), Q2 by §4 (five mechanisms), Q3 by §3 (estate table + bounded reading order + enforced freshness), Q4 by §5 (derived-views principle, PO decision surfaces, optimization loop). Directive 2 (Track D as centre of gravity, A/B/C as substructure) is executed explicitly at `agent-first-architecture.md:370-378` and `gap-analysis-2026-08-28.md:161-172`.
2. **Scope.** Four files touched, all declared in the commit message; all inside `specs/sprint-alfred-epic/`. PRD and `spec.md` deliberately untouched — *considered as a candidate and dropped*: the deferral is disclosed in three places (commit message, doctrine §8, gap-analysis §D) with a named route, and Directive 1 speaks of "the design's own text", which the doctrine is. This is a disclosed sequencing decision for the PO to accept or reject, not a silent deviation.
3. **Trajectory / claim verification.** Sampled the audit's verdicts against the real files: `spec.md:439` ("the nine #104 property classes" — confirms *name-only*), `spec.md:420` ("per #99 §4 conflict table" — confirms *content by reference*), `spec.md:470` (#106 invariant "exactly #106's" — confirms *best-absorbed*), `prd:58` ("Meanwhile, the architecture half…" — confirms §A's inverted-emphasis claim verbatim), `prd:194/197` (name-bullets), and the absence of any contract-field-list or Critic-semantic-conformance content in `spec.md`, PRD and `acceptance.md`. Every sampled verdict held.
4. **Counts and verbatim groundings.** Nine issue bodies in the snapshot; five #99 significance axes; seven-case #99 conflict table; seven decision-skill capabilities; ten #104 fixtures; ten #106 evaluated classes, all ten present in the §2.10 mapping table with no orphan row. The "#104 Problem, verbatim" quotation at §1 P1 matches `issues-snapshot:491`.
5. **Test / acceptance integrity.** No acceptance criterion is weakened; the `acceptance.md` additions listed at `gap-analysis:154-159` are strictly additive (semantic-conformance fixture, anti-fragmentation fixture, parity, map-currency).
6. **Guardrails / directory contract.** ADR-0063: `specs/<safe-feature-id>/` is a named tracked kind (`0063:45`) and `specs/*/evidence/` a named citation target (`:47`); all four files are inside it.
7. **Security surface.** No secrets, no machine-specific absolute paths, no organization coordinates or account identifiers in the three documents.
8. **QG-06 (documented-instead-of-fixed).** No gap is "mitigated" by an undated note: the deferrals present (`armed post-C1`, `until A1 proves subagent-side interception`) are condition-bound to named work packages, and QG-06 governs gate modes, not design prose.
9. **Dependency reality check.** The external references the doctrine introduces trace to exact named sources in the package's own research document: OKF → `GoogleCloudPlatform/knowledge-catalog` (`okf/SPEC.md`) at `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md` plus the Google Cloud blog entry, and AGENTS.md/AAIF to three cited URLs (`external-research.md:94-100`). Version string "v0.1" is consistent between `agent-first-architecture.md:216` and `external-research.md:21`. Honest limitation: this lane performs no network access, so I confirmed the references are exactly named and pinnable, not that the remote resolves today.
10. **Numeric claims.** The dogfood figures "~60-script/471-suite" (`agent-first-architecture.md:474`) are package-established, not invented here — `spec.md:513` already carries them.

Also dropped: `design-authoring-record.json:8` still carries `"date": "2026-08-27"` while the record now covers a 2026-08-28 wave — bookkeeping noise with no anchor in a schema or guardrail, and `declaredFacts[3]` dates the wave correctly.

## 3. Trajectory check

**consistent, with one exception.** The gap analysis's coverage verdicts match the actual referenced files on every point I sampled (§2 rubric item 3 above), the doctrine's issue groundings match the snapshot text where it claims verbatim (with F1 as the one falsified verbatim claim), and the commit's file list matches what the documents declare they deliver. The exception is F3: the snapshot-currency claim asserts a check that left no artifact and cannot be reconstructed from the snapshot's own fields. One further claim is **not verifiable within my input boundary by design**: `gap-analysis-2026-08-28.md:113-116` cites the "verified acknowledge → submit → reopen → edit → resubmit sequence recorded in `docs/state.md`"; state/history is outside the Critic input contract and was deliberately not read.

## 4. Briefing violations observed

**None.** The dispatch supplied references only, with no implementor rationale, no completion-report prose, no expected conclusion and no prior verdict. Disclosures rather than violations: the auto-injected CLAUDE.md/git-snapshot/memory context named above, the pre-existing scratch directories named above, and the unavailable notes persistence explained in the header.

## 5. Verdict

**FAIL** — rework required on F1 and F2.

Both identities are resolved in this report's own header: ruleset `0.6.0+claude.20260827211222.562aadb` (concrete, loaded) and candidate `2c867ea9` (concrete, diff constructed and reviewed here), so a binary verdict is admissible. The doctrine is substantively strong — it answers all four PO questions at depth and the audit behind it is accurate where I could test it — but the rework's single test is whether elementary requirements now live in the design's own text, and two of them do not: one field is dropped from a list that declares itself verbatim (F1), and an eleven-item requirement the package's own audit marked **missing** is neither absorbed nor routed for absorption (F2). Both are additive fixes; F3–F5 are minor and can travel with them.
