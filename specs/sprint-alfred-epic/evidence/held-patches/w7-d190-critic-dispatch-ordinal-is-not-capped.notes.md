# W7-D190-ORDINAL -- notes (state: HELD, built by the Elephant in a scratch clone under the D192 exception)

Candidate `facb11a44`. Patch: `w7-d190-critic-dispatch-ordinal-is-not-capped.patch` (2 paths, apply-check exit 0). Independent of the D199 and N14 patches (disjoint files).

## What it delivers

`lib/dispatch-policy.mjs` `recriticFindings` refused a Critic dispatch whose prompt declares `Review ordinal: N` with N above 4 (`DISPATCH-RECRITIC-ORDINAL`, "a fifth review is refused"). That is a sixth numeric refusal of a diff round, in the dispatch guard, next to the five in the batch store and preflight (patch `w7-d199-critic-rounds-uncapped-in-batch-and-after-pass`); it would block the Critic dispatch of round 5 and later of any consumer course even after those are lifted. The check and its `REVIEW_ORDINAL_LINE` constant are removed. The other re-critic rules stay: batch scope field, exactly one delta range, nothing wider than the delta.

Test: `lib/pins/opus-critic-only-batched-for-architecture-and-security.test.mjs` now asserts that ordinals 4, 5 and 9 produce no `DISPATCH-RECRITIC-*` finding (it asserted the refusal of 5).

## Checks (scratch clone)

`opus-critic-only-batched-for-architecture-and-security`, `dispatch-policy` and `hooks/guard-dispatch` tests: exit 0.

## NOT in this patch / open

- The canon wording of the old cap is unchanged in about fifteen files and several pins assert it: `guardrails/quality-gates.md` ("Four Critic calls total is the maximum"), `roles/elephant.md` and its plugin twin, `docs/operating-model.md`, `harness/checklists/critic-review.md`, `templates/prompts/critic-review.md`, `templates/prompts/goldfish-task.md`, `templates/prompts/elephant-kickoff.md`, `skills/critic-review/SKILL.md`, the texts of `CDP-COURSE-BUDGET` and `close-coordinator.mjs`, `policies/model-policy.md` MP-07 and `harness/scripts/check-language-canon.test.mjs`, plus the German reference halves. One consistent rewrite is its own PO-visible canon change; until then those texts describe the cap while the code no longer enforces it for diff rounds.
- Full Verify, batch Critic and PO acceptance remain pending. Kernel path (guard library): the PO applies the patch in the same ceremony.
