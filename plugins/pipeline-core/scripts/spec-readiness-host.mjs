// SPDX-License-Identifier: SUL-1.0

/** Explicit refs-only readiness call site for the generic selected transport. */
import { executeSandboxedReadonlyDuty } from "./sandboxed-readonly-host-bridge.mjs";
import { createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40,64}$/;

function fail(message) { throw new Error(message); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}
function validateDispatch(value) {
  exactKeys(value, ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256"], "readiness dispatch");
  if (!Number.isSafeInteger(value.queueRevision) || value.queueRevision < 0 || !OID.test(value.candidateCommit)
    || !OID.test(value.candidateTree) || !SHA256.test(value.referenceSetSha256)) fail("readiness dispatch is invalid");
}
function referencesOnly(values) {
  if (!Array.isArray(values) || values.length === 0) fail("readiness requires fresh references");
  const sorted = [...new Set(values)].sort();
  if (sorted.length !== values.length || sorted.some((value) => typeof value !== "string" || value.length === 0
    || value.startsWith("/") || value.includes("\\") || value.split("/").includes(".."))) fail("readiness references are not closed repo-relative paths");
  return sorted;
}
function hostUnavailable() {
  return {
    status: "unavailable",
    failureClass: "host-mode-unavailable",
    childStarted: false,
    assurance: { class: "no-usable-review", literal: null },
  };
}

/** Delegates a fresh refs-only readiness review to the selected generic host. */
export async function runSpecReadinessHost({ dispatch, references, repoFingerprint, requested, sandboxRuntime, hostBridge }, dependencies = undefined) {
  validateDispatch(dispatch);
  const freshReferences = referencesOnly(references);
  if (!SHA256.test(repoFingerprint ?? "") || !requested || requested.runner !== "codex"
    || typeof requested.model !== "string" || requested.model.length === 0) fail("readiness selected transport request is invalid");
  let transport = dependencies;
  if (transport === undefined) {
    try {
      transport = createCodexSandboxRuntimeTransport({
        sandboxContext: { repoFingerprint, referenceSetSha256: dispatch.referenceSetSha256 },
        sandboxRuntime,
        hostBridge,
      });
    } catch {
      return hostUnavailable();
    }
  }
  const execute = transport.executeSandboxedReadonlyDuty ?? executeSandboxedReadonlyDuty;
  const result = await execute({
    duty: "readiness",
    repoFingerprint,
    dispatch: structuredClone(dispatch),
    requested: structuredClone(requested),
    references: freshReferences,
  }, transport);
  if (!result || typeof result !== "object") fail("readiness host returned no typed result");
  if (result.status === "unavailable") {
    if (result.childStarted !== false || result.assurance?.class !== "no-usable-review" || result.assurance.literal !== null) fail("unavailable readiness result is not no-child");
    return result;
  }
  if (result.status !== "reviewed" || !/^css_[a-z2-7]{25}[aeimquy4]$/.test(result.selectionId ?? "")
    || !SHA256.test(result.executionReceiptSha256 ?? "") || !SHA256.test(result.dutyReceiptSha256 ?? "")) fail("readiness review is not execution-bound");
  return result;
}
