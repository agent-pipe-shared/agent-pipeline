docs(adr): amend ADR-0045, the package carries the approved PRD and Spec where they were approved

The amendment of 2026-11-13 (PO tile after the Glossover consumer report
G7) states the one closed exception to "everything under
specs/<safe-feature-id>/": the prd and spec classes may stay at their
approved path inside another specs/ folder that is no feature package;
every other class stays in the package root, and present-plan refuses a
PRD or Spec the package could not carry before a signature is asked for.

AI-Assisted: true
Dispatch: stage-0 (elephant)
