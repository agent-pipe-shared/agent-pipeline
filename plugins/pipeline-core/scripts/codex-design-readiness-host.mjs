// SPDX-License-Identifier: SUL-1.0

/** Production composition for one Codex independent design-readiness duty. */
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { advisoryEvidenceBundleSha256, buildAdvisoryEvidenceBundle } from "../lib/advisory-lifecycle-v2.mjs";
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { designReadinessReportSha256 } from "../lib/design-readiness-host-evidence.mjs";
import { resolveV3DutyRoute } from "../lib/critic-route-v3.mjs";
import { runSpecReadinessHost } from "./spec-readiness-host.mjs";
import { sandboxSelectionDigest } from "./codex-sandbox-select.mjs";
import { invokeCodexReadinessAppServer } from "./codex-readiness-app-server.mjs";

const SOURCE_NAMES = Object.freeze(["input", "prd", "spec", "design", "traceability"]);
const OID = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const fail = (message) => { throw new Error(message); };
function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function sameJson(left, right) { return canonicalJson(left) === canonicalJson(right); }

function validateSources(sources) {
  if (!exact(sources, SOURCE_NAMES)) fail("readiness source inventory is invalid");
  for (const name of SOURCE_NAMES) {
    const source = sources[name];
    if (!exact(source, ["path", "sha256"]) || typeof source.path !== "string"
      || source.path.length === 0 || source.path.startsWith("/") || source.path.includes("\\")
      || source.path.includes(":") || source.path.split("/").some((part) => !part || part === "." || part === "..")
      || !SHA256.test(source.sha256 ?? "")) fail(`readiness ${name} source is invalid`);
  }
  if (new Set(SOURCE_NAMES.map((name) => sources[name].path)).size !== SOURCE_NAMES.length) fail("readiness sources alias each other");
  return Object.freeze(Object.fromEntries(SOURCE_NAMES.map((name) => [name, Object.freeze({ ...sources[name] })])));
}

function validateRoute(route, candidateCommit) {
  if (!exact(route, ["dutyId", "runner", "model", "effort", "state", "sourceSha256", "candidateCommit"])
    || route.dutyId !== "readiness" || route.runner !== "codex" || route.state !== "default"
    || typeof route.model !== "string" || route.model.length === 0
    || typeof route.effort !== "string" || route.effort.length === 0
    || !SHA256.test(route.sourceSha256 ?? "") || route.candidateCommit !== candidateCommit) fail("V3 readiness route is unavailable");
  return Object.freeze({ model: route.model, effort: route.effort,
    sourceSha256: route.sourceSha256, candidateCommit: route.candidateCommit });
}

function selectedReadinessBridge({ repoRoot, dispatchId, candidate, sources, evidenceBundle, evidenceSha256, route,
  invokeReadiness = invokeCodexReadinessAppServer } = {}) {
  const completed = new Map();
  const launch = async (request) => {
    if (!exact(request, ["selectionId", "duty", "selection", "requested", "references", "profile", "scratch"])
      || request.duty !== "readiness" || request.requested?.runner !== "codex" || request.requested?.model !== route.model
      || !sameJson(request.references, [...SOURCE_NAMES.map((name) => sources[name].path)].sort())
      || request.selection?.dispatch?.candidateCommit !== candidate.commit
      || request.selection?.dispatch?.candidateTree !== candidate.tree
      || request.selection?.dispatch?.referenceSetSha256 !== evidenceSha256
      || request.scratch?.repoRoot !== repoRoot) fail("selected readiness launch binding drifted");
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
    const result = await invokeReadiness({
      sandboxTransport,
      dispatchId,
      candidate,
      sources,
      evidenceBundle,
      route,
    });
    const selected = result?.sandboxExecution;
    const valid = result?.status === "reviewed" && result.identity?.provider === "openai"
      && result.identity.modelId === route.model && result.identity.effort === route.effort
      && result.report?.dispatchId === dispatchId && result.report.runner === "codex"
      && sameJson(result.report.candidate, candidate) && sameJson(result.report.sources, sources)
      && selected?.schema === "pipeline.codex-sandbox-host-execution.v1"
      && selected.selectionId === sandboxTransport.selectionId
      && selected.selectionSha256 === sandboxTransport.selectionSha256
      && selected.repoFingerprint === sandboxTransport.repoFingerprint
      && selected.duty === "readiness" && sameJson(selected.dispatch, sandboxTransport.dispatch)
      && sameJson(selected.observed, { cliSha256: request.selection.toolchain.cliSha256,
        profileSha256: request.profile.sha256, networkEnabled: true,
        scratchRootSha256: request.profile.scratchRootSha256 })
      && sameJson(selected.terminal, { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" });
    if (!valid) {
      if (result?.status === "unavailable" && result.childStarted === false) return { childStarted: false };
      if (selected?.terminal?.childStarted === true || result?.childStarted === true) return { childStarted: true };
      return { childStarted: undefined };
    }
    completed.set(request.selectionId, { result, sandboxTransport });
    return { childStarted: true, selectionId: request.selectionId };
  };
  const finalize = async ({ selection, launched, requested }) => {
    const held = completed.get(selection?.selectionId);
    if (!held || launched?.selectionId !== selection.selectionId) fail("selected readiness result is unavailable");
    const { result, sandboxTransport } = held;
    if (sandboxTransport.selectionSha256 !== sandboxSelectionDigest(selection)
      || !sameJson(sandboxTransport.dispatch, selection.dispatch)
      || !sameJson(sandboxTransport.requested, requested)) fail("selected readiness binding drifted");
    const execution = {
      schema: "pipeline.codex-sandbox-execution-receipt.v1",
      selectionId: selection.selectionId,
      selectionSha256: sandboxSelectionDigest(selection),
      repoFingerprint: selection.repoFingerprint,
      duty: "readiness",
      dispatch: structuredClone(selection.dispatch),
      requested: structuredClone(requested),
      observed: structuredClone(result.sandboxExecution.observed),
      terminal: structuredClone(result.sandboxExecution.terminal),
      assurance: structuredClone(selection.assurance),
      dutyReceipt: { schema: "pipeline.readiness-receipt.v1",
        sha256: designReadinessReportSha256(result.report), status: "reviewed" },
      createdAt: new Date().toISOString(),
    };
    completed.set(selection.selectionId, { ...held, execution });
    return execution;
  };
  return {
    hostBridge: { launch, finalize },
    take(selectionId) {
      const held = completed.get(selectionId);
      return held?.execution ? { report: structuredClone(held.result.report), route, execution: structuredClone(held.execution) } : null;
    },
  };
}

/**
 * Build and execute an independent Codex readiness review over exactly the
 * five immutable sources. The V3 route is read from the candidate commit;
 * source bytes are re-read physically before any provider invocation.
 */
export async function runCodexDesignReadinessHost({ repoRoot, repoFingerprint, dispatchId, dispatch, sources,
  sandboxRuntime }, dependencies = {}) {
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot) || resolve(repoRoot) !== repoRoot) fail("readiness repository root is invalid");
  const rootIdentity = lstatSync(repoRoot);
  if (!rootIdentity.isDirectory() || rootIdentity.isSymbolicLink() || realpathSync(repoRoot) !== repoRoot) fail("readiness repository root is not a physical directory");
  const root = realpathSync(repoRoot);
  const checkedSources = validateSources(sources);
  if (!SHA256.test(repoFingerprint ?? "") || typeof dispatchId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(dispatchId)
    || !exact(dispatch, ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256"])
    || !Number.isSafeInteger(dispatch.queueRevision) || dispatch.queueRevision < 0
    || !OID.test(dispatch.candidateCommit ?? "") || !OID.test(dispatch.candidateTree ?? "")
    || !SHA256.test(dispatch.referenceSetSha256 ?? "")) fail("readiness dispatch is invalid");
  const candidate = { commit: dispatch.candidateCommit, tree: dispatch.candidateTree };
  const readRoute = dependencies.resolveV3ReadinessRoute ?? resolveV3DutyRoute;
  const route = validateRoute(readRoute({ rootDir: root, dutyId: "readiness", runner: "codex", candidateCommit: candidate.commit }), candidate.commit);
  const references = SOURCE_NAMES.map((name) => checkedSources[name].path).sort();
  const evidenceBundle = buildAdvisoryEvidenceBundle(root, references);
  const evidenceSha256 = advisoryEvidenceBundleSha256(evidenceBundle);
  if (evidenceSha256 !== dispatch.referenceSetSha256) fail("readiness evidence bundle differs from the selected dispatch");
  if (evidenceBundle.references.some((entry) => {
    const expected = SOURCE_NAMES.map((name) => checkedSources[name]).find((source) => source.path === entry.path);
    return !expected || expected.sha256 !== entry.sha256;
  })) fail("readiness source bytes differ from the package binding");
  const bridge = selectedReadinessBridge({ repoRoot: root, dispatchId, candidate, sources: checkedSources,
    evidenceBundle, evidenceSha256, route, invokeReadiness: dependencies.invokeCodexReadinessAppServer ?? invokeCodexReadinessAppServer });
  const readinessDependencies = dependencies.readinessDependencies === undefined
    ? undefined
    : { ...dependencies.readinessDependencies, hostBridge: bridge.hostBridge };
  return runSpecReadinessHost({
    dispatch,
    dispatchId,
    sources: checkedSources,
    references,
    repoFingerprint,
    requested: { runner: "codex", model: route.model },
    sandboxRuntime,
    hostBridge: bridge.hostBridge,
  }, readinessDependencies === undefined ? undefined : {
    ...readinessDependencies,
    takeReadinessReport: bridge.take,
  });
}
