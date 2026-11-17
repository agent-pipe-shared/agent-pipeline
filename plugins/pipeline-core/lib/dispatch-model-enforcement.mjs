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
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { projectFunctionalTaskRoutes, registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { isShippedPipelineAgentType } from "./dispatch-policy.mjs";
import { aliasOfModel, deriveExceptionStates, exceptionScopeText, findModelException, readModelExceptionStore } from "./dispatch-model-exception.mjs";

/** Runners whose dispatch tool carries a tool-layer `model` parameter this guard can observe. */
const ENFORCED_RUNNERS = Object.freeze(["claude"]);
/** The Antigravity native Model aliases (the one list: the briefing generator imports it instead of copying it). */
export const ANTIGRAVITY_NATIVE_MODELS = Object.freeze(["flash_lite", "flash", "pro"]);
const ANTIGRAVITY_MODELS = ANTIGRAVITY_NATIVE_MODELS;
/** The route tier of a duty that passes no Model and runs on the session's model (G20-43: the Critic). Not an alias, so not in the list above. */
const INHERIT_TIER = "inherit";

/** The approved Antigravity native alias the registry projects for a duty task route (e.g. `duty.implement`), or null when none is registered. */
export function antigravityNativeTierForTaskRoute(taskRoute, routeSource = registeredFunctionalTaskRoutes()) {
  if (!routeSource?.ok || !Array.isArray(routeSource.taskRoutes)) return null;
  const route = routeSource.taskRoutes.find((entry) => entry.runner === "antigravity" && entry.taskRoute === taskRoute && ANTIGRAVITY_MODELS.includes(entry.nativeTier));
  return route ? route.nativeTier : null;
}

/** Plugin agent types that exist to serve exactly one configured duty. */
const AGENT_TYPE_DUTIES = Object.freeze({
  "pipeline-core:afk-claude-worker": ["read"],
  "pipeline-core:goldfish-implementor": ["implement"],
  "pipeline-core:goldfish-mechanic": ["mechanic"],
  "pipeline-core:goldfish-deep": ["deep"],
  "pipeline-core:critic": ["critic_normal", "critic_high_risk"],
  "pipeline-core:readiness-reviewer": ["readiness"],
  "pipeline-core:consult-advisor": ["advisory"],
});

const normalized = (value) => String(value).trim().toLowerCase();

/** The Claude family aliases the Agent tool's `model` parameter accepts (it takes no full model id). */
export const CLAUDE_FAMILY_ALIASES = Object.freeze(["opus", "sonnet", "haiku", "fable"]);

// C30G-M16 (PO 2026-11-17): a PO-requested, recorded, expiring model exception (lib/dispatch-model-exception.mjs) admits ONE model no configured
// route selects. Claude runner only; it changes the model (and effort) and nothing else about the dispatch.
const EXCEPTION_SCRIPT = fileURLToPath(new URL("../scripts/dispatch-model-exception.mjs", import.meta.url)).replaceAll("\\", "/");
const EXCEPTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/** The decision's view of the exception store: lazy (nothing is read for a dispatch the routing already admits), memoized, null when there is no source to read. */
function exceptionContext({ root, runner, exceptionStore, dispatchId, dispatchKey, nowFn }) {
  if (runner !== "claude" || (exceptionStore === undefined && !(typeof root === "string" && root !== ""))) return null;
  let snapshot, id, key;
  const idOf = () => { id ??= { value: (() => { const given = typeof dispatchId === "function" ? dispatchId() : dispatchId; return typeof given === "string" && EXCEPTION_ID.test(given) ? given : null; })() }; return id.value; };
  const keyOf = () => { key ??= { value: (() => { const given = typeof dispatchKey === "function" ? dispatchKey() : dispatchKey; return typeof given === "string" && EXCEPTION_ID.test(given) ? given : (idOf() ?? `anon-${randomUUID()}`); })() }; return key.value; };
  const now = nowFn ?? (() => new Date().toISOString());
  return {
    root, dispatchId: idOf,
    find(alias) {
      snapshot ??= exceptionStore ?? readModelExceptionStore(root);
      if (!snapshot.ok) return { outcome: "broken", snapshot };
      return { ...findModelException(deriveExceptionStates(snapshot.store, Date.parse(now())), { alias, dispatchId: idOf(), dispatchKey: keyOf() }), snapshot };
    },
    use(found, alias, effortApplied) {
      return { id: found.exception.id, dispatchKey: keyOf(), dispatchId: idOf(), model: alias, effort: effortApplied, reused: found.reused, requestedAt: found.exception.at, by: found.exception.by };
    },
  };
}

function exceptionRecordCommand({ alias, effort, dispatchId, root }) {
  const effortFlag = typeof effort === "string" && /^[a-z]{2,12}$/u.test(effort) ? ` --effort ${effort}` : "";
  const scope = dispatchId === null ? "--count 1" : `--dispatch-id ${dispatchId}`;
  return `node "${EXCEPTION_SCRIPT}" record --model ${alias}${effortFlag} ${scope} --reason "<reason the PO gave>" --by "<label the PO gave>"${exceptionRootFlag(root)}`;
}
const exceptionRootFlag = (root) => (typeof root === "string" && root !== "" ? ` --root "${root.replaceAll("\\", "/")}"` : "");

/** The recovery a refused, exceptable model gets appended: the ONE record command (the PO supplies only --reason and --by), the decline path, and `list`. */
function exceptionRecoveryText({ found, alias, effort, context }) {
  const record = exceptionRecordCommand({ alias, effort, dispatchId: context.dispatchId(), root: context.root });
  const decline = "If the PO declines, no exception is recorded: re-issue the dispatch with one of the configured selectors above.";
  if (found.outcome === "broken") {
    if (found.snapshot.code === "git-common-dir-unresolved") return "";
    return ` The PO model-exception store does not verify (${found.snapshot.code}), so no exception is honoured. Repair: re-run the record command with --move-broken-store-aside (the broken file is kept beside the store, never deleted): ${record} --move-broken-store-aside. ${decline}`;
  }
  const why = found.why.length === 0 ? " (none is recorded)"
    : `: ${found.why.map((row) => `${row.id}: ${row.cause} (${row.model}, ${exceptionScopeText(row.scope)}, recorded ${row.at} by ${row.by})`).join("; ")}`;
  return ` No PO model exception is live for it${why}. If the PO wants this model for this dispatch, ask the PO for the reason and the label to record, then run exactly: ${record} `
    + `(an attribution record of the PO's request, not a signature; it changes only the model${typeof effort === "string" && effort !== "" ? " and effort" : ""} of this dispatch and ends on its own). ${decline} `
    + `\`list\` shows every exception and why one does not apply: node "${EXCEPTION_SCRIPT}" list${exceptionRootFlag(context.root)}`;
}

function selectorMatches(selector, model) {
  const wanted = normalized(selector.value);
  const given = normalized(model);
  if (given === wanted) return true;
  // An alias selector also admits the family's full model ids (`sonnet` admits `claude-sonnet-5-5`).
  if (selector.kind === "alias" && new RegExp(`^claude-${wanted}(?:-|$)`, "u").test(given)) return true;
  // C23: the tool layer carries only the family alias, so a configured full Claude model id reaches the guard as its family alias.
  return selector.kind === "model-id" && CLAUDE_FAMILY_ALIASES.includes(given) && new RegExp(`^claude-${given}(?:-|$)`, "u").test(wanted);
}

/**
 * C23 (draft ADR "a project's pipeline.user.yaml owns its routing", decision 6): where the configured effort cannot take effect the
 * dispatch warns and records the effort that really runs. The Claude host reports `effort.level` on SubagentStop where it supports the
 * field; absent, the effective effort is recorded as unobserved and no effort is claimed that was not observed. Never a refusal.
 */
export function observeEffectiveEffort({ configuredEffort, stopInput } = {}) {
  const level = stopInput?.effort?.level;
  const observed = typeof level === "string" && level.trim() !== "" ? level.trim() : null;
  const configured = typeof configuredEffort === "string" && configuredEffort.trim() !== "" ? configuredEffort.trim() : null;
  if (observed === null) {
    return { status: "unobserved", observed: null, configured, warning: { code: "DISPATCH-EFFORT-UNOBSERVED",
      message: `the effective effort of this run is unobserved: the stop carried no effort.level (the Agent tool's effort parameter needs Claude Code v2.1.292 or later, and CLAUDE_CODE_EFFORT_LEVEL beats it); the configured effort ${configured ?? "(none)"} is a request, not an observation.` } };
  }
  if (configured !== null && observed !== configured) {
    return { status: "observed", observed, configured, warning: { code: "DISPATCH-EFFORT-NOT-EFFECTIVE",
      message: `the configured effort ${configured} did not take effect: the host reports effort ${observed} for this run, which is the effort that really ran.` } };
  }
  return { status: "observed", observed, configured, warning: null };
}

/**
 * C23: the reader `compareRecordedModel` is given, so a record on a route the project's configuration names is bound at the host commit
 * too; refusing it there would throw away finished work the briefing and the guard admitted. Same breadth as the guard: any available
 * Claude duty route counts, not only the agent type's own (a differing one is the warned escalation shape). Null when nothing is readable,
 * and for anything but a v4 Claude record: a v3 record is hand-typed, and the comparison with the agent definition is what catches a mistyped one.
 */
export function configuredRecordRoute(root, { routeSource, exceptionStore } = {}) {
  return (record) => {
    if (record?.schema !== "pipeline.dispatch-record.v4" || record.runner !== "claude") return null;
    const hasRoot = typeof root === "string" && root !== "";
    if (routeSource === undefined && !hasRoot) return null;
    const source = routeSource ?? projectFunctionalTaskRoutes(root, { warn: () => {} });
    let base = null;
    if (source?.ok && Array.isArray(source.taskRoutes)) {
      const routes = source.taskRoutes.filter((route) => route.runner === "claude" && route.state !== "unavailable" && route.taskRoute.startsWith("duty."));
      base = { model: typeof record?.model === "string" && record.model.trim() !== "" && routes.some((route) => selectorMatches(route.selector, record.model)),
        effort: routes.some((route) => route.effort === record?.effort) };
    }
    if (base !== null && base.model && base.effort) return base;
    // C30G-M16: a dispatch admitted under a PO model exception recorded its use (the exception id, this dispatch id, the alias, the effort it
    // applied); the host commit accepts exactly that model and effort for exactly that dispatch, or the finished work would be refused at the end.
    const snapshot = exceptionStore ?? (hasRoot ? readModelExceptionStore(root) : null);
    const alias = aliasOfModel(record?.model, CLAUDE_FAMILY_ALIASES);
    const uses = snapshot?.ok && typeof record?.taskId === "string" ? snapshot.store.entries.filter((entry) => entry.type === "use" && entry.dispatchId === record.taskId) : [];
    const viaModel = alias !== null && uses.some((entry) => entry.model === alias);
    const viaEffort = typeof record?.effort === "string" && uses.some((entry) => entry.effort === record.effort);
    if (!viaModel && !viaEffort) return base;
    const model = base?.model === true || viaModel, effort = base?.effort === true || viaEffort;
    return { model, effort, ...((viaModel && base?.model !== true) || (viaEffort && base?.effort !== true) ? { exception: true } : {}) };
  };
}

/**
 * The route source is the project's own routing for `root` unless a caller injects one (draft ADR "a project's pipeline.user.yaml
 * owns its routing"). A fallback to the registry is reported through `warn`, else as a warning on the returned evaluation.
 */
export function evaluateDispatchModel({ root, warn, routeSource, exceptionStore, dispatchId, dispatchKey, nowFn, ...rest } = {}) {
  const notes = [];
  const source = routeSource ?? projectFunctionalTaskRoutes(root, { warn: warn ?? ((text) => notes.push(text)) });
  // The decision stays read-only: an admission under an exception comes back as `exceptionUse`, and the caller consumes it
  // (consumeModelException) only once the whole dispatch is admitted.
  const result = decideDispatchModel({ ...rest, routeSource: source, exceptions: exceptionContext({ root, runner: rest.runner, exceptionStore, dispatchId, dispatchKey, nowFn }) });
  // A tolerated conflict between two cells of one project (C23) is named beside a fallback; both are warnings, never refusals.
  const extra = [...notes.map((message) => ({ code: "DISPATCH-ROUTING-SOURCE-FALLBACK", message })),
    ...(source?.ok && Array.isArray(source.warnings) ? source.warnings.map(({ code, message }) => ({ code, message })) : [])];
  return extra.length === 0 ? result : { ...result, warnings: [...(result.warnings ?? []), ...extra] };
}

function decideDispatchModel({ runner, subagentType, model, effort, routeSource, exceptions = null } = {}) {
  if (runner === "antigravity") {
    // Antigravity's enum is routed through the explicit PO-approved nativeTier projection
    // in model-role-route-source. Concrete V3 model IDs remain a separate CLI route.
    const type = typeof subagentType === "string" && subagentType.startsWith("pipeline-core:")
      ? subagentType : `pipeline-core:${subagentType}`;
    const duties = AGENT_TYPE_DUTIES[type];
    if (!duties) {
      if (isShippedPipelineAgentType(type)) return { ok: false, skipped: null, findings: [{
        code: "DISPATCH-MODEL-ROUTE-UNAVAILABLE",
        message: `No approved Antigravity native tier is registered for ${subagentType}; do not infer one from a concrete V3 model ID.`,
      }] };
      return { ok: true, findings: [], skipped: "agent-type-not-governed" };
    }
    const routes = routeSource?.ok && Array.isArray(routeSource.taskRoutes) && duties
      ? routeSource.taskRoutes.filter((route) => route.runner === "antigravity"
        && duties.includes(route.taskRoute.startsWith("duty.") ? route.taskRoute.slice("duty.".length) : "")
        && (ANTIGRAVITY_MODELS.includes(route.nativeTier) || route.nativeTier === INHERIT_TIER)) : [];
    const expected = [...new Set(routes.map((route) => route.nativeTier))];
    // G20-43 (PO 2026-11-07): a duty whose route is `inherit` (the Critic) passes NO Model and runs on the session's model; an explicit alias
    // would only select a model of the host's own choosing (measured), so it is refused with the repair "omit Model".
    if (expected.length > 0 && expected.every((tier) => tier === INHERIT_TIER)) {
      const omitted = model === undefined || model === null || model === "" || model === "inherit";
      return omitted ? { ok: true, findings: [], skipped: null } : { ok: false, skipped: null, findings: [{ code: "DISPATCH-MODEL-DUTY-MISMATCH",
        message: `Antigravity Subagents[].Model for ${subagentType} must be omitted: its configured duty route inherits the session model. Re-issue that entry with no Model (omit Model).`,
      }] };
    }
    if (!ANTIGRAVITY_MODELS.includes(model)) {
      return { ok: false, skipped: null, findings: [{
        code: model === undefined || model === null || model === "" || model === "inherit"
          ? "DISPATCH-MODEL-MISSING" : "DISPATCH-MODEL-UNROUTED",
        message: `Antigravity Subagents[].Model must be explicitly set to "flash_lite", "flash", or "pro" for each entry; "inherit" and omitted values inherit the session model. ${expected.length > 0 ? `The configured route for ${type} selects ${expected.map((value) => `"${value}"`).join(" or ")}. ` : ""}Re-issue the same invoke_subagent call with each entry's Model set explicitly.`,
      }] };
    }
    if (expected.length === 0) {
      return { ok: false, skipped: null, findings: [{ code: "DISPATCH-MODEL-ROUTE-UNAVAILABLE",
        message: `No approved Antigravity native tier is registered for ${subagentType}; do not infer one from a concrete V3 model ID.`,
      }] };
    }
    if (!expected.includes(model)) {
      return { ok: false, skipped: null, findings: [{ code: "DISPATCH-MODEL-DUTY-MISMATCH",
        message: `Antigravity Subagents[].Model for ${subagentType} must match its configured duty selector (${expected.map((value) => `"${value}"`).join(" or ")}). Re-issue that entry with Model set to the configured selector.`,
      }] };
    }
    return { ok: true, findings: [], skipped: null };
  }
  if (!ENFORCED_RUNNERS.includes(runner)) return { ok: true, findings: [], skipped: "runner-not-enforced" };
  if (!routeSource?.ok || !Array.isArray(routeSource.taskRoutes)) return { ok: true, findings: [], skipped: "route-source-unavailable" };
  const available = routeSource.taskRoutes.filter((route) => route.runner === runner && route.state !== "unavailable");
  if (available.length === 0) return { ok: true, findings: [], skipped: "route-source-unavailable" };
  const dutyRoutes = available.filter((route) => route.taskRoute.startsWith("duty."));
  const allSelectors = [...new Set(dutyRoutes.map((route) => route.selector.value))];
  const defaultSelector = dutyRoutes.find((route) => route.taskRoute === "duty.implement")?.selector.value ?? allSelectors[0];
  const hasModel = typeof model === "string" && model.trim() !== "";
  // G20-70 (Claude greenfield 2026-11-08): a Critic dispatch without a model was told "implementation work uses
  // duty.implement", the selector of another role. A plugin agent type that serves a configured duty names that duty's
  // own selector; only an agent type with no duty of its own keeps the implementation default.
  const ownDuties = AGENT_TYPE_DUTIES[subagentType];
  const ownRoutes = ownDuties ? dutyRoutes.filter((route) => ownDuties.includes(route.taskRoute.slice("duty.".length))) : [];
  if (!hasModel) {
    // The same greenfield then met DISPATCH-OPUS-NO-BATCH-RATIONALE (MP-07, dispatch-policy.mjs) after following an Opus route,
    // so a Critic route on the Opus tier names that prompt condition in the same breath.
    const opusCritic = subagentType === "pipeline-core:critic" && ownRoutes.some((route) => /\bopus\b/iu.test(route.selector.value));
    const routeHint = ownRoutes.length > 0
      ? `${subagentType} serves ${ownRoutes.map((route) => `${route.taskRoute} = "${route.selector.value}"`).join(" / ")}`
        + (opusCritic ? `; an Opus Critic prompt also needs a non-empty \`Batch scope (MP-07):\` line and a rationale line naming critical architecture or security (else DISPATCH-OPUS-NO-BATCH-RATIONALE)` : "")
      : `implementation work uses duty.implement = "${defaultSelector}"`;
    return { ok: false, skipped: null, findings: [{
      code: "DISPATCH-MODEL-MISSING",
      message: `the dispatch names no model, so it would inherit the session's model; the configured routing decides the model, not the dispatcher. `
        + `Re-issue the same dispatch with the tool-layer \`model\` parameter set to one of the configured selectors (${allSelectors.map((value) => `"${value}"`).join(", ")}; `
        + `${routeHint}).`,
    }] };
  }
  // The model's family alias is the only thing a PO model exception can name; a model with no such alias can never be excepted.
  const alias = exceptions === null ? null : aliasOfModel(model, CLAUDE_FAMILY_ALIASES);
  let modelException = null;
  if (!dutyRoutes.some((route) => selectorMatches(route.selector, model))) {
    const found = alias === null ? null : exceptions.find(alias);
    if (found?.outcome === "live") {
      modelException = found;
    } else {
      return { ok: false, skipped: null, findings: [{
        code: "DISPATCH-MODEL-UNROUTED",
        message: `the dispatch names model "${model}", which no available configured route selects. `
          + `Re-issue it with one of the configured selectors: ${allSelectors.map((value) => `"${value}"`).join(", ")}.`
          + (found === null ? "" : exceptionRecoveryText({ found, alias, effort, context: exceptions })),
      }] };
    }
  }
  const routes = ownRoutes;
  const warnings = [];
  if (modelException === null && routes.length > 0 && !routes.some((route) => selectorMatches(route.selector, model))) {
    const expected = [...new Set(routes.map((route) => `"${route.selector.value}"`))].join(" or ");
    // A configured but different selector is the MP-05/MP-07 escalation shape (a stated tier change), so it
    // warns instead of refusing; a model no route selects, or none at all, still refuses.
    warnings.push({
      code: "DISPATCH-MODEL-DUTY-MISMATCH",
      message: `agent type ${subagentType} serves ${routes.map((route) => route.taskRoute).join(" / ")}, which the configuration routes to ${expected}, but the dispatch names "${model}". `
        + `Keep it only as a stated MP-05/MP-07 escalation; otherwise re-issue the dispatch with \`model\` set to ${expected}.`,
    });
  }
  // C23: the Agent tool's per-invocation `effort` is admitted. One the configuration does not name for the duty is a warning, never a refusal.
  let effortApplied = null;
  if (typeof effort === "string" && effort.trim() !== "" && routes.length > 0 && !routes.some((route) => route.effort === effort)) {
    // C30G-M16: the effort an exception for this model names is admitted under that exception, not as an unexplained escalation.
    const effortFound = modelException ?? (alias === null ? null : exceptions.find(alias));
    if (effortFound?.outcome === "live" && effortFound.exception.effort === effort) {
      modelException = effortFound;
      effortApplied = effort;
    } else {
      const configured = [...new Set(routes.map((route) => `"${route.effort}"`))].join(" or ");
      warnings.push({
        code: "DISPATCH-EFFORT-DUTY-MISMATCH",
        message: `agent type ${subagentType} serves ${routes.map((route) => route.taskRoute).join(" / ")}, which the configuration runs at effort ${configured}, but the dispatch names effort "${effort}". `
          + `Keep it only as a stated MP-05/MP-07 escalation; otherwise re-issue the dispatch with \`effort\` set to ${configured}.`,
      });
    }
  }
  if (modelException === null) return warnings.length === 0 ? { ok: true, findings: [], skipped: null } : { ok: true, skipped: null, findings: [], warnings };
  const granted = modelException.exception;
  warnings.unshift({
    code: "DISPATCH-MODEL-EXCEPTION",
    message: `model exception: ${alias}, requested by the PO at ${granted.at} (${granted.by}); exception ${granted.id} for ${exceptionScopeText(granted.scope)}, reason: ${granted.reason}. `
      + `It changes only the model ${model}${effortApplied === null ? "" : ` and effort ${effortApplied}`} of this dispatch; the agent type, tools, prompt checks, the budget guard and every other guard are unchanged. `
      + "It is an attribution record of the PO's request (not a signature), kept in the model-exception store; `list` shows it.",
  });
  return { ok: true, skipped: null, findings: [], warnings, exceptionUse: exceptions.use(modelException, alias, effortApplied) };
}

export function dispatchModelRefusalText(evaluation) {
  const lines = evaluation.findings.map((finding) => `${finding.code}: ${finding.message}`);
  if (lines.some((line) => line.includes("Antigravity Subagents[].Model"))) return `BLOCKED (guard-dispatch): ${lines.join("\n")}\n`;
  return `BLOCKED (guard-dispatch): ${lines.join("\n")}\nTo repair: pass the tool-layer \`model\` parameter on the dispatch call (the briefing text alone does not set it; MP-29).\n`;
}

export function dispatchModelWarningText(evaluation) {
  return (evaluation.warnings ?? []).map((warning) => `WARNING (guard-dispatch): ${warning.code}: ${warning.message}\n`).join("");
}
