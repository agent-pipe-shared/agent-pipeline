// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

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
  prepareNativeCritic,
  readJsonBounded,
  sha256,
  validateCriticRequest,
  validateHostReturn,
} from "./codex-critic-host.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";

let passed = 0;
const RULESET_PATHS = [
  "roles/critic.md",
  "templates/prompts/critic-review.md",
  "plugins/pipeline-core/config/routing-authority.json",
  "plugins/pipeline-core/config/runner-mappings.json",
  "plugins/pipeline-core/lib/routing-projection.mjs",
  "plugins/pipeline-core/lib/review-economy.mjs",
  "plugins/pipeline-core/lib/schema-lite.mjs",
  "plugins/pipeline-core/lib/yaml-lite.mjs",
  "plugins/pipeline-core/lib/manifest.mjs",
  "plugins/pipeline-core/lib/critic-packet-governance.mjs",
  "plugins/pipeline-core/scripts/codex-critic-dispatch.schema.json",
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
  run("git", ["add", ".gitignore", ".claude/pipeline.json", "verify.mjs", "specs/review.md", "policies/guard.md", ...RULESET_PATHS], root);
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
      requested_alias: "fable",
      requested_effort: "xhigh",
      resolved_model: "gpt-5.6-sol",
      resolved_effort: "xhigh",
      route_source: "project-duty+coordinator",
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

check("prepare emits fixed native Sol/xhigh route", () => {
  assert.equal(preparedResult.model, "gpt-5.6-sol");
  assert.equal(preparedResult.effort, "xhigh");
  assert.equal(prepared.route.duty, "criticNormal");
  assert.equal(prepared.hostContract.forkTurns, "none");
  assert.equal(prepared.assurance, T1_ASSURANCE);
  assert.deepEqual(prepared.request.normal_lane_authorization, legacyRequest.normal_lane_authorization);
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

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
