// SPDX-License-Identifier: SUL-1.0
/**
 * Wire shape of the onboarding driver result printed by scripts/onboarding-init.mjs
 * (pipeline.onboarding-init.v1). The library result (`driveOnboardingInit`) keeps every
 * published action in each place a caller may read it; the printed form states each one once:
 *
 * - `pending-asks` and `collect-input` outcomes: the top-level `pendingAsks` is the single
 *   copy; `final.nextAction.pendingAsks` and `collectInput.pendingAsks` are dropped.
 * - `collect-input` outcome: `collectInput` is the single full copy of the primary action;
 *   `final.nextAction` becomes `{ kind, see: "collectInput" }`.
 *
 * A copy is dropped only when it is canonically equal to the copy that is kept, so a divergent
 * copy is never hidden or replaced. `resolvePrintedOnboardingInit()` is the inverse for a
 * consumer that needs the library shape: it resolves the reference and restores the asks.
 */

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const PRINTED_ONCE_OUTCOMES = ["pending-asks", "collect-input"];
const withoutAsks = (action) => Object.fromEntries(Object.entries(action).filter(([key]) => key !== "pendingAsks"));

export function printOnboardingInitResult(result) {
  if (!PRINTED_ONCE_OUTCOMES.includes(result?.outcome)) return result;
  const asks = result.pendingAsks;
  const dropAsks = (action) => (Array.isArray(asks) && asks.length > 0 && Array.isArray(action?.pendingAsks)
    && canonical(action.pendingAsks) === canonical(asks) ? withoutAsks(action) : action);
  let nextAction = result.final?.nextAction ? dropAsks(result.final.nextAction) : undefined;
  const collectInput = result.collectInput ? dropAsks(result.collectInput) : undefined;
  if (result.outcome === "collect-input" && nextAction && collectInput && canonical(nextAction) === canonical(collectInput)) {
    nextAction = { kind: collectInput.kind, see: "collectInput" };
  }
  return { ...result,
    ...(collectInput ? { collectInput } : {}),
    ...(nextAction ? { final: { ...result.final, nextAction } } : {}) };
}

export function resolvePrintedOnboardingInit(printed) {
  if (!PRINTED_ONCE_OUTCOMES.includes(printed?.outcome)) return printed;
  const asks = Array.isArray(printed.pendingAsks) && printed.pendingAsks.length > 0 ? printed.pendingAsks : null;
  const withAsks = (action) => (action && asks && action.pendingAsks === undefined ? { ...action, pendingAsks: asks } : action);
  const collectInput = withAsks(printed.collectInput);
  const reference = printed.final?.nextAction?.see === "collectInput" && collectInput;
  const nextAction = reference ? collectInput : withAsks(printed.final?.nextAction);
  if (collectInput === printed.collectInput && nextAction === printed.final?.nextAction) return printed;
  return { ...printed,
    ...(collectInput ? { collectInput } : {}),
    ...(nextAction ? { final: { ...printed.final, nextAction } } : {}) };
}
