---
schema: pipeline.backlog-item.v1
id: pipeline.semgrep-partial-parsing-warnings-fail-the-whole-scan
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "SEMG-d / SEMG-r measurements, Alfred night 2026-10-05/06 (specs/sprint-alfred-epic/evidence/night-2026-10-05/semgrep-scanner-error.md)."
sprint: alfred
done_when: manual
---

# semgrep partial-parsing warnings fail the whole security scan

## Description

On this repository the semgrep adapter (`plugins/pipeline-core/scripts/security-adapters/semgrep.mjs:184-192`) turns
any non-empty `errors[]` in semgrep's JSON into `scanner_error` and returns zero findings. A whole-repository run on
native Windows (semgrep 1.171.0, shipped default ruleset) exited 0 with 17 results and 6 `PartialParsing` entries at
level `warn` on regex-heavy `.mjs` files; the adapter reported ERROR and dropped all 17 results. The security-scan
Verify suite therefore cannot pass on this repository, and the results it did produce are never shown.

## Triggering situation

`security-scan` row of the 2026-10-05 verify triage (`specs/sprint-alfred-epic/evidence/verify-2026-10-05/triage.md`
line 39, "semgrep scanner_error", then classified "likely env"); reproduced and explained by SEMG-r on 2026-10-06.

## Affected artifact

`plugins/pipeline-core/scripts/security-adapters/semgrep.mjs` (error classification), its tests, and the security-scan
route's result reporting.

## Proposal

PO decision (security-gate semantics), options: (A) keep fail-closed on every `errors[]` entry, and instead exclude or
restructure the files semgrep cannot parse; (B) treat `level: warn` partial-parsing entries as degraded coverage — the
scan reports its findings and names the partially parsed files, and the gate decides on findings plus a visible
coverage note — while `level: error` and timeouts stay `scanner_error`. In either case the dropped results must not
disappear silently. Test-first: a fixture with a warn-level `errors[]` entry and one finding pins the chosen behaviour
before the change. Due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
