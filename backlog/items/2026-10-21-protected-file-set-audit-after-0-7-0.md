---
schema: pipeline.backlog-item.v1
id: pipeline.protected-file-set-audit-after-0-7-0
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "PO decision 2026-10-21, follow-up of pipeline.protected-guard-imports-unprotected-grammar-and-classifier"
sprint: none
done_when: manual
---

# Audit and fix the protected file set against what the protected guards import (target 0.7.x)

## Description

Target: 0.7.x, after the 0.7.0 release (PO 2026-10-21). In 0.7.0 only the two files found on
2026-10-21 are added to `plugins/pipeline-core/protected-baseline.json`
(`hooks/guard-command-grammar.mjs`, `lib/protected-test-paths.mjs`; owner item
`pipeline.protected-guard-imports-unprotected-grammar-and-classifier`).

The protected guard sources import further unprotected modules. Candidates seen in the importer
list of 2026-10-21: `lib/human-guard-override.mjs`, `lib/guard-maintenance-window.mjs`,
`lib/rebase-authority.mjs`, `lib/codex-native-critic-tools.mjs`, and the Codex and Antigravity
pretool guards (`hooks/codex-pretool-guard.mjs`, `hooks/antigravity-pretool-guard.mjs`), which
are entry points for their runners but are not in the baseline either.

## Acceptance

- The transitive import closure of every protected guard source is listed, and every module in
  it is either protected or named in a reviewed list of modules that cannot widen an admission,
  with the reason.
- The runner entry guards for Codex and Antigravity are protected like the Claude hook sources,
  or the reason they need not be is recorded.
- A check, run by Verify, fails when a protected guard source gains an import of a module that
  is neither protected nor on the reviewed list, and names the repair.
- The baseline change is PO-signed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted for 0.7.x (PO 2026-10-21).
- **Rationale:** the 0.7.0 fix closes the two known gaps; the full audit is larger.
- **Assignment (if accepted):** post-0.7.0 guard hardening.
- **Date:** 2026-10-21
