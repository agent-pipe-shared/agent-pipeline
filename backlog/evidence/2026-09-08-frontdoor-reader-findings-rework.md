# Front-door reader findings: implementation disposition

This record maps the round-1 reader findings to the D3 front-door rewrite. It
is implementation evidence, not input to the separately parent-owned blind
reader review.

## Sources and boundary

- Reader findings: `backlog/evidence/2026-09-06-doc-reader-review-round1.md`
  (R1–R10).
- Capability inventory: commit
  `8f08381f149ee1b188ec5bd1a4b85a28d03df74b`.
- Audit, security, and measurement references: commit
  `1e7bb527d550874bf70de22f38ccd1c30d085ecb`.
- Enforcement wording was read from `docs/enforcement.md`; its rendered
  reference content is not changed by this package.

The six owned front-door documents are the mapping boundary. Inventory targets
remain `pending`; this package adds substantive target anchors and markers but
does not assert the inventory's required independent-review receipt.

## Line-based source mapping

The reader review identifies the implementation findings at lines 73 (R1), 93
(R2), 113 (R3), 128 (R4), 142 (R5), 153 (R6), 167 (R7), 177 (R8), 193 (R9),
and 206 (R10). The settled inventory source is pinned above by full commit
hash, as are the audit/security/cost reference pages. This record deliberately
does not create a new source authority or a review receipt.

## Disposition

| Finding | Source-grounded change | Status |
| --- | --- | --- |
| R1 | README, overview, setup, usage, and the map now state the candidate-bound evidence/audit-artifact path and link `docs/audit-and-evidence.md`. | Addressed |
| R2 | README opens with audience, inspectable outcome, cost boundary, problem, and value before release/source-maintainer detail. | Addressed |
| R3 | The first screen removes unexplained Phoenix/Nova/Driver status prose; release detail is no longer the product definition. | Addressed |
| R4 | The first screen addresses teams with audit obligations. Cost language reports measured limits and missing data rather than foregrounding hobby or throwaway use. | Addressed |
| R5 | Codex daemon material now lives in SETUP's troubleshooting section after the adoption flow. | Addressed |
| R6 | SETUP reduces optional Advisor detail to consent and a runtime-boundary link, while the front door describes configured guardrails and their limits. | Addressed |
| R7 | README places Quick start immediately after What you get and points routine adopters to SETUP. | Addressed |
| R8 | SETUP now leads with an explicit routine consumer-adoption route and labels source maintenance as occasional reference. The detailed legacy source section remains available. | Addressed |
| R9 | README and its German reference remove the obsolete Fable/Sol substitution prose; route selection is sourced to `pipeline.user.yaml` without a provider recommendation. | Addressed |
| R10 | README, overview, and usage defer to `docs/README.md` as the canonical next-document map. | Addressed |

## Open review items

- Run the language-canon and product-capability-inventory checks against the
  completed candidate. A passing inventory-phase check does not substitute for
  the pending independent-review attestation.
- Parent owns the final candidate gate, Critic, and a new blind reader review.
- No source page, inventory, checker, schema, routing authority, release, or
  effective-model attestation was changed here.

## Rework mapping — 2026-09-08

Parent review required a mirror and ordering correction after the first draft.
The current owned-document locations are README English lines 22–32 (scoped
`0.6.2`, evidence, and four-example cost boundary), 80 (Quick start), 268
(grouped operational controls), and 348 (runner boundary); the matching German
reference is at lines 404–414, 467, 658, and 688. SETUP now puts its routine
consumer section B at line 38 and its complete ordinary procedure at line 84,
before the occasional source-maintenance section A at line 345; exact consumer
procedures retain the stable
`#consumer-onboarding-details` anchor. The documentation map's scoped `0.6.2`
line is at line 7.

This rework preserves R1–R10's source-line mapping above. It removes the
unmirrored capability list, replaces it with five contextual capability groups
and a German counterpart, aligns runner wording with the documented
Claude/Codex/Antigravity boundaries, restores a non-promotional next-release
line, and removes the stray English close-lifecycle section below the German
marker.
