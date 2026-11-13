# ADR-0097: A pre-existing red check is repaired by a maintenance dispatch

> Agent-Pipeline · Sprint Alfred · 2026-11-13

**Status:** accepted (2026-11-13, PO tiles, register D249). Built in candidate 29c. Not yet run on a real consumer repository.

**Context source (PO tiles, 2026-11-13, consumer finding K-28):** the PO chose:

- "Maintenance dispatch route" for a red check that no criterion of the approved Spec covers;
- "Allow both" for the proof that the check was red before the feature: a red Verify run receipt where one exists, otherwise a signed PO acknowledgement (against the recommendation of the acknowledgement alone).

## Context

A consumer feature had to get its Verify gate green before its Critic round. Two tests were already red before the feature's code. One of them, a link check over `specs/` and `docs/`, failed on an example inside the approved Spec itself.

Every governed Goldfish dispatch binds to one criterion of the approved Spec: the host parses the criterion and refuses anything else. ADR-0095 forbids adding a criterion through an addendum, and `reopen-design` reopens the whole design for a test fix. The only workaround was a placeholder criterion. That would make the Critic count a test fix as Spec coverage.

## Decision

1. **A second binding kind.** A Goldfish item binding names exactly one of:
   - `criterionLocator`: today's criterion binding;
   - `maintenance` (`pipeline.maintenance-binding.v1`): a maintenance binding with no criterion.

   A maintenance binding has exactly one check, the red one. Any of the existing check forms may be used: a `.test` file, `command:<id>` (D195) or `document:<path>`. Its item id is `<spec folder>.maintenance`. `dispatch-briefing.mjs --maintenance --check <form>` generates it. A placeholder criterion is never used.
2. **The write scope is narrow.** Each allowed path must meet all of these, or the host refuses with `SQ-MAINTENANCE-SCOPE`:
   - it is a dependency of the check;
   - it is not a gate-strength path (GS-1 to GS-17, which includes the ADR-0096 gate-definition set);
   - it is not the approved PRD, Spec or a Spec addendum;
   - it is test- or tooling-shaped. That means a `*.test.*` or `*.spec.*` file, or a path with a `test`, `tests`, `__tests__`, `fixtures`, `scripts` or `tools` segment.

   Configuration files and `package.json` are excluded, because a verify command can live there. Widening the set is a PO decision.
3. **Red before the feature, proven one of two ways.** The host derives the proof at admission and never takes it from the briefing.
   - **Verify receipt.** A sealed Verify suite receipt `project-<id>` for a `command:<id>` check shows a non-zero exit. Its candidate commit must be the plan-approval candidate commit or an ancestor of it.
   - **PO acknowledgement.** Otherwise the PO acknowledges the red check once, as the critical-action kind `acknowledge-maintenance-red-check`, in the `gates.human_approval` mode (fail-closed to `signature`).
     - The agent runs `pipeline-state.mjs approve-maintenance-red-check --check <form> --by <label>`. `--by` is only a label the PO gave for this command (EL-36).
     - The subject binds the feature, the plan approval and the check.
     - The record is labelled "red before the feature acknowledged by the PO".

   With neither, the dispatch is refused with `SQ-MAINTENANCE-RED-UNPROVEN`, and the refusal names both routes.
4. **Red before, green after, in the real checkout.** `maintenance-red-check.mjs observe --root <root> --check <form>` runs the check on the clean HEAD of the real checkout, where the dependencies are installed. It records the result in private state: check, HEAD, tree, exit code and output digest. Admission requires a red observation at the dispatch's candidate commit (`SQ-MAINTENANCE-RED-UNOBSERVED`). After the delivery, the same check is the item check the host already runs, and it must be green for integration.

   A run at an old commit in a fresh worktree is never used. Without installed dependencies it is red for the wrong reason, and that proves nothing.
5. **Its own kind for the Critic and in the queue.** The queue row carries `delivery.maintenance` and no criterion. The Critic's shared slice adds the slice id, not a criterion id. The Critic packet names each maintenance slice of its range with its check and its proof kind, as data fields. They are not a list of claims to verify (ADR-0014).

## Consequences

A pre-existing red check gets a sanctioned route that leaves the Spec, its criterion set and the design approval untouched. The Critic reviews the fix as a fix, not as Spec coverage.

The price:

- A check without a Verify receipt from before the approval needs one PO signature.
- A `.ts` test has no `.test` check form; it needs a registered `command:<id>`.

Known limits:

- The receipt route reads the Verify run store, which is private to the device. On the other machine it finds nothing and falls back to the acknowledgement.
- The red observation proves the check is red at the dispatch's candidate. That the feature did not cause it rests on the receipt or the PO's word.
- The audit bundle does not yet list maintenance deliveries separately. The Critic packet and the queue do.
- Not run on native Windows.

## Affected contracts

- ADR-0095 (the criterion set is unchanged; an addendum still cannot add one);
- ADR-0096 (the gate-strength and gate-definition paths stay out of a maintenance scope);
- ADR-0061 / ADR-0074 (the critical ceremony and its new kind);
- ADR-0014 (the Critic packet fields);
- D195 (`command:<id>` checks); D205 (a shared item no longer blocks; only the slice or an overlapping write scope does).
