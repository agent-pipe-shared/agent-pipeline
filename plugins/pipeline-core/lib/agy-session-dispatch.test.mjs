// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatchAgySession, AGY_SESSION_CONSENT_SCHEMA, prepareAgyFamilyNativeDispatch, dispatchAgyFamilyNativeContext, readAgyFamilyHeldReturn, prepareAgyFamilyVerifiedReturn, verifyAgySessionResultReadback, readAgyFamilyVerifiedReturn, recheckAgyFamilyVerifiedReturn } from "./agy-session-dispatch.mjs";
import { AGY_FINAL_RETURN_JSON_SCHEMA, validateAgyFamilyReturnBinding, agyAgentTypeForRole, preflightAgyAuthoredRecord } from "./agy-final-return.mjs";
import { assessAgyHostCommit, captureAgyHostCommitBaseline } from "./agy-host-commit-admission.mjs";
import { classifyCriticChangedPaths, CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA, evaluateCriticTriggerRow } from "./critic-skip-decision.mjs";
import { finalizeAgyFamilyHostObservedReturn } from "../scripts/agy-host-observed-finalize.mjs";
import { inspectAgyHostObservedLocalReadback, withAgyFamilyLocalReadback } from "./agy-host-observed-local-readback.mjs";
import { readAgyHostObservedReceipt } from "./agy-host-observed-store.mjs";
import { resolveModelRoleSession } from "./model-role-session.mjs";
import { ROLE_DISPATCH_REQUEST_SCHEMA } from "./role-dispatch-preflight.mjs";
import { buildSignatureIntent, createAgyFamilyConsentAuthority, digest as canonicalDigest, familyConsentAssignment } from "./agy-session-authority.mjs";
import { verifyModelFamilyAuthority } from "./model-family-authority.mjs";
import { createModelFamilyHostController, readHeldModelFamilyInvocation } from "./model-family-host-store.mjs";
import { createModelFamilyRuntimeHost } from "./model-family-runtime-host.mjs";
import { createModelFamilyDiscoveryHost, RULE_FIELDS, pass, fail, digest as discoveryDigest } from "./model-family-discovery.mjs";
import { createAntigravityFamilyAdapter } from "./model-family-antigravity-adapter.mjs";
import { startSessionDescriptor } from "./worktree-lifecycle.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const session = { id: "agy-session-1", source: "runtime", observed: true };
const authority = { verifyAuthority: () => true };
const consent = (overrides = {}) => ({ schema: AGY_SESSION_CONSENT_SCHEMA, status: "approved", decisionId: "decision-1", sessionId: session.id, runner: "antigravity", provider: "google", model: "gemini-3.8-flash-high", role: "pipeline-core:goldfish-implementor", scope: "scope-1", subjectSha256: hash("scope-1"), approvedAtMs: 1, expiresAtMs: 9_999_999_999, ...overrides });
const packet = (overrides = {}) => ({ schema: ROLE_DISPATCH_REQUEST_SCHEMA, dispatchId: "agy-dispatch-1", transport: "antigravity", role: "pipeline-core:goldfish-implementor", prompt: "## Briefing\n### 1. Goal\nImplement the bounded task.\n### 2. Context files\n- input.txt\n### 3. DoD checks\n- Return a bounded result.\n### 4. Forbidden\n- No unrelated changes.\n### 5. Stop conditions\n- Required input unavailable.\n### 6. Dispatch-Metadata\nModel: gemini-3.8-flash-high; effort high; Ruleset-SHA: local-test.\n- **Tool budget (hard cap, first-class field):** <=40 tool uses.", candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, requiredPaths: ["input.txt"], requiredPathSha256: { "input.txt": hash("input\n") }, resultDestination: { kind: "return" }, ...overrides });

function familyFixture(nativeRole, { adapterContractSha256 = hash("adapter"), scope = { dispatchId: "agy-dispatch-1", purpose: "implementation" } } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agy-family-dispatch-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Synthetic"], { cwd: root });
  execFileSync("git", ["config", "user.email", "synthetic@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  writeFileSync(join(root, "input.txt"), "input\n"); mkdirSync(join(root, "results")); mkdirSync(join(root, "evidence"));
  execFileSync("git", ["-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "add", "input.txt"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "commit", "-qm", "synthetic fixture"], { cwd: root });
  const now = Date.parse("2026-10-02T12:00:00.000Z"), expires = now + 60000;
  const started = startSessionDescriptor(root, { sessionId: session.id }), repository = { primaryRoot: started.repo.primaryRoot, commonDir: started.repo.commonDir }, boundSession = { id: session.id, descriptorSha256: started.descriptorSha256 };
  mkdirSync(join(repository.commonDir, "agent-pipeline"), { mode: 0o700, recursive: true });
  const mechanic = nativeRole.endsWith("mechanic"), taskRoute = mechanic ? "duty.mechanic" : "duty.implement", role = mechanic ? "efficient" : "worker";
  const slot = { runner: "antigravity", taskRoute, role, effort: "high", familyId: "gemini" }, selector = { kind: "model-id", value: "synthetic-gemini-1" };
  const { publicKey, privateKey } = generateKeyPairSync("ed25519"), publicPem = publicKey.export({ type: "spki", format: "pem" });
  const trustAnchors = [{ keyReference: "synthetic-dispatch", publicKeySha256: hash(publicPem) }];
  const proofFor = intent => ({ schema: "pipeline.po-approval-proof.v1", intentSha256: intent.sha256, keyReference: trustAnchors[0].keyReference, publicKey: publicPem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") });
  const routeSource = { ok: true, taskRoutes: [{ runner: "antigravity", taskRoute, role, effort: "high", state: "default", selector }], configuredRoutes: [{ runner: "antigravity", role, effort: "high", selector }] };
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null, routeSourceSha256: canonicalDigest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes }), assignments: [{ runner: "antigravity", role, effort: "high", taskRoutes: [taskRoute], familyId: "gemini", adapterContractSha256, minimumVersion: [1], update: "latest" }], migration: null };
  const candidate = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim() }, value = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy", featureId: "model-role-routes", planSha256: subject.routeSourceSha256, specSha256: canonicalDigest(subject), candidate, policyRevision: "model-family-v2", subjectSha256: canonicalDigest(subject), decision: "approved" }, approvalIntent = { value, sha256: canonicalDigest(value) };
  const inputs = { routeSource, trustAnchors, predecessor: null, bundle: { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval: candidate, subject, approvalIntent, proof: proofFor(approvalIntent) } };
  const verified = verifyModelFamilyAuthority(inputs); assert.equal(verified.ok, true, verified.code);
  let version = 1, launched = 0, revoked = false, live = true;
  const key = invocationId => ({ runner: "antigravity", installationBindingSha256: hash("installation"), accountBindingSha256: hash("account"), sessionId: session.id, invocationId });
  const bindings = { installationBindingSha256: hash("installation"), accountBindingSha256: hash("account"), hostProcessBindingSha256: hash("process") };
  const sources = {
    readAuthorityInputs: () => inputs, readPinInputs: () => [], readCurrentCandidate: () => ({ candidateCommit: candidate.commit, candidateTree: candidate.tree }), launchDriver: () => { launched++; throw Error("must never launch"); },
    readFreshDiscovery: () => {
      const modelId = "synthetic-gemini-" + version, handle = Object.freeze({}), assignmentSlot = JSON.stringify([slot.runner, taskRoute, role, "high"]);
      const discovery = { schema: "pipeline.model-family-discovery.v1", runner: "antigravity", ...bindings, adapterContractSha256: hash("adapter"), mode: "complete-catalogue", observedAt: new Date(now).toISOString(), expiresAt: new Date(expires).toISOString(), rawEvidenceSha256: hash("raw"), coverageEvidenceSha256: hash("coverage"), compatibilityEvidenceSha256: null, latestAliasEvidenceSha256: null, records: [{ releaseId: "release-" + version, familyId: "gemini", version: [version], released: true, groupingEvidenceSha256: hash("group"), variants: [{ modelId, canonicalModelId: null, aliasEvidenceSha256: null, visible: true, selectable: true, efforts: ["high"], capabilityEvidenceSha256: hash("capability"), compatibilityBySlotSha256: { [assignmentSlot]: hash("compatibility") } }] }] };
      const context = { coverage: { familyId: "gemini", coverageEvidenceSha256: hash("coverage"), unknownTargetFamilyEvidenceSha256s: [] }, hardEligibility: { runner: "antigravity", taskRoute, role, effort: "high", evidenceSha256: hash("hard"), minimumVersion: null, deniedModelIds: [] }, variantRule: null, compatibility: { runner: "antigravity", taskRoute, role, effort: "high", modelId, evidenceSha256: hash("compatibility") }, latestAlias: null };
      const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
      freeze(discovery);
      return { discoveryHost: { readDiscovery: h => h === handle ? { ok: true, code: "DISCOVERY_READ", value: discovery } : { ok: false, code: "HANDLE" } }, discoveryHandle: handle, context };
    },
  };
  const controller = createModelFamilyHostController({ rootDir: join(repository.commonDir, "agent-pipeline"), clock: () => now, trustedSources: sources });
  const activated = controller.activate(); assert.equal(activated.ok, true, activated.code);
  const consentSubject = { schema: "pipeline.agy-session-consent-subject.v2", repository, session: boundSession, runner: "antigravity", provider: "google", familyAuthoritySha256: verified.value.authoritySha256, assignments: verified.value.assignments.map(familyConsentAssignment), roles: [nativeRole], allowedPaths: ["input.txt"], scope, fallbackPolicy: "none", expiresAtMs: expires, decisionNonce: "synthetic-dispatch-consent" };
  const intent = buildSignatureIntent({ featureId: "fixture", planSha256: hash("plan"), specSha256: hash("spec"), candidate, subjectSha256: canonicalDigest(consentSubject), policyRevision: "agy-session-family-v2" });
  let stored = { schema: "pipeline.agy-session-consent.v2", status: "approved", decisionId: consentSubject.decisionNonce, mode: "signature", session: boundSession, runner: "antigravity", provider: "google", familyAuthoritySha256: consentSubject.familyAuthoritySha256, assignments: consentSubject.assignments, roles: consentSubject.roles, allowedPaths: consentSubject.allowedPaths, subject: consentSubject, subjectSha256: canonicalDigest(consentSubject), intent, proof: proofFor(intent), attribution: null, approvedAtMs: now, expiresAtMs: expires };
  mkdirSync(join(repository.commonDir, "agent-pipeline/run/agy-session-consent"), { recursive: true, mode: 0o700 });
  writeFileSync(join(repository.commonDir, "agent-pipeline/run/agy-session-consent", session.id + ".json"), JSON.stringify(stored));
  const host = createAgyFamilyConsentAuthority({ readFamilyAuthority: () => inputs, readInvocation: ({ invocationId }) => { const held = readHeldModelFamilyInvocation({ rootDir: join(repository.commonDir, "agent-pipeline"), key: key(invocationId) }); return held.ok ? { invocation: held.value, bindings, provenanceSha256: canonicalDigest(held.value) } : held; }, readLive: () => live ? { ok: true, session: boundSession, descriptor: { repo: repository } } : { ok: false, code: "AGY-SESSION-OWNER-UNAVAILABLE" }, readStored: () => ({ record: stored, revoked }), readMode: () => ({ mode: "signature" }), readPolicy: () => ({ ok: true, trustAnchors }) });
  return { root, now, expires, host, consentSubject, nativeRole, key, controller, sources, routeSource, slot, candidate, boundSession, repository, bindings, prepare(n) { version = n; const r = controller.prepare({ key: key("invocation-" + n), assignment: slot }); assert.equal(r.ok, true, r.code); return r; }, mutate(fn) { stored = fn(stored); }, revoke(value = true) { revoked = value; }, loseOwner() { live = false; }, launched: () => launched };
}

function syntheticAgyContract() {
  const contract = { schema: "pipeline.model-family-adapter-contract.v1", runner: "antigravity", familyId: "gemini", discoveryModes: ["complete-catalogue"], providerEvidenceSha256s: [hash("provider-contract")] };
  for (const name of RULE_FIELDS) contract[name] = { id: "agy-native-" + name, version: 1, sha256: hash(name) };
  return contract;
}

async function actualAgyDiscovery(f, version, contract) {
  const modelId = "synthetic-gemini-" + version, rules = {};
  for (const name of RULE_FIELDS) {
    const run = name === "identityRule" ? ({ phase, entry }) => phase === "coverage" ? pass("SYNTHETIC", { mode: "complete-catalogue", evidenceSha256: hash("coverage"), latestAliasEvidenceSha256: null }) : pass("SYNTHETIC", { model: entry.modelId })
      : name === "releaseGroupingRule" ? () => pass("SYNTHETIC", { releaseId: "release-" + version, familyId: "gemini", groupingEvidenceSha256: hash("group") })
        : name === "versionRule" ? () => pass("SYNTHETIC", [version])
          : name === "variantSelectionRule" ? () => pass("SYNTHETIC", { modelId, canonicalModelId: null, aliasEvidenceSha256: null })
            : name === "selectabilityRule" ? () => pass("SYNTHETIC", { released: true, visible: true, selectable: true })
              : name === "effortRule" ? () => pass("SYNTHETIC", { efforts: ["high"], capabilityEvidenceSha256: hash("capability") }) : () => fail("SYNTHETIC_UNUSED");
    rules[contract[name].id] = { version: 1, sha256: contract[name].sha256, run };
  }
  let latest;
  const host = createModelFamilyDiscoveryHost({ rules, clock: () => new Date(f.now).toISOString(), capture: async context => pass("SYNTHETIC_CAPTURE", { bindings: context.bindings, observedAt: context.observedAt, source: "synthetic-Agy-native-test", pages: [{ request: { argv: ["models"] }, responseBytes: modelId + " Synthetic Gemini\n" }] }), verifyProviderContract: ({ contractSha256, contract: c }) => pass("SYNTHETIC_CONTRACT", { contractSha256, providerEvidenceSha256s: c.providerEvidenceSha256s }), compatibility: ({ runner, record, variant, slot }) => { const d = host.readDiscovery(latest).value; return pass("SYNTHETIC_COMPAT", { subjectSha256: discoveryDigest({ runner, releaseId: record.releaseId, modelId: variant.modelId, ...slot, discoverySha256: discoveryDigest(d), adapterContractSha256: d.adapterContractSha256 }), evidenceSha256: hash("compatibility") }); } });
  const context = host.createContext({ runner: "antigravity", bindings: f.bindings, observedAt: new Date(f.now).toISOString(), expiresAt: new Date(f.expires).toISOString() }).value;
  const qualified = host.qualifyContract(contract); assert.equal(qualified.ok, true, qualified.code);
  const adapter = createAntigravityFamilyAdapter(host), raw = await adapter.captureRawDiscovery(context); assert.equal(raw.ok, true, raw.code);
  const coverage = adapter.verifyCoverage(raw.value, context, qualified.value); assert.equal(coverage.ok, true, coverage.code);
  const normalized = adapter.normalizeReleases(raw.value, qualified.value, coverage.value); assert.equal(normalized.ok, true, normalized.code); latest = normalized.value;
  const compatible = adapter.verifyCompatibility({ discovery: latest, releaseId: "release-" + version, modelId }, { taskRoute: f.slot.taskRoute, role: f.slot.role, effort: "high" }, context, qualified.value); assert.equal(compatible.ok, true, compatible.code);
  const resolverContext = { coverage: { familyId: "gemini", coverageEvidenceSha256: hash("coverage"), unknownTargetFamilyEvidenceSha256s: [] }, hardEligibility: { runner: "antigravity", taskRoute: f.slot.taskRoute, role: f.slot.role, effort: "high", evidenceSha256: hash("hard"), minimumVersion: null, deniedModelIds: [] }, variantRule: null, compatibility: { runner: "antigravity", taskRoute: f.slot.taskRoute, role: f.slot.role, effort: "high", modelId, evidenceSha256: hash("compatibility") }, latestAlias: null };
  return { ok: true, value: { discoveryHost: host, discoveryHandle: compatible.value.discovery, context: resolverContext } };
}

test("actual Agy S2 S4 S5 native callers launch each signed successor once and retain unqualified family return", async () => {
  const { dispatchElephantAgyImplementation } = await import("../scripts/elephant-agy-implementation-dispatch.mjs");
  const { runGoldfishAntigravityLiveHost, LIVE_REQUEST_SCHEMA, LIVE_REQUEST_SEAL } = await import("../scripts/goldfish-antigravity-live-host.mjs");
  for (const nativeRole of ["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"]) {
    const contract = syntheticAgyContract(), f = familyFixture(nativeRole, { adapterContractSha256: canonicalDigest(contract), scope: "implementation" });
    try {
      let version = 1, admissionError; const launches = [], admissions = [], observations = new Map();
      const identity = invocationId => ({ ok: true, key: f.key(invocationId), assignment: f.slot, candidateCommit: f.candidate.commit, candidateTree: f.candidate.tree });
      const trustedSources = { ...f.sources,
        captureFreshDiscovery: () => actualAgyDiscovery(f, version, contract), resolveCurrentInvocationIdentity: ({ invocationId }) => identity(invocationId), resolveInvocationContext: ({ invocationId }) => identity(invocationId),
        admitNativeRequest: ({ invocation, key, assignment, request, rootDir, repositoryRoot, gitCommonDir: commonDir }) => {
          try {
          assert.equal(rootDir, join(f.repository.commonDir, "agent-pipeline")); assert.equal(repositoryRoot, f.root); assert.equal(commonDir, f.repository.commonDir);
          assert.deepEqual(Object.keys(request).sort(), ["schema", "root", "resultRoot", "resultPath", "packet", "sessionId", "descriptorSha256", "requestedModel", "effort", "scope", "fallbackPolicy", "inputSha256", "timeoutMs", "consent"].sort());
          assert.equal(request.root, f.root); assert.equal(request.resultRoot, f.root); assert.equal(request.descriptorSha256, f.boundSession.descriptorSha256);
          assert.equal(request.consent.assignmentSha256, f.consentSubject.assignments[0].assignmentSha256); assert.equal(invocation.role, f.slot.role); assert.equal(invocation.familyId, f.slot.familyId); assert.equal(invocation.taskRoute, f.slot.taskRoute);
          assert.equal(invocation.adapterContractSha256, canonicalDigest(contract)); assert.equal(invocation.storeGeneration > 0, true); assert.equal(Object.isFrozen(request.packet), true);
          assert.equal(request.schema, "pipeline.agy-native-implementation-request.v2"); assert.equal(request.sessionId, key.sessionId); assert.equal(request.packet.dispatchId, key.invocationId);
          assert.equal(request.requestedModel, invocation.selectedModelId); assert.equal(request.effort, invocation.effort); assert.equal(request.packet.role, nativeRole); assert.equal(assignment.taskRoute, f.slot.taskRoute);
          assert.deepEqual(request.packet.candidate, Object.assign(Object.create(null), f.candidate)); assert.equal(Object.getPrototypeOf(request.packet.candidate), null); assert.match(request.packet.prompt, /Implement the bounded task/u); assert.equal(request.consent.familyAuthoritySha256, invocation.authoritySha256); assert.equal(request.scope, "implementation"); assert.equal(request.fallbackPolicy, "none"); admissions.push(request); return { ok: true, code: "SYNTHETIC_NATIVE_SCHEMA" };
          } catch (error) { admissionError = error; throw error; }
        }, launchDriver: ({ invocation, nativeRequest }) => {
          assert.equal(nativeRequest.requestedModel, invocation.selectedModelId); assert.equal(Object.isFrozen(nativeRequest), true);
          const returning = nativeRequest.packet.dispatchId.startsWith("return-");
          const childSource = returning ? "const fs=require('node:fs');const r=JSON.parse(fs.readFileSync(0,'utf8'));const s=JSON.parse(process.argv[1]);const o={schema:'pipeline.agy-final-return.v1',dispatchId:r.packet.dispatchId,candidateCommit:r.packet.candidate.commit,outcome:'succeeded',report:'Synthetic bounded implementation completed.',changedPaths:['input.txt']};fs.writeFileSync('input.txt','implemented\\n');process.stdout.write(JSON.stringify({conversation_id:'synthetic-native',status:'SUCCESS',response:JSON.stringify(o),structured_output:o,json_schema:s,model:r.requestedModel,effort:r.effort}));"
            : "const fs=require('node:fs');const r=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify({schema:'pipeline.synthetic-agy-native-result.v1',requestedModel:r.requestedModel,effort:r.effort,dispatchId:r.packet.dispatchId,prompt:r.packet.prompt}));";
          const raw = execFileSync(process.execPath, ["-e", childSource, JSON.stringify(AGY_FINAL_RETURN_JSON_SCHEMA)], { cwd: f.root, input: JSON.stringify(nativeRequest), encoding: "utf8", timeout: 2000, maxBuffer: 65536 });
          const payload = JSON.parse(raw);
          if (returning) { assert.equal(payload.model, invocation.selectedModelId); assert.equal(payload.effort, invocation.effort); assert.equal(payload.structured_output.dispatchId, invocation.invocationId); }
          else assert.deepEqual(payload, { schema: "pipeline.synthetic-agy-native-result.v1", requestedModel: invocation.selectedModelId, effort: invocation.effort, dispatchId: invocation.invocationId, prompt: nativeRequest.packet.prompt });
          const value = { launcherCalls: 1, modelCalls: 1, payload, rawSha256: hash(raw), rawBytes: Buffer.byteLength(raw) };
          observations.set(canonicalDigest(value), { actualModelIds: [invocation.selectedModelId], actualEffort: invocation.effort });
          launches.push(nativeRequest); return { ok: true, value };
        },
      };
      const runtime = createModelFamilyRuntimeHost({ cwd: f.root, clock: () => f.now, trustedSources });
      const makePreparation = (dispatchId, runtimeHost = runtime) => {
        const p = packet({ role: nativeRole, candidate: f.candidate, dispatchId });
        return { packet: p, input: { root: f.root, packet: p, sessionId: session.id, descriptorSha256: f.boundSession.descriptorSha256,
          resultPath: "results/" + dispatchId + ".json", consentAuthority: f.host, runtimeHost, routeSource: f.routeSource,
          scope: "implementation", fallbackPolicy: "none", nowEpochMs: f.now } };
      };
      for (const port of ["resolveCurrentInvocationIdentity", "resolveInvocationContext"]) {
        const missing = { ...trustedSources }; delete missing[port];
        const host = createModelFamilyRuntimeHost({ cwd: f.root, clock: () => f.now, trustedSources: missing });
        const prepared = await prepareAgyFamilyNativeDispatch(makePreparation("missing-" + port, host).input);
        assert.equal(prepared.ok, false); assert.equal(prepared.code, "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
        assert.equal(launches.length, 0); assert.equal(admissions.length, 0);
      }
      const missingNativeSources = { ...trustedSources }; delete missingNativeSources.admitNativeRequest;
      const missingNativeHost = createModelFamilyRuntimeHost({ cwd: f.root, clock: () => f.now, trustedSources: missingNativeSources });
      const missingNative = await prepareAgyFamilyNativeDispatch(makePreparation("missing-native", missingNativeHost).input); assert.equal(missingNative.ok, true, missingNative.code);
      assert.equal((await dispatchAgyFamilyNativeContext({ context: missingNative.context, inputSha256: hash("input"), timeoutMs: 1000, nowEpochMs: f.now })).code, "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
      assert.equal(launches.length, 0); assert.equal(admissions.length, 0);
      for (const n of [1, 2]) {
        version = n; const p = packet({ role: nativeRole, candidate: f.candidate, dispatchId: "native-" + n }), requestPath = join(f.root, "request-" + n + ".json"); writeFileSync(requestPath, JSON.stringify(p));
        const args = { root: f.root, dispatchRequestPath: requestPath, resultPath: "results/native-" + n + ".json", sessionId: session.id, descriptorSha256: f.boundSession.descriptorSha256 };
        const dependencies = { familyConsentAuthority: f.host, familyRuntimeHost: runtime, familyRouteSource: f.routeSource, nowEpochMs: f.now, routeAuthority: () => { throw Error("no V3 fallback"); }, runLiveHost: () => { throw Error("no alternate native lane"); } };
        const result = await dispatchElephantAgyImplementation(args, dependencies); if (admissionError) throw admissionError; assert.equal(result.code, "AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED", JSON.stringify(result)); assert.equal(result.status, "recovery-required"); assert.equal(result.launcherCalls, 1); assert.equal(result.modelCalls, 1); assert.equal(result.observed.identityEvidence, "unknown"); assert.equal(result.record, null); assert.equal(launches.length, n); assert.equal(admissions.length, n); assert.equal(launches[n - 1].requestedModel, "synthetic-gemini-" + n);
        const replay = await dispatchElephantAgyImplementation(args, dependencies); assert.equal(replay.code, "MODEL-FAMILY-NATIVE-CAPABILITY-CONSUMED"); assert.equal(launches.length, n);
      }
      const mutation = makePreparation("mutation-concurrent"), prepared = await prepareAgyFamilyNativeDispatch(mutation.input); assert.equal(prepared.ok, true, prepared.code);
      // The original caller packet is changed after selection. S4 admits and
      // freezes its own request snapshot; the driver must receive the original.
      mutation.packet.prompt = "caller mutation after selection"; mutation.packet.requiredPaths.push("secret");
      assert.equal((await dispatchAgyFamilyNativeContext({ context: structuredClone(prepared.context), inputSha256: hash("input"), nowEpochMs: f.now })).code, "AGY-SESSION-FAMILY-CONTEXT-REQUIRED");
      assert.equal((await dispatchAgyFamilyNativeContext({ context: prepared.context, inputSha256: hash("input"), timeoutMs: 1000, nowEpochMs: f.now })).code, "AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED"); if (admissionError) throw admissionError;
      assert.equal(launches.length, 3); assert.match(launches[2].packet.prompt, /Implement the bounded task/u); assert.deepEqual([...launches[2].packet.requiredPaths], ["input.txt"]);
      const originalAdmission = trustedSources.admitNativeRequest;
      let releaseAdmission, observedAdmission;
      trustedSources.admitNativeRequest = async value => { const result = originalAdmission(value); observedAdmission = value.request; await new Promise(resolve => { releaseAdmission = resolve; }); return result; };
      // Runtime construction copies ports. Create a fresh host for the delayed
      // admission, with the same signed authority/store and a new invocation.
      const concurrentRuntime = createModelFamilyRuntimeHost({ cwd: f.root, clock: () => f.now, trustedSources });
      const delayed = makePreparation("delayed-concurrent", concurrentRuntime), delayedPrepared = await prepareAgyFamilyNativeDispatch(delayed.input); assert.equal(delayedPrepared.ok, true, delayedPrepared.code);
      const call = () => dispatchAgyFamilyNativeContext({ context: delayedPrepared.context, inputSha256: hash("input"), timeoutMs: 1000, nowEpochMs: f.now });
      const first = call();
      for (let turn = 0; turn < 30 && !releaseAdmission; turn++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(typeof releaseAdmission, "function"); assert.equal(Object.isFrozen(observedAdmission.packet), true);
      assert.throws(() => { observedAdmission.packet.prompt = "mutation after bind"; }, TypeError);
      delayed.packet.prompt = "caller mutation while binding";
      const second = await call(); assert.equal(second.code, "MODEL-FAMILY-NATIVE-CAPABILITY-CONSUMED"); assert.equal(launches.length, 3);
      releaseAdmission(); const completed = await first; if (admissionError) throw admissionError;
      assert.equal(completed.code, "AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED"); assert.equal(launches.length, 4); assert.match(launches[3].packet.prompt, /Implement the bounded task/u);
      assert.equal((await call()).code, "AGY-SESSION-FAMILY-CONTEXT-MISMATCH"); assert.equal(launches.length, 4);
      const held = readAgyFamilyHeldReturn(delayedPrepared.context); assert.equal(held.ok, true); assert.equal(held.value.invocation.invocationId, "delayed-concurrent");
      assert.equal(held.value.nativeResult.ok, true); assert.equal(held.value.nativeRequest.consent.consentRecordSha256, delayedPrepared.consent.consentRecordSha256);
      held.value.nativeRequest.packet.prompt = "public readback mutation"; assert.match(readAgyFamilyHeldReturn(delayedPrepared.context).value.nativeRequest.packet.prompt, /Implement the bounded task/u);
      trustedSources.admitNativeRequest = originalAdmission;
      const returnRuntime = createModelFamilyRuntimeHost({ cwd: f.root, clock: () => f.now, trustedSources });
      const returning = makePreparation("return-verified", returnRuntime), returnPrepared = await prepareAgyFamilyNativeDispatch(returning.input); assert.equal(returnPrepared.ok, true, returnPrepared.code);
      const hookMarker = join(f.repository.commonDir, "ordinary-hook-observed"), hook = join(f.repository.commonDir, "hooks", "pre-commit");
      writeFileSync(hook, '#!/bin/sh\nprintf invoked > "$(git rev-parse --git-common-dir)/ordinary-hook-observed"\n'); chmodSync(hook, 0o700);
      const captured = captureAgyHostCommitBaseline({ root: f.root, candidateCommit: f.candidate.commit, resultPath: returning.input.resultPath }); assert.equal(captured.ok, true, captured.code);
      assert.equal((await dispatchAgyFamilyNativeContext({ context: returnPrepared.context, inputSha256: hash("return-input"), nowEpochMs: f.now })).code, "AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED");
      const identityHost = createModelFamilyDiscoveryHost({ clock: () => new Date(f.now).toISOString(), execution: ({ rawHostResult, bindings }) => {
        const observed = observations.get(canonicalDigest(rawHostResult));
        return observed && canonicalDigest(bindings) === canonicalDigest(f.bindings) ? pass("SYNTHETIC_CHILD_IDENTITY", { ...observed, rawHostResultSha256: canonicalDigest(rawHostResult), hostObservationSha256: hash("actual-child-observation") }) : fail("EXECUTION_IDENTITY_UNAVAILABLE");
      } });
      const identityContext = identityHost.createContext({ runner: "antigravity", bindings: f.bindings, observedAt: new Date(f.now).toISOString(), expiresAt: new Date(f.expires).toISOString() }).value;
      const ports = { adapters: { antigravity: createAntigravityFamilyAdapter(identityHost) }, contextForInvocation: () => pass("S2_CONTEXT", identityContext),
        readOriginalInvocation: ({ invocationId }) => { const r = readHeldModelFamilyInvocation({ rootDir: join(f.repository.commonDir, "agent-pipeline"), key: f.key(invocationId) }); return r.ok ? pass("S4_ORIGINAL", { invocation: r.value, bindings: f.bindings, provenanceSha256: canonicalDigest(r.value) }) : r; },
        readLaunchEvidence: ({ invocation: i }) => pass("SYNTHETIC_CHILD_CONTROLS", { invocationReceiptSha256: i.receiptSha256, runner: "antigravity", supported: { status: "supported", efforts: ["high"], evidenceSha256: canonicalDigest(contract) }, requested: { modelId: i.selectedModelId, effort: i.effort, evidenceSha256: hash("requested") }, configured: { modelId: i.selectedModelId, effort: i.effort, evidenceSha256: hash("configured"), assurance: "host-configured" }, execution: { status: "succeeded", evidenceSha256: hash("child-exit-zero") } }) };
      const returnInput = { context: returnPrepared.context, ports, observedAtMs: f.now, routePolicySha256: hash("route"), inputSha256: hash("return-input") };
      assert.equal((await prepareAgyFamilyVerifiedReturn({ ...returnInput, observedAtMs: f.expires })).ok, false, "consent expired at the actual observation cannot admit a return");
      assert.equal((await prepareAgyFamilyVerifiedReturn({ ...returnInput, context: structuredClone(returnPrepared.context) })).ok, false);
      assert.equal((await prepareAgyFamilyVerifiedReturn({ ...returnInput, ports: {} })).code, "AGY-FAMILY-EXECUTION-PORTS-UNQUALIFIED");
      assert.equal((await prepareAgyFamilyVerifiedReturn({ ...returnInput, ports: { ...ports, readOriginalInvocation: () => pass("FORGED", {}) } })).ok, false);
      const verified = await prepareAgyFamilyVerifiedReturn(returnInput); assert.equal(verified.ok, true, verified.code); assert.equal(verified.witness.schema, "pipeline.agy-host-model-witness.v2");
      assert.equal(validateAgyFamilyReturnBinding(verified.witness.family, verified.witness), true);
      assert.equal(readAgyFamilyVerifiedReturn(structuredClone(verified.handle)).ok, false);
      const readInput = { resultRoot: f.root, resultPath: returning.input.resultPath, receipt: verified.result, dispatchId: "return-verified", candidate: f.candidate, sessionId: session.id, requestedModel: returnPrepared.receipt.selectedModelId, expectedFinal: verified.final, familyWitness: verified.witness };
      assert.equal(verifyAgySessionResultReadback(readInput).ok, true);
      for (const change of [{ dispatchId: "foreign" }, { requestedModel: "foreign-model" }, { familyWitness: { ...verified.witness, role: "pipeline-core:critic" } }, { familyWitness: { ...verified.witness, family: { ...verified.witness.family, nativeRequestSha256: hash("foreign") } } }]) assert.equal(verifyAgySessionResultReadback({ ...readInput, ...change }).ok, false);
      for (const change of [{ invocation: { ...verified.witness.family.invocation, taskRoute: "duty.other" } }, { consentBinding: { ...verified.witness.family.consentBinding, expiresAtMs: f.now } }]) assert.equal(validateAgyFamilyReturnBinding({ ...verified.witness.family, ...change }, verified.witness), false);
      assert.equal((await recheckAgyFamilyVerifiedReturn(verified.handle)).ok, true); f.revoke(); assert.equal((await recheckAgyFamilyVerifiedReturn(verified.handle)).code, "AGY-CONSENT-REVOKED-OR-MISSING"); f.revoke(false);
      const admission = assessAgyHostCommit({ baseline: captured.baseline, final: verified.final, allowedPaths: f.consentSubject.allowedPaths }); assert.equal(admission.ok, true, admission.code);
      const trigger = { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: true, diff: classifyCriticChangedPaths(admission.paths) };
      const criticRequired = { schema: CRITIC_REQUIRED_SCHEMA, trigger, appliedRow: evaluateCriticTriggerRow(trigger), reason: "Synthetic source delivery requires independent Critic evidence." };
      const recordPreflight = preflightAgyAuthoredRecord({ taskId: "return-verified", agentType: agyAgentTypeForRole(nativeRole), observedModel: verified.witness.model, effort: "high", rulesetSha: hash("route"), baselineCommit: f.candidate.commit, final: verified.final, criticRequired }); assert.equal(recordPreflight.ok, true, recordPreflight.code);
      const sealed = { ...returning.input, packet: returning.packet, requestedModel: returnPrepared.receipt.selectedModelId, effort: "high", resultRoot: f.root, routePolicySha256: hash("route"), inputSha256: hash("return-input") };
      const pending = { status: "final-pending-host-commit", result: verified.result, familyReturnHandle: verified.handle, commitAdmission: { ...admission, baseline: captured.baseline, final: verified.final, criticRequired, recordPreflight, modelWitness: verified.witness } };
      assert.equal((await finalizeAgyFamilyHostObservedReturn({ sealed, launched: { ...pending, familyReturnHandle: structuredClone(verified.handle) } })).status, "recovery-required");
      for (const drift of [{ root: f.root + "/foreign" }, { resultRoot: f.root + "/foreign" }, { resultPath: "results/foreign.json" }, { packet: { ...sealed.packet, role: "pipeline-core:critic" } }]) {
        assert.equal((await finalizeAgyFamilyHostObservedReturn({ sealed: { ...sealed, ...drift }, launched: pending })).code, "AGY-FAMILY-FINALIZE-WITNESS-DRIFT");
        assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: f.root, encoding: "utf8" }).trim(), f.candidate.commit, "drift refuses before commit");
      }
      const delivered = await finalizeAgyFamilyHostObservedReturn({ sealed, launched: pending }); assert.equal(delivered.status, "authored-commit-recorded", JSON.stringify(delivered));
      assert.equal(readFileSync(hookMarker, "utf8"), "invoked", "ordinary Git hook executes without bypass");
      const git = (...args) => execFileSync("git", args, { cwd: f.root, encoding: "utf8" }).trim();
      assert.equal(git("rev-parse", "HEAD^"), f.candidate.commit); assert.equal(git("rev-parse", "HEAD"), delivered.record.commit);
      assert.deepEqual(git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n"), ["input.txt"]);
      assert.match(git("log", "-1", "--format=%B"), /^Agy-Host-Observed: v2$/mu);
      const recordBytes = readFileSync(join(f.root, delivered.record.target)), record = JSON.parse(recordBytes);
      const privateReceipt = readAgyHostObservedReceipt({ commonDir: f.repository.commonDir, taskId: "return-verified", record, recordBytes }); assert.equal(privateReceipt.ok, true, privateReceipt.code);
      assert.equal(privateReceipt.receipt.observedAtMs, f.now); assert.equal(privateReceipt.receipt.schema, "pipeline.agy-host-observed-receipt.v2"); assert.equal(privateReceipt.receipt.tree, git("rev-parse", "HEAD^{tree}"));
      const readbackInput = { root: f.root, taskId: "return-verified", record, recordBytes };
      assert.equal(inspectAgyHostObservedLocalReadback(readbackInput).code, "AGY-LOCAL-FAMILY-SOURCE-UNQUALIFIED");
      version = 9;
      const realNow = Date.now;
      try {
        Date.now = () => f.expires + 1000;
        assert.equal((await withAgyFamilyLocalReadback({ root: f.root, handle: verified.handle, operation: () => inspectAgyHostObservedLocalReadback(readbackInput) })).ok, true, "historical readback uses the original permitted event despite today's successor and expiry");
      } finally { Date.now = realNow; }
      assert.equal((await withAgyFamilyLocalReadback({ root: f.root, handle: structuredClone(verified.handle), operation: () => inspectAgyHostObservedLocalReadback(readbackInput) })).ok, false);
      const storedConsentPath = join(f.repository.commonDir, "agent-pipeline/run/agy-session-consent", session.id + ".json"), storedConsentBytes = readFileSync(storedConsentPath), forgedStoredConsent = JSON.parse(storedConsentBytes);
      forgedStoredConsent.subject.scope = "foreign-scope"; forgedStoredConsent.scope = "foreign-scope";
      try {
        writeFileSync(storedConsentPath, JSON.stringify(forgedStoredConsent));
        assert.equal((await withAgyFamilyLocalReadback({ root: f.root, handle: verified.handle, operation: () => inspectAgyHostObservedLocalReadback(readbackInput) })).ok, false, "physical stored scope mutation cannot borrow private admission");
      } finally { writeFileSync(storedConsentPath, storedConsentBytes); }
      try {
        writeFileSync(storedConsentPath + ".revoked", JSON.stringify([{ decisionId: verified.witness.consentDecisionId }]));
        assert.equal((await withAgyFamilyLocalReadback({ root: f.root, handle: verified.handle, operation: () => inspectAgyHostObservedLocalReadback(readbackInput) })).ok, false, "physical revocation denies historical readback");
      } finally { rmSync(storedConsentPath + ".revoked"); }
      f.revoke(); assert.equal((await withAgyFamilyLocalReadback({ root: f.root, handle: verified.handle, operation: () => inspectAgyHostObservedLocalReadback(readbackInput) })).ok, false); f.revoke(false);
      assert.equal(launches.length, 5, "return verification performs no extra child launch or selection");
      const request = { schema: LIVE_REQUEST_SCHEMA, seal: LIVE_REQUEST_SEAL, root: f.root, resultRoot: f.root, resultPath: "results/forged.json", packet: packet({ candidate: f.candidate }), sessionId: session.id, descriptorSha256: f.boundSession.descriptorSha256, consent: "stored", requestedModel: "synthetic-gemini-2", effort: "high", scope: "implementation", inputSha256: hash("input"), routePolicySha256: hash("route"), timeoutMs: 1000 };
      assert.equal((await runGoldfishAntigravityLiveHost(structuredClone(request), { dispatchAgySession: () => { throw Error("must not launch"); } })).code, "AGY-LIVE-FAMILY-CONTEXT-REQUIRED");
      assert.equal((await dispatchAgyFamilyNativeContext({ context: {}, inputSha256: hash("input") })).code, "AGY-SESSION-FAMILY-CONTEXT-REQUIRED");
      assert.equal(readAgyFamilyHeldReturn({}).ok, false);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("v2 lightweight dispatch rechecks actual signed consent and S4 successor invocations without an unchecked launch", async () => {
  for (const nativeRole of ["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"]) {
    const f = familyFixture(nativeRole);
    try {
      const admitted = await f.host.admit({ root: f.root, sessionId: session.id, descriptorSha256: f.boundSession.descriptorSha256, nowEpochMs: f.now }); assert.equal(admitted.ok, true, admitted.code);
      for (const n of [1, 2]) {
        f.prepare(n);
        const request = { invocationId: "invocation-" + n, requestedModel: "synthetic-gemini-" + n, requestedEffort: "high", role: nativeRole, scope: f.consentSubject.scope, requiredPaths: ["input.txt"], fallbackPolicy: "none", nowEpochMs: f.now };
        const bound = await f.host.bind(admitted.handle, request); assert.equal(bound.ok, true, bound.code);
        const common = { ...authority, root: f.root, packet: packet({ role: nativeRole, candidate: f.candidate }), session, requestedModel: request.requestedModel, effort: "high", scope: request.scope, inputSha256: hash("input"), consent: bound.projection, familyConsentAuthority: f.host, familyConsentHandle: admitted.handle, familyInvocationId: request.invocationId, fallbackPolicy: "none", nowEpochMs: f.now, agyPath: "must-not-run" };
        const result = await dispatchAgySession(common); assert.equal(result.code, "AGY-SESSION-FAMILY-SHARED-LAUNCH-UNAVAILABLE", JSON.stringify(result)); assert.equal(result.preparation.status, "consent-bound"); assert.equal(result.modelCalls, 0); assert.equal(result.launcherCalls, 0);
        for (const change of [{ familyConsentAuthority: { bind: () => ({ ok: true, projection: bound.projection }) } }, { familyConsentHandle: structuredClone(admitted.handle) }, { familyConsentHandle: bound.projection }, { familyConsentAuthority: undefined, familyConsentHandle: undefined }, { consent: { ...bound.projection, extra: true } }, { consent: { ...bound.projection, assignmentSha256: hash("forged") } }, { requestedModel: "other" }, { effort: "medium" }, { packet: packet({ role: nativeRole.endsWith("mechanic") ? "pipeline-core:goldfish-implementor" : "pipeline-core:goldfish-mechanic" }) }, { packet: packet({ dispatchId: "other", role: nativeRole }) }, { packet: packet({ role: nativeRole, requiredPaths: ["secret"] }) }, { packet: packet({ role: nativeRole, candidate: { ...packet().candidate, tree: "c".repeat(40) } }) }, { scope: {} }, { fallbackPolicy: "automatic" }, { nowEpochMs: f.expires }]) {
          const denied = await dispatchAgySession({ ...common, ...change }); assert.equal(denied.status, "rejected"); assert.equal(denied.preparation, undefined, JSON.stringify(change)); assert.equal(denied.launcherCalls, 0);
        }
        assert.equal((await dispatchAgySession({ ...common, consent: consent(), modelRoleStore: { read: () => { throw Error("V3 fallback must not be read"); } } })).code, "AGY-SESSION-FAMILY-CONSENT-V2-REQUIRED");
        for (const role of ["worker", "efficient", "frontier", "pipeline-core:critic", "pipeline-core:advisor"]) assert.equal((await dispatchAgySession({ ...common, packet: packet({ role }) })).code, "AGY-SESSION-ROLE-FORBIDDEN");
        if (n === 2) { f.mutate(r => ({ ...r, extra: true })); assert.equal((await dispatchAgySession(common)).code, "AGY-CONSENT-RECORD-CHANGED"); f.mutate(({ extra, ...r }) => r); f.revoke(); assert.equal((await dispatchAgySession(common)).code, "AGY-CONSENT-REVOKED-OR-MISSING"); f.revoke(false); f.loseOwner(); assert.equal((await dispatchAgySession(common)).code, "AGY-SESSION-OWNER-UNAVAILABLE"); }
      }
      assert.equal(f.launched(), 0);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("no consent and invalid session fail before any model call", async () => {
  let calls = 0;
  const result = await dispatchAgySession({ ...authority, packet: packet(), session, requestedModel: "gemini-3.8-flash-high", scope: "scope-1", inputSha256: hash("scope-1"), consent: undefined, agyPath: "unused", nowEpochMs: 2 });
  calls += result.modelCalls ?? 0;
  assert.equal(result.code, "AGY-SESSION-CONSENT-REQUIRED");
  assert.equal(calls, 0);
  const wrongSession = await dispatchAgySession({ ...authority, packet: packet(), session: { ...session, id: "other" }, requestedModel: "gemini-3.8-flash-high", scope: "scope-1", inputSha256: hash("scope-1"), consent: consent(), agyPath: "unused", nowEpochMs: 2 });
  assert.equal(wrongSession.code, "AGY-SESSION-CONSENT-INVALID");
});

test("role, model, scope and consent are closed and bound", async () => {
  const common = { ...authority, packet: packet(), session, requestedModel: "gemini-3.8-flash-high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: "unused", nowEpochMs: 2 };
  assert.equal((await dispatchAgySession({ ...common, packet: packet({ role: "pipeline-core:critic" }), consent: consent({ role: "pipeline-core:critic" }) })).code, "AGY-SESSION-ROLE-FORBIDDEN");
  assert.equal((await dispatchAgySession({ ...common, consent: consent({ model: "gemini-other" }) })).code, "AGY-SESSION-CONSENT-INVALID");
  assert.equal((await dispatchAgySession({ ...common, inputSha256: "bad", consent: consent() })).code, "AGY-SESSION-INPUT-MISMATCH");
  assert.equal((await dispatchAgySession({ ...common, consent: consent({ expiresAtMs: 2 }) })).code, "AGY-SESSION-CONSENT-INVALID");
});

test("an opted-in functional model route rejects a substituted model before launch", async () => {
  const selected = resolveModelRoleSession({ runner: "antigravity", role: "worker", effort: "medium",
    sessionId: session.id, candidateCommit: "a".repeat(40), observedAt: "2026-09-26T00:00:00.000Z",
    policy: { schema: "pipeline.model-role-policy.v1", runner: "antigravity", role: "worker",
      approved: [{ modelId: "gemini-3.8-flash-medium", rank: 1, efforts: ["medium"],
        compatibilityEvidenceSha256: "b".repeat(64) }] },
    availableModelIds: ["gemini-3.8-flash-medium"] });
  assert.equal(selected.ok, true);
  const result = await dispatchAgySession({ ...authority, packet: packet(), session,
    consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "medium",
    modelRoleStore: { read: () => ({ ok: true, sessionId: session.id,
      receipts: [selected.receipt], admission: {
        ok: true, code: "MODEL-ROLE-BOOTSTRAP-ADMITTED", readbackSha256: "c".repeat(64),
        receiptSha256s: [selected.receipt.receiptSha256] } }) },
    scope: "scope-1", inputSha256: hash("scope-1"), agyPath: "unused", nowEpochMs: 2 });
  assert.equal(result.code, "AGY-SESSION-MODEL-ROLE-NOT-BOUND");
  assert.equal(result.launcherCalls, 0);
});

test("a missing optional role receipt preserves only the valid consent-bound V3 route", async () => {
  const common = { ...authority, packet: packet(), session,
    requestedModel: "gemini-3.8-flash-medium", effort: "medium",
    consent: consent({ model: "gemini-3.8-flash-medium" }),
    modelRoleStore: { read: () => ({ ok: false, code: "MODEL-ROLE-STORE-UNAVAILABLE" }) },
    scope: "scope-1", inputSha256: hash("scope-1"), agyPath: "unused", nowEpochMs: 2 };
  const fallback = await dispatchAgySession(common);
  assert.equal(fallback.code, "AGY-SESSION-PREFLIGHT-FAILED", JSON.stringify(fallback));
  assert.equal(fallback.modelCalls, 0);
  const mechanicFallback = await dispatchAgySession({ ...common,
    packet: packet({ role: "pipeline-core:goldfish-mechanic" }),
    consent: consent({ model: "gemini-3.8-flash-medium", role: "pipeline-core:goldfish-mechanic" }) });
  assert.equal(mechanicFallback.code, "AGY-SESSION-PREFLIGHT-FAILED", JSON.stringify(mechanicFallback));
  const unapproved = await dispatchAgySession({ ...common, requestedModel: "unapproved-model",
    consent: consent({ model: "unapproved-model" }) });
  assert.equal(unapproved.code, "AGY-SESSION-MODEL-ROLE-NOT-BOUND");
  assert.equal(unapproved.launcherCalls, 0);
  const damagedAuthority = await dispatchAgySession({ ...common, readRegistry: () => ({ duties: {} }) });
  assert.equal(damagedAuthority.code, "AGY-SESSION-MODEL-ROLE-NOT-BOUND");
  assert.equal(damagedAuthority.launcherCalls, 0);
});

test("same-session consent permits a bounded positive fixture dispatch and exclusive result", async () => {
  const root = mkdtempSync(join(tmpdir(), "agy-session-dispatch-"));
  const agy = join(root, "agy-mock");
  writeFileSync(join(root, "input.txt"), "input\n");
  mkdirSync(join(root, "results"));
  writeFileSync(agy, "#!/usr/bin/env node\nconst mode = process.env.AGY_MODE; if (mode === 'auth') { console.error('Please login'); process.exit(1); } if (mode === 'quota') { console.error('quota exhausted'); process.exit(2); } if (mode === 'timeout') { setTimeout(() => {}, 5000); } else if (mode === 'malformed') console.log('not-json'); else if (mode === 'mismatch') console.log(JSON.stringify({status:'SUCCESS',response:'ok',model:'gemini-other'})); else if (mode === 'unknown') console.log(JSON.stringify({status:'SUCCESS',response:'ok'})); else if (mode === 'structured') { const args=process.argv; const json_schema=JSON.parse(args[args.indexOf('--json-schema')+1]); const structured_output={schema:'pipeline.agy-final-return.v1',dispatchId:process.env.AGY_DISPATCH_ID,candidateCommit:process.env.AGY_CANDIDATE_COMMIT,outcome:'succeeded',report:'done',changedPaths:['input.txt']}; console.log(JSON.stringify({conversation_id:'structured-one',status:'SUCCESS',response:JSON.stringify(structured_output),structured_output,json_schema,model:'gemini-3.8-flash-high'})); } else console.log(JSON.stringify({status:'SUCCESS',response:'ok',model:'gemini-3.8-flash-high'}));\n");
  chmodSync(agy, 0o755);
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "agy@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Agy fixture"], { cwd: root });
    execFileSync("git", ["add", "input.txt"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
    const candidate = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim() };
    const result = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/result.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, packet: packet({ candidate }), nowEpochMs: 2 });
    assert.equal(result.status, "completed-undelivered", JSON.stringify(result));
    assert.equal(result.code, "AGY-SESSION-FINAL-UNDELIVERED");
    assert.equal(result.observed.model, "gemini-3.8-flash-high");
    assert.equal(existsSync(join(root, "results/result.json")), true);
    assert.equal(result.result.sha256, hash(readFileSync(join(root, "results/result.json"))));
    const replay = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/result.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, packet: packet({ candidate, dispatchId: "agy-dispatch-2" }), nowEpochMs: 2 });
    assert.equal(replay.code, "AGY-SESSION-RESULT-COLLISION");
    assert.match(readFileSync(join(root, "results/result.json"), "utf8"), /gemini-3\.8-flash-high/u);
    const secondTask = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/second.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("different-task-input"), agyPath: agy, packet: packet({ candidate, dispatchId: "agy-dispatch-3" }), nowEpochMs: 2 });
    assert.equal(secondTask.status, "completed-undelivered");
    const structured = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/structured.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, packet: packet({ candidate, dispatchId: "agy-structured" }), env: { ...process.env, AGY_MODE: "structured", AGY_DISPATCH_ID: "agy-structured", AGY_CANDIDATE_COMMIT: candidate.commit }, requireStructuredFinal: true, nowEpochMs: 2 });
    assert.equal(structured.status, "final-pending-host-commit", JSON.stringify(structured));
    assert.equal(structured.final.reportSha256, hash("done"));
    assert.deepEqual(structured.final.changedPaths, ["input.txt"]);
    const unknown = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/unknown.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, env: { ...process.env, AGY_MODE: "unknown" }, packet: packet({ candidate, dispatchId: "agy-unknown" }), requireObservedModel: true, nowEpochMs: 2 });
    assert.equal(unknown.code, "AGY-SESSION-MODEL-UNOBSERVED");
    assert.equal(unknown.result, null);
    for (const [mode, code] of [["auth", "AGY-AUTH-REQUIRED"], ["quota", "AGY-NONZERO-EXIT"], ["timeout", "AGY-TIMEOUT"], ["malformed", "AGY-OUTPUT-MALFORMED"], ["mismatch", "AGY-MODEL-MISMATCH"]]) {
      const failure = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: `results/${mode}.json`, session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, env: { ...process.env, AGY_MODE: mode }, packet: packet({ candidate, dispatchId: `agy-${mode}` }), timeoutMs: mode === "timeout" ? 50 : 1_000, nowEpochMs: 2 });
      assert.equal(failure.status, "unavailable");
      assert.equal(failure.code, code);
      assert.equal(failure.result, null);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
