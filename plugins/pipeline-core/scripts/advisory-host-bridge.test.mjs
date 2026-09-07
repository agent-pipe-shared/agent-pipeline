#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  advisoryEvidenceBundleSha256,
  buildAdvisoryEvidenceBundle,
  createAdvisoryConsultationRecord,
  createAdvisoryDemand,
} from "../lib/advisory-lifecycle-v2.mjs";
import { canonicalizeJson } from "../lib/governance-event.mjs";
import { queryPortableGovernanceStream, readLocalRepositoryFingerprint } from "../lib/governance-event-store.mjs";
import {
  runAdvisoryHostBridge,
  runCodexAdvisoryThroughSelectedSandbox,
  runSelectedAdvisoryHost,
} from "./advisory-host-bridge.mjs";
import { buildSandboxRequest, sandboxSelectionDigest } from "./codex-sandbox-select.mjs";

const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
const dispatch = { dispatchId: "bridge-test", queueRevision: 1, candidateCommit, candidateTree: "b".repeat(40) };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const evidenceBundle = () => buildAdvisoryEvidenceBundle(process.cwd(), [
  "plugins/pipeline-core/scripts/advisory-host-bridge.mjs",
]);
const base = () => {
  const question = "Which boundary is safest?";
  const evidence = evidenceBundle();
  const evidenceSha256 = advisoryEvidenceBundleSha256(evidence);
  const demand = createAdvisoryDemand({
    runner: "codex", profile: "epic", reason: "risk-review", question,
    evidenceSha256, dispatch,
  }).demand;
  return {
    profile: "epic", runner: "codex", question, dispatch, demand,
    references: evidence.references.map(({ path }) => path),
    evidenceBundle: evidence,
    advisorExport: { consent: "approved" },
    sandboxContext: { repoFingerprint: "c".repeat(64), referenceSetSha256: evidenceSha256 },
  };
};

function selectedAdvisory() {
  const referenceSetSha256 = base().sandboxContext.referenceSetSha256;
  const requestSha256 = buildSandboxRequest({
    repoFingerprint: "c".repeat(64), duty: "advisory", queueRevision: 1, candidateCommit, candidateTree: "b".repeat(40),
    referenceSetSha256, runner: "codex", model: "gpt-6-astra",
  }).requestSha256;
  return {
    schema: "pipeline.codex-sandbox-selection.v1", selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae", repoFingerprint: "c".repeat(64), duty: "advisory",
    dispatch: { queueRevision: 1, candidateCommit, candidateTree: "b".repeat(40), referenceSetSha256, requestSha256 },
    toolchain: { cliVersion: "0.144.6", cliSha256: "0".repeat(64), observedHelperSha256: "1".repeat(64), selectionSchemaSha256: "2".repeat(64) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    profile: { id: "codex-critic-intermediate.v1", sha256: "4".repeat(64), base: ":read-only", network: { enabled: true }, writableRootClass: "coordinator-scratch-only", scratchRootSha256: "5".repeat(64) },
    preflight: { receiptSha256: "6".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-07-19T00:00:00.000Z" },
    compatibilityReceiptSha256: "7".repeat(64), assurance: { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted" },
    status: "selected", failureClass: null, observedAt: "2026-07-19T00:00:00.000Z",
  };
}

function selectedTransport() {
  return {
    repoRoot: process.cwd(),
    dependencies: {
      async executeSandboxedReadonlyDuty(request, dependencies) {
        const selection = selectedAdvisory();
        const launched = await dependencies.bridge.launch({
          selectionId: selection.selectionId, duty: "advisory", selection, requested: request.requested, references: request.references, profile: selection.profile,
          scratch: { path: "/tmp/advisory-scratch", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot: process.cwd(), codexPath: "/codex" },
        });
        const execution = await dependencies.bridge.finalize({ selection, launched, requested: request.requested, profile: selection.profile });
        return {
          status: "answered", childStarted: true, selectionId: selection.selectionId, selectionSha256: sandboxSelectionDigest(selection),
          executionReceiptSha256: sha256(JSON.stringify(execution)), dutyReceiptSha256: execution.dutyReceipt.sha256, assurance: selection.assurance,
        };
      },
    },
    async invokeCodexAdvisoryAppServer({ sandboxTransport, evidenceBundle: evidence, advisoryRoute }) {
      assert.equal(advisoryEvidenceBundleSha256(evidence), sandboxTransport.dispatch.referenceSetSha256);
      assert.deepEqual(sandboxTransport.requested, { runner: "codex", model: "gpt-6-astra" });
      assert.deepEqual(advisoryRoute, {
        dutyId: "advisory", runner: "codex", model: "gpt-6-astra", effort: "max", state: "default",
        sourceSha256: advisoryRoute.sourceSha256, candidateCommit,
      });
      return {
        status: "answered", answer: "Use the selected transport.", identity: { provider: "openai", modelId: "gpt-6-astra", effort: "max" },
        sandboxExecution: {
          schema: "pipeline.codex-sandbox-host-execution.v1", selectionId: sandboxTransport.selectionId, selectionSha256: sandboxTransport.selectionSha256,
          repoFingerprint: sandboxTransport.repoFingerprint, duty: "advisory", dispatch: sandboxTransport.dispatch,
          observed: { cliSha256: sandboxTransport.toolchain.cliSha256, profileSha256: sandboxTransport.profile.sha256, networkEnabled: true, scratchRootSha256: sandboxTransport.profile.scratchRootSha256 },
          terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
        },
      };
    },
  };
}

test("an unbound direct host adapter never starts a Codex advisory or claims an answer", async () => {
  let calls = 0; let payload;
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async (value) => { calls += 1; payload = value; return { status: "answered", answer: "Keep it closed." }; }, { repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }) });
  assert.equal(calls, 0); assert.equal(payload, undefined);
  assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.code, "selected-sandbox-required"); assert.equal(result.execution, null);
  assert.equal(result.advisoryResult.receipt.schema, "pipeline.advisory-receipt.v1");
});

test("workspace observation failure remains typed no-child evidence", async () => {
  let n = 0;
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => ({ status: "answered", answer: "must be discarded" }), {
    repoRoot: process.cwd(),
    observeWorkspace: () => { n += 1; return { workspaceSha256: n === 1 ? "1".repeat(64) : "2".repeat(64) }; },
  });
  assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.answer, null); assert.equal(result.execution, null);
  assert.equal(result.advisoryResult.receipt.observed.status, "unavailable");
});

test("an adapter response cannot alter the typed no-child result", async () => {
  for (const response of [{ status: "unavailable" }, { status: "answered" }, null]) {
    let calls = 0;
    const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => { calls += 1; return response; }, { repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }) });
    assert.equal(calls, 0); assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.code, "selected-sandbox-required");
    assert.equal(result.execution, null);
  }
});

test("route authority disables mini and declined input before any child and rejects malformed consent", async () => {
  for (const input of [{ ...base(), profile: "mini" }, { ...base(), advisorExport: { consent: "declined" } }]) {
    let calls = 0;
    const result = await runCodexAdvisoryThroughSelectedSandbox(input, async () => { calls += 1; return { status: "answered", answer: "must not run" }; }, { repoRoot: process.cwd() });
    assert.equal(calls, 0); assert.equal(result.advisoryResult.ok, false); assert.equal(result.execution, null);
  }
  let calls = 0;
  await assert.rejects(runCodexAdvisoryThroughSelectedSandbox({ ...base(), advisorExport: { consent: "approved", extra: true } }, async () => { calls += 1; }, { repoRoot: process.cwd() }), { code: "invalid-route-input" });
  assert.equal(calls, 0);
});

test("missing or drifted on-demand binding prevents workspace observation and child launch", async () => {
  for (const input of [
    { ...base(), demand: null },
    { ...base(), question: "question changed after demand" },
  ]) {
    let observations = 0;
    const result = await runCodexAdvisoryThroughSelectedSandbox(input, async () => {
      throw new Error("adapter must not run");
    }, {
      observeWorkspace: () => { observations += 1; return { workspaceSha256: "9".repeat(64) }; },
    });
    assert.equal(result.advisoryResult.ok, false);
    assert.match(result.advisoryResult.code, /^advisory_demand_/u);
    assert.equal(result.advisoryResult.receipt, null);
    assert.equal(observations, 0);
  }
});

test("the deepest selected-host entry point also rejects a missing demand before transport", async () => {
  let calls = 0;
  const transport = selectedTransport();
  transport.dependencies.executeSandboxedReadonlyDuty = async () => {
    calls += 1;
    throw new Error("must not execute");
  };
  const result = await runSelectedAdvisoryHost({ ...base(), demand: null }, transport);
  assert.equal(result.advisoryResult.code, "advisory_demand_required");
  assert.equal(result.advisoryResult.receipt, null);
  assert.equal(calls, 0);

  const current = base();
  current.priorConsultation = createAdvisoryConsultationRecord({
    demand: current.demand,
    outcome: "answered",
    receipt: { sanitized: true },
    completedAtMs: 1,
  }).record;
  const reused = await runSelectedAdvisoryHost(current, transport);
  assert.equal(reused.advisoryResult.code, "advisory_reused_no_repeat");
  assert.equal(reused.advisoryResult.answer, null);
  assert.equal(calls, 0);
});

test("a drifted or omitted evidence bundle fails before the selected transport", async () => {
  for (const input of [
    { ...base(), evidenceBundle: null },
    { ...base(), evidenceBundle: { ...base().evidenceBundle, references: [] } },
    { ...base(), sandboxContext: { ...base().sandboxContext, referenceSetSha256: "f".repeat(64) } },
  ]) {
    let calls = 0;
    const transport = selectedTransport();
    transport.dependencies.executeSandboxedReadonlyDuty = async () => { calls += 1; throw new Error("must not run"); };
    const result = await runSelectedAdvisoryHost(input, transport);
    assert.equal(result.advisoryResult.code, "advisory_evidence_binding_mismatch");
    assert.equal(calls, 0);
  }
});

test("production bridge persists typed no-child receipt without accepting a raw answer", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-advisor-")); const inputPath = join(root, "input.json"); const receiptPath = join(root, "status.json");
  try {
    await writeFile(inputPath, JSON.stringify({ ...base(), sandboxRuntime: { repoRoot: process.cwd(), sessionCleanup: { sessionId: "session-test" } } }));
    const code = await runAdvisoryHostBridge(["--input", inputPath, "--receipt", receiptPath], { makeHostAdapter: () => async () => ({ status: "answered", answer: "private answer" }) });
    assert.equal(code, 2); await assert.rejects(readFile(inputPath));
    const status = JSON.parse(await readFile(receiptPath, "utf8")); assert.equal(status.schema, "pipeline.advisory-receipt.v1"); assert.equal(status.observed.status, "unavailable"); assert.equal(JSON.stringify(status).includes("private answer"), false);
    const recordPath = `${receiptPath}.consultation-v2.json`;
    const recordBytes = await readFile(recordPath, "utf8");
    const record = JSON.parse(recordBytes);
    assert.equal(record.schema, "pipeline.advisory-consultation-record.v2");
    assert.equal(record.outcome, "unavailable");
    assert.equal(recordBytes.includes(base().question), false);
    assert.equal(recordBytes.includes("private answer"), false);

    const repeatedInputPath = join(root, "repeat.json");
    await writeFile(repeatedInputPath, JSON.stringify({ ...base(), sandboxRuntime: { repoRoot: process.cwd(), sessionCleanup: { sessionId: "session-test" } } }));
    const repeated = await runAdvisoryHostBridge(["--input", repeatedInputPath, "--receipt", receiptPath]);
    assert.equal(repeated, 0);
    assert.equal(await readFile(recordPath, "utf8"), recordBytes, "no-repeat must not rewrite its durable record");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("only a selected child with matching selection, identity, and durable receipt returns advisory content", async () => {
  let adapterCalls = 0;
  const transport = { repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }), ...selectedTransport() };
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => { adapterCalls += 1; return { status: "answered", answer: "unbound" }; }, transport);
  assert.equal(adapterCalls, 0);
  assert.equal(result.advisoryResult.ok, true, JSON.stringify(result));
  assert.equal(result.advisoryResult.answer, "Use the selected transport.");
  assert.equal(result.advisoryResult.receipt.observed.identity.modelId, "gpt-6-astra");
  assert.equal(result.execution.dutyReceipt.status, "answered");
  assert.equal(result.sandboxBinding.selectionId, result.execution.selectionId);
  assert.equal(result.sandboxBinding.dutyReceiptSha256, result.execution.dutyReceipt.sha256);
});

test("a selected child with the wrong model identity fails closed without returning its answer", async () => {
  const transport = selectedTransport();
  transport.invokeCodexAdvisoryAppServer = async ({ sandboxTransport }) => ({
    status: "answered", answer: "must be discarded", identity: { provider: "openai", modelId: "gpt-5.6-terra", effort: "max" },
    sandboxExecution: {
      schema: "pipeline.codex-sandbox-host-execution.v1", selectionId: sandboxTransport.selectionId, selectionSha256: sandboxTransport.selectionSha256,
      repoFingerprint: sandboxTransport.repoFingerprint, duty: "advisory", dispatch: sandboxTransport.dispatch,
      observed: { cliSha256: sandboxTransport.toolchain.cliSha256, profileSha256: sandboxTransport.profile.sha256, networkEnabled: true, scratchRootSha256: sandboxTransport.profile.scratchRootSha256 },
      terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    },
  });
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => ({ status: "answered", answer: "unbound" }), {
    repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }), ...transport,
  });
  assert.equal(result.advisoryResult.ok, false);
  assert.equal(result.advisoryResult.answer, null);
  assert.equal(result.advisoryResult.code, "selected-sandbox-required");
});

test("a stale or foreign host execution cannot be relabelled as the current selected child", async () => {
  const transport = selectedTransport();
  const invoke = transport.invokeCodexAdvisoryAppServer;
  transport.invokeCodexAdvisoryAppServer = async (payload) => {
    const result = await invoke(payload);
    result.sandboxExecution.selectionId = "css_bbbbbbbbbbbbbbbbbbbbbbbbbi";
    return result;
  };
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => ({ status: "answered", answer: "unbound" }), {
    repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }), ...transport,
  });
  assert.equal(result.advisoryResult.ok, false);
  assert.equal(result.advisoryResult.answer, null);
  assert.equal(result.advisoryResult.code, "selected-sandbox-required");
});

// --- A-AC-05: the advisory-decision governance-event wiring ---------------

/** Mirrors governance-event-store.test.mjs's own fixtureRoot registry shape exactly, scoped to this file rather than importing a test-only fixture across modules. */
function agentGovernanceRegistryFixture(fingerprint) {
  return {
    schema: "pipeline.governance-stream-registry.v1",
    repositoryFingerprint: fingerprint,
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventDigestDomain: "pipeline.governance-event.v1\0",
    storageRoot: "governance/events",
    streams: [
      { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    ],
  };
}

function agentGovernanceCapturePolicyFixture() {
  return {
    schema: "pipeline.governance-capture-policy.v1", policyId: "fixture", revision: "c".repeat(64), defaultAction: "deny",
    streams: [
      { origin: "human", purpose: "authority-history", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
      { origin: "agent", purpose: "declared-assumption", materiality: "policy-selected", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
      { origin: "lifecycle", purpose: "deterministic-lifecycle", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    ],
    sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false },
    mandatoryEventClasses: [],
  };
}

/** A real temporary git repository with a valid governance registry/capture-policy, matching governance-event-store.test.mjs's own convention for the filesystem/git boundary rather than a mocked store. */
async function governanceRepoRoot() {
  const root = await mkdtemp(join(tmpdir(), "advisory-decision-governance-"));
  execFileSync("git", ["init", "-q", root]);
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  await mkdir(join(root, "governance/events"), { recursive: true });
  await writeFile(join(root, "governance/events/registry.json"), `${canonicalizeJson(agentGovernanceRegistryFixture(fingerprint))}\n`);
  await writeFile(join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(agentGovernanceCapturePolicyFixture())}\n`);
  return { root, fingerprint };
}

/** Captures the bridge's stdout adapter-protocol emissions (the CLI's only externally observable result shape) without altering runAdvisoryHostBridge's own output contract. */
async function captureStdout(run) {
  const original = process.stdout.write.bind(process.stdout);
  const lines = [];
  process.stdout.write = (chunk, ...rest) => { lines.push(String(chunk)); return original(chunk, ...rest); };
  try {
    const code = await run();
    return { code, events: lines.filter((line) => line.trim() !== "").map((line) => JSON.parse(line)) };
  } finally {
    process.stdout.write = original;
  }
}

function nativeClaudeAdvisoryInput(dispatch, question) {
  const demand = createAdvisoryDemand({
    runner: "claude", profile: "epic", reason: "risk-review", question, evidenceSha256: "e".repeat(64), dispatch,
  }).demand;
  return { runner: "claude", profile: "epic", question, dispatch, demand };
}

test("A-AC-05: an answered coordinateAdvisory receipt is durably recorded on the agent governance stream", async () => {
  const { root, fingerprint } = await governanceRepoRoot();
  const inputRoot = await mkdtemp(join(tmpdir(), "host-advisor-aac05-"));
  try {
    const inputPath = join(inputRoot, "input.json");
    const receiptPath = join(inputRoot, "receipt.json");
    const dispatch = { dispatchId: "aac05-dispatch-01", queueRevision: 1, candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40) };
    await writeFile(inputPath, JSON.stringify(nativeClaudeAdvisoryInput(dispatch, "Which route is safest for this cutover?")));
    const { code, events } = await captureStdout(() => runAdvisoryHostBridge(
      ["--input", inputPath, "--receipt", receiptPath],
      {
        repoRoot: root,
        makeHostAdapter: () => async () => ({
          status: "answered", answer: "Prefer the smaller batch.",
          identity: { provider: "anthropic", modelId: "claude-opus", effort: "not-applicable" },
        }),
      },
    ));
    assert.equal(code, 0);
    const completed = events.find((event) => event.type === "advisory.completed");
    assert.equal(completed.ok, true);
    assert.equal(completed.code, "answered");
    assert.equal(completed.agentDecisionEvent.appended, true, JSON.stringify(completed.agentDecisionEvent));
    assert.equal(typeof completed.agentDecisionEvent.eventId, "string");

    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(receipt.observed.status, "answered");

    // Independently readable back, per the dispatch's own goal: a fresh query
    // against the portable store, not a value threaded through from above.
    const stream = await queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "agent" });
    assert.equal(stream.events.length, 1);
    const [event] = stream.events;
    assert.equal(event.origin, "agent");
    assert.equal(event.eventType, "agent.selection");
    assert.equal(event.candidate.commit, dispatch.candidateCommit);
    assert.equal(event.candidate.tree, dispatch.candidateTree);
    assert.equal(event.payload.eventId, completed.agentDecisionEvent.eventId);
    assert.equal(event.payload.kind, "selection");
    assert.deepEqual(event.payload.identity.map((entry) => entry.dimension).sort(), ["adapter", "effort", "model", "profile", "runner"]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(inputRoot, { recursive: true, force: true });
  }
});

test("A-AC-05: a governance-event append failure never withholds the advisory answer (fail-open)", async () => {
  // A real git repository with NO governance/events/registry.json: the store's
  // own loadRegistry fails closed naturally (GES-MISSING), exercising a real
  // append failure rather than an injected mock -- the same fixture-fidelity
  // convention governanceRepoRoot() above follows for the success case.
  const root = await mkdtemp(join(tmpdir(), "advisory-decision-broken-"));
  execFileSync("git", ["init", "-q", root]);
  const inputRoot = await mkdtemp(join(tmpdir(), "host-advisor-aac05-fail-"));
  try {
    const inputPath = join(inputRoot, "input.json");
    const receiptPath = join(inputRoot, "receipt.json");
    const dispatch = { dispatchId: "aac05-dispatch-02", queueRevision: 1, candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40) };
    await writeFile(inputPath, JSON.stringify(nativeClaudeAdvisoryInput(dispatch, "Is this rollback reversible?")));
    const { code, events } = await captureStdout(() => runAdvisoryHostBridge(
      ["--input", inputPath, "--receipt", receiptPath],
      {
        repoRoot: root,
        makeHostAdapter: () => async () => ({
          status: "answered", answer: "Yes, it is reversible.",
          identity: { provider: "anthropic", modelId: "claude-opus", effort: "not-applicable" },
        }),
      },
    ));
    assert.equal(code, 0, "an unrelated governance-recording failure must not turn a real advisory answer into a non-zero exit");
    const completed = events.find((event) => event.type === "advisory.completed");
    assert.equal(completed.ok, true);
    assert.equal(completed.answer, "Yes, it is reversible.", "the advisory answer must survive the append failure intact");
    assert.equal(completed.agentDecisionEvent.appended, false);
    assert.equal(typeof completed.agentDecisionEvent.code, "string");
    assert.equal(Object.hasOwn(completed.agentDecisionEvent, "eventId"), false, "a failed append must not claim an eventId it never persisted");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(inputRoot, { recursive: true, force: true });
  }
});
