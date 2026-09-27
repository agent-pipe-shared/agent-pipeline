// SPDX-License-Identifier: SUL-1.0
/** Bind one governed task route to a host-admitted session model. */
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { validateModelRoleDispatchBinding } from "./model-role-session.mjs";

const SHA = /^[a-f0-9]{64}$/u;

/**
 * `admission` and `receipt` MUST come from the host's private session store.
 * Caller-provided JSON is not authority; the launching host owns that read.
 */
export function bindModelRoleTaskDispatch({ taskRoute, runner, sessionId, requestedModel,
  admission, receipt, routeSource = registeredFunctionalTaskRoutes() } = {}) {
  if (!routeSource?.ok || !Array.isArray(routeSource.taskRoutes)
    || typeof taskRoute !== "string" || typeof runner !== "string"
    || typeof sessionId !== "string" || typeof requestedModel !== "string") {
    return { ok: false, code: "MODEL-ROLE-DISPATCH-SOURCE-INVALID" };
  }
  const matches = routeSource.taskRoutes.filter((route) =>
    route.taskRoute === taskRoute && route.runner === runner);
  if (matches.length !== 1) return { ok: false, code: "MODEL-ROLE-DISPATCH-ROUTE-UNKNOWN" };
  const route = matches[0];
  if (route.state === "unavailable") return { ok: false, code: "MODEL-ROLE-DISPATCH-ROUTE-UNAVAILABLE" };
  if (admission?.ok !== true || admission.code !== "MODEL-ROLE-BOOTSTRAP-ADMITTED"
    || !SHA.test(admission.readbackSha256 ?? "")
    || !Array.isArray(admission.receiptSha256s)
    || !admission.receiptSha256s.includes(receipt?.receiptSha256)) {
    return { ok: false, code: "MODEL-ROLE-DISPATCH-NOT-ADMITTED" };
  }
  const binding = validateModelRoleDispatchBinding({ runner, sessionId,
    role: route.role, effort: route.effort, modelId: requestedModel, receipt });
  if (!binding.ok) return binding;
  return { ok: true, code: "MODEL-ROLE-TASK-DISPATCH-BOUND", taskRoute,
    runner, role: route.role, effort: route.effort, modelId: requestedModel,
    readbackSha256: admission.readbackSha256, receiptSha256: receipt.receiptSha256 };
}
