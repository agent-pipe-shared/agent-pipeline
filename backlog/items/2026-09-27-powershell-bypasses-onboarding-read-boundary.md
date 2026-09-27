---
schema: pipeline.backlog-item.v1
id: pipeline.powershell-bypasses-onboarding-read-boundary
type: defect
owner: pipeline
status: open
created: 2026-09-27
source: "Claude/Windows greenfield review F-02, 2026-09-27; consumer reported safe path-listing and command probes; guard source confirms PowerShell returns allow before lifecycle and read-scope checks."
sprint: alfred
done_when: manual
---

# PowerShell bypasses onboarding lifecycle and outside-root read admission

## Description

The Claude/Windows consumer reports that Bash refused an outside-root
directory listing while PowerShell admitted the same listing, revealing
filenames in a signing-key directory. It also admitted an unrelated PowerShell
command during `bootstrap-binding-required`. Source inspection confirms that
PowerShell reaches selected shell checks but then returns allow before the
POSIX-only lifecycle and read-scope logic. No private key contents were read
or tested. The report's broader claim that every protection is bypassed is
overstated: some test-path and dev-plan shell checks run before that return.

## Affected artifact

`hooks/guard-lifecycle-ready.mjs`, Claude hook/tool matchers, read-scope
admission, and Windows shell-lane tests.

## Proposal

Provide a PowerShell-aware closed grammar and read-only classifier for the
same lifecycle and read boundaries, or reject PowerShell while no safe
equivalent route exists. Ensure the prescribed recovery remains executable.
Assess `Read`, `Grep`, and `Glob` outside-root access separately from the
PowerShell defect; the consumer reports such reads, but their exact host
permission boundary needs a safe capability test with non-sensitive fixtures.

## Acceptance

- A safe Windows fixture shows Bash and PowerShell both refuse unauthorized
  outside-root reads and non-ready-phase commands.
- Legitimate returned onboarding actions work on an explicitly supported lane.
- Tests cover `Read`, `Grep`, and `Glob` with synthetic sensitive/outside-root
  paths; no real signing material is accessed.
- Hook registration and guard behavior agree on the lanes actually enforced.

## Triage

