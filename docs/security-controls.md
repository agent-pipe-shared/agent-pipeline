# Security controls

Agent Pipeline provides security-oriented checks and evidence contracts for a delivery candidate. They reduce specific risks; they are not a warranty that a repository, deployment, or organization is secure or compliant.

## What is checked

The [security control catalog](../governance/security-controls/catalog.json) defines applicable controls, their evidence binding, and waiver expiry. Its NIST SSDF and OWASP ASVS mappings help teams connect a local control to a framework, but the catalog is not an automatically active scanner or runner control. A caller must resolve and evaluate it.

The Verify security scan combines configured adapters for secret detection, dependency vulnerability scanning, static analysis, and license checks. A skipped adapter is not a pass, and an adapter error fails closed in the completeness result. Scanner findings still have the limits of their rules, available inputs, and execution environment. They do not prove the absence of all vulnerabilities, insecure configuration, or operational exposure.

Configuration and source checks establish what this checkout declares and what its tests exercised. Live enforcement is narrower: it depends on the runner, the installed integration, and the active project configuration. The runtime must be identified before treating a guard as live. The [runtime boundary](runtime-boundary.md) explains the difference between the portable methodology and host-specific hooks; [runner support](runner-support.md) states the separate runner and platform limits.

## Authority is separate from consent

An agent agreeing to follow a task is not an authorization to deploy, accept risk, or approve a change. [Change control](change-control.md) requires a Pipeline human-authority record and an authenticated external receipt to bind the same candidate, artifact, environment, scope, and window. Neither one substitutes for the other. Emergency handling still requires explicit authority and retrospective evidence.

## Practical entry points

Use the security scan and its candidate-bound evidence as one input to review, then inspect the control catalog and its evaluation receipts for the controls that apply to the system being changed. Keep vulnerability remediation and waiver decisions in their declared lifecycle. For supported reporting and release-window information, use the [security support policy](security-support-policy.md) and the [incident response runbook](security-incident-response.md). Those documents define the support and recovery boundaries; this page does not add a reporting channel or an external-write procedure.
