# Nova-B protected integration review specification

Review the frozen protected-integration delta against these requirements:

1. The Claude worktree-isolation hook observes every supported dispatch tool
   name: `Task`, `Agent`, and `Workflow`, without removing any existing matcher.
2. The Claude Advisor-prohibition guard is registered exactly once for the
   measured raw `advisor` PreToolUse name. It blocks only an exact child dispatch
   carrying the canonical prohibition; unbound calls retain the ordinary Advisor
   demand and consent gates.
3. Every `*.test.mjs` under a registered Verify root is either registered or has
   a current, explicit disposition. The six previously missing Nova-B suites are
   executed by Full Verify.
4. The instrumented dispatch-budget binding suite has an exact eight-case
   completion contract. Existing test expectations are not weakened or excluded.
5. Governance action suites and the pipeline-state gate action call-path suite
   are registered with their exact case-completion counts.
6. Every new Verify surface belongs to exactly one capability in the product
   inventory, and its production/test evidence remains specific to that
   capability.
7. The generated enforcement document matches the exact three runner manifests.
8. Focused failures remain failures; no suite is deleted, skipped, made tolerant,
   or covered by an extended exception to obtain a green result.

Rollback is a forward revert of the protected integration commit, followed by
the hook manifest, worktree count, Advisor dispatch, Verify registration,
case-completion registry, product capability inventory, and documentation
contract checks. Reverting the hook registrations must also withdraw the related
enforcement claims; reverting Verify registrations reopens the unregistered
suite gate and must not be described as preserving complete coverage.
