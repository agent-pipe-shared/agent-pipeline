// SPDX-License-Identifier: SUL-1.0
// Leaf module (imports nothing): the one wording every emitter uses when it points at reopen-design. Reopening a signed
// design voids the PO's approval, so it is the PO's own step (ADR-0095 Decision 10): the guard refuses
// `reopen-design --by <name>` from an agent (PO-REOPEN-HUMAN-ONLY) and admits only the `--dry-run` preview. A correction of
// the approved Spec during implementation needs no reopen: it goes through a Spec addendum and one PO approval (ADR-0095).
// The texts name bare verbs only (no script path, no `node`), so a denial that embeds them never names a command the shell
// lane refuses (AC-148).

/** The placeholder every emitter prints for the actor label; the PO supplies the value (EL-36). */
export const REOPEN_DESIGN_ACTOR = "<human attribution>";

/** The exact preview the agent may run itself. */
export const REOPEN_DESIGN_PREVIEW = `reopen-design --by ${REOPEN_DESIGN_ACTOR} --dry-run`;

/** The step itself, which only the PO runs, in the PO's own terminal. */
export const REOPEN_DESIGN_PO_COMMAND = `reopen-design --by ${REOPEN_DESIGN_ACTOR}`;

/** One sentence: who runs the reopen, and what the agent may run instead. */
export const REOPEN_DESIGN_PO_STEP = "Reopening the signed design voids the PO's approval and is the PO's own step: "
  + `ask the PO to run ${REOPEN_DESIGN_PO_COMMAND} in their own terminal; you may preview it with ${REOPEN_DESIGN_PREVIEW}.`;

/** One sentence: the route that needs no reopen. */
export const SPEC_ADDENDUM_INSTEAD = "A correction of the approved Spec during implementation needs no reopen: "
  + "keep spec.md as approved and put the correction into a Spec addendum with one PO approval (ADR-0095).";
