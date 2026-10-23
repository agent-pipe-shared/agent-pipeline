# Security controls

Agent Pipeline provides security-oriented checks and evidence contracts for a delivery candidate. They reduce specific risks; they are not a warranty that a repository, deployment, or organization is secure or compliant.

## What is checked

The [security control catalog](../governance/security-controls/catalog.json) defines applicable controls, their evidence binding, and waiver expiry. Its NIST SSDF and OWASP ASVS mappings help teams connect a local control to a framework, but the catalog is not an automatically active scanner or runner control. A caller must resolve and evaluate it.

The Verify security scan combines configured adapters for secret detection, dependency vulnerability scanning, static analysis, and license checks. A skipped adapter is not a pass, and an adapter error fails closed in the completeness result. Scanner findings still have the limits of their rules, available inputs, and execution environment. They do not prove the absence of all vulnerabilities, insecure configuration, or operational exposure.

For a Semgrep scan that completed and reported findings, the scanner diagnostic record also carries, for each finding (at most 20), the rule id, the repository-relative file and line, and an evidence fingerprint: a short hash prefix of the matched text and its byte length. It never carries the matched text, a snippet or the finding message. A scan that timed out, was refused, crashed or returned unparseable output carries no findings, and the other adapters do not project findings into the record.

Configuration and source checks establish what your project declares and what
the selected plugin version tested. Live enforcement is narrower: it depends
on the runner, the installed integration, and the active project
configuration. Identify the runtime before treating a guard as live. The
[runtime boundary](runtime-boundary.md) explains the difference between the
portable methodology and host-specific hooks; [runner support](runner-support.md)
states the separate runner and platform limits.

A read of a protected credential location is refused with the typed code `GUARD-READ-CREDENTIAL-TARGET`, which names the path itself as the cause: no change to the command, its options or its wording lifts it. The shell route, the Claude native read tools and the Antigravity native read tools print this code. The repair is for a human to put the content you need into a non-credential file inside the project (for example under `docs/` or `scratch/`) and for you to read that copy. Where the human override planner offers a route for the exact path, a signed one-time override can release that one read in a shell command; native read tools have no override route, and for secret-named files the refusal says that no override route is offered.

## Authority is separate from consent

An agent agreeing to follow a task is not an authorization to deploy, accept risk, or approve a change. [Change control](change-control.md) requires a Pipeline human-authority record and an authenticated external receipt to bind the same candidate, artifact, environment, scope, and window. Neither one substitutes for the other. Emergency handling still requires explicit authority and retrospective evidence.

An agent cannot widen its own approval strength by editing `pipeline.user.yaml`: the gate-strength guard denies that edit. The file stays repairable by a human signature, so a deadlock never needs a hand-made workaround: the denial seeds a request bound to the exact edit, and a signed one-time human override for that exact input admits it. A chat answer cannot arm such an override unless the committed approval mode is already `chat`.

## Practical entry points

Use the security scan and its candidate-bound evidence as one input to review, then inspect the control catalog and its evaluation receipts for the controls that apply to the system being changed. Keep vulnerability remediation and waiver decisions in their declared lifecycle. For supported reporting and release-window information, use the [security support policy](security-support-policy.md) and the [incident response runbook](security-incident-response.md). Those documents define the support and recovery boundaries; this page does not add a reporting channel or an external-write procedure.
