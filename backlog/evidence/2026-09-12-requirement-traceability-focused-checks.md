# Requirement traceability focused checks — 2026-09-12

Scope: the opt-in named-requirement admission slice for
`pipeline.no-gate-catches-a-named-design-requirement-silently-absent-from-shipped-code`.

The new pure evaluator fixtures cover:

- an undeclared package retaining existing behavior;
- a present `keydown` keyboard-handler literal;
- an absent and a present `data-action="sound-toggle"` UI literal;
- independent typed results for both named criteria;
- subjective Spec prose producing no mechanical criterion;
- rejection of an unknown command predicate, extra prose keys, traversal,
  duplicate criterion ids, and symlink targets.

The Critic-dispatch integration fixtures cover:

- exact candidate commit/tree binding in the traceability result;
- exact candidate Spec SHA-256 binding and stale-map rejection after a Spec edit;
- inclusion of a declared map in the Critic's candidate guardrail paths;
- `CDP-REQUIREMENT-ABSENT` naming only the missing sound-toggle criterion;
- closed rejection of a prose/command predicate before packet readiness;
- unchanged packet readiness when no adjacent map exists.

Focused results:

- `node --test plugins/pipeline-core/lib/requirement-traceability.test.mjs` —
  5/5 passing, exit 0.
- `node plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs` —
  17/17 passing, exit 0. This test required host-bound execution because its
  temporary Git fixtures receive `spawnSync git EPERM` inside the managed WSL
  sandbox.
- `node harness/scripts/check-doc-contracts.mjs` — 1604 Markdown files, 1370
  links, 20 anchors; exit 0.
- `git diff --check` — exit 0.
- `node --check` for the evaluator and dispatch preflight — exit 0.
