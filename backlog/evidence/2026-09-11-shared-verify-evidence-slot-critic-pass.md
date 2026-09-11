# Shared Verify evidence slot — final ordering repair and Critic PASS

Date: 2026-09-11  
Implementation candidate: `9364887d6b29ff9ef846741a118357bec8e38ab1`  
Tree: `76a4a29695cd951662108467a5a17a40175cf52710`

## Result

The shared Verify evidence repair now preserves every run under its unique
`evidence/<runId>.json` path and updates `evidence/verify-latest.json` through
atomic sibling-file replacement. The remaining interruption window found by
the first independent review is also closed:

- startup writes the shared red `running` invalidation before its per-run
  record, so failure between the two writes cannot leave an older green latest
  result trusted;
- terminal completion writes the durable per-run result before the shared
  latest pointer, so failure of the pointer update does not erase that run's
  terminal result;
- both orders and both injected second-write failure paths have direct tests;
- the detached-worktree evidence-root fixture copies the current writer module
  alongside the current Verify entry point, so it exercises the real import
  graph.

The first review of the pre-correction candidate reported one P2: startup wrote
the per-run file first and could therefore leave stale green shared evidence if
the process stopped before the second write. That candidate was not accepted or
used to close the item. Commit `9cfcedb25e3643f60b32950d91af0d8143d88d7a`
implemented phase-aware ordering; commit
`9364887d6b29ff9ef846741a118357bec8e38ab1` corrected the real detached fixture
that exposed the helper import.

## Verification

- `node harness/scripts/verify-evidence-writer.test.mjs`: 10 passed, including
  real concurrent atomic writes, distinct per-run paths, startup interruption,
  and terminal pointer-update failure.
- `node harness/scripts/verify-evidence-root.test.mjs`: 1 passed against a real
  detached Git worktree.
- `node harness/scripts/check-verify-suite-registration.mjs`: 518 registered,
  zero exclusions, zero unregistered suites at focused-test time.
- `node harness/scripts/check-doc-contracts.mjs`: documentation contracts valid.
- `PIPELINE_VERIFY_CONCURRENCY=2 node harness/scripts/verify.mjs --mode critic
  --base 7d29de56525ddf9b65f433554572489c7e3d115d --no-reuse`: 520 of
  520 passed, zero reused receipts, exact candidate binding. Run
  `verify-1789118299249-0b4224ae3908d670`, started
  `2026-09-11T09:18:19.249Z`, finished `2026-09-11T09:21:28.971Z`.

An earlier full attempt on `9cfcedb2` produced 519 of 520 green and exposed the
stale detached-fixture import. It was retained as a failed diagnostic and was
not presented as acceptance evidence.

## Independent review

The final fresh-context Critic inspected range
`7d29de56525ddf9b65f433554572489c7e3d115d..9364887d6b29ff9ef846741a118357bec8e38ab1`
with the backlog item, current Verify evidence, operating model, runtime
manifest, and both governance directories. It reported no findings and PASS.
Its assurance was `functional-equivalent-read-only`; OS isolation was not
asserted.

The Critic specifically confirmed startup latest-first invalidation, terminal
per-run-first durability, input validation, failure-path coverage, real callsite
reachability, current detached-fixture imports, and the absence of new network,
credential, dependency, schema, or public compatibility changes.
