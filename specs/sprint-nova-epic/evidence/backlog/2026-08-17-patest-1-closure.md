# NVA-PATEST-1 closure evidence

Backlog item: `pipeline.project-authority-test-fixture-races-under-a-full-directory-parallel-sweep`
Closure commit: `214fb743afd87acf8d3ecae75f057bae7eab1c5b`

## What changed

`plugins/pipeline-core/lib/project-authority.test.mjs` gained a
`MODULE_PLUGIN_ROOT` constant derived from the test file's own
`import.meta.url` (mirroring `project-authority.mjs`'s own
`MODULE_PLUGIN_ROOT` derivation). All four `cpSync(join(process.cwd(), ...), ...)`
fixture-copy sites were rewritten to use it instead, removing the fixture's
dependence on the invoking process's working directory.

## Evidence

- Standalone: `node --test plugins/pipeline-core/lib/project-authority.test.mjs`
  — exit 0, `project-authority: 29 passed, 0 failed`.
- Whole-directory sweep (`node --test plugins/pipeline-core/lib/`, the shape
  that originally reproduced this defect): `project-authority.test.mjs`'s own
  tests are no longer among the sweep's failures. The sweep's remaining
  failures (`human-guard-override.test.mjs`'s marketplace-registry-state
  tests, `windows-assurance-verify-registration.test.mjs`) are pre-existing,
  environment-related, and tracked separately
  (`backlog/items/2026-08-17-this-hosts-local-marketplace-copy-is-not-symlinked-to-source.md`).

## Review disposition

Dispatched as `NVA-PATEST-1` (goldfish-implementor). No dedicated Critic
dispatch: test-fixture-only change, no production or guardrail code touched
— class-niedrig per MP-07's cascade. Self-verified by the Elephant by reading
the full diff (`git show 214fb743afd87acf8d3ecae75f057bae7eab1c5b`) and
independently re-running both the standalone suite and the whole-directory
sweep before closing.
