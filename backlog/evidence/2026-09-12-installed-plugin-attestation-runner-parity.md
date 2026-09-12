# Installed-plugin attestation runner parity

Date: 2026-09-12  
Scope: portable Claude and Antigravity local-development installation paths.

The existing provider-neutral receipt verifier and Codex host implementation
were retained. The host now selects a runner-specific manifest and protected
entrypoint set while preserving complete physical-tree comparison, clean Git
source provenance, restrictive external receipt storage, request-selected
readback, and path-free public results.

Claude uses its measured host surfaces: the bare-array `plugin list --json`
entry identifies the selected local plugin and
`~/.claude/plugins/known_marketplaces.json` supplies the exact
directory-source marketplace. A missing receipt produces one executable
post-install action, marks `requiresPoApproval: false`, and requires a fresh
verified preflight before readiness.

Antigravity uses its repository installer and path registry. For a copied
marketplace tree, the installer writes the receipt before it writes
`.agents/plugins.json` or the global Gemini registry. Bootstrap accepts the
receipt only when one exact registry entry resolves to the loaded physical
plugin root. A legacy copy without the installer locator remains fail-closed
and names rerunning the installer from the source checkout; no source path is
guessed or persisted in a project registry.

Focused checks:

- `node plugins/pipeline-core/scripts/installed-plugin-attestation-host.test.mjs` — 7/7 passed. IPH01 covers all three provider profiles; IPH07 covers the Claude host action, the Antigravity installer coordinator, both installer entrypoints, and renewed bootstrap readback.
- `node --test plugins/pipeline-core/lib/public-core-observation.test.mjs plugins/pipeline-core/lib/installed-plugin-attestation.test.mjs` — both suites passed.
- `node plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs` — 55/55 passed in the host-side repetition. The earlier restricted-sandbox attempt reached 53 passing cases and refused only two nested-Git fixtures with `EPERM`; the host repetition supersedes that incomplete run.

No live marketplace was mutated and no native Codex WSL sandbox readiness is
claimed.
