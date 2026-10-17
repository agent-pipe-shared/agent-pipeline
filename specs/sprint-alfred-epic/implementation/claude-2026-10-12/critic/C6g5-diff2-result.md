# C6g5 correction-DIFF review 2 of at most 3 — result (2026-10-17)

- Candidate: `e29da0cc4` (ALF-C-C6G5-CORR2). The commit touches 3 files, +124/-29.
- Route: claude-sonnet-5-5, observed in the dispatch's runtime prompt. Lane: functional-equivalent-read-only.
- Verdict: **PASS**. No blocker or major finding survived. PASS ends the review budget for C6g5.
- Critic run: `node --test` over the three evidence files gave 74 tests: 73 pass, 0 fail, 1 skip (DPT37, host symlink EPERM).
- Trajectory: consistent.
- Critic notes: `scratch/dispatch/critic-afd6dd23a074eebe2/critic-notes.md` (local).

## Prior findings

| ID | Status | Evidence |
|---|---|---|
| D1 major: the generator emitted the old section 6 | verified fixed | The generator now emits section 6 as committed (`generate-agent-obligations.mjs:257-276`); AC-2 and AC-2b are green |
| D2 major: the scan read only the label line | verified fixed | `dispatch-policy.mjs:184-239` reads the label line, its continuation lines and caret ranges; the pin fills the real template field |
| D3 minor: limits had no owner or due date | verified fixed | owner Coordinator, due 2026-10-31 |

## New finding

| ID | Severity | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F1 | minor | Section 6, as emitted by the generator and committed in the document, claims there are "three legitimate forms". It also claims that any other form is unbound and UNVERIFIABLE. GIT-03 and dispatch-authorship-verify admit and verify more forms: administrative, critic, elephant-generated and integration. | `generate-agent-obligations.mjs:257,277`; `templates/prompts/agent-obligations.md:167,187`; `guardrails/git.md:39,41`; `dispatch-authorship-verify.mjs:41-42,326-346,400-467` | open. The fix is wording only, in the generator and the regenerated document (plus the vendored copy). No further Critic review is possible after PASS, so the fix is self-verified with AC-2 and AC-2b. |

## Briefing deviations reported by the Critic

- The registry reference pointed at the prior result file, not at a neutral registry. Adjacent lines from the prior review were exposed but not used.
- The dispatch had no `Re-critic (MP-07): <prev>..<new>` line and no `Review ordinal` line, although the template requires both for a DIFF round (`critic-review.md:294-295`). As a result, the mechanical delta check was not engaged. The same gap is already on the PO topic list.
