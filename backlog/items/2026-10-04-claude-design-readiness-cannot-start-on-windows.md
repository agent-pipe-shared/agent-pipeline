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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — Record that the R4-9/R4-10 typed sub-reason clause is superseded by the ADR-0085 retirement, or keep it
  Decided: D63 (po-decisions-2026-10-18.md line 90) confirms that only the named clauses drop in AC-124 (R4-7, R4-9, R4-10) as superseded by the ADR-0085 retirement; recording it in the item is agent doc work.
- **WINDOWS-INTEROP-RUN** — A native Windows run of the retained argv, trust-root and schema behaviours is missing
  Run the item's pin under lib/pins/ natively via cmd.exe on a /mnt/d clone (retained behaviours: runner argv, home-derived trusted executable roots, schema dialect accepted by the CLI); the Claude CLI also exists on the Windows side. Small pin file, expected minutes. No model call needed.
