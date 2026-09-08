# Generated enforcement reference — 2026-09-08

## Scope

D3a adds a generated, source-registration reference at
[docs/enforcement.md](../../docs/enforcement.md). Its rows are derived from
the three current runner manifests; behavior limits are separately labelled as
maintained prose and link to the relevant native adapters.

## Reproducibility

The generator has explicit modes:

- Dry render: <code>node harness/scripts/generate-enforcement-doc.mjs --stdout</code>
- Write: <code>node harness/scripts/generate-enforcement-doc.mjs --write</code>
- Byte-drift check: <code>node harness/scripts/generate-enforcement-doc.mjs --check</code>

The source-hash table in the generated page records SHA-256 values for each
manifest byte stream. The document-contract checker invokes the same byte check
when <code>docs/enforcement.md</code> is tracked.

## Captured checks

| Check | Result | Machine-written artifact |
| --- | --- | --- |
| Initial generator check before the page existed | expected red, exit 2 | <code>scratch/NVA-B-D3-GENERATED-ENFORCEMENT-1/initial-generator-check.json</code> |
| Final generator byte-drift check | passed, exit 0 | <code>scratch/NVA-B-D3-GENERATED-ENFORCEMENT-1/final-generator-check.json</code> |
| node --test harness/scripts/check-doc-contracts.test.mjs | 46 passed, 2 integration failures | <code>scratch/NVA-B-D3-GENERATED-ENFORCEMENT-1/doc-contracts-test.json</code> |

The two focused-suite failures are both current-repository integration
assertions. They report unclassified observation-governance entries for
<code>docs/audit-and-evidence.md</code>, <code>docs/cost-and-measurement.md</code>,
<code>docs/enforcement.md</code>, and <code>docs/security-controls.md</code>. The
parent-owned governance classification must add those paths; no generator or
contract check was weakened to hide that obligation.

## Final rework evidence

The four paths above are now classified as public-user maintained documents.
The rework also makes ordering UTF-8-byte deterministic, keeps a source
checkout's generated-page requirement active after page deletion, validates
malformed source manifests through the canonical contract, encodes untrusted
table cells safely, and rejects contradictory CLI flags without writing.

| Check | Result | Machine-written artifact |
| --- | --- | --- |
| Focused documentation-contract suite | passed, exit 0 | <code>scratch/NVA-B-D3-GENERATED-ENFORCEMENT-1/doc-contracts-test-final.json</code> |
| Canonical documentation-contract checker | passed, exit 0 | <code>scratch/NVA-B-D3-GENERATED-ENFORCEMENT-1/canonical-doc-contracts-check.json</code> |
| Generated-page byte-drift check | passed, exit 0 | <code>scratch/NVA-B-D3-GENERATED-ENFORCEMENT-1/rework-generator-check.json</code> |
| Shared-diff whitespace check | passed, exit 0 | <code>scratch/NVA-B-D3-GENERATED-ENFORCEMENT-1/rework-diff-check.json</code> |
