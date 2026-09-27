#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { advisoryEvidenceBundleSha256, buildAdvisoryEvidenceBundle } from "../lib/advisory-lifecycle-v2.mjs";
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { designReadinessReportSha256 } from "../lib/design-readiness-host-evidence.mjs";
import { buildSandboxRequest, SANDBOX_ASSURANCE, sandboxSelectionDigest } from "./codex-sandbox-select.mjs";
import { runCodexDesignReadinessHost } from "./codex-design-readiness-host.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const NAMES = ["input", "prd", "spec", "design", "traceability"];
const ROUTE = Object.freeze({
  dutyId: "readiness",
  runner: "codex",
  model: "gpt-6-luna",
  effort: "high",
  state: "default",
  sourceSha256: "a".repeat(64),
  candidateCommit: "b".repeat(40),
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "codex-design-readiness-host-"));
  const sources = {};
  mkdirSync(join(root, "specs", "feature"), { recursive: true });
  for (const name of NAMES) {
    const path = `specs/feature/${name}.md`;
    const bytes = Buffer.from(`# ${name}\nImmutable readiness fixture.\n`, "utf8");
    writeFileSync(join(root, path), bytes, { mode: 0o600 });
    sources[name] = { path, sha256: sha(bytes) };
  }
  const references = NAMES.map((name) => sources[name].path).sort();
  const evidenceBundle = buildAdvisoryEvidenceBundle(root, references);
  const dispatch = {
    queueRevision: 12,
    candidateCommit: ROUTE.candidateCommit,
    candidateTree: "c".repeat(40),
    referenceSetSha256: advisoryEvidenceBundleSha256(evidenceBundle),
  };
  return { root, sources, references, evidenceBundle, dispatch, candidate: { commit: dispatch.candidateCommit, tree: dispatch.candidateTree } };
}

function selectedExecution(launchRequest, report, repoRoot) {
  const selectionRequest = {
    repoFingerprint: "d".repeat(64),
    duty: "readiness",
    queueRevision: launchRequest.dispatch.queueRevision,
    candidateCommit: launchRequest.dispatch.candidateCommit,
    candidateTree: launchRequest.dispatch.candidateTree,
    referenceSetSha256: launchRequest.dispatch.referenceSetSha256,
    runner: launchRequest.requested.runner,
    model: launchRequest.requested.model,
  };
  const selection = {
    schema: "pipeline.codex-sandbox-selection.v1",
    selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae",
    repoFingerprint: selectionRequest.repoFingerprint,
    duty: "readiness",
    dispatch: {
      ...Object.fromEntries(Object.entries(selectionRequest).filter(([key]) =>
        ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256"].includes(key))),
      requestSha256: buildSandboxRequest(selectionRequest).requestSha256,
    },
    toolchain: {
      cliVersion: "0.146.0",
      cliSha256: "e".repeat(64),
      observedHelperSha256: "2".repeat(64),
      selectionSchemaSha256: "3".repeat(64),
    },
    host: {
      platformClass: "linux-wsl2",
      kernel: { sysname: "Linux", release: "fixture", machine: "x86_64" },
      filesystemClass: "wsl2-native",
      bootIdSha256: "4".repeat(64),
    },
    profile: {
      id: "codex-critic-intermediate.v1",
      sha256: "f".repeat(64),
      base: ":read-only",
      network: { enabled: true },
      writableRootClass: "coordinator-scratch-only",
      scratchRootSha256: "1".repeat(64),
    },
    preflight: { receiptSha256: "5".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-09-27T00:00:00.000Z" },
    compatibilityReceiptSha256: "6".repeat(64),
    assurance: SANDBOX_ASSURANCE,
    status: "selected",
    failureClass: null,
    observedAt: "2026-09-27T00:00:00.000Z",
  };
  const profile = { ...selection.profile };
  const scratch = { repoRoot, path: "/tmp/readiness-scratch", sha256: profile.scratchRootSha256 };
  return { selection, profile, scratch, report };
}

function dependencies(fx, { tamperCandidate = false } = {}) {
  const calls = [];
  const report = {
    schema: "pipeline.design-readiness-receipt.v1",
    dispatchId: "design-readiness-host-test-1",
    runner: "codex",
    candidate: tamperCandidate
      ? { commit: "9".repeat(40), tree: fx.candidate.tree }
      : fx.candidate,
    sources: fx.sources,
    outcome: "ready-for-po-review",
    findings: [],
    unresolvedChoices: [],
    summary: "The five immutable design sources are ready for PO review.",
  };
  const readinessDependencies = {
    async executeSandboxedReadonlyDuty(request, transport) {
      calls.push(request);
      assert.equal(request.duty, "readiness");
      assert.deepEqual(request.requested, { runner: "codex", model: ROUTE.model });
      assert.equal(typeof transport.hostBridge.launch, "function");
      const selected = selectedExecution(request, report, fx.root);
      const launchRequest = {
        selectionId: selected.selection.selectionId,
        duty: "readiness",
        selection: selected.selection,
        requested: request.requested,
        references: request.references,
        profile: selected.profile,
        scratch: selected.scratch,
      };
      const launched = await transport.hostBridge.launch(launchRequest);
      if (launched.childStarted !== true) return { status: "unavailable", childStarted: launched.childStarted };
      const execution = await transport.hostBridge.finalize({
        selection: selected.selection,
        launched,
        requested: request.requested,
        profile: selected.profile,
      });
      const executionReceiptSha256 = sha(Buffer.from(canonicalJson(execution), "utf8"));
      return {
        status: "reviewed",
        selectionId: selected.selection.selectionId,
        selectionSha256: sandboxSelectionDigest(selected.selection),
        executionReceiptSha256,
        dutyReceiptSha256: execution.dutyReceipt.sha256,
      };
    },
  };
  // runSpecReadinessHost receives this function as a dependency; its report
  // callback is supplied by the outer Codex bridge, not by the fake provider.
  let transportlessReadback;
  return {
    calls,
    report,
    readinessDependencies: {
      ...readinessDependencies,
      async executeSandboxedReadonlyDuty(request, transport) {
        const result = await readinessDependencies.executeSandboxedReadonlyDuty(request, transport);
        if (result.status === "reviewed") {
          transportlessReadback = transport.takeReadinessReport(result.selectionId);
        }
        return result;
      },
    },
    resolveV3ReadinessRoute: ({ rootDir, dutyId, runner, candidateCommit }) => {
      assert.equal(rootDir, fx.root);
      assert.equal(dutyId, "readiness");
      assert.equal(runner, "codex");
      assert.equal(candidateCommit, fx.candidate.commit);
      return ROUTE;
    },
    invokeCodexReadinessAppServer: async ({ sandboxTransport, candidate, sources, route, dispatchId }) => {
      assert.equal(sandboxTransport.duty, "readiness");
      assert.deepEqual(candidate, fx.candidate);
      assert.deepEqual(sources, fx.sources);
      assert.equal(route.model, ROUTE.model);
      assert.equal(dispatchId, report.dispatchId);
      return {
        status: "reviewed",
        identity: { provider: "openai", modelId: ROUTE.model, effort: ROUTE.effort },
        report,
        sandboxExecution: {
          schema: "pipeline.codex-sandbox-host-execution.v1",
          selectionId: sandboxTransport.selectionId,
          selectionSha256: sandboxTransport.selectionSha256,
          repoFingerprint: sandboxTransport.repoFingerprint,
          duty: "readiness",
          dispatch: sandboxTransport.dispatch,
          observed: {
            cliSha256: sandboxTransport.toolchain.cliSha256,
            profileSha256: sandboxTransport.profile.sha256,
            networkEnabled: true,
            scratchRootSha256: sandboxTransport.profile.scratchRootSha256,
          },
          terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
        },
      };
    },
  };
}

test("Codex readiness host composes exact sources, selected app-server observation and final host-bound receipt", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const deps = dependencies(fx);
  const result = await runCodexDesignReadinessHost({
    repoRoot: fx.root,
    repoFingerprint: "d".repeat(64),
    dispatchId: deps.report.dispatchId,
    dispatch: fx.dispatch,
    sources: fx.sources,
    sandboxRuntime: {},
  }, { ...deps, readinessDependencies: deps.readinessDependencies });

  assert.equal(deps.calls.length, 1);
  assert.deepEqual(deps.calls[0].references, fx.references);
  assert.equal(result.status, "reviewed");
  assert.equal(result.readinessReceipt.hostExecution.runner, "codex");
  assert.equal(result.readinessReceipt.hostExecution.route.model, ROUTE.model);
  assert.equal(result.readinessReceipt.hostExecution.route.candidateCommit, fx.candidate.commit);
  assert.equal(result.readinessReceipt.hostExecution.dutyReceiptSha256, designReadinessReportSha256(deps.report));
  assert.equal(Object.hasOwn(deps.report, "hostExecution"), false);
});

test("Codex readiness host refuses physical source drift before invoking the runner", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  writeFileSync(join(fx.root, fx.sources.spec.path), "# changed after package binding\n", { mode: 0o600 });
  const deps = dependencies(fx);
  await assert.rejects(() => runCodexDesignReadinessHost({
    repoRoot: fx.root,
    repoFingerprint: "d".repeat(64),
    dispatchId: deps.report.dispatchId,
    dispatch: fx.dispatch,
    sources: fx.sources,
    sandboxRuntime: {},
  }, { ...deps, readinessDependencies: deps.readinessDependencies }), /readiness evidence bundle differs from the selected dispatch/);
  assert.equal(deps.calls.length, 0);
});

test("Codex readiness host rejects a provider result bound to a different candidate", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const deps = dependencies(fx, { tamperCandidate: true });
  await assert.rejects(() => runCodexDesignReadinessHost({
    repoRoot: fx.root,
    repoFingerprint: "d".repeat(64),
    dispatchId: deps.report.dispatchId,
    dispatch: fx.dispatch,
    sources: fx.sources,
    sandboxRuntime: {},
  }, { ...deps, readinessDependencies: deps.readinessDependencies }), /selected readiness result is unavailable/);
  assert.equal(deps.calls.length, 1);
});
