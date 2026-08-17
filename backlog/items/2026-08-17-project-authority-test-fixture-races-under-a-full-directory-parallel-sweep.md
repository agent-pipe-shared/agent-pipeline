---
schema: pipeline.backlog-item.v1
id: pipeline.project-authority-test-fixture-races-under-a-full-directory-parallel-sweep
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-17
closure_repository: self
closure_commit: 214fb743afd87acf8d3ecae75f057bae7eab1c5b
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-17-patest-1-closure.md
source: "Critic review of NVA-VENDORSYNC-1 (9ab96e01, claude-opus-5 at max), finding F2 — the dispatch's own claims record overclaimed a green plugin-wide sweep when project-authority.test.mjs actually failed there. Independently re-verified: the suite passes 29/29 standalone (node --test plugins/pipeline-core/lib/project-authority.test.mjs) and cleanly under the serialized harness/scripts/verify.mjs gate (evidence/verify-latest.json, exact-bound to 9ab96e01); it only fails inside a whole-plugin-directory `node --test` sweep that runs many test files concurrently."
---

# `project-authority.test.mjs`'s stale-vendored-copy fixture depends on `process.cwd()`, and races under a full-directory parallel `node --test` sweep

## Description

The "a stale vendored copy is replaced exactly and a current one is a no-op"
test (added by `NVA-VENDORSYNC-1`, but the pattern it reuses is pre-existing
in this file) seeds its fixture with:

```js
cpSync(join(process.cwd(), VENDORED), join(base, VENDORED), { recursive: true });
```

i.e. a byte-for-byte copy of `process.cwd()/plugins/pipeline-core` — assumed
identical to `MODULE_PLUGIN_ROOT` (the actually-loaded package,
`project-authority.mjs`'s own `resolve(dirname(fileURLToPath(import.meta.url)),
"..")`). That assumption holds when this suite runs alone or under the
serialized project verify gate, but not necessarily under a `node --test`
invocation that sweeps the entire `plugins/pipeline-core` directory and runs
many test files concurrently (observed:
`evidence/nva-vendorsync-1-plugin-sweep.tap`, `not ok 100 -
plugins/pipeline-core/lib/project-authority.test.mjs`, `Expected
'provenance-rejected' to equal 'ready'` at the migration-readiness assertion
following the stale-copy fixture).

Standalone and under `harness/scripts/verify.mjs` (which runs
`project-authority-tests` as one of its own serialized, isolated steps) the
suite is green — `project-authority: 29 passed, 0 failed`,
`evidence/verify-latest.json`'s `project-authority-tests` step `exitCode: 0`,
exact-bound to `9ab96e01`. The defect is specific to the whole-directory
concurrent `node --test` sweep shape, not the canonical gate.

## Affected artifact

`plugins/pipeline-core/lib/project-authority.test.mjs` (the `process.cwd()`-
seeded fixture pattern; the specific new failure is in the stale-copy test
`NVA-VENDORSYNC-1` added, but the underlying pattern pre-dates that dispatch).

## Proposal

Not designed here. Worth considering: seed the fixture from
`MODULE_PLUGIN_ROOT`-equivalent (import the module under test and read its own
resolved root, or accept an injectable source root) rather than
`process.cwd()`, so the fixture is correct regardless of the invoking
process's working directory or what else is running concurrently in the same
`node --test` sweep.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — independently reproduced the standalone-green /
  sweep-red split before filing, not just trusted from the Critic's report.
- **Rationale:** a real, if narrow, test-fixture fragility; low severity
  since the canonical gate (`verify.mjs`) is unaffected, but worth fixing so
  an ad hoc whole-directory `node --test` sweep (used more than once this
  session as a Verify fallback) stays a trustworthy signal.
- **Assignment:** queued; not dispatched this AFK block.
- **Date:** 2026-08-17

## Closure (2026-08-17)

Dispatched as `NVA-PATEST-1` (goldfish-implementor, claude-sonnet-5/medium —
mechanical fixture fix, no design latitude). Fixed exactly as proposed: a new
`MODULE_PLUGIN_ROOT` constant derived from the test file's own
`import.meta.url` (mirroring `project-authority.mjs`'s own derivation), all
four `cpSync(join(process.cwd(), ...), ...)` fixture-copy sites rewritten to
use it. Verified standalone (`node --test
plugins/pipeline-core/lib/project-authority.test.mjs`, 29/29 passed) and under
the whole-directory sweep this bug only reproduced under (`project-authority`
tests no longer among the sweep's failures; the sweep's remaining failures —
`human-guard-override.test.mjs`'s marketplace-registry-state tests,
`windows-assurance-verify-registration.test.mjs` — are pre-existing and
tracked separately). Committed as `214fb743afd87acf8d3ecae75f057bae7eab1c5b`.
No Critic dispatch: test-fixture-only change, no production/guardrail code
touched, class-niedrig per MP-07's cascade — self-verified by the Elephant
against the diff and both test runs instead.
