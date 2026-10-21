// SPDX-License-Identifier: SUL-1.0
/**
 * D84: a subagent dispatch takes its model from the configured routing (the registered V3 duty
 * routes), never from inheritance and never from the dispatcher's own choice. The pure decision lives
 * here; the dispatch guard calls it with the tool-layer `model` it observed.
 *
 * Findings are repairable by construction: every message names the exact parameter to pass and the
 * selectors the configuration allows. An unreadable route source gives no opinion, so a broken
 * configuration can never leave a dispatch that no caller can repair.
 */
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";

/** Runners whose dispatch tool carries a tool-layer `model` parameter this guard can observe. */
const ENFORCED_RUNNERS = Object.freeze(["claude"]);

/** Plugin agent types that exist to serve exactly one configured duty. */
const AGENT_TYPE_DUTIES = Object.freeze({
  "pipeline-core:goldfish-implementor": ["implement"],
  "pipeline-core:goldfish-mechanic": ["mechanic"],
  "pipeline-core:goldfish-deep": ["deep"],
  "pipeline-core:critic": ["critic_normal", "critic_high_risk"],
  "pipeline-core:readiness-reviewer": ["readiness"],
  "pipeline-core:consult-advisor": ["advisory"],
});

const normalized = (value) => String(value).trim().toLowerCase();

function selectorMatches(selector, model) {
  const wanted = normalized(selector.value);
  const given = normalized(model);
  if (given === wanted) return true;
  // An alias selector also admits the family's full model ids (`sonnet` admits `claude-sonnet-5-5`).
  return selector.kind === "alias" && new RegExp(`^claude-${wanted}(?:-|$)`, "u").test(given);
}

export function evaluateDispatchModel({ runner, subagentType, model, routeSource = registeredFunctionalTaskRoutes() } = {}) {
  if (!ENFORCED_RUNNERS.includes(runner)) return { ok: true, findings: [], skipped: "runner-not-enforced" };
  if (!routeSource?.ok || !Array.isArray(routeSource.taskRoutes)) return { ok: true, findings: [], skipped: "route-source-unavailable" };
  const available = routeSource.taskRoutes.filter((route) => route.runner === runner && route.state !== "unavailable");
  if (available.length === 0) return { ok: true, findings: [], skipped: "route-source-unavailable" };
  const dutyRoutes = available.filter((route) => route.taskRoute.startsWith("duty."));
  const allSelectors = [...new Set(dutyRoutes.map((route) => route.selector.value))];
  const defaultSelector = dutyRoutes.find((route) => route.taskRoute === "duty.implement")?.selector.value ?? allSelectors[0];
  const hasModel = typeof model === "string" && model.trim() !== "";
  if (!hasModel) {
    return { ok: false, skipped: null, findings: [{
      code: "DISPATCH-MODEL-MISSING",
      message: `the dispatch names no model, so it would inherit the session's model; the configured routing decides the model, not the dispatcher. `
        + `Re-issue the same dispatch with the tool-layer \`model\` parameter set to one of the configured selectors (${allSelectors.map((value) => `"${value}"`).join(", ")}; `
        + `implementation work uses duty.implement = "${defaultSelector}").`,
    }] };
  }
  if (!dutyRoutes.some((route) => selectorMatches(route.selector, model))) {
    return { ok: false, skipped: null, findings: [{
      code: "DISPATCH-MODEL-UNROUTED",
      message: `the dispatch names model "${model}", which no available configured route selects. `
        + `Re-issue it with one of the configured selectors: ${allSelectors.map((value) => `"${value}"`).join(", ")}.`,
    }] };
  }
  const duties = AGENT_TYPE_DUTIES[subagentType];
  const routes = duties ? dutyRoutes.filter((route) => duties.includes(route.taskRoute.slice("duty.".length))) : [];
  if (routes.length > 0 && !routes.some((route) => selectorMatches(route.selector, model))) {
    const expected = [...new Set(routes.map((route) => `"${route.selector.value}"`))].join(" or ");
    // A configured but different selector is the MP-05/MP-07 escalation shape (a stated tier change), so it
    // warns instead of refusing; a model no route selects, or none at all, still refuses.
    return { ok: true, skipped: null, findings: [], warnings: [{
      code: "DISPATCH-MODEL-DUTY-MISMATCH",
      message: `agent type ${subagentType} serves ${routes.map((route) => route.taskRoute).join(" / ")}, which the configuration routes to ${expected}, but the dispatch names "${model}". `
        + `Keep it only as a stated MP-05/MP-07 escalation; otherwise re-issue the dispatch with \`model\` set to ${expected}.`,
    }] };
  }
  return { ok: true, findings: [], skipped: null };
}

export function dispatchModelRefusalText(evaluation) {
  const lines = evaluation.findings.map((finding) => `${finding.code}: ${finding.message}`);
  return `BLOCKED (guard-dispatch): ${lines.join("\n")}\nTo repair: pass the tool-layer \`model\` parameter on the dispatch call (the briefing text alone does not set it; MP-29).\n`;
}

export function dispatchModelWarningText(evaluation) {
  return (evaluation.warnings ?? []).map((warning) => `WARNING (guard-dispatch): ${warning.code}: ${warning.message}\n`).join("");
}
