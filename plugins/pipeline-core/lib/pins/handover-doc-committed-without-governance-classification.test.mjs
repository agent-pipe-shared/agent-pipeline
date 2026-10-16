// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.handover-doc-committed-without-governance-classification
 * (Alfred AC-198; backlog/items/2026-10-03-handover-doc-committed-without-governance-classification.md).
 *
 * Original acceptance points (Description / Proposal):
 *   P1  A new docs/*.md (e.g. a handover) must not be committable unclassified in
 *       governance/observation-doc-governance.json.
 *   P2  The observation-governance check runs at commit time (pre-commit hook), so the omission is
 *       caught there rather than at the next bootstrap.
 *   P3  Classifying the document in the SAME staged commit admits it (the check refuses the
 *       omission, not documents in general).
 *   Plus the remaining-work constraints: the verdict is read from the STAGED index and staged
 *   policy (a worktree-only edit authorizes nothing), the same validator authority as Verify is
 *   used, a source checkout with no policy anywhere is not applicable, and every uncertainty
 *   fails closed.
 *
 * Everything runs through the real modules / the real rendered hook against real git repositories
 * under the repository's scratch/ directory. Nothing under test is mocked.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const PLUGIN_ROOT = resolve(HERE, "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
const POLICY = "governance/observation-doc-governance.json";

const { checkStagedObservationDocumentation } = await import(
  pathToFileURL(join(PLUGIN_ROOT, "lib", "staged-observation-doc-classification.mjs")).href
);
const { checkObservationDocumentation } = await import(
  pathToFileURL(join(PLUGIN_ROOT, "lib", "observation-doc-classification.mjs")).href
);
const { createGovernanceScopeController } = await import(pathToFileURL(join(PLUGIN_ROOT, "lib", "governance-scope.mjs")).href);
const { renderImpl, applyInstall } = await import(pathToFileURL(join(PLUGIN_ROOT, "scripts", "pre-commit-hook-install.mjs")).href);

// The real repository policy is the template, so the exact-keys contract is the real one.
const REAL_POLICY = JSON.parse(readFileSync(join(REPO_ROOT, POLICY), "utf8"));
function policyWith(paths) {
  const policy = structuredClone(REAL_POLICY);
  policy.documentation.inventory = paths.length
    ? [{ audience: "maintainer", lifecycle: "maintained", paths: [...paths].sort() }]
    : [];
  return JSON.stringify(policy, null, 2) + "\n";
}

mkdirSync(SCRATCH, { recursive: true });
const created = [];
after(() => { for (const dir of created) rmSync(dir, { recursive: true, force: true }); });

const GIT_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
function git(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 30000, env: GIT_ENV });
}
function put(dir, rel, text) {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}
/** Fresh repo with a committed policy classifying docs/a.md; returns its directory. */
function repo(prefix, { policyCommitted = true } = {}) {
  const dir = mkdtempSync(join(SCRATCH, `alf-c-p1-11-${prefix}-`));
  created.push(dir);
  assert.equal(git(dir, "init", "-q", "-b", "main").status, 0);
  git(dir, "config", "user.email", "fixture@example.invalid");
  git(dir, "config", "user.name", "Fixture");
  git(dir, "config", "core.autocrlf", "false");
  put(dir, "README.md", "fixture\n");
  git(dir, "add", "README.md");
  if (policyCommitted) {
    put(dir, "docs/a.md", "a\n");
    put(dir, POLICY, policyWith(["docs/a.md"]));
    git(dir, "add", "docs/a.md", POLICY);
  }
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);
  return dir;
}

test("P1: a newly staged docs file absent from the staged policy is refused as OG-DOC-UNCLASSIFIED", () => {
  const dir = repo("p1");
  put(dir, "docs/0.7-recovery-handover.md", "handover\n");
  git(dir, "add", "docs/0.7-recovery-handover.md");
  const verdict = checkStagedObservationDocumentation(dir);
  assert.equal(verdict.applicable, true);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.codes, ["OG-DOC-UNCLASSIFIED"]);
});

test("P1b: the staged verdict is produced by the same validator Verify uses (identical code for the same inventory)", () => {
  const direct = checkObservationDocumentation(JSON.parse(policyWith(["docs/a.md"])), ["docs/a.md", "docs/new.md"]);
  assert.equal(direct.ok, false);
  assert.deepEqual(direct.findings, ["OG-DOC-UNCLASSIFIED docs/new.md"]);
  const dir = repo("p1b");
  put(dir, "docs/new.md", "n\n");
  git(dir, "add", "docs/new.md");
  assert.deepEqual(checkStagedObservationDocumentation(dir).codes, ["OG-DOC-UNCLASSIFIED"]);
});

test("P3: classifying the document in the same staged commit admits it", () => {
  const dir = repo("p3");
  put(dir, "docs/0.7-recovery-handover.md", "handover\n");
  put(dir, POLICY, policyWith(["docs/a.md", "docs/0.7-recovery-handover.md"]));
  git(dir, "add", "docs/0.7-recovery-handover.md", POLICY);
  assert.deepEqual(checkStagedObservationDocumentation(dir), { applicable: true, ok: true, codes: [] });
});

test("staged index, not the worktree, decides: a worktree-only policy edit does not authorize a staged doc", () => {
  const dir = repo("worktree-policy");
  put(dir, "docs/new.md", "n\n");
  git(dir, "add", "docs/new.md");
  put(dir, POLICY, policyWith(["docs/a.md", "docs/new.md"])); // classified in the worktree only
  const verdict = checkStagedObservationDocumentation(dir);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.codes, ["OG-DOC-UNCLASSIFIED"]);
});

test("staged index, not the worktree, decides: a worktree-only doc is not judged", () => {
  const dir = repo("worktree-doc");
  put(dir, "docs/untracked-or-unstaged.md", "x\n");
  assert.deepEqual(checkStagedObservationDocumentation(dir), { applicable: true, ok: true, codes: [] });
});

test("a staged policy that classifies a doc which is not staged is refused as stale (inventory exactness)", () => {
  const dir = repo("stale");
  put(dir, POLICY, policyWith(["docs/a.md", "docs/ghost.md"]));
  git(dir, "add", POLICY);
  assert.deepEqual(checkStagedObservationDocumentation(dir).codes, ["OG-DOC-INVENTORY-STALE"]);
});

test("a repository with no policy in index or HEAD is not applicable and is admitted", () => {
  const dir = repo("nopolicy", { policyCommitted: false });
  put(dir, "docs/x.md", "x\n");
  git(dir, "add", "docs/x.md");
  assert.deepEqual(checkStagedObservationDocumentation(dir), { applicable: false, ok: true, codes: [] });
});

test("fail closed: a policy known to HEAD but removed from the index is refused, not skipped", () => {
  const dir = repo("policy-removed");
  assert.equal(git(dir, "rm", "-q", "--cached", POLICY).status, 0);
  put(dir, "docs/new.md", "n\n");
  git(dir, "add", "docs/new.md");
  assert.deepEqual(checkStagedObservationDocumentation(dir).codes, ["OG-POLICY-UNREADABLE"]);
});

test("fail closed: a staged policy that is not valid JSON is refused", () => {
  const dir = repo("policy-garbage");
  put(dir, POLICY, "{ not json\n");
  git(dir, "add", POLICY);
  assert.deepEqual(checkStagedObservationDocumentation(dir).codes, ["OG-POLICY-UNREADABLE"]);
});

test("fail closed: a directory that is not a git repository is refused as index-unavailable", () => {
  const dir = mkdtempSync(join(SCRATCH, "alf-c-p1-11-norepo-"));
  created.push(dir);
  // Pin the fixture to itself: without a .git of its own git would climb into the host repository.
  const verdict = checkStagedObservationDocumentation(join(dir, "does-not-exist"));
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.codes, ["OG-INDEX-UNAVAILABLE"]);
});

test("fail closed: an unmerged (conflict-stage) docs entry is refused", () => {
  const dir = repo("unmerged");
  const oid = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: dir, input: "x\n", encoding: "utf8", env: GIT_ENV }).stdout.trim();
  const stage = (info) => {
    const update = spawnSync("git", ["update-index", "--index-info"], { cwd: dir, input: info, encoding: "utf8", env: GIT_ENV });
    assert.equal(update.status, 0, update.stderr);
  };
  // A lone stage-2 entry is reported as unmerged.
  stage(`100644 ${oid} 2\tdocs/conflict.md\n`);
  assert.deepEqual(checkStagedObservationDocumentation(dir).codes, ["OG-INDEX-UNMERGED"]);
  // A real conflict repeats the path across stages 1-3; that shape is refused too (fail closed), under the
  // index-unavailable code rather than the unmerged code.
  stage(`100644 ${oid} 1\tdocs/conflict.md\n100644 ${oid} 3\tdocs/conflict.md\n`);
  const verdict = checkStagedObservationDocumentation(dir);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.codes, ["OG-INDEX-UNAVAILABLE"]);
});

test("a symlink under docs/ staged as mode 120000 is refused as non-regular", () => {
  const dir = repo("nonregular");
  const oid = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: dir, input: "a.md", encoding: "utf8", env: GIT_ENV }).stdout.trim();
  const update = spawnSync("git", ["update-index", "--add", "--cacheinfo", `120000,${oid},docs/link.md`], { cwd: dir, encoding: "utf8", env: GIT_ENV });
  assert.equal(update.status, 0, update.stderr);
  assert.deepEqual(checkStagedObservationDocumentation(dir).codes, ["OG-DOC-NONREGULAR"]);
});

// ---- P2: the real pre-commit hook wiring ----------------------------------------------------

const PLUGIN_DIRS = {
  pluginLibDir: join(PLUGIN_ROOT, "lib"),
  pluginHooksDir: join(PLUGIN_ROOT, "hooks"),
  pluginScriptsDir: join(PLUGIN_ROOT, "scripts"),
};

test("P2: the rendered pre-commit hook consults the staged classifier, refuses on its verdict, and does so before the protected-path stage", () => {
  const impl = renderImpl(PLUGIN_DIRS);
  const call = impl.indexOf("checkStagedObservationDocumentation(projectRoot)");
  const refuse = impl.indexOf("staged observation/document governance refused:");
  const unavailable = impl.indexOf("staged observation/document governance inspection is unavailable");
  const protectedStage = impl.indexOf("protected-path rule modules could not be loaded");
  assert.ok(call > 0 && refuse > call && unavailable > refuse, "classifier is called, its refusal and fail-closed branches follow");
  assert.ok(protectedStage > unavailable, "the classification gate sits before the protected-path rule stage");
  assert.match(impl, /staged-observation-doc-classification\.mjs/);
});

test("P2: running the rendered hook against a staged unclassified doc exits non-zero naming OG-DOC-UNCLASSIFIED and never the path", () => {
  const dir = repo("hook");
  const hookFile = join(dir, "pre-commit-impl.mjs");
  writeFileSync(hookFile, renderImpl(PLUGIN_DIRS));
  put(dir, "docs/0.7-recovery-handover.md", "handover\n");
  git(dir, "add", "docs/0.7-recovery-handover.md");
  const run = spawnSync(process.execPath, [hookFile], { cwd: dir, encoding: "utf8", timeout: 60000, env: GIT_ENV });
  assert.equal(run.status, 1, `exit code (stderr: ${run.stderr})`);
  assert.match(run.stderr, /staged observation\/document governance refused: OG-DOC-UNCLASSIFIED/);
  assert.doesNotMatch(run.stderr, /0\.7-recovery-handover/, "only codes cross the refusal seam, not paths");
});

test("P2: the rendered hook does not raise the governance refusal once the doc is classified in the same staged commit", () => {
  const dir = repo("hook-ok");
  const hookFile = join(dir, "pre-commit-impl.mjs");
  writeFileSync(hookFile, renderImpl(PLUGIN_DIRS));
  put(dir, "docs/h.md", "handover\n");
  put(dir, POLICY, policyWith(["docs/a.md", "docs/h.md"]));
  git(dir, "add", "docs/h.md", POLICY);
  const run = spawnSync(process.execPath, [hookFile], { cwd: dir, encoding: "utf8", timeout: 60000, env: GIT_ENV });
  assert.doesNotMatch(run.stderr, /staged observation\/document governance/, `stderr: ${run.stderr}`);
});

// ---- ALF-C-P1-11B: the installed hook at a real `git commit`, and the clone-without-hooks gap ------
//
// Findings recorded here (read-only inspection of production code):
//  * Implemented, not a stub: scripts/pre-commit-hook-install.mjs (rendered impl, ~lines 955-962) imports
//    staged-observation-doc-classification.mjs and refuses with "staged observation/document governance refused:".
//  * There is no code "handover writer" that writes a docs/*.md handover: pipeline-state.mjs only syncs the
//    state.md next-action and handover projections. A handover document is authored by the session, so the
//    commit-time hook is the only code path that can classify it; the case below commits a handover-shaped
//    docs file through the real installed hook.
//  * Verify (harness/scripts/verify.mjs) only runs the checker's own test suite, not the checker against the
//    repository; the only later line is the session-start bootstrap (observation-governance-bootstrap.mjs).

const HOOK_COMMIT_TIMEOUT_MS = 300000;
const HOOK_ENV = { ...GIT_ENV, GIT_CEILING_DIRECTORIES: SCRATCH };
function hookGit(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 240000, env: HOOK_ENV });
}
const HANDOVER_TEXT = "# Recovery handover\n\nNext action: continue the block.\n";

test("handover doc through the real installed pre-commit hook: unclassified is refused, classified in the same commit is admitted", { timeout: HOOK_COMMIT_TIMEOUT_MS * 2 }, () => {
  const dir = repo("installed");
  // The installed hook only governs an enrolled project (same fixture shape as pre-commit-hook-install.test.mjs).
  const governance = createGovernanceScopeController({ hostStateRoot: join(dir, "unused-host") });
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "fixture-operator" });
  assert.equal(governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed", `precondition: install must succeed (${JSON.stringify(install)})`);
  const head = hookGit(dir, "rev-parse", "HEAD").stdout.trim();
  put(dir, "docs/0.7-recovery-handover.md", HANDOVER_TEXT);
  assert.equal(hookGit(dir, "add", "docs/0.7-recovery-handover.md").status, 0);
  const refused = hookGit(dir, "commit", "-q", "-m", "docs(state): record handover");
  assert.notEqual(refused.status, 0, `unclassified handover must not commit (stderr: ${refused.stderr})`);
  assert.match(refused.stderr, /staged observation\/document governance refused: OG-DOC-UNCLASSIFIED/);
  assert.equal(hookGit(dir, "rev-parse", "HEAD").stdout.trim(), head, "HEAD unchanged after refusal");
  // Classify in the same staged commit: the governance refusal must be gone.
  put(dir, POLICY, policyWith(["docs/a.md", "docs/0.7-recovery-handover.md"]));
  assert.equal(hookGit(dir, "add", POLICY).status, 0);
  const admitted = hookGit(dir, "commit", "-q", "-m", "docs(state): record handover");
  assert.doesNotMatch(admitted.stderr, /staged observation\/document governance/, `stderr: ${admitted.stderr}`);
});

test("clone without hooks: no commit-time check exists, the unclassified handover commits; the only later line is a post-hoc classifier run, not Verify", { timeout: HOOK_COMMIT_TIMEOUT_MS }, () => {
  const dir = repo("nohook");
  put(dir, "docs/0.7-recovery-handover.md", HANDOVER_TEXT);
  assert.equal(hookGit(dir, "add", "docs/0.7-recovery-handover.md").status, 0);
  const committed = hookGit(dir, "commit", "-q", "-m", "docs(state): record handover");
  assert.equal(committed.status, 0, `no hook installed: the commit is admitted (stderr: ${committed.stderr})`);
  // The omission is only detectable afterwards by running the shared validator over the committed tree
  // (what the session-start bootstrap does); this documents that the omission is real without hooks.
  const tracked = hookGit(dir, "ls-files", "docs").stdout.split("\n").filter(Boolean);
  const policy = JSON.parse(hookGit(dir, "show", `HEAD:${POLICY}`).stdout);
  const later = checkObservationDocumentation(policy, tracked);
  assert.equal(later.ok, false);
  assert.deepEqual(later.findings, ["OG-DOC-UNCLASSIFIED docs/0.7-recovery-handover.md"]);
});
