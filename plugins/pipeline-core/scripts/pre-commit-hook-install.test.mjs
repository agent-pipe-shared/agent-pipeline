#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-commit-hook-install.test.mjs — NVA-W11-PRECOMMITGUARD. Covers: staged-path
 * enumeration (incl. the pre-first-commit empty-tree fallback), the fail-closed "cannot
 * evaluate" branch, refusal of a real `git commit` that stages a gate-strength- or
 * testpath-protected path with no consumed capability, an allow once a matching consumed
 * capability exists, a script-driven bypass of the PreToolUse layer still being blocked at
 * the commit boundary (the backlog item's own reported gap), a non-protected path staying
 * unaffected, install/removal safety, and decline recording.
 *
 * Run: node --test plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, cpSync, unlinkSync, symlinkSync, statSync }  from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  renderShim,
  renderImpl,
  planInstall,
  applyInstall,
  planRemoval,
  applyRemoval,
  planDecline,
  applyDecline,
  DECLINE_MARKER_SCHEMA,
} from "./pre-commit-hook-install.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { installGuardMaintenanceWindow, prepareGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { renderGitHookSnapshotAdmission } from "../lib/git-hook-snapshot-admission.mjs";
import { publishGitHookRuntimeSnapshot, verifyGitHookRuntimeSnapshot } from "../lib/git-hook-runtime-snapshot.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { authorizeQualityPackageCommit, qualityPackageIntentSha256, SIGNED_QUALITY_PACKAGE_SCHEMA } from "../lib/signed-quality-package.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN_LIB_DIR = join(PLUGIN_ROOT, "lib");
const PLUGIN_HOOKS_DIR = join(PLUGIN_ROOT, "hooks");
const PLUGIN_SCRIPTS_DIR = join(PLUGIN_ROOT, "scripts");
const PLUGIN_DIRS = { pluginLibDir: PLUGIN_LIB_DIR, pluginHooksDir: PLUGIN_HOOKS_DIR, pluginScriptsDir: PLUGIN_SCRIPTS_DIR };

// A-S2b (HOOKREFRESH, PO decision M): the --install CLI must report the refusal code the install
// path actually threw, as one JSON object with exit 1 -- not die with an uncaught exception and no
// JSON. The CLI offers no dependency seam of its own, so the throwing dependency is injected from
// outside with a Node module-customization hook: the child resolves
// `lib/hardened-private-directory.mjs` to a stub whose `ensureHardenedPrivateDirectory` throws an
// error carrying the typed code PB-WINDOWS-ASSURANCE (the real helper throws exactly that code on win32).
test("--install CLI: a typed refusal thrown by the install path is reported as its own code (PB-WINDOWS-ASSURANCE), exit 1", () => {
  const workDir = mkdtempSync(join(tmpdir(), "pre-commit-typed-refusal-"));
  const repoDir = join(workDir, "repo");
  mkdirSync(repoDir);
  const init = spawnSync("git", ["init", "-q"], { cwd: repoDir, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const stubSource = 'export function ensureHardenedPrivateDirectory() { throw Object.assign(new Error("fixture: private-state assurance refused"), { code: "PB-WINDOWS-ASSURANCE" }); }';
  const hooksSource = [
    `const STUB_URL = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(stubSource)}`)};`,
    "export async function resolve(specifier, context, nextResolve) {",
    "  const resolved = await nextResolve(specifier, context);",
    '  return resolved.url.endsWith("/lib/hardened-private-directory.mjs") ? { url: STUB_URL, shortCircuit: true } : resolved;',
    "}",
  ].join("\n");
  const preloadPath = join(workDir, "inject-typed-refusal.mjs");
  writeFileSync(preloadPath, [
    'import { register } from "node:module";',
    `register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(hooksSource)}`)});`,
  ].join("\n"), "utf8");
  const installer = fileURLToPath(new URL("./pre-commit-hook-install.mjs", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", pathToFileURL(preloadPath).href, installer, "--install"], {
    cwd: repoDir,
    encoding: "utf8",
    timeout: 60000,
  });
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    assert.fail(`stdout must be one JSON object; got ${JSON.stringify(result.stdout)} (stderr: ${result.stderr})`);
  }
  assert.equal(payload.status, "refused");
  assert.equal(payload.code, "PB-WINDOWS-ASSURANCE");
  assert.equal(result.status, 1, `exit code (stderr: ${result.stderr})`);
});

/** The generated impl.mjs is self-contained (it must run standalone against a real git repo),
 * so its pure exported helper (`stagedPaths`) is exercised by writing the REAL rendered output
 * to a temp file and importing it directly -- never a second, hand-copied implementation of the
 * same logic that could silently drift from what actually gets installed. */
let implModulePromise;
function implModule() {
  if (!implModulePromise) {
    const dir = mkdtempSync(join(tmpdir(), "pre-commit-hook-implmod-"));
    const file = join(dir, "impl.mjs");
    writeFileSync(file, renderImpl(PLUGIN_DIRS));
    implModulePromise = import(`file://${file}`);
  }
  return implModulePromise;
}

function freshRepo(prefix, { commitInitial = true, pipelineEnrollment = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `pre-commit-hook-${prefix}-`));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 20000 });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  if (commitInitial) {
    writeFileSync(join(dir, "README.md"), "fixture\n");
    git("add", "README.md");
    git("commit", "-q", "-m", "init");
  }
  // These original guard fixtures model an explicitly opted-in Pipeline repository.
  // The catalog-only callback selects an ordinary ungoverned repository instead.
  const hostStateRoot = join(dir, "unused-host");
  const governance = createGovernanceScopeController({hostStateRoot});
  const commonDir = commonDirOf(dir);
  const configPath = join(commonDir, "config");
  const configBefore = readFileSync(configPath);
  const inactive = governance.observe({rootDir: dir});
  assert.equal(inactive.state, "inactive");
  assert.equal(inactive.requiresEnforcement, false);
  assert.deepEqual(readFileSync(configPath), configBefore, "inactive observation leaves Git config unchanged");
  assert.equal(existsSync(hostStateRoot), false, "inactive observation creates no host-store directory");
  if (pipelineEnrollment) {
    const plan = governance.planDecision({rootDir: dir, decision: "enroll", by: "disposable-precommit-fixture"});
    const active = governance.applyDecision(plan, {activate: true, planSha256: plan.planSha256});
    assert.equal(active.state, "active");
    assert.equal(active.requiresEnforcement, true);
    assert.equal(active.scopeKey, createHash("sha256").update(dir).digest("hex"));
    assert.deepEqual(active.provenance, {
      kind: "explicit-local-decision",
      refs: [{path: "git-common-config", sha256: createHash("sha256").update(readFileSync(configPath)).digest("hex")}],
    });
    const configured = spawnSync("git", ["config", "--local", "--get", `agent-pipeline.activation-${active.scopeKey}.record`], {cwd: dir, encoding: "utf8"});
    assert.equal(configured.status, 0, configured.stderr);
    assert.equal(JSON.parse(configured.stdout.trim()).state, "active", "Git common config remains the current enrollment authority");
    const witnessPath = join(hostStateRoot, `${active.scopeKey}.git-proof.json`);
    assert.equal(existsSync(witnessPath), true, "explicit enrollment records its private diagnostic witness");
    const witness = JSON.parse(readFileSync(witnessPath, "utf8"));
    const rootStat = statSync(dir);
    const commonStat = statSync(commonDir);
    assert.deepEqual(witness, {
      schema: "pipeline.governance-positive-proof.v1",
      root: dir,
      rootIdentity: {dev: String(rootStat.dev), ino: String(rootStat.ino)},
      // The witness contract (governance-scope.mjs readPositiveProof: `commonPath === resolve(commonPath)`)
      // is the platform-native resolved form. `git rev-parse --path-format=absolute` prints a drive-letter
      // path with forward slashes on win32, so the raw `commonDir` is not that form there; resolve() is the
      // identity on POSIX, so the assertion is unchanged on POSIX.
      commonPath: resolve(commonDir),
      commonIdentity: {dev: String(commonStat.dev), ino: String(commonStat.ino)},
      scopeKey: active.scopeKey,
      by: "disposable-precommit-fixture",
      decidedAt: witness.decidedAt,
      planSha256: plan.planSha256,
    });
    assert.equal(statSync(witnessPath).mode & 0o777, 0o600, "diagnostic witness remains private");
    assert.equal(governance.observe({rootDir: dir}).state, "active");
  } else {
    assert.deepEqual(readFileSync(configPath), configBefore, "opted-out fixture keeps its Git config exact");
    const observation = governance.observe({rootDir: dir});
    assert.equal(observation.state, "inactive");
    assert.equal(observation.requiresEnforcement, false);
    assert.deepEqual(readFileSync(configPath), configBefore, "read-only observation keeps opted-out Git config exact");
    assert.equal(existsSync(hostStateRoot), false, "inactive fixture creates no host-store directory");
  }
  assert.equal(existsSync(join(dir, "project", "pipeline-state.json")), false, "enrollment creates no plan approval or lifecycle State");
  assert.equal(existsSync(join(dir, ".claude", "pipeline-state.json")), false);
  return { dir, git };
}

function commonDirOf(dir) {
  const res = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: dir, encoding: "utf8" });
  return res.stdout.trim();
}

/** Writes a `protectedTestPaths` guard-config entry the way this repo's own resolution does for
 * an unconfigured (no pipeline.yaml/pipeline.json) project: `.claude/guard-config.json`
 * (`resolveGuardConfigPath`'s legacy fallback). */
function writeTestPathConfig(dir, entries) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "guard-config.json"), JSON.stringify({ protectedTestPaths: entries }));
}

/** Writes a CONSUMED human-guard-override capability covering `eligiblePaths` exactly, in the
 * same storage layout `human-guard-override.mjs` writes and
 * `check-protected-path-integrity.mjs`'s `defaultHasConsumedCapabilityForPath` reads. */
function writeConsumedCapability(dir, eligiblePaths) {
  const commonDir = commonDirOf(dir);
  const capsDir = join(commonDir, "agent-pipeline", "human-guard-overrides", "capabilities");
  mkdirSync(capsDir, { recursive: true });
  writeFileSync(join(capsDir, "test-capability.json"), JSON.stringify({ status: "consumed", eligiblePaths }));
}

function installSignedWindow(dir, scopeRuleIds) {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
  const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, "plan.md"), "plan\n");
  writeFileSync(join(dir, "spec.md"), "spec\n");
  writeFileSync(join(dir, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: "precommit-gmw", publicKeySha256 },
  }));
  const seeded = spawnSync("git", ["add", "-A"], { cwd: dir, encoding: "utf8" });
  assert.equal(seeded.status, 0, seeded.stderr);
  const committed = spawnSync("git", ["commit", "-q", "-m", "seed signed-window authority"], { cwd: dir, encoding: "utf8" });
  assert.equal(committed.status, 0, committed.stderr);
  const planSha256 = createHash("sha256").update("plan\n").digest("hex");
  const specSha256 = createHash("sha256").update("spec\n").digest("hex");
  const { intent, request } = prepareGuardMaintenanceWindowRequest({
    rootDir: dir, scopeRuleIds, ttlSeconds: 300, reason: "pre-commit GMW parity",
    featureId: "precommit-gmw", planSha256, specSha256, policyRevision: "precommit-gmw-v1",
    livePluginRoot: PLUGIN_ROOT, authorshipMode: "goldfish-dispatch",
  });
  const proof = {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference: "precommit-gmw",
    publicKey,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
  };
  installGuardMaintenanceWindow({ rootDir: dir, request, anchors: [{ keyReference: "precommit-gmw", publicKeySha256 }], proof, livePluginRoot: PLUGIN_ROOT });
}

/** Writes the legacy-tier calibration file (`.claude/pipeline.json`) carrying a `handover`
 * key -- the same shape `resolveHandoverConfig()` (`lib/handover-rotation.mjs`) reads for a
 * project that has not migrated to `project/pipeline.json`, and the shape a fresh fixture
 * repo (no `project/` dir) resolves to by default. */
function writeHandoverCalibration(dir, handover) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.json"), JSON.stringify({ handover }));
}

/** The complete three-file delta produced by the sanctioned
 * `pipeline-state set-phase --phase implementation --verify-command` writer.
 * These fixtures deliberately use ordinary filesystem writes: the assertion is
 * at the Git boundary, where the hook must distinguish the exact semantic
 * transaction from every wider rewrite regardless of the process that wrote it. */
function writeVerifyTransitionFixture(dir, { command = null, phase = "design", extraCalibration = {}, updatedAt = "2026-09-13T12:00:00.000Z" } = {}) {
  mkdirSync(join(dir, "project"), { recursive: true });
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const calibration = { project: "fixture", verify: command, handover: "docs/state.md", ...extraCalibration };
  writeFileSync(join(dir, "project", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(dir, ".claude", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  const feature = { id: "fixture", planPath: "plan.md", phase };
  if (phase === "implementation") feature.phaseHistory = [{ phase: "implementation", at: updatedAt }];
  writeFileSync(join(dir, "project", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: true,
    updatedAt,
    activeFeature: feature,
    planSubmission: { submissionSha256: "fixture-submission" },
    planApproval: { submissionSha256: "fixture-submission" },
  }, null, 2)}\n`);
}

/** A canonical, already-implementing authority state for the late route. The
 * legacy approval is deliberately complete (`approvedBy` + ISO timestamp), so
 * the real shared derivePlanLifecycle() projection accepts it; it is not the
 * shallow phase/planApproved lookalike older backstop fixtures used. */
function writeEstablishedLateVerifyFixture(dir, { command = null, updatedAt = "2026-09-13T12:00:00.000Z" } = {}) {
  writeVerifyTransitionFixture(dir, { command, phase: "implementation", updatedAt });
  const path = join(dir, "project", "pipeline-state.json");
  const state = JSON.parse(readFileSync(path, "utf8"));
  delete state.planSubmission;
  state.planApproval = { approvedBy: "PO", approvedAt: updatedAt };
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

/** Installs the real hook into `dir`, then runs an actual `git commit` -- exactly the boundary
 * this hook exists to guard, not a direct invocation of the hook binary. */
function installHook(dir) {
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed", `precondition: install must succeed (${JSON.stringify(install)})`);
  return install;
}

function commit(dir, message, { allowEmpty = false } = {}) {
  const args = ["commit", "-m", message];
  if (allowEmpty) args.push("--allow-empty");
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 20000 });
  return { code: result.status, stderr: result.stderr ?? "", stdout: result.stdout ?? "" };
}

test("installed pre-commit hook rejects a staged local private pattern before Git commits", () => {
  const dir = mkdtempSync(join(tmpdir(), "pre-commit-privacy-"));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 20000 });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.invalid").status, 0);
  assert.equal(git("config", "user.name", "Fixture Operator").status, 0);
  writeFileSync(join(dir, "README.md"), "fixture\n");
  assert.equal(git("add", "README.md").status, 0);
  assert.equal(git("commit", "-q", "-m", "initial fixture").status, 0);
  const initialHead = git("rev-parse", "HEAD").stdout.trim();
  const governance = createGovernanceScopeController({ hostStateRoot: join(dir, "unused-host") });
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "fixture-operator" });
  assert.equal(governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  installHook(dir);
  const privateDir = join(dir, ".git", "agent-pipeline");
  mkdirSync(privateDir, { recursive: true });
  writeFileSync(join(privateDir, "private-identity-patterns.json"), JSON.stringify([
    { category: "local-pattern", value: "SYNTHETIC-PRIVATE-MARKER" },
  ]));
  writeFileSync(join(dir, "note.txt"), "SYNTHETIC-PRIVATE-MARKER\n");
  assert.equal(git("add", "note.txt").status, 0);
  const blocked = git("commit", "-m", "fixture staged private content");
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /private local identifiers/u);
  assert.equal(git("rev-parse", "HEAD").stdout.trim(), initialHead);
});

// ---- staged-path enumeration (pure helper, real generated impl) -----------------------

test("stagedPaths: lists a newly staged file relative to HEAD", async () => {
  const { stagedPaths } = await implModule();
  const { dir, git } = freshRepo("staged-basic");
  writeFileSync(join(dir, "notes.txt"), "hello\n");
  git("add", "notes.txt");
  const paths = stagedPaths(dir);
  assert.deepEqual(paths, ["notes.txt"]);
});

test("stagedPaths: falls back to the empty-tree comparison before any commit exists", async () => {
  const { stagedPaths } = await implModule();
  const { dir, git } = freshRepo("staged-no-head", { commitInitial: false });
  writeFileSync(join(dir, "first.txt"), "hello\n");
  git("add", "first.txt");
  const paths = stagedPaths(dir);
  assert.deepEqual(paths, ["first.txt"]);
});

test("stagedPaths: nothing staged yields an empty array, not null", async () => {
  const { stagedPaths } = await implModule();
  const { dir } = freshRepo("staged-empty");
  assert.deepEqual(stagedPaths(dir), []);
});

// ---- pathAlreadyTrackedInHistory (pure helper, first-appearance exemption mechanism) -------

test("pathAlreadyTrackedInHistory: unborn HEAD (no commit exists yet) -> false, nothing can be already tracked", async () => {
  const { pathAlreadyTrackedInHistory } = await implModule();
  const { dir } = freshRepo("history-unborn-head", { commitInitial: false });
  assert.equal(pathAlreadyTrackedInHistory(dir, "any/path.txt"), false);
});

test("pathAlreadyTrackedInHistory: HEAD exists but the path was never committed -> false (first appearance)", async () => {
  const { pathAlreadyTrackedInHistory } = await implModule();
  const { dir } = freshRepo("history-never-committed");
  assert.equal(pathAlreadyTrackedInHistory(dir, "never/seen.txt"), false);
});

test("pathAlreadyTrackedInHistory: a committed path -> true (already tracked)", async () => {
  const { pathAlreadyTrackedInHistory } = await implModule();
  const { dir, git } = freshRepo("history-committed");
  writeFileSync(join(dir, "tracked.txt"), "v1\n");
  git("add", "tracked.txt");
  git("commit", "-q", "-m", "add tracked.txt");
  assert.equal(pathAlreadyTrackedInHistory(dir, "tracked.txt"), true);
});

test("pathAlreadyTrackedInHistory: a path committed then deleted -> still true (currently absent is not first appearance)", async () => {
  const { pathAlreadyTrackedInHistory } = await implModule();
  const { dir, git } = freshRepo("history-deleted");
  writeFileSync(join(dir, "gone.txt"), "v1\n");
  git("add", "gone.txt");
  git("commit", "-q", "-m", "add gone.txt");
  git("rm", "-q", "gone.txt");
  git("commit", "-q", "-m", "remove gone.txt");
  assert.equal(pathAlreadyTrackedInHistory(dir, "gone.txt"), true);
});

// ---- end-to-end: fail-closed branch -----------------------------------------------------

test("installed hook impl: repository root unresolvable (invoked outside any git repo) -> BLOCK", () => {
  const dir = mkdtempSync(join(tmpdir(), "pre-commit-hook-e2e-no-repo-"));
  const implContent = renderImpl(PLUGIN_DIRS);
  const implFile = join(dir, "impl.mjs");
  writeFileSync(implFile, implContent);
  const result = spawnSync(process.execPath, [implFile], { cwd: dir, encoding: "utf8", timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /root\/common-dir could not be resolved/);
});

// ---- end-to-end: a real `git commit` staging a protected path -----------------------------
//
// First-appearance exemption (PO decision, 2026-08-29, candidate (b) of the backlog item):
// a protected path's VERY FIRST appearance anywhere in git history is exempt from this
// hook's block, even with no consumed capability -- because onboarding's own scaffold
// authoring writes gate-strength-protected files directly to disk via trusted code, and the
// first real commit capturing that scaffold would otherwise be indistinguishable from an
// untrusted bypass. Every "still blocked" test below therefore first commits the protected
// path with SOME prior content (before the hook is installed, so the seed commit itself is
// never gated) so the later re-write is genuinely a re-write of ALREADY-TRACKED history --
// the exact property that must stay blocked.

test("installed hook: gate-strength-protected path (pipeline.user.yaml, GS-1) ALREADY tracked, re-write with no consumed capability -> commit refused", () => {
  const { dir, git } = freshRepo("e2e-gate-strength-block");
  writeFileSync(join(dir, "pipeline.user.yaml"), "gates:\n  push_approval: signature\n");
  git("add", "pipeline.user.yaml");
  git("commit", "-q", "-m", "seed pipeline.user.yaml (no hook installed yet)");
  installHook(dir);
  writeFileSync(join(dir, "pipeline.user.yaml"), "gates:\n  push_approval: chat\n");
  git("add", "pipeline.user.yaml");
  const { code, stderr } = commit(dir, "attempt gate-strength re-write");
  assert.notEqual(code, 0);
  assert.match(stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/);
  assert.match(stderr, /GS-1/);
  assert.match(stderr, /pipeline\.user\.yaml/);
  assert.doesNotMatch(stderr, /--no-verify/);
  assert.match(stderr, /HUMAN OPERATOR ONLY/);
  assert.match(stderr, /agent MUST NOT/);
});

test("installed hook: gate-strength-protected path's FIRST appearance in git history, no consumed capability -> commit ALLOWED (first-appearance exemption)", () => {
  const { dir, git } = freshRepo("e2e-gate-strength-first-appearance");
  installHook(dir);
  writeFileSync(join(dir, "pipeline.user.yaml"), "gates:\n  push_approval: chat\n");
  git("add", "pipeline.user.yaml");
  const { code, stderr } = commit(dir, "genesis write of pipeline.user.yaml");
  assert.equal(code, 0, stderr);
});

test("installed hook: testpath-protected path ALREADY tracked, re-write with no consumed capability -> commit refused", () => {
  const { dir, git } = freshRepo("e2e-testpath-block");
  writeTestPathConfig(dir, [{ pattern: "protected-suite\\.test\\.mjs$", reason: "fixture protected suite", id: "TP-1" }]);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// original\n");
  git("add", ".claude/guard-config.json", "protected-suite.test.mjs");
  git("commit", "-q", "-m", "seed guard-config and protected suite (no hook installed yet)");
  installHook(dir);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// tampered\n");
  git("add", "protected-suite.test.mjs");
  const { code, stderr } = commit(dir, "attempt test-path re-write");
  assert.notEqual(code, 0);
  assert.match(stderr, /TP-1/);
  assert.match(stderr, /protected-suite\.test\.mjs/);
  assert.match(stderr, /fixture protected suite/);
});

test("installed hook: testpath-protected path's FIRST appearance in git history, no consumed capability -> commit ALLOWED (first-appearance exemption)", () => {
  const { dir, git } = freshRepo("e2e-testpath-first-appearance");
  writeTestPathConfig(dir, [{ pattern: "protected-suite\\.test\\.mjs$", reason: "fixture protected suite", id: "TP-1" }]);
  git("add", ".claude/guard-config.json");
  git("commit", "-q", "-m", "seed guard-config");
  installHook(dir);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// genesis\n");
  git("add", "protected-suite.test.mjs");
  const { code, stderr } = commit(dir, "genesis write of protected-suite.test.mjs");
  assert.equal(code, 0, stderr);
});

test("installed hook: a spawned Node process re-writing an ALREADY-COMMITTED protected path (never crossing any PreToolUse hook) is still refused at commit", () => {
  // This is the backlog item's own reported repro shape verbatim: "an already-committed
  // project/pipeline.json being bypass-written" -- the exact case the first-appearance
  // exemption must NOT reopen. Reproduced without any Edit/Write tool call: fs.writeFileSync
  // from a plain spawned `node -e` process, exactly the shape the item names.
  const { dir, git } = freshRepo("e2e-spawned-bypass-already-tracked");
  const target = join(dir, "project", "pipeline.json");
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(target, "{}\n");
  git("add", "project/pipeline.json");
  git("commit", "-q", "-m", "seed project/pipeline.json (no hook installed yet)");
  installHook(dir);
  const bypass = spawnSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(target)}, "{\\"tampered\\":true}\\n")`], { encoding: "utf8" });
  assert.equal(bypass.status, 0, "the bypass write itself must succeed -- it never crosses any PreToolUse hook");
  git("add", "project/pipeline.json");
  const { code, stderr } = commit(dir, "attempt via spawned bypass against already-tracked content");
  assert.notEqual(code, 0);
  assert.match(stderr, /GS-10/);
});

test("installed hook: admits only the complete sanctioned baseline-verify to implementation transaction without a second human override", () => {
  const { dir, git } = freshRepo("e2e-sanctioned-verify-transition");
  writeVerifyTransitionFixture(dir);
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  git("commit", "-q", "-m", "seed baseline verification and approved design");
  installHook(dir);

  const command = "node --test test.mjs";
  writeVerifyTransitionFixture(dir, { command, phase: "implementation", updatedAt: "2026-09-13T12:01:00.000Z" });
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  const { code, stderr } = commit(dir, "configure verify while entering implementation");
  assert.equal(code, 0, stderr);
});

test("installed hook: admits only the two calibration twins for the sanctioned late baseline-verify recovery", () => {
  const { dir, git } = freshRepo("e2e-sanctioned-late-verify-recovery");
  writeEstablishedLateVerifyFixture(dir);
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  git("commit", "-q", "-m", "seed baseline verification and established implementation");
  installHook(dir);

  writeEstablishedLateVerifyFixture(dir, { command: "node --test test.mjs" });
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  const { code, stderr } = commit(dir, "configure late verify in established implementation");
  assert.equal(code, 0, stderr);
});

test("installed hook: refuses a late verify rewrite when it also stages lifecycle state", () => {
  const { dir, git } = freshRepo("e2e-sanctioned-late-verify-state-rewrite");
  writeEstablishedLateVerifyFixture(dir, { updatedAt: "2026-09-13T12:00:00.000Z" });
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  git("commit", "-q", "-m", "seed baseline verification and established implementation");
  installHook(dir);

  writeEstablishedLateVerifyFixture(dir, {
    command: "node --test test.mjs",
    updatedAt: "2026-09-13T12:01:00.000Z",
  });
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  const { code } = commit(dir, "attempt late verify with unrelated lifecycle rewrite");
  assert.notEqual(code, 0);
});

test("installed hook: refuses late verify recovery when committed plan approval is stale", () => {
  const { dir, git } = freshRepo("e2e-sanctioned-late-verify-stale-approval");
  writeEstablishedLateVerifyFixture(dir);
  const statePath = join(dir, "project", "pipeline-state.json");
  const stale = JSON.parse(readFileSync(statePath, "utf8"));
  stale.planApproval = { submissionSha256: "a-different-submission" };
  writeFileSync(statePath, `${JSON.stringify(stale, null, 2)}\n`);
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  git("commit", "-q", "-m", "seed baseline verification with stale approval");
  installHook(dir);

  writeEstablishedLateVerifyFixture(dir, { command: "node --test test.mjs" });
  // Preserve the committed stale authority while staging only the two otherwise
  // valid calibration changes -- a shallow phase/planApproved check must not
  // grant their protected-path exception.
  writeFileSync(statePath, `${JSON.stringify(stale, null, 2)}\n`);
  git("add", "project/pipeline.json", ".claude/pipeline.json");
  const { code } = commit(dir, "attempt late verify with stale plan approval");
  assert.notEqual(code, 0);
});

test("installed hook: refuses a wider calibration rewrite that merely resembles the sanctioned verify transaction", () => {
  const { dir, git } = freshRepo("e2e-sanctioned-verify-transition-extra-field");
  writeVerifyTransitionFixture(dir);
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  git("commit", "-q", "-m", "seed baseline verification and approved design");
  installHook(dir);

  writeVerifyTransitionFixture(dir, {
    command: "node --test test.mjs",
    phase: "implementation",
    extraCalibration: { autonomy: "unguarded" },
    updatedAt: "2026-09-13T12:01:00.000Z",
  });
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  const { code } = commit(dir, "attempt wider calibration rewrite");
  assert.notEqual(code, 0);
});

test("installed hook: refuses the verify rewrite when the lifecycle state is not the matching design-to-implementation transition", () => {
  const { dir, git } = freshRepo("e2e-sanctioned-verify-transition-missing-state");
  writeVerifyTransitionFixture(dir);
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  git("commit", "-q", "-m", "seed baseline verification and approved design");
  installHook(dir);

  writeVerifyTransitionFixture(dir, { command: "node --test test.mjs", updatedAt: "2026-09-13T12:01:00.000Z" });
  git("add", "project/pipeline.json", ".claude/pipeline.json", "project/pipeline-state.json");
  const { code } = commit(dir, "attempt verify rewrite without lifecycle transition");
  assert.notEqual(code, 0);
});

test("installed hook: a spawned Node process CREATING a brand-new protected path (first appearance, never committed before) is exempt -- commit ALLOWED", () => {
  // Documents the deliberate residual scope of the PO's chosen candidate: the first-appearance
  // exemption is drawn on git history, not on the write mechanism, so a spawned-process bypass
  // that creates a never-before-tracked protected path is exempt exactly like a normal
  // Edit/Write-tool genesis write would be -- this is the accepted tradeoff (backlog item, "PO
  // decision, 2026-08-29"), not an unnoticed gap.
  const { dir, git } = freshRepo("e2e-spawned-bypass-first-appearance");
  installHook(dir);
  const target = join(dir, "project", "pipeline.json");
  mkdirSync(join(dir, "project"), { recursive: true });
  const bypass = spawnSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(target)}, "{}\\n")`], { encoding: "utf8" });
  assert.equal(bypass.status, 0);
  git("add", "project/pipeline.json");
  const { code, stderr } = commit(dir, "genesis write via spawned bypass");
  assert.equal(code, 0, stderr);
});

test("installed hook: staged path with a matching CONSUMED capability -> commit ALLOWED", () => {
  const { dir, git } = freshRepo("e2e-consumed-allowed");
  installHook(dir);
  writeConsumedCapability(dir, ["pipeline.user.yaml"]);
  writeFileSync(join(dir, "pipeline.user.yaml"), "gates:\n  push_approval: chat\n");
  git("add", "pipeline.user.yaml");
  const { code, stderr } = commit(dir, "authorized gate-strength change");
  assert.equal(code, 0, stderr);
});

test("installed hook: admits one complete proof-bound quality package, never a widened index", () => {
  const { dir, git } = freshRepo("e2e-quality-package-commit");
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
  const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
  writeTestPathConfig(dir, [{ pattern: "protected-suite\\.test\\.mjs$", reason: "fixture protected suite", id: "TP-QP" }]);
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "quality-test", publicKeySha256 }] }));
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// before\n");
  git("add", ".claude/guard-config.json", "project/critical-human-proof.json", "protected-suite.test.mjs");
  git("commit", "-q", "-m", "seed quality package fixture");
  installHook(dir);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// after\n");
  const unifiedDiff = git("diff", "--binary").stdout;
  const record = {
    schema: SIGNED_QUALITY_PACKAGE_SCHEMA,
    baseCommit: git("rev-parse", "HEAD").stdout.trim(),
    unifiedDiff,
    expectedDigests: { "protected-suite.test.mjs": createHash("sha256").update("// after\n").digest("hex") },
  };
  record.intentSha256 = qualityPackageIntentSha256(record);
  const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: record.intentSha256, keyReference: "quality-test", publicKey, signatureBase64: sign(null, Buffer.from(record.intentSha256), pair.privateKey).toString("base64") };
  git("add", "protected-suite.test.mjs");
  assert.equal(authorizeQualityPackageCommit({ repoRoot: dir, packageIntent: record, proof }).ok, true);
  let result = commit(dir, "commit proof-bound quality package");
  assert.equal(result.code, 0, result.stderr);

  // A receipt bound to the old HEAD cannot replay after that commit, even if a
  // later staged change touches the same protected file.
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// replay\n"); git("add", "protected-suite.test.mjs");
  result = commit(dir, "attempt receipt replay");
  assert.notEqual(result.code, 0);
});

test("installed hook: matching signed GMW permits a non-kernel TP rewrite", () => {
  const { dir, git } = freshRepo("e2e-gmw-tp-allowed");
  writeTestPathConfig(dir, [{ pattern: "protected-suite\\.test\\.mjs$", reason: "fixture protected suite", id: "TP-1" }]);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// original\n");
  git("add", ".claude/guard-config.json", "protected-suite.test.mjs");
  git("commit", "-q", "-m", "seed protected suite");
  installSignedWindow(dir, ["TP-1"]);
  installHook(dir);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// authorized\n");
  git("add", "protected-suite.test.mjs");
  const { code, stderr } = commit(dir, "authorized by signed GMW");
  assert.equal(code, 0, stderr);
});

test("installed hook: wrong-scope signed GMW does not permit a TP rewrite", () => {
  const { dir, git } = freshRepo("e2e-gmw-wrong-scope");
  writeTestPathConfig(dir, [{ pattern: "protected-suite\\.test\\.mjs$", reason: "fixture protected suite", id: "TP-1" }]);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// original\n");
  git("add", ".claude/guard-config.json", "protected-suite.test.mjs");
  git("commit", "-q", "-m", "seed protected suite");
  installSignedWindow(dir, ["TP-2"]);
  installHook(dir);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// refused\n");
  git("add", "protected-suite.test.mjs");
  const { code, stderr } = commit(dir, "wrong-scope GMW");
  assert.notEqual(code, 0);
  assert.match(stderr, /TP-1/);
});

test("installed hook: matching signed GMW never permits hooks.json kernel rewrite", () => {
  const { dir, git } = freshRepo("e2e-gmw-kernel-refused");
  writeTestPathConfig(dir, [{ pattern: "plugins/pipeline-core/hooks/hooks\\.json$", reason: "fixture kernel path", id: "TP-4" }]);
  mkdirSync(join(dir, "plugins", "pipeline-core", "hooks"), { recursive: true });
  writeFileSync(join(dir, "plugins", "pipeline-core", "hooks", "hooks.json"), "{}\n");
  git("add", ".claude/guard-config.json", "plugins/pipeline-core/hooks/hooks.json");
  git("commit", "-q", "-m", "seed kernel path");
  installSignedWindow(dir, ["TP-4"]);
  installHook(dir);
  writeFileSync(join(dir, "plugins", "pipeline-core", "hooks", "hooks.json"), '{"changed":true}\n');
  git("add", "plugins/pipeline-core/hooks/hooks.json");
  const { code, stderr } = commit(dir, "attempt kernel rewrite under GMW");
  assert.notEqual(code, 0);
  assert.match(stderr, /TP-4/);
});

test("installed hook: staged NON-protected path is unaffected -> commit succeeds", () => {
  const { dir, git } = freshRepo("e2e-non-protected");
  installHook(dir);
  writeFileSync(join(dir, "notes.txt"), "an ordinary file\n");
  git("add", "notes.txt");
  const { code, stderr } = commit(dir, "ordinary change");
  assert.equal(code, 0, stderr);
});

test("installed hook: nothing staged (--allow-empty) -> commit succeeds", () => {
  const { dir } = freshRepo("e2e-empty-commit");
  installHook(dir);
  const { code, stderr } = commit(dir, "empty", { allowEmpty: true });
  assert.equal(code, 0, stderr);
});

// ---- install/removal safety (mirrors pre-push-hook-install.test.mjs) ----------------------

test("applyInstall: refuses to overwrite a pre-existing foreign hook", () => {
  const { dir } = freshRepo("install-foreign");
  const res = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-commit"], { cwd: dir, encoding: "utf8" });
  const hookPath = res.stdout.trim();
  mkdirSync(join(hookPath, ".."), { recursive: true });
  writeFileSync(hookPath, "#!/bin/sh\necho a human already had this\n");
  chmodSync(hookPath, 0o755);
  const before = readFileSync(hookPath, "utf8");
  const result = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(result.status, "refused-foreign-hook");
  assert.equal(readFileSync(hookPath, "utf8"), before, "foreign hook content must be untouched");
});

test("applyInstall then applyRemoval: removes exactly what was installed", async () => {
  const { dir } = freshRepo("install-remove-roundtrip", {pipelineEnrollment: false});
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed");
  assert.ok(existsSync(install.hookPath));
  assert.ok(existsSync(install.implPath));
  const installedPluginLibDir = JSON.parse(readFileSync(install.markerPath, "utf8")).pluginLibDir;
  const snapshotRoot = join(installedPluginLibDir, "..");
  const catalogPath = join(snapshotRoot, "protected-baseline.json");
  const catalogBytes = readFileSync(join(PLUGIN_ROOT, "protected-baseline.json"));
  assert.deepEqual(readFileSync(catalogPath), catalogBytes, "installed snapshot retains the exact shipped catalog");
  const inventory = JSON.parse(readFileSync(join(snapshotRoot, "snapshot.json"), "utf8"));
  assert.equal(inventory.inventory.find(row => row.path === "protected-baseline.json").sha256,
    createHash("sha256").update(catalogBytes).digest("hex"));
  const snapshotDigest = createHash("sha256").update(readFileSync(join(snapshotRoot, "snapshot.json"))).digest("hex");
  const installedBaseline = await import(pathToFileURL(join(installedPluginLibDir, "protected-baseline.mjs")).href);
  const loaded = installedBaseline.loadShippedProtectedBaseline();
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.deepEqual(loaded.baseline, JSON.parse(catalogBytes.toString("utf8")));
  // Execute the actual emitted admission validator against the installed snapshot.
  // This fixture has no enrollment; validating its catalog grants no authority.
  const admissionCode = 'import {pathToFileURL} from "node:url";\n'
    + renderGitHookSnapshotAdmission({root: snapshotRoot, manifestSha256: snapshotDigest})
    + '\nexport {admitPipelineScope};\n';
  const admission = await import('data:text/javascript;base64,' + Buffer.from(admissionCode).toString('base64'));
  assert.equal(await admission.admitPipelineScope(dir), false, "valid root catalog reaches the canonical inactive scope observation");
  writeFileSync(catalogPath, "{}\n");
  assert.throws(() => verifyGitHookRuntimeSnapshot({snapshotRoot, manifestSha256: snapshotDigest}), {code: "GHS-CONTENT"});
  await assert.rejects(admission.admitPipelineScope(dir), /GHA-CONTENT/);
  writeFileSync(catalogPath, catalogBytes);
  unlinkSync(catalogPath);
  symlinkSync(join(PLUGIN_ROOT, "protected-baseline.json"), catalogPath);
  assert.throws(() => verifyGitHookRuntimeSnapshot({snapshotRoot, manifestSha256: snapshotDigest}), {code: "PU-ALIAS"});
  await assert.rejects(admission.admitPipelineScope(dir), /GHA-ALIAS/);
  unlinkSync(catalogPath);
  writeFileSync(catalogPath, catalogBytes, {mode: 0o600});
  assert.equal(verifyGitHookRuntimeSnapshot({snapshotRoot, manifestSha256: snapshotDigest}).status, "verified");
  assert.equal(await admission.admitPipelineScope(dir), false, "restoring exact catalog bytes grants no enrollment");
  // A minimal physical input cannot silently invent the missing shipped catalog.
  const minimalRoot = mkdtempSync(join(tmpdir(), "pre-commit-hook-minimal-plugin-"));
  const minimalLib = join(minimalRoot, "lib"), stateDir = join(minimalRoot, "state");
  mkdirSync(minimalLib); mkdirSync(stateDir);
  cpSync(join(PLUGIN_LIB_DIR, "governance-scope.mjs"), join(minimalLib, "governance-scope.mjs"));
  assert.throws(() => publishGitHookRuntimeSnapshot({pluginLibDir: minimalLib, stateDir}), {code: "GHS-BASELINE-MISSING"});
  symlinkSync(join(PLUGIN_ROOT, "protected-baseline.json"), join(minimalRoot, "protected-baseline.json"));
  assert.throws(() => publishGitHookRuntimeSnapshot({pluginLibDir: minimalLib, stateDir}), {code: "PU-ALIAS"});
  unlinkSync(join(minimalRoot, "protected-baseline.json"));
  writeFileSync(join(minimalRoot, "protected-baseline.json"), catalogBytes);
  writeFileSync(join(minimalRoot, "unrelated-public.json"), "{}\n");
  const minimal = publishGitHookRuntimeSnapshot({pluginLibDir: minimalLib, stateDir});
  assert.deepEqual(readFileSync(join(minimal.root, "protected-baseline.json")), catalogBytes);
  assert.equal(existsSync(join(minimal.root, "unrelated-public.json")), false, "root copying stays explicitly bounded");
  const removal = applyRemoval({ rootDir: dir });
  assert.equal(removal.status, "removed");
  assert.equal(existsSync(install.hookPath), false);
  assert.equal(existsSync(install.implPath), false);
});

test("applyRemoval: refuses when the installed hook was modified after install", () => {
  const { dir } = freshRepo("remove-modified");
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed");
  writeFileSync(install.hookPath, "#!/bin/sh\necho tampered\n");
  const plan = planRemoval({ rootDir: dir });
  assert.equal(plan.status, "refused-modified-hook");
  const removal = applyRemoval({ rootDir: dir });
  assert.equal(removal.status, "refused-modified-hook");
  assert.ok(existsSync(install.hookPath), "tampered hook must not be silently deleted");
});

test("applyRemoval: nothing-to-remove when never installed", () => {
  const { dir } = freshRepo("remove-nothing");
  const removal = applyRemoval({ rootDir: dir });
  assert.equal(removal.status, "nothing-to-remove");
});

test("planInstall then applyInstall: reinstalling over our OWN prior install upgrades cleanly", () => {
  const { dir } = freshRepo("reinstall-own");
  const first = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(first.status, "installed");
  const plan = planInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(plan.status, "ready-to-upgrade");
  const second = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(second.status, "installed");
});

// ---- generated content sanity -----------------------------------------------------------

test("renderShim: execs the impl file with an absolute, JSON-quoted path", () => {
  const shim = renderShim("/abs/path/impl.mjs");
  assert.match(shim, /^#!\/bin\/sh/);
  assert.match(shim, /exec node "\/abs\/path\/impl\.mjs" "\$@"/);
});

test("renderImpl: the agent-facing refusal marks any override as human-operator-only, without naming the bypass flag as an instruction", () => {
  const impl = renderImpl(PLUGIN_DIRS);
  const blockStart = impl.indexOf("function block(lines) {");
  const blockEnd = impl.indexOf("\n}\n", blockStart);
  assert.ok(blockStart !== -1 && blockEnd !== -1, "block()'s own function body must be present in the generated source");
  const printedRefusal = impl.slice(blockStart, blockEnd);
  assert.doesNotMatch(printedRefusal, /--no-verify/, "the printed refusal must never teach the exact bypass flag");
  assert.match(printedRefusal, /HUMAN OPERATOR ONLY/);
  assert.match(printedRefusal, /agent MUST NOT/);
});

// ---- decline recording --------------------------------------------------------------------

test("applyDecline: records a decline marker with a timestamp, no name/credential", () => {
  const { dir } = freshRepo("decline-record");
  const result = applyDecline({ rootDir: dir });
  assert.equal(result.status, "declined");
  assert.match(result.declinedAt, /^\d{4}-\d{2}-\d{2}T/);
  const commonDir = commonDirOf(dir);
  const markerPath = join(commonDir, "agent-pipeline", "pre-commit-hook", "decline-marker.json");
  assert.ok(existsSync(markerPath));
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(marker.schema, DECLINE_MARKER_SCHEMA);
  assert.deepEqual(Object.keys(marker).sort(), ["declinedAt", "schema"]);
});

test("planDecline: read-only, repository-unresolved when no git repo present", () => {
  const dir = mkdtempSync(join(tmpdir(), "pre-commit-hook-plandecline-norepo-"));
  const plan = planDecline({ rootDir: dir });
  assert.equal(plan.status, "repository-unresolved");
});

test("planInstall: reports 'declined' distinctly from 'ready' after a decline is recorded", () => {
  const { dir } = freshRepo("decline-then-plan");
  const before = planInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(before.status, "ready");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const after = planInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(after.status, "declined");
  assert.equal(after.declinedAt, decline.declinedAt);
});

test("applyInstall: installing after a decline succeeds (declining is not a permanent refusal)", () => {
  const { dir } = freshRepo("decline-then-install");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed");
  assert.ok(existsSync(install.hookPath));
});

test("planInstall: a decline marker never suppresses an already-installed hook", () => {
  const { dir } = freshRepo("decline-does-not-suppress-installed");
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const plan = planInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(plan.status, "ready-to-upgrade");
  assert.notEqual(plan.status, "declined");
});

// ---- handover-size companion check (NVA-B-HANDOVERPATH, 2026-09-01, backlog/items/
// 2026-09-01-the-handover-size-guard-only-sees-one-of-two-write-paths.md) --------------------
//
// guard-handover-size.mjs (a PreToolUse hook) only ever sees an Edit/Write/NotebookEdit tool
// call, never a Bash-spawned Node script writing the handover file directly. These tests
// exercise the SAME size-cap rule re-evaluated at this hook's own commit boundary, where
// every write lane converges regardless of which tool produced the staged content. All use a
// small test-only `maxBytes` (via `.claude/pipeline.json`'s `handover` calibration key) to
// keep fixture content short and readable -- never the real `HANDOVER_MAX_BYTES` constant.

// ---- pure helpers (real generated impl) -----------------------------------------------

test("gitObjectBytes: absent at HEAD (never committed) -> present:false, ok:true, bytes:0", async () => {
  const { gitObjectBytes } = await implModule();
  const { dir } = freshRepo("handover-bytes-absent-head");
  const result = gitObjectBytes(dir, "HEAD:docs/state.md");
  assert.deepEqual(result, { present: false, ok: true, bytes: 0 });
});

test("gitObjectBytes: present blob -> ok:true, bytes matches the exact utf8 byte length", async () => {
  const { gitObjectBytes } = await implModule();
  const { dir, git } = freshRepo("handover-bytes-present");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "hällo\n"); // multi-byte utf8 on purpose
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "add docs/state.md");
  const result = gitObjectBytes(dir, "HEAD:docs/state.md");
  assert.equal(result.present, true);
  assert.equal(result.ok, true);
  assert.equal(result.bytes, Buffer.byteLength("hällo\n", "utf8"));
});

test("handoverSizeFinding: a net decrease relative to HEAD is never blocked, regardless of absolute size", async () => {
  const { handoverSizeFinding } = await implModule();
  const { dir, git } = freshRepo("handover-finding-decrease");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "Y".repeat(100));
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed large handover file");
  writeFileSync(join(dir, "docs", "state.md"), "Y".repeat(80));
  git("add", "docs/state.md");
  const finding = handoverSizeFinding(dir, "docs/state.md", 40);
  assert.deepEqual(finding, { measurable: true, blocked: false });
});

test("handoverSizeFinding: at/over cap and not a decrease -> blocked, naming current/proposed/max bytes", async () => {
  const { handoverSizeFinding } = await implModule();
  const { dir, git } = freshRepo("handover-finding-blocked");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed small handover file");
  writeFileSync(join(dir, "docs", "state.md"), "Y".repeat(50));
  git("add", "docs/state.md");
  const finding = handoverSizeFinding(dir, "docs/state.md", 40);
  assert.equal(finding.measurable, true);
  assert.equal(finding.blocked, true);
  assert.equal(finding.currentBytes, Buffer.byteLength("short\n", "utf8"));
  assert.equal(finding.proposedBytes, 50);
  assert.equal(finding.maxBytes, 40);
});

test("handoverSizeFinding: below cap and not a decrease -> not blocked (unaffected default behaviour)", async () => {
  const { handoverSizeFinding } = await implModule();
  const { dir, git } = freshRepo("handover-finding-below-cap");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed small handover file");
  writeFileSync(join(dir, "docs", "state.md"), "still short\n");
  git("add", "docs/state.md");
  const finding = handoverSizeFinding(dir, "docs/state.md", 40);
  assert.deepEqual(finding, { measurable: true, blocked: false });
});

// ---- end-to-end: a real `git commit` against the installed hook -----------------------

test("installed hook: a spawned Node process growing the handover file past its cap (never crossing any PreToolUse hook) is refused at commit", () => {
  // AC-2: the Bash/Node lane the backlog item reports as unseen by guard-handover-size.mjs
  // (a PreToolUse hook) is caught here instead, at the commit boundary.
  const { dir, git } = freshRepo("e2e-handover-bash-lane-block");
  writeHandoverCalibration(dir, { path: "docs/state.md", maxBytes: 40 });
  git("add", ".claude/pipeline.json");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed calibration and a small handover file (no hook installed yet)");
  installHook(dir);
  const target = join(dir, "docs", "state.md");
  const bypass = spawnSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(target)}, "X".repeat(80) + "\\n")`], { encoding: "utf8" });
  assert.equal(bypass.status, 0, "the bypass write itself must succeed -- it never crosses any PreToolUse hook");
  git("add", "docs/state.md");
  const { code, stderr } = commit(dir, "attempt via spawned bypass growing past the handover cap");
  assert.notEqual(code, 0);
  assert.match(stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/);
  assert.match(stderr, /docs\/state\.md/);
  assert.match(stderr, /hard size cap/);
});

test("installed hook: a commit that shrinks the handover file is allowed even while the file remains over its cap after the shrink", () => {
  // AC-3: the escape route that makes an over-cap file repairable must survive -- a shrink is
  // admitted even when the resulting size is STILL over the cap.
  const { dir, git } = freshRepo("e2e-handover-shrink-allowed");
  writeHandoverCalibration(dir, { path: "docs/state.md", maxBytes: 40 });
  git("add", ".claude/pipeline.json");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "Y".repeat(100) + "\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed an already-over-cap handover file (no hook installed yet)");
  installHook(dir);
  writeFileSync(join(dir, "docs", "state.md"), "Y".repeat(80) + "\n"); // smaller, still over the 40-byte cap
  git("add", "docs/state.md");
  const { code, stderr } = commit(dir, "shrink the handover file (still over cap, but smaller)");
  assert.equal(code, 0, stderr);
});

test("installed hook: staged handover file below cap and not a decrease -- commit allowed (unaffected default behaviour)", () => {
  const { dir, git } = freshRepo("e2e-handover-below-cap-allowed");
  writeHandoverCalibration(dir, { path: "docs/state.md", maxBytes: 40 });
  git("add", ".claude/pipeline.json");
  installHook(dir);
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  const { code, stderr } = commit(dir, "genesis write of a small handover file");
  assert.equal(code, 0, stderr);
});

test("installed hook: the handover-size measurement module is broken -- commit refused, never silently allowed", () => {
  // AC-4 (module cannot be loaded): the same fail-closed doctrine this file's protected-path
  // import already used before this dispatch, now also covering the handover-config import.
  const { dir, git } = freshRepo("e2e-handover-module-broken");
  const brokenPluginRoot = mkdtempSync(join(tmpdir(), "pre-commit-hook-broken-handover-plugin-"));
  for (const name of ["lib", "hooks", "scripts", "config", "schemas", "protected-baseline.json"])
    cpSync(join(PLUGIN_ROOT, name), join(brokenPluginRoot, name), { recursive: true });
  const brokenLibDir = join(brokenPluginRoot, "lib");
  writeFileSync(join(brokenLibDir, "handover-rotation.mjs"), "throw new Error('intentionally broken for NVA-B-HANDOVERPATH fail-closed test');\n");
  const install = applyInstall({ rootDir: dir, pluginLibDir: brokenLibDir, pluginHooksDir: join(brokenPluginRoot, "hooks"), pluginScriptsDir: join(brokenPluginRoot, "scripts") });
  assert.equal(install.status, "installed");
  writeFileSync(join(dir, "notes.txt"), "anything, not even the handover file\n");
  git("add", "notes.txt");
  const { code, stderr } = commit(dir, "any commit while the handover-rotation module is broken");
  assert.notEqual(code, 0);
  assert.match(stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/);
  assert.match(stderr, /could not be loaded/);
});

test("installed hook: a commit shrinking a handover file whose COMMITTED (HEAD) version exceeds 1 MiB is admitted, not blocked by the inability to read HEAD's content", () => {
  // AC-1/AC-3 (NVA-B-HANDOVERPATH-FIX): reproduces and then pins the fix for the defect this
  // dispatch closes. handoverSizeFinding() reads the committed (HEAD) size FIRST, via
  // gitObjectBytes(). Before this fix, that read went through `git show` piped through
  // spawnSync's default 1 MiB stdout buffer -- a HEAD blob over 1 MiB therefore failed to be
  // read at all, and the whole finding came back unmeasurable BEFORE the decrease check (the
  // escape route the cap's own design depends on) was ever reached, so a shrinking commit had
  // no way to unblock itself. The oversized HEAD blob is committed BEFORE the hook is
  // installed, matching the realistic onboarding precondition the registry names: the cap is
  // small (30,000 bytes in production) and the file that motivates installing the hook is the
  // one most likely to already be pathological.
  const { dir, git } = freshRepo("e2e-handover-head-oversized-shrink-allowed");
  writeHandoverCalibration(dir, { path: "docs/state.md", maxBytes: 40 });
  git("add", ".claude/pipeline.json");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "Q".repeat(2 * 1024 * 1024)); // 2 MiB committed HEAD version
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed calibration and an oversized committed handover file (no hook installed yet)");
  installHook(dir);
  writeFileSync(join(dir, "docs", "state.md"), "short\n"); // far below cap, and a genuine shrink
  git("add", "docs/state.md");
  const { code, stderr } = commit(dir, "shrink the oversized handover file");
  assert.equal(code, 0, stderr);
});

test("installed hook: a staged handover file far larger than 1 MiB is measured EXACTLY (no output-buffer ceiling) and refused for genuinely being over cap", () => {
  // AC-2/AC-3 (NVA-B-HANDOVERPATH-FIX): before the fix, this exact 2 MiB fixture exceeded
  // spawnSync's default 1 MiB stdout buffer when read via `git show`, and gitObjectBytes()
  // reported ok:false -- the commit failed closed as "could not have its size measured", NOT
  // because the file was over cap but because the OLD implementation could not read it at all.
  // `git cat-file -s` never emits the object's content, only its exact byte count, so a 2 MiB
  // blob is now measured precisely (asserted below via the exact byte count in the refusal
  // message) and refused for the real, correct reason: it is not a decrease and is over cap.
  const { dir, git } = freshRepo("e2e-handover-large-staged-measured-exactly");
  writeHandoverCalibration(dir, { path: "docs/state.md", maxBytes: 40 });
  git("add", ".claude/pipeline.json");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed calibration and a small handover file (no hook installed yet)");
  installHook(dir);
  const oversized = "Q".repeat(2 * 1024 * 1024); // 2 MiB > spawnSync's default 1 MiB maxBuffer
  writeFileSync(join(dir, "docs", "state.md"), oversized);
  git("add", "docs/state.md");
  const { code, stderr } = commit(dir, "stage a 2 MiB handover file, far past any output-buffer ceiling");
  assert.notEqual(code, 0);
  assert.match(stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/);
  assert.match(stderr, /hard size cap/);
  assert.doesNotMatch(stderr, /could not have its size measured/, "must be refused for being over cap, not for being unmeasurable");
  assert.match(stderr, new RegExp(`Staged size: ${Buffer.byteLength(oversized, "utf8")} bytes`), "the exact byte count must appear -- proves no truncation through any output buffer");
});

// AC-4's genuinely-unmeasurable case is pinned at the PURE-HELPER level (gitObjectBytes /
// handoverSizeFinding), not as a full e2e `git commit` the way the buffer-artifact test used to
// be: a direct probe (scratch/probe-corrupted-head-e2e.mjs, scratch/probe-corrupted-staged-e2e.mjs
// during this dispatch) confirmed that git's OWN `add`/`commit` machinery already refuses a
// corrupted object outright (exit 128, "loose object ... is corrupt", raised by git itself)
// before this hook ever runs -- so a full e2e commit against a corrupted repository cannot
// observe this hook's own BLOCKED output at all, only git's unrelated fatal error. The pure
// helpers below call the identical `git cat-file -e`/`-s` sequence `gitObjectBytes` uses
// WITHOUT going through `git add`/`git commit` again, which is exactly what still lets the
// corrupted-object case be exercised deterministically.

test("gitObjectBytes: present blob whose object is corrupted on disk -> ok:false (fail closed, never a silent measurement)", async () => {
  const { gitObjectBytes } = await implModule();
  const { dir, git } = freshRepo("handover-bytes-corrupted");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "add docs/state.md");

  const shaRes = spawnSync("git", ["rev-parse", "HEAD:docs/state.md"], { cwd: dir, encoding: "utf8" });
  const sha = shaRes.stdout.trim();
  const commonDir = commonDirOf(dir);
  const objPath = join(commonDir, "objects", sha.slice(0, 2), sha.slice(2));
  const before = readFileSync(objPath);
  const corrupted = Buffer.from(before);
  for (let i = 5; i < Math.min(15, corrupted.length); i++) corrupted[i] = corrupted[i] ^ 0xff;
  chmodSync(objPath, 0o644);
  writeFileSync(objPath, corrupted);

  // Confirm the precondition this test depends on: the object is still reported PRESENT
  // (existence does not require successfully inflating the zlib stream) even though it is
  // corrupted -- this is what makes present:true, ok:false reachable at all.
  const existsCheck = spawnSync("git", ["cat-file", "-e", "HEAD:docs/state.md"], { cwd: dir, encoding: "utf8" });
  assert.equal(existsCheck.status, 0, "precondition: cat-file -e must still see the corrupted object as present");

  const result = gitObjectBytes(dir, "HEAD:docs/state.md");
  assert.deepEqual(result, { present: true, ok: false, bytes: null });
});

test("handoverSizeFinding: the committed (HEAD) blob is corrupted -> measurable:false, never a silent allow", async () => {
  const { handoverSizeFinding } = await implModule();
  const { dir, git } = freshRepo("handover-finding-head-corrupted");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "add docs/state.md");

  const shaRes = spawnSync("git", ["rev-parse", "HEAD:docs/state.md"], { cwd: dir, encoding: "utf8" });
  const sha = shaRes.stdout.trim();
  const commonDir = commonDirOf(dir);
  const objPath = join(commonDir, "objects", sha.slice(0, 2), sha.slice(2));
  const before = readFileSync(objPath);
  const corrupted = Buffer.from(before);
  for (let i = 5; i < Math.min(15, corrupted.length); i++) corrupted[i] = corrupted[i] ^ 0xff;
  chmodSync(objPath, 0o644);
  writeFileSync(objPath, corrupted);

  const finding = handoverSizeFinding(dir, "docs/state.md", 40);
  assert.equal(finding.measurable, false);
  assert.match(finding.detail, /committed \(HEAD\) version/);
});

test("handoverSizeFinding: the staged (index) blob is corrupted -> measurable:false, never a silent allow (NVA-B-STAGEDPIN)", async () => {
  // The HEAD-side branch is exercised by the corrupted-HEAD test above; this pins the sibling
  // branch handoverSizeFinding() takes when HEAD reads fine but the STAGED (index) revspec
  // (`:<relPath>`) cannot have its size established. HEAD must stay small and uncorrupted so
  // the first `!current.ok` branch is never taken -- otherwise this test would silently pin the
  // HEAD branch a second time instead of the staged branch it targets.
  const { handoverSizeFinding } = await implModule();
  const { dir, git } = freshRepo("handover-finding-staged-corrupted");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "add docs/state.md"); // committed (HEAD) version stays small and clean

  // Stage a DIFFERENT version so a new, distinct blob object is written for the index.
  writeFileSync(join(dir, "docs", "state.md"), "a different staged version\n");
  git("add", "docs/state.md");

  const shaRes = spawnSync("git", ["rev-parse", ":docs/state.md"], { cwd: dir, encoding: "utf8" });
  const sha = shaRes.stdout.trim();
  const commonDir = commonDirOf(dir);
  const objPath = join(commonDir, "objects", sha.slice(0, 2), sha.slice(2));
  const before = readFileSync(objPath);
  const corrupted = Buffer.from(before);
  for (let i = 5; i < Math.min(15, corrupted.length); i++) corrupted[i] = corrupted[i] ^ 0xff;
  chmodSync(objPath, 0o644);
  writeFileSync(objPath, corrupted);

  // Confirm the precondition this test depends on: the staged object is still reported PRESENT
  // (existence does not require successfully inflating the zlib stream) even though it is
  // corrupted -- this is what makes the staged-side present:true, ok:false branch reachable at
  // all. Also confirm HEAD's own blob is untouched, so a future accident that corrupts the wrong
  // object cannot make this test vacuously exercise the HEAD branch instead.
  const stagedExistsCheck = spawnSync("git", ["cat-file", "-e", ":docs/state.md"], { cwd: dir, encoding: "utf8" });
  assert.equal(stagedExistsCheck.status, 0, "precondition: cat-file -e must still see the corrupted staged object as present");
  const headExistsCheck = spawnSync("git", ["cat-file", "-e", "HEAD:docs/state.md"], { cwd: dir, encoding: "utf8" });
  assert.equal(headExistsCheck.status, 0, "precondition: the committed HEAD object must remain readable and uncorrupted");

  const finding = handoverSizeFinding(dir, "docs/state.md", 40);
  assert.equal(finding.measurable, false);
  assert.match(finding.detail, /staged \(index\) version/, "detail must name the staged/index side specifically, not the HEAD side");
});

test("installed hook: non-UTF-8 content in the handover file is measured as its exact raw byte length, not as re-encoded characters", () => {
  // AC-5: pins the encoding half of F-1. The OLD implementation decoded `git show`'s stdout
  // with Node's `encoding: 'utf8'`, which replaces an invalid byte sequence with U+FFFD
  // (re-encoding at 3 bytes) before `Buffer.byteLength` ever ran -- a byte-level measurement
  // corrupted by decode-then-re-encode. `git cat-file -s` never decodes anything; it reports
  // the object's own recorded size, so this fixture's raw byte count (computed from the exact
  // bytes written, never from a decoded JS string) must match exactly.
  const { dir, git } = freshRepo("e2e-handover-non-utf8-exact-bytes");
  writeHandoverCalibration(dir, { path: "docs/state.md", maxBytes: 4 * 1024 * 1024 });
  git("add", ".claude/pipeline.json");
  mkdirSync(join(dir, "docs"), { recursive: true });
  // Invalid UTF-8: a lone continuation byte (0x80) and a byte that can never start a valid
  // UTF-8 sequence (0xFF), interleaved with ASCII so the fixture is not merely "all garbage".
  const invalidBytes = Buffer.from([0x68, 0x69, 0x80, 0xff, 0x80, 0xff, 0x6a, 0x6b]);
  writeFileSync(join(dir, "docs", "state.md"), invalidBytes);
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed calibration and a non-UTF-8 handover file (no hook installed yet)");
  installHook(dir);
  // Grow it (still invalid UTF-8) so the commit-boundary check actually evaluates the cap
  // rather than taking the always-admitted decrease branch.
  const grownInvalid = Buffer.concat([invalidBytes, Buffer.from([0x80, 0xff, 0x80, 0xff])]);
  writeFileSync(join(dir, "docs", "state.md"), grownInvalid);
  git("add", "docs/state.md");
  const { code, stderr } = commit(dir, "grow the non-UTF-8 handover file");
  assert.equal(code, 0, stderr); // below the 4 MiB test cap -- this just proves measurement did not throw/misbehave on invalid UTF-8

  // Directly assert the exact-byte-count property via `git cat-file -s`, against the raw buffer
  // length of the now-committed (grown) content (never a decoded-and-re-encoded string).
  const sizeRes = spawnSync("git", ["cat-file", "-s", "HEAD:docs/state.md"], { cwd: dir, encoding: "utf8" });
  assert.equal(Number(sizeRes.stdout.trim()), grownInvalid.length);
});

test("installed hook: a non-canonical but valid calibration path spelling for the handover file is still matched at the commit boundary", () => {
  // AC-6 (F-2): resolveHandoverConfig() applies no normalization to `handover.path`, so a
  // calibration authored with a leading "./" must still resolve to the SAME absolute path as
  // the canonical git-relative spelling the staged-paths list actually carries, matching
  // guard-handover-size.mjs's own resolved-path comparison. Before the fix, raw string equality
  // (`paths.includes(handoverConfig.path)`) silently never matched this spelling and the check
  // was skipped entirely -- no block, no diagnostic.
  const { dir, git } = freshRepo("e2e-handover-noncanonical-path-spelling");
  writeHandoverCalibration(dir, { path: "./docs/state.md", maxBytes: 40 });
  git("add", ".claude/pipeline.json");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "short\n");
  git("add", "docs/state.md");
  git("commit", "-q", "-m", "seed calibration (non-canonical path spelling) and a small handover file (no hook installed yet)");
  installHook(dir);
  const target = join(dir, "docs", "state.md");
  const bypass = spawnSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(target)}, "X".repeat(80) + "\\n")`], { encoding: "utf8" });
  assert.equal(bypass.status, 0, "the bypass write itself must succeed -- it never crosses any PreToolUse hook");
  git("add", "docs/state.md");
  const { code, stderr } = commit(dir, "attempt to grow the handover file past cap while calibration spells its path non-canonically");
  assert.notEqual(code, 0, "must still be blocked -- a non-canonical calibration spelling must not silently escape the check");
  assert.match(stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/);
  assert.match(stderr, /hard size cap/);
});
