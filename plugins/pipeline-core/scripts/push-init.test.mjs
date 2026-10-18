#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for push-init.mjs (NVA-V4-PUSHDRIVER).
 *
 * Fixtures live under temporary directories (`scratch/push-init-*`), never against the real
 * repository state, EXCEPT the one test explicitly marked "real repo" below -- mirroring
 * push-prepare.test.mjs's own D3 exception: it runs check-doc-reconciliation.mjs for real,
 * as a real subprocess, against this repository's own real HEAD, to prove the one genuinely
 * spawned step actually runs end to end rather than merely being spelled correctly.
 *
 * `satisfiabilityDeps`/`prepareDeps` mirror push-prepare.test.mjs's own `readyDeps()` idiom
 * exactly (mocked git/filesystem/PO-approval-directory reads), so "all preconditions met"
 * never needs a real Git working tree with real evidence files or a real PO approval
 * directory.
 *
 * Run: node --test plugins/pipeline-core/scripts/push-init.test.mjs
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildPushInitArgv, buildReconciliationArgv, driveCheckpointPushInit, drivePushInit, main, parseArgs, RECONCILIATION_SCRIPT_RELATIVE_PATH } from "./push-init.mjs";
import { observeCurrentPlanApprovalForCalibration, readState, run as pipelineStateRun } from "./pipeline-state.mjs";
import { compileDecisionSummary } from "./architecture-baseline.mjs";
import { checkVerifyContractConfigured } from "./push-gate-satisfiability.mjs";
import { verifyEvidenceFixture } from "../lib/verify-selection-fixture.mjs";
import { fixtureGit } from "./architecture-adoption-test-fixture.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../lib/architecture-map-scaffold.mjs";
import { createDesignReviewReceipt } from "../lib/design-review-receipt.mjs";
import { validateFeaturePackage } from "../lib/feature-package-topology.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { NEUTRAL_MANIFEST } from "../lib/project-authority.mjs";
import { derivePlanLifecycle } from "../lib/plan-spec-state-v2.mjs";
import * as po from "../lib/po-gate-authority.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";
import { createWindowsOwnedAuthorityDirectory, createWindowsOwnedAuthorityExclusiveFile } from "../lib/windows-owned-authority-backend.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE_DIR = mkdtempSync(join(SCRATCH, "push-init-"));
after(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

const HEAD = "1a757618133eb27b62f1e427b2fb55895da42d85";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

test("parseArgs: accepts a well-formed --root/--by/--remote/--destination, --base optional", () => {
  const full = parseArgs(["--root", "/x", "--by", "t", "--remote", "origin", "--destination", "refs/heads/main"]);
  assert.equal(full.error, undefined);
  assert.equal(full.base, undefined);
  const withBase = parseArgs(["--root", "/x", "--by", "t", "--remote", "origin", "--destination", "refs/heads/main", "--base", "HEAD~1"]);
  assert.equal(withBase.base, "HEAD~1");
});

test("parseArgs: refuses a missing required flag", () => {
  assert.ok(parseArgs(["--by", "t", "--remote", "origin", "--destination", "refs/heads/main"]).error);
  assert.ok(parseArgs(["--root", "/x", "--remote", "origin", "--destination", "refs/heads/main"]).error);
});

test("parseArgs: refuses an unknown argument and a flag with no value", () => {
  assert.ok(parseArgs(["--root", "/x", "--by", "t", "--remote", "origin", "--destination", "refs/heads/main", "--nope", "x"]).error);
  assert.ok(parseArgs(["--root", "/x", "--by"]).error);
});

test("parseArgs: accepts the explicit checkpoint selector without weakening the ordinary path", () => {
  const parsed = parseArgs(["--root", "/x", "--by", "t", "--remote", "origin", "--destination", "refs/heads/feat/checkpoint", "--checkpoint"]);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.checkpoint, true);
});

// ---------------------------------------------------------------------------
// buildPushInitArgv / buildReconciliationArgv -- shape sanity (guard-admission is proven
// against these same functions in guard-lifecycle-ready.test.mjs, NVA-V4-PUSHDRIVER)
// ---------------------------------------------------------------------------

test("buildPushInitArgv: preserves every optional reconciliation selector in a retry", () => {
  const withoutBase = buildPushInitArgv({ root: "/x", by: "t", remote: "origin", destination: "refs/heads/main" });
  assert.equal(withoutBase.includes("--base"), false);
  const withSelectors = buildPushInitArgv({
    root: "/x", by: "t", remote: "origin", destination: "refs/heads/main",
    base: "HEAD~1", candidate: "candidate-S", recordRef: "record-R",
  });
  assert.deepEqual(withSelectors.slice(-6), ["--base", "HEAD~1", "--candidate", "candidate-S", "--record-ref", "record-R"]);
});

test("driveCheckpointPushInit: accepts only the configured exact feature source/destination with clean candidate and intent", () => {
  const run = (_command, argv) => {
    const last = argv.at(-1);
    if (argv.includes("symbolic-ref")) return { status: 0, stdout: "refs/heads/feat/checkpoint\n" };
    if (argv.includes("status")) return { status: 0, stdout: "" };
    if (last === "HEAD") return { status: 0, stdout: "remote backup before refactor\n" };
    throw new Error(`unexpected argv: ${JSON.stringify(argv)}`);
  };
  const load = () => ({
    status: "ok",
    manifest: {
      gates: { push: { mode: "blocking", type: "human", approval: "required" } },
      pushDestinationPolicy: { schema: "pipeline.push-destination-policy.v1", checkpointNamespace: "refs/heads/feat/" },
    },
  });
  const ready = driveCheckpointPushInit({ rootDir: "/fixture", by: "tester", remote: "origin", destination: "refs/heads/feat/checkpoint", run, load });
  assert.equal(ready.outcome, "checkpoint-ready", JSON.stringify(ready));
  assert.equal(ready.gitPushLine, "git -C /fixture push origin refs/heads/feat/checkpoint:refs/heads/feat/checkpoint");
  const quotedRoot = driveCheckpointPushInit({ rootDir: "/fixture with space", by: "tester", remote: "origin", destination: "refs/heads/feat/checkpoint", run, load });
  assert.equal(quotedRoot.outcome, "checkpoint-ready", JSON.stringify(quotedRoot));
  assert.equal(quotedRoot.gitPushLine, "git -C '/fixture with space' push origin refs/heads/feat/checkpoint:refs/heads/feat/checkpoint");
  const protectedDestination = driveCheckpointPushInit({ rootDir: "/fixture", by: "tester", remote: "origin", destination: "refs/heads/main", run, load });
  assert.equal(protectedDestination.outcome, "precondition-unmet");
  assert.equal(protectedDestination.checks.find((check) => check.id === "checkpoint-destination").ok, false);
});

test("driveCheckpointPushInit: absent or off push gate fails closed", () => {
  const run = (_command, argv) => {
    if (argv.includes("symbolic-ref")) return { status: 0, stdout: "refs/heads/feat/checkpoint\n" };
    if (argv.includes("status")) return { status: 0, stdout: "" };
    return { status: 0, stdout: "remote backup\n" };
  };
  const policy = { schema: "pipeline.push-destination-policy.v1", checkpointNamespace: "refs/heads/feat/" };
  for (const manifest of [
    { pushDestinationPolicy: policy },
    { gates: { push: { mode: "off", type: "human", approval: "required" } }, pushDestinationPolicy: policy },
  ]) {
    const result = driveCheckpointPushInit({ rootDir: "/fixture", by: "tester", remote: "origin", destination: "refs/heads/feat/checkpoint", run, load: () => ({ status: "ok", manifest }) });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks.find((check) => check.id === "checkpoint-push-gate").ok, false);
  }
});

test("driveCheckpointPushInit: unsafe command inputs never reach checkpoint-ready", () => {
  const run = (_command, argv) => {
    if (argv.includes("symbolic-ref")) return { status: 0, stdout: "refs/heads/feat/checkpoint\n" };
    if (argv.includes("status")) return { status: 0, stdout: "" };
    return { status: 0, stdout: "remote backup\n" };
  };
  const load = () => ({ status: "ok", manifest: { gates: { push: { mode: "blocking", type: "human", approval: "required" } }, pushDestinationPolicy: { schema: "pipeline.push-destination-policy.v1", checkpointNamespace: "refs/heads/feat/" } } });
  for (const [remote, destination] of [["origin;touch", "refs/heads/feat/checkpoint"], ["origin", "refs/heads/feat/checkpoint with-space"], ["origin", "refs/heads/feat/"]]) {
    const result = driveCheckpointPushInit({ rootDir: "/fixture", by: "tester", remote, destination, run, load });
    assert.notEqual(result.outcome, "checkpoint-ready");
    assert.equal(Object.hasOwn(result, "gitPushLine"), false);
  }
});

test("buildReconciliationArgv: candidate and record-ref are explicit caller inputs, never invented (NVA-B-PUSHINIT-1)", () => {
  const withoutRecordRef = buildReconciliationArgv({ scriptPath: "/x/check-doc-reconciliation.mjs", base: "HEAD~1", candidate: "abc123", root: "/proj" });
  assert.deepEqual(withoutRecordRef, ["/x/check-doc-reconciliation.mjs", "--base", "HEAD~1", "--candidate", "abc123", "--root", "/proj"]);
  const withRecordRef = buildReconciliationArgv({ scriptPath: "/x/check-doc-reconciliation.mjs", base: "HEAD~1", candidate: "abc123", root: "/proj", recordRef: "HEAD" });
  assert.deepEqual(withRecordRef, ["/x/check-doc-reconciliation.mjs", "--base", "HEAD~1", "--candidate", "abc123", "--root", "/proj", "--record-ref", "HEAD"]);
});

// ---------------------------------------------------------------------------
// drivePushInit -- deps fixtures (mirrors push-prepare.test.mjs's readyDeps())
// ---------------------------------------------------------------------------

function satisfiabilityDepsAllGreen(overrides = {}) {
  return {
    resolveHeadCommit: () => HEAD,
    exists: (path) => path.endsWith("push-threat-model.md") || path.endsWith("trust-policy.json"),
    readFile: (path) => {
      if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "k", publicKeySha256: "a".repeat(64), humanName: "Tester" });
      if (path.endsWith("verify-latest.json")) return JSON.stringify(verifyEvidenceFixture(HEAD));
      if (path === "/fake/calibration.json") return JSON.stringify({ verify: "node harness/scripts/verify.mjs" });
      throw new Error(`unexpected read: ${path}`);
    },
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "/fake/calibration.json" }),
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [] }),
    parseHumanArgs: () => ({ directory: "/external/po-dir" }),
    resolveGitCommonDir: () => null,
    now: () => new Date("2026-08-16T20:00:00.000Z"),
    ...overrides,
  };
}

function prepareDepsAllGreen(overrides = {}) {
  return {
    gitHead: () => HEAD,
    gitStatus: () => "",
    exists: (path) => path.endsWith("push-threat-model.md") || path.endsWith("trust-policy.json"),
    readFile: (path) => {
      if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "k", publicKeySha256: "a".repeat(64), humanName: "Tester" });
      if (path.endsWith("verify-latest.json")) return JSON.stringify(verifyEvidenceFixture(HEAD));
      if (path.endsWith("security-latest.json")) return JSON.stringify({ exitCode: 0, commit: HEAD });
      throw new Error(`unexpected read: ${path}`);
    },
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [] }),
    parseHumanArgs: () => ({ directory: "/external/po-dir" }),
    readState: () => ({ status: "ok", state: { activeFeature: { id: "nova-push-init", planPath: "specs/sprint-nova-epic/plans/nova-push-init.md" } } }),
    gitCommonDir: () => "/external/po-dir/.fake-common",
    derivePoGateRepositoryFingerprint: () => "0123456789ab",
    now: () => new Date("2026-08-16T20:00:00.000Z"),
    pipelineStateRun: () => {
      console.log(JSON.stringify({ schema: "pipeline.push-subject-preview.v1", subjectSha256: "7fefc0ada3b7726f39460bf7e001ed4b71ad66c173f0132d00fcbd0648f5601a" }));
      return 0;
    },
    // Deliberately NOT overridden: the REAL authorizeCriticalPushCommand (po-human-
    // approval.mjs) must be what builds the presented signature command, or the
    // "never driver-executable" property this suite checks would prove nothing real.
    ...overrides,
  };
}

function freshFixtureRoot() {
  return mkdtempSync(join(SCRATCH, "push-init-case-"));
}

function writeLateVerifyFixture(root) {
  const verify = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";
  const calibration = { project: "push-init-late-verify", verify, handover: "docs/state.md" };
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "push-init-late-verify", planPath: "specs/push-init-late-verify/prd.md", phase: "design" },
    planApproved: true,
    planApproval: { approvedBy: "PO", approvedAt: "2026-09-18T12:00:00.000Z" },
  }, null, 2));
}

// configure-verify refuses (CVCT-APPROVAL-UNAVAILABLE) unless the genuine plan-approval reader sees an eligible,
// candidate-bound approval, so a hand-written State cannot stand in for it. This fixture reaches the approved
// implementation State through the PUBLIC step sequence only (set-feature, continuity-init, submit-plan,
// present-plan, approve-plan, materialize-architecture, package validation, set-phase implementation). It is the
// minimum of lib/pins/configure-verify-output-lacks-a-walkable-commit-route.test.mjs fixture(), copied rather than
// imported: every approval, submission, authority and accepted-contract record is written by its real producer.
// The approval mode is `chat` (a committed pipeline.user.yaml); no proof is ever signed.
const LIFECYCLE_AT = "2026-10-10T10:00:00.000Z";
const LIFECYCLE_NOW = "2026-10-16T12:00:00.000Z";
const LIFECYCLE_SEEDED_VERIFY = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";
const LIFECYCLE_TWINS = ["project/pipeline.json", ".claude/pipeline.json"];
const LIFECYCLE_FEATURE = "e2e";
const LIFECYCLE_PLAN = "specs/e2e/prd_e2e.md";
const LIFECYCLE_SPEC = "specs/e2e/spec.md";
const LIFECYCLE_COMPANIONS = ["specs/e2e/design.md", "specs/e2e/traceability.md"];
const LIFECYCLE_REPORT = "specs/e2e/review/design-review-1.md";
const LIFECYCLE_RECEIPT = "specs/e2e/review/design-review-receipt-1.json";
const LIFECYCLE_ARCHITECTURE = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "src/", "tests/"], rationale: "Synthetic scoped method fixture; no new material decision" }, modules: [{ id: "unit", responsibility: "Own synthetic unit", nonResponsibilities: ["No external authority"], ownedPaths: ["src/**", "tests/**"], publicContracts: ["src/index.mjs"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/unit.test.mjs"], adrReferences: [] }], implementationSurface: ["src/index.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "synthetic-unit", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { decision: "bounded" } } };

// `parent` is an exclusively owned, realpath'd directory; the repository is `<parent>/repo`. The caller restores
// GIT_CEILING_DIRECTORIES, which this sets so no git call in this process can resolve above the fixture.
function provisionApprovedImplementationFixture(parent) {
  const digestHex = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const root = join(parent, "repo");
  mkdirSync(root);
  process.env.GIT_CEILING_DIRECTORIES = parent;
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent };
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 60000, env });
  const gitOk = (...args) => { const out = git(...args); assert.equal(out.status, 0, `SETUP git ${args[0]}: ${out.stderr}`); return out.stdout.trim(); };
  const write = (path, bytes) => { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); };
  const read = (path) => readFileSync(join(root, path));
  const writeJson = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);
  // The repository is initialised BEFORE the first git write, so no git call can ever resolve above the fixture.
  gitOk("init", "-q", "-b", "main");
  gitOk("config", "user.email", "goldfish@example.invalid");
  gitOk("config", "user.name", "Goldfish");
  gitOk("config", "core.autocrlf", "false");
  assert.equal(realpathSync(root), root);
  assert.equal(realpathSync(gitOk("rev-parse", "--show-toplevel")), root, "the fixture is its own repository");
  const lifecycle = (argv) => {
    const logs = [];
    const old = { log: console.log, error: console.error, warn: console.warn };
    for (const name of Object.keys(old)) console[name] = (...args) => { logs.push(args.map(String).join(" ")); };
    let status;
    try { status = pipelineStateRun(argv, { dir: root, now: () => LIFECYCLE_AT }); } finally { Object.assign(console, old); }
    assert.equal(status, 0, `SETUP ${argv[0]}: ${logs.join("\n")}`);
  };

  write("README.md", "Synthetic push-init late-verify fixture\n");
  write(".gitignore", "scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  const baseline = { schema: "pipeline.project.v1", project: "push-init-late-verify", verify: LIFECYCLE_SEEDED_VERIFY, autonomy: "gated", handover: "docs/state.md" };
  for (const twin of LIFECYCLE_TWINS) writeJson(twin, baseline);
  gitOk("add", "--", "README.md", ".gitignore", ...LIFECYCLE_TWINS);
  gitOk("commit", "-q", "-m", "seed baseline verification");
  // Enroll BEFORE the State file exists: a present project/pipeline-state.json is "retained enrollment history"
  // (governance-scope.mjs enrollmentHistory) and would turn this activation into a declined retirement route.
  const governance = createGovernanceScopeController({ hostStateRoot: join(parent, "host-state") });
  const enrollment = governance.planDecision({ rootDir: root, decision: "enroll", by: "push-init-fixture" });
  assert.equal(governance.applyDecision(enrollment, { activate: true, planSha256: enrollment.planSha256 }).state, "active", "SETUP real governance decision");
  write("pipeline.user.yaml", "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\ngates:\n  human_approval: chat\n");
  gitOk("add", "--", "pipeline.user.yaml");
  gitOk("commit", "-q", "-m", "selected approval mode");
  write(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");
  write(NEUTRAL_MANIFEST, read(".claude/pipeline.yaml"));
  for (const target of initialGreenfieldMapTargets("fresh")) write(target.path, target.bytes);
  const pointer = initialGreenfieldAgentEntryTarget("fresh");
  write(pointer.path, pointer.bytes);
  write("docs/adr/.gitkeep", "");
  write("specs/e2e/acceptance.md", "# Synthetic acceptance\n");
  write("specs/e2e/result.md", "# Synthetic result\n");
  write(LIFECYCLE_SPEC, "# Synthetic Test Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | The package must receive a PASS verdict from an independent Critic before acceptance. | Synthetic candidate-bound review |\n");
  write(LIFECYCLE_PLAN, `${po.PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${po.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${digestHex(read(LIFECYCLE_SPEC))} -->\n# Synthetic Test PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(LIFECYCLE_ARCHITECTURE)}\n\`\`\`\n`);
  write(LIFECYCLE_COMPANIONS[0], "# Synthetic Design\n");
  write(LIFECYCLE_COMPANIONS[1], "| ID | Evidence |\n| --- | --- |\n");
  write(LIFECYCLE_REPORT, "# Synthetic method review\nVerdict: pass.\n");
  // The profile receipt is written by the real po-gate producer, bound to this repository's exact path.
  const common = join(root, ".git");
  const profile = po.createPoGateProfileReceipt({ repositoryFingerprint: po.derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: root }), primaryRoot: root, sourceBytes: read("pipeline.user.yaml"), runtimeBytes: read(".claude/pipeline.yaml"), updatedAt: LIFECYCLE_AT });
  const profilePath = resolve(po.poGateProfileReceiptPath(common));
  if (process.platform === "win32") {
    // On win32 the session-authority boundary inspects .git/agent-pipeline as a private-owned path (protected DACL);
    // the source-owned creators below are what production uses for that private custody.
    createWindowsOwnedAuthorityDirectory({ path: join(common, "agent-pipeline") });
    createWindowsOwnedAuthorityDirectory({ path: dirname(profilePath) });
    createWindowsOwnedAuthorityExclusiveFile({ path: profilePath, bytes: Buffer.from(po.serializePoGateProfileReceipt(profile)) });
  } else {
    mkdirSync(dirname(profilePath), { recursive: true, mode: 0o700 });
    writeFileSync(profilePath, po.serializePoGateProfileReceipt(profile), { mode: 0o600 });
  }
  const source = (path) => ({ path, sha256: digestHex(read(path)) });
  const review = createDesignReviewReceipt({ featureId: LIFECYCLE_FEATURE, previous: null, sources: { prd: source(LIFECYCLE_PLAN), spec: source(LIFECYCLE_SPEC), companions: LIFECYCLE_COMPANIONS.map(source) }, reviewer: { runner: "claude", model: "claude-opus-4" }, report: source(LIFECYCLE_REPORT), openFindingIds: [], reviewedAt: LIFECYCLE_AT });
  assert.ok(review.ok, `SETUP actual review producer: ${review.code}`);
  write(LIFECYCLE_RECEIPT, Buffer.from(review.bytes));
  // Only the PUBLIC half of a throwaway key is used: the policy needs a trust anchor, no proof is ever signed.
  const publicKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  writeJson("project/critical-human-proof.json", { schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "synthetic-push-init-key", publicKeySha256: digestHex(publicKey) }] });
  gitOk("add", "--", LIFECYCLE_PLAN, LIFECYCLE_SPEC, ...LIFECYCLE_COMPANIONS, LIFECYCLE_REPORT, LIFECYCLE_RECEIPT, "project/critical-human-proof.json", "specs/e2e/acceptance.md", "specs/e2e/result.md", "architecture/map/index.md", "architecture/map/inventory.json", "AGENTS.md", "docs/adr/.gitkeep", NEUTRAL_MANIFEST);
  gitOk("commit", "-q", "-m", "finished design");

  if (process.platform === "win32") {
    // The private State file inherits project/'s ACL; production hardens such directories before the State exists.
    const hardened = hardenWindowsPrivateDirectory(join(root, "project"));
    assert.equal(hardened.status, "secure", `SETUP harden the State parent: ${JSON.stringify(hardened)}`);
  }
  // The public lifecycle route, in order; each step is the real CLI verb.
  lifecycle(["set-feature", "--id", LIFECYCLE_FEATURE, "--plan-path", LIFECYCLE_PLAN]);
  const continuity = { schema: "pipeline.continuity.v0", featureId: LIFECYCLE_FEATURE, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: source(LIFECYCLE_PLAN), spec: source(LIFECYCLE_SPEC), result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  writeJson("continuity-init-request.json", continuity);
  lifecycle(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "push-init-fixture-token"]);
  lifecycle(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  lifecycle(["present-plan", "--by", "synthetic-presenter", "--review-receipt", LIFECYCLE_RECEIPT]);
  const readCurrent = () => { const observed = readState(root); assert.equal(observed.status, "ok"); return observed.state; };
  const requestPath = readCurrent().planPresentation.designApprovalRequestPath;
  const request = JSON.parse(read(requestPath));
  lifecycle(["approve-plan", "--by", "synthetic-po", "--design-approval-request", requestPath]);
  const approved = readCurrent();
  assert.equal(approved.planApproval.schema, "pipeline.plan-approval.v9");
  lifecycle(["materialize-architecture"]);
  const compiled = compileDecisionSummary(root, { now: LIFECYCLE_AT });
  assert.equal(compiled.count, 0);
  assert.equal(compiled.authorityStatus, "source-validated");
  const artifact = (kind, path, authority, mutability, retention) => ({ class: kind, path, sha256: digestHex(read(path)), authority, mutability, retention });
  // Synthetic project input, then the actual topology validator registers its real envelope.
  writeJson("specs/e2e/lifecycle.json", { schema: "pipeline.feature-package.v1", feature: { id: LIFECYCLE_FEATURE, rigor: 2 }, state: "approved", artifacts: [artifact("prd", LIFECYCLE_PLAN, true, "mutable", "active"), artifact("spec", LIFECYCLE_SPEC, true, "mutable", "active"), artifact("acceptance", "specs/e2e/acceptance.md", true, "mutable", "active"), artifact("result", "specs/e2e/result.md", true, "mutable", "active"), artifact("candidate-evidence", approved.planApproval.acceptedContract.path, false, "immutable", "retain")], candidate: structuredClone(request.approvalIntent.value.candidate), supersedes: null });
  const packageRead = validateFeaturePackage(root, "specs/e2e/lifecycle.json");
  assert.ok(packageRead.ok, `SETUP registered package: ${JSON.stringify(packageRead.findings)}`);
  lifecycle(["set-phase", "--phase", "implementation"]);
  assert.equal(derivePlanLifecycle(readCurrent()).status, "implementing");
  // The genuine approval reader must see this State as eligible BEFORE the test exercises configure-verify.
  const observed = observeCurrentPlanApprovalForCalibration({ rootDir: root });
  assert.equal(observed.status, "eligible", `SETUP genuine default approval reader: ${JSON.stringify(observed)}`);
  return root;
}

function pushInitGateReport() {
  return {
    ok: true,
    report: {
      satisfiable: true,
      checks: [{ id: "verify-contract-configured", status: "baseline-only", ok: true, message: "baseline contract" }],
    },
  };
}

function chatPrepareResult(humanApproval) {
  return {
    ok: true,
    report: { ready: true, humanApproval, checks: [] },
    lines: { authorize: [], approvePush: ["Step: agent approve-push", "chat confirmation"], gitPush: "Step: agent push" },
  };
}

// ---------------------------------------------------------------------------
// DoD 1: chains consecutive command steps without a human turn between them
// ---------------------------------------------------------------------------

test("drivePushInit: baseline-only implementation publishes configure-verify and proceeds after its exact apply action", () => {
  const root = freshFixtureRoot();
  const ceilingBefore = process.env.GIT_CEILING_DIRECTORIES;
  let lifecycleParent = null;
  try {
    writeLateVerifyFixture(root);
    fixtureGit(root, ["init", "-q"]);
    fixtureGit(root, ["add", "-A"]);
    fixtureGit(root, ["commit", "-qm", "fixture base", "--allow-empty"]);
    const missingReadiness = pipelineStateRun(["set-phase", "--phase", "implementation"], {
      dir: root,
      now: () => "2026-09-18T12:00:00.000Z",
    });
    assert.equal(missingReadiness, 2, "a late-verify fixture without architecture evidence must fail closed");
    // The positive path runs on a repository whose approved implementation State was reached through the
    // product's own lifecycle writers (set-phase implementation included, with no readiness stub).
    lifecycleParent = realpathSync(mkdtempSync(join(tmpdir(), "push-init-lifecycle-")));
    const lifecycleRoot = provisionApprovedImplementationFixture(lifecycleParent);
    const stateDeps = {
      dir: lifecycleRoot,
      now: () => LIFECYCLE_NOW,
      // This test isolates the verify deadlock; architecture readiness has its
      // own physical-map and signed-authority coverage in pipeline-state tests.
      architectureEntryReadiness: () => ({ status: "ready" }),
    };

    const blocked = drivePushInit({
      rootDir: lifecycleRoot, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: {},
      assessPushGateSatisfiability: () => pushInitGateReport(),
      pushPrepareReport: () => ({ ok: true, report: { ready: false, checks: [{ id: "verify-evidence-bound", ok: false, message: "baseline has no release evidence" }] } }),
    });
    assert.equal(blocked.outcome, "precondition-unmet", JSON.stringify(blocked, null, 2));
    assert.equal(blocked.recovery.actions.length, 1);
    const action = blocked.recovery.actions[0];
    assert.equal(action.kind, "collect-input");
    assert.deepEqual(action.inputs.map((input) => input.name), ["verify-command"]);
    assert.equal(action.requiresConfirmation, false,
      "the push driver only collects the command at its read-only recovery boundary");
    assert.equal(action.applyAction.requiresConfirmation, true,
      "the exact protected calibration write requires fresh attended confirmation");
    assert.deepEqual(action.applyAction.argv.slice(1, 3), ["configure-verify", "--verify-command"],
      "push-init must return the sanctioned CLI action rather than a reconstructed shell command");
    assert.equal(action.applyAction.argv.slice(2).some((value) => String(value).includes("scratch") || String(value).includes("guard-human-override")), false,
      "the recovery arguments after the pipeline-state script have no scratch-file or HGO path");

    const command = `${process.execPath} --test harness/scripts/check-consumer-safe-paths.test.mjs`;
    assert.equal(pipelineStateRun(["configure-verify", "--verify-command", command], stateDeps), 0);
    assert.equal(checkVerifyContractConfigured(lifecycleRoot).ok, true,
      "the exact late recovery replaces the baseline contract for push readiness");
    const ready = drivePushInit({
      rootDir: lifecycleRoot, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: {},
      assessPushGateSatisfiability: () => pushInitGateReport(),
      pushPrepareReport: () => ({
        ok: true,
        report: { ready: true, subjectSha256: "a".repeat(64), checks: [] },
        lines: { authorize: ["human command"], approvePush: ["approve command"], gitPush: "git push" },
      }),
    });
    assert.equal(ready.outcome, "signature-required", JSON.stringify(ready, null, 2));
    assert.equal(Object.hasOwn(ready, "recovery"), false,
      "once configured, ordinary push-init can continue into its existing signature boundary");
  } finally {
    if (ceilingBefore === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = ceilingBefore;
    if (lifecycleParent !== null) rmSync(lifecycleParent, { recursive: true, force: true, maxRetries: 3 });
    rmSync(root, { recursive: true, force: true });
  }
});

test("drivePushInit: chains all three steps (reconciliation, gate-satisfiability, push-prepare) in one call, reaches signature-required", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture placeholder, never executed -- run is injected\n");
    let reconciliationCalls = 0;
    const run = (executable, argv) => {
      reconciliationCalls += 1;
      return { status: 0, stdout: "Doc reconciliation: fixture pass.\n", stderr: "" };
    };
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1", candidate: "HEAD",
      run, satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "signature-required", JSON.stringify(result, null, 2));
    assert.equal(reconciliationCalls, 1, "reconciliation must run exactly once, not zero, not repeated");
    assert.equal(result.steps.length, 3);
    assert.deepEqual(result.steps.map((step) => step.id), ["doc-reconciliation", "push-gate-satisfiability", "push-prepare"]);
    for (const step of result.steps) assert.equal(step.ok, true, JSON.stringify(step));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: blocking push with a declined, foreign, or absent pre-push backstop fails before approval preparation", () => {
  const root = freshFixtureRoot();
  try {
    for (const hookStatus of ["install", "decline", "foreign-owner", "unresolved"]) {
      let prepareCalls = 0;
      const result = drivePushInit({
        rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
        assessPushHookBackstop: () => ({
          blocking: true, backed: false, code: "UNBACKED_GATE",
          message: "UNBACKED_GATE: gates.push is blocking, but the generated pre-push backstop is not current.",
          remedy: "install or resolve ownership", hook: { status: hookStatus },
        }),
        pushPrepareReport: () => { prepareCalls += 1; throw new Error("must not prepare approval"); },
      });
      assert.equal(result.outcome, "precondition-unmet", hookStatus);
      assert.deepEqual(result.steps.map((step) => step.id), ["push-hook-backstop"]);
      assert.equal(result.checks[0].status, "UNBACKED_GATE");
      assert.equal(result.checks[0].hook.status, hookStatus);
      assert.equal(prepareCalls, 0, hookStatus);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: terminal-free global chat preparation returns chat-ready without signature ceremony", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(),
      prepareDeps: prepareDepsAllGreen({ readHumanApprovalMode: () => ({ mode: "chat", scope: "global" }) }),
      pushPrepareReport: () => chatPrepareResult("chat-attributed-unattested"),
    });
    assert.equal(result.outcome, "chat-ready", JSON.stringify(result));
    assert.equal(result.humanApproval, "chat-attributed-unattested");
    assert.deepEqual(result.approvePushLines, ["Step: agent approve-push", "chat confirmation"]);
    assert.equal(result.gitPushLine, "Step: agent push");
    assert.equal(Object.hasOwn(result, "signatureCommand"), false);
    assert.equal(Object.hasOwn(result, "followOn"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: legacy attended chat preparation returns chat-ready and preserves chat mode", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(),
      pushPrepareReport: () => chatPrepareResult("chat"),
    });
    assert.equal(result.outcome, "chat-ready", JSON.stringify(result));
    assert.equal(result.humanApproval, "chat");
    assert.deepEqual(result.approvePushLines, ["Step: agent approve-push", "chat confirmation"]);
    assert.equal(Object.hasOwn(result, "signatureCommand"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: signature preparation keeps the existing signature-required output", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "signature-required", JSON.stringify(result));
    assert.ok(result.signatureCommand.lines.length > 0);
    assert.equal(Object.hasOwn(result, "approvePushLines"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: precondition failure remains precondition-unmet and has no chat or signature terminal output", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      assessPushGateSatisfiability: () => ({ ok: true, report: { satisfiable: true, checks: [] } }),
      pushPrepareReport: () => ({ ok: true, report: { ready: false, checks: [{ id: "working-tree-clean", ok: false, message: "dirty" }] } }),
    });
    assert.equal(result.outcome, "precondition-unmet", JSON.stringify(result));
    assert.equal(Object.hasOwn(result, "signatureCommand"), false);
    assert.equal(Object.hasOwn(result, "approvePushLines"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("push-init CLI exit status accepts chat-ready and signature-required, but rejects precondition-unmet", () => {
  const args = ["--root", "/fixture", "--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"];
  for (const [outcome, expectedStatus] of [["chat-ready", 0], ["signature-required", 0], ["precondition-unmet", 1]]) {
    let stdout = "";
    const status = main(args, {
      write: (value) => { stdout += value; },
      writeError: () => {},
      drive: () => ({ schema: "pipeline.push-init.v1", outcome }),
    });
    assert.equal(status, expectedStatus, `${outcome}: ${stdout}`);
    assert.deepEqual(JSON.parse(stdout), { schema: "pipeline.push-init.v1", outcome });
  }
});

test("drivePushInit: reconciliation accepts WSL EPERM only after status zero, while non-zero and status-less results stop fail-closed", () => {
  const eperm = Object.assign(new Error("sandbox transport completed late"), { code: "EPERM" });
  const cases = [
    { run: () => ({ status: 0, stdout: "pass\n", stderr: "", error: eperm }), outcome: "signature-required" },
    { run: () => ({ status: 1, stdout: "", stderr: "failed" }), outcome: "precondition-unmet" },
    { run: () => ({ status: 2, stdout: "ADR-0001: unreconciled\n", stderr: "findings", error: eperm }), outcome: "precondition-unmet", retainedOutput: "findings\nADR-0001: unreconciled" },
    { run: () => ({ stdout: "", stderr: "missing status" }), outcome: "precondition-unmet" },
  ];
  for (const { run, outcome, retainedOutput } of cases) {
    const root = freshFixtureRoot();
    try {
      mkdirSync(join(root, "harness", "scripts"), { recursive: true });
      writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
      const result = drivePushInit({
        rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1", candidate: "HEAD",
        run, satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
      });
      assert.equal(result.outcome, outcome, JSON.stringify(result));
      if (retainedOutput) assert.equal(result.checks[0].message, retainedOutput);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("drivePushInit: layer 1b is skipped, not failed, when the project has no harness/scripts/check-doc-reconciliation.mjs", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "signature-required", JSON.stringify(result, null, 2));
    // No reconciliation step was pushed at all -- nothing to run against.
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: missing reconciliation base reports it with policy checks and stops before the later commit report", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks[0].id, "doc-reconciliation");
    assert.equal(result.checks[0].status, "base-required");
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: harness/scripts/check-doc-reconciliation.mjs present, --base supplied but --candidate omitted reports that precondition and never invents HEAD (NVA-B-PUSHINIT-1)", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks[0].id, "doc-reconciliation");
    assert.equal(result.checks[0].status, "candidate-required");
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// DoD 2 -- THE MOST IMPORTANT PROPERTY: the driver stops at the signature and cannot
// pass it. Guard-level backstop for the exact same command lives in
// guard-lifecycle-ready.test.mjs (NVA-V4-PUSHDRIVER); this is the driver's own structural
// half of the property.
// ---------------------------------------------------------------------------

test("drivePushInit: the signature-required outcome never carries a driver-executable action, for the real authorize-critical command", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "signature-required");
    assert.equal(result.signatureCommand.executedByDriver, false);
    assert.equal(result.followOn.executedByDriver, false);
    // The command IS the real one (proves this is not a no-op stub) --
    assert.ok(result.signatureCommand.lines.some((line) => line.includes("po-human-approval.mjs")));
    assert.ok(result.signatureCommand.lines.some((line) => line.includes("authorize-critical")));
    // -- and nothing in `steps` (the property actually EXECUTED) ever names it.
    for (const step of result.steps) {
      assert.equal(JSON.stringify(step).includes("po-human-approval"), false, JSON.stringify(step));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: push-init.mjs's own source never imports or spawns po-human-approval.mjs -- no code path could reach it", () => {
  const source = readFileSync(fileURLToPath(new URL("./push-init.mjs", import.meta.url)), "utf8");
  // The header comment names it in prose ("THE SIGNATURE BOUNDARY"); a real `import`/spawn
  // reference would additionally show up as the literal module specifier below -- absent here.
  assert.doesNotMatch(source, /["'`]\.\/po-human-approval\.mjs["'`]/u, "push-init.mjs must never import po-human-approval.mjs directly");
});

// ---------------------------------------------------------------------------
// DoD 3: a failing precondition stops the driver with that precondition named, rather than
// proceeding. Four named cases: dirty tree, stale verify evidence, missing threat model,
// unavailable trust anchor.
// ---------------------------------------------------------------------------

test("drivePushInit: dirty working tree stops at push-prepare's own check, named, even though gate-satisfiability does not check it", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(),
      prepareDeps: prepareDepsAllGreen({ gitStatus: () => " M dirty.mjs\n" }),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks.length, 1);
    assert.equal(result.checks[0].id, "working-tree-clean");
    assert.equal(result.checks[0].ok, false);
    assert.equal(result.steps.map((step) => step.id).includes("push-prepare"), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: stale verify evidence is reported by the cheap preflight while push-prepare still collects its independent checks", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen({
        readFile: (path) => {
          if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "k", publicKeySha256: "a".repeat(64), humanName: "Tester" });
          if (path.endsWith("verify-latest.json")) return JSON.stringify({ exitCode: 0, commit: "stale-commit-sha" });
          if (path === "/fake/calibration.json") return JSON.stringify({ verify: "node harness/scripts/verify.mjs" });
          throw new Error(`unexpected read: ${path}`);
        },
      }),
      prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    // The ONLY failing check -- proves this fixture isolates exactly the one precondition
    // under test, not a side effect of an unrelated fixture gap.
    assert.deepEqual(result.checks.map((check) => check.id), ["verify-evidence-bound"], JSON.stringify(result.checks));
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: missing push-threat-model.md is reported while push-prepare still collects its independent checks", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen({ exists: (path) => path.endsWith("trust-policy.json") }),
      prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks.some((check) => check.id === "push-threat-model-materialized"), true, JSON.stringify(result.checks));
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: one run returns failures from satisfiability and push-prepare together", () => {
  const root = freshFixtureRoot();
  try {
    let prepareOptions = null;
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      assessPushGateSatisfiability: () => ({
        ok: true,
        report: {
          satisfiable: false,
          checks: [
            { id: "verify-contract-configured", ok: false, message: "verify missing" },
            { id: "push-threat-model-materialized", ok: false, message: "threat model missing" },
          ],
        },
      }),
      pushPrepareReport: (_argv, _deps, options) => {
        prepareOptions = options;
        return {
          ok: true,
          report: {
            ready: false,
            checks: [
              { id: "working-tree-clean", ok: false, message: "tree dirty" },
              { id: "security-evidence", ok: false, message: "security evidence missing" },
            ],
          },
        };
      },
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
    assert.deepEqual(result.checks.map((check) => check.id), [
      "verify-contract-configured",
      "push-threat-model-materialized",
      "working-tree-clean",
      "security-evidence",
    ]);
    assert.deepEqual(prepareOptions, { foldPendingApprovalWrite: false });
    assert.equal(result.recovery.schema, "pipeline.push-init-recovery.v1");
    assert.equal(result.recovery.status, "action-required");
    assert.deepEqual(result.recovery.blockers.map((check) => check.id), result.checks.map((check) => check.id));
    assert.deepEqual(result.recovery.retryAction.argv.slice(1), [
      "--root", root, "--by", "tester", "--remote", "origin", "--destination", "refs/heads/main",
    ]);
    assert.equal(result.recovery.retryAction.mutation, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: an onboarding-set machine-plane anchor resolves the key directory without disclosing it in the signature instructions", () => {
  const root = freshFixtureRoot();
  try {
    let satisfiabilityAnchorReads = 0;
    let prepareAnchorReads = 0;
    const tofuPolicy = () => ({ ok: true, trustAnchor: null, trustAnchors: null });
    const machinePlane = () => ({
      status: "valid",
      plane: { poKeyDirectory: "/external/po-dir" },
    });
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen({
        readCriticalHumanProofPolicy: tofuPolicy,
        resolveLocalOperatorKeyAnchor: () => {
          satisfiabilityAnchorReads += 1;
          return { keyReference: "fixture-operator-key", publicKeySha256: "a".repeat(64) };
        },
        readMachinePlane: machinePlane,
      }),
      prepareDeps: prepareDepsAllGreen({
        readCriticalHumanProofPolicy: tofuPolicy,
        resolveLocalOperatorKeyAnchor: () => {
          prepareAnchorReads += 1;
          return { keyReference: "fixture-operator-key", publicKeySha256: "a".repeat(64) };
        },
        readMachinePlane: machinePlane,
      }),
    });
    assert.equal(result.outcome, "signature-required", JSON.stringify(result, null, 2));
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
    assert.equal(satisfiabilityAnchorReads, 1, "the cheap preflight must resolve the onboarding-set operator anchor");
    assert.equal(prepareAnchorReads, 1, "push-prepare must independently resolve the same operator anchor");
    assert.equal(result.signatureCommand.executedByDriver, false);
    const instructions = result.signatureCommand.lines.join("\n");
    assert.ok(instructions.includes("The configured approval directory is resolved automatically."), JSON.stringify(result.signatureCommand));
    assert.equal(instructions.includes("/external/po-dir"), false, JSON.stringify(result.signatureCommand));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// DoD 4: re-entrancy -- running the driver twice from the same state does not double-
// execute a step. Every underlying check is read-only by construction (see push-init.mjs's
// own header comment), so this is a stronger, byte-identity property, not merely "no
// crash on retry".
// ---------------------------------------------------------------------------

test("drivePushInit: re-entrant -- two consecutive calls from unchanged state produce byte-identical results, and each runs the spawned step exactly once", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    let calls = 0;
    const run = () => { calls += 1; return { status: 0, stdout: "ok\n", stderr: "" }; };
    const args = {
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1", candidate: "HEAD",
      run, satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    };
    const first = drivePushInit(args);
    const second = drivePushInit(args);
    assert.deepEqual(first, second);
    assert.equal(calls, 2, "exactly one reconciliation spawn per invocation -- 2 invocations, 2 calls, never more");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Real-repo integration: the one genuinely spawned step (check-doc-reconciliation.mjs),
// run for real, against this repository's own real HEAD -- mirrors push-prepare.test.mjs's
// own D3 exception. This repository's own reconciliation state can legitimately change over
// time (it did: commit b84fd343 turned a real finding this check used to fail into a pass),
// so this test asserts the INVARIANT that holds either way rather than one fixed shape:
// step 1 is always the real spawn, argv[0] always names the real script, and the driver's
// own verdict must be retained, never guessed. A failure remains named and the commit-neutral
// satisfiability preflight still runs. The later record-commit preparation does not run until
// reconciliation is green, so one result never mixes substantive S and record R findings.
// A pass must never reappear as a failing reconciliation check.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reproduce-first regression: NVA-B-PUSHINIT-1. The checker's own contract requires
// --candidate and --record-ref to be able to differ (a record naming candidate X cannot
// live inside X's own tree). Before the fix, drivePushInit has no `candidate`/`recordRef`
// input at all -- buildReconciliationArgv() always emits the literal "HEAD" and never
// emits --record-ref, so the two collapse onto the same commit and the check is
// unsatisfiable by construction. This fixture is a REAL, already-reconciled range in this
// repository's own history (commit 8681046622... is the candidate named in an existing
// docs/doc-reconciliation.md section, and it is an ancestor of the current real HEAD, which
// serves as --record-ref by the checker's own default) -- proving the check CAN pass when
// given the two refs it actually needs, which the driver could not previously supply.
// ---------------------------------------------------------------------------

test("drivePushInit: real repo -- an explicit candidate distinct from the record-ref lets layer 1b actually pass (NVA-B-PUSHINIT-1 regression)", () => {
  const result = drivePushInit({
    rootDir: REPO_ROOT, by: "tester", remote: "origin", destination: "refs/heads/main",
    base: "56e91858d96f9d58db75c306424b79c256c1fe74",
    candidate: "8681046622dc23956b760ba93552793b3d983193",
    // record-ref intentionally omitted: defaults to HEAD, which descends from the candidate
    // above and carries the already-reconciled record for it.
  });
  const reconciliationStep = result.steps[0];
  assert.equal(reconciliationStep.id, "doc-reconciliation", JSON.stringify(result, null, 2));
  assert.equal(reconciliationStep.exitCode, 0, JSON.stringify(reconciliationStep));
  assert.equal(reconciliationStep.ok, true, JSON.stringify(reconciliationStep));
});

test("drivePushInit: real repo -- layer 1b actually spawns check-doc-reconciliation.mjs and surfaces ITS real verdict, never a guess", () => {
  const result = drivePushInit({ rootDir: REPO_ROOT, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1", candidate: "HEAD" });
  // Layer 1b is always step 1, and it is a real spawn against the real script, not a guess --
  // true regardless of the reconciliation outcome.
  assert.ok(result.steps.length >= 1, "layer 1b must always run and be recorded as step 1");
  const reconciliationStep = result.steps[0];
  assert.equal(reconciliationStep.id, "doc-reconciliation");
  assert.equal(reconciliationStep.executable, "node");
  assert.equal(reconciliationStep.argv[0], join(REPO_ROOT, RECONCILIATION_SCRIPT_RELATIVE_PATH));
  assert.equal(typeof reconciliationStep.exitCode, "number", "a real subprocess always reports a numeric exit code");

  if (reconciliationStep.ok === false) {
    // The real script's own real failure is surfaced with the commit-neutral policy preflight;
    // the R-bound push preparation is intentionally deferred.
    assert.equal(result.outcome, "precondition-unmet", JSON.stringify(result, null, 2));
    assert.deepEqual(result.steps.map((step) => step.id), ["doc-reconciliation", "push-gate-satisfiability"]);
    const surfaced = result.checks.find((check) => check.id === "doc-reconciliation");
    assert.equal(surfaced?.ok, false);
    assert.equal(typeof surfaced?.message, "string");
    assert.ok(surfaced.message.length > 0, "the surfaced verdict must carry the real script's own message, not a placeholder");
  } else {
    // The real script's own real pass: the driver must have continued past layer 1b on the
    // strength of THAT verdict -- never stopping at step 1 as though it failed, and never
    // re-reporting doc-reconciliation as a failing check further down.
    assert.equal(reconciliationStep.exitCode, 0);
    assert.ok(result.steps.length > 1, "a passing real verdict must let the driver continue past layer 1b, never stop as if it failed");
    assert.ok(["precondition-unmet", "error", "signature-required"].includes(result.outcome), result.outcome);
    if (result.outcome === "precondition-unmet") {
      assert.equal(result.checks.some((check) => check.id === "doc-reconciliation"), false, "layer 1b already passed; it must not resurface as a failing check");
    }
  }
});

test("drivePushInit: a failed S-to-R reconciliation never invokes the R-bound preparation report", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    let prepareCalls = 0;
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      base: "base", candidate: "substantive-S", recordRef: "record-R",
      run: () => ({ status: 2, stdout: "", stderr: "unreconciled" }),
      satisfiabilityDeps: satisfiabilityDepsAllGreen(),
      pushPrepareReport: () => { prepareCalls += 1; throw new Error("must not run"); },
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(prepareCalls, 0);
    assert.deepEqual(result.steps.map((step) => step.id), ["doc-reconciliation", "push-gate-satisfiability"]);
    assert.equal(result.checks[0].id, "doc-reconciliation");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
