# T10 design review, round 2 (ADR-0085 delta follow-up)

Reviewer: fresh read-only Critic, runner claude, requested route claude-sonnet-5-5 at max, effective identity claude-sonnet-5-5 (from the dispatch's own runtime prompt).
Review object: commits 9ffccb323, 5d1fa3618, e2233e026 (base 12bb3fb1c), restricted to `specs/sprint-alfred-epic/spec.md` and `specs/sprint-alfred-epic/prd_sprint-alfred-epic.md`; correction bindings `specs/sprint-alfred-epic/implementation/claude-2026-10-12/critic/T10-delta-bindings.json` (commit d2e0fb2d6).
Persistence: the Critic's `critic-notes.md` was refused (`DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-partial-held`); this file is the Elephant's persistence of the returned report. Hand-back at the 80 % checkpoint (36 of 45).

**Verdict: PASS on the examined scope** (`pass: true`), with one surviving minor finding. Items under "Not reached" are not cleared.

## Finding

### T10-D1 (minor): the locator claims record is bound to the superseded Spec digest
- Gap: `specs/sprint-alfred-epic/implementation/claude-2026-10-12/item-register-locators.json` binds `candidateSpecSha256` 31d4ed08…, while the reviewed head Spec is 6c0840cd218f4207f52bdd03bdaec4401a2937e539ffd8650fcda57cf0b85ab6; the delta inserts 25 lines before the register table, so all 174 byte ranges shift. The record carries no command, exit code or timestamp.
- Risk: a consumer locating criteria by these ranges would mis-locate or must fail closed. Not in the ADR-0085 bound set; no Spec content defect.
- Evidence: locators:2, 7-8, 1218-1219; PRD hunk; sha256(spec.md) = 6c0840cd….
- Spec-ref: acceptance.md:3-5; spec.md:31-34.

## Provisions verified (delta)
- PRD marker equals sha256 of the head Spec.
- Population: 174 register rows; manifest `currentMatrix.rows: 174`; consistent with §1, PRD and acceptance.md AC-13.
- Evidence column: consistent with acceptance.md:3-5.
- Authoritative text: `holds[0]`, `holds[1]` exist; seven normative-suffix objects in `approvedPrefixAssociations`.
- Unresolved originals: exactly 12 `unresolved` entries map one-to-one onto AC-109, 122, 140, 146, 153, 166, 187, 190, 204, 211, 232, 233; AC-134 and AC-154 digests differ as claimed; 14 rows; owner, due date 2026-10-19 and default outcome present (QG-06 satisfied).

## Prior finding IDs
The ID-only registry did not let the Critic map T10-F1..F3 to their gaps; it reports per-provision verification instead. Coordinator reconciliation: T10-F1 is addressed by the "Unresolved originals" and "Authoritative text" provisions, T10-F2 by "Authoritative text", T10-F3 by "Population" and "Evidence column"; each provision was verified by the Critic above.

## Disposition of T10-D1
The locator record is a preparation artifact, not an approval input. It is regenerated against the approved Spec bytes when the v3 item prompts are rebuilt after approval, and every prompt build re-parses its locator against the then-current `spec.md` (fail closed on mismatch). D1 stays listed as open in the round-2 receipt so the approval binding carries it.

## Not reached
Commit-trailer authorship of the three commits (a trailer query was refused by guard-push); roles/elephant.md, ADR-0011, critic-accepted-contract.mjs, project/pipeline.json, ADR-0063, on-disk CLAUDE.md; row-by-row manifest-to-register identity; companions design.md, traceability.md, design-input.md; unsampled ranges of the portable record and manifest.
