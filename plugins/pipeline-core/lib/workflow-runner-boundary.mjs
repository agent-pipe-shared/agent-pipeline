// SPDX-License-Identifier: SUL-1.0
/**
 * Provider-neutral synthetic workflow boundary.
 *
 * This is the only Shared-Core entry point that may invoke an injected
 * workflow adapter. It accepts no network, credential, provider, or source
 * transport data; real adapters need a later, separately approved boundary.
 */
import { validateWorkflowWriterDispatch } from "./workflow-writer-preflight.mjs";
import { classifyFailureEvidence } from "./review-economy.mjs";

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
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const OUTCOME_STATES = new Set(["running", "completed", "completed-but-undelivered", "failed"]);
const RETURN_COMPLETION_KEYS = new Set(["identity", "taskId", "resultSha256", "candidateCommit", "requestPath"]);
const RETURN_ADAPTER_KEYS = new Set(["writeDispatchRecord", "verifyCommit"]);
const RETURN_RECEIPT_KEYS = new Set(["schema", "target", "sha256", "bytes", "taskId", "candidateCommit", "resultSha256"]);
const RETURN_AUTHORSHIP_KEYS = new Set([
  "sha", "verdict", "classification", "reason", "taskId", "modelCheck", "orchestratorAddedFiles",
]);
const RETURN_AUTHORSHIP_REQUIRED_KEYS = new Set([
  "sha", "verdict", "classification", "reason", "taskId", "modelCheck",
]);
const FULL_COMMIT = /^[a-f0-9]{40}$/;
const REPOSITORY_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9._/@:-]+$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  return isObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function exactKeyCount(value, allowed) {
  return exactKeys(value, allowed) && Object.keys(value).length === allowed.size;
}

function normalizedRepositoryPath(value) {
  if (typeof value !== "string" || !REPOSITORY_RELATIVE_PATH.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function validReturnAuthorship(value) {
  if (!exactKeys(value, RETURN_AUTHORSHIP_KEYS)
    || [...RETURN_AUTHORSHIP_REQUIRED_KEYS].some((key) => !Object.hasOwn(value, key))) return false;
  if (typeof value.sha !== "string" || !FULL_COMMIT.test(value.sha)
    || value.verdict !== "PASS" || value.classification !== "bound"
    || typeof value.reason !== "string" || value.reason.length === 0
    || typeof value.taskId !== "string" || !SAFE_ID.test(value.taskId)
    || !exactKeyCount(value.modelCheck, new Set(["classification", "reason"]))
    || value.modelCheck.classification !== "model-matches"
    || typeof value.modelCheck.reason !== "string" || value.modelCheck.reason.length === 0) return false;
  if (!Object.hasOwn(value, "orchestratorAddedFiles")) return true;
  const paths = value.orchestratorAddedFiles;
  return Array.isArray(paths) && paths.length <= 512
    && paths.every(normalizedRepositoryPath)
    && new Set(paths).size === paths.length;
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
 * Preserve only the structured, bounded evidence the Coordinator needs to
 * decide whether it may ask the separately trusted continuity host to create
 * a one-shot recovery.  This does not itself attest an environment failure:
 * raw host/result text and every non-positive classifier outcome stay out of
 * the capture object.
 */
function environmentCapture(classification, host) {
  if (classification.faultDomain !== "execution-environment") return null;
  const diagnostic = host.diagnostic;
  const observedBytes = diagnostic.stdoutBytes + diagnostic.stderrBytes;
  if (!Number.isSafeInteger(observedBytes)) return null;
  return {
    code: classification.code,
    evidenceSha256: classification.evidenceSha256,
    diagnostic: {
      exitCode: diagnostic.exitCode,
      signal: diagnostic.signal,
      observedBytes,
      boundedTailSha256: diagnostic.tailSha256,
      capturedTailBytes: diagnostic.capturedTailBytes,
      tailOverflow: diagnostic.stdoutOverflow || diagnostic.stderrOverflow,
    },
  };
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

/**
 * Reduce one provider-neutral runner observation to bounded identity, lifecycle
 * and fault-domain evidence. Raw result/error text has no output channel. A
 * positive environment classification additionally carries only the bounded
 * evidence that a Coordinator may present to its trusted host adapter; it is
 * not a fallback admission or an OS-isolation claim.
 */
export function normalizeWorkflowRunnerOutcome(expected, observation) {
  const hasReturnBinding = Object.hasOwn(expected ?? {}, "taskId") || Object.hasOwn(expected ?? {}, "candidateCommit");
  const expectedKeys = hasReturnBinding
    ? new Set(["identity", "acknowledgedResultSha256", "taskId", "candidateCommit"])
    : new Set(["identity", "acknowledgedResultSha256"]);
  if (!exactKeyCount(expected, expectedKeys)
    || (hasReturnBinding && (typeof expected.taskId !== "string" || !SAFE_ID.test(expected.taskId) || !FULL_COMMIT.test(expected.candidateCommit)))
    || !exactKeyCount(expected.identity, new Set(["dispatchId", "attemptId"]))
    || !Object.values(expected.identity).every((value) => typeof value === "string" && SAFE_ID.test(value))
    || (expected.acknowledgedResultSha256 !== null && !SHA256.test(expected.acknowledgedResultSha256))
    || !exactKeyCount(observation, new Set(["identity", "state", "productVerdict", "host"]))
    || !exactKeyCount(observation.identity, new Set(["dispatchId", "attemptId"]))
    || !Object.values(observation.identity).every((value) => typeof value === "string" && SAFE_ID.test(value))
    || !OUTCOME_STATES.has(observation.state)) {
    return { ok: false, code: "WR-OUTCOME-SCHEMA", identity: null, state: "unknown", faultDomain: "unknown", resultSha256: null, environmentCapture: null };
  }
  if (observation.identity.dispatchId !== expected.identity.dispatchId
    || observation.identity.attemptId !== expected.identity.attemptId) {
    return { ok: false, code: "WR-OUTCOME-STALE", identity: observation.identity, state: observation.state, faultDomain: "unknown", resultSha256: null, environmentCapture: null };
  }
  let productVerdict = null;
  let resultSha256 = null;
  if (observation.productVerdict !== null) {
    if (!exactKeyCount(observation.productVerdict, new Set(["schemaValid", "outcome", "resultSha256"]))
      || typeof observation.productVerdict.schemaValid !== "boolean"
      || !new Set(["succeeded", "failed", "blocked"]).has(observation.productVerdict.outcome)
      || (observation.productVerdict.resultSha256 !== null && !SHA256.test(observation.productVerdict.resultSha256))) {
      return { ok: false, code: "WR-OUTCOME-SCHEMA", identity: observation.identity, state: observation.state, faultDomain: "unknown", resultSha256: null, environmentCapture: null };
    }
    productVerdict = { schemaValid: observation.productVerdict.schemaValid, outcome: observation.productVerdict.outcome };
    resultSha256 = observation.productVerdict.resultSha256;
  }
  const classification = classifyFailureEvidence({ productVerdict, host: observation.host });
  // A capture is intentionally populated only by the valid failed/
  // environment branch below. Invalid lifecycle combinations must not expose
  // evidence that could be mistaken for an admission to recovery.
  const base = {
    identity: observation.identity,
    state: observation.state,
    faultDomain: classification.faultDomain,
    resultSha256,
    environmentCapture: null,
  };
  if (observation.state === "running") return productVerdict === null && observation.host === null
    ? { ok: true, code: "WR-OUTCOME-RUNNING", ...base }
    : { ok: false, code: "WR-OUTCOME-SCHEMA", ...base, faultDomain: "unknown", resultSha256: null };
  if (observation.state === "completed-but-undelivered" || (observation.state === "completed" && productVerdict === null)) {
    return observation.host === null && resultSha256 === null
      ? { ok: true, code: "WR-OUTCOME-COMPLETED-UNDELIVERED", ...base, faultDomain: "unknown" }
      : { ok: false, code: "WR-OUTCOME-SCHEMA", ...base, faultDomain: "unknown", resultSha256: null };
  }
  if (observation.state === "completed") {
    if (productVerdict?.schemaValid !== true || productVerdict.outcome !== "succeeded" || resultSha256 === null) {
      return { ok: false, code: "WR-OUTCOME-SCHEMA", ...base, faultDomain: "unknown", resultSha256: null };
    }
    if (expected.acknowledgedResultSha256 === resultSha256) return { ok: true, code: "WR-OUTCOME-DUPLICATE", ...base, faultDomain: "unknown" };
    if (expected.acknowledgedResultSha256 !== null) {
      return { ok: false, code: "WR-OUTCOME-CONFLICT", ...base, faultDomain: "unknown", resultSha256: null };
    }
    return { ok: true, code: "WR-OUTCOME-FINAL", ...base, faultDomain: "unknown" };
  }
  if (productVerdict?.schemaValid === true && productVerdict.outcome === "failed") {
    return { ok: true, code: "WR-OUTCOME-PRODUCT-FAILED", ...base, faultDomain: "product" };
  }
  if (classification.faultDomain === "execution-environment") {
    const capture = environmentCapture(classification, observation.host);
    if (capture === null) {
      return { ok: false, code: "WR-OUTCOME-SCHEMA", ...base, faultDomain: "unknown", resultSha256: null };
    }
    return {
      ok: true,
      code: "WR-OUTCOME-ENVIRONMENT-FAILED",
      ...base,
      resultSha256: null,
      environmentCapture: capture,
    };
  }
  return { ok: true, code: "WR-OUTCOME-UNKNOWN-FAILED", ...base, faultDomain: "unknown", resultSha256: null };
}

/**
 * Close one successfully delivered Workflow/native return through the canonical
 * dispatch-record writer and authorship verifier.
 *
 * The proprietary runner host owns transport and repository I/O. This boundary
 * therefore accepts two narrow host callbacks rather than raw result prose or a
 * host path. `completion` is the runner-return binding: the exact identity and
 * result digest already admitted by `normalizeWorkflowRunnerOutcome`, the landed
 * commit, and the repository-relative writer request prepared by the host. The
 * record writer remains the authority for request/record/path/model validation;
 * this coordinator cannot mint or repair record fields from prose.
 *
 * Publication alone is not success. After the exclusive write, the same commit
 * must pass `dispatch-authorship-verify` as `bound`. A write followed by a failed
 * check is reported as `WR-RECORD-UNVERIFIED`, never as a successful return.
 */
export function coordinateWorkflowRunnerReturn(expected, observation, completion, adapter) {
  const normalized = normalizeWorkflowRunnerOutcome(expected, observation);
  const base = {
    identity: normalized.identity,
    state: normalized.state,
    resultSha256: normalized.resultSha256,
  };
  if (!normalized.ok || normalized.code !== "WR-OUTCOME-FINAL") {
    return { ok: false, code: normalized.code, ...base, record: null, adapterInvocations: 0 };
  }
  if (typeof expected?.taskId !== "string" || !SAFE_ID.test(expected.taskId)
    || !FULL_COMMIT.test(expected.candidateCommit)
    || !exactKeyCount(completion, RETURN_COMPLETION_KEYS)
    || !exactKeyCount(completion.identity, new Set(["dispatchId", "attemptId"]))
    || completion.identity.dispatchId !== normalized.identity.dispatchId
    || completion.identity.attemptId !== normalized.identity.attemptId
    || completion.taskId !== expected.taskId
    || completion.candidateCommit !== expected.candidateCommit
    || completion.resultSha256 !== normalized.resultSha256
    || !FULL_COMMIT.test(completion.candidateCommit)
    || typeof completion.requestPath !== "string"
    || !normalizedRepositoryPath(completion.requestPath)) {
    return { ok: false, code: "WR-RECORD-BINDING", ...base, record: null, adapterInvocations: 0 };
  }
  if (!exactKeys(adapter, RETURN_ADAPTER_KEYS)
    || typeof adapter.writeDispatchRecord !== "function"
    || typeof adapter.verifyCommit !== "function") {
    return { ok: false, code: "WR-RECORD-ADAPTER", ...base, record: null, adapterInvocations: 0 };
  }

  let receipt;
  try {
    receipt = adapter.writeDispatchRecord({ requestPath: completion.requestPath });
  } catch {
    return { ok: false, code: "WR-RECORD-WRITE-FAILED", ...base, record: null, adapterInvocations: 1 };
  }
  if (!exactKeyCount(receipt, RETURN_RECEIPT_KEYS)
    || receipt.schema !== "pipeline.dispatch-record-write-receipt.v1"
    || typeof receipt.target !== "string"
    || !normalizedRepositoryPath(receipt.target)
    || !SHA256.test(receipt.sha256)
    || !Number.isSafeInteger(receipt.bytes) || receipt.bytes <= 0) {
    return { ok: false, code: "WR-RECORD-WRITE-FAILED", ...base, record: null, adapterInvocations: 1 };
  }

  let authorship;
  try {
    authorship = adapter.verifyCommit(completion.candidateCommit);
  } catch {
    return { ok: false, code: "WR-RECORD-UNVERIFIED", ...base, record: { sha256: receipt.sha256, bytes: receipt.bytes, authorship: "unverified" }, adapterInvocations: 2 };
  }
  if (receipt.taskId !== expected.taskId
    || receipt.candidateCommit !== completion.candidateCommit
    || receipt.resultSha256 !== normalized.resultSha256
    || !validReturnAuthorship(authorship)
    || authorship.sha !== completion.candidateCommit
    || authorship.verdict !== "PASS"
    || authorship.classification !== "bound"
    || authorship.taskId !== expected.taskId
    || receipt.target !== `evidence/dispatch-record-${expected.taskId}.json`) {
    return { ok: false, code: "WR-RECORD-UNVERIFIED", ...base, record: { sha256: receipt.sha256, bytes: receipt.bytes, authorship: "unverified" }, adapterInvocations: 2 };
  }
  return {
    ok: true,
    code: "WR-OUTCOME-FINAL-RECORDED",
    ...base,
    record: { sha256: receipt.sha256, bytes: receipt.bytes, authorship: "bound" },
    adapterInvocations: 2,
  };
}

export const WORKFLOW_RUNNER_CODES = Object.freeze([
  "WR-SCHEMA", "WR-ADAPTER-CAPABILITY", "WR-PREFLIGHT", "WR-ADAPTER-FAILED", "WR-ACCEPTED",
  "WR-OUTCOME-SCHEMA", "WR-OUTCOME-STALE", "WR-OUTCOME-RUNNING",
  "WR-OUTCOME-COMPLETED-UNDELIVERED", "WR-OUTCOME-DUPLICATE", "WR-OUTCOME-CONFLICT", "WR-OUTCOME-FINAL",
  "WR-OUTCOME-PRODUCT-FAILED", "WR-OUTCOME-ENVIRONMENT-FAILED", "WR-OUTCOME-UNKNOWN-FAILED",
  "WR-RECORD-BINDING", "WR-RECORD-ADAPTER", "WR-RECORD-WRITE-FAILED", "WR-RECORD-UNVERIFIED",
  "WR-OUTCOME-FINAL-RECORDED",
  ...Object.values(PREFLIGHT_CODE_MAP),
]);
