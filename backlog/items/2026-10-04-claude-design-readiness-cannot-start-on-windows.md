---
schema: pipeline.backlog-item.v1
id: pipeline.claude-design-readiness-cannot-start-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-03: three consecutive design-course readiness runs failed before any model call; a diagnostic probe located each cause."
sprint: alfred
done_when: manual
---

# Claude design readiness cannot start on native Windows

## Description

Findings register rows K3-17, K5-10 and K5-12. The independent design readiness review for Claude
failed three times in a row, each time for a different cause, before the readiness child could
run:

- K5-10: `design-course-session.mjs:133` builds the non-Codex readiness argv without `--runner`.
  `runner-design-readiness-bootstrap.mjs` requires it and exits 64 (usage). The stderr text is
  dropped. Fixed on the installed copy by operator hotfix 5.
- K3-17: `resolveTrustedSystemExecutable` never consults `PATH`. On win32 it searches only the
  system tool roots, so the Claude CLI in the user's `.local\bin` is "unavailable". The POSIX branch
  already trusts `~/.local/bin`. Fixed on the installed copy by operator hotfix 6 (PO decision:
  generic, home-derived).
- K5-12: the model-output schema passed to `claude --json-schema` declares `$schema` draft 2020-12,
  which the CLI's validator rejects ("no schema with key or ref"). The process exits 1 after 0.8 s.
  Without `$schema`/`$id` the same run exits 0 after 108 s with a valid, correctly bound report.
  Fixed on the installed copy by operator hotfix 7.
- In addition, `invokeRunnerReadinessChild` collapses exit code, timeout, stderr, parse failure and
  binding mismatch into one `DESIGN-READINESS-RUNNER-UNAVAILABLE` and drops stderr. The course
  reports `stderrBytes: 0`, so every diagnosis needed a separate probe script.

## Acceptance

- Spec §21.4 R4-7, R4-9, R4-10: the readiness producer runs on native Windows without any operator
  hotfix. Each failure class has its own typed sub-reason with bounded, sanitized stderr. The schema
  dialect handed to each runner CLI is accepted by that CLI (contract test per runner).
- The documented runner-CLI install locations are trusted on every platform, without trusting
  wrappers or non-executables.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
