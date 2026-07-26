// SPDX-License-Identifier: SUL-1.0

/**
 * Closed App-Server component mapping for the Codex onboarding lifecycle.
 *
 * A daemon observation is capability evidence only. It never attests a model
 * child, worker, thread, background wakeup, or dispatch.
 */
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CODEX_APP_SERVER_DOCTOR_SCHEMA,
  CODEX_APP_SERVER_HEALTH_SCHEMA,
  observeCodexAppServer,
} from "../scripts/codex-app-server-health.mjs";

const HEALTH_SCRIPT = fileURLToPath(new URL("../scripts/codex-app-server-health.mjs", import.meta.url));
const INTENTS = new Set(["onboarding", "bootstrap", "session", "dispatch"]);
const EXECUTION_DENIED = new Set(["EPERM", "EACCES", "EROFS"]);
const RECOVER_CODES = new Set([
  "CAS-DAEMON-UNREACHABLE",
  "CAS-DAEMON-INVALID-OBSERVATION",
  "CAS-DAEMON-VERSION-DRIFT",
]);
const DOCTOR_CODES = new Set([
  "CAS-CODEX-UNAVAILABLE",
  "CAS-DAEMON-RECOVERY-FAILED",
]);
const CAS_CODE = /^CAS-[A-Z0-9-]+$/u;

export class CodexOnboardingAppServerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CodexOnboardingAppServerError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CodexOnboardingAppServerError(code, message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function component(required, status, code) {
  return { required, status, code };
}

function sanitizedCode(observation) {
  return isObject(observation)
    && observation.schema === CODEX_APP_SERVER_HEALTH_SCHEMA
    && typeof observation.code === "string"
    && CAS_CODE.test(observation.code)
    ? observation.code
    : "CAS-UNKNOWN";
}

/** Map one already-observed health envelope into the exact public component. */
export function mapCodexAppServerObservation(observation, { required = true } = {}) {
  if (required !== true) return component(false, "not-requested", null);
  const code = sanitizedCode(observation);
  if (code === "CAS-READY") {
    return observation?.status === "ready"
      ? component(true, "running", code)
      : component(true, "unavailable", "CAS-UNKNOWN");
  }
  if (code === "CAS-EXECUTION-UNAVAILABLE") {
    return component(
      true,
      EXECUTION_DENIED.has(observation?.detail) ? "execution-denied" : "unavailable",
      code,
    );
  }
  if (code === "CAS-DAEMON-UNREACHABLE") return component(true, "not-running", code);
  return component(true, "unavailable", code);
}

/**
 * Observe exactly once for required intents. Onboarding intentionally makes no
 * App-Server call because this capability is not required for portable writes.
 */
export function observeOnboardingAppServer({
  intent,
  observe = observeCodexAppServer,
  observationOptions = {},
} = {}) {
  if (!INTENTS.has(intent)) fail("COAS-INTENT", "App-Server intent is invalid");
  if (intent === "onboarding") return component(false, "not-requested", null);
  let observation;
  try {
    observation = observe(observationOptions);
  } catch {
    observation = null;
  }
  return mapCodexAppServerObservation(observation, { required: true });
}

function commandAction(healthScript, flag, {
  mutation,
  requiresConfirmation,
  schema,
  statuses,
}) {
  if (!isAbsolute(healthScript)) fail("COAS-SCRIPT", "App-Server health script must be absolute");
  return {
    kind: "command",
    executable: "node",
    argv: [healthScript, flag],
    mutation,
    requiresConfirmation,
    expected: { schema, statuses },
  };
}

function validComponent(value) {
  if (!isObject(value) || Object.keys(value).length !== 3 || typeof value.required !== "boolean") return false;
  if (value.required === false) {
    return value.status === "not-requested" && value.code === null;
  }
  if (typeof value.code !== "string" || !CAS_CODE.test(value.code)) return false;
  if (value.status === "running") return value.code === "CAS-READY";
  if (value.status === "execution-denied") return value.code === "CAS-EXECUTION-UNAVAILABLE";
  if (value.status === "not-running") return value.code === "CAS-DAEMON-UNREACHABLE";
  return value.status === "unavailable"
    && value.code !== "CAS-READY"
    && value.code !== "CAS-DAEMON-UNREACHABLE";
}

/** Return only the recovery action permitted by the approved closed mapping. */
export function appServerNextAction(value, { healthScript = HEALTH_SCRIPT } = {}) {
  if (!validComponent(value)) {
    fail("COAS-COMPONENT", "App-Server component is invalid");
  }
  if (value.required === false || value.status === "running" || value.status === "execution-denied") {
    return null;
  }
  if (RECOVER_CODES.has(value.code)) {
    return commandAction(healthScript, "--recover", {
      mutation: true,
      requiresConfirmation: true,
      schema: CODEX_APP_SERVER_HEALTH_SCHEMA,
      statuses: ["ready", "unavailable", "stale"],
    });
  }
  if (DOCTOR_CODES.has(value.code)) {
    return commandAction(healthScript, "--doctor", {
      mutation: false,
      requiresConfirmation: false,
      schema: CODEX_APP_SERVER_DOCTOR_SCHEMA,
      statuses: ["completed", "failed"],
    });
  }
  return null;
}
