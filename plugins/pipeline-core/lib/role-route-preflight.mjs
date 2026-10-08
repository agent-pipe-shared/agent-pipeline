// SPDX-License-Identifier: SUL-1.0
/**
 * Per-runner, per-role route preflight (AC-29; R4-1, R4-2, R4-12).
 *
 * A PURE view: this module imports nothing, reads no file and starts no
 * process. The caller supplies the registry projection (the output of
 * `registeredFunctionalTaskRoutes`) and the host observations; the result is a
 * closed `pipeline.role-route-preflight.v1` verdict, one entry per role.
 *
 * Report-only (PO decision BD). A role nobody observed is the typed state
 * `unavailable` with a reason code; the result stays `ok: true`. Only input
 * that cannot be judged at all fails closed: a broken source (its own
 * `MODEL-ROLE-*` code passes through), an unknown runner, or an observations
 * container that is not a plain record of known roles. A failure carries no
 * `roles` member, so it can never be read as a role verdict.
 *
 * Shapes and the latitude taken where the task contract leaves them open:
 *  - roles: advisor, critic, goldfish.implement, goldfish.mechanic,
 *    goldfish.deep, readiness, plan-verifier. Registry roles map to a duty
 *    task route and are matched by `taskRoute`, never by the `role` field.
 *    plan-verifier has no registry duty: it can only become `native` from a
 *    host observation, and reports `RRP-ROLE-NOT-REGISTERED` without one.
 *  - observation per role: exactly `{ kind, evidenceSha256,
 *    hookRecordedStart, hookRecordedTerminal }`. A supplied but malformed
 *    entry is that role's own `unavailable` / `RRP-OBSERVATION-INVALID`.
 *  - `fallback-self-dispatch` is legal only where the source carries an
 *    explicit fallback task route for that role on that runner (today the
 *    Claude advisor). Any other role, or a runner without such a route, is
 *    `unavailable` / `RRP-FALLBACK-ROLE-NOT-ALLOWED`. Each observation kind is
 *    judged against its own route cell: a fallback is not blocked by the
 *    native cell and a native claim is not rescued by the fallback cell.
 *  - a Critic claimed `native` needs BOTH a hook-recorded start and a
 *    hook-recorded terminal. The design names Claude and Antigravity; this
 *    module applies it to every runner, because a native claim whose hook did
 *    not record start and terminal is not proof on any of them. Missing either
 *    is reported `RRP-NO-HOST-OBSERVATION`, report-only.
 *  - an `unavailable` verdict always carries `evidence: ""`; `evidence` is the
 *    supplied digest only for the observation a `native` or
 *    `fallback-self-dispatch` verdict rests on.
 *  - the runner is valid when the source itself lists task routes for it (no
 *    runner list is duplicated here); the source and runner codes are the ones
 *    `functionalTaskRoutesForRunner` already uses.
 */

export const ROLE_ROUTE_PREFLIGHT_SCHEMA = "pipeline.role-route-preflight.v1";

export const ROLE_ROUTE_PREFLIGHT_ROLES = Object.freeze([
  "advisor", "critic", "goldfish.implement", "goldfish.mechanic", "goldfish.deep", "readiness", "plan-verifier",
]);

export const ROLE_ROUTE_PREFLIGHT_STATES = Object.freeze(["native", "fallback-self-dispatch", "unavailable"]);

export const ROLE_ROUTE_PREFLIGHT_CODES = Object.freeze({
  nativeObserved: "RRP-NATIVE-OBSERVED",
  routeCellUnavailable: "RRP-ROUTE-CELL-UNAVAILABLE",
  fallbackAdvisorConsult: "RRP-FALLBACK-ADVISOR-CONSULT",
  fallbackRoleNotAllowed: "RRP-FALLBACK-ROLE-NOT-ALLOWED",
  noHostObservation: "RRP-NO-HOST-OBSERVATION",
  roleNotRegistered: "RRP-ROLE-NOT-REGISTERED",
  observationInvalid: "RRP-OBSERVATION-INVALID",
});

const NATIVE_ROUTE = Object.freeze({
  advisor: "duty.advisory",
  critic: "duty.critic_normal",
  "goldfish.implement": "duty.implement",
  "goldfish.mechanic": "duty.mechanic",
  "goldfish.deep": "duty.deep",
  readiness: "duty.readiness",
});
const FALLBACK_ROUTE = Object.freeze({ advisor: "duty.advisory.fallback" });
const CELL_STATES = Object.freeze(["default", "opt-in", "unavailable"]);
const OBSERVATION_KINDS = Object.freeze(["native", "fallback-self-dispatch"]);
const OBSERVATION_KEYS = Object.freeze(["evidenceSha256", "hookRecordedStart", "hookRecordedTerminal", "kind"]);
const SOURCE_CODE = /^MODEL-ROLE-[A-Z]+(?:-[A-Z]+)*$/u;
const DIGEST = /^[0-9a-f]{64}$/u;

const SOURCE_INVALID = "MODEL-ROLE-ROUTE-SOURCE-INVALID";
const SOURCE_INCOMPLETE = "MODEL-ROLE-ROUTE-SOURCE-INCOMPLETE";
const SOURCE_CONFLICT = "MODEL-ROLE-ROUTE-SOURCE-CONFLICT";
const RUNNER_INVALID = "MODEL-ROLE-RUNNER-SOURCE-INVALID";
const RUNNER_EMPTY = "MODEL-ROLE-RUNNER-SOURCE-EMPTY";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const failure = (code) => ({ schema: ROLE_ROUTE_PREFLIGHT_SCHEMA, ok: false, code });
const unavailable = (reasonCode) => ({ state: "unavailable", reasonCode, evidence: "" });

/** The failure code of a source that is not a usable registry projection, or null. */
function sourceFailureCode(source) {
  if (!isRecord(source)) return SOURCE_INVALID;
  if (source.ok === true) return null;
  return typeof source.code === "string" && SOURCE_CODE.test(source.code) ? source.code : SOURCE_INVALID;
}

/** Task route -> cell state for one runner, or a failure code. */
function indexRunnerRoutes(source, runner) {
  if (!Array.isArray(source.taskRoutes) || !Array.isArray(source.configuredRoutes) || typeof runner !== "string") {
    return { code: RUNNER_INVALID };
  }
  const own = source.taskRoutes.filter((route) => isRecord(route) && route.runner === runner);
  if (own.length === 0) return { code: RUNNER_INVALID };
  if (!source.configuredRoutes.some((route) => isRecord(route) && route.runner === runner)) {
    return { code: RUNNER_EMPTY };
  }
  const routes = new Map();
  for (const route of own) {
    if (typeof route.taskRoute !== "string" || !CELL_STATES.includes(route.state)) return { code: SOURCE_INVALID };
    if (routes.has(route.taskRoute)) return { code: SOURCE_CONFLICT };
    routes.set(route.taskRoute, route.state);
  }
  for (const taskRoute of Object.values(NATIVE_ROUTE)) {
    if (!routes.has(taskRoute)) return { code: SOURCE_INCOMPLETE };
  }
  return { routes };
}

/** Classify one supplied observation: absent, malformed, or a well-formed claim. */
function classifyObservation(raw) {
  if (raw === undefined || raw === null) return { absent: true };
  if (!isRecord(raw)) return { invalid: true };
  const keys = Object.keys(raw).sort();
  if (keys.length !== OBSERVATION_KEYS.length || keys.some((key, index) => key !== OBSERVATION_KEYS[index])) {
    return { invalid: true };
  }
  if (!OBSERVATION_KINDS.includes(raw.kind) || typeof raw.evidenceSha256 !== "string" || !DIGEST.test(raw.evidenceSha256)
    || typeof raw.hookRecordedStart !== "boolean" || typeof raw.hookRecordedTerminal !== "boolean") {
    return { invalid: true };
  }
  return { kind: raw.kind, evidence: raw.evidenceSha256, start: raw.hookRecordedStart, terminal: raw.hookRecordedTerminal };
}

function evaluateRole(role, rawObservation, routes) {
  const observation = classifyObservation(rawObservation);
  if (observation.kind === "fallback-self-dispatch") {
    const fallbackRoute = FALLBACK_ROUTE[role];
    if (fallbackRoute === undefined || !routes.has(fallbackRoute)) {
      return unavailable(ROLE_ROUTE_PREFLIGHT_CODES.fallbackRoleNotAllowed);
    }
    if (routes.get(fallbackRoute) === "unavailable") return unavailable(ROLE_ROUTE_PREFLIGHT_CODES.routeCellUnavailable);
    return { state: "fallback-self-dispatch", reasonCode: ROLE_ROUTE_PREFLIGHT_CODES.fallbackAdvisorConsult, evidence: observation.evidence };
  }
  const nativeRoute = NATIVE_ROUTE[role];
  if (nativeRoute !== undefined && routes.get(nativeRoute) === "unavailable") {
    return unavailable(ROLE_ROUTE_PREFLIGHT_CODES.routeCellUnavailable);
  }
  if (observation.absent) {
    return unavailable(nativeRoute === undefined
      ? ROLE_ROUTE_PREFLIGHT_CODES.roleNotRegistered : ROLE_ROUTE_PREFLIGHT_CODES.noHostObservation);
  }
  if (observation.invalid) return unavailable(ROLE_ROUTE_PREFLIGHT_CODES.observationInvalid);
  if (role === "critic" && !(observation.start && observation.terminal)) {
    return unavailable(ROLE_ROUTE_PREFLIGHT_CODES.noHostObservation);
  }
  return { state: "native", reasonCode: ROLE_ROUTE_PREFLIGHT_CODES.nativeObserved, evidence: observation.evidence };
}

/**
 * @param {{ source: object, runner: string, hostObservations?: object }} input
 * @returns {object} `{ schema, ok: true, runner, roles }` or `{ schema, ok: false, code }`
 */
export function evaluateRoleRoutePreflight(input) {
  if (!isRecord(input)) return failure(SOURCE_INVALID);
  const { source, runner, hostObservations } = input;
  const sourceCode = sourceFailureCode(source);
  if (sourceCode !== null) return failure(sourceCode);
  const indexed = indexRunnerRoutes(source, runner);
  if (indexed.code !== undefined) return failure(indexed.code);
  const observations = hostObservations ?? {};
  if (!isRecord(observations) || Object.keys(observations).some((key) => !ROLE_ROUTE_PREFLIGHT_ROLES.includes(key))) {
    return failure(ROLE_ROUTE_PREFLIGHT_CODES.observationInvalid);
  }
  const roles = {};
  for (const role of ROLE_ROUTE_PREFLIGHT_ROLES) {
    roles[role] = evaluateRole(role, Object.hasOwn(observations, role) ? observations[role] : undefined, indexed.routes);
  }
  return { schema: ROLE_ROUTE_PREFLIGHT_SCHEMA, ok: true, runner, roles };
}
