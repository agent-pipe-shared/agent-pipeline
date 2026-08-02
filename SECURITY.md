# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.
Report them through [GitHub Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
on this repository's Security tab. Do not include credentials, live exploit
payloads, private endpoints, or customer data in a public issue.

The security owner acknowledges intake, assigns a named owner, records the
canonical finding in the governed finding lifecycle, and supplies a response
receipt. Public advisories are a separate, redacted projection; they never
replace the canonical finding record.

Please include the affected component or file, reproduction steps, potential
impact, and any suggested remediation. We will coordinate disclosure timing
with you before a public advisory is published.

## Supported versions

The project is in an initial `0.x` release series. The latest `0.x` release is
supported; earlier `0.x` releases are end-of-life unless a later policy says
otherwise. The authoritative support and EOL window is maintained in
[`docs/security-support-policy.md`](docs/security-support-policy.md). A
security release is accepted only when its release manifest matches that
versioned policy.

## Incident response and recovery

The named incident lead uses the capability-bound procedures in
[`docs/security-incident-response.md`](docs/security-incident-response.md).
Emergency changes and rollback require their normal human or policy gate;
agents cannot authorize a production change, accept risk, close an incident,
or publish an advisory.
