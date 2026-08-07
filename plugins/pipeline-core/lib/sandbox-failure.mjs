// SPDX-License-Identifier: SUL-1.0

/** Closed, sanitized projection shared by sandbox and runner adapters. */
export const SANDBOX_FAILURE_SCHEMA = "pipeline.sandbox-failure.v1";
const CODES = new Set([
  "unix_socket_bind_denied",
  "sandbox_permission_denied_unknown",
  "sandbox_spawn_failed",
  "sandbox_command_failed",
  "sandbox_probe_failed",
  "sandbox_malformed_output",
  "sandbox_output_truncated",
  "sandbox_timeout",
  "sandbox_cleanup_failed",
  "sandbox_transport_failed",
]);
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA = /^[0-9a-f]{64}$/;
const FIELDS = ["schema", "failureCode", "capability", "operation", "osCode", "syscall", "resourceClass", "locationClass", "runnerClass", "adapterTrace", "originLayer", "executionBoundary", "permissionPosture", "evidenceSource", "probeVersion", "retryClass", "partialEffect", "rawDiagnosticsAvailable"];

function safe(v) { return typeof v === "string" && v.length <= 64 && SAFE.test(v); }
export function sanitizeSandboxFailure(input = {}, outerAdapter = null) {
  const inner = input && typeof input === "object" ? input : {};
  const trace = Array.isArray(inner.adapterTrace) ? inner.adapterTrace.filter(safe) : [];
  if (outerAdapter && safe(outerAdapter)) trace.push(outerAdapter);
  const result = {
    schema: SANDBOX_FAILURE_SCHEMA,
    failureCode: CODES.has(inner.failureCode) ? inner.failureCode : "sandbox_transport_failed",
    capability: safe(inner.capability) ? inner.capability : "unknown",
    operation: safe(inner.operation) ? inner.operation : "unknown",
    osCode: safe(inner.osCode) ? inner.osCode : "unknown",
    syscall: safe(inner.syscall) ? inner.syscall : "unknown",
    resourceClass: safe(inner.resourceClass) ? inner.resourceClass : "unknown",
    locationClass: safe(inner.locationClass) ? inner.locationClass : "unknown",
    runnerClass: safe(inner.runnerClass) ? inner.runnerClass : "unknown",
    adapterTrace: [...new Set(trace)].slice(0, 8),
    originLayer: safe(inner.originLayer) ? inner.originLayer : "unknown",
    executionBoundary: safe(inner.executionBoundary) ? inner.executionBoundary : "unknown",
    permissionPosture: safe(inner.permissionPosture) ? inner.permissionPosture : "unknown",
    evidenceSource: safe(inner.evidenceSource) ? inner.evidenceSource : "unknown",
    probeVersion: safe(inner.probeVersion) ? inner.probeVersion : "unknown",
    retryClass: safe(inner.retryClass) ? inner.retryClass : "none",
    partialEffect: safe(inner.partialEffect) ? inner.partialEffect : "unknown",
    rawDiagnosticsAvailable: inner.rawDiagnosticsAvailable === true,
  };
  return result;
}
export function projectSandboxFailure(inner, adapterClass = null) { return sanitizeSandboxFailure(inner, adapterClass); }
export function isReactiveIpcTrigger(failure, { operationCapability = null, session = null, currentSession = null } = {}) {
  const f = sanitizeSandboxFailure(failure);
  if (session !== null && currentSession !== null && session !== currentSession) return false;
  if (f.originLayer !== "native-standard"
    || f.executionBoundary !== "nested-codex-sandbox"
    || f.osCode !== "EPERM") return false;
  const direct = f.failureCode === "unix_socket_bind_denied" && f.capability === "local-ipc" && ["bind", "listen"].includes(f.operation) && f.resourceClass === "af-unix-socket";
  const plausible = f.failureCode === "sandbox_permission_denied_unknown"
    && operationCapability === "local-ipc";
  return direct || plausible;
}
export function validateSandboxFailure(value) {
  if (!value || value.schema !== SANDBOX_FAILURE_SCHEMA || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...FIELDS].sort())) throw new Error("invalid pipeline.sandbox-failure.v1 projection");
  if (!Array.isArray(value.adapterTrace) || value.adapterTrace.length > 8 || new Set(value.adapterTrace).size !== value.adapterTrace.length) throw new Error("invalid adapterTrace");
  return value;
}
