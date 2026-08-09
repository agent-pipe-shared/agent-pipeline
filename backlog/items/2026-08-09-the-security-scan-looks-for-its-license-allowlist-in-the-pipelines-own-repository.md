---
schema: pipeline.backlog-item.v1
id: pipeline.security-scan-license-allowlist-assumes-the-pipeline-repository
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Measured on a freshly seeded consumer project, 2026-08-09, while establishing whether a `security` gate can be satisfied at all."
due: 2026-08-16
---

# The security scan looks for its license allowlist inside the Pipeline's own repository

## What happens

`security-scan.mjs` run against a clean, freshly seeded consumer project:

```
gitleaks:      OK      [success] (0 findings)
osv-scanner:   SKIPPED [success] -- no package sources in project
semgrep:       ERROR   [scanner_error] -- Cannot create auto config when metrics are off
license-check: SKIPPED [scanner_error] -- license allowlist not found:
               <snapshot>/governance/examples/policies/license-allowlist.json
```

`governance/examples/policies/license-allowlist.json` is a path in the **Pipeline's
own repository**. A consumer project has no `governance/` directory, so the
license adapter can never do anything but skip — and it skips as `scanner_error`,
not as "not configured", so the distinction between "this project has no license
policy" and "the scanner broke" is lost.

This is the same class as
`2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md`, reached
through the security lane.

## Also visible in the same run, and worth separating

- **semgrep** fails on a metrics-configuration error rather than being absent.
  That is an environment fact, not a Pipeline defect, but the adapter reports it
  identically to a real scanner failure, so a consumer cannot tell "not installed
  / misconfigured here" from "found something".
- **osv-scanner** SKIPPED on an empty project is correct and reads correctly.

## Why it matters

It is one of the three independent reasons a fresh consumer cannot satisfy a
`security` gate (measured while seeding `security: off` for the 0.5.4 candidate).
Even with the `.gitignore` circle broken and the scanners installed, the license
adapter stays unsatisfiable, so the gate stays red.

## Direction

1. The allowlist path is a **project** input, not a plugin-relative one. Resolve
   it from the consumer's own policy location, and treat "absent" as *not
   configured* — a skip that is not an error — rather than as a scanner failure.
2. Once (1) holds, re-run the satisfiability measurement end to end. Seeding a
   `security` gate stays off the table until that measurement passes, on the same
   standard the `dev-plan` and `push` chapters set for themselves.

## Related

- `2026-08-09-a-warn-security-gate-hard-blocks-every-push.md`
- `2026-08-09-onboarding-sends-every-agent-to-a-directory-the-project-does-not-ignore.md`
- `2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md`

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
