# Commit signature diagnostic handoff

Base commit: `dbaa242bbff4403980a58f8394a0bfada3b00b12`.
Exact staged patch: `scratch/agent-out/commit-signature-diagnostic/staged.patch`.
This is an export of the staged two-path diff; no clone commit was made.

## 1. DoD results

- **Passed:** Same protected Source commit remains refused; diagnostic reports `HGO-AUTHOR-ROOT-REQUIRED`, `authorCandidate`, and the commit adapter's missing Source-root selection. It confirms no commit-scope request directory was seeded.
- **Passed:** Sensitive hard-boundary refusal remains `PB-COMMIT-OVERRIDE-NONOVERRIDABLE` and preserves `HGO-NONOVERRIDABLE-PATH`.
- **Passed:** Existing ordinary unprotected commit succeeds.
- **Not verifiable:** Other hard HGO codes and exceptional eligibility failures were not separately exercised. Classification preserves their returned code; thrown/unclassified probes are reported as eligibility unavailable without claiming a path prohibition.
- Source eligibility, selected roots, authorization, seeding, and signature requirements were not changed.

## 2. Evidence artifacts

- Original implementation RED, 1 test failed because the output collapsed to generic NONOVERRIDABLE and omitted HGO's root-required cause: `scratch/commit-signature-diagnostic-clone/scratch/commit-signature-original-red.json`; captured command `node --test --test-name-pattern='Source author-root requirement' plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs`; exit 1.
- Final GREEN, 3 tests passed (Source-root refusal, hard refusal, ordinary unprotected commit): `scratch/commit-signature-diagnostic-clone/scratch/commit-signature-final-green.json`; captured command `node --test --test-name-pattern='Source author-root requirement|sensitive-path HGO hard refusal|staged NON-protected path is unaffected' plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs`; exit 0.
- `git diff --cached --check`; exit 0.
- There were five captured test invocations total: initial fixture RED (exit 1; path was a new, exempt first appearance), assertion-wording failure (exit 1), focused two-case GREEN (2/2), original-logic RED (1 expected failure), and final GREEN (3/3). The first two were test-fixture corrections, not product findings.
- Exact compute/cost measurement is unavailable; no project resource measurement was supplied or run. The five test invocations are the count of captured test runs, not a claim about total tool calls or compute cost.

## 3. Changed files

- `plugins/pipeline-core/scripts/pre-commit-hook-install.mjs` — retain and classify HGO eligibility codes and candidate marker in the diagnostic.
- `plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs` — add generated-hook Source-root and hard-refusal regression cases.

## 4. Deliberately not changed

No HGO library, source eligibility rules, authority/root selection, automatic authorization, seed path, signature flow, policy, actual installed hook, main checkout files, or other owner's paths were changed. No source-free eligibility or normal commit behavior was modified.

## 5. Deviations

The briefing specified clone path `scratch/clones/commit-signature-diagnostic`. The clone was created at `scratch/commit-signature-diagnostic-clone` because the initial delegated instruction requested an owned new clone without giving the canonical path. This handoff and staged patch are inside that clone as requested by the follow-up. No source/test changes were made after the final GREEN run.

## 6. Open items

- `verify: pending` — parent-owned integrated verification remains outstanding.
- `independent review: pending` — no Critic/review was run in this slice.
- `manual/browser check: not applicable` — no interactive UI behavior is involved.
- `PO acceptance: open` — implementation handoff is not acceptance.
- A broader hard-refusal matrix and measured project resource-cost result remain unavailable and are not claimed.
