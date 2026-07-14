/**
 * Provider-neutral synthetic workflow boundary.
 *
 * This is the only Shared-Core entry point that may invoke an injected
 * workflow adapter. It accepts no network, credential, provider, or source
 * transport data; real adapters need a later, separately approved boundary.
 */
import { validateWorkflowWriterDispatch } from "./workflow-writer-preflight.mjs";

const DISPATCH_KEYS = new Set(["request", "calibration", "capabilities"]);
const REQUEST_KEYS = new Set([
  "taskId", "mode", "sideEffects", "allowedPaths", "isolation", "guard",
  "commandAllowlist", "verify", "escalationTarget",
]);
const CALIBRATION_KEYS = new Set([
  "isolationByMode", "boundedWriteAllowed", "boundedWriteControls", "verifyEntrypoints",
]);
const CAPABILITY_KEYS = new Set([
  "isolation", "guards", "hooks", "noWriteEnforced", "isolatedWorktree", "boundedWriteControls",
]);
const ADAPTER_KEYS = new Set(["capabilities", "invoke"]);
const ADAPTER_CAPABILITY_KEYS = new Set(["noRemote", "noCredentials", "noFetch"]);
const FORBIDDEN_TRANSPORT_KEY = /(?:^|[-_])(source|origin|remote|provider|credential|token|key|secret|auth|account|repo(?:sitory)?|url|uri|header|cookie|proxy|host|fetch)(?:$|[-_])/i;
const FORBIDDEN_TRANSPORT_REFERENCE = /(?:https?:\/\/|ssh:\/\/|git@|(?:token|credential|authorization|cookie)\s*[=:]|\bgit\s+(?:fetch|push|pull|clone|remote)\b|\b(?:curl|wget)\b)/i;
const PREFLIGHT_CODE_MAP = Object.freeze({
  "WF-MALFORMED": "WR-WF-MALFORMED", "WF-MODE": "WR-WF-MODE",
  "WF-SIDE-EFFECTS": "WR-WF-SIDE-EFFECTS", "WF-PATHS": "WR-WF-PATHS",
  "WF-ISOLATION": "WR-WF-ISOLATION", "WF-GUARD": "WR-WF-GUARD",
  "WF-ALLOWLIST": "WR-WF-ALLOWLIST", "WF-VERIFY": "WR-WF-VERIFY",
  "WF-ESCALATION": "WR-WF-ESCALATION", "WF-NO-WRITE": "WR-WF-NO-WRITE",
  "WF-BOUNDED-CAPABILITY": "WR-WF-BOUNDED-CAPABILITY",
  "WF-ISOLATED-CAPABILITY": "WR-WF-ISOLATED-CAPABILITY",
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  return isObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function exactKeyCount(value, allowed) {
  return exactKeys(value, allowed) && Object.keys(value).length === allowed.size;
}

function safeBooleanMap(value) {
  return isObject(value) && Object.entries(value).every(([key, enabled]) => /^[a-z][a-z0-9-]*$/.test(key) && typeof enabled === "boolean");
}

function completeCoordinatorShape(dispatch) {
  const { request, calibration, capabilities } = dispatch;
  const validVerify = exactKeyCount(request.verify, new Set(["exact", "command"]))
    || exactKeyCount(request.verify, new Set(["exact", "entrypoint"]));
  return exactKeyCount(request.sideEffects, new Set(["filesystem", "network"]))
    && exactKeyCount(request.isolation, new Set(["kind", "verified"]))
    && exactKeyCount(request.guard, new Set(["id", "active", "modes"]))
    && Array.isArray(request.commandAllowlist)
    && request.commandAllowlist.every((entry) => exactKeyCount(entry, new Set(["id", "taskId", "command"])))
    && validVerify
    && exactKeyCount(calibration.isolationByMode, new Set(["read-only", "bounded-write", "isolated-write"]))
    && Array.isArray(calibration.boundedWriteControls)
    && Array.isArray(calibration.verifyEntrypoints)
    && safeBooleanMap(capabilities.isolation)
    && safeBooleanMap(capabilities.guards)
    && safeBooleanMap(capabilities.hooks)
    && safeBooleanMap(capabilities.boundedWriteControls);
}

function reject(code, mode, adapterInvocations = 0) {
  return { ok: false, code, mode: typeof mode === "string" ? mode : "unknown", adapterInvocations };
}

function containsForbiddenTransport(value, seen = new Set()) {
  if (typeof value === "string") return FORBIDDEN_TRANSPORT_REFERENCE.test(value);
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_TRANSPORT_KEY.test(key) || containsForbiddenTransport(nested, seen)) return true;
  }
  return false;
}

function validAdapter(adapter) {
  return exactKeys(adapter, ADAPTER_KEYS)
    && typeof adapter.invoke === "function"
    && exactKeys(adapter.capabilities, ADAPTER_CAPABILITY_KEYS)
    && adapter.capabilities.noRemote === true
    && adapter.capabilities.noCredentials === true
    && adapter.capabilities.noFetch === true;
}

/**
 * Validate and run one synthetic coordinator dispatch through the P5 preflight.
 *
 * The adapter result is deliberately not returned: it could be untrusted and
 * could leak transport data. The stable receipt is codes, mode and call count.
 */
export function runSyntheticWorkflowDispatch(dispatch, adapter) {
  const mode = isObject(dispatch?.request) ? dispatch.request.mode : undefined;
  if (!exactKeys(dispatch, DISPATCH_KEYS)
    || !exactKeys(dispatch.request, REQUEST_KEYS)
    || !exactKeys(dispatch.calibration, CALIBRATION_KEYS)
    || !exactKeys(dispatch.capabilities, CAPABILITY_KEYS)
    || !completeCoordinatorShape(dispatch)
    || containsForbiddenTransport(dispatch)) {
    return reject("WR-SCHEMA", mode);
  }
  if (dispatch.request.sideEffects.network !== "none") return reject("WR-SCHEMA", mode);
  if (!validAdapter(adapter)) return reject("WR-ADAPTER-CAPABILITY", mode);

  const preflight = validateWorkflowWriterDispatch(
    dispatch.request,
    dispatch.calibration,
    dispatch.capabilities,
  );
  if (!preflight.ok) return reject(PREFLIGHT_CODE_MAP[preflight.code] ?? "WR-PREFLIGHT", mode);

  try {
    adapter.invoke(dispatch.request);
  } catch {
    return reject("WR-ADAPTER-FAILED", dispatch.request.mode, 1);
  }
  return { ok: true, code: "WR-ACCEPTED", mode: dispatch.request.mode, adapterInvocations: 1 };
}

export const WORKFLOW_RUNNER_CODES = Object.freeze([
  "WR-SCHEMA", "WR-ADAPTER-CAPABILITY", "WR-PREFLIGHT", "WR-ADAPTER-FAILED", "WR-ACCEPTED",
  ...Object.values(PREFLIGHT_CODE_MAP),
]);
