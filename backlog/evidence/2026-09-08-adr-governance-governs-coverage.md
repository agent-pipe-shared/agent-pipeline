# ADR governance Governs coverage

Task `NVA-B-ADR-GOVERNS-GOVERNANCE-4` adds bounded ownership declarations to
accepted ADR-0030, ADR-0032, and ADR-0034. The terminal parser and
body-preservation proof is
`scratch/NVA-B-ADR-GOVERNS-GOVERNANCE-4/governs-parser-body-and-vendored-check.txt`
(exit code 0).

## Vendored-canon correction

The follow-up generator check originally reported exactly five stale,
previously generated ADR copies: 0011, 0027, 0028, 0029, and 0032. The only
writer used was `node harness/scripts/generate-vendored-canon.mjs`; it wrote
exactly those five files, and the subsequent generator check passed. The
scoped checker also compares each generated copy byte-for-byte with its root
canonical origin.

The copies are present because the generator's explicit universal-ADR manifest
records their consumer-canon citations: ADR-0011 is cited by `guardrails/git`,
ADR-0027 by `guardrails/quality-gates` and `guardrails/security`, ADR-0028 and
ADR-0032 by `templates/prompts/kickoff-new-project`, and ADR-0029 by
`guardrails/security`. They are generated consumer copies, never independent
sources of truth.

The corrected ADR-0032 header names its canonical root prompt
`templates/prompts/kickoff-new-project.md`; the plugin path is its generated
consumer copy. Likewise ADR-0034 names `guardrails/deploy.md`, whose plugin
counterpart is generated canon. ADR-0030 retains the actual Critic skill and
preflight readers. Although its decision text names `pipeline-start`, the
current `skills/pipeline-start/SKILL.md` delegates to
`scripts/pipeline-start-preflight.mjs`, and neither reads
`governance.guidelines_path` or `governance.policies_path`; it is therefore not
declared as a current direct governance reader.

Refreshing the canonical ADR-0028 copy exposed its root `Governs` header's
`setup.mjs` target. This is reconciliation metadata inherited byte-identically
from the canonical ADR, not a consumer command. The consumer-safe-path checker
now has one exact file-and-entire-header-line vendored-canon allowance using
its existing Class B helper. It does not create a file-, prefix-, or
whole-directory exception: the retained scratch negative appends a separate
`setup.mjs` consumer instruction to the same ADR and proves the scanner rejects
it. The actual checker and its focused suite, including the stale-allowlist
regression, are green.

The final scope includes checker allowlist data. The earlier documentation-only
Critic-skip declaration was removed from the dispatch record; candidate-wide
independent review remains pending. No completed Critic review is claimed here.

The check uses the read-only status classifier already established in
`scratch/NVA-B-ADR-COVERAGE-STATUS-2/inventory.mjs`: only text before
`DE-REFERENCE-BELOW` is normative; it uses the inline `Status` value before a
`## Status` section, and classifies accepted, historical/superseded,
provisional, and proposed values. On the current tree it finds 80 numeric ADRs:
75 accepted, 3 historical, 1 provisional, 1 proposed, and 0 ambiguous. Of the
75 accepted ADRs, 25 now have Governs declarations. The historical
`source-hash-rows-final.json` snapshot remains a prior 19-header baseline; no
same-hash claim is made for the current three-header change.

The parser also verifies every declaration exactly, requires each named path to
be tracked, permits only the narrow `governance/examples/**` owned-directory
glob and requires all of its matches to be nonempty, and compares each ADR to
`HEAD` after stripping only the inserted header.

## ADR-0030

ADR-0030 governs the checked-in governance examples as one owned fixture
directory, the Critic skill and dispatch preflight that apply its review
boundary, and the security scan with its direct contract test. The examples
express policy precedence and the named scripts enforce or test the documented
governance responsibilities. User and managed settings are external/runtime
configuration rather than tracked implementation targets of this ADR, so no
directory glob is claimed for them.

## ADR-0032

ADR-0032 governs the release-manifest and architecture templates, the new
project kickoff prompt that presents that documentation structure, and the
license/SBOM lifecycle implementation and direct tests. The security scan and
its test connect the declared license inventory to the baseline security
evidence. Generated adopter documentation remains outside this source
repository, so the header names templates and implementation paths rather than
inventing a glob for consumer output.

## ADR-0034

ADR-0034 governs the manifest loader, deploy-policy and policy-lock schemas,
the push guard and direct test, policy/risks/lock examples, the risks template,
and the deploy guardrail. Together these implement and check the project versus
central-policy precedence and its documented defense-in-depth boundary. Hosted
server controls are intentionally omitted: they are deployment-environment
controls, not tracked source paths. The current policy-lock schema and example
are named as the tracked successor to the ADR's original mutable discovery-path
description; the decision text itself was not modernized.
