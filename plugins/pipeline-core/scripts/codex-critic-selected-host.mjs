// SPDX-License-Identifier: SUL-1.0

/**
 * In-process selected-Critic host bridge -- completion (B) for the gap
 * recorded in backlog/evidence/2026-09-06-codex-selected-critic-transport-gap.md.
 *
 * codex-critic-host.mjs's selectedCriticHostBridge() is the producer half of
 * an external stdout/stdin JSON-line protocol with no consumer anywhere in
 * the repository. This file adds a real consumer without touching that
 * producer or its CLI branch, which stay in place as an alternative external
 * route: mirrors advisory-host-bridge.mjs's selectedAdvisoryHostBridge() /
 * runSelectedAdvisoryHost() exactly -- an in-process {launch, finalize}
 * bridge that calls a consumer directly, composed through the same generic
 * createCodexSandboxRuntimeTransport / executeSandboxedReadonlyDuty seam
 * codex-critic-host.mjs's own runCodexCriticThroughSelectedSandbox already
 * accepts a hostBridge for.
 *
 * Every receipt field below is either copied from the caller's own bound
 * input or copied from an observed fact the consumer reported; nothing here
 * synthesises a terminal observation, an exit code, or a cleanup status --
 * including on the completed-but-bound-failure branch inside launch()
 * below, where the child ran to completion but some other binding fact
 * (identity, selection, dispatch) failed to match: the observed terminal is
 * carried through to the execution receipt exactly as reported, and only
 * the duty receipt records the failure.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";
import { executeSandboxedReadonlyDuty } from "./sandboxed-readonly-host-bridge.mjs";
import { sandboxSelectionDigest } from "./codex-sandbox-select.mjs";
import { invokeCodexCriticAppServer } from "./codex-critic-app-server.mjs";
import { resolveCriticHighRiskRoute, validateCriticHighRiskRoute } from "../lib/critic-route-v3.mjs";
import { ROLE_DISPATCH_REQUEST_SCHEMA, preflightRoleDispatch } from "../lib/role-dispatch-preflight.mjs";
import { dispatchBudgetLineForRole } from "../lib/dispatch-policy.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40,64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SELECTED_PREPARATION_CODES = new Set([
  "RDP-ROOT", "RDP-PACKET-SHAPE", "RDP-DISPATCH-ID", "RDP-TRANSPORT", "RDP-ROLE", "RDP-PROMPT",
  "RDP-CANDIDATE-SHAPE", "RDP-CANDIDATE-COMMIT", "RDP-CANDIDATE-TREE", "RDP-REQUIRED-PATHS",
  "RDP-REQUIRED-DIGESTS", "RDP-REQUIRED-PATH", "RDP-REQUIRED-BLOB", "RDP-REQUIRED-PATH-DRIFT",
  "RDP-RESULT-PATH", "RDP-RESULT-DESTINATION", "RDP-RESULT-ROOT", "RDP-RESULT-ALIASES-INPUT",
  "RDP-ROUTE", "RDP-ROUTE-CANDIDATE", "RDP-ROUTE-DRIFT", "RDP-INPUT",
]);

class SelectedCriticDispatchPreflightError extends Error {
  constructor(preparation) {
    super(`selected Critic role dispatch rejected${preparation?.code ? `: ${preparation.code}` : ""}`);
    this.preparation = preparation;
  }
}

function classifySelectedPreLaunchFailure(error) {
  if (!(error instanceof SelectedCriticDispatchPreflightError)) return null;
  const code = error.preparation?.code;
  return SELECTED_PREPARATION_CODES.has(code) ? code : null;
}

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}

function safeReferencePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && value.trim() === value && !value.includes("\\") && !/[\u0000-\u001f\u007f]/u.test(value)
    && !isAbsolute(value) && !value.startsWith("./") && !value.endsWith("/")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function rejectedPreparation(code, field) {
  return {
    schema: "pipeline.role-dispatch-preflight.v1",
    status: "rejected",
    code,
    field,
    modelCalls: 0,
    launcherCalls: 0,
  };
}

/** Build and run the common role PREPARE from physical, refs-only candidate input. */
export function prepareSelectedCriticRoleDispatch({ input, route, resultDestination = { kind: "return" }, prepare = preflightRoleDispatch } = {}) {
  let boundRoute;
  try { boundRoute = validateCriticHighRiskRoute(route); }
  catch { return rejectedPreparation("RDP-ROUTE", "route"); }
  if (boundRoute.candidateCommit !== input?.dispatch?.candidateCommit) return rejectedPreparation("RDP-ROUTE-CANDIDATE", "route.candidateCommit");
  const paths = input?.referencePaths ?? input?.references;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 128 || paths.some((path) => !safeReferencePath(path))
    || new Set(paths).size !== paths.length || JSON.stringify([...paths].sort()) !== JSON.stringify(paths)) {
    return rejectedPreparation("RDP-REQUIRED-PATHS", "requiredPaths");
  }
  let root;
  const requiredPathSha256 = {};
  try {
    const lexicalRoot = resolve(input.sandboxRuntime.repoRoot);
    const rootStat = lstatSync(lexicalRoot);
    root = realpathSync(lexicalRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return rejectedPreparation("RDP-ROOT", "root");
    for (const path of paths) {
      const lexical = resolve(root, path);
      const rel = relative(root, lexical);
      if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return rejectedPreparation("RDP-REQUIRED-PATH", `requiredPaths:${path}`);
      const stat = lstatSync(lexical);
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(lexical) !== lexical) return rejectedPreparation("RDP-REQUIRED-PATH", `requiredPaths:${path}`);
      requiredPathSha256[path] = sha256(readFileSync(lexical));
    }
  } catch { return rejectedPreparation("RDP-REQUIRED-PATH", "requiredPaths"); }
  const dispatchId = `selected-critic-${sha256(canonicalJson({ candidate: input.dispatch, paths, route: boundRoute })).slice(0, 24)}`;
  const packet = {
    schema: ROLE_DISPATCH_REQUEST_SCHEMA,
    dispatchId,
    transport: "codex",
    role: "pipeline-core:critic",
    prompt: `Independent Critic review from requiredPaths only. Ruleset-SHA: ${boundRoute.sourceSha256}; Model: ${boundRoute.model}; effort ${boundRoute.effort}.\n${dispatchBudgetLineForRole("critic")}`,
    candidate: { commit: input.dispatch.candidateCommit, tree: input.dispatch.candidateTree },
    requiredPaths: [...paths],
    requiredPathSha256,
    resultDestination: structuredClone(resultDestination),
  };
  return prepare({ root, packet });
}

function validateSelectedCriticInput(input) {
  exactKeys(input, ["repoFingerprint", "dispatch", "referencePaths", "reviewBase", "sandboxRuntime"], "selected Critic host input");
  if (!SHA256.test(input.repoFingerprint)) fail("selected Critic repository fingerprint is invalid");
  exactKeys(input.dispatch, ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256"], "selected Critic dispatch");
  if (!Number.isSafeInteger(input.dispatch.queueRevision) || input.dispatch.queueRevision < 0
    || !OID.test(input.dispatch.candidateCommit) || !OID.test(input.dispatch.candidateTree)
    || !SHA256.test(input.dispatch.referenceSetSha256)) fail("selected Critic dispatch identity is invalid");
  if (!COMMIT_SHA.test(input.reviewBase)) fail("selected Critic review base is invalid");
  if (!Array.isArray(input.referencePaths) || input.referencePaths.length === 0
    || new Set(input.referencePaths).size !== input.referencePaths.length
    || input.referencePaths.some((path) => typeof path !== "string" || path.length === 0)) {
    fail("selected Critic reference paths are invalid");
  }
  return input;
}

function validateRequestedCriticRoute(value) {
  exactKeys(value, ["runner", "model"], "selected Critic requested route");
  if (value.runner !== "codex" || typeof value.model !== "string" || value.model.length === 0
  ) fail("selected Critic requested route is invalid");
  return value;
}

function validateRulesetBindings(value) {
  exactKeys(value, ["roleContractSha256", "promptContractSha256", "verdictSchemaSha256", "childExecutableSha256", "childModuleGraphSha256"], "selected Critic ruleset bindings");
  for (const digest of Object.values(value)) if (!SHA256.test(digest)) fail("selected Critic ruleset binding is invalid");
  return value;
}
function validRulesetBindings(value) {
  try { validateRulesetBindings(value); return true; } catch { return false; }
}
function validateRulesetProvenance(value) {
  exactKeys(value, ["kind", "identity"], "selected Critic ruleset provenance");
  if (value.kind !== "git" || typeof value.identity !== "string" || value.identity.length === 0) fail("selected Critic ruleset provenance is invalid");
  return value;
}
function validRulesetProvenance(value) {
  try { validateRulesetProvenance(value); return true; } catch { return false; }
}

function receiptFor({ selection, requested, identity, verdict, rulesetBindings, rulesetProvenance }) {
  const receipt = {
    schema: "pipeline.critic-receipt.v1",
    selectionId: selection.selectionId,
    dispatch: structuredClone(selection.dispatch),
    requested: structuredClone(requested),
    observed: structuredClone(identity),
    bindings: structuredClone(validateRulesetBindings(rulesetBindings)),
    rulesetProvenance: structuredClone(validateRulesetProvenance(rulesetProvenance)),
    verdictSha256: sha256(canonicalJson(verdict)),
    status: "reviewed",
    emittedAtMs: Date.now(),
  };
  return receipt;
}

function matchesSelectedHostExecution(value, selected) {
  try {
    exactKeys(value, ["schema", "selectionId", "selectionSha256", "repoFingerprint", "duty", "dispatch", "observed", "terminal"], "selected Critic host execution");
    return value.schema === "pipeline.codex-sandbox-host-execution.v1"
      && value.selectionId === selected.selectionId
      && value.selectionSha256 === selected.selectionSha256
      && value.repoFingerprint === selected.repoFingerprint
      && value.duty === selected.duty
      && equal(value.dispatch, selected.dispatch)
      && equal(value.observed, {
        cliSha256: selected.toolchain.cliSha256,
        profileSha256: selected.profile.sha256,
        networkEnabled: true,
        scratchRootSha256: selected.profile.scratchRootSha256,
      })
      && equal(value.terminal, { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" });
  } catch { return false; }
}

/**
 * Builds the in-process {launch, finalize} pair. `take` is deliberately kept
 * OUT of the returned bridge object: codex-sandbox-runtime.mjs's
 * validateHostBridge() does exactKeys(value, ["launch", "finalize"]) on
 * whatever is passed as hostBridge, and a third key throws there, which the
 * caller silently turns into "host-mode-unavailable" -- exactly the failure
 * mode this file exists to close. (The advisory precedent this mirrors,
 * advisory-host-bridge.mjs's selectedAdvisoryHostBridge, carries `take` on
 * the same object it returns for wiring. Whether that is live or merely
 * latent there is an OPEN QUESTION this file does not answer: no test or
 * probe here checks whether that object's own caller ever passes it
 * directly as hostBridge. Treat it as unconfirmed either way -- not fixed
 * here since that file is out of scope for this task.)
 */
export function selectedCriticInProcessBridge(input, { route, verifyRoute = null, dispatchPreparation = null, prepareRoleDispatch = preflightRoleDispatch, invokeAppServer = invokeCodexCriticAppServer, captureFailureDiagnostic = null } = {}) {
  const boundRoute = validateCriticHighRiskRoute(route);
  const completed = new Map();
  const launch = async (request) => {
    exactKeys(request, ["selectionId", "duty", "selection", "requested", "references", "profile", "scratch"], "selected Critic launch");
    if (request.duty !== "critic") fail("selected Critic launch duty is invalid");
    validateRequestedCriticRoute(request.requested);
    if (request.requested.runner !== boundRoute.runner || request.requested.model !== boundRoute.model) fail("selected Critic generic request drifted from bound route");
    if (typeof verifyRoute === "function") {
      let currentRoute;
      try { currentRoute = validateCriticHighRiskRoute(verifyRoute()); }
      catch { throw new SelectedCriticDispatchPreflightError({ code: "RDP-ROUTE-DRIFT" }); }
      if (!equal(currentRoute, boundRoute)) throw new SelectedCriticDispatchPreflightError({ code: "RDP-ROUTE-DRIFT" });
    }
    if (!equal(request.references, input.referencePaths)) fail("selected Critic references drifted");
    if (request.scratch?.repoRoot !== input.sandboxRuntime.repoRoot) fail("selected Critic scratch repository drifted");
    if (request.selection?.dispatch?.candidateCommit !== input.dispatch.candidateCommit
      || request.selection?.dispatch?.candidateTree !== input.dispatch.candidateTree
      || request.selection?.dispatch?.referenceSetSha256 !== input.dispatch.referenceSetSha256) {
      fail("selected Critic dispatch binding drifted");
    }
    if (dispatchPreparation !== null) {
      const current = prepareRoleDispatch({ root: input.sandboxRuntime.repoRoot, packet: dispatchPreparation.packet });
      if (current?.status !== "prepared") throw new SelectedCriticDispatchPreflightError(current);
    }
    const sandboxTransport = {
      selectionId: request.selectionId,
      selectionSha256: sandboxSelectionDigest(request.selection),
      repoFingerprint: request.selection.repoFingerprint,
      duty: request.duty,
      dispatch: structuredClone(request.selection.dispatch),
      requested: structuredClone(request.requested),
      criticRoute: structuredClone(boundRoute),
      toolchain: structuredClone(request.selection.toolchain),
      profile: structuredClone(request.profile),
      scratch: structuredClone(request.scratch),
    };
    const result = await invokeAppServer({
      sandboxTransport,
      referencePaths: [...input.referencePaths],
      candidateCommit: input.dispatch.candidateCommit,
      candidateTree: input.dispatch.candidateTree,
      reviewBase: input.reviewBase,
    });
    if (result?.status !== "reviewed" || !result.verdict || typeof result.verdict !== "object" || Array.isArray(result.verdict)
      || !validRulesetBindings(result.rulesetBindings)
      || !validRulesetProvenance(result.rulesetProvenance)
      || !result.sandboxExecution || result.identity?.provider !== "openai" || result.identity?.modelId !== boundRoute.model
      || result.identity?.effort !== boundRoute.effort || !matchesSelectedHostExecution(result.sandboxExecution, sandboxTransport)) {
      const diagnostic = validateFailureDiagnostic(result?.failureDiagnostic, input, sandboxTransport);
      if (diagnostic && typeof captureFailureDiagnostic === "function") captureFailureDiagnostic(diagnostic);
      // Two different failure shapes reach this branch, and only one of them
      // carries a real observation. When the consumer never reports a
      // terminal at all (result.sandboxExecution is absent -- its own
      // "unavailable" path, no full run to describe), there is nothing here
      // to carry through: fall back to the consumer's own top-level
      // childStarted (false for a spawn that never started; undefined
      // otherwise), which the generic bridge's postLaunchFailure() treats as
      // its conservative "unclear" case. But when result.sandboxExecution IS
      // present with terminal.childStarted true, the child DID start and
      // finish -- the consumer's own terminal record says so -- and only
      // some other binding fact (identity, selection, dispatch) failed to
      // match. Store that observation and let finalize() below carry it
      // through untouched, with the duty receipt (not the terminal) carrying
      // the failure -- rather than let it fall into postLaunchFailure()'s
      // synthesized "lost stdio" shape for a run that plainly completed.
      const observedTerminal = result?.sandboxExecution?.terminal;
      if (observedTerminal?.childStarted === true) {
        completed.set(request.selectionId, { result, sandboxTransport, bindingFailed: true });
        return { childStarted: true, selectionId: request.selectionId };
      }
      return { childStarted: typeof result?.childStarted === "boolean" ? result.childStarted : undefined };
    }
    completed.set(request.selectionId, { result, sandboxTransport });
    return { childStarted: result.sandboxExecution.terminal?.childStarted === true, selectionId: request.selectionId };
  };
  const finalize = async ({ selection, launched, requested }) => {
    const completedResult = completed.get(selection?.selectionId);
    if (!completedResult || launched?.selectionId !== selection.selectionId) fail("selected Critic launch result is unavailable");
    const { result, sandboxTransport, bindingFailed } = completedResult;
    if (sandboxTransport.selectionSha256 !== sandboxSelectionDigest(selection)
      || sandboxTransport.repoFingerprint !== selection.repoFingerprint
      || !equal(sandboxTransport.dispatch, selection.dispatch)
      || !equal(sandboxTransport.requested, requested)) fail("selected Critic binding drifted");
    const hostExecution = result.sandboxExecution;
    const header = {
      schema: "pipeline.codex-sandbox-execution-receipt.v1",
      selectionId: selection.selectionId,
      selectionSha256: sandboxSelectionDigest(selection),
      repoFingerprint: selection.repoFingerprint,
      duty: "critic",
      dispatch: structuredClone(selection.dispatch),
      requested: structuredClone(requested),
      observed: structuredClone(hostExecution.observed),
      terminal: structuredClone(hostExecution.terminal),
      assurance: structuredClone(selection.assurance),
      createdAt: new Date().toISOString(),
    };
    if (bindingFailed) {
      // The consumer's own terminal record above is carried through
      // unchanged -- it already reflects the real completion. Only the duty
      // receipt reports the failure: no verdict is certified as reviewed
      // when the binding checks that would authorize doing so did not pass.
      const execution = {
        ...header,
        dutyReceipt: {
          schema: "pipeline.critic-receipt.v1",
          sha256: sha256(canonicalJson({ schema: "pipeline.codex-sandbox-transport-failure.v1", selectionId: selection.selectionId, phase: "finalize" })),
          status: "error",
        },
      };
      completed.set(selection.selectionId, { result, execution });
      return execution;
    }
    const receipt = receiptFor({ selection, requested, identity: result.identity, verdict: result.verdict, rulesetBindings: result.rulesetBindings, rulesetProvenance: result.rulesetProvenance });
    const execution = {
      ...header,
      dutyReceipt: { schema: "pipeline.critic-receipt.v1", sha256: sha256(canonicalJson(receipt)), status: "reviewed" },
    };
    completed.set(selection.selectionId, { result, receipt, execution });
    return execution;
  };
  return {
    bridge: { launch, finalize },
    classifyPreLaunchFailure: classifySelectedPreLaunchFailure,
    take(selectionId) {
      const value = completed.get(selectionId);
      if (!value?.receipt || !value?.execution) return null;
      return { verdict: value.result.verdict, receipt: structuredClone(value.receipt), execution: structuredClone(value.execution) };
    },
  };
}

const APP_SERVER_FAILURE_CODES = new Set([
  "request-invalid", "prompt-invalid", "protocol-error", "write-attempt", "child-exit-error",
  "input-invalid", "ruleset-unavailable",
  "outer-terminal", "outer-stdout-overflow", "child-output-invalid", "route-mismatch",
  "lifecycle-invalid", "answer-json-invalid", "verdict-schema-invalid",
  "ruleset-drift",
]);
const TERMINAL_SIGNALS = new Set(["SIGHUP", "SIGINT", "SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGPIPE"]);

function validateFailureDiagnostic(value, input, sandboxTransport) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["binding", "child", "outer", "schema"])
    || value.schema !== "pipeline.codex-critic-app-server-failure.v1"
    || JSON.stringify(Object.keys(value.binding ?? {}).sort()) !== JSON.stringify(["candidateCommit", "candidateTree", "selectionId", "selectionSha256"])
    || value.binding.candidateCommit !== input.dispatch.candidateCommit || value.binding.candidateTree !== input.dispatch.candidateTree
    || typeof value.binding.selectionId !== "string" || typeof value.binding.selectionSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.binding.selectionSha256)
    || value.binding.selectionId !== sandboxTransport.selectionId || value.binding.selectionSha256 !== sandboxTransport.selectionSha256
    || JSON.stringify(Object.keys(value.child ?? {}).sort()) !== JSON.stringify(["cleanup", "code", "exitCode", "initialized", "signal", "started", "stdinEnded", "threadStarted", "turnCompleted", "turnStarted", "writeAttemptKind"])
    || !APP_SERVER_FAILURE_CODES.has(value.child.code) || typeof value.child.started !== "boolean"
    || typeof value.child.initialized !== "boolean" || typeof value.child.threadStarted !== "boolean" || typeof value.child.turnStarted !== "boolean" || typeof value.child.turnCompleted !== "boolean" || typeof value.child.stdinEnded !== "boolean"
    || !(Number.isInteger(value.child.exitCode) || value.child.exitCode === null) || !(TERMINAL_SIGNALS.has(value.child.signal) || value.child.signal === null)
    || !["complete", "incomplete", "unknown"].includes(value.child.cleanup) || !["file-change", "command-action", "server-rpc-request", null].includes(value.child.writeAttemptKind)
    || JSON.stringify(Object.keys(value.outer ?? {}).sort()) !== JSON.stringify(["exitCode", "signal", "spawnFailed", "stderrBytes", "stdoutBytes"])
    || !(Number.isInteger(value.outer.exitCode) || value.outer.exitCode === null) || !(TERMINAL_SIGNALS.has(value.outer.signal) || value.outer.signal === null)
    || typeof value.outer.spawnFailed !== "boolean" || !Number.isInteger(value.outer.stdoutBytes) || value.outer.stdoutBytes < 0 || !Number.isInteger(value.outer.stderrBytes) || value.outer.stderrBytes < 0) return null;
  return structuredClone(value);
}

function unavailableResult(code, selected = null, failureDiagnostic = null, preparationCode = null) {
  const result = { ok: false, code, selectionId: selected?.selectionId ?? null, sandboxBinding: null };
  if (failureDiagnostic) result.failureDiagnostic = structuredClone(failureDiagnostic);
  if (preparationCode !== null) result.preparationCode = preparationCode;
  return result;
}

/**
 * The only Codex Critic selected-lane success path. It composes the
 * in-process bridge before launch and returns a review only when the
 * resulting durable execution receipt and its selected dispatch bind exactly
 * to that child -- a completed-but-invalid child is reported as
 * "selected-critic-transport-failed", never silently downgraded to
 * "no child ran".
 */
export async function runSelectedCriticHost(rawInput, transport = {}) {
  let input;
  try { input = validateSelectedCriticInput(rawInput); }
  catch { return unavailableResult("selected-critic-role-dispatch-rejected", null, null, "RDP-INPUT"); }
  const resolveRoute = transport.resolveCriticRoute ?? resolveCriticHighRiskRoute;
  const routeInput = {
    rootDir: input.sandboxRuntime.repoRoot,
    candidateCommit: input.dispatch.candidateCommit,
    ...(transport.authorityDependencies ?? {}),
  };
  const resolveBoundRoute = () => validateCriticHighRiskRoute(resolveRoute(routeInput));
  let route;
  try {
    route = resolveBoundRoute();
  } catch {
    return unavailableResult("selected-critic-route-invalid");
  }
  const prepare = transport.preflightRoleDispatch ?? preflightRoleDispatch;
  const dispatchPreparation = prepareSelectedCriticRoleDispatch({ input, route, resultDestination: { kind: "return" }, prepare });
  if (dispatchPreparation?.status !== "prepared") {
    const preparationCode = SELECTED_PREPARATION_CODES.has(dispatchPreparation?.code) ? dispatchPreparation.code : null;
    return unavailableResult("selected-critic-role-dispatch-rejected", null, null, preparationCode);
  }
  let capturedFailureDiagnostic = null;
  const selectedHost = selectedCriticInProcessBridge(input, {
    route,
    verifyRoute: resolveBoundRoute,
    dispatchPreparation,
    prepareRoleDispatch: prepare,
    invokeAppServer: transport.invokeCodexCriticAppServer ?? invokeCodexCriticAppServer,
    captureFailureDiagnostic: (diagnostic) => { capturedFailureDiagnostic = diagnostic; },
  });
  let dependencies = transport.dependencies;
  if (dependencies !== undefined) {
    dependencies = {
      ...dependencies,
      bridge: { ...dependencies.bridge, ...selectedHost.bridge, classifyPreLaunchFailure: selectedHost.classifyPreLaunchFailure },
    };
  }
  if (dependencies === undefined) {
    try {
      dependencies = createCodexSandboxRuntimeTransport({
        sandboxContext: { repoFingerprint: input.repoFingerprint, referenceSetSha256: input.dispatch.referenceSetSha256 },
        sandboxRuntime: input.sandboxRuntime,
        hostBridge: selectedHost.bridge,
      });
      dependencies = {
        ...dependencies,
        bridge: { ...dependencies.bridge, classifyPreLaunchFailure: selectedHost.classifyPreLaunchFailure },
      };
    } catch {
      return unavailableResult("selected-sandbox-required", null, capturedFailureDiagnostic);
    }
  }
  let selected;
  try {
    selected = await (dependencies.executeSandboxedReadonlyDuty ?? executeSandboxedReadonlyDuty)({
      duty: "critic",
      repoFingerprint: input.repoFingerprint,
      dispatch: structuredClone(input.dispatch),
      requested: { runner: route.runner, model: route.model },
      references: [...input.referencePaths],
    }, dependencies);
  } catch (error) {
    const preparationCode = selectedHost.classifyPreLaunchFailure(error);
    if (preparationCode !== null) return unavailableResult("selected-critic-role-dispatch-rejected", null, capturedFailureDiagnostic, preparationCode);
    return unavailableResult("selected-sandbox-required", null, capturedFailureDiagnostic);
  }
  if (!selected || selected.status === "unavailable" || selected.childStarted !== true) {
    return unavailableResult("selected-sandbox-required", selected, capturedFailureDiagnostic);
  }
  if (selected.status === "error") {
    const result = {
      ok: false,
      code: "selected-critic-transport-failed",
      selectionId: selected.selectionId,
      sandboxBinding: {
        selectionId: selected.selectionId,
        selectionSha256: selected.selectionSha256,
        executionReceiptSha256: selected.executionReceiptSha256,
        dutyReceiptSha256: selected.dutyReceiptSha256,
        assurance: structuredClone(selected.assurance),
      },
    };
    if (capturedFailureDiagnostic) result.failureDiagnostic = structuredClone(capturedFailureDiagnostic);
    return result;
  }
  const completedResult = selectedHost.take(selected.selectionId);
  if (!completedResult || completedResult.execution.selectionId !== selected.selectionId
    || completedResult.execution.selectionSha256 !== selected.selectionSha256
    || completedResult.execution.dutyReceipt.sha256 !== selected.dutyReceiptSha256) {
    return { ok: false, code: "selected-critic-transport-failed", selectionId: selected.selectionId, sandboxBinding: null };
  }
  return {
    ok: true,
    code: "reviewed",
    verdict: completedResult.verdict,
    receipt: completedResult.receipt,
    execution: completedResult.execution,
    sandboxBinding: {
      selectionId: selected.selectionId,
      selectionSha256: selected.selectionSha256,
      executionReceiptSha256: selected.executionReceiptSha256,
      dutyReceiptSha256: selected.dutyReceiptSha256,
      assurance: structuredClone(selected.assurance),
    },
  };
}
