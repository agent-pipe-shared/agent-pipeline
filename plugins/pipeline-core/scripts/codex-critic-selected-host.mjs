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

import { createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";
import { executeSandboxedReadonlyDuty } from "./sandboxed-readonly-host-bridge.mjs";
import { sandboxSelectionDigest } from "./codex-sandbox-select.mjs";
import { invokeCodexCriticAppServer } from "./codex-critic-app-server.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40,64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
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

function receiptFor({ selection, requested, identity, verdict }) {
  const receipt = {
    schema: "pipeline.critic-receipt.v1",
    selectionId: selection.selectionId,
    dispatch: structuredClone(selection.dispatch),
    requested: structuredClone(requested),
    observed: structuredClone(identity),
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
export function selectedCriticInProcessBridge(input, { invokeAppServer = invokeCodexCriticAppServer } = {}) {
  const completed = new Map();
  const launch = async (request) => {
    exactKeys(request, ["selectionId", "duty", "selection", "requested", "references", "profile", "scratch"], "selected Critic launch");
    if (request.duty !== "critic") fail("selected Critic launch duty is invalid");
    if (!equal(request.references, input.referencePaths)) fail("selected Critic references drifted");
    if (request.scratch?.repoRoot !== input.sandboxRuntime.repoRoot) fail("selected Critic scratch repository drifted");
    if (request.selection?.dispatch?.candidateCommit !== input.dispatch.candidateCommit
      || request.selection?.dispatch?.candidateTree !== input.dispatch.candidateTree
      || request.selection?.dispatch?.referenceSetSha256 !== input.dispatch.referenceSetSha256) {
      fail("selected Critic dispatch binding drifted");
    }
    const sandboxTransport = {
      selectionId: request.selectionId,
      selectionSha256: sandboxSelectionDigest(request.selection),
      repoFingerprint: request.selection.repoFingerprint,
      duty: request.duty,
      dispatch: structuredClone(request.selection.dispatch),
      requested: structuredClone(request.requested),
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
      || !result.sandboxExecution || result.identity?.provider !== "openai" || result.identity?.modelId !== "gpt-5.6-sol"
      || result.identity?.effort !== "xhigh" || !matchesSelectedHostExecution(result.sandboxExecution, sandboxTransport)) {
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
    const receipt = receiptFor({ selection, requested, identity: result.identity, verdict: result.verdict });
    const execution = {
      ...header,
      dutyReceipt: { schema: "pipeline.critic-receipt.v1", sha256: sha256(canonicalJson(receipt)), status: "reviewed" },
    };
    completed.set(selection.selectionId, { result, receipt, execution });
    return execution;
  };
  return {
    bridge: { launch, finalize },
    take(selectionId) {
      const value = completed.get(selectionId);
      if (!value?.receipt || !value?.execution) return null;
      return { verdict: value.result.verdict, receipt: structuredClone(value.receipt), execution: structuredClone(value.execution) };
    },
  };
}

function unavailableResult(code, selected = null) {
  return { ok: false, code, selectionId: selected?.selectionId ?? null, sandboxBinding: null };
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
  const input = validateSelectedCriticInput(rawInput);
  const selectedHost = selectedCriticInProcessBridge(input, {
    invokeAppServer: transport.invokeCodexCriticAppServer ?? invokeCodexCriticAppServer,
  });
  let dependencies = transport.dependencies;
  if (dependencies !== undefined) {
    dependencies = { ...dependencies, bridge: { ...dependencies.bridge, ...selectedHost.bridge } };
  }
  if (dependencies === undefined) {
    try {
      dependencies = createCodexSandboxRuntimeTransport({
        sandboxContext: { repoFingerprint: input.repoFingerprint, referenceSetSha256: input.dispatch.referenceSetSha256 },
        sandboxRuntime: input.sandboxRuntime,
        hostBridge: selectedHost.bridge,
      });
    } catch {
      return unavailableResult("selected-sandbox-required");
    }
  }
  let selected;
  try {
    selected = await (dependencies.executeSandboxedReadonlyDuty ?? executeSandboxedReadonlyDuty)({
      duty: "critic",
      repoFingerprint: input.repoFingerprint,
      dispatch: structuredClone(input.dispatch),
      requested: { runner: "codex", model: "gpt-5.6-sol" },
      references: [...input.referencePaths],
    }, dependencies);
  } catch {
    return unavailableResult("selected-sandbox-required");
  }
  if (!selected || selected.status === "unavailable" || selected.childStarted !== true) {
    return unavailableResult("selected-sandbox-required", selected);
  }
  if (selected.status === "error") {
    return {
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
