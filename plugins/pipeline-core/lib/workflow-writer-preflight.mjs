/**
 * Deterministic preflight for workflow/runner dispatch adapters.
 *
 * This boundary deliberately does not intercept local or serial writers.  A
 * caller must pass a complete, calibrated request; every malformed or
 * unsupported form is rejected before an adapter can be invoked.
 */

const MODES = new Set(["read-only", "bounded-write", "isolated-write"]);
const FILESYSTEM_EFFECT = {
  "read-only": "none",
  "bounded-write": "bounded",
  "isolated-write": "isolated",
};

function reject(code, escalationTarget) {
  return { ok: false, code, escalationTarget };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

const ESCALATION_TARGETS = new Set(["PO", "SECURITY", "WORKFLOW-OWNER"]);

function canonicalPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return false;
  const seen = new Set();
  for (const entry of paths) {
    if (!nonEmptyString(entry)
      || entry === "."
      || entry.includes("\\")
      || entry.startsWith("/")
      || /^[A-Za-z]:/.test(entry)
      || entry.startsWith("./")
      || entry.split("/").includes(".")
      || entry.split("/").includes("..")
      || entry.split("/").includes("")) return false;
    if (seen.has(entry)) return false;
    seen.add(entry);
  }
  return true;
}

function exactSideEffects(mode, sideEffects) {
  if (!isObject(sideEffects) || Object.keys(sideEffects).length !== 2) return false;
  return sideEffects.filesystem === FILESYSTEM_EFFECT[mode]
    && (sideEffects.network === "none" || sideEffects.network === "declared");
}

function taskTightAllowlist(taskId, allowlist) {
  if (!nonEmptyString(taskId) || !Array.isArray(allowlist) || allowlist.length === 0) return false;
  const ids = new Set();
  return allowlist.every((entry) => isObject(entry)
    && nonEmptyString(entry.id)
    && nonEmptyString(entry.command)
    && entry.taskId === taskId
    && !ids.has(entry.id)
    && entry.command.includes(" ")
    && !(/[|;&`$*<>\n\r]/.test(entry.command))
    && (ids.add(entry.id), true));
}

function exactVerify(verify, calibratedEntrypoints) {
  if (!isObject(verify) || verify.exact !== true) return false;
  if (nonEmptyString(verify.command) && Object.keys(verify).length === 2) return true;
  return nonEmptyString(verify.entrypoint)
    && Object.keys(verify).length === 2
    && Array.isArray(calibratedEntrypoints)
    && calibratedEntrypoints.includes(verify.entrypoint);
}

/**
 * Validate a workflow/runner dispatch without invoking its adapter.
 *
 * @param {object} request structured dispatch contract
 * @param {object} calibration project-calibrated requirements
 * @param {object} capabilities adapter/environment capability evidence
 * @returns {{ok: true, request: object}|{ok: false, code: string, escalationTarget?: string}}
 */
export function validateWorkflowWriterDispatch(request, calibration, capabilities) {
  const escalationTarget = isObject(request) && nonEmptyString(request.escalationTarget)
    ? request.escalationTarget : undefined;
  if (!isObject(request) || !isObject(calibration) || !isObject(capabilities)) {
    return reject("WF-MALFORMED", escalationTarget);
  }
  if (!MODES.has(request.mode)) return reject("WF-MODE", escalationTarget);
  if (!exactSideEffects(request.mode, request.sideEffects)) return reject("WF-SIDE-EFFECTS", escalationTarget);
  if (!canonicalPaths(request.allowedPaths)) return reject("WF-PATHS", escalationTarget);
  if (!isObject(request.isolation) || !nonEmptyString(request.isolation.kind) || request.isolation.verified !== true) {
    return reject("WF-ISOLATION", escalationTarget);
  }
  if (!isObject(calibration.isolationByMode)
    || calibration.isolationByMode[request.mode] !== request.isolation.kind
    || capabilities.isolation?.[request.isolation.kind] !== true) {
    return reject("WF-ISOLATION", escalationTarget);
  }
  if (!isObject(request.guard) || !nonEmptyString(request.guard.id) || request.guard.active !== true
    || !Array.isArray(request.guard.modes) || !request.guard.modes.includes(request.mode)
    || capabilities.guards?.[request.guard.id] !== true) {
    return reject("WF-GUARD", escalationTarget);
  }
  if (!taskTightAllowlist(request.taskId, request.commandAllowlist)) return reject("WF-ALLOWLIST", escalationTarget);
  if (!exactVerify(request.verify, calibration.verifyEntrypoints)) return reject("WF-VERIFY", escalationTarget);
  if (!ESCALATION_TARGETS.has(request.escalationTarget)) return reject("WF-ESCALATION", escalationTarget);

  if (request.mode === "read-only" && capabilities.noWriteEnforced !== true) {
    return reject("WF-NO-WRITE", escalationTarget);
  }
  if (request.mode === "bounded-write") {
    const required = calibration.boundedWriteControls;
    const actual = capabilities.boundedWriteControls;
    if (calibration.boundedWriteAllowed !== true || !Array.isArray(required) || required.length === 0
      || !isObject(actual) || !required.every((control) => nonEmptyString(control) && actual[control] === true)) {
      return reject("WF-BOUNDED-CAPABILITY", escalationTarget);
    }
  }
  if (request.mode === "isolated-write"
    && (capabilities.isolatedWorktree !== true || capabilities.hooks?.[request.guard.id] !== true)) {
    return reject("WF-ISOLATED-CAPABILITY", escalationTarget);
  }
  return { ok: true, request };
}

export const WORKFLOW_WRITER_PREFLIGHT_CODES = Object.freeze([
  "WF-MALFORMED", "WF-MODE", "WF-SIDE-EFFECTS", "WF-PATHS", "WF-ISOLATION",
  "WF-GUARD", "WF-ALLOWLIST", "WF-VERIFY", "WF-ESCALATION", "WF-NO-WRITE",
  "WF-BOUNDED-CAPABILITY", "WF-ISOLATED-CAPABILITY",
]);
