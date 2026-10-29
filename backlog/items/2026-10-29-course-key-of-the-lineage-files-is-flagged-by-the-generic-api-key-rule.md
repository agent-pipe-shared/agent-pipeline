---
schema: pipeline.backlog-item.v1
id: pipeline.course-key-of-the-lineage-files-is-flagged-by-the-generic-api-key-rule
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: alfred
source: "Glossover consumer handover PF-99, relayed by the PO 2026-10-29"
done_when: manual
---

# The course key of the tool-written lineage and delta-request files is flagged by gitleaks generic-api-key (PF-99 a)

## Evidence

The 64-hex `courseKey` of the tool-written lineage and delta-request files matches `generic-api-key`; the commit that registers them is then blocked by the scan, and an exception commit spends the Critic correction budget.

## Delivered

Commit 3363c6001: a narrow allowlist stanza under the rule (path of the two file kinds AND the `courseKey` value shape) in `.gitleaks.toml` and the shipped default config; tests with the real gitleaks binary and pin C. In the stamped candidate 0b10cc602; not installed.

## Not covered here

The consumer-defined exception route, the osv waiver route and the correction-budget cost are 0.7.1 design items (2026-10-29-consumer-defined-scanner-exceptions-need-a-po-approved-route, 2026-10-29-osv-findings-have-no-reviewed-waiver-route, 2026-10-29-scan-exception-commits-spend-the-critic-correction-budget).
