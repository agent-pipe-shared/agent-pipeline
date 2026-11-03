# w144 — the readiness reviewer raises a decomposition question (candidate 19, M1.2, all three greenfield runs)

Applies on top of the chain at 9ded3b8c5. Elephant-built small item (PO exception for small items), built in a clone. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `plugins/pipeline-core/agents/readiness-reviewer.md`: a paragraph "Decomposition" tells the reviewer to read the declared modules against the responsibilities the Spec names, and to raise a QUESTION to the Elephant when one module carries more than one separable responsibility or a single module covers a Spec with several independent outcomes. The question names the responsibilities that could be cut and says a single module leaves no slice that can run in parallel. It is never a block, and a justified single module is not a finding.

## Checks

- Run alone in the clone: `dispatch-policy.test.mjs` 46/46, `agent-model-registry.test.mjs` 17/17, `codex-design-readiness-host.test.mjs` 10/10.

## Not changed / not proven

- No code and no test pin the new wording; whether a reviewer model raises the question is a greenfield measurement, not a test. The design guidance (skeleton) already carries the cut rule from w140.
- M1.4 (slices follow modules) stays open. The inventory file that lists the agent is refreshed by the apply script's last step.
- No full Verify run; no independent Critic review (suspended by the PO).
