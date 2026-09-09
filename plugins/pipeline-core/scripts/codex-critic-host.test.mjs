// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";

import { invokeCodexCriticAppServer } from "./codex-critic-app-server.mjs";
import { nativeCriticEvidenceCandidate, nativeCriticHeartbeatSnapshot, nativeCriticReportedChildFailure } from "./codex-native-critic-host.mjs";
import { runSelectedCriticHost, selectedCriticInProcessBridge } from "./codex-critic-selected-host.mjs";
import { buildSandboxRequest, sandboxSelectionDigest } from "./codex-sandbox-select.mjs";
import { runSandboxedReadonlyHostBridge } from "./sandboxed-readonly-host-bridge.mjs";
import { resolveCriticHighRiskRoute } from "../lib/critic-route-v3.mjs";
import {
  NATIVE_CRITIC_PROHIBITED_FEATURES,
  NATIVE_CRITIC_REDUCING_CONFIG,
  nativeCriticReducingCliArgs,
} from "../lib/codex-native-critic-tools.mjs";

import {
  ASSURANCE,
  DEFAULT_PIPELINE_ROOT,
  T1_ASSURANCE,
  assertNoDuplicateJsonKeys,
  admitCriticReview,
  canonicalJson,
  captureRepositoryFingerprint,
  finalizeNativeCritic,
  normalizeRepoRelativePath,
  parseCliArgs,
  parseObserverArgs,
  prepareNativeCritic as prepareNativeCriticRaw,
  readJsonBounded,
  sha256,
  validateCriticRequest,
  validateHostReturn,
} from "./codex-critic-host.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";

let passed = 0;

check("native Critic evidence accepts a direct clean candidate and an exact clean Verify window only", () => {
  const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
  assert.deepEqual(nativeCriticEvidenceCandidate({ candidate: { status: "clean", ...candidate } }), candidate);
  assert.deepEqual(nativeCriticEvidenceCandidate({ candidate: { binding: "exact", start: { status: "clean", ...candidate }, finish: { status: "clean", ...candidate } } }), candidate);
  assert.equal(nativeCriticEvidenceCandidate({ candidate: { binding: "exact", start: { status: "clean", ...candidate }, finish: { status: "dirty", ...candidate } } }), null);
  assert.equal(nativeCriticEvidenceCandidate({ candidate: { binding: "exact", start: { status: "clean", ...candidate }, finish: { status: "clean", commit: "c".repeat(40), tree: candidate.tree } } }), null);
});

check("native Critic heartbeats advance only the bounded lifecycle and reject unknown stages", () => {
  const blank = { initialized: false, threadStarted: false, turnStarted: false, turnCompleted: false };
  const initialized = nativeCriticHeartbeatSnapshot(blank, { schema: "pipeline.codex-native-critic-heartbeat.v1", stage: "initialized" });
  const started = nativeCriticHeartbeatSnapshot(initialized, { schema: "pipeline.codex-native-critic-heartbeat.v1", stage: "turn-started" });
  const waiting = nativeCriticHeartbeatSnapshot(started, { schema: "pipeline.codex-native-critic-heartbeat.v1", stage: "turn-awaiting-response" });
  assert.deepEqual(waiting, started);
  assert.notStrictEqual(waiting, started);
  const completed = nativeCriticHeartbeatSnapshot(waiting, { schema: "pipeline.codex-native-critic-heartbeat.v1", stage: "turn-completed" });
  assert.deepEqual(completed, { initialized: true, threadStarted: false, turnStarted: true, turnCompleted: true });
  assert.strictEqual(nativeCriticHeartbeatSnapshot(completed, { schema: "pipeline.codex-native-critic-heartbeat.v1", stage: "unbounded" }), completed);
});

check("native Critic preserves a structured child failure despite its nonzero terminal exit", () => {
  assert.equal(nativeCriticReportedChildFailure({ schema: "pipeline.codex-native-critic-app-server-child.v1", ok: false, code: "write-attempt" }), "child-write-attempt");
  assert.equal(nativeCriticReportedChildFailure({ schema: "pipeline.codex-native-critic-app-server-child.v1", ok: false, code: "protocol-error" }), "child-protocol-error");
  assert.equal(nativeCriticReportedChildFailure({ schema: "pipeline.codex-native-critic-app-server-child.v1", ok: true, code: "answered" }), null);
  assert.equal(nativeCriticReportedChildFailure({ schema: "untrusted", ok: false, code: "write-attempt" }), null);
});

function prepareNativeCritic(options, dependencies = {}) {
  return prepareNativeCriticRaw(options, {
    requireProjectOnboardingReadyFn: () => ({
      schema: "pipeline.project-onboarding-ready-gate.v1",
      status: "ready",
      intent: "dispatch",
    }),
    ...dependencies,
  });
}

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
let symlinkCapable = true;
{
  const probeDir = mkdtempSync(join(tmpdir(), "codex-critic-host-symlink-probe-"));
  try { writeFileSync(join(probeDir, "target"), "x"); symlinkSync(join(probeDir, "target"), join(probeDir, "link")); }
  catch { symlinkCapable = false; }
  finally { rmSync(probeDir, { recursive: true, force: true }); }
  if (!symlinkCapable) process.stdout.write("[capability: symlink unavailable] skipping symlink-specific checks\n");
}
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

async function checkAsync(name, fn) {
  await fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function writeJson(path, value) {
  writeFileSync(path, canonicalJson(value), { mode: 0o600 });
}

function legacyDispatchAuthorization(candidateCommit, overrides = {}) {
  return {
    kind: "named-po-waiver",
    authority: "PO",
    risk_id: "phase1-codex-critic-isolation",
    scope: "codex-critic-normal-lane",
    evidence_sha256: "a".repeat(64),
    candidate_commit: candidateCommit,
    ...overrides,
  };
}

function legacyReceiptAuthorization(candidateCommit, overrides = {}) {
  return {
    kind: "named-po-waiver",
    authority: "PO",
    riskId: "phase1-codex-critic-isolation",
    scope: "codex-critic-normal-lane",
    evidenceSha256: "a".repeat(64),
    candidateCommit,
    ...overrides,
  };
}

function writeAcceptedPriorReceipt(controlRoot, receiptId, candidateCommit, { normalLaneAuthorization } = {}) {
  const directory = join(controlRoot, "accepted-critic-receipts");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${receiptId}.json`);
  const receipt = {
    schema: "pipeline.codex-critic-host-receipt.v1",
    taskId: "prior-review",
    dispatchId: receiptId,
    candidate: { base: "b".repeat(40), commit: candidateCommit, tree: "c".repeat(40) },
    route: { duty: "criticNormal", runner: "codex", alias: "fable", requestedModel: "gpt-5.6-sol", requestedEffort: "xhigh", mayDelegate: false, coordinatorConfirmed: true, providerAttested: false },
    review: { mode: "full", admissionCode: "RE-FIRST-FULL", affectedInvariantIds: [] },
    liveness: {
      agentIdHash: "a".repeat(64), taskName: "critic_prior_review", completedElapsedMs: 1, recoveryCount: 0,
      evidenceEvents: [{ kind: "review-completed", elapsedMs: 1, evidenceSha256: "b".repeat(64), progress: { boundTreeChanges: 0, verifiedOutputBytes: 0, traceBytes: 0, completedTestSteps: 0, deliveredResultBytes: 0 } }],
    },
    bindings: {
      preparedSha256: "a".repeat(64), requestSha256: "b".repeat(64), referenceSetSha256: "c".repeat(64), resultSha256: "d".repeat(64),
      reviewFingerprintBefore: "e".repeat(64), reviewFingerprintAfter: "f".repeat(64), roleContractSha256: "a".repeat(64), promptContractSha256: "b".repeat(64),
      verdictSchemaSha256: "c".repeat(64), hostReturnSchemaSha256: "d".repeat(64), executionSetSha256: "e".repeat(64), routingProvenance: "f".repeat(64),
    },
    state: { before: {}, after: {}, mutationObserved: false },
    assurance: T1_ASSURANCE,
    residualRisks: ["fixture"],
    verdict: { findings: [], deliberatelyNotFlaggedSha256: "a".repeat(64), trajectoryVerdict: "consistent", trajectoryEvidenceSha256: "b".repeat(64), briefingViolationCount: 0, briefingViolationsSha256: "c".repeat(64), pass: true },
    reviewPass: true,
  };
  if (normalLaneAuthorization) receipt.normalLaneAuthorization = normalLaneAuthorization;
  writeJson(path, receipt);
  return readJsonBounded(path).sha256;
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

function rebindCompletion(value) {
  const event = value.host_execution.evidence_events.at(-1);
  event.evidence_text = `result:${sha256(canonicalJson(value.critic_result))}`;
  event.evidence_sha256 = sha256(event.evidence_text);
  event.progress.deliveredResultBytes = Buffer.byteLength(canonicalJson(value.critic_result), "utf8");
}

check("duplicate JSON keys fail before JSON.parse", () => {
  assert.throws(() => assertNoDuplicateJsonKeys('{"a":1,"a":2}'), /duplicate JSON key/);
});
check("nested duplicate JSON keys fail", () => {
  assert.throws(() => assertNoDuplicateJsonKeys('{"a":{"b":1,"b":2}}'), /duplicate JSON key/);
});
check("valid nested JSON passes duplicate scan", () => {
  assert.doesNotThrow(() => assertNoDuplicateJsonKeys('{"a":[1,{"b":true}],"c":null}'));
});
for (const [name, path] of [
  ["absolute path", "/tmp/spec.md"],
  ["parent traversal", "specs/../secret.md"],
  ["backslash", "specs\\secret.md"],
  ["AGENTS exclusion", "AGENTS.md"],
  ["state exclusion", "docs/state.md"],
]) {
  check(`${name} is rejected`, () => assert.throws(() => normalizeRepoRelativePath(path), /path|AGENTS|state/));
}
check("normalized public path passes", () => assert.equal(normalizeRepoRelativePath("specs/review.md"), "specs/review.md"));
check("unknown CLI command fails closed", () => assert.throws(() => parseCliArgs(["run"]), /prepare, finalize or selected/));
check("missing CLI argument fails closed", () => assert.throws(() => parseCliArgs(["prepare", "--repo", "/tmp"]), /missing required/));
check("selected Critic transport requires one closed input packet", () => {
  assert.deepEqual(parseCliArgs(["selected", "--input", "/tmp/selected.json"]), { command: "selected", observers: [], cleanup: false, input: "/tmp/selected.json" });
  assert.throws(() => parseCliArgs(["selected"]), /missing required/);
});
check("observer must be named and absolute", () => assert.throws(() => parseObserverArgs(["fixture=relative"]), /absolute/));

const root = mkdtempSync(join(tmpdir(), "codex-critic-host-test-"));
chmodSync(root, 0o700);
// On native Windows chmod cannot establish the owner-only DACL the control-dir
// contract requires; harden it the way a real caller's control-dir would be.
if (process.platform === "win32") hardenWindowsPrivateDirectory(root);
const repo = join(root, "candidate");
mkdirSync(repo);
const candidate = createCandidate(repo);
const privateObserver = createObserver(join(root, "private-observer"));
const sharedObserver = createObserver(join(root, "shared-observer"));
const rulesetRoot = join(root, "ruleset");
// -c must be passed to `clone` itself (not set afterward): the checkout that
// establishes the clone's working tree happens during this call, and Git for
// Windows commonly defaults core.autocrlf to true at the system config level.
run("git", ["-c", "core.autocrlf=false", "clone", "-q", repo, rulesetRoot], root);
run("git", ["config", "core.autocrlf", "false"], rulesetRoot);
const ruleset = run("git", ["rev-parse", "HEAD"], rulesetRoot);
const request = requestFor(candidate, ruleset);
const legacyRequest = {
  ...structuredClone(request),
  normal_lane_authorization: legacyDispatchAuthorization(candidate.commit),
};

check("request rejects unknown fields", () => {
  assert.throws(() => validateCriticRequest({ ...structuredClone(request), summary: "framing" }), /schema invalid/);
});
check("request rejects short commits", () => {
  assert.throws(() => validateCriticRequest({ ...structuredClone(request), candidate_commit: "abc1234" }), /full lowercase/);
});
check("request rejects duplicate references", () => {
  const copy = structuredClone(request);
  copy.guardrail_paths.push(copy.guardrail_paths[0]);
  assert.throws(() => validateCriticRequest(copy), /duplicates/);
});
check("request rejects the coordinator-reserved diff reference", () => {
  const copy = structuredClone(request);
  copy.evidence_paths = ["evidence/codex-critic-commit-set.json"];
  assert.throws(() => validateCriticRequest(copy), /coordinator-reserved diff reference/);
});
check("T1 request accepts standing authorization without a legacy waiver", () => {
  assert.doesNotThrow(() => validateCriticRequest(structuredClone(request)));
});
check("exact historical dispatch authorization stays readable but cannot select current T1 assurance", () => {
  assert.doesNotThrow(() => validateCriticRequest(structuredClone(legacyRequest)));
});
check("forged or structurally deviant legacy dispatch authorization fails closed", () => {
  const stale = structuredClone(legacyRequest);
  stale.normal_lane_authorization.candidate_commit = "b".repeat(40);
  assert.throws(() => validateCriticRequest(stale), /legacy normal lane authorization/);
  const malformed = structuredClone(legacyRequest);
  malformed.normal_lane_authorization.evidenceSha256 = malformed.normal_lane_authorization.evidence_sha256;
  delete malformed.normal_lane_authorization.evidence_sha256;
  assert.throws(() => validateCriticRequest(malformed), /schema invalid/);
  const invented = structuredClone(request);
  invented.standing_po_authorization = true;
  assert.throws(() => validateCriticRequest(invented), /schema invalid/);
});
check("request rejects a fifth Critic round before any checkout", () => {
  const copy = structuredClone(request);
  copy.review_economy.round = 5;
  assert.throws(() => validateCriticRequest(copy), /RE-CRITIC-ROUND-LIMIT/);
});
check("request rejects a missing review economy before any checkout", () => {
  const copy = structuredClone(request);
  delete copy.review_economy;
  assert.throws(() => validateCriticRequest(copy), /schema invalid/);
});
check("unprovable delta impact is downgraded to full rather than silently narrowed", () => {
  const copy = structuredClone(request);
  copy.review_economy.round = 2;
  copy.review_economy.correction_commits = 1;
  copy.review_economy.requested_mode = "delta";
  copy.review_economy.changed_paths = ["unknown/path.mjs"];
  copy.review_economy.changed_behavior_claims = ["behavior-unknown"];
  copy.review_economy.prior_receipt = { id: "prior-receipt-01", sha256: "a".repeat(64) };
  copy.review_economy.path_invariant_map = { "known/path.mjs": ["invariant-known"] };
  copy.review_economy.path_invariant_map_sha256 = sha256Canonical(copy.review_economy.path_invariant_map);
  copy.review_economy.coordinator_impact_confirmed = true;
  assert.equal(admitCriticReview(copy).mode, "full");
  assert.equal(admitCriticReview(copy).admissionCode, "RE-DELTA-FALLBACK-UNKNOWN-PATH");
});

const requestPath = join(root, "request.json");
const preparedPath = join(root, "prepared.json");
const dispatchStatePath = join(root, "dispatch-state.json");
const reviewRoot = join(root, "review");
writeJson(requestPath, legacyRequest);
const observers = parseObserverArgs([`private=${privateObserver}`, `shared=${sharedObserver}`]);
check("every controlling non-ready dispatch status and gate failure precedes Critic checkout, temporary state, and child execution", () => {
  let checkouts = 0;
  let randomValues = 0;
  const failures = [
    ...PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.map((status) => new ProjectOnboardingReadyError(
      "PORG-NOT-READY",
      `raw lifecycle detail for ${status} at /private/root`,
      { intent: "dispatch", lifecycleStatus: status },
    )),
    new ProjectOnboardingReadyError(
      "PORG-INVALID-OBSERVATION",
      "raw malformed observation at /private/root",
      { intent: "dispatch" },
    ),
    new ProjectOnboardingReadyError(
      "PORG-OBSERVATION-UNAVAILABLE",
      "raw observer exception at /private/root",
      { intent: "dispatch" },
    ),
  ];
  for (const [index, failure] of failures.entries()) {
    const negativePreparedPath = join(root, `ready-negative-${index}-prepared.json`);
    const negativeStatePath = join(root, `ready-negative-${index}-state.json`);
    const negativeReviewRoot = join(root, `ready-negative-${index}-review`);
    assert.throws(() => prepareNativeCriticRaw({
      repoRoot: repo,
      pipelineRoot: rulesetRoot,
      controlDir: root,
      dispatchStatePath: negativeStatePath,
      requestPath,
      preparedPath: negativePreparedPath,
      reviewRoot: negativeReviewRoot,
      observers,
    }, {
      requireProjectOnboardingReadyFn({ rootDir, intent, runner }) {
        assert.equal(rootDir, repo);
        assert.equal(intent, "dispatch");
        assert.equal(runner, "codex");
        throw failure;
      },
      createCheckout() { checkouts += 1; },
      randomBytes() { randomValues += 1; return Buffer.alloc(32); },
    }), (error) => error === failure);
    assert.equal(existsSync(negativePreparedPath), false);
    assert.equal(existsSync(negativeStatePath), false);
    assert.equal(existsSync(negativeReviewRoot), false);
  }
  assert.equal(checkouts, 0);
  assert.equal(randomValues, 0);
});
check("prepare requires canonical private and shared observers", () => {
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: root,
    dispatchStatePath: join(root, "bad-observer-state.json"),
    requestPath,
    preparedPath: join(root, "bad-observer-prepared.json"),
    reviewRoot: join(root, "bad-observer-review"),
    observers: parseObserverArgs([`private=${privateObserver}`]),
  }), /exactly the private and shared/);
});
check("private and shared observer roots must be distinct", () => {
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: root,
    dispatchStatePath: join(root, "aliased-observer-state.json"),
    requestPath,
    preparedPath: join(root, "aliased-observer-prepared.json"),
    reviewRoot: join(root, "aliased-observer-review"),
    observers: parseObserverArgs([`private=${privateObserver}`, `shared=${privateObserver}`]),
  }), /must be distinct/);
});
check("candidate and ruleset roots must be separate", () => {
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: repo,
    controlDir: root,
    dispatchStatePath: join(root, "aliased-ruleset-state.json"),
    requestPath,
    preparedPath: join(root, "aliased-ruleset-prepared.json"),
    reviewRoot: join(root, "aliased-ruleset-review"),
    observers,
  }), /must be separate/);
});
if (symlinkCapable) check("control outputs cannot cross a symlinked parent", () => {
  mkdirSync(join(root, "outside"));
  symlinkSync(join(root, "outside"), join(root, "link"));
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: root,
    dispatchStatePath: join(root, "link", "state.json"),
    requestPath,
    preparedPath: join(root, "link", "prepared.json"),
    reviewRoot: join(root, "link", "review"),
    observers,
  }), /symlink|escapes/);
});
check("dispatch state cannot be placed inside the review checkout", () => {
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: root,
    dispatchStatePath: join(root, "nested-review", "state.json"),
    requestPath,
    preparedPath: join(root, "nested-review-prepared.json"),
    reviewRoot: join(root, "nested-review"),
    observers,
  }), /outside review directory/);
});
const rulesetRolePath = join(rulesetRoot, "roles", "critic.md");
const rulesetRoleOriginal = readFileSync(rulesetRolePath);
writeFileSync(rulesetRolePath, Buffer.concat([rulesetRoleOriginal, Buffer.from("dirty\n")]));
check("dirty ruleset checkout is refused", () => {
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: root,
    dispatchStatePath: join(root, "dirty-ruleset-state.json"),
    requestPath,
    preparedPath: join(root, "dirty-ruleset-prepared.json"),
    reviewRoot: join(root, "dirty-ruleset-review"),
    observers,
  }), /ruleset repository is not clean/);
});
writeFileSync(rulesetRolePath, rulesetRoleOriginal);
run("git", ["update-index", "--assume-unchanged", "roles/critic.md"], rulesetRoot);
check("hidden index visibility flags are refused", () => {
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: root,
    dispatchStatePath: join(root, "hidden-index-state.json"),
    requestPath,
    preparedPath: join(root, "hidden-index-prepared.json"),
    reviewRoot: join(root, "hidden-index-review"),
    observers,
  }), /non-canonical index entry/);
});
run("git", ["update-index", "--no-assume-unchanged", "roles/critic.md"], rulesetRoot);
run("git", ["update-index", "--skip-worktree", "specs/review.md"], repo);
check("hidden candidate index visibility flags are refused", () => {
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: root,
    dispatchStatePath: join(root, "hidden-candidate-state.json"),
    requestPath,
    preparedPath: join(root, "hidden-candidate-prepared.json"),
    reviewRoot: join(root, "hidden-candidate-review"),
    observers,
  }), /candidate repository contains a skip-worktree/);
});
run("git", ["update-index", "--no-skip-worktree", "specs/review.md"], repo);

const fsmonitorProbe = join(root, "fsmonitor-probe.sh");
writeFileSync(fsmonitorProbe, `#!/bin/sh\nprintf 'triggered\\n' > '${join(privateObserver, "ignored", "fsmonitor.txt")}'\nexit 0\n`);
chmodSync(fsmonitorProbe, 0o700);
run("git", ["config", "core.fsmonitor", fsmonitorProbe], repo);
const criticGateCalls = [];
const preparedResult = prepareNativeCritic({
  repoRoot: repo,
  pipelineRoot: rulesetRoot,
  controlDir: root,
  dispatchStatePath,
  requestPath,
  preparedPath,
  reviewRoot,
  observers,
}, {
  requireProjectOnboardingReadyFn(options) {
    criticGateCalls.push(options);
    return {
      schema: "pipeline.project-onboarding-ready-gate.v1",
      status: "ready",
      intent: "dispatch",
    };
  },
  randomBytes: () => Buffer.alloc(32, 7),
  now: () => "2026-07-15T00:00:00.000Z",
  runVerify: (checkout) => {
    mkdirSync(join(checkout, "evidence"), { recursive: true });
    writeJson(join(checkout, "evidence", "verify-latest.json"), { schema: "fixture.verify.v1", exitCode: 0, commit: candidate.commit });
    return { command: "node verify.mjs", stdoutSha256: sha256("ok"), stderrSha256: sha256(""), stdoutBytes: 2, stderrBytes: 0, completedTestSteps: 1 };
  },
});
const preparedRecord = readJsonBounded(preparedPath);
const prepared = preparedRecord.value;

check("prepare emits the candidate-bound V3 normal Critic route", () => {
  assert.deepEqual(criticGateCalls, [{ rootDir: repo, intent: "dispatch", runner: "codex" }]);
  assert.equal(preparedResult.model, "gpt-5.6-terra");
  assert.equal(preparedResult.effort, "high");
  assert.equal(prepared.route.duty, "critic_normal");
  assert.equal(prepared.route.alias, prepared.route.model);
  assert.equal(prepared.route.candidateCommit, candidate.commit);
  assert.match(prepared.route.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(prepared.hostContract.forkTurns, "none");
  assert.equal(prepared.assurance, T1_ASSURANCE);
  assert.deepEqual(prepared.request.normal_lane_authorization, legacyRequest.normal_lane_authorization);
});
check("the exact runner value prepareNativeCritic sends the gate is accepted by the real onboarding readiness gate, not merely present in a captured argument", () => {
  // The injected requireProjectOnboardingReadyFn substitute used throughout this
  // suite accepts any arguments, so a captured-argument assertion alone (above)
  // cannot prove that the literal string prepareNativeCritic sends ("codex") is a
  // value the real gate's own validation accepts. Drive the real gate directly,
  // with only its own `inspect` dependency replaced, to prove that.
  let inspected;
  const result = requireProjectOnboardingReady({
    rootDir: repo,
    intent: "dispatch",
    runner: "codex",
    inspect(options) {
      inspected = options;
      return {
        schema: "pipeline.project-onboarding.v4",
        status: "ready",
        root: realpathSync(repo),
        runner: options.runner,
        intent: options.intent,
        repository: {},
        runtime: {},
        continuity: {},
        appServer: {},
        nextAction: null,
        diagnostics: [],
        // A real `status: "ready"` observation carries these two extra keys
        // (project-onboarding-v3.mjs); the gate's own exactKeys() check picks
        // its expected shape from the observation's declared status, so a
        // ready fixture must match the ready shape exactly. Kept in step
        // with plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs's
        // READY_ONLY_RESULT_KEYS (not exported; no shared list to import).
        pushApprovalMode: "signature",
        trustAnchorAvailability: "present",
      };
    },
  });
  assert.deepEqual(inspected, { rootDir: repo, intent: "dispatch", runner: "codex" });
  assert.equal(result.status, "ready");
});
check("prepared packet is private and no observer path leaks", () => {
  // Native Windows mode is a synthetic constant, not real POSIX permission bits; the
  // production write path enforces the equivalent owner-DACL assurance separately.
  if (process.platform !== "win32") assert.equal(statSync(preparedPath).mode & 0o777, 0o600);
  assert.equal(readFileSync(preparedPath, "utf8").includes(repo), false);
});
check("disposable checkout has no remote and exact candidate", () => {
  assert.equal(run("git", ["remote"], reviewRoot), "");
  assert.equal(run("git", ["rev-parse", "HEAD"], reviewRoot), candidate.commit);
});
check("prepared packet binds verify evidence and observer state", () => {
  assert.equal(prepared.references.some(({ kind }) => kind === "evidence"), true);
  assert.equal(typeof prepared.bindings.protectedBefore.candidate, "string");
  assert.equal(typeof prepared.bindings.protectedBefore["observer.private"], "string");
});
check("prepared packet binds the exact enumerated commit-set as its diff reference", () => {
  assert.deepEqual(prepared.review.commits, candidate.commits);
  assert.equal(prepared.review.diffReferencePath, "evidence/codex-critic-commit-set.json");
  const diffReference = prepared.references.filter(({ source, kind }) => source === "review" && kind === "diff");
  assert.equal(diffReference.length, 1);
  assert.deepEqual(readJsonBounded(join(reviewRoot, diffReference[0].path)).value, {
    schema: "pipeline.codex-critic-commit-set.v1",
    base: candidate.base,
    commits: candidate.commits,
    candidateCommit: candidate.commit,
    candidateTree: candidate.tree,
  });
});
check("delta prepare binds only the actual changed path and its invariant", () => {
  const control = join(root, "delta-control");
  mkdirSync(control, { mode: 0o700 });
  const delta = structuredClone(request);
  delta.review_base = candidate.commits[0];
  delta.review_economy = {
    round: 2,
    correction_commits: 1,
    requested_mode: "delta",
    changed_paths: ["policies/guard.md"],
    changed_behavior_claims: ["guardrail-policy-change"],
    prior_receipt: { id: "prior-receipt-01", sha256: null },
    path_invariant_map: { "policies/guard.md": ["invariant-guardrail-policy"] },
    path_invariant_map_sha256: null,
    coordinator_impact_confirmed: true,
    trust_boundary_changed: false,
    impact_ambiguous: false,
  };
  delta.review_economy.prior_receipt.sha256 = writeAcceptedPriorReceipt(control, delta.review_economy.prior_receipt.id, delta.review_base, {
    normalLaneAuthorization: legacyReceiptAuthorization(delta.review_base),
  });
  delta.review_economy.path_invariant_map_sha256 = sha256Canonical(delta.review_economy.path_invariant_map);
  const deltaRequestPath = join(control, "request.json");
  const deltaPreparedPath = join(control, "prepared.json");
  writeJson(deltaRequestPath, delta);
  prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: control,
    dispatchStatePath: join(control, "state.json"),
    requestPath: deltaRequestPath,
    preparedPath: deltaPreparedPath,
    reviewRoot: join(control, "review"),
    observers,
  }, {
    randomBytes: () => Buffer.alloc(32, 9),
    runVerify: (checkout) => {
      mkdirSync(join(checkout, "evidence"), { recursive: true });
      writeJson(join(checkout, "evidence", "verify-latest.json"), { schema: "fixture.verify.v1", exitCode: 0, commit: candidate.commit });
      return { command: "node verify.mjs", stdoutSha256: sha256("ok"), stderrSha256: sha256(""), stdoutBytes: 2, stderrBytes: 0, completedTestSteps: 1 };
    },
  });
  const deltaPreparedRecord = readJsonBounded(deltaPreparedPath);
  const deltaPrepared = deltaPreparedRecord.value;
  assert.deepEqual(deltaPrepared.reviewPlan, {
    mode: "delta",
    admissionCode: "RE-DELTA-ADMITTED",
    affectedInvariantIds: ["invariant-guardrail-policy"],
  });
  const hostReturn = successfulReturn(deltaPrepared, deltaPreparedRecord.sha256);
  assert.doesNotThrow(() => validateHostReturn(deltaPrepared, deltaPreparedRecord.sha256, hostReturn));
  hostReturn.critic_result.affected_invariant_ids = [];
  rebindCompletion(hostReturn);
  assert.throws(() => validateHostReturn(deltaPrepared, deltaPreparedRecord.sha256, hostReturn), /review-plan binding/);
});
check("delta preparation rejects forged legacy receipt metadata or an underreported correction range", () => {
  const makeDelta = (control, correctionCommits, forgedDigest, normalLaneAuthorization) => {
    mkdirSync(control, { mode: 0o700 });
    const delta = structuredClone(request);
    delta.review_base = candidate.commits[0];
    delta.review_economy = {
      round: 2,
      correction_commits: correctionCommits,
      requested_mode: "delta",
      changed_paths: ["policies/guard.md"],
      changed_behavior_claims: ["guardrail-policy-change"],
      prior_receipt: { id: "prior-receipt-02", sha256: null },
      path_invariant_map: { "policies/guard.md": ["invariant-guardrail-policy"] },
      path_invariant_map_sha256: null,
      coordinator_impact_confirmed: true,
      trust_boundary_changed: false,
      impact_ambiguous: false,
    };
    const digest = writeAcceptedPriorReceipt(control, delta.review_economy.prior_receipt.id, delta.review_base, { normalLaneAuthorization });
    delta.review_economy.prior_receipt.sha256 = forgedDigest ? "f".repeat(64) : digest;
    delta.review_economy.path_invariant_map_sha256 = sha256Canonical(delta.review_economy.path_invariant_map);
    const requestPath = join(control, "request.json");
    writeJson(requestPath, delta);
    return () => prepareNativeCritic({
      repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: control,
      dispatchStatePath: join(control, "state.json"), requestPath,
      preparedPath: join(control, "prepared.json"), reviewRoot: join(control, "review"), observers,
    }, {
      randomBytes: () => Buffer.alloc(32, correctionCommits + (forgedDigest ? 20 : 30)),
      runVerify: (checkout) => {
        mkdirSync(join(checkout, "evidence"), { recursive: true });
        writeJson(join(checkout, "evidence", "verify-latest.json"), { schema: "fixture.verify.v1", exitCode: 0, commit: candidate.commit });
        return { command: "node verify.mjs", stdoutSha256: sha256("ok"), stderrSha256: sha256(""), stdoutBytes: 2, stderrBytes: 0, completedTestSteps: 1 };
      },
    });
  };
  assert.throws(makeDelta(join(root, "delta-forged-receipt"), 1, true), /prior receipt digest mismatch/);
  assert.throws(makeDelta(join(root, "delta-forged-legacy-authorization"), 1, false,
    legacyReceiptAuthorization(candidate.commit)), /legacy receipt normal lane authorization/);
  assert.throws(makeDelta(join(root, "delta-underreported-corrections"), 0, false), /correction commits/);
});
check("later full admission cannot bypass exact correction-range reconciliation", () => {
  const control = join(root, "full-underreported-corrections");
  mkdirSync(control, { mode: 0o700 });
  const laterFull = structuredClone(request);
  laterFull.review_base = candidate.commits[0];
  laterFull.review_economy = {
    round: 2,
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
  };
  const laterFullRequestPath = join(control, "request.json");
  writeJson(laterFullRequestPath, laterFull);
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: control,
    dispatchStatePath: join(control, "state.json"), requestPath: laterFullRequestPath,
    preparedPath: join(control, "prepared.json"), reviewRoot: join(control, "review"), observers,
  }), /correction commits/);
});
check("configured fsmonitor cannot run before the protected baseline", () => {
  assert.equal(existsSync(join(privateObserver, "ignored", "fsmonitor.txt")), false);
});
check("verify-time observer mutation is detected before baselining", () => {
  const control = join(root, "mutation-control");
  mkdirSync(control, { mode: 0o700 });
  assert.throws(() => prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: control,
    dispatchStatePath: join(control, "state.json"),
    requestPath,
    preparedPath: join(control, "prepared.json"),
    reviewRoot: join(control, "review"),
    observers,
  }, {
    randomBytes: () => Buffer.alloc(32, 8),
    runVerify: (checkout) => {
      mkdirSync(join(checkout, "evidence"), { recursive: true });
      writeJson(join(checkout, "evidence", "verify-latest.json"), { exitCode: 0 });
      writeFileSync(join(privateObserver, "ignored", "state.txt"), "verify mutated\n");
      return { command: "node verify.mjs", stdoutSha256: sha256("ok"), stderrSha256: sha256(""), stdoutBytes: 2, stderrBytes: 0, completedTestSteps: 1 };
    },
  }), /verify subprocess repository mutation/);
  writeFileSync(join(privateObserver, "ignored", "state.txt"), "initial\n");
});

const validReturn = successfulReturn(prepared, preparedRecord.sha256);
check("valid host return passes pure validation", () => {
  assert.equal(validateHostReturn(prepared, preparedRecord.sha256, validReturn).reviewPass, true);
});
check("T1 rejects the normal-lane assurance claim", () => {
  const value = structuredClone(validReturn);
  value.critic_result.achieved_assurance = ASSURANCE;
  rebindCompletion(value);
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /assurance claim mismatch/);
});
check("unknown assurance claims fail closed at the return schema", () => {
  const value = structuredClone(validReturn);
  value.critic_result.achieved_assurance = "unrecognized-assurance";
  rebindCompletion(value);
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /schema invalid/);
});
check("non-T1 preparation retains the normal assurance", () => {
  const control = join(root, "normal-assurance-control");
  mkdirSync(control, { mode: 0o700 });
  const normalRequest = structuredClone(request);
  normalRequest.trigger_row = "T2";
  const normalRequestPath = join(control, "request.json");
  const normalPreparedPath = join(control, "prepared.json");
  writeJson(normalRequestPath, normalRequest);
  prepareNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: control,
    dispatchStatePath: join(control, "state.json"),
    requestPath: normalRequestPath,
    preparedPath: normalPreparedPath,
    reviewRoot: join(control, "review"),
    observers,
  }, {
    randomBytes: () => Buffer.alloc(32, 11),
    runVerify: (checkout) => {
      mkdirSync(join(checkout, "evidence"), { recursive: true });
      writeJson(join(checkout, "evidence", "verify-latest.json"), { schema: "fixture.verify.v1", exitCode: 0, commit: candidate.commit });
      return { command: "node verify.mjs", stdoutSha256: sha256("ok"), stderrSha256: sha256(""), stdoutBytes: 2, stderrBytes: 0, completedTestSteps: 1 };
    },
  });
  const normalPreparedRecord = readJsonBounded(normalPreparedPath);
  const normalPrepared = normalPreparedRecord.value;
  assert.equal(normalPrepared.assurance, ASSURANCE);
  assert.doesNotThrow(() => validateHostReturn(
    normalPrepared,
    normalPreparedRecord.sha256,
    successfulReturn(normalPrepared, normalPreparedRecord.sha256),
  ));
});
for (const [name, mutate, pattern] of [
  ["wrong model", (value) => { value.host_execution.resolved_model = "other"; }, /schema invalid|route mismatch/],
  ["wrong requested model label", (value) => { value.host_execution.requested_alias = "other"; }, /route mismatch/],
  ["wrong requested effort", (value) => { value.host_execution.requested_effort = "other"; }, /route mismatch/],
  ["wrong V3 route source", (value) => { value.host_execution.route_source = "project-duty+coordinator"; }, /route source mismatch/],
  ["delegating host", (value) => { value.host_execution.may_delegate = true; }, /schema invalid|delegation/],
  ["wrong task name", (value) => { value.host_execution.task_name = "critic_other_task"; }, /task\/agent identity/],
  ["late first evidence", (value) => { value.host_execution.evidence_events[0].elapsed_ms = 60_001; }, /too late/],
  ["lease timeout", (value) => { value.host_execution.completed_elapsed_ms = 480_001; }, /lease/],
  ["second recovery", (value) => { value.host_execution.recovery_count = 2; }, /recovery/],
  ["prepared replay", (value) => { value.critic_result.prepared_sha256 = sha256("other"); }, /replay/],
  ["candidate replay", (value) => { value.critic_result.candidate_tree = "0".repeat(40); }, /candidate/],
  ["private path leak", (value) => { value.critic_result.verdict.trajectory_evidence = "/home/private/evidence.json"; }, /prohibited/],
  ["briefing violation with pass", (value) => { value.critic_result.verdict.briefing_violations = ["framed"]; }, /contradicts/],
  ["inconsistent trajectory with pass", (value) => { value.critic_result.verdict.trajectory_verdict = "inconsistent"; }, /contradicts/],
  ["major finding with pass", (value) => { value.critic_result.verdict.findings = [{ gap: "gap", risk: "risk", severity: "major", evidence: "specs/review.md:1", spec_ref: "AC-1" }]; }, /contradicts/],
]) {
  check(`${name} fails closed`, () => {
    const value = structuredClone(validReturn);
    mutate(value);
    rebindCompletion(value);
    assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), pattern);
  });
}
for (const [name, disclosure] of [
  ["empty context disclosure", []],
  ["duplicate context disclosure", ["git-status", "git-status"]],
  ["contradictory none disclosure", ["none", "host-runtime"]],
]) {
  check(`${name} fails closed`, () => {
    const value = structuredClone(validReturn);
    value.critic_result.context_disclosure = disclosure;
    rebindCompletion(value);
    assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /context disclosure/);
  });
}
check("repeated liveness evidence does not count as progress", () => {
  const value = structuredClone(validReturn);
  value.host_execution.evidence_events.splice(1, 0, {
    ...value.host_execution.evidence_events[0],
    sequence: 2,
    elapsed_ms: 750,
  });
  value.host_execution.evidence_events.forEach((event, index) => { event.sequence = index + 1; });
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /repeated/);
});
check("generic liveness text is rejected", () => {
  const value = structuredClone(validReturn);
  value.host_execution.evidence_events[1].evidence_text = "running with no evidence";
  value.host_execution.evidence_events[1].evidence_sha256 = sha256(value.host_execution.evidence_events[1].evidence_text);
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /not concrete/);
});
check("actual vector advance resets stagnation independently of wall time", () => {
  const value = structuredClone(validReturn);
  value.host_execution.evidence_events[1].elapsed_ms = 180_500;
  value.host_execution.evidence_events[2].elapsed_ms = 181_000;
  value.host_execution.completed_elapsed_ms = 181_500;
  assert.doesNotThrow(() => validateHostReturn(prepared, preparedRecord.sha256, value));
});
check("unchanged vector above the stagnation interval fails closed", () => {
  const value = structuredClone(validReturn);
  const evidenceText = "recovery-started-after-progress-gap";
  value.host_execution.evidence_events.splice(2, 0, {
    sequence: 3,
    kind: "recovery-started",
    elapsed_ms: 181_001,
    evidence_text: evidenceText,
    evidence_sha256: sha256(evidenceText),
    progress: { ...value.host_execution.evidence_events[1].progress },
  });
  value.host_execution.recovery_count = 1;
  value.host_execution.evidence_events[3].elapsed_ms = 181_500;
  value.host_execution.completed_elapsed_ms = 182_000;
  value.host_execution.evidence_events.forEach((event, index) => { event.sequence = index + 1; });
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /progress stagnation/);
});
check("regressing progress vector fails closed", () => {
  const value = structuredClone(validReturn);
  value.host_execution.evidence_events[2].progress.boundTreeChanges = 0;
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /not bound/);
});
check("completed progress binds the exact result byte count", () => {
  const value = structuredClone(validReturn);
  value.host_execution.evidence_events.at(-1).progress.deliveredResultBytes += 1;
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /not bound/);
});
check("unbound analysis-progress cannot claim a vector advance", () => {
  const value = structuredClone(validReturn);
  const evidenceText = "analysis-progress:not-in-packet.md:1:control";
  value.host_execution.evidence_events.splice(2, 0, {
    sequence: 3,
    kind: "analysis-progress",
    elapsed_ms: 180_000,
    evidence_text: evidenceText,
    evidence_sha256: sha256(evidenceText),
    progress: { ...value.host_execution.evidence_events[1].progress, traceBytes: Buffer.byteLength(evidenceText, "utf8") },
  });
  value.host_execution.evidence_events[3].elapsed_ms = 360_500;
  value.host_execution.evidence_events[3].progress.traceBytes = Buffer.byteLength(evidenceText, "utf8");
  value.host_execution.completed_elapsed_ms = 361_000;
  value.host_execution.evidence_events.forEach((event, index) => { event.sequence = index + 1; });
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /outside the prepared reference/);
});
check("recovery status without an advance cannot reset the stagnation lease", () => {
  const value = structuredClone(validReturn);
  const evidenceText = "recovery-started-after-content-gap";
  value.host_execution.evidence_events.splice(2, 0, {
    sequence: 3,
    kind: "recovery-started",
    elapsed_ms: 181_001,
    evidence_text: evidenceText,
    evidence_sha256: sha256(evidenceText),
    progress: { ...value.host_execution.evidence_events[1].progress },
  });
  value.host_execution.recovery_count = 1;
  value.host_execution.evidence_events[3].elapsed_ms = 181_500;
  value.host_execution.completed_elapsed_ms = 361_000;
  value.host_execution.evidence_events.forEach((event, index) => { event.sequence = index + 1; });
  assert.throws(() => validateHostReturn(prepared, preparedRecord.sha256, value), /progress stagnation/);
});
check("path-line-bound analysis vector advance extends the stagnation lease", () => {
  const value = structuredClone(validReturn);
  const reference = prepared.references.find(({ source }) => source === "review");
  const evidenceText = `analysis-progress:${reference.path}:1:contract-check`;
  value.host_execution.evidence_events.splice(2, 0, {
    sequence: 3,
    kind: "analysis-progress",
    elapsed_ms: 180_000,
    evidence_text: evidenceText,
    evidence_sha256: sha256(evidenceText),
    progress: { ...value.host_execution.evidence_events[1].progress, traceBytes: Buffer.byteLength(evidenceText, "utf8") },
  });
  value.host_execution.evidence_events[3].elapsed_ms = 360_500;
  value.host_execution.evidence_events[3].progress.traceBytes = Buffer.byteLength(evidenceText, "utf8");
  value.host_execution.completed_elapsed_ms = 361_000;
  value.host_execution.evidence_events.forEach((event, index) => { event.sequence = index + 1; });
  assert.doesNotThrow(() => validateHostReturn(prepared, preparedRecord.sha256, value));
});

const returnPath = join(root, "return.json");
const receiptDir = join(root, "published-receipts");
mkdirSync(receiptDir);
const receiptPath = join(receiptDir, "receipt.json");
writeJson(returnPath, validReturn);
check("finalize transaction paths must be pairwise distinct", () => {
  assert.throws(() => finalizeNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: root,
    dispatchStatePath,
    preparedPath,
    returnPath,
    receiptPath: `${dispatchStatePath}.receipt.pending`,
    observers,
  }), /pairwise distinct/);
});
if (symlinkCapable) check("leaf-symlinked host return is rejected", () => {
  const alternate = join(root, "alternate-return.json");
  writeJson(alternate, validReturn);
  rmSync(returnPath);
  symlinkSync(alternate, returnPath);
  assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers }), /must not be a symlink/);
  rmSync(returnPath);
  writeJson(returnPath, validReturn);
});
check("observer mutation blocks finalize", () => {
  const trackedObserver = createObserver(join(root, "tracked-mutation-observer"));
  const before = captureRepositoryFingerprint(trackedObserver).sha256;
  writeFileSync(join(trackedObserver, "tracked.txt"), "mutated\n");
  assert.notEqual(captureRepositoryFingerprint(trackedObserver).sha256, before);
});
check("ignored observer content mutation blocks finalize", () => {
  writeFileSync(join(sharedObserver, "ignored", "state.txt"), "mutated ignored content\n");
  assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers }), /mutation/);
  writeFileSync(join(sharedObserver, "ignored", "state.txt"), "initial\n");
});
check("Git administrative mutation blocks finalize", () => {
  const configPath = join(sharedObserver, ".git", "config");
  const original = readFileSync(configPath);
  writeFileSync(configPath, Buffer.concat([original, Buffer.from("\n[credential]\n\thelper = malicious\n")]));
  assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers }), /mutation/);
  writeFileSync(configPath, original);
});
check("new loose Git object blocks finalize", () => {
  const result = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: sharedObserver, input: "unreachable object\n", encoding: "utf8" });
  assert.equal(result.status, 0);
  const object = result.stdout.trim();
  const directory = join(sharedObserver, ".git", "objects", object.slice(0, 2));
  const objectPath = join(directory, object.slice(2));
  assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers }), /mutation/);
  rmSync(objectPath);
  if (readdirSync(directory).length === 0) rmSync(directory, { recursive: true });
});
check("persistent Git index lock blocks finalize", () => {
  const lock = join(sharedObserver, ".git", "index.lock");
  writeFileSync(lock, "lock\n");
  assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers }), /mutation/);
  rmSync(lock);
});
check("raw Git index-only mutation blocks finalize", () => {
  const indexObserver = createObserver(join(root, "raw-index-observer"));
  const indexPath = join(indexObserver, ".git", "index");
  const before = captureRepositoryFingerprint(indexObserver).sha256;
  const mutated = Buffer.from(readFileSync(indexPath));
  mutated[19] ^= 1;
  createHash("sha1").update(mutated.subarray(0, -20)).digest().copy(mutated, mutated.length - 20);
  writeFileSync(indexPath, mutated);
  assert.notEqual(captureRepositoryFingerprint(indexObserver).sha256, before);
});
// chmod cannot produce a real permission change on native Windows (mode is a
// synthetic constant there), so this POSIX mode-mutation premise has no Windows
// equivalent to exercise; the fingerprint's Windows-relevant inputs are covered
// by the other mutation-probe checks in this file.
if (process.platform !== "win32") check("Git index mode-only mutation changes the administrative fingerprint", () => {
  const indexObserver = createObserver(join(root, "index-mode-observer"));
  const indexPath = join(indexObserver, ".git", "index");
  const before = captureRepositoryFingerprint(indexObserver).sha256;
  chmodSync(indexPath, 0o600);
  assert.notEqual(captureRepositoryFingerprint(indexObserver).sha256, before);
});
check("empty untracked worktree directory mutation changes the fingerprint", () => {
  const emptyDirectory = join(sharedObserver, "empty-untracked-directory");
  const before = captureRepositoryFingerprint(sharedObserver).sha256;
  mkdirSync(emptyDirectory);
  assert.notEqual(captureRepositoryFingerprint(sharedObserver).sha256, before);
  rmSync(emptyDirectory, { recursive: true });
  assert.equal(captureRepositoryFingerprint(sharedObserver).sha256, before);
});
check("reserved AGENTS.md directories fail closed without opening their contents", () => {
  const reservedDirectory = join(sharedObserver, "AGENTS.md");
  mkdirSync(reservedDirectory);
  assert.throws(() => captureRepositoryFingerprint(sharedObserver), /reserved AGENTS\.md directory/);
  rmSync(reservedDirectory, { recursive: true });
  assert.equal(captureRepositoryFingerprint(sharedObserver).sha256, prepared.bindings.protectedBefore["observer.shared"]);
});
if (symlinkCapable) check("symlinked Git index is rejected instead of dereferenced", () => {
  const indexObserver = createObserver(join(root, "index-symlink-observer"));
  const indexPath = join(indexObserver, ".git", "index");
  renameSync(indexPath, `${indexPath}.backing`);
  symlinkSync("index.backing", indexPath);
  assert.throws(() => captureRepositoryFingerprint(indexObserver), /regular non-symlink/);
});
check("mutation probes restore every protected repository exactly", () => {
  for (const [name, path] of [["candidate", repo], ["ruleset", rulesetRoot], ["observer.private", privateObserver], ["observer.shared", sharedObserver]]) {
    assert.equal(captureRepositoryFingerprint(path).sha256, prepared.bindings.protectedBefore[name], name);
  }
});
check("reference mutation blocks finalize", () => {
  const evidencePath = join(reviewRoot, "evidence", "verify-latest.json");
  const original = readFileSync(evidencePath);
  writeFileSync(evidencePath, "{}\n");
  assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers }), /reference set drift/);
  writeFileSync(evidencePath, original);
});
check("enumerated diff mutation blocks finalize", () => {
  const diffPath = join(reviewRoot, prepared.review.diffReferencePath);
  const original = readFileSync(diffPath);
  const changed = readJsonBounded(diffPath).value;
  changed.commits = [candidate.base];
  writeJson(diffPath, changed);
  assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers }), /commit set drift|commit-set reference drift/);
  writeFileSync(diffPath, original);
});
for (const [name, citation] of [["path-only", "specs/review.md"], ["synthetic trailing-newline", "specs/review.md:4"], ["out-of-range", "specs/review.md:999999"]]) {
  check(`${name} finding citation is rejected`, () => {
    const invalid = structuredClone(validReturn);
    invalid.critic_result.verdict = {
      findings: [{ gap: "Gap.", risk: "Risk.", severity: "major", evidence: citation, spec_ref: "AC-1" }],
      deliberately_not_flagged: [],
      trajectory_verdict: "consistent",
      trajectory_evidence: "evidence/verify-latest.json matches the reviewed commit",
      briefing_violations: [],
      pass: false,
    };
    rebindCompletion(invalid);
    writeJson(returnPath, invalid);
    assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers }), /path:line|outside the cited/);
    writeJson(returnPath, validReturn);
  });
}
check("current finalization strips legacy authorization while historical receipts remain schema-valid", () => {
  const result = finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath, observers, cleanup: true });
  assert.equal(result.reviewPass, true);
  assert.equal(result.cleanupComplete, true);
  const receipt = readJsonBounded(receiptPath).value;
  assert.equal(receipt.assurance, T1_ASSURANCE);
  assert.equal(receipt.route.providerAttested, false);
  assert.equal(receipt.route.mayDelegate, false);
  assert.equal(receipt.route.alias, prepared.route.model);
  assert.equal(receipt.route.requestedModel, prepared.route.model);
  assert.equal(receipt.route.requestedEffort, prepared.route.effort);
  assert.equal(receipt.route.sourceSha256, prepared.route.sourceSha256);
  assert.equal(receipt.route.candidateCommit, prepared.route.candidateCommit);
  assert.equal("normalLaneAuthorization" in receipt, false);
  const receiptSchema = JSON.parse(readFileSync(join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/scripts/codex-critic-receipt.schema.json"), "utf8"));
  const historicalReceipt = structuredClone(receipt);
  historicalReceipt.normalLaneAuthorization = legacyReceiptAuthorization(receipt.candidate.commit);
  assert.equal(validateAgainstSchema(historicalReceipt, receiptSchema).valid, true);
  const malformedReceipt = structuredClone(historicalReceipt);
  malformedReceipt.normalLaneAuthorization = { authority: "PO" };
  assert.equal(validateAgainstSchema(malformedReceipt, receiptSchema).valid, false);
  assert.equal(receipt.state.mutationObserved, false);
  assert.deepEqual(receipt.liveness.evidenceEvents, validReturn.host_execution.evidence_events.map(({ kind, elapsed_ms, evidence_sha256, progress }) => ({
    kind, elapsedMs: elapsed_ms, evidenceSha256: evidence_sha256, progress,
  })));
  assert.equal("trajectory_evidence" in receipt.verdict, false);
  assert.equal(readFileSync(receiptPath, "utf8").includes(repo), false);
});
check("consumed dispatch cannot be finalized twice", () => {
  assert.throws(() => finalizeNativeCritic({ repoRoot: repo, pipelineRoot: rulesetRoot, controlDir: root, dispatchStatePath, preparedPath, returnPath, receiptPath: join(root, "second-receipt.json"), observers }), /does not exist|consum|review|reference/i);
});

const failureControl = join(root, "failure-control");
mkdirSync(failureControl, { mode: 0o700 });
const failurePreparedPath = join(failureControl, "prepared.json");
const failureStatePath = join(failureControl, "state.json");
const failureReviewRoot = join(failureControl, "review");
prepareNativeCritic({
  repoRoot: repo,
  pipelineRoot: rulesetRoot,
  controlDir: failureControl,
  dispatchStatePath: failureStatePath,
  requestPath,
  preparedPath: failurePreparedPath,
  reviewRoot: failureReviewRoot,
  observers,
}, {
  randomBytes: () => Buffer.alloc(32, 9),
  now: () => "2026-07-15T00:01:00.000Z",
  runVerify: (checkout) => {
    mkdirSync(join(checkout, "evidence"), { recursive: true });
    writeJson(join(checkout, "evidence", "verify-latest.json"), { schema: "fixture.verify.v1", exitCode: 0, commit: candidate.commit });
    return { command: "node verify.mjs", stdoutSha256: sha256("ok"), stderrSha256: sha256(""), stdoutBytes: 2, stderrBytes: 0, completedTestSteps: 1 };
  },
});
const failurePreparedRecord = readJsonBounded(failurePreparedPath);
const failedReturn = successfulReturn(failurePreparedRecord.value, failurePreparedRecord.sha256);
failedReturn.critic_result.verdict = {
  findings: [{ gap: "Required behavior is absent.", risk: "The close gate could be unsound.", severity: "major", evidence: "specs/review.md:1", spec_ref: "AC-1" }],
  deliberately_not_flagged: [],
  trajectory_verdict: "consistent",
  trajectory_evidence: "evidence/verify-latest.json matches the reviewed commit",
  briefing_violations: [],
  pass: false,
};
rebindCompletion(failedReturn);
const failedReturnPath = join(failureControl, "return.json");
const failedReceiptPath = join(failureControl, "receipt.json");
writeJson(failedReturnPath, failedReturn);
writeFileSync(failedReceiptPath, "occupied\n");
check("pre-existing receipt refuses without consuming the dispatch", () => {
  assert.throws(() => finalizeNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: failureControl,
    dispatchStatePath: failureStatePath,
    preparedPath: failurePreparedPath,
    returnPath: failedReturnPath,
    receiptPath: failedReceiptPath,
    observers,
  }), /already exists before dispatch consumption/);
  assert.equal(existsSync(`${failureStatePath}.consumed`), false);
});
rmSync(failedReceiptPath);
check("failing review emits a sanitized disposition receipt", () => {
  const result = finalizeNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: failureControl,
    dispatchStatePath: failureStatePath,
    preparedPath: failurePreparedPath,
    returnPath: failedReturnPath,
    receiptPath: failedReceiptPath,
    observers,
    cleanup: false,
  });
  assert.equal(result.reviewPass, false);
  const receipt = readJsonBounded(failedReceiptPath).value;
  assert.equal(receipt.verdict.findings[0].severity, "major");
  assert.equal("gap" in receipt.verdict.findings[0], false);
});
rmSync(`${failureStatePath}.complete`);
check("interrupted receipt publication recovers from the finalizing marker", () => {
  const result = finalizeNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: failureControl,
    dispatchStatePath: failureStatePath,
    preparedPath: failurePreparedPath,
    returnPath: failedReturnPath,
    receiptPath: failedReceiptPath,
    observers,
  });
  assert.equal(result.recovered, true);
  assert.equal(result.reviewPass, false);
});
check("a failed review receipt also consumes the dispatch", () => {
  assert.throws(() => finalizeNativeCritic({
    repoRoot: repo,
    pipelineRoot: rulesetRoot,
    controlDir: failureControl,
    dispatchStatePath: failureStatePath,
    preparedPath: failurePreparedPath,
    returnPath: failedReturnPath,
    receiptPath: join(failureControl, "replayed-receipt.json"),
    observers,
  }), /already consumed/);
});

check("affected Codex Critic launches consume the generic selected read-only transport", () => {
  const source = readFileSync(join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/scripts/codex-critic-host.mjs"), "utf8");
  assert.equal(source.includes("sandboxed-readonly-host-bridge.mjs"), true, "Critic must delegate to generic selected transport");
  assert.equal(source.includes("createCodexSandboxRuntimeTransport"), true, "Critic must compose the standard physical sandbox runtime when no host adapter is injected");
  assert.equal(source.includes("sandboxRuntime"), true, "Critic must require host-supplied physical runtime coordinates");
  assert.equal(source.includes('"selected"'), true, "the live Critic host CLI must expose the selected transport command");
  assert.equal(source.includes("selectedCriticHostBridge"), true, "the live Critic host CLI must bind its selected launch/result protocol");
  assert.equal(source.includes("selectionId"), true, "Critic must bind its selection");
  assert.equal(/execution receipt/ui.test(source), true, "Critic must bind execution evidence");
  assert.equal(source.includes("danger-full-access"), false, "Critic must not offer the prohibited mode");
  assert.equal(source.includes("technically-isolated"), false, "network-open transport must not claim strong isolation");
});

// --- NVA-B-CRITICXPORT-1: the selected-Codex-Critic in-process bridge/consumer ---

function validCriticVerdict() {
  return {
    findings: [],
    deliberately_not_flagged: ["fixture review"],
    trajectory_verdict: "consistent",
    trajectory_evidence: "fixture",
    briefing_violations: [],
    pass: true,
  };
}

const SELECTED_CRITIC_ROUTE = Object.freeze({ dutyId: "critic_high_risk", runner: "codex", model: "gpt-6-astra", effort: "max", sourceSha256: "a".repeat(64), candidateCommit: null });
function selectedRouteFor(input) { return { ...SELECTED_CRITIC_ROUTE, candidateCommit: input.dispatch.candidateCommit }; }

check("the selected Critic route resolves model and effort from validated V3 project authority", () => {
  const candidateCommit = "c".repeat(40);
  const source = readFileSync(join(DEFAULT_PIPELINE_ROOT, "pipeline.user.yaml"), "utf8");
  const route = resolveCriticHighRiskRoute({
    rootDir: DEFAULT_PIPELINE_ROOT,
    candidateCommit,
    readCandidateSource: ({ candidateCommit: observed }) => { assert.equal(observed, candidateCommit); return source; },
  });
  assert.deepEqual({ dutyId: route.dutyId, runner: route.runner, model: route.model, effort: route.effort }, {
    dutyId: SELECTED_CRITIC_ROUTE.dutyId, runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model, effort: SELECTED_CRITIC_ROUTE.effort,
  });
  assert.match(route.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(route.candidateCommit, candidateCommit);
});

function criticPayload(overrides = {}) {
  return {
    sandboxTransport: {
      selectionId: "css_test", selectionSha256: "a".repeat(64), repoFingerprint: "b".repeat(64), duty: "critic",
      dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64), requestSha256: "f".repeat(64) },
      requested: { runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model },
      criticRoute: SELECTED_CRITIC_ROUTE,
      toolchain: { cliSha256: "1".repeat(64) },
      profile: { base: ":read-only", network: { enabled: true }, sha256: "2".repeat(64), scratchRootSha256: "3".repeat(64) },
      scratch: { path: "/tmp/critic-scratch", sha256: "3".repeat(64), sandboxStateJson: "{}", sandboxStateSha256: "4".repeat(64), repoRoot: DEFAULT_PIPELINE_ROOT, codexPath: "/codex" },
    },
    referencePaths: ["roles/critic.md"],
    candidateCommit: "c".repeat(40),
    candidateTree: "d".repeat(40),
    reviewBase: "9".repeat(40),
    ...overrides,
  };
}

function fakeCriticSpawn(result, terminal = { code: 0, signal: null }, onRequest = () => {}) {
  return () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const chunks = [];
    child.stdin.on("data", (chunk) => chunks.push(chunk));
    child.stdin.on("finish", () => {
      onRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      child.stdout.end(`${JSON.stringify(result)}\n`);
      queueMicrotask(() => child.emit("close", terminal.code, terminal.signal));
    });
    return child;
  };
}

// A spawn that never gets a child at all -- the `error` event the real
// child_process module emits on ENOENT/EACCES, with no `close` following it.
function fakeCriticSpawnFailure(errorCode = "ENOENT") {
  return () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    queueMicrotask(() => child.emit("error", Object.assign(new Error(errorCode), { code: errorCode })));
    return child;
  };
}

function criticAnswered(overrides = {}) {
  return {
    schema: "pipeline.codex-critic-app-server-child.v1", ok: true, code: "answered",
    answer: JSON.stringify(validCriticVerdict()),
    observed: { provider: "openai", model: SELECTED_CRITIC_ROUTE.model, effort: SELECTED_CRITIC_ROUTE.effort, initialized: true, threadStarted: true, turnStarted: true, turnCompleted: true, stdinEnded: true, exitCode: 0, signal: null, cleanup: "complete" },
    ...overrides,
  };
}

function writeFakeCriticAppServer(directory, items, {
  itemThreadId = "review-thread", itemTurnId = "turn-1", serverRequests = [],
  threadSandbox = { type: "readOnly", networkAccess: false },
  featurePages = [{ data: NATIVE_CRITIC_PROHIBITED_FEATURES.map((name) => ({ name, enabled: false })), nextCursor: null }],
  mcpPages = [{ data: [], nextCursor: null }],
  discoveryMcpPages = [{ data: [], nextCursor: null }],
  discoveryThreadId = "discovery-thread",
  reviewThreadId = "review-thread",
  threadReasoningEffort = SELECTED_CRITIC_ROUTE.effort,
  requireNativeWire = false,
  expectedEnvironment = null,
} = {}) {
  const path = join(directory, "fake-codex-app-server.mjs");
  const source = [
    "#!/usr/bin/env node",
    `const items = ${JSON.stringify(items)};`,
    `const model = ${JSON.stringify(SELECTED_CRITIC_ROUTE.model)};`,
    `const itemThreadId = ${JSON.stringify(itemThreadId)};`,
    `const itemTurnId = ${JSON.stringify(itemTurnId)};`,
    `const serverRequests = ${JSON.stringify(serverRequests)};`,
    `const threadSandbox = ${JSON.stringify(threadSandbox)};`,
    `const featurePages = ${JSON.stringify(featurePages)};`,
    `const mcpPages = ${JSON.stringify(mcpPages)};`,
    `const discoveryMcpPages = ${JSON.stringify(discoveryMcpPages)};`,
    `const discoveryThreadId = ${JSON.stringify(discoveryThreadId)};`,
    `const reviewThreadId = ${JSON.stringify(reviewThreadId)};`,
    `const threadReasoningEffort = ${JSON.stringify(threadReasoningEffort)};`,
    `const requireNativeWire = ${JSON.stringify(requireNativeWire)};`,
    `const expectedNativeArgs = ${JSON.stringify(nativeCriticReducingCliArgs())};`,
    `const expectedEnvironment = ${JSON.stringify(expectedEnvironment)};`,
    "const effectiveItemThreadId = requireNativeWire ? itemThreadId : 'thread-1';",
    "let featureIndex = 0; let mcpIndex = 0; let discoveryMcpIndex = 0;",
    "let buffer = '';",
    "const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n');",
    "const handle = (value) => {",
    "  if (value.id === 1) { const configIndex = process.argv.indexOf('--strict-config'); if ((expectedEnvironment && Object.entries(expectedEnvironment).some(([key, value]) => process.env[key] !== value)) || (requireNativeWire && (value.params?.capabilities?.experimentalApi !== true || configIndex < 0 || !expectedNativeArgs.every((argument, index) => process.argv[configIndex + 1 + index] === argument)))) return send({ id: 1, error: { code: -1 } }); return send({ id: 1, result: {} }); }",
    `  if (value.id === 2) { if (requireNativeWire && (value.params?.sandbox !== 'read-only' || value.params?.approvalPolicy !== 'never' || value.params?.ephemeral !== true || value.params?.model !== model || JSON.stringify(value.params?.config) !== JSON.stringify(${JSON.stringify(NATIVE_CRITIC_REDUCING_CONFIG)}))) return send({ id: 2, error: { code: -1 } }); return send({ id: 2, result: { model, modelProvider: 'openai', approvalPolicy: 'never', sandbox: threadSandbox, thread: { id: requireNativeWire ? discoveryThreadId : 'thread-1' } } }); }`,
    "  if (value.id === 3 && value.method === 'mcpServerStatus/list') { if (requireNativeWire && (value.params?.threadId !== discoveryThreadId || value.params?.detail !== 'toolsAndAuthOnly')) return send({ id: 3, error: { code: -1 } }); return send({ id: 3, result: discoveryMcpPages[discoveryMcpIndex++] }); }",
    `  if (value.id === 4 && value.method === 'thread/start') { const expected = { ...${JSON.stringify(NATIVE_CRITIC_REDUCING_CONFIG)}, model_reasoning_effort: ${JSON.stringify(SELECTED_CRITIC_ROUTE.effort)}, ...Object.fromEntries(discoveryMcpPages.flatMap((page) => page.data).map((row) => ['mcp_servers.' + row.name + '.enabled', false])) }; if (requireNativeWire && (value.params?.sandbox !== 'read-only' || value.params?.approvalPolicy !== 'never' || value.params?.ephemeral !== true || value.params?.model !== model || JSON.stringify(value.params?.config) !== JSON.stringify(expected))) return send({ id: 4, error: { code: -1 } }); return send({ id: 4, result: { model, modelProvider: 'openai', approvalPolicy: 'never', sandbox: threadSandbox, reasoningEffort: threadReasoningEffort, thread: { id: reviewThreadId } } }); }`,
    "  if (value.id === 5 && value.method === 'experimentalFeature/list') { if (requireNativeWire && value.params?.threadId !== reviewThreadId) return send({ id: 5, error: { code: -1 } }); return send({ id: 5, result: featurePages[featureIndex++] }); }",
    "  if (value.id === 6 && value.method === 'mcpServerStatus/list') { if (requireNativeWire && (value.params?.threadId !== reviewThreadId || value.params?.detail !== 'toolsAndAuthOnly')) return send({ id: 6, error: { code: -1 } }); return send({ id: 6, result: mcpPages[mcpIndex++] }); }",
    "  if (value.method !== 'turn/start') return;",
    "  if (requireNativeWire && (value.id !== 7 || value.params?.approvalPolicy !== 'never' || value.params?.model !== model || value.params?.effort == null || value.params?.sandboxPolicy?.type !== 'readOnly' || value.params?.sandboxPolicy?.networkAccess !== false)) return send({ id: value.id, error: { code: -1 } });",
    "  send({ id: value.id, result: { turn: { id: 'turn-1' } } });",
    "  for (const request of serverRequests) send(request);",
    "  for (const item of items) send({ method: 'item/completed', params: { threadId: effectiveItemThreadId, turnId: itemTurnId, item } });",
    "  send({ method: 'turn/completed', params: { threadId: requireNativeWire ? reviewThreadId : 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });",
    "};",
    "process.stdin.on('data', (chunk) => {",
    "  buffer += chunk.toString('utf8'); let newline;",
    "  while ((newline = buffer.indexOf('\\n')) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (line) handle(JSON.parse(line)); }",
    "});",
    "process.stdin.on('end', () => process.exit(0));",
  ].join("\n");
  assert.doesNotThrow(() => new Function(source.replace(/^#![^\n]*\n/u, "")), "fake app-server source must parse before execution");
  writeFileSync(path, source, { mode: 0o700 });
  return path;
}

function runActualCriticChild(childPath, codexPath, scratchPath, { native = false, env } = {}) {
  const input = {
    codexPath, cwd: DEFAULT_PIPELINE_ROOT, scratchPath, model: SELECTED_CRITIC_ROUTE.model, effort: SELECTED_CRITIC_ROUTE.effort,
    referencePaths: ["roles/critic.md"], roleContractPath: join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/roles/critic.md"),
    promptContractPath: join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/templates/prompts/critic-review.md"),
    verdictSchemaPath: join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/scripts/critic-verdict.schema.json"),
    candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), reviewBase: "9".repeat(40),
    ...(native ? { sandboxMode: "native-tools-read-only" } : {}),
  };
  const run = spawnSync(process.execPath, [childPath], { cwd: DEFAULT_PIPELINE_ROOT, input: JSON.stringify(input), encoding: "utf8", shell: false, timeout: 5_000, ...(env ? { env } : {}) });
  assert.equal(run.error, undefined);
  const lines = run.stdout.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1, run.stdout);
  return { status: run.status, stderr: run.stderr, result: JSON.parse(lines[0]) };
}

check("the actual child accepts commentary before one final answer; invalid phases, duplicate finals, mismatched IDs, and writes remain rejected", () => {
  const fixture = mkdtempSync(join(tmpdir(), "codex-critic-phase-protocol-"));
  try {
    const commentaryThenFinal = [
      { type: "agentMessage", phase: "commentary", text: "documented intermediate commentary" },
      { type: "agentMessage", phase: "final_answer", text: JSON.stringify(validCriticVerdict()) },
    ];
    const fake = writeFakeCriticAppServer(fixture, commentaryThenFinal);
    const green = runActualCriticChild(join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/scripts/codex-critic-app-server-child.mjs"), fake, fixture);
    assert.equal(green.status, 0, JSON.stringify(green));
    assert.equal(green.result.code, "answered");
    for (const legacyPhase of [undefined, null]) {
      const result = runActualCriticChild(join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/scripts/codex-critic-app-server-child.mjs"), writeFakeCriticAppServer(fixture, [
        { type: "agentMessage", ...(legacyPhase === undefined ? {} : { phase: legacyPhase }), text: JSON.stringify(validCriticVerdict()) },
      ]), fixture);
      assert.equal(result.status, 0, `legacy ${String(legacyPhase)} phase`);
      assert.equal(result.result.code, "answered", `legacy ${String(legacyPhase)} phase`);
    }
    for (const [name, items, options, expected, expectedWriteAttemptKind] of [
      ["duplicate final", [{ type: "agentMessage", phase: "final_answer", text: "{}" }, { type: "agentMessage", phase: "final_answer", text: "{}" }], {}, "protocol-error"],
      ["duplicate legacy unknown", [{ type: "agentMessage", text: "{}" }, { type: "agentMessage", text: "{}" }], {}, "protocol-error"],
      ["invalid phase", [{ type: "agentMessage", phase: "analysis", text: "{}" }], {}, "protocol-error"],
      ["mismatched IDs", [{ type: "agentMessage", phase: "final_answer", text: "{}" }], { itemTurnId: "wrong-turn" }, "protocol-error"],
      ["file change", [{ type: "fileChange", phase: "final_answer", text: "{}" }, { type: "agentMessage", phase: "final_answer", text: "{}" }], {}, "write-attempt", "file-change"],
      ["non-read command action", [{ type: "commandExecution", commandActions: [{ type: "write" }] }, { type: "agentMessage", phase: "final_answer", text: "{}" }], {}, "write-attempt", "command-action"],
      ["server RPC request", [{ type: "agentMessage", phase: "final_answer", text: "{}" }], { serverRequests: [{ id: 99, method: "item/approval/request", params: { opaque: "not-projected" } }] }, "write-attempt", "server-rpc-request"],
    ]) {
      const result = runActualCriticChild(join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/scripts/codex-critic-app-server-child.mjs"), writeFakeCriticAppServer(fixture, items, options), fixture);
      assert.equal(result.status, 2, name);
      assert.equal(result.result.code, expected, name);
      if (expectedWriteAttemptKind) assert.equal(result.result.observed.writeAttemptKind, expectedWriteAttemptKind, name);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

check("the actual child admits native-tools only after native policy, complete false feature readback, and an empty MCP inventory", () => {
  const fixture = mkdtempSync(join(tmpdir(), "codex-critic-native-tools-"));
  const childPath = join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/scripts/codex-critic-app-server-child.mjs");
  const finalItem = { type: "agentMessage", phase: "final_answer", text: JSON.stringify(validCriticVerdict()) };
  const completeFeatures = NATIVE_CRITIC_PROHIBITED_FEATURES.map((name) => ({ name, enabled: false }));
  const nativeGitPrefix = "git --no-optional-locks -c core.pager=cat --no-pager";
  const base = "9".repeat(40);
  const candidate = "c".repeat(40);
  const gitDiff = `${nativeGitPrefix} diff --no-ext-diff --no-textconv ${base} ${candidate} --`;
  const wrappedGitDiff = `bash -lc '${gitDiff}'`;
  try {
    const inheritedNativeEnvironment = {
      CODEX_SQLITE_HOME: join(fixture, "inherited-sqlite"),
      TMPDIR: join(fixture, "inherited-tmpdir"),
      TMP: join(fixture, "inherited-tmp"),
      TEMP: join(fixture, "inherited-temp"),
    };
    const nativeEnvironment = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [finalItem], {
      requireNativeWire: true, expectedEnvironment: inheritedNativeEnvironment,
    }), fixture, { native: true, env: { ...process.env, ...inheritedNativeEnvironment } });
    assert.equal(nativeEnvironment.status, 0, "native child retains the parent runtime environment");
    const legacyEnvironment = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [finalItem], {
      expectedEnvironment: {
        CODEX_SQLITE_HOME: fixture, TMPDIR: fixture, TMP: fixture, TEMP: fixture,
      },
    }), fixture, { env: { ...process.env, ...inheritedNativeEnvironment } });
    assert.equal(legacyEnvironment.status, 0, "legacy child isolates scratch runtime paths");

    const green = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [
      { type: "agentMessage", phase: "commentary", text: "bounded commentary" },
      { type: "commandExecution", command: wrappedGitDiff, commandActions: [{ type: "unknown", command: gitDiff }] },
      finalItem,
    ], {
      requireNativeWire: true,
      featurePages: [
        { data: completeFeatures.slice(0, 7), nextCursor: "next" },
        { data: completeFeatures.slice(7), nextCursor: null },
      ],
      discoveryMcpPages: [{ data: [{ name: "server-1" }], nextCursor: null }],
      mcpPages: [{ data: [{ runtimeStatus: "disabled", pluginId: null, serverInfo: null, tools: {}, resources: [], resourceTemplates: [] }], nextCursor: null }],
    }), fixture, { native: true });
    assert.equal(green.status, 0, JSON.stringify(green));
    assert.equal(green.result.schema, "pipeline.codex-native-critic-app-server-child.v1");
    assert.equal(green.result.code, "answered");
    assert.deepEqual(green.result.observed.requestedNativePolicy, { threadSandbox: "read-only", turn: { type: "readOnly", networkAccess: false } });
    assert.deepEqual(green.result.observed.observedThreadSandbox, { type: "readOnly", networkAccess: false });
    assert.equal(green.result.observed.observedThreadReasoningEffort, SELECTED_CRITIC_ROUTE.effort);
    assert.match(green.result.observed.toolSurface.configSha256, /^[a-f0-9]{64}$/);
    assert.equal(green.result.observed.toolSurface.mcpReductionCount, 1);
    assert.deepEqual(green.result.observed.toolSurface.featureSnapshot.pageCount, 2);
    assert.deepEqual(green.result.observed.mcpSnapshot, undefined);
    assert.deepEqual(green.result.observed.toolSurface.mcpSnapshot, { pageCount: 1, dataCount: 1, digest: green.result.observed.toolSurface.mcpSnapshot.digest });
    assert.match(green.result.observed.toolSurface.featureSnapshot.digest, /^[a-f0-9]{64}$/);
    assert.match(green.result.observed.toolSurface.mcpSnapshot.digest, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(green.result).includes("plugins"), false);
    assert.equal(JSON.stringify(green.result).includes("server-1"), false);

    for (const [name, command, actionCommand = command] of [
      ["candidate show", `${nativeGitPrefix} show --no-ext-diff --no-textconv ${candidate} --`],
      ["base rev-parse", `${nativeGitPrefix} rev-parse --verify ${base}^{commit}`],
      ["candidate tree rev-parse", `${nativeGitPrefix} rev-parse --verify ${candidate}^{tree}`],
      ["bound candidate tree rev-parse", `${nativeGitPrefix} rev-parse --verify ${"d".repeat(40)}`],
      ["bounded status", `${nativeGitPrefix} status --porcelain=v1 --untracked-files=no`],
    ]) {
      const result = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [
        { type: "commandExecution", command, commandActions: [{ type: "unknown", command: actionCommand }] }, finalItem,
      ], { requireNativeWire: true }), fixture, { native: true });
      assert.equal(result.status, 0, name);
      assert.equal(result.result.code, "answered", name);
    }

    for (const [name, command, commandActions, expectedWriteAttemptKind = "command-unknown-git"] of [
      ["external diff output", `${nativeGitPrefix} diff --no-ext-diff --no-textconv --output=/tmp/x ${base} ${candidate} -- roles/critic.md`, [{ type: "unknown", command: `${nativeGitPrefix} diff --no-ext-diff --no-textconv --output=/tmp/x ${base} ${candidate} -- roles/critic.md` }]],
      ["wrong base", `${nativeGitPrefix} diff --no-ext-diff --no-textconv ${candidate} ${base} -- roles/critic.md`, [{ type: "unknown", command: `${nativeGitPrefix} diff --no-ext-diff --no-textconv ${candidate} ${base} -- roles/critic.md` }]],
      ["unbound path", `${nativeGitPrefix} show --no-ext-diff --no-textconv ${candidate} -- README.md`, [{ type: "unknown", command: `${nativeGitPrefix} show --no-ext-diff --no-textconv ${candidate} -- README.md` }]],
      ["shell chain", `${nativeGitPrefix} status --porcelain=v1 --untracked-files=no && touch changed`, [{ type: "unknown", command: `${nativeGitPrefix} status --porcelain=v1 --untracked-files=no && touch changed` }]],
      ["wrapped shell chain", `bash -lc '${gitDiff}; touch changed'`, [{ type: "unknown", command: `${gitDiff}; touch changed` }]],
      ["action does not bind command", gitDiff, [{ type: "unknown", command: `${nativeGitPrefix} status --porcelain=v1 --untracked-files=no` }]],
      ["duplicate unknown actions", gitDiff, [{ type: "unknown", command: gitDiff }, { type: "unknown", command: gitDiff }], "command-action"],
    ]) {
      const result = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [
        { type: "commandExecution", command, commandActions }, finalItem,
      ], { requireNativeWire: true }), fixture, { native: true });
      assert.equal(result.status, 2, name);
      assert.equal(result.result.code, "write-attempt", name);
      assert.equal(result.result.observed.writeAttemptKind, expectedWriteAttemptKind, name);
    }

    const unknownNonGitRead = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [
      { type: "commandExecution", command: "cat roles/critic.md", commandActions: [{ type: "unknown", command: "cat roles/critic.md" }] }, finalItem,
    ], { requireNativeWire: true }), fixture, { native: true });
    assert.equal(unknownNonGitRead.status, 0);
    assert.equal(unknownNonGitRead.result.code, "answered");

    for (const [name, command, actionCommand] of [
      ["bound role contract", `cat ${join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/roles/critic.md")}`, `cat ${join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/roles/critic.md")}`],
      ["wrapped bound prompt contract", `bash -lc 'cat ${join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/templates/prompts/critic-review.md")}'`, `cat ${join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/templates/prompts/critic-review.md")}`],
      ["wrapped multiple candidate reads", "bash -lc 'cat plugins/pipeline-core/scripts/critic-verdict.schema.json plugins/pipeline-core/skills/pipeline-start/SKILL.md'", "cat plugins/pipeline-core/scripts/critic-verdict.schema.json plugins/pipeline-core/skills/pipeline-start/SKILL.md"],
      ["wrapped bound Python content read", `/bin/sh -c "from pathlib import Path\nprint(Path('${join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/roles/critic.md")}').read_text())"`, `from pathlib import Path\nprint(Path('${join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/roles/critic.md")}').read_text())`],
      ["semicolon-separated bound Python content read", `/bin/sh -c "from pathlib import Path; print(Path('${join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/roles/critic.md")}').read_text())"`, `from pathlib import Path; print(Path('${join(DEFAULT_PIPELINE_ROOT, "plugins/pipeline-core/roles/critic.md")}').read_text())`],
    ]) {
      const result = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [
        { type: "commandExecution", command, commandActions: [{ type: "unknown", command: actionCommand }] }, finalItem,
      ], { requireNativeWire: true }), fixture, { native: true });
      assert.equal(result.status, 0, name);
      assert.equal(result.result.code, "answered", name);
    }

    const unboundContentRead = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [
      { type: "commandExecution", command: "cat /etc/passwd", commandActions: [{ type: "unknown", command: "cat /etc/passwd" }] }, finalItem,
    ], { requireNativeWire: true }), fixture, { native: true });
    assert.equal(unboundContentRead.status, 2);
    assert.equal(unboundContentRead.result.code, "write-attempt");
    assert.equal(unboundContentRead.result.observed.writeAttemptKind, "command-unknown-cat");

    const unboundPythonRead = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [
      { type: "commandExecution", command: "/bin/sh -c \"from pathlib import Path\\nprint(Path('/etc/passwd').read_text())\"", commandActions: [{ type: "unknown", command: "from pathlib import Path\nprint(Path('/etc/passwd').read_text())" }] }, finalItem,
    ], { requireNativeWire: true }), fixture, { native: true });
    assert.equal(unboundPythonRead.status, 2);
    assert.equal(unboundPythonRead.result.code, "write-attempt");

    const emptyInventory = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, [finalItem], { requireNativeWire: true }), fixture, { native: true });
    assert.equal(emptyInventory.status, 0);
    assert.equal(emptyInventory.result.observed.toolSurface.mcpReductionCount, 0);
    assert.equal(emptyInventory.result.observed.toolSurface.mcpSnapshot.dataCount, 0);

    const onFeatures = completeFeatures.map((row) => ({ ...row })); onFeatures[0].enabled = true;
    const goalsOn = completeFeatures.map((row) => ({ ...row, ...(row.name === "goals" ? { enabled: true } : {}) }));
    const memoriesOn = completeFeatures.map((row) => ({ ...row, ...(row.name === "memories" ? { enabled: true } : {}) }));
    const tokenBudgetOn = completeFeatures.map((row) => ({ ...row, ...(row.name === "token_budget" ? { enabled: true } : {}) }));
    const duplicateFeatures = [...completeFeatures, { name: completeFeatures[0].name, enabled: false }];
    const cases = [
      ["wrong thread policy", { threadSandbox: { type: "externalSandbox", networkAccess: "enabled" } }, "protocol-error"],
      ["enabled feature", { featurePages: [{ data: onFeatures, nextCursor: null }] }, "protocol-error"],
      ["missing feature", { featurePages: [{ data: completeFeatures.slice(1), nextCursor: null }] }, "protocol-error"],
      ["enabled goals feature", { featurePages: [{ data: goalsOn, nextCursor: null }] }, "protocol-error"],
      ["enabled memories feature", { featurePages: [{ data: memoriesOn, nextCursor: null }] }, "protocol-error"],
      ["enabled token budget feature", { featurePages: [{ data: tokenBudgetOn, nextCursor: null }] }, "protocol-error"],
      ["missing goals feature", { featurePages: [{ data: completeFeatures.filter((row) => row.name !== "goals"), nextCursor: null }] }, "protocol-error"],
      ["missing memories feature", { featurePages: [{ data: completeFeatures.filter((row) => row.name !== "memories"), nextCursor: null }] }, "protocol-error"],
      ["missing token budget feature", { featurePages: [{ data: completeFeatures.filter((row) => row.name !== "token_budget"), nextCursor: null }] }, "protocol-error"],
      ["wrong observed thread effort", { threadReasoningEffort: "high" }, "protocol-error"],
      ["duplicate feature", { featurePages: [{ data: duplicateFeatures, nextCursor: null }] }, "protocol-error"],
      ["malformed feature page", { featurePages: [{ data: "not-an-array", nextCursor: null }] }, "protocol-error"],
      ["nonempty MCP with zero tools", { mcpPages: [{ data: [{ tools: {} }], nextCursor: null }] }, "protocol-error"],
      ["nonempty MCP without disabled status", { mcpPages: [{ data: [{ runtimeStatus: null, pluginId: null, serverInfo: null, tools: {}, resources: [], resourceTemplates: [] }], nextCursor: null }] }, "protocol-error"],
      ["enabled MCP after reduction", { mcpPages: [{ data: [{ runtimeStatus: "connected", pluginId: null, serverInfo: null, tools: {}, resources: [], resourceTemplates: [] }], nextCursor: null }] }, "protocol-error"],
      ["catalog MCP after reduction", { mcpPages: [{ data: [{ runtimeStatus: "disabled", pluginId: "fixture-plugin", serverInfo: null, tools: {}, resources: [], resourceTemplates: [] }], nextCursor: null }] }, "protocol-error"],
      ["malformed MCP page", { mcpPages: [{ data: "not-an-array", nextCursor: null }] }, "protocol-error"],
      ["native tool item", { items: [{ type: "mcpToolCall" }, finalItem] }, "write-attempt"],
      ["native server RPC", { serverRequests: [{ id: 77, method: "item/approval/request", params: {} }] }, "write-attempt"],
      ["native wrong item IDs", { itemTurnId: "wrong-turn" }, "protocol-error"],
    ];
    for (const [name, options, code] of cases) {
      const items = options.items ?? [finalItem];
      const result = runActualCriticChild(childPath, writeFakeCriticAppServer(fixture, items, { requireNativeWire: true, ...options }), fixture, { native: true });
      assert.equal(result.status, 2, name);
      assert.equal(result.result.schema, "pipeline.codex-native-critic-app-server-child.v1", name);
      assert.equal(result.result.code, code, name);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

await checkAsync("codex-critic-app-server consumer accepts a complete, valid child turn bound to the selected profile", async () => {
  let childRequest;
  const result = await invokeCodexCriticAppServer(criticPayload(), {
    buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
    spawnFn: fakeCriticSpawn(criticAnswered(), { code: 0, signal: null }, (request) => { childRequest = request; }),
  });
  assert.equal(result.status, "reviewed");
  assert.deepEqual(result.identity, { provider: "openai", modelId: SELECTED_CRITIC_ROUTE.model, effort: SELECTED_CRITIC_ROUTE.effort });
  assert.deepEqual(result.verdict, validCriticVerdict());
  assert.equal(result.sandboxExecution.terminal.cleanupStatus, "complete");
  assert.deepEqual(childRequest.referencePaths, ["roles/critic.md"]);
  assert.equal(childRequest.candidateCommit, "c".repeat(40));
});

await checkAsync("codex-critic-app-server consumer refuses before spawning on invalid selection, references or dispatch identity", async () => {
  const cases = [
    criticPayload({ sandboxTransport: { ...criticPayload().sandboxTransport, requested: { runner: "codex", model: SELECTED_CRITIC_ROUTE.model } } }),
    criticPayload({ sandboxTransport: { ...criticPayload().sandboxTransport, profile: { ...criticPayload().sandboxTransport.profile, network: { enabled: false } } } }),
    criticPayload({ sandboxTransport: { ...criticPayload().sandboxTransport, profile: { ...criticPayload().sandboxTransport.profile, scratchRootSha256: "9".repeat(64) } } }),
    criticPayload({ referencePaths: ["../outside"] }),
    criticPayload({ referencePaths: ["roles/does-not-exist.md"] }),
    criticPayload({ candidateCommit: "not-a-sha" }),
  ];
  for (const value of cases) {
    let spawned = false;
    await assert.rejects(invokeCodexCriticAppServer(value, { spawnFn: () => { spawned = true; } }));
    assert.equal(spawned, false);
  }
});

await checkAsync("codex-critic-app-server consumer never collapses a completed-but-invalid child into no-child evidence", async () => {
  const cases = [
    [criticAnswered({ observed: { ...criticAnswered().observed, model: "gpt-5.6-terra" } }), "route-mismatch"],
    [criticAnswered({ observed: { ...criticAnswered().observed, effort: "high" } }), "route-mismatch"],
    [{ ...criticAnswered(), ok: false, code: "protocol-error", answer: null }, "protocol-error"],
    [{ ...criticAnswered(), ok: false, code: "write-attempt", answer: null }, "write-attempt"],
    [criticAnswered({ observed: { ...criticAnswered().observed, stdinEnded: false } }), "lifecycle-invalid"],
    [criticAnswered({ observed: { ...criticAnswered().observed, cleanup: "incomplete" } }), "lifecycle-invalid"],
    [criticAnswered({ answer: "not json" }), "answer-json-invalid"],
    [criticAnswered({ answer: JSON.stringify(["not", "an", "object"]) }), "verdict-schema-invalid"],
    [criticAnswered({ answer: JSON.stringify({ ...validCriticVerdict(), pass: "yes" }) }), "verdict-schema-invalid"],
    [(() => { const r = criticAnswered(); delete r.observed.exitCode; return r; })(), "lifecycle-invalid"],
    [(() => { const r = criticAnswered(); delete r.observed; return r; })(), "route-mismatch"],
  ];
  for (const [result, expectedCode] of cases) {
    const actual = await invokeCodexCriticAppServer(criticPayload(), {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeCriticSpawn(result),
    });
    assert.equal(actual.status, "unavailable");
    assert.equal(actual.childStarted, true);
    assert.equal(actual.failureDiagnostic.child.code, expectedCode);
    assert.deepEqual(Object.keys(actual.failureDiagnostic).sort(), ["binding", "child", "outer", "schema"]);
    assert.equal(Object.hasOwn(actual.failureDiagnostic, "answer"), false);
    assert.equal(Object.hasOwn(actual.failureDiagnostic.outer, "stderr"), false);
  }
});

check("selectedCriticInProcessBridge exposes exactly {launch, finalize} to the sandbox runtime's hostBridge contract", () => {
  const bridgeInput = {
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT }, referencePaths: ["roles/critic.md"],
    dispatch: { candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    reviewBase: "9".repeat(40),
  };
  const built = selectedCriticInProcessBridge(bridgeInput, { route: selectedRouteFor(bridgeInput) });
  assert.deepEqual(Object.keys(built.bridge).sort(), ["finalize", "launch"]);
  assert.equal(typeof built.take, "function");
  assert.equal(Object.hasOwn(built.bridge, "take"), false);
});

await checkAsync("selectedCriticInProcessBridge.launch refuses drifted references, repository root or dispatch identity before invoking the consumer", async () => {
  const input = {
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT }, referencePaths: ["roles/critic.md"],
    dispatch: { candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    reviewBase: "9".repeat(40),
  };
  const baseLaunchRequest = () => ({
    selectionId: "css_test", duty: "critic",
    selection: { dispatch: { ...input.dispatch }, repoFingerprint: "b".repeat(64), toolchain: { cliSha256: "1".repeat(64) } },
    requested: { runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model },
    references: [...input.referencePaths],
    profile: { base: ":read-only", network: { enabled: true }, sha256: "2".repeat(64), scratchRootSha256: "3".repeat(64) },
    scratch: { path: "/tmp/x", sha256: "3".repeat(64), sandboxStateJson: "{}", sandboxStateSha256: "4".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" },
  });
  const drifted = [
    { ...baseLaunchRequest(), references: ["templates/prompts/critic-review.md"] },
    { ...baseLaunchRequest(), scratch: { ...baseLaunchRequest().scratch, repoRoot: "/tmp/somewhere-else" } },
    { ...baseLaunchRequest(), selection: { ...baseLaunchRequest().selection, dispatch: { ...input.dispatch, candidateCommit: "9".repeat(40) } } },
  ];
  for (const request of drifted) {
    let invoked = false;
    const built = selectedCriticInProcessBridge(input, { route: selectedRouteFor(input), invokeAppServer: async () => { invoked = true; return { status: "reviewed" }; } });
    await assert.rejects(built.bridge.launch(request), /drifted/);
    assert.equal(invoked, false);
  }
});

await checkAsync("selectedCriticInProcessBridge rejects a candidate-bound V3 source change before a model request while preserving the generic runner/model request shape", async () => {
  const input = {
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT }, referencePaths: ["roles/critic.md"],
    dispatch: { candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    reviewBase: "9".repeat(40),
  };
  const route = selectedRouteFor(input);
  let invoked = false;
  const built = selectedCriticInProcessBridge(input, {
    route,
    verifyRoute: () => ({ ...route, sourceSha256: "f".repeat(64) }),
    invokeAppServer: async () => { invoked = true; return { status: "reviewed" }; },
  });
  await assert.rejects(built.bridge.launch({
    selectionId: "css_test", duty: "critic",
    selection: { dispatch: { ...input.dispatch }, repoFingerprint: "b".repeat(64), toolchain: { cliSha256: "1".repeat(64) } },
    requested: { runner: route.runner, model: route.model }, references: [...input.referencePaths],
    profile: { base: ":read-only", network: { enabled: true }, sha256: "2".repeat(64), scratchRootSha256: "3".repeat(64) },
    scratch: { path: "/tmp/x", sha256: "3".repeat(64), sandboxStateJson: "{}", sandboxStateSha256: "4".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" },
  }), /authority drifted/);
  assert.equal(invoked, false);
});

function criticSelectionFixture(input) {
  const requestSha256 = buildSandboxRequest({
    repoFingerprint: "b".repeat(64), duty: "critic", queueRevision: 1, candidateCommit: input.dispatch.candidateCommit, candidateTree: input.dispatch.candidateTree,
    referenceSetSha256: input.dispatch.referenceSetSha256, runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model,
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

await checkAsync("runSelectedCriticHost composes the real in-process bridge and the real consumer end to end, faking only the child process and the generic selected-duty executor", async () => {
  const input = {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"],
    reviewBase: "9".repeat(40),
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT },
  };
  const selection = criticSelectionFixture(input);
  let childRequest;
  const transport = {
    resolveCriticRoute: ({ candidateCommit }) => ({ ...SELECTED_CRITIC_ROUTE, candidateCommit }),
    dependencies: {
      async executeSandboxedReadonlyDuty(request, dependencies) {
        assert.deepEqual(request.requested, { runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model });
        const launched = await dependencies.bridge.launch({
          selectionId: selection.selectionId, duty: "critic", selection, requested: request.requested, references: request.references, profile: selection.profile,
          scratch: { path: "/tmp/critic-scratch", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" },
        });
        const execution = await dependencies.bridge.finalize({ selection, launched, requested: request.requested, profile: selection.profile });
        return {
          status: "reviewed", childStarted: true, selectionId: selection.selectionId, selectionSha256: sandboxSelectionDigest(selection),
          executionReceiptSha256: sha256(JSON.stringify(execution)), dutyReceiptSha256: execution.dutyReceipt.sha256, assurance: selection.assurance,
        };
      },
    },
    invokeCodexCriticAppServer: (payload) => invokeCodexCriticAppServer(payload, {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeCriticSpawn(criticAnswered(), { code: 0, signal: null }, (request) => { childRequest = request; }),
    }),
  };
  const result = await runSelectedCriticHost(input, transport);
  assert.equal(result.ok, true);
  assert.equal(result.code, "reviewed");
  assert.deepEqual(result.verdict, validCriticVerdict());
  assert.equal(result.receipt.status, "reviewed");
  assert.equal(result.execution.dutyReceipt.schema, "pipeline.critic-receipt.v1");
  assert.equal(result.sandboxBinding.selectionId, selection.selectionId);
  assert.equal(childRequest.model, SELECTED_CRITIC_ROUTE.model);
  assert.equal(childRequest.effort, SELECTED_CRITIC_ROUTE.effort);
});

await checkAsync("selectedCriticInProcessBridge.finalize refuses when the selection or requested route drifted after a successful launch", async () => {
  const input = {
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT }, referencePaths: ["roles/critic.md"],
    dispatch: { candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    reviewBase: "9".repeat(40),
  };
  const selection = criticSelectionFixture(input);
  const built = selectedCriticInProcessBridge(input, { route: selectedRouteFor(input),
    invokeAppServer: (payload) => invokeCodexCriticAppServer(payload, {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeCriticSpawn(criticAnswered()),
    }),
  });
  const scratch = { path: "/tmp/critic-scratch", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" };
  const requested = { runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model };
  const launched = await built.bridge.launch({
    selectionId: selection.selectionId, duty: "critic", selection, requested, references: input.referencePaths, profile: selection.profile, scratch,
  });
  assert.equal(launched.childStarted, true);
  const driftedSelection = { ...selection, dispatch: { ...selection.dispatch, queueRevision: selection.dispatch.queueRevision + 1 } };
  await assert.rejects(built.bridge.finalize({ selection: driftedSelection, launched, requested }), /drifted/);
  await assert.rejects(built.bridge.finalize({ selection, launched, requested: { runner: "codex", model: "gpt-5.6-terra" } }), /drifted/);
  const execution = await built.bridge.finalize({ selection, launched, requested });
  assert.equal(execution.dutyReceipt.status, "reviewed");
});

await checkAsync("runSelectedCriticHost reports selected-sandbox-required when no selection/child is available", async () => {
  const input = {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"],
    reviewBase: "9".repeat(40),
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT },
  };
  const result = await runSelectedCriticHost(input, {
    resolveCriticRoute: ({ candidateCommit }) => ({ ...SELECTED_CRITIC_ROUTE, candidateCommit }),
    dependencies: { async executeSandboxedReadonlyDuty() { return { status: "unavailable", childStarted: false, selectionId: null }; } },
  });
  assert.deepEqual(result, { ok: false, code: "selected-sandbox-required", selectionId: null, sandboxBinding: null });
});

await checkAsync("runSelectedCriticHost reports selected-critic-transport-failed rather than collapsing a completed-but-invalid child into no-child evidence", async () => {
  const input = {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"],
    reviewBase: "9".repeat(40),
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT },
  };
  const failedAssurance = { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted" };
  const result = await runSelectedCriticHost(input, {
    resolveCriticRoute: ({ candidateCommit }) => ({ ...SELECTED_CRITIC_ROUTE, candidateCommit }),
    dependencies: {
      async executeSandboxedReadonlyDuty() {
        return {
          status: "error", childStarted: true, selectionId: "css_bbbbbbbbbbbbbbbbbbbbbbbbbi", selectionSha256: "1".repeat(64),
          executionReceiptSha256: "2".repeat(64), dutyReceiptSha256: "3".repeat(64), assurance: failedAssurance,
        };
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "selected-critic-transport-failed");
  assert.notEqual(result.sandboxBinding, null);
  assert.equal(result.sandboxBinding.selectionId, "css_bbbbbbbbbbbbbbbbbbbbbbbbbi");
});

await checkAsync("runSelectedCriticHost carries the real app-server failure projection from the selected bridge to the selected transport error without accepting caller-supplied diagnostic data", async () => {
  const input = {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"], reviewBase: "9".repeat(40), sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT },
  };
  const selection = criticSelectionFixture(input);
  const result = await runSelectedCriticHost(input, {
    resolveCriticRoute: ({ candidateCommit }) => ({ ...SELECTED_CRITIC_ROUTE, candidateCommit }),
    invokeCodexCriticAppServer: (payload) => invokeCodexCriticAppServer(payload, {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeCriticSpawn(criticAnswered({ answer: "not json" })),
    }),
    dependencies: {
      async executeSandboxedReadonlyDuty(request, dependencies) {
        const launched = await dependencies.bridge.launch({
          selectionId: selection.selectionId, duty: "critic", selection, requested: request.requested, references: request.references, profile: selection.profile,
          scratch: { path: "/tmp/critic-scratch", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" },
        });
        assert.equal(launched.childStarted, true);
        return {
          status: "error", childStarted: true, selectionId: selection.selectionId, selectionSha256: sandboxSelectionDigest(selection),
          executionReceiptSha256: "2".repeat(64), dutyReceiptSha256: "3".repeat(64), assurance: selection.assurance,
        };
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "selected-critic-transport-failed");
  assert.equal(result.failureDiagnostic.child.code, "answer-json-invalid");
  assert.deepEqual(result.failureDiagnostic.binding, {
    selectionId: selection.selectionId, selectionSha256: sandboxSelectionDigest(selection),
    candidateCommit: input.dispatch.candidateCommit, candidateTree: input.dispatch.candidateTree,
  });
  assert.equal(JSON.stringify(result.failureDiagnostic).includes("not json"), false);
  assert.deepEqual(Object.keys(result.failureDiagnostic.child).sort(), ["cleanup", "code", "exitCode", "initialized", "signal", "started", "stdinEnded", "threadStarted", "turnCompleted", "turnStarted", "writeAttemptKind"]);
});

// --- NVA-B-XPORTFIX-1: a spawn that never starts a child at all must reach
// the generic bridge as an observed childStarted:false, not undefined. An
// undefined observation is routed to postLaunchFailure() (a falsified
// "started, then lost stdio" receipt) instead of noChild() (an honest
// "never started" receipt), and it also inverts runSelectedCriticHost's two
// failure codes (selected-critic-transport-failed where
// selected-sandbox-required is true). ---

await checkAsync("codex-critic-app-server reports childStarted:false, not true, when the child never spawns at all (pins the upstream fact the fix below depends on)", async () => {
  const result = await invokeCodexCriticAppServer(criticPayload(), {
    buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
    spawnFn: fakeCriticSpawnFailure("ENOENT"),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.childStarted, false);
  assert.equal(result.failureDiagnostic.child.code, "outer-terminal");
  assert.equal(result.failureDiagnostic.outer.spawnFailed, true);
});

await checkAsync("selectedCriticInProcessBridge.launch reports a genuinely unstarted child as childStarted:false, not undefined -- this is the exact expression the generic bridge uses to tell noChild() apart from postLaunchFailure()", async () => {
  const input = {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"],
    reviewBase: "9".repeat(40),
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT },
  };
  // A fully valid selection is required here (unlike the "refuses drifted
  // ..." test above): every case there is rejected before launch() reaches
  // sandboxSelectionDigest(), so a minimal selection object never has to
  // survive validateSandboxSelection(). This case is not drifted, so it does.
  const selection = criticSelectionFixture(input);
  const built = selectedCriticInProcessBridge(input, { route: selectedRouteFor(input),
    invokeAppServer: async () => ({ status: "unavailable", childStarted: false }),
  });
  const launched = await built.bridge.launch({
    selectionId: selection.selectionId, duty: "critic", selection,
    requested: { runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model },
    references: [...input.referencePaths],
    profile: selection.profile,
    scratch: { path: "/tmp/x", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "4".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" },
  });
  assert.deepEqual(launched, { childStarted: false });
});

await checkAsync("the real runSandboxedReadonlyHostBridge resolves a genuinely unstarted child to noChild(), never postLaunchFailure(), driven with only its own dependencies (readSelection, readback, resolveScratch, resealScratch) and the real selected-Critic launch/finalize pair, faking only the process-spawn boundary", async () => {
  const input = {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"],
    reviewBase: "9".repeat(40),
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT },
  };
  const selection = criticSelectionFixture(input);
  const scratch = { path: "/tmp/critic-scratch", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" };
  const requested = { runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model };
  const built = selectedCriticInProcessBridge(input, { route: selectedRouteFor(input),
    invokeAppServer: (payload) => invokeCodexCriticAppServer(payload, {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeCriticSpawnFailure("ENOENT"),
    }),
  });
  let resealed = 0;
  const execution = await runSandboxedReadonlyHostBridge({
    selectionId: selection.selectionId, duty: "critic", requested, references: input.referencePaths,
  }, {
    readSelection: async (selectionId) => { assert.equal(selectionId, selection.selectionId); return selection; },
    readback: async ({ profile }) => profile,
    resolveScratch: async () => scratch,
    resealScratch: async () => { resealed += 1; },
    launch: built.bridge.launch,
    finalize: built.bridge.finalize,
  });
  assert.equal(execution.terminal.childStarted, false);
  assert.equal(execution.terminal.stdioStatus, "not-started");
  assert.equal(execution.terminal.cleanupStatus, "not-started");
  assert.deepEqual(execution.requested, requested);
  assert.deepEqual(execution.observed, { cliSha256: null, profileSha256: null, networkEnabled: null, scratchRootSha256: null });
  assert.equal(execution.dutyReceipt.status, "unavailable");
  // noChild() is returned directly on an observed childStarted:false launch
  // result; sandboxed-readonly-host-bridge.mjs only reseals scratch on a
  // launch throw or a finalize failure, neither of which happens here.
  assert.equal(resealed, 0);
});

await checkAsync("runSelectedCriticHost returns selected-sandbox-required, not selected-critic-transport-failed, when the real bridge chain observes no child started", async () => {
  const input = {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"],
    reviewBase: "9".repeat(40),
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT },
  };
  const selection = criticSelectionFixture(input);
  const scratch = { path: "/tmp/critic-scratch", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" };
  const transport = {
    resolveCriticRoute: ({ candidateCommit }) => ({ ...SELECTED_CRITIC_ROUTE, candidateCommit }),
    invokeCodexCriticAppServer: (payload) => invokeCodexCriticAppServer(payload, {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeCriticSpawnFailure("ENOENT"),
    }),
    dependencies: {
      // This stand-in performs exactly the translation the real
      // executeSandboxedReadonlyDuty applies at its own no-child branch
      // (sandboxed-readonly-host-bridge.mjs, around :208-210) around a call
      // to the REAL runSandboxedReadonlyHostBridge. The store/journal/
      // selectCodexSandbox layer above that stays undriven here -- see the
      // report's "what remains unproven".
      async executeSandboxedReadonlyDuty(request, dependencies) {
        const execution = await runSandboxedReadonlyHostBridge({
          selectionId: selection.selectionId, duty: "critic", requested: request.requested, references: request.references,
        }, {
          readSelection: async () => selection,
          readback: async ({ profile }) => profile,
          resolveScratch: async () => scratch,
          resealScratch: async () => {},
          launch: dependencies.bridge.launch,
          finalize: dependencies.bridge.finalize,
        });
        if (!execution.terminal.childStarted) {
          return { status: "unavailable", failureClass: "host-mode-unavailable", childStarted: false, selectionId: selection.selectionId, assurance: structuredClone(execution.assurance) };
        }
        throw new Error("test stand-in only covers the no-child branch");
      },
    },
  };
  const result = await runSelectedCriticHost(input, transport);
  assert.equal(result.ok, false);
  assert.equal(result.code, "selected-sandbox-required");
  assert.equal(result.selectionId, selection.selectionId);
});

// --- NVA-B-XPORTFIX-2: a child that completed (the app server's own terminal
// record says childStarted:true, exitCode:0, stdioStatus:"complete",
// cleanupStatus:"complete") but then fails the selected-host binding checks
// (identity/selection/dispatch, not the terminal shape) must not have that
// real observation discarded. selectedCriticInProcessBridge.launch() used to
// collapse this case to {childStarted: undefined}, which the generic,
// untouched runSandboxedReadonlyHostBridge routes to postLaunchFailure() --
// synthesizing exitCode:null/stdioStatus:"lost"/cleanupStatus:"pending" for a
// run that plainly finished. The duty receipt still has to report the
// failure (dutyReceipt.status:"error"); only the terminal must stop being
// falsified. ---

await checkAsync("selectedCriticInProcessBridge carries the app server's own observed terminal through to the persisted execution receipt when the child completed but a selected-host binding check failed, instead of postLaunchFailure()'s synthesized lost-stdio shape for a run that finished -- driven through the real, unedited runSandboxedReadonlyHostBridge so postLaunchFailure() would fire here if this branch regressed", async () => {
  const input = {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"],
    reviewBase: "9".repeat(40),
    sandboxRuntime: { repoRoot: DEFAULT_PIPELINE_ROOT },
  };
  const selection = criticSelectionFixture(input);
  const scratch = { path: "/tmp/critic-scratch", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot: input.sandboxRuntime.repoRoot, codexPath: "/codex" };
  const requested = { runner: SELECTED_CRITIC_ROUTE.runner, model: SELECTED_CRITIC_ROUTE.model };
  const built = selectedCriticInProcessBridge(input, { route: selectedRouteFor(input),
    // The app server observed a genuine completion but reports the wrong
    // model effort -- a binding fact this bridge must still refuse to
    // accept as a reviewed verdict, even though the child plainly ran.
    invokeAppServer: async ({ sandboxTransport }) => ({
      status: "reviewed",
      verdict: { pass: true, findings: [], summary: "ok" },
      identity: { provider: "openai", modelId: SELECTED_CRITIC_ROUTE.model, effort: "high" },
      sandboxExecution: {
        schema: "pipeline.codex-sandbox-host-execution.v1",
        selectionId: sandboxTransport.selectionId,
        selectionSha256: sandboxTransport.selectionSha256,
        repoFingerprint: sandboxTransport.repoFingerprint,
        duty: sandboxTransport.duty,
        dispatch: sandboxTransport.dispatch,
        observed: { cliSha256: sandboxTransport.toolchain.cliSha256, profileSha256: sandboxTransport.profile.sha256, networkEnabled: true, scratchRootSha256: sandboxTransport.profile.scratchRootSha256 },
        terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
      },
    }),
  });
  let resealed = 0;
  const execution = await runSandboxedReadonlyHostBridge({
    selectionId: selection.selectionId, duty: "critic", requested, references: input.referencePaths,
  }, {
    readSelection: async () => selection,
    readback: async ({ profile }) => profile,
    resolveScratch: async () => scratch,
    resealScratch: async () => { resealed += 1; },
    launch: built.bridge.launch,
    finalize: built.bridge.finalize,
  });
  assert.equal(execution.terminal.childStarted, true);
  assert.equal(execution.terminal.exitCode, 0);
  assert.equal(execution.terminal.stdioStatus, "complete");
  assert.equal(execution.terminal.cleanupStatus, "complete");
  assert.equal(execution.dutyReceipt.status, "error");
  assert.equal(resealed, 1);
});

// --- NVA-B-XPORTROOT-1: the adapter resolves its ruleset from the executing
// plugin root, not three levels up, so an installed marketplace copy (which
// has no repo-root roles/templates to coincidentally land on) still finds
// its own vendored roles/critic.md, templates/prompts/critic-review.md and
// scripts/critic-verdict.schema.json. ---

await checkAsync("codex-critic-app-server resolves its ruleset against the executing plugin root, not the repository root, under an installed runner-cache layout", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-critic-app-server-installed-"));
  try {
    const installedPluginRoot = join(fixtureRoot, "cache", "agent-pipeline", "pipeline-core", "0.6.1-local");
    mkdirSync(dirname(installedPluginRoot), { recursive: true });
    cpSync(join(DEFAULT_PIPELINE_ROOT, "plugins", "pipeline-core"), installedPluginRoot, { recursive: true });
    // Sanity: this layout mirrors the runner cache shape
    // <cache>/<marketplace>/<plugin>/<version>/, with no plugins/pipeline-core
    // segment above the plugin root -- the pre-fix three-levels-up anchor from
    // <pluginRoot>/scripts is <tmp>/cache/agent-pipeline, where none of the
    // three ruleset references exists, so the negative control covers all
    // three.
    const preFixAnchor = join(fixtureRoot, "cache", "agent-pipeline");
    for (const missing of [
      join(preFixAnchor, "roles"),
      join(preFixAnchor, "templates"),
      join(preFixAnchor, "plugins", "pipeline-core", "scripts", "critic-verdict.schema.json"),
      join(fixtureRoot, "roles"),
      join(fixtureRoot, "templates"),
      join(fixtureRoot, "plugins", "pipeline-core", "scripts", "critic-verdict.schema.json"),
    ]) {
      assert.equal(existsSync(missing), false, `installed-layout fixture must not contain ${missing}`);
    }
    const installedModuleUrl = pathToFileURL(join(installedPluginRoot, "scripts", "codex-critic-app-server.mjs")).href;
    const installedModule = await import(installedModuleUrl);
    const result = await installedModule.invokeCodexCriticAppServer(criticPayload(), {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeCriticSpawn(criticAnswered()),
    });
    assert.equal(result.status, "reviewed");
    assert.deepEqual(result.verdict, validCriticVerdict());
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
