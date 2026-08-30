---
schema: pipeline.backlog-item.v1
id: pipeline.prd-spec-content-language-can-drift-mid-authoring-undetected
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-30
closure_repository: self
closure_commit: 7d299c569c8f1fa34e48bb745830655412ceaec7
closure_evidence: templates/prd.md
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- PO live, 2026-08-30: Codex/Claude can switch human-facing language mid-PRD/Spec-authoring (e.g. start German, drift to English), and no code path detects this against the expected po-language value; every such drift forces expensive repair. PO wants a cheap first fix (document the requirement explicitly in the template) before considering a heavier content-language-detection mechanism."
source: "PO live session 2026-08-30, clarifying that backlog item 2026-08-28-onboarding-produces-drift-it-then-has-to-repair.md (closed) does NOT cover this -- that item only checks a metadata marker (po-language field) against a profile receipt, never the actual prose language of PRD/Spec content."
---

# PRD/Spec content language can drift mid-authoring, undetected until repair is expensive

## What happened

The closed item `2026-08-28-onboarding-produces-drift-it-then-has-to-repair.md`
tests exactly one thing: whether the `po-language` marker (a single metadata
field, set once at onboarding intake) stays consistent with the profile
receipt across onboarding paths (kickoff, promotion, coordinator path). Four
real tests prove marker consistency -- not document content.

The PO's actual concern, raised live 2026-08-30, is different: an AI runner
(Codex or Claude) can switch the ACTUAL PROSE LANGUAGE of the PRD/Spec it is
authoring partway through -- e.g. start writing in German (the project's
configured `po-language`) and drift into English mid-document. No code path
compares the actual written content's language against the expected
`po-language` value; only the metadata marker is checked. Every real
occurrence of this drift is discovered late and forces expensive manual
repair, per the PO's own framing ("das driftet jedes Mal die Pipeline und
fordert viel Reparatur").

## Proposal (PO explicitly wants the cheap route tried first)

1. **Cheapest first fix**: make the language requirement explicit and
   impossible to miss in the PRD/Spec authoring template itself (e.g. a
   loud, top-of-file instruction naming the exact required language,
   possibly repeated at natural drift points in a long document) -- before
   building any detection mechanism. Measure whether this alone reduces the
   drift rate before adding cost.
2. If the template-level fix is insufficient, consider a lightweight content
   language check as part of the readiness/quality gate before PRD/Spec
   promotion -- likely the same gate location that already reads
   `technical-spec-sha256`/`po-language` marker fields, but checking the
   actual document body instead of only a metadata field. Keep it cheap: a
   heuristic signal (e.g. stopword-ratio language detection) is sufficient;
   this does not need a full NLP language classifier.

## Related

- `2026-08-28-onboarding-produces-drift-it-then-has-to-repair.md` (closed) --
  covers marker consistency only, explicitly does NOT cover this scenario.
- The PO separately referenced existing findings about PRD/Spec submission
  immutability ("nicht zu früh einreichen, weil man danach nicht mehr
  ändern darf") as related context. A backlog search on 2026-08-30 found no
  existing item matching that description -- flagged back to the PO for
  confirmation of where that lives, not invented here.

## Closed, 2026-08-30 (NVA-CF-LANGTEMPLATE)

Commit `7d299c56` implemented the Proposal's step-1 cheap fix: a loud,
explicit warning against mid-document human-facing-language drift, added
next to the existing language guidance in `templates/prd.md`,
`templates/spec.md`, and both mirrored kickoff-prompt pairs
(`templates/prompts/{kickoff-new-project,elephant-kickoff}.md` and their
`plugins/pipeline-core/templates/prompts/` copies). Independently
re-verified by the Elephant: `node --test harness/scripts/check-consumer-safe-paths.test.mjs`
-- 9/9 pass; diff confirmed limited to exactly the 6 named files.

Step 2 (a lightweight content-language detection gate) is explicitly NOT
built here, per the Proposal's own "measure whether this alone reduces the
drift rate before adding cost" instruction and the PO's explicit request for
the cheap route first. Closing on the landed cheap fix rather than leaving
this open pending a drift-rate measurement that can only happen through
future PRD/Spec authoring sessions -- if drift recurs after this fix, file
a fresh item for the heavier detection mechanism rather than reopening this
one (ledger append-only discipline).

## Triage

- **Decision:** accepted, Nova A, PO-raised live 2026-08-30, marked important
- **Rationale:** direct PO escalation; distinct from the already-closed
  marker-consistency item; cheap first mitigation available (template fix)
  before any heavier mechanism is justified
- **Date:** 2026-08-30
