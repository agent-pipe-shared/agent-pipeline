feat(toolchain): one tool registry, its document and the deferral of a required tool

PO tiles 2026-11-12: node, git, gitleaks, osv-scanner and semgrep are required
on every machine; a missing one is asked for at onboarding, installed by the
person together with the agent, or deferred on this machine.

- lib/toolchain-registry.mjs lists every program the Pipeline needs (required,
  required-to-sign, optional, project-setting) with purpose, floor, probe and
  an install route per platform; openssl is required where the PO signs
- docs/toolchain.md is rendered from it (harness/scripts/generate-toolchain-doc.mjs),
  vendored into the plugin, drift-checked by the registry test
- the toolchain preflight takes its major-version floors from the registry and
  points at the document section; it still prints no command (W7-2)
- scripts/toolchain-defer.mjs records a deferral with the answer word for word in
  its own machine-local file; a deferred scanner stays attended, never ok, and
  the plan and close checks never read it
- a scanner the check could not observe (sandbox) asks for no install
- both modules are kernel paths (GMWKC01); suite toolchain-registry-tests

AI-Assisted: true
Dispatch: stage-0 (elephant)
