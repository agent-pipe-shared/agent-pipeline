# T10 design review, round 1 (ADR-0085 initial review)

Reviewer: fresh read-only Critic, runner claude, requested route claude-sonnet-5-5 at max, effective identity claude-sonnet-5-5 (from the dispatch's own runtime prompt).
Briefing: `specs/sprint-alfred-epic/implementation/claude-2026-10-12/critic/T10-design-review.md` (commit 9ffccb323).
Review object: commits 4007afcd5, 12bb3fb1c (spec §23 register and the PRD technical-spec marker).
Persistence: the Critic's `critic-notes.md` was refused (`DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-partial-held`); this file is the Elephant's verbatim persistence of the returned report text.

**Verdict: FAIL (pass=false)** on the examined material; partial review at the 80 % checkpoint (guard count 28/30). Not reached items are listed at the end.

## Findings

### T10-F1 (major) — 18 rows have no item-file Evidence; 12 of them cite an artifact that records the original as unresolved
- Gap: `spec.md:2993-2994` says each row's own original acceptance remains authoritative. For these rows no artifact in the review set locates that text, and §23 neither marks them nor names an owner or due date for resolving them.
- Risk: the approval-bound criterion has no checkable content for these rows, so admission either blocks without a stated repair or passes vacuously. A known gap documented only inside evidence JSON, without owner or expiry, is a QG-06 finding.
- Evidence: rows AC-109, 122, 134, 140, 146, 153, 154, 166, 187, 190, 200, 202, 204, 211, 232, 233, 249, 251 cite `specs/sprint-alfred-epic/evidence/checkpoint-2026-10-12/portable-original-requirements.json`. In that file, 12 items carry `"publicOriginalAssociation": "unresolved"` (AC-109, 122, 140, 146, 153, 166, 187, 190, 204, 211, 232, 233). AC-134 and AC-154 cite a public file whose hash differs from `declaredOriginalHashes` ("equality not inferred from path"). `holds[0]` (line 2132): "A public counterpart does not silently replace differing approved original/addendum bindings".
- Spec-ref: §23 intro; QG-06.

### T10-F2 (major) — rows with an approved-prefix binding point at text short of the full approved acceptance
- Gap: §23 does not say whether a row's original acceptance includes the normative suffix the portable artifact records, or which text wins where the public file differs from the approved original.
- Risk: admission following the row's Evidence verifies the public file only and silently drops finite additional acceptance the same artifact says must not be stripped.
- Evidence: portable JSON `approvedPrefixAssociations` (from line 1728); `holds[1]` (line 2133): seven exact approved prefixes. AC-123: 990 B suffix at byteRange [1413, 2403], classified `"normative-finite-additional-acceptance-not-pure-status-editorial"` (lines 1739-1747), outside the cited file. AC-175: public file sha256 `3b98d882…` 2402 B vs approved original `c5da98d4…` 3470 B plus a 1057 B normative suffix (lines 1812-1829). AC-146: canonical public path `"available": false`.
- Spec-ref: `spec.md:2993-2994`; portable JSON `holds[0]`, `holds[1]`.

### T10-F3 (minor) — population and Evidence semantics are cited, not defined
- Gap: (a) "One row per original Alfred delivery item (174)" is not defined; §1 (`spec.md:10-14`) names the live `sprint: alfred` assignment as membership, and no rule covers later additions, closures or moves. (b) The Evidence column holds each criterion's source, while `acceptance.md:3-5` defines Evidence as the artifact or suite that proves the criterion.
- Risk: a reader or gate can treat existence of the cited file as proof, and there is no membership rule for later changes. Wording fix only.
- Spec-ref: ADR-0085; `acceptance.md:3-5`; `spec.md:10-14`.

## Deliberately not flagged
PRD marker equals the spec digest `31d4ed08…`; scope is exactly `spec.md` and the one PRD marker line; 174 rows AC-101..AC-274, ascending, contiguous, disjoint from AC-1..AC-37 and IR-1..IR-4; criterion cells are parser-compatible (`critic-accepted-contract.mjs` lines 136, 148, 220, 225, 273); locator offsets reproduce; trailers are `Dispatch: stage-0 (elephant)` and `AI-Assisted: true` only, docs-only commits; English, repo-relative paths, no secrets, no dependency, no test touched; both cited artifacts are tracked.

## Trajectory
Consistent for the claims that exist (spec digest, PRD marker and locator offsets reproduce independently). The claims record carries no command or exit-code data.

## Briefing violations
None in the dispatch text.

## Not reached
Existence of the 156 cited `backlog/items/*.md` paths; mechanical slug-equals-path check; comparison with the live `sprint: alfred` set; portable JSON lines 1830-2054 and several entry bodies; full `critic-accepted-contract.mjs`; `guardrails/quality-gates.md`, `roles/elephant.md`, ADR-0011, ADR-0063, `project/pipeline.json`; companion sources.
