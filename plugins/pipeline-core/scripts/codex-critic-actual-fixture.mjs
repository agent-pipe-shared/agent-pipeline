// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { arch, release, type } from 'node:os';
import { NATIVE_CRITIC_PROHIBITED_FEATURES, NATIVE_CRITIC_REDUCING_CONFIG, nativeCriticReducingCliArgs,
  nativeCriticToolSurfaceConfigDigest, nativeCriticToolSurfaceObservationDigest, reduceDiscoveredNativeMcpServers } from '../lib/codex-native-critic-tools.mjs';
import { buildNativeCriticSelection, nativeCriticArtifactRequestDigest, nativeCriticCanonicalDigest } from '../lib/codex-native-critic-policy.mjs';
import { repositoryFingerprint } from '../lib/codex-onboarding-runtime.mjs';
import { runCriticExportConsent } from './critic-export-consent.mjs';
import { invokeCodexNativeCriticHost, runPreflightedFixedChild } from './codex-native-critic-host.mjs';
import { spawnSync, execFileSync } from 'node:child_process';
import { canonical, createPoApprovalIntent } from '../lib/po-approval-proof.mjs';
import { createModelFamilyInvocationEntry } from '../lib/model-family-invocation.mjs';
import { createModelFamilyRuntimeHost } from '../lib/model-family-runtime-host.mjs';
import { prepareSessionAuthorityRegistryFixture } from '../lib/test-item-approved-course-fixture.mjs';
import { registeredModelFamilyTaskRoutes } from '../lib/model-family-route-source.mjs';
import { createModelFamilyDiscoveryHost, RULE_FIELDS, pass, fail, digest as discoveryDigest } from '../lib/model-family-discovery.mjs';
import { createCodexFamilyAdapter } from '../lib/model-family-codex-adapter.mjs';
import { readHeldModelFamilyInvocation } from '../lib/model-family-host-store.mjs';
import { canonicalJson, DEFAULT_PIPELINE_ROOT, parseObserverArgs, readJsonBounded, sha256 } from './codex-critic-host.mjs';

const RULESET_PATHS = [
  "roles/critic.md",
  "templates/prompts/critic-review.md",
  "plugins/pipeline-core/config/routing-authority.json",
  "plugins/pipeline-core/config/runner-mappings.json",
  "plugins/pipeline-core/config/runner-profiles-v3.json",
  "plugins/pipeline-core/lib/routing-projection.mjs",
  "plugins/pipeline-core/lib/critic-route-v3.mjs",
  "plugins/pipeline-core/lib/runner-profiles-v3.mjs",
  "plugins/pipeline-core/lib/human-role-labels.mjs",
  "plugins/pipeline-core/lib/review-economy.mjs",
  "plugins/pipeline-core/lib/schema-lite.mjs",
  "plugins/pipeline-core/lib/yaml-lite.mjs",
  "plugins/pipeline-core/lib/manifest.mjs",
  "plugins/pipeline-core/lib/critic-packet-governance.mjs",
  "plugins/pipeline-core/scripts/codex-critic-dispatch.schema.json",
  "plugins/pipeline-core/scripts/pipeline-user-v3.schema.json",
  "plugins/pipeline-core/scripts/codex-critic-host-return.schema.json",
  "plugins/pipeline-core/scripts/codex-critic-host.mjs",
  "plugins/pipeline-core/scripts/codex-critic-receipt.schema.json",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json",
];
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function writeJson(path, value) {
  writeFileSync(path, canonicalJson(value), { mode: 0o600 });
}

function createCandidate(root) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "policies"), { recursive: true });
  writeJson(join(root, ".claude", "pipeline.json"), { project: "fixture", verify: "node verify.mjs" });
  writeFileSync(join(root, "pipeline.user.yaml"), readFileSync(join(DEFAULT_PIPELINE_ROOT, "pipeline.user.yaml")));
  writeFileSync(join(root, "verify.mjs"), "process.exit(0);\n");
  writeFileSync(join(root, ".gitignore"), "evidence/\n");
  writeFileSync(join(root, "specs", "review.md"), "# Review spec\n");
  writeFileSync(join(root, "policies", "guard.md"), "# Guard\n");
  for (const path of RULESET_PATHS) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(DEFAULT_PIPELINE_ROOT, path)));
  }
  run("git", ["init", "-q"], root);
  // Pin EOL handling for this fixture repo regardless of the host's system-level
  // core.autocrlf (Git for Windows commonly defaults it to true): otherwise a
  // native-Windows checkout of these text files diverges from their committed
  // bytes and later `git status`/`git clone` calls observe a false "dirty" state.
  run("git", ["config", "core.autocrlf", "false"], root);
  run("git", ["config", "user.name", "Fixture"], root);
  run("git", ["config", "user.email", "fixture@example.invalid"], root);
  run("git", ["add", ".gitignore", ".claude/pipeline.json", "pipeline.user.yaml", "verify.mjs", "specs/review.md", "policies/guard.md", ...RULESET_PATHS], root);
  run("git", ["commit", "-qm", "base"], root);
  const base = run("git", ["rev-parse", "HEAD"], root);
  writeFileSync(join(root, "specs", "review.md"), "# Review spec\n\nCandidate.\n");
  run("git", ["add", "specs/review.md"], root);
  run("git", ["commit", "-qm", "candidate-one"], root);
  const firstCandidate = run("git", ["rev-parse", "HEAD"], root);
  writeFileSync(join(root, "policies", "guard.md"), "# Guard\n\nCandidate.\n");
  run("git", ["add", "policies/guard.md"], root);
  run("git", ["commit", "-qm", "candidate-two"], root);
  const commit = run("git", ["rev-parse", "HEAD"], root);
  return {
    base,
    commits: [firstCandidate, commit],
    commit,
    tree: run("git", ["rev-parse", "HEAD^{tree}"], root),
  };
}

function createObserver(root) {
  mkdirSync(root);
  mkdirSync(join(root, "ignored"));
  writeFileSync(join(root, ".gitignore"), "ignored/\n");
  writeFileSync(join(root, "tracked.txt"), "tracked\n");
  writeFileSync(join(root, "ignored", "state.txt"), "initial\n");
  run("git", ["init", "-q"], root);
  run("git", ["config", "core.autocrlf", "false"], root);
  run("git", ["config", "user.name", "Fixture"], root);
  run("git", ["config", "user.email", "fixture@example.invalid"], root);
  run("git", ["add", ".gitignore", "tracked.txt"], root);
  run("git", ["commit", "-qm", "observer"], root);
  return root;
}

function requestFor(candidate, ruleset) {
  return {
    schema: "pipeline.codex-critic-request.v2",
    task_id: "normal-critic-fixture",
    project: "fixture",
    ruleset_sha: ruleset,
    calibration_path: ".claude/pipeline.json",
    spec_path: "specs/review.md",
    review_base: candidate.base,
    candidate_commit: candidate.commit,
    candidate_tree: candidate.tree,
    guardrail_paths: ["policies/guard.md"],
    evidence_paths: ["evidence/verify-latest.json"],
    rigor: "2",
    risk: "high",
    trigger_row: "T1",
    task_authority: {
      manifest: { operations: ["read"], paths: [".claude/**", "docs/**", "evidence/**", "governance/**", "plugins/**", "policies/**", "roles/**", "specs/**", "templates/**"] },
      request: { operations: ["read"], paths: [".claude/pipeline.json", "specs/review.md", "policies/guard.md", "evidence/verify-latest.json"] },
    },
    review_economy: {
      round: 1,
      correction_commits: 0,
      requested_mode: "full",
      changed_paths: [],
      changed_behavior_claims: [],
      prior_receipt: null,
      path_invariant_map: {},
      path_invariant_map_sha256: null,
      coordinator_impact_confirmed: false,
      trust_boundary_changed: false,
      impact_ambiguous: false,
    },
  };
}
function successfulReturn(prepared, preparedSha256, overrides = {}) {
  const verdict = {
    findings: [],
    deliberately_not_flagged: ["deterministic gates"],
    trajectory_verdict: "consistent",
    trajectory_evidence: "evidence/verify-latest.json matches the reviewed commit",
    briefing_violations: [],
    pass: true,
  };
  const criticResult = {
    schema: "pipeline.codex-critic-host-result.v1",
    dispatch_id: prepared.dispatchId,
    prepared_sha256: preparedSha256,
    nonce: prepared.nonce,
    candidate_commit: prepared.review.commit,
    candidate_tree: prepared.review.tree,
    review_mode: prepared.reviewPlan.mode,
    affected_invariant_ids: prepared.reviewPlan.affectedInvariantIds,
    context_disclosure: ["project-instructions", "git-status"],
    achieved_assurance: prepared.assurance,
    verdict,
    ...overrides.critic_result,
  };
  const eventTexts = [
    ["review-started", `prepared:${preparedSha256}`],
    ["evidence-inspected", `reference-set:${prepared.bindings.referenceSetSha256}`],
    ["review-completed", `result:${sha256(canonicalJson(criticResult))}`],
  ];
  const baseProgress = { boundTreeChanges: 0, verifiedOutputBytes: 0, traceBytes: 0, completedTestSteps: 0, deliveredResultBytes: 0 };
  const inspectedProgress = {
    ...baseProgress,
    boundTreeChanges: prepared.review.commits.length,
    verifiedOutputBytes: prepared.verify.stdoutBytes + prepared.verify.stderrBytes,
    completedTestSteps: prepared.verify.completedTestSteps,
  };
  const progress = [
    baseProgress,
    inspectedProgress,
    { ...inspectedProgress, deliveredResultBytes: Buffer.byteLength(canonicalJson(criticResult), "utf8") },
  ];
  return {
    schema: "pipeline.codex-native-host-return.v1",
    host_execution: {
      agent_id: "native-agent-fixture",
      task_name: prepared.expectedTaskName,
      dispatch_id: prepared.dispatchId,
      requested_alias: prepared.route.alias,
      requested_effort: prepared.route.effort,
      resolved_model: prepared.route.model,
      resolved_effort: prepared.route.effort,
      route_source: "v3-candidate-duty+coordinator",
      may_delegate: false,
      terminal_status: "completed",
      completed_elapsed_ms: 2_000,
      recovery_count: 0,
      evidence_events: eventTexts.map(([kind, evidence_text], index) => ({
        sequence: index + 1,
        kind,
        elapsed_ms: 500 + index * 500,
        evidence_text,
        evidence_sha256: sha256(evidence_text),
        progress: progress[index],
      })),
      ...overrides.host_execution,
    },
    critic_result: criticResult,
  };
}
async function signedPreparedCriticFixture(dutyId, root, childRoot) {
  const sha = value => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
  const runner = "codex", taskRoute = `duty.${dutyId}`;
  const routeSource = registeredModelFamilyTaskRoutes();
  const route = routeSource.taskRoutes.find(value => value.runner === runner && value.taskRoute === taskRoute);
  // AC-212: modelAuthorityOwner() caches one owner per repository for the whole process and that owner's live map keeps every op it
  // reserved, so a fixture that reused the shared candidate repository inherited the previous fixture's ops (their lifetime files
  // removed by cleanup -> activate() failed with domain-source-input) while a leftover lifetime blocks the registry initialization.
  // Each fixture therefore works in its own copy of the candidate repository (same HEAD, so the commit and tree match request.json).
  const sourceRoot = root;
  root = mkdtempSync(join(childRoot, "codex-critic-host-family-fixture-"));
  cpSync(sourceRoot, root, { recursive: true, verbatimSymlinks: true });
  rmSync(join(root, ".git", "agent-pipeline"), { recursive: true, force: true });
  const commonDir = join(root, ".git");
  mkdirSync(join(commonDir, "agent-pipeline"), { recursive: true, mode: 0o700 });
  // AC-212: the host's lifetimes reserve their members in the session-authority registry, so the checkout carries an initialized one.
  // The shared candidate repository must keep a clean `git status` (prepareNativeCritic refuses an unclean candidate), so the
  // helper's two untracked authority inputs are excluded locally instead of committed (the candidate commit and tree stay unchanged).
  prepareSessionAuthorityRegistryFixture({ root, excludeFromStatus: true });
  const candidateCommit = run("git", ["rev-parse", "HEAD"], root);
  const candidateTree = run("git", ["rev-parse", "HEAD^{tree}"], root);
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
  let launches = 0, observed, admissionError, hostReturn, nativeDriver, childEffect;
  const childPath = join(childRoot, "prepared-child.mjs");
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
    launchDriver: async ({ nativeRequest }) => {
      launches++;
      if (nativeDriver) { observed = await nativeDriver(nativeRequest); return {ok:true,value:observed}; }
      const value = nativeRequest.request;
      const selected = value.sandboxTransport;
      const result = hostReturn ? { identity: { provider: "openai", modelId: value.model, effort: value.effort }, hostReturn } : { status: "reviewed", verdict: { verdict: "PASS", findings: [] },
        identity: { provider: "openai", modelId: value.model, effort: value.effort },
        rulesetBindings: Object.fromEntries(["roleContractSha256", "promptContractSha256", "verdictSchemaSha256", "childExecutableSha256", "childModuleGraphSha256"].map(name => [name, sha(name)])),
        rulesetProvenance: { kind: "git", identity: candidateCommit },
        sandboxExecution: { schema: "pipeline.codex-sandbox-host-execution.v1", selectionId: selected.selectionId, selectionSha256: selected.selectionSha256, repoFingerprint: selected.repoFingerprint, duty: "critic", dispatch: selected.dispatch,
          observed: { cliSha256: selected.toolchain.cliSha256, profileSha256: selected.profile.sha256, networkEnabled: true, scratchRootSha256: selected.profile.scratchRootSha256 },
          terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" } } };
      const bytes = execFileSync(process.execPath, [childPath], { input: JSON.stringify(result), encoding: "utf8", timeout: 3000 });
      observed = JSON.parse(bytes);
      childEffect?.();
      return { ok: true, value: observed };
    }
  } });
  let activation;
  try { activation = runtimeHost.store().activate(); }
  catch (error) { throw new Error(`${dutyId}: activation threw ${error.code}/${error.reason}`, { cause: error }); }
  assert.equal(activation.ok, true, `${dutyId}: ${activation.code}`);
  const entry = createModelFamilyInvocationEntry({ runtimeHost, routeSource });
  const identityHost = createModelFamilyDiscoveryHost({ clock: () => "2026-10-01T12:00:30.000Z", execution: ({ rawHostResult }) =>
    observed && discoveryDigest(rawHostResult) === discoveryDigest(observed) ? pass("ACTUAL_SYNTHETIC_CHILD_IDENTITY", {
      actualModelIds: [observed.identity?.modelId ?? observed.result.observed.model], actualEffort: observed.identity?.effort ?? observed.result.observed.effort, rawHostResultSha256: discoveryDigest(rawHostResult), hostObservationSha256: sha("child-stdout")
    }) : fail("NO_CHILD_OBSERVATION") });
  const context = identityHost.createContext({ runner, bindings, observedAt: "2026-10-01T12:00:30.000Z", expiresAt: "2026-10-01T12:01:00.000Z" }).value;
  const ports = { adapters: { codex: createCodexFamilyAdapter(identityHost) }, contextForInvocation: () => pass("SOURCE_CONTEXT", context),
    readOriginalInvocation: ({ invocationId }) => { const r = readHeldModelFamilyInvocation({ rootDir: join(commonDir, "agent-pipeline"), key: keyFor(invocationId) }); return r.ok ? pass("ORIGINAL_S4", { invocation: r.value, bindings, provenanceSha256: discoveryDigest(r.value) }) : r; },
    readLaunchEvidence: ({ invocation: i }) => pass("NODE_CHILD_EVIDENCE", { invocationReceiptSha256: i.receiptSha256, runner,
      supported: { status: "supported", efforts: [i.effort], evidenceSha256: probe.contractSha256 },
      requested: { modelId: i.selectedModelId, effort: i.effort, evidenceSha256: sha("request") },
      configured: { modelId: i.selectedModelId, effort: i.effort, evidenceSha256: sha("configured"), assurance: "host-configured" },
      execution: { status: "succeeded", evidenceSha256: sha("exit-zero") } }) };
  return { root, candidateCommit, candidateTree, entry, ports, route, setChildEffect: value => { childEffect = value; }, setDriver: value => { nativeDriver = value; }, setReturn: value => { hostReturn = structuredClone(value); }, admissionError: () => admissionError, launches: () => launches, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
export { run, writeJson, createCandidate, createObserver, requestFor, successfulReturn, signedPreparedCriticFixture, parseObserverArgs, readJsonBounded, sha256, canonicalJson };

// Reuse the existing app-server examiner verbatim without executing its 137-case
// module. This bounded route starts only its synthetic executable.
export function prepareV4Consent(review) {
  const exportContext={provider:'OpenAI',service:'synthetic-native-family-fixture',hostGate:'additional-check-required',providerGate:'not-observed',observedEndpoint:null};
  const grantPath='evidence/family-export.json';
  writeJson(join(review,grantPath),{scope:{recipient:{provider:exportContext.provider,runner:'codex',service:exportContext.service},purpose:'critic',sourceRoots:['specs'],evidenceRoots:['evidence']}});
  const grantArgs=['--root',review,'--request',grantPath], plan=runCriticExportConsent(['plan',...grantArgs]);
  assert.equal(runCriticExportConsent(['record',...grantArgs,'--plan-sha256',plan.planSha256,'--decision-reference','test-fixture:family-native','--decision-sha256','e'.repeat(64)]).ok,true);
  rmSync(join(review,grantPath));
}
export async function exerciseV4Consumer({ f, host, context, output, root, repo, candidate, route, prepared }) {
  const exportContext={provider:'OpenAI',service:'synthetic-native-family-fixture',hostGate:'additional-check-required',providerGate:'not-observed',observedEndpoint:null};
  const review=prepared.review.root;
  const source=readFileSync(new URL('./codex-critic-host.test.mjs',import.meta.url),'utf8');
  const start=source.indexOf('function writeFakeCriticAppServer('), end=source.indexOf('\nfunction runActualCriticChild(',start);
  assert.ok(start>=0&&end>start);
  const writeFake = new Function('SELECTED_CRITIC_ROUTE','NATIVE_CRITIC_PROHIBITED_FEATURES','NATIVE_CRITIC_REDUCING_CONFIG','nativeCriticReducingCliArgs','join','assert','writeFileSync', source.slice(start,end)+'\nreturn writeFakeCriticAppServer;')
    (route,NATIVE_CRITIC_PROHIBITED_FEATURES,NATIVE_CRITIC_REDUCING_CONFIG,nativeCriticReducingCliArgs,join,assert,writeFileSync);
  const reviewScope={kind:'current-artifacts',paths:['specs/review.md']};
  const referenceRecords=[{path:'evidence/verify-latest.json',sha256:sha256(readFileSync(join(review,'evidence/verify-latest.json'))),candidate:{commit:candidate.commit,tree:candidate.tree}},
    {path:'specs/review.md',blobOid:run('git',['rev-parse',`${candidate.commit}:specs/review.md`],review),sha256:sha256(readFileSync(join(review,'specs/review.md'))),mode:'100644'}];
  const referencePaths=referenceRecords.map(r=>r.path), backendDir=join(root,'synthetic-backend');mkdirSync(backendDir);
  const verdict=successfulReturn(prepared,output.preparedSha256).critic_result.verdict;
  const fake=writeFake(backendDir,[{type:'agentMessage',phase:'final_answer',text:JSON.stringify(verdict)}],{requireNativeWire:true,model:route.model,effort:route.effort,threadReasoningEffort:route.effort});
  const reduction=reduceDiscoveredNativeMcpServers([{data:[],nextCursor:null}]);
  const features={pageCount:1,dataCount:NATIVE_CRITIC_PROHIBITED_FEATURES.length,digest:nativeCriticCanonicalDigest(Object.fromEntries(NATIVE_CRITIC_PROHIBITED_FEATURES.map(n=>[n,false])))},mcp={pageCount:1,dataCount:0,digest:nativeCriticCanonicalDigest({pageCount:1,dataCount:0,allDisabled:true,allEmpty:true,catalogFree:true})};
  const tuple={cli:{version:'0.153.4',sha256:sha256(readFileSync(fake))},protocolSchemaSha256:'2'.repeat(64),host:{platformClass:'linux-wsl2',kernel:{sysname:type(),release:release(),machine:arch()},filesystemClass:'wsl2-native',bootIdSha256:sha256('boot')},policy:{threadSandbox:'read-only',turn:{type:'readOnly',networkAccess:false}},toolSurface:{configSha256:nativeCriticToolSurfaceConfigDigest(reduction),observationSha256:nativeCriticToolSurfaceObservationDigest(features,mcp)}};
  const nowMs=Date.parse('2026-10-01T12:00:30.000Z'),smokeReceipt={schema:'pipeline.codex-native-critic-smoke.v1',status:'passed',tuple,observed:{initialized:true,readObserved:true,writeObserved:true,nativeWriteDenied:true,canaryUnchanged:true,hostWriteControl:true,sourceUnchanged:true,protocolError:false,guardDenial:false,sandboxLaunchDenied:false,timedOut:false,cleanupComplete:true,terminal:{exitCode:0,signal:null,spawnFailed:false}},capturedAt:'2026-10-01T12:00:00.000Z'};
  const referenceSetSha256=nativeCriticCanonicalDigest(referenceRecords);
  const selection=buildNativeCriticSelection({selectionId:'cncs_'+'d'.repeat(26),repoFingerprint:repositoryFingerprint(review),dispatch:{queueRevision:1,candidateCommit:candidate.commit,candidateTree:candidate.tree,referenceSetSha256,requestSha256:nativeCriticArtifactRequestDigest({candidateCommit:candidate.commit,candidateTree:candidate.tree,referenceSetSha256,reviewMode:'full',reviewScope})},route,poDecisionSha256:'4'.repeat(64),smokeReceipt,smokeReceiptSha256:nativeCriticCanonicalDigest(smokeReceipt),createdAt:'2026-10-01T12:00:20.000Z'},{validateRoute:()=>route,expectedTuple:tuple,nowMs,maxSmokeAgeMs:300000});
  const input={exportContext,selection,expectedTuple:tuple,repository:{root:review,cliPath:fake},coordinatorScratch:{path:backendDir},referencePaths,referenceRecords,reviewScope,reviewMode:'full'};
  f.setDriver(nativeRequest=>runPreflightedFixedChild({root:review,packet:nativeRequest.packet,evidenceRecords:referenceRecords.filter(r=>r.blobOid===undefined),request:nativeRequest.request}));
  let custodyError;
  const deps={familyContext:context,preparedSha256:output.preparedSha256,onCustodyError:error=>{custodyError=error;},nowMs,resolveRoute:()=>{throw new Error('must not reselect prepared family');},readFileSync:path=>path==='/proc/version'?'Linux Microsoft':path==='/proc/self/mountinfo'?`1 0 0:1 / ${review} rw - ext4 /dev/root rw\n`:'boot'};
  const reviewed=await invokeCodexNativeCriticHost(input,deps);
  if(custodyError)throw custodyError;
  assert.equal(reviewed.status,'reviewed',JSON.stringify(reviewed));
  assert.equal(f.launches(),1);
  return host.readNativeCriticCapturedReturn(context);
}

export function spawnPublicPrepare({ repo, rulesetRoot, root, observers, requestPath }) {
  const args = [join(DEFAULT_PIPELINE_ROOT, 'plugins/pipeline-core/scripts/codex-critic-host.mjs'), 'prepare',
    '--repo', repo, '--pipeline-root', rulesetRoot, '--control-dir', root, '--request', requestPath,
    '--prepared', join(root, 'cli-prepared.json'), '--dispatch-state', join(root, 'cli-state.json'), '--review-dir', join(root, 'cli-review'),
    ...observers.flatMap(({name, root}) => ['--observer', name + '=' + root])];
  const child = spawnSync(process.execPath, args, { encoding: 'utf8', shell: false });
  return { status: child.status, signal: child.signal, stdout: child.stdout, stderr: child.stderr };
}
