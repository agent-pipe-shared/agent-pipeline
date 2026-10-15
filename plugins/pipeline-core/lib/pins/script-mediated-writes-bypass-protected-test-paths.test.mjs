// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: pipeline.script-mediated-writes-bypass-protected-test-paths (AC-248, ALF-C-P5-05).
 *
 * Original acceptance (backlog/items/2026-10-05-script-mediated-writes-bypass-protected-test-paths.md):
 *   A1  Protected-path integrity is enforced independent of the write channel (post-hoc integrity
 *       check against pins, or a pre-commit check).
 *   A2  A regression test reproduces the codemod shape (a node script that rewrites a protected
 *       test file) and shows it is detected or refused.
 *
 * Cases (all through the REAL modules / a REAL `git commit` with the REAL installed hook; the only
 * seams used are the modules' documented ones: explicit baselinePath, hasConsumedCapabilityForPath,
 * testPathRules, gateStrengthPaths, plugin dir overrides):
 *   L1-*  Layer 1  scripts/check-protected-path-integrity.mjs  (detect after the fact)
 *   L2-*  Layer 2  scripts/pre-commit-hook-install.mjs         (refuse at the commit boundary)
 *   RED-* the same assertions fail against a scratch MIRROR of the production function that has
 *         one guard removed (production is never edited).
 *
 * Fixtures live under the repository's scratch/ (host fact: not the OS temp dir). The real
 * protected suite plugins/pipeline-core/hooks/guard-testpath.test.mjs is only ever hashed, never written.
 *
 * Host limitations (typed): none of these cases needs directory mode bits or directory symlinks.
 * The one environment-dependent case (shell-redirect shape) is skipped with a typed reason when no
 * POSIX `sh` is on PATH; owner Coordinator, due 2026-10-19 (PO decision K7) for the Linux/WSL run.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";

import {
  FINDING_CODE,
  compareAgainstBaseline,
  defaultHasConsumedCapabilityForPath,
  recordBaseline,
  resolveGitCommonDir,
} from "../../scripts/check-protected-path-integrity.mjs";
import { applyInstall } from "../../scripts/pre-commit-hook-install.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";

const LIVE_PLUGIN_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const REPO_ROOT = resolve(LIVE_PLUGIN_ROOT, "..", "..");
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });
const WORK = mkdtempSync(join(SCRATCH_ROOT, "script-mediated-pin-"));
after(() => { rmSync(WORK, { recursive: true, force: true, maxRetries: 5 }); });

const HOST_LIMITATION = Object.freeze({ owner: "Coordinator", due: "2026-10-19", decision: "K7" });
const REAL_PROTECTED_SUITE = join(LIVE_PLUGIN_ROOT, "hooks", "guard-testpath.test.mjs");
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const REAL_SUITE_SHA_BEFORE = sha(REAL_PROTECTED_SUITE);

// The codemod target, with the REAL TP-2 spelling (templates/prompts/agent-obligations.md section 2).
const TP2_REL = "plugins/pipeline-core/hooks/guard-testpath.test.mjs";
const TP2_RULE = { id: "TP-2", pattern: "plugins/pipeline-core/hooks/guard-testpath\\.test\\.mjs$", reason: "fixture TP-2 protected suite" };
const tpRule = { id: TP2_RULE.id, re: new RegExp(TP2_RULE.pattern, "iu"), reason: TP2_RULE.reason };

let counter = 0;
function fixtureDir(label) {
  const dir = join(WORK, `${label}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function put(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}
/** The codemod shape from the report: an agent-authored `node <script>.mjs` rewriting the suite. */
function writeCodemod(root) {
  return put(root, "codemod.mjs", [
    "import { readFileSync, writeFileSync } from 'node:fs';",
    "const [target] = process.argv.slice(2);",
    "writeFileSync(target, readFileSync(target, 'utf8').replace('ORIGINAL', 'CODEMODDED'));",
    "",
  ].join("\n"));
}
function runCodemod(script, target) {
  const run = spawnSync(process.execPath, [script, target], { encoding: "utf8" });
  assert.equal(run.status, 0, `codemod must run cleanly (stderr: ${run.stderr})`);
}
function layer1Fixture(label) {
  const root = fixtureDir(label);
  const target = put(root, TP2_REL, "// ORIGINAL protected suite\n");
  const baselinePath = join(root, "baseline.json");
  const rec = recordBaseline({ rootDir: root, baselinePath, gateStrengthPaths: [], testPathRules: [tpRule] });
  assert.equal(rec.status, "recorded");
  assert.deepEqual(rec.baseline.entries.map((e) => e.path), [TP2_REL], "the TP-2 suite is enumerated from the rule, not a second list");
  return { root, target, baselinePath };
}

// ---------------------------------------------------------------------------------------------
// Layer 1 -- A1 + A2 (detection independent of write channel)
// ---------------------------------------------------------------------------------------------

test("L1-codemod: a node script that rewrites a protected test file is detected (A1, A2)", () => {
  const { root, target, baselinePath } = layer1Fixture("l1-codemod");
  runCodemod(writeCodemod(root), target);
  assert.match(readFileSync(target, "utf8"), /CODEMODDED/, "precondition: the bypass really landed");
  const result = compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].code, FINDING_CODE);
  assert.equal(result.findings[0].id, "TP-2");
  assert.equal(result.findings[0].path, TP2_REL);
  assert.notEqual(result.findings[0].baselineSha256, result.findings[0].currentSha256);
});

test("L1-channel-independence: detection is by content, so a different interpreter/channel is detected identically (A1)", () => {
  const { root, target, baselinePath } = layer1Fixture("l1-channel");
  // Different channel: node -e (no script file at all) instead of a script.
  const run = spawnSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(target)}, "// rewritten via -e\\n")`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const result = compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].path, TP2_REL);
});

const SH_AVAILABLE = spawnSync("sh", ["-c", "exit 0"], { encoding: "utf8" }).status === 0;
test("L1-shell-redirect: a shell redirect issued inside a spawned script is detected (A1)", {
  skip: SH_AVAILABLE ? false : `host-limitation: no POSIX sh on PATH; owner ${HOST_LIMITATION.owner}, due ${HOST_LIMITATION.due} (PO decision ${HOST_LIMITATION.decision}) Linux/WSL run`,
}, () => {
  const { root, target, baselinePath } = layer1Fixture("l1-redirect");
  const script = put(root, "redir.mjs", [
    "import { execFileSync } from 'node:child_process';",
    "execFileSync('sh', ['-c', `printf %s redirected > \"$0\"`, process.argv[2]]);",
    "",
  ].join("\n"));
  runCodemod(script, target);
  const result = compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].path, TP2_REL);
});

test("L1-unchanged: an unmodified protected path yields no finding", () => {
  const { root, baselinePath } = layer1Fixture("l1-unchanged");
  const result = compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.checked, 1);
});

test("L1-no-baseline: comparing without a recorded baseline fails closed (ok:false), never a silent pass", () => {
  const root = fixtureDir("l1-nobase");
  const result = compareAgainstBaseline({ rootDir: root, baselinePath: join(root, "never.json") });
  assert.equal(result.status, "no-baseline");
  assert.equal(result.ok, false);
});

test("L1-authorized: a real CONSUMED capability covering the exact path suppresses the finding; armed, other-path and expired ones do not", () => {
  const { root, target, baselinePath } = layer1Fixture("l1-auth");
  assert.equal(spawnSync("git", ["init", "-q", root], { encoding: "utf8" }).status, 0);
  const caps = join(resolveGitCommonDir(root), "agent-pipeline", "human-guard-overrides", "capabilities");
  mkdirSync(caps, { recursive: true });
  runCodemod(writeCodemod(root), target);
  const check = () => compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: defaultHasConsumedCapabilityForPath });
  assert.equal(check().ok, false, "no capability -> finding");
  writeFileSync(join(caps, "armed.json"), JSON.stringify({ status: "armed", eligiblePaths: [TP2_REL] }));
  assert.equal(check().ok, false, "armed (not consumed) does not authorize");
  writeFileSync(join(caps, "other.json"), JSON.stringify({ status: "consumed", eligiblePaths: ["some/other.test.mjs"] }));
  assert.equal(check().ok, false, "consumed for a different path does not authorize");
  writeFileSync(join(caps, "expired.json"), JSON.stringify({ status: "consumed", eligiblePaths: [TP2_REL], expiresAt: "2020-01-01T00:00:00.000Z" }));
  assert.equal(check().ok, false, "consumed but already-expired does not authorize");
  writeFileSync(join(caps, "good.json"), JSON.stringify({ status: "consumed", eligiblePaths: [TP2_REL], expiresAt: "2999-01-01T00:00:00.000Z" }));
  assert.equal(check().ok, true, "consumed, exact path, unexpired authorizes");
});

// ---------------------------------------------------------------------------------------------
// Layer 2 -- A1 (enforcement at the commit boundary) + A2 (codemod refused at commit)
// ---------------------------------------------------------------------------------------------

// Frozen copy of the plugin root (as the adjacent pre-commit-hook-install suite does), so a parallel
// writer into the live tree cannot fail the installer's snapshot inventory.
const PLUGIN_COPY = join(WORK, "plugin-copy");
let pluginCopied = false;
function pluginDirs() {
  if (!pluginCopied) {
    cpSync(LIVE_PLUGIN_ROOT, PLUGIN_COPY, { recursive: true });
    pluginCopied = true;
  }
  return { pluginLibDir: join(PLUGIN_COPY, "lib"), pluginHooksDir: join(PLUGIN_COPY, "hooks"), pluginScriptsDir: join(PLUGIN_COPY, "scripts") };
}

function enrolledRepo(label) {
  const dir = fixtureDir(label);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 30000 });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const governance = createGovernanceScopeController({ hostStateRoot: join(dir, "unused-host") });
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "script-mediated-pin" });
  assert.equal(governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  put(dir, ".claude/guard-config.json", JSON.stringify({ protectedTestPaths: [{ pattern: TP2_RULE.pattern, reason: TP2_RULE.reason, id: TP2_RULE.id }] }));
  put(dir, TP2_REL, "// ORIGINAL protected suite\n");
  git("add", ".claude/guard-config.json", TP2_REL);
  assert.equal(git("commit", "-q", "-m", "seed protected suite (hook not yet installed)").status, 0);
  const install = applyInstall({ rootDir: dir, ...pluginDirs() });
  assert.equal(install.status, "installed", JSON.stringify(install));
  return { dir, git };
}
const commit = (dir, message) => {
  const r = spawnSync("git", ["commit", "-m", message], { cwd: dir, encoding: "utf8", timeout: 60000 });
  return { code: r.status, stderr: r.stderr ?? "" };
};

test("L2-codemod-refused: the codemod rewrite of an already-committed protected suite is refused at `git commit`, HEAD unchanged (A1, A2)", () => {
  const { dir, git } = enrolledRepo("l2-refused");
  const headBefore = git("rev-parse", "HEAD").stdout.trim();
  runCodemod(writeCodemod(dir), join(dir, TP2_REL));
  git("add", TP2_REL);
  const { code, stderr } = commit(dir, "attempt codemod rewrite");
  assert.notEqual(code, 0);
  assert.match(stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/);
  assert.match(stderr, /TP-2/);
  assert.match(stderr, /guard-testpath\.test\.mjs/);
  assert.equal(git("rev-parse", "HEAD").stdout.trim(), headBefore, "no commit was created");
});

test("L2-authorized: the same rewrite with a matching CONSUMED capability is admitted", () => {
  const { dir, git } = enrolledRepo("l2-authorized");
  const caps = join(resolveGitCommonDir(dir), "agent-pipeline", "human-guard-overrides", "capabilities");
  mkdirSync(caps, { recursive: true });
  writeFileSync(join(caps, "cap.json"), JSON.stringify({ status: "consumed", eligiblePaths: [TP2_REL], expiresAt: "2999-01-01T00:00:00.000Z" }));
  runCodemod(writeCodemod(dir), join(dir, TP2_REL));
  git("add", TP2_REL);
  const { code, stderr } = commit(dir, "authorized rewrite");
  assert.equal(code, 0, stderr);
});

test("L2-expired-capability: a consumed-but-expired capability does not admit the rewrite", () => {
  const { dir, git } = enrolledRepo("l2-expired");
  const caps = join(resolveGitCommonDir(dir), "agent-pipeline", "human-guard-overrides", "capabilities");
  mkdirSync(caps, { recursive: true });
  writeFileSync(join(caps, "cap.json"), JSON.stringify({ status: "consumed", eligiblePaths: [TP2_REL], expiresAt: "2020-01-01T00:00:00.000Z" }));
  runCodemod(writeCodemod(dir), join(dir, TP2_REL));
  git("add", TP2_REL);
  const { code, stderr } = commit(dir, "expired-authority rewrite");
  assert.notEqual(code, 0);
  assert.match(stderr, /TP-2/);
});

test("L2-unprotected-unaffected: a script rewrite of an ordinary file commits normally (scope containment)", () => {
  const { dir, git } = enrolledRepo("l2-ordinary");
  put(dir, "ordinary.txt", "ORIGINAL\n");
  git("add", "ordinary.txt");
  assert.equal(commit(dir, "seed ordinary").code, 0);
  runCodemod(writeCodemod(dir), join(dir, "ordinary.txt"));
  git("add", "ordinary.txt");
  const { code, stderr } = commit(dir, "script edit of ordinary file");
  assert.equal(code, 0, stderr);
});

// ---------------------------------------------------------------------------------------------
// RED proofs -- scratch mirrors of the production functions with one guard removed
// ---------------------------------------------------------------------------------------------

async function loadMirror(label, transform) {
  const srcPath = join(LIVE_PLUGIN_ROOT, "scripts", "check-protected-path-integrity.mjs");
  const original = readFileSync(srcPath, "utf8");
  const pluginUrl = pathToFileURL(LIVE_PLUGIN_ROOT).href;
  let text = original.replace(/from "\.\.\//gu, `from "${pluginUrl}/`);
  const mutated = transform(text);
  assert.notEqual(mutated, text, `RED mirror ${label}: the mutation must actually change the source (production drifted?)`);
  const mirrorPath = join(WORK, `mirror-${label}.mjs`);
  writeFileSync(mirrorPath, mutated, "utf8");
  return import(pathToFileURL(mirrorPath).href);
}

test("RED-blind-compare: a mirror whose compare ignores digest changes FAILS the codemod-detection assertion", async () => {
  const mirror = await loadMirror("blind", (t) => t.replace("if (currentSha256 === entry.sha256) continue;", "continue;"));
  const { root, target, baselinePath } = layer1Fixture("red-blind");
  runCodemod(writeCodemod(root), target);
  const blind = mirror.compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.throws(() => {
    assert.equal(blind.ok, false);
    assert.equal(blind.findings.length, 1);
  }, assert.AssertionError, "the detection assertion must be RED against the blind mirror");
  const real = compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.equal(real.ok, false, "and GREEN against production");
});

test("RED-no-expiry: a mirror without the expiresAt narrowing FAILS the expired-capability assertion", async () => {
  const mirror = await loadMirror("noexpiry", (t) => t.replace("if (!Number.isNaN(expiresAtMs) && expiresAtMs <= now) continue;", ""));
  const root = fixtureDir("red-noexpiry");
  assert.equal(spawnSync("git", ["init", "-q", root], { encoding: "utf8" }).status, 0);
  const caps = join(resolveGitCommonDir(root), "agent-pipeline", "human-guard-overrides", "capabilities");
  mkdirSync(caps, { recursive: true });
  writeFileSync(join(caps, "e.json"), JSON.stringify({ status: "consumed", eligiblePaths: [TP2_REL], expiresAt: "2020-01-01T00:00:00.000Z" }));
  assert.equal(defaultHasConsumedCapabilityForPath(root, TP2_REL), false, "production: expired does not authorize");
  assert.throws(() => assert.equal(mirror.defaultHasConsumedCapabilityForPath(root, TP2_REL), false), assert.AssertionError);
});

test("RED-silent-no-baseline: a mirror that reports ok:true without a baseline FAILS the fail-closed assertion", async () => {
  const mirror = await loadMirror("nobase", (t) => t.replace('return { status: "no-baseline", ok: false,', 'return { status: "no-baseline", ok: true,'));
  const root = fixtureDir("red-nobase");
  const bad = mirror.compareAgainstBaseline({ rootDir: root, baselinePath: join(root, "never.json") });
  assert.throws(() => assert.equal(bad.ok, false), assert.AssertionError);
});

// ---------------------------------------------------------------------------------------------
// Restore-before-yield: the real protected suite was never mutated by any case above.
// ---------------------------------------------------------------------------------------------

test("real protected suite guard-testpath.test.mjs is byte-identical after every case above", () => {
  assert.equal(existsSync(REAL_PROTECTED_SUITE), true);
  assert.equal(sha(REAL_PROTECTED_SUITE), REAL_SUITE_SHA_BEFORE);
});
