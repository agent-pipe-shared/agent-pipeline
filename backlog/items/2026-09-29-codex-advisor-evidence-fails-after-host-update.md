---
schema: pipeline.backlog-item.v1
id: pipeline.codex-advisor-evidence-fails-after-host-update
type: bug
owner: pipeline
status: open
created: 2026-09-29
source: "Codex greenfield 0.7.0 review: a fourth design-readiness preparation failed with advisor-private-execution-binding-invalid after a plugin/host refresh, although the retained advisor-finalization document passed its structural validator."
sprint: alfred
done_when: manual
---

# Keep a sealed Advisor result readable after a host update

The private Advisor reader compared the executable recorded in the original
process journal to the current Codex binary. An update can change that binary
without changing the original Advisor answer, and the validator collapses the
failed read into one generic binding code. The live failure's first private
subcheck still needs a safe diagnostic; executable drift is a source-confirmed
failure path, not yet a complete forensic diagnosis of the greenfield run.

## Acceptance

- Revalidate the historical executable from the sealed private journal and
  ownership chain without requiring the current CLI binary to have the same
  path or bytes.
- Continue to reject altered finalization, request, source, receipt or process
  ownership evidence; never silently omit the Advisor from the package.
- Return a bounded first-failing-subcheck code for a rejected private binding,
  with no private content or path in the output.
- Cover a changed Codex executable and a tampered journal in targeted tests,
  then replay the affected greenfield design package with the installed build.

## Source progress

Historical executable comparison is implemented and the targeted Advisor
execution suite passes 7/7, including a changed-binary regression. Safe
subcheck diagnostics and installed greenfield replay remain open.
