---
schema: pipeline.backlog-item.v1
id: pipeline.doc-reconciliation-blind-to-adr-corpus-changes
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Raised as an unverified observation by an independent review of a commit range; the review explicitly did not build a repro. Confirmed at source under dispatch PHX-BL2 (2026-08-09): read all five `**Governs:**` lines in docs/adr/ and the paths touched by the 2026-08-09 ADR-0047 renumber commit (88a7133)."
due: 2026-09-08
---

# The reconciliation layer is blind to the event that motivated it

## Description

`harness/scripts/check-doc-reconciliation.mjs` implicates a decision record
when a changed path matches one of that record's `**Governs:**` globs. No
`**Governs:**` line anywhere in the corpus names a path under `docs/adr/`
itself. So a change that renames, renumbers, or otherwise edits the ADR
corpus — the exact class of event that motivated building this check —
implicates nothing, and the reconciliation check reports the range clean even
though the ADR corpus itself just changed underneath it.

## Triggering situation

Raised as an unverified observation by an independent review of a commit
range; that review explicitly did not build a repro. Verified at source under
dispatch PHX-BL2 (2026-08-09), two independent checks, both confirming the
premise:

1. Every `**Governs:**` line in the corpus, quoted in full (five total, `rg
   'Governs:' docs/adr/`):
   - `docs/adr/0012-handover-canonicalization.md:9`: `**Governs:**
     docs/state.md`
   - `docs/adr/0040-advisor-consent-and-readonly-bash.md:5`: `**Governs:**
     pipeline.user.yaml, setup.mjs, setup.test.mjs`
   - `docs/adr/0045-canonical-artifact-topology.md:5`: `**Governs:**
     specs/**`
   - `docs/adr/0056-push-approval-mode.md:10`: `**Governs:**
     pipeline.user.yaml, project/critical-human-proof.json,
     project/pipeline-state.json, plugins/pipeline-core/hooks/guard-push.mjs`
   - `docs/adr/0058-guard-maintenance-window.md:14`: `**Governs:**
     plugins/pipeline-core/hooks/guard-gate-strength.mjs,
     plugins/pipeline-core/hooks/guard-testpath.mjs,
     plugins/pipeline-core/lib/human-guard-override.mjs,
     plugins/pipeline-core/lib/po-approval-proof.mjs,
     plugins/pipeline-core/lib/tool-write-target.mjs,
     plugins/pipeline-core/hooks/guard-command-grammar.mjs,
     plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs,
     plugins/pipeline-core/hooks/hooks.json,
     docs/human-guard-override-threat-model.md,
     docs/po-approval-proof-contract.md`

   None of the five matches a path under `docs/adr/`.

2. The commit that renumbered three ADRs all claiming 0047 into 0047, 0061
   and 0062 (`git show --stat 88a7133`, subject "fix(adr): give the three
   ADRs numbered 0047 real numbers, and move two records to the code",
   2026-08-09) shows paths under `docs/adr/` among its 12 changed files,
   including two renames
   (`docs/adr/0047-*.md` -> `docs/adr/0061-local-supervisor-state-authority.md`
   and `docs/adr/0061-*.md` -> `docs/adr/0062-governance-event-kernel.md`)
   and edits to `docs/adr/0038-*.md`, `docs/adr/0040-*.md`,
   `docs/adr/0048-*.md`, and `docs/adr/README.md`.

Given (1) and (2) together: had this check been run over that exact range, it
would have implicated zero ADRs — the renumber itself is invisible to the
mechanism this check exists to enforce.

## Affected artifact

`harness/scripts/check-doc-reconciliation.mjs` (the mechanism); the
`**Governs:**` annotations across `docs/adr/` (the data the mechanism reads;
none currently covers `docs/adr/` itself).

## Proposal

Not a fix — a question for the PO, with the tension named honestly on both
sides:

Should a decision record govern *itself*, i.e. is `**Governs:**
docs/adr/<own-file>` (or a corpus-wide `**Governs:** docs/adr/**` line
somewhere) a meaningful annotation, or does it make every ADR edit
self-implicating and therefore noise? The check's entire value proposition is
that it *reports* rather than *guesses* — an annotation that fires on every
edit to its own file (a typo fix, a status-line update, a supersession note)
would produce a green-then-red-then-green churn nobody reads, which is the
same "unusable on day one" failure the module header already names as the
reason an ADR without any `**Governs:**` line is counted but never enforced.
A narrower alternative — governing only structural corpus events (renumber,
rename, split, supersession) rather than every edit — would need its own
detection mechanism, since `**Governs:**` globs currently match changed
*paths*, and a rename shows up as two path changes with no semantic marker
distinguishing it from an unrelated add+delete.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
