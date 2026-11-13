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

   A maintenance binding has exactly one check, the red one. It may be a `.test` file, `command:<id>` (D195), or a new form `verify:configured`. The new form is the project's top-level `verify` command and exists only for maintenance bindings. A consumer whose calibration registers no `verifyImpact` ids has only this one. A document check is never a maintenance check. Its item id is derived as for a criterion, `<spec folder>.<item>`. `dispatch-briefing.mjs binding --maintenance --check <form>` generates it. A placeholder criterion is never used.

   The check's identity is what runs: `verify:configured`, the command id, or the `.test` path. The dispatch id and the dependency list are not part of it, so a check observed before any binding exists is the check the binding later names. Two maintenance deliveries of different checks never compare equal.
2. **The write scope is narrow.** Each allowed path must meet all of these, or the host refuses with `SQ-MAINTENANCE-SCOPE`:
   - it is a dependency of the check;
   - it is not a gate-strength path (GS-1 to GS-17, which includes the ADR-0096 gate-definition set);
   - it is not the approved PRD, Spec or a Spec addendum;
   - it is test- or tooling-shaped. That means a `*.test.*` or `*.spec.*` file, or a path with a `test`, `tests`, `__tests__`, `fixtures`, `scripts` or `tools` segment.

   Configuration files and `package.json` are excluded, because a verify command can live there. Widening the set is a PO decision.
3. **Red before the feature, proven one of two ways.** The host derives the proof at admission and never takes it from the briefing.
   - **Verify receipt.** A sealed Verify suite receipt shows a non-zero exit: `project-<id>` for a `command:<id>` check, `configured-verify` for `verify:configured`. Its candidate commit must be the plan-approval candidate commit or an ancestor of it.
   - **PO acknowledgement.** Otherwise the PO acknowledges the red check once, as the critical-action kind `acknowledge-maintenance-red-check`, in the `gates.human_approval` mode (fail-closed to `signature`).
     - The agent runs `pipeline-state.mjs approve-maintenance-red-check --by <label>`. `--by` is only a label the PO gave for this command (EL-36).
     - The subject binds the feature, the plan approval and every check observed red at the current HEAD; the PO sees each one listed.
     - The record is labelled "red before the feature acknowledged by the PO".
     - It holds for each listed check for the rest of this feature under this plan approval. A new plan approval needs a new acknowledgement. The confirmation text the PO sees states this scope.

   With neither, the dispatch is refused with `SQ-MAINTENANCE-RED-UNPROVEN`, and the refusal names both routes.
4. **Red before, green after, in the real checkout.**
   - **Red before.** `maintenance-red-check.mjs observe --root <repo> --check <form>` runs the check on the clean HEAD of the real checkout, where the dependencies are installed. It runs as an agent command, so no hook time limit applies; `verify:configured` gets 30 minutes and belongs in the background. It records the first result at that commit in private state: check identity, HEAD, tree, exit code and output digest. It records nothing and refuses for a dirty tree, a `.test` file not tracked at HEAD, no active feature, a timeout, a command the shell cannot run (exit 126 or 127) and a run that changes the tree. `dispatch-briefing.mjs binding --maintenance` only reads the observation and the proof; it runs no check. A green observation is refused, since there is nothing to repair. Admission requires a red observation at the dispatch's candidate commit (`SQ-MAINTENANCE-RED-UNOBSERVED`).
   - **Green after, for `.test` and `command:<id>` checks.** The check is the item check the host already runs after the delivery, and it must be green for integration.
   - **Green after, for `verify:configured`.** The full Verify can outlast a hook. So the host does not run it at the delivery; it records the check as `deferred-to-close-verify`. The close then checks it: `plan-transition --phase feature-close-prepared` refuses with `CLOSE-MAINTENANCE-VERIFY-NOT-GREEN` unless a sealed green `configured-verify` receipt exists at a commit strictly after the slice's base commit (where the check was red) and contained in the close candidate. The refusal names the Verify command that produces the receipt. A cancelled maintenance slice is not checked.

   A run at an old commit in a fresh worktree is never used. Without installed dependencies it is red for the wrong reason, and that proves nothing.
5. **Its own kind in the queue.** The queue row carries `delivery.maintenance`, the host-derived `redProof` and no criterion. The Critic's shared slice adds the slice id, not a criterion id. A later step may let the Critic packet name each maintenance slice of its range with its check and its proof kind, as data fields, never as a list of claims to verify (ADR-0014).

## Consequences

A pre-existing red check gets a sanctioned route that leaves the Spec, its criterion set and the design approval untouched. The Critic reviews the fix as a fix, not as Spec coverage.

The price:

- A check without a Verify receipt from before the approval needs one PO signature.
- A `.ts` test has no `.test` check form. It needs a registered `command:<id>`, or `verify:configured` with green only proven at the close.
- `verify:configured` runs the whole Verify once for the red observation.

Known limits:

- The receipt route reads the Verify run store, which is private to the device. On the other machine it finds nothing and falls back to the acknowledgement.
- The red observation proves the check is red at the dispatch's candidate. That the feature did not cause it rests on the receipt or the PO's word.
- Neither the audit bundle nor the Critic packet lists maintenance deliveries separately yet. Only the queue row does.
- Not run on native Windows.

## Affected contracts

- ADR-0095 (the criterion set is unchanged; an addendum still cannot add one);
- ADR-0096 (the gate-strength and gate-definition paths stay out of a maintenance scope);
- ADR-0061 / ADR-0074 (the critical ceremony and its new kind);
- ADR-0014 (the Critic packet fields);
- D195 (`command:<id>` checks); D205 (a shared item no longer blocks; only the slice or an overlapping write scope does).
