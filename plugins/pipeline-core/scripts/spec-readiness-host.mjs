// SPDX-License-Identifier: SUL-1.0

/** Explicit refs-only readiness call site for the generic selected transport. */
import { readFileSync } from "node:fs";

import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { designReadinessReportSha256 } from "../lib/design-readiness-host-evidence.mjs";
import { executeSandboxedReadonlyDuty } from "./sandboxed-readonly-host-bridge.mjs";
import { createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40,64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SOURCE_NAMES = ["input", "prd", "spec", "design", "traceability"];
const READINESS_SCHEMA = JSON.parse(readFileSync(new URL("../schemas/pipeline.design-readiness-receipt.v1.json", import.meta.url), "utf8"));

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
    || value.startsWith("/") || value.includes("\\") || value.includes(":")
    || value.split("/").some((part) => !part || part === "." || part === ".."))) fail("readiness references are not closed repo-relative paths");
  return sorted;
}
function validateSources(sources, references) {
  exactKeys(sources, SOURCE_NAMES, "readiness sources");
  const paths = [];
  for (const name of SOURCE_NAMES) {
    const source = sources[name];
    exactKeys(source, ["path", "sha256"], `${name} source`);
    if (typeof source.path !== "string" || !references.includes(source.path) || !SHA256.test(source.sha256 ?? "")) {
      fail(`readiness ${name} source binding is invalid`);
    }
    paths.push(source.path);
  }
  if (new Set(paths).size !== SOURCE_NAMES.length || JSON.stringify([...paths].sort()) !== JSON.stringify(references)) {
    fail("readiness source inventory does not match the dispatched references");
  }
  return structuredClone(sources);
}
function routeBinding(value, requested, candidateCommit) {
  exactKeys(value, ["model", "effort", "sourceSha256", "candidateCommit"], "readiness V3 route");
  if (value.model !== requested.model || typeof value.effort !== "string" || value.effort.length === 0
    || !SHA256.test(value.sourceSha256 ?? "") || value.candidateCommit !== candidateCommit) fail("readiness V3 route binding is invalid");
  return structuredClone(value);
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
export async function runSpecReadinessHost({ dispatch, dispatchId, sources, references, repoFingerprint, requested, sandboxRuntime, hostBridge }, dependencies = undefined) {
  validateDispatch(dispatch);
  if (!ID.test(dispatchId ?? "")) fail("readiness dispatch id is invalid");
  const freshReferences = referencesOnly(references);
  const sourceBindings = validateSources(sources, freshReferences);
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
    || !SHA256.test(result.selectionSha256 ?? "") || !SHA256.test(result.executionReceiptSha256 ?? "")
    || !SHA256.test(result.dutyReceiptSha256 ?? "")) fail("readiness review is not execution-bound");
  const readReport = dependencies?.takeReadinessReport ?? transport.take;
  if (typeof readReport !== "function") fail("readiness host has no exact report readback");
  const readback = await readReport(result.selectionId);
  const report = readback?.report;
  const route = routeBinding(readback?.route, requested, dispatch.candidateCommit);
  if (!report || typeof report !== "object" || Array.isArray(report) || Object.hasOwn(report, "hostExecution")
    || report.runner !== "codex" || report.dispatchId !== dispatchId
    || report.candidate?.commit !== dispatch.candidateCommit || report.candidate?.tree !== dispatch.candidateTree
    || canonicalJson(report.sources) !== canonicalJson(sourceBindings)
    || designReadinessReportSha256(report) !== result.dutyReceiptSha256) fail("readiness report does not match the selected execution duty digest");
  const readinessReceipt = {
    ...report,
    hostExecution: {
      schema: "pipeline.design-readiness-host-execution.v1",
      runner: "codex",
      repoFingerprint,
      selectionId: result.selectionId,
      selectionSha256: result.selectionSha256,
      executionReceiptSha256: result.executionReceiptSha256,
      dutyReceiptSha256: result.dutyReceiptSha256,
      route,
    },
  };
  const schemaResult = validateAgainstSchema(readinessReceipt, READINESS_SCHEMA);
  if (!schemaResult.valid) fail(`readiness report schema is invalid: ${schemaResult.errors.join("; ")}`);
  return { ...result, readinessReceipt };
}
