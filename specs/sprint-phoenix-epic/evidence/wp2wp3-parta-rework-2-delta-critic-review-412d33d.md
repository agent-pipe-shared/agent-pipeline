# Delta Critic re-review: WP2-WP3-partA-rework-2 (F-A/F-C/F-D/F-B)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max. Effective model identity: unknown.
**Reviewed object:** enumerated commits `ac8bd06`, `4e1ac8a`, `627d053`, `412d33d`. **Base correction (Critic's own disclosure):** the dispatch named base `7aa84f0`, which admits two extra commits (`cedd58a`, `2c1add0`); the true parent of `ac8bd06` is `2c1add0`, so the reviewed diff is `2c1add0..412d33d`. Second dispatch-construction defect of this kind in a row — the Elephant must compute the base as `<first-enumerated-SHA>^`, not reuse the prior candidate.
**Verdict: FAIL** — 3 major, 1 minor.

## Findings

### F1 (major) — the new "this gap is tracked" citation resolves to a file that does not track it

The F-A fix asserts three times (`…freshness.md:110-112`, `:394-395`, `:475-477`) that the newly disclosed non-git-topology gap is tracked in `backlog/items/2026-08-07-self-application-integrity-check-absent.md`. That item records the *original* 0.5.2 merge-loss gap Part A closes, not the residual of how F2 was resolved; it is `status: in_progress`, its Triage log ends at "Design phase DONE — ready for implementation dispatch", and it contains zero occurrences of `F2`, `pluginRootHasSelfApplicationGit`, "flat-copy", or "non-git" (independently confirmed by the Elephant via `rg`). It was last modified at `7e8983f`, before the F2 fix existed.
**This is F-A's own defect class recurring one level over:** F-A was "the code's own citation pointed at a bullet that did not yet exist"; the remedy replaced a dangling *section* reference with a dangling *content* reference — one that resolves (so `check-doc-contracts.mjs`'s link check passes and cannot detect it) but whose target does not contain the claimed content. Consequence: the limitation F-A newly and correctly discloses has in reality **no owner, no next step, and no tracking item anywhere** — QG-06's "documented instead of fixed". The same dispatch demonstrably knew the correct pattern: for F-B it created a real backlog item with an explicit `**Owner: PO.**`.

### F2 (major) — the rescoping left §A.6 asserting the refuted premise, creating a new intra-document contradiction that misinforms an open PO decision

§A.6 was not touched and still states (`:416-421`) that a real marketplace-git install "preserves a `.git` directory … this is *assumed* to hold" — the exact opposite of the new §A.1/§A.5 text (`:106-108`, `:383-385`), which states as settled fact that the real installed topology has none. The stale premise carries four further anchors: `:51-52`, `:336-338`, `:440-441`, `:443-448`, all asserting an "every session, every project" blast radius.
**The contradiction is newly created by this diff** — before it, §A.1/§A.5/§A.7 and §A.6 were mutually consistent (all pre-F2). It is not cosmetic: §A.6:450-465 carries a **still-open PO question** framed as a choice weighing an "every-session-eligible bootstrap block … on a currently broad blast radius". After the F2 gate the attestation reaches only self-application/dev checkouts, so both that blast-radius premise and the "a config-gated rollout would be overkill" justification are false. A PO decision taken on §A.6 as written would be taken on refuted facts.

### F3 (major) — the design-document rework ran below the Design tier, undisclosed, breaching the commitment this same document makes

`.git/dispatch-record-WP2-WP3-partA-rework-2.json` records `"model": "claude-sonnet-5"` with no rationale. Commit `ac8bd06` reworks the design contract by 62 changed lines (rescoped §A.1 guarantee, new disclosed-limitation paragraph, §A.5 case split, new §A.7 entry) — design-contract authorship, not a typo pass. The document's own binding rule at `:45-48`, added by the immediately preceding revision precisely to end this pattern: "the pattern ends here for design-phase authorship of this document going forward: **any further dispatch that authors or reworks this design is a design-phase step and is dispatched on the Design-tier model**" (independently confirmed by the Elephant). No disclosure paragraph was added, breaking the running convention maintained for the three prior below-tier dispatches.
Three compounding consequences: MP-22/MP-23 not met (MP-23's own "How to check" describes exactly this); the document now contains a claim ("the pattern ends here") falsified by its very next revision; and **F1 and F2 above are both defects in the design-contract text this below-tier dispatch authored** — a measured linkage, which is why this is graded major rather than the minor calibration the three prior disclosure-only gaps received.
**Elephant's own note: this is a dispatch-construction error by the Elephant, not a Goldfish fault** — the briefing itself specified `claude-sonnet-5 / xhigh` and the Goldfish followed it.

### F4 (minor) — the diff falsifies the design document's own "design-only" claims

`:368` states "None of these three files is touched by this design-document revision itself", and the header at `:3-4` claims "DESIGN ONLY — no `.mjs`/`.json`/`.yaml` file was changed to produce this document". Commit `ac8bd06` touched `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` (5 lines, comment-only). Low operational consequence, but a stale self-describing status claim in the artifact whose entire rework was about stale claims.

## Per-finding resolution status

- **F-A (major) — NOT resolved.** §A.5 case 2 and §A.7's new entry do now match the shipped F2 code, and the code comment's citation resolves — that part is genuinely fixed. But the remedy introduced two new defects inside F-A's own remit: the hollow "tracked gap" cross-reference (F1) and the §A.6 contradiction (F2).
- **F-C (minor) — resolved.** `realpathSync` applied to the `mkdtempSync` root before any consumer, correctly defeating `physicalDirectory()`'s fail-closed at `public-core-observation.mjs:80`. No assertion weakened; the suite's other two tmp roots are correctly unaffected (deliberately no-`.git` fixtures the observer never reaches).
- **F-D (minor) — resolved.** The equivalence overclaim is gone; every load-bearing replacement claim verifies against `public-core-observation.mjs:87-97`. Two dropped micro-imprecisions, neither consequential.
- **F-B (minor) — disposition defensible.** No guard change attempted, matching the dispatch's scope and the prior review's "kept minor" framing. The item satisfies QG-06 on substance: named decision-owner (PO), concrete next step, two disclosed candidate directions rather than a pre-selected one, and an accurate technical description verified against `guard-gate-strength.mjs:51-98` and `:113-116`. Deferring a guard change that needs a constant-extraction refactor to a PO scoping decision is the right call, not an evasion.

## Deliberately not flagged

Scope (exactly the required file list; `docs/state.md` correctly outside the enumerated four), **F2 gating logic untouched — verified byte-identical** (`pipeline-start-preflight.mjs:205` and its call site `:274`; the only executable line changed anywhere is the test fixture's `realpathSync` wrap), authorship (all four commits carry the correct trailers + dispatch record — no EL-01/EL-16 violation), test integrity (3 hunks, no assertion changed/deleted/skipped/weakened; `rg -c "^test\("` = 32, matching the artifact's 32/32), F-C completeness (the other two `mkdtempSync` roots are no-`.git` fixtures the observer never reaches), §A.5 case split vs. real branches (matches the code; the `!version` third path is already named in §A.5 case 3), F-B backlog item quality against QG-06 (cleared on substance, factual claims verified), guardrails (Conventional Commits, one concern per commit, no push/history rewrite, no machine-specific absolute path), security (no secrets, no injection surface, no gate behavior change), dependencies (one new import, `realpathSync` from `node:fs`, a Node builtin), ADR-0011 language (all new text English, all artifacts agent-facing).

## Trajectory check

**Consistent.** The evidence artifact binds candidate `412d33d` exactly, carries the QG-03 honesty disclosure (Elephant-run, not `verify.mjs`) and names its uncovered surface. Both claimed checks are independently plausible from source (test count exactly 32; doc-contract links resolve). The dispatch record's `deviationsFromSpec` block discloses the revert-then-reapply staging and the `-F <file>` commit mechanism; the stated outcome was verified directly — four atomic commits, correct trailer block, one concern each.
**Material caveat bounding the verdict:** the green `check-doc-contracts.mjs` result is a *link-existence* check only. It cannot detect F1, where the link resolves but the target's content contradicts the citing claim. The evidence set therefore does not, and cannot, corroborate the F-A fix's central assertion.

## Briefing violations

**None** on the input-boundary contract — references only, genuinely neutral findings registry, no implementor rationale/prior-verdict prose/expectation smuggled in; the prior full review was not opened beyond confirming it exists as a reference target.
One non-boundary defect recorded: the dispatch's stated base `7aa84f0` does not bound the enumerated SHA set (silently admits `cedd58a` and `2c1add0`). The dispatch's own fallback instruction is what saved it.
One environment note: `mkdir` of a fresh scratchpad subdirectory was refused by `guard-lifecycle-ready.mjs` (`GUARD-CROSS-REPO-MUTATION`); no file-based evidence was built, every claim is from read-only commands.
