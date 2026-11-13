# ADR-0092: The tools the Pipeline needs are one registry, asked for at onboarding

> Agent-Pipeline · Sprint Alfred · 2026-11-12

**Status:** accepted (2026-11-12, PO tiles, register D241). Built in candidate 28e. Not yet run in a real onboarding.

**Context source (PO direction, 2026-11-12):** "all tools and packages the Pipeline needs must stand in a sensible document, be mandatory at the first install/onboarding, and the user must be asked to install them together with their agent; optional things must be named as well." Tile answers (all recommended): the required set is Node.js, Git, gitleaks, osv-scanner and semgrep, Trivy only where a project has infrastructure or container files (built with the Trivy adapter); a missing tool is asked for and installed together, the person may defer it and the deferral is recorded, and the existing plan and close checks stay.

## Context

The scanners the feature close drives were known to the toolchain preflight (`FIXED_TOOLS`) and to the environment readiness report, and a project calibrated critical already refused a missing scanner at plan approval and at the close. But no document listed what a machine needs, `SETUP.md` still promised a copyable install command the preflight stopped printing with the W7-2 capability contract, the version floors lived as literals in the preflight, the signing toolchain (OpenSSL with Ed25519) was nowhere named as a prerequisite, and nothing asked a new user to install anything: a missing scanner surfaced at plan approval at the earliest. A sandboxed session that could not observe a scanner was told to install it.

## Decision

1. **One registry.** `plugins/pipeline-core/lib/toolchain-registry.mjs` lists every program the Pipeline runs and every optional one, each with a class (`required`, `required-to-sign`, `optional`, `project-setting`), purpose, users, floor, probe and an install route per platform from the vendor's official source. It has no second copy: `docs/toolchain.md` is rendered from it (`harness/scripts/generate-toolchain-doc.mjs`), vendored into the plugin, and a test fails when the file and the registry differ; the toolchain preflight takes its major-version floors from it. Required: `node`, `git`, `gitleaks`, `osv-scanner`, `semgrep`. Required to sign: `openssl`. Optional: `gh`, `rg`, `ssh`. Project settings: the cyclonedx-maven-plugin, Gradle dependency locking, the NuGet lockfile (the SBOM of the close reads what they write, ADR-0091).
2. **The preflight still installs nothing and prints no command** (W7-2 stays). A result for a missing tool points at its section of `docs/toolchain.md`; the routes reach only the document. The person runs a route in their own terminal (in Claude with the `!` prefix); the agent never runs an installer.
3. **Onboarding asks.** The one onboarding consent lists the tool check as a covered item. After the consent, and at a later start while one is still open, the agent shows each missing required tool with its route and asks once: install now, or later. The readiness finding of a scanner names the tool's class, its document section and a recorded deferral.
4. **A deferral is recorded, never a pass.** `scripts/toolchain-defer.mjs` writes the person's answer word for word into a machine-local file next to the machine plane (`<home>/.agent-pipeline/toolchain-deferrals.json`; not `machine.json`, whose exact key set would make the file invalid for every plugin copy that does not know a new key). A deferred finding stays `attended` and is not asked about again; the plan and close checks never read the deferral, so a critical calibration still refuses the missing scanner.
5. **A check that could not look asks for no install.** A scanner the preflight could not observe (`execution_environment`, `probe_timeout`, `probe_error`, as from a sandbox) is an `unknown` finding with the repair to rerun the report in the person's own terminal.

## Consequences

A new user learns at the first install what the machine needs and can install it before any design work; a team without admin rights is not locked out, and the gap stays visible until the close stops on it. Known limits: Semgrep on native Windows is not verified (the trusted resolver accepts only a direct `semgrep.exe`, and a pip launcher is not one), so the document names WSL or a deferral; the routes are text a person runs, not something the Pipeline proves; the registry and the deferral module are kernel paths (`docs/guard-maintenance-window-threat-model.md`).

## Affected contracts

W7-2 (the preflight emits no command) is unchanged. ADR-0091's help texts and the project settings in the registry name the same build switches. The Semgrep rule pack and its blocking of new findings only (register D242) and the Trivy adapter are separate decisions of candidate 28e.
