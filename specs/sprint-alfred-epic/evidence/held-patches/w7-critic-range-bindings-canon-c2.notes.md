# Held patch w7-critic-range-bindings-canon-c2 (slice C2, stacked on C1)

Cause: the Critic canon admitted exclusion bindings only for a retained prior result or a finding-disposition record and named no command that derives them, so a range with the state or handover files could not be briefed admissibly (recon note CRITIC-RANGE-BINDINGS-RECON-2026-10-28.md; recon lines re-verified against the clone, no contradiction).

Stacking: the patch is the diff against baseline = candidate 96af096d2 plus scratch/agent-out/compose/bundle.patch (C1). It applies after C1.

## Changed lines (7 files, all in the patch)

- templates/prompts/critic-review.md and plugins/pipeline-core/templates/prompts/critic-review.md (identical edits, byte-identical before and after, compared from Node): line ~139 paragraph names project-state records and the derive command; the Correction input bindings field lists the third role and gains a paragraph (command, schema pipeline.critic-correction-input-bindings.v1, admissibility only for the calibration handover/state file and pipeline-handover*.md in its directory, exclusion binding only, forbidden-material rule NOT relaxed, unknown role / CCI-MIXED / missing bindings still stop the review).
- harness/review-protocol.md section 2.2: role list extended, one added paragraph in protocol voice (command derives, Critic verifies, mixed still rejected).
- roles/critic.md Forbidden material bullet: one added sentence (binding, not readable material).
- plugins/pipeline-core/skills/critic-review/SKILL.md: operator note after the "no handover, no history" line.
- docs/adr/0014-critic-contract.md: amendment 2026-10-28 (context, decision, consequences) before "## Consequences". No ADR index lists amendments (not checked beyond ADR file; no index line added).
- plugins/pipeline-core/lib/pins/opus-critic-only-batched-for-architecture-and-security.test.mjs: one new case "CCI canon names the project-state record role and the derive command in both template copies, the protocol, the role and the skill".

No file here has German text edited; the German reference part below DE-REFERENCE-BELOW markers was not touched or read.

## Tests

- RED (stacked baseline plus new case, before edits): pass 15, fail 1, failing name = the new CCI case.
- GREEN (clone, after edits): tests 16, pass 16, fail 0.
- Clone2 (unchanged stacked baseline, no new case): tests 15, pass 15, fail 0. Failing-name sets: empty in both; the only difference is the new case.
- Apply check in clone2: git apply --check of the patch, exit 0.
- No VCR01 top-level count entry exists for this pin file in check-verify-case-completion.test.mjs, so no number changed.

## NOT done

- check-verify-case-completion.test.mjs and other template/protocol-quoting suites were not run (budget); only the whole pin file ran. The existing recritic template-block pin passed.
- Preflight refusal (C3), full Verify, independent Critic review (parent-owned batch gate), PO acceptance.

## Proposed commit message

docs(critic): name the project-state record role and the bindings command in the Critic canon

## Operator flow

Apply C1 bundle first, then this patch (git apply), git add -u with a path limit to the seven files, commit with --no-verify as the held-patch flow does, stamp, install.

## Protected-path classification

None of the seven files matches a TP-1..TP-13 pattern; no ceremony needed.
