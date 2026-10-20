---
schema: pipeline.backlog-item.v1
id: pipeline.the-critic-diagnostic-runs-nested-test-suites-in-a-shared-test-context
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "Elephant observation, 2026-10-20: the ordinal-3 Critic diagnostic produced environment-caused reds until each suite ran through a wrapper that clears the test context and moves TMPDIR out of the checkout"
sprint: none
done_when: manual
---

# The Critic diagnostic runs nested test suites in a shared test context

## Description

`plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs` runs the command it is given and
binds its log. When that command is `node --test` over several files, three things go wrong.
None of them is a defect in the code under test:

- A suite that spawns a nested `node --test` (native-goldfish-host-state NGHS09/NGHS13) inherits
  the parent's `NODE_TEST_CONTEXT`. A check that is meant to fail then reports as passed.
- Fixtures created under the checkout's temporary directory hit `domain-ancestor-unsafe`
  (human-guard-override Q9).
- `guard-dispatch.test.mjs` needs `<repo-root>/scratch/` to exist, and a fresh worktree does not
  have it.

The repository's own run helpers already clear `NODE_TEST_CONTEXT` and set `TMPDIR` outside the
checkout. The diagnostic route does neither, so the Coordinator has to wrap every suite by hand.
It also has to disclose that wrapper to the Critic.

## Acceptance

- The diagnostic runs each suite with `NODE_TEST_CONTEXT` cleared and `TMPDIR` outside the
  checkout, or it refuses a multi-file `node --test` command and names the shipped runner.
- `guard-dispatch.test.mjs` creates the scratch directory it needs, or it skips with a typed
  reason.
- A test proves that a deliberately failing nested check stays red under the diagnostic.
