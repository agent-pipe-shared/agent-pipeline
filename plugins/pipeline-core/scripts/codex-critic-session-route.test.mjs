// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { resolveSessionCodexCriticHighRiskRoute } from "./codex-critic-session-route.mjs";

const rootDir = "/fixture/repository";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { canonical, createPoApprovalIntent } from "../lib/po-approval-proof.mjs";
import { createModelFamilyInvocationEntry } from "../lib/model-family-invocation.mjs";
import { createModelFamilyRuntimeHost } from "../lib/model-family-runtime-host.mjs";
import { registeredModelFamilyTaskRoutes } from "../lib/model-family-route-source.mjs";
import { createModelFamilyDiscoveryHost, RULE_FIELDS, pass, fail, digest as discoveryDigest } from "../lib/model-family-discovery.mjs";
import { createCodexFamilyAdapter } from "../lib/model-family-codex-adapter.mjs";
import { readHeldModelFamilyInvocation } from "../lib/model-family-host-store.mjs";
import { resolveSessionCodexCriticRoute, recheckHeldCriticFamilyRoute, launchHeldCriticFamilyRoute } from "./codex-critic-session-route.mjs";
import { selectedCriticInProcessBridge, prepareSelectedCriticRoleDispatch } from "./codex-critic-selected-host.mjs";
import { buildSandboxRequest } from "./codex-sandbox-select.mjs";
function criticSelectionFixture(input, route) {
  const requestSha256 = buildSandboxRequest({
    repoFingerprint: "b".repeat(64), duty: "critic", queueRevision: 1, candidateCommit: input.dispatch.candidateCommit, candidateTree: input.dispatch.candidateTree,
    referenceSetSha256: input.dispatch.referenceSetSha256, runner: "codex", model: route.model,
  }).requestSha256;
  return {
    schema: "pipeline.codex-sandbox-selection.v1", selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae", repoFingerprint: "b".repeat(64), duty: "critic",
    dispatch: { queueRevision: 1, candidateCommit: input.dispatch.candidateCommit, candidateTree: input.dispatch.candidateTree, referenceSetSha256: input.dispatch.referenceSetSha256, requestSha256 },
    toolchain: { cliVersion: "0.144.6", cliSha256: "0".repeat(64), observedHelperSha256: "1".repeat(64), selectionSchemaSha256: "2".repeat(64) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    profile: { id: "codex-critic-intermediate.v1", sha256: "4".repeat(64), base: ":read-only", network: { enabled: true }, writableRootClass: "coordinator-scratch-only", scratchRootSha256: "5".repeat(64) },
    preflight: { receiptSha256: "6".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-07-19T00:00:00.000Z" },
    compatibilityReceiptSha256: "7".repeat(64), assurance: { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted" },
    status: "selected", failureClass: null, observedAt: "2026-07-19T00:00:00.000Z",
  };
}

async function signedCriticFixture(dutyId) {
  const sha = value => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
  const runner = "codex", taskRoute = `duty.${dutyId}`;
  const routeSource = registeredModelFamilyTaskRoutes();
  const route = routeSource.taskRoutes.find(value => value.runner === runner && value.taskRoute === taskRoute);
  const root = mkdtempSync(join(tmpdir(), "critic-native-positive-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const commonDir = join(root, ".git");
  mkdirSync(join(commonDir, "agent-pipeline"), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, "input.txt"), "Bound Critic reference\n");
  execFileSync("git", ["add", "input.txt"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "commit", "-qm", "synthetic candidate"], { cwd: root });
  const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const candidateTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
  const keyFor = invocationId => ({ runner, installationBindingSha256: sha("installation"), accountBindingSha256: sha("account"), sessionId: "critic-session", invocationId });
  async function actualS2OpaquePort({ models, key, familyId = "sol" }) {
  const rules = {};
  const contract = { schema: "pipeline.model-family-adapter-contract.v1", runner: "codex", familyId,
    discoveryModes: ["complete-catalogue"], providerEvidenceSha256s: [sha("synthetic-provider-contract")] };
  for (const name of RULE_FIELDS) {
    const rule = { id: `s5a-${name}`, version: 1, sha256: sha(name) };
    contract[name] = rule;
    const run = name === "identityRule" ? ({ phase, entry }) => phase === "coverage"
      ? pass("SYNTHETIC", { mode: "complete-catalogue", evidenceSha256: sha("coverage"), latestAliasEvidenceSha256: null })
      : pass("SYNTHETIC", { model: entry.model })
      : name === "releaseGroupingRule" ? ({ entry }) => pass("SYNTHETIC", { releaseId: `${familyId}-${entry.version.join("-")}`,
        familyId, groupingEvidenceSha256: sha("group") })
        : name === "versionRule" ? ({ entry }) => pass("SYNTHETIC", entry.version)
          : name === "variantSelectionRule" ? ({ entry }) => pass("SYNTHETIC", { modelId: entry.model,
            canonicalModelId: null, aliasEvidenceSha256: null })
            : name === "selectabilityRule" ? () => pass("SYNTHETIC", { released: true, visible: true, selectable: true })
              : name === "effortRule" ? ({ entry }) => pass("SYNTHETIC", {
                efforts: entry.supportedReasoningEfforts.map((item) => item.reasoningEffort),
                capabilityEvidenceSha256: sha("capability") })
                : () => fail("SYNTHETIC_UNUSED");
    rules[rule.id] = { version: rule.version, sha256: rule.sha256, run };
  }
  let latest;
  const timestamp = "2026-10-01T12:00:00.000Z";
  const expiresAt = "2026-10-01T12:01:00.000Z";
  const host = createModelFamilyDiscoveryHost({ rules, clock: () => timestamp,
    capture: async (context) => pass("SYNTHETIC_CAPTURE", { bindings: context.bindings, observedAt: context.observedAt,
      source: "S5A-SYNTHETIC", pages: [{ request: { id: 1, method: "model/list",
        params: { cursor: null, includeHidden: true, limit: 100 } },
        responseBytes: JSON.stringify({ id: 1, result: { data: models.map(({ modelId, version, efforts = [route.effort] }) => ({ id: modelId,
          model: modelId, hidden: false, version, released: true,
          supportedReasoningEfforts: efforts.map((reasoningEffort) => ({ reasoningEffort })) })), nextCursor: null } }) }] }),
    verifyProviderContract: ({ contractSha256, contract: value }) => pass("SYNTHETIC_CONTRACT", {
      contractSha256, providerEvidenceSha256s: value.providerEvidenceSha256s }),
    compatibility: ({ runner: selectedRunner, record, variant, slot }) => {
      const value = host.readDiscovery(latest).value;
      return pass("SYNTHETIC_COMPAT", { subjectSha256: discoveryDigest({ runner: selectedRunner,
        releaseId: record.releaseId, modelId: variant.modelId, ...slot,
        discoverySha256: discoveryDigest(value), adapterContractSha256: value.adapterContractSha256 }),
        evidenceSha256: sha("compat") });
    } });
  const context = host.createContext({ runner, bindings: { installationBindingSha256: key.installationBindingSha256,
    accountBindingSha256: key.accountBindingSha256, hostProcessBindingSha256: sha("process") },
    observedAt: timestamp, expiresAt }).value;
  const qualified = host.qualifyContract(contract);
  const adapter = createCodexFamilyAdapter(host);
  const raw = await adapter.captureRawDiscovery(context);
  if (!raw.ok) return raw;
  const coverage = adapter.verifyCoverage(raw.value, context, qualified.value);
  if (!coverage.ok) return coverage;
  const normalized = adapter.normalizeReleases(raw.value, qualified.value, coverage.value);
  if (!normalized.ok) return normalized;
  latest = normalized.value;
  const snapshot = host.readDiscovery(latest).value;
  const head = snapshot.records.filter((entry) => entry.familyId === familyId)
    .sort((left, right) => (right.version[0] ?? 0) - (left.version[0] ?? 0)
      || (right.version[1] ?? 0) - (left.version[1] ?? 0))[0];
  const compatible = adapter.verifyCompatibility({ discovery: latest, releaseId: head.releaseId,
    modelId: head.variants[0].modelId }, { taskRoute, role: route.role, effort: route.effort }, context, qualified.value);
  const resolverContext = { coverage: { familyId, coverageEvidenceSha256: sha("coverage"),
    unknownTargetFamilyEvidenceSha256s: [] }, hardEligibility: { runner, taskRoute, role: route.role,
    effort: route.effort, evidenceSha256: sha("hard"), minimumVersion: null, deniedModelIds: [] },
  variantRule: null, compatibility: { runner, taskRoute, role: route.role, effort: route.effort,
    modelId: head.variants[0].modelId, evidenceSha256: sha("compat") }, latestAlias: null };
  return compatible.ok ? { ok: true, contractSha256: discoveryDigest(contract), value: { discoveryHost: host,
    discoveryHandle: compatible.value.discovery, context: resolverContext } } : compatible;
}

function signedS4Authority(adapterContractSha256, familyId = "sol", selectedModelId = "gpt-6-sol") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ format: "pem", type: "spki" });
  const trustAnchors = [{ keyReference: "S5A-SYNTHETIC-TEST-KEY", publicKeySha256: sha(publicPem) }];
  const selector = { kind: "model-id", value: selectedModelId };
  const taskRoutes = [{ taskRoute, runner, role: route.role, effort: route.effort, state: "default", selector }];
  const configuredRoutes = [{ runner, role: route.role, effort: route.effort, selector }];
  const routeSource = { ok: true, taskRoutes, configuredRoutes };
  const routeSourceSha256 = sha({ taskRoutes, configuredRoutes });
  const assignments = [{ runner, role: route.role, effort: route.effort, taskRoutes: [taskRoute], familyId,
    adapterContractSha256, minimumVersion: [6], update: "latest" }];
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256, assignments, migration: null };
  const subjectSha256 = sha(subject);
  const candidateAtApproval = { commit: candidateCommit, tree: candidateTree };
  const approvalIntent = createPoApprovalIntent({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: routeSourceSha256, specSha256: subjectSha256, candidate: candidateAtApproval,
    policyRevision: "model-family-v2", subjectSha256, decision: "approved" });
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval, subject,
    approvalIntent, proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  return { bundle, routeSource, trustAnchors };
}


  const models = [{ modelId: "gpt-6-sol", version: [6] }, { modelId: "gpt-6.1-sol", version: [6,1] }];
  const probe = await actualS2OpaquePort({ models, key: keyFor("probe") });
  assert.equal(probe.ok, true, probe.code);
  const authority = signedS4Authority(probe.contractSha256);
  const bindings = { installationBindingSha256: sha("installation"), accountBindingSha256: sha("account"), hostProcessBindingSha256: sha("process") };
  let launches = 0, observed, admissionError;
  const childPath = join(root, "child.mjs");
  writeFileSync(childPath, 'let text="";for await (const chunk of process.stdin) text+=chunk;process.stdout.write(text);');
  const runtimeHost = createModelFamilyRuntimeHost({ cwd: root, clock: () => Date.parse("2026-10-01T12:00:30.000Z"), trustedSources: {
    readAuthorityInputs: () => ({ ...authority, predecessor: null }), readPinInputs: () => [],
    readCurrentCandidate: () => ({ candidateCommit, candidateTree }),
    captureFreshDiscovery: ({ key }) => actualS2OpaquePort({ models, key }),
    resolveInvocationContext: ({ requestedSessionId, invocationId }) => ({ ok: true, key: { ...keyFor(invocationId), sessionId: requestedSessionId },
      assignment: { runner, taskRoute, role: route.role, effort: route.effort, familyId: "sol" }, candidateCommit, candidateTree }),
    resolveCurrentInvocationIdentity: ({ invocationId }) => ({ ok: true, key: keyFor(invocationId),
      assignment: { runner, taskRoute, role: route.role, effort: route.effort, familyId: "sol" }, candidateCommit, candidateTree }),
    admitNativeRequest: ({ invocation, request }) => {
      try {
      assert.equal(Object.isFrozen(request), true);
      assert.equal(request.model, undefined);
      assert.equal(request.schema, "pipeline.critic-family-native-request.v1");
      assert.equal(request.root, root);
      assert.equal(request.request.model, invocation.selectedModelId);
      assert.equal(request.request.effort, invocation.effort);
      return { ok: true, code: "SYNTHETIC_REQUEST_ADMISSION" };
      } catch (error) { admissionError = error; throw error; }
    },
    launchDriver: ({ nativeRequest }) => {
      launches++;
      const value = nativeRequest.request;
      const selected = value.sandboxTransport;
      const result = { status: "reviewed", verdict: { verdict: "PASS", findings: [] },
        identity: { provider: "openai", modelId: value.model, effort: value.effort },
        rulesetBindings: Object.fromEntries(["roleContractSha256", "promptContractSha256", "verdictSchemaSha256", "childExecutableSha256", "childModuleGraphSha256"].map(name => [name, sha(name)])),
        rulesetProvenance: { kind: "git", identity: candidateCommit },
        sandboxExecution: { schema: "pipeline.codex-sandbox-host-execution.v1", selectionId: selected.selectionId, selectionSha256: selected.selectionSha256, repoFingerprint: selected.repoFingerprint, duty: "critic", dispatch: selected.dispatch,
          observed: { cliSha256: selected.toolchain.cliSha256, profileSha256: selected.profile.sha256, networkEnabled: true, scratchRootSha256: selected.profile.scratchRootSha256 },
          terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" } } };
      const bytes = execFileSync(process.execPath, [childPath], { input: JSON.stringify(result), encoding: "utf8", timeout: 3000 });
      observed = JSON.parse(bytes);
      return { ok: true, value: observed };
    }
  } });
  const activation = runtimeHost.store().activate();
  assert.equal(activation.ok, true, activation.code);
  const entry = createModelFamilyInvocationEntry({ runtimeHost, routeSource });
  const identityHost = createModelFamilyDiscoveryHost({ clock: () => "2026-10-01T12:00:30.000Z", execution: ({ rawHostResult }) =>
    observed && discoveryDigest(rawHostResult) === discoveryDigest(observed) ? pass("ACTUAL_SYNTHETIC_CHILD_IDENTITY", {
      actualModelIds: [observed.identity.modelId], actualEffort: observed.identity.effort, rawHostResultSha256: discoveryDigest(rawHostResult), hostObservationSha256: sha("child-stdout")
    }) : fail("NO_CHILD_OBSERVATION") });
  const context = identityHost.createContext({ runner, bindings, observedAt: "2026-10-01T12:00:30.000Z", expiresAt: "2026-10-01T12:01:00.000Z" }).value;
  const ports = { adapters: { codex: createCodexFamilyAdapter(identityHost) }, contextForInvocation: () => pass("SOURCE_CONTEXT", context),
    readOriginalInvocation: ({ invocationId }) => { const r = readHeldModelFamilyInvocation({ rootDir: join(commonDir, "agent-pipeline"), key: keyFor(invocationId) }); return r.ok ? pass("ORIGINAL_S4", { invocation: r.value, bindings, provenanceSha256: discoveryDigest(r.value) }) : r; },
    readLaunchEvidence: ({ invocation: i }) => pass("NODE_CHILD_EVIDENCE", { invocationReceiptSha256: i.receiptSha256, runner,
      supported: { status: "supported", efforts: [i.effort], evidenceSha256: probe.contractSha256 },
      requested: { modelId: i.selectedModelId, effort: i.effort, evidenceSha256: sha("request") },
      configured: { modelId: i.selectedModelId, effort: i.effort, evidenceSha256: sha("configured"), assurance: "host-configured" },
      execution: { status: "succeeded", evidenceSha256: sha("exit-zero") } }) };
  return { root, candidateCommit, candidateTree, entry, ports, route, admissionError: () => admissionError, launches: () => launches, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("signed ordinary and high-risk Critic use one native child and authentic S6 plus existing finalization", async () => {
  for (const dutyId of ["critic_normal", "critic_high_risk"]) {
    const f = await signedCriticFixture(dutyId);
    try {
      const route = await resolveSessionCodexCriticRoute({ rootDir: f.root, candidateCommit: f.candidateCommit, dutyId,
        familyInvocationEntry: f.entry, familyExecutionPorts: f.ports, invocationId: `positive-${dutyId}`,
        resolveV3: () => { throw new Error("active family cannot resolve V3"); } });
      assert.equal(route.dutyId, dutyId); assert.equal(route.model, "gpt-6.1-sol"); assert.equal(route.effort, f.route.effort);
      assert.equal(recheckHeldCriticFamilyRoute(structuredClone(route)).ok, false);
      const input = { referencePaths: ["input.txt"], reviewBase: "9".repeat(40), sandboxRuntime: { repoRoot: f.root },
        dispatch: { candidateCommit: f.candidateCommit, candidateTree: f.candidateTree, referenceSetSha256: "e".repeat(64) } };
      const preparation = prepareSelectedCriticRoleDispatch({ input, route, resultDestination: { kind: "return" } });
      assert.equal(preparation.status, "prepared", preparation.code);
      const packet = preparation.packet;
      const selection = criticSelectionFixture(input, route);
      const requested = { runner: "codex", model: route.model };
      const built = selectedCriticInProcessBridge(input, { route, familyRoute: route, dispatchPreparation: preparation,
        verifyRoute: () => route,
        invokeAppServer: () => { throw new Error("no unchecked fallback"); } });
      let launched;
      try { launched = await built.bridge.launch({ selectionId: selection.selectionId, duty: "critic", selection, requested,
        references: input.referencePaths, profile: selection.profile, scratch: { repoRoot: f.root } }); }
      catch (error) { throw f.admissionError() ?? error; }
      assert.equal(launched.childStarted, true);
      const finalized = await built.bridge.finalize({ selection, launched, requested });
      assert.equal(finalized.dutyReceipt.status, "reviewed");
      assert.equal(built.take(selection.selectionId).receipt.status, "reviewed");
      assert.equal(f.launches(), 1);
      assert.equal((await launchHeldCriticFamilyRoute({ route, packet, nativeRequest: { model: route.model, effort: route.effort } })).code, "CRITIC-FAMILY-CONSUMED");
      assert.equal(f.launches(), 1);
    } finally { f.cleanup(); }
  }
});
const candidateCommit = "a".repeat(40);
const v3 = { dutyId: "critic_high_risk", runner: "codex", model: "v3-model",
  effort: "max", sourceSha256: "b".repeat(64), candidateCommit };
const selected = { ok: true, status: "ready", runner: "codex",
  taskRoute: "duty.critic_high_risk", modelId: "session-model", effort: "max",
  readbackSha256: "c".repeat(64), receiptSha256: "d".repeat(64) };
const base = { rootDir, candidateCommit, resolveV3: () => v3,
  familyInvocationEntry: { observeActivation: () => ({ ok: true, status: "inactive" }) } };

test("selected high-risk Critic route binds the admitted exact model and receipt digests", () => {
  const calls = [];
  const result = resolveSessionCodexCriticHighRiskRoute({ ...base,
    env: { CODEX_SESSION_ID: "session" }, select: (request) => {
      calls.push(request); return selected;
    } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].taskRoute, "duty.critic_high_risk");
  assert.equal(result.model, "session-model");
  assert.equal(result.effort, v3.effort);
  assert.notEqual(result.sourceSha256, v3.sourceSha256);
  const differentReceipt = resolveSessionCodexCriticHighRiskRoute({ ...base,
    env: { CODEX_SESSION_ID: "session" }, select: () => ({ ...selected,
      receiptSha256: "e".repeat(64) }) });
  assert.notEqual(result.sourceSha256, differentReceipt.sourceSha256);
});

test("absent or defective optional selection leaves the valid V3 route usable", () => {
  assert.deepEqual(resolveSessionCodexCriticHighRiskRoute({ ...base,
    env: {}, select: () => { throw new Error("must not run"); } }), v3);
  for (const select of [() => { throw new Error("store unavailable"); },
    () => ({ ...selected, effort: "high" }),
    () => ({ ...selected, taskRoute: "duty.critic_normal" }),
    () => ({ ...selected, receiptSha256: "bad" })]) {
    assert.deepEqual(resolveSessionCodexCriticHighRiskRoute({ ...base,
      env: { CODEX_SESSION_ID: "session" }, select }), v3);
  }
});

test("invalid V3 authority cannot be masked by an admitted optional selection", () => {
  assert.throws(() => resolveSessionCodexCriticHighRiskRoute({ ...base,
    resolveV3: () => ({ ...v3, sourceSha256: "invalid" }),
    env: { CODEX_SESSION_ID: "session" }, select: () => selected }));
});

test("injected authority readers cannot replace the host's repository or candidate binding", () => {
  let observed;
  resolveSessionCodexCriticHighRiskRoute({ ...base,
    authorityDependencies: { rootDir: "/different/repository",
      candidateCommit: "f".repeat(40) },
    resolveV3: (request) => { observed = request; return v3; }, env: {} });
  assert.equal(observed.rootDir, rootDir);
  assert.equal(observed.candidateCommit, candidateCommit);
  let v3Calls = 0;
  assert.throws(() => resolveSessionCodexCriticHighRiskRoute({ ...base,
    resolveV3: () => { v3Calls++; return v3; },
    familyInvocationEntry: { observeActivation: () => ({ ok: false, code: "CRITIC-FAMILY-ACTIVATION-UNCERTAIN" }) } }), /CRITIC-FAMILY-ACTIVATION-UNCERTAIN/u);
  assert.equal(v3Calls, 0, "uncertain family authority cannot fall into V3");
});
