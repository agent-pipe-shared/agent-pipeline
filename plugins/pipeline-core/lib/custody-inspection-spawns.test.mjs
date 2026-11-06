// SPDX-License-Identifier: SUL-1.0
// C19I-W241 (AC-108): the custody inspection and the Windows private-state batch start fewer git and PowerShell
// processes WITHOUT changing an answer. Every cached answer must equal what a fresh git call (or a fresh native
// observation) would return at that moment, so the cases below move HEAD, replace refs and replace tree objects inside
// ONE process and compare each answer with git's own, and they count the process starts through the spawnSync seam.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const win32 = process.platform === "win32";
const realSpawnSync = childProcess.spawnSync;

// One counting wrapper in front of the builtin, installed before the modules under test bind it.
const gitCalls = [];
const powershellCalls = [];
const fake = { foreign: new Set(), failBatch: false };
const POWERSHELL_LITERAL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
function fakeRow(path) {
  const extra = fake.foreign.has(path) ? ["BUILTIN\\Users"] : [];
  return { path, currentOwner: "HOST\\me", owner: "HOST\\me", reparsePoint: false, principals: ["HOST\\me", ...extra], inheritedFlags: [false, ...extra.map(() => false)] };
}
childProcess.spawnSync = function countingSpawnSync(file, args, options, ...rest) {
  if (file === "git") gitCalls.push([...(Array.isArray(args) ? args : [])]);
  if (/powershell/iu.test(String(file))) {
    const input = typeof options?.input === "string" ? options.input : null;
    powershellCalls.push(input === null ? { single: options?.env?.PIPELINE_PRIVATE_STATE_PATH } : { batch: JSON.parse(Buffer.from(input.trim(), "base64").toString("utf8")) });
    if (input !== null && fake.failBatch) return { status: 1, signal: null, stdout: "", stderr: "", error: undefined, pid: 0, output: [null, "", ""] };
    const stdout = input === null
      ? (() => { const { path: _path, ...facts } = fakeRow(options.env.PIPELINE_PRIVATE_STATE_PATH); return JSON.stringify(facts); })()
      : JSON.stringify(powershellCalls.at(-1).batch.map(fakeRow));
    return { status: 0, signal: null, stdout, stderr: "", error: undefined, pid: 0, output: [null, stdout, ""] };
  }
  return realSpawnSync.call(this, file, args, options, ...rest);
};
syncBuiltinESMExports();
const { inspectSignedDescriptorCustodyRepository, withCustodyTopologyScope } = await import("./worktree-lifecycle.mjs");
const { assessWindowsPrivatePath, hardenWindowsPrivateDirectory, observeWindowsPrivatePath } = await import("./windows-private-state.mjs");
const awaitedOnboarding = await import("./onboarding-continuity.mjs");

const roots = [];
process.on("exit", () => {
  childProcess.spawnSync = realSpawnSync;
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function git(cwd, args, { allowNonzero = false } = {}) {
  const result = realSpawnSync("git", args, {
    cwd, encoding: "utf8", shell: false,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", LC_ALL: "C", GIT_AUTHOR_NAME: "F", GIT_AUTHOR_EMAIL: "f@example.invalid", GIT_COMMITTER_NAME: "F", GIT_COMMITTER_EMAIL: "f@example.invalid" },
  });
  if (!allowNonzero && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}
function fixtureDir(prefix = "custody-spawns-") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}
function repoFixture(extraInit = []) {
  const fixture = fixtureDir();
  const primary = join(fixture, "repo");
  mkdirSync(primary);
  git(primary, ["init", "--initial-branch=main", ...extraInit]);
  writeFileSync(join(primary, "README.md"), "fixture\n");
  git(primary, ["add", "README.md"]);
  git(primary, ["commit", "-m", "fixture"]);
  return { fixture, primary };
}
function commit(primary, name) {
  writeFileSync(join(primary, `${name}.txt`), `${name}\n`);
  git(primary, ["add", `${name}.txt`]);
  git(primary, ["commit", "-m", name]);
}
function truth(primary) {
  const lines = git(primary, ["rev-parse", "HEAD", "HEAD^{tree}"]).stdout.trim().split("\n");
  return { commit: lines[0], tree: lines[1] };
}
function gitStarts(operation) {
  const before = gitCalls.length;
  const value = operation();
  return { value, starts: gitCalls.length - before };
}
function withCeiling(ceiling, operation) {
  const before = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = ceiling;
  try { return operation(); } finally { if (before === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = before; }
}

test("W241-01 an unchanged HEAD is answered without a git start after the first inspection", () => {
  const { primary } = repoFixture();
  const root = realpathSync(primary);
  const first = inspectSignedDescriptorCustodyRepository(root);
  assert.deepEqual(first.candidate, truth(primary));
  const warm = gitStarts(() => { for (let i = 0; i < 5; i += 1) assert.deepEqual(inspectSignedDescriptorCustodyRepository(root), first); });
  assert.equal(warm.starts, 0, "five inspections of an unchanged repository start no git process");
});

test("W241-02 every HEAD move inside one process is visible to the very next inspection and equals git's own answer", () => {
  const { primary } = repoFixture();
  const root = realpathSync(primary);
  const seen = [];
  const step = (label, mutate, { expectStarts } = {}) => {
    mutate();
    const { value, starts } = gitStarts(() => inspectSignedDescriptorCustodyRepository(root));
    assert.deepEqual(value.candidate, truth(primary), label);
    if (expectStarts !== undefined) assert.equal(starts, expectStarts, `${label}: git starts`);
    seen.push(value.candidate.commit);
  };
  step("initial", () => {});
  step("a new commit", () => commit(primary, "two"), { expectStarts: 1 });
  step("another new commit", () => commit(primary, "three"), { expectStarts: 1 });
  step("an unchanged HEAD again", () => {}, { expectStarts: 0 });
  step("reset --hard to the previous commit", () => git(primary, ["reset", "--hard", "HEAD~1"]), { expectStarts: 0 });
  step("reset --hard back to the third commit", () => git(primary, ["reset", "--hard", seen[2]]), { expectStarts: 0 });
  step("pack-refs moves the loose ref into packed-refs", () => git(primary, ["pack-refs", "--all", "--prune"]), { expectStarts: 0 });
  assert.equal(existsSync(join(primary, ".git", "refs", "heads", "main")), false, "the branch is now only in packed-refs");
  step("a commit over a packed ref", () => commit(primary, "four"), { expectStarts: 1 });
  step("reset to an older commit while an older value sits in packed-refs", () => git(primary, ["reset", "--hard", seen[1]]), { expectStarts: 0 });
  step("detached HEAD", () => git(primary, ["checkout", "--detach", seen[2]]), { expectStarts: 0 });
  step("a commit on a detached HEAD", () => commit(primary, "five"), { expectStarts: 1 });
  step("a branch with a slash in its name", () => git(primary, ["checkout", "-b", "feat/deep/x"]), { expectStarts: 0 });
  step("back to main", () => git(primary, ["checkout", "main"]), { expectStarts: 0 });
  step("amend: same tree, a new commit", () => git(primary, ["commit", "--amend", "-m", "amended"]), { expectStarts: 1 });
  step("update-ref moves the branch", () => git(primary, ["update-ref", "refs/heads/main", seen[0]]), { expectStarts: 0 });
  assert.equal(new Set(seen).size >= 5, true);
});

test("W241-03 a HEAD move inside one withCustodyTopologyScope boundary and between two inspections of one process", () => {
  const { primary } = repoFixture();
  const root = realpathSync(primary);
  withCustodyTopologyScope(() => {
    const before = inspectSignedDescriptorCustodyRepository(root);
    commit(primary, "inside");
    const after = inspectSignedDescriptorCustodyRepository(root);
    assert.deepEqual(after.candidate, truth(primary));
    assert.notEqual(after.candidate.commit, before.candidate.commit);
    git(primary, ["reset", "--hard", before.candidate.commit]);
    assert.deepEqual(inspectSignedDescriptorCustodyRepository(root).candidate, before.candidate);
  });
});

test("W241-04 an unusual HEAD shape falls over to git: unborn, symlinked HEAD, replace refs (loose and packed), reftable", () => {
  // unborn
  const unbornDir = fixtureDir();
  const unborn = join(unbornDir, "u");
  mkdirSync(unborn);
  git(unborn, ["init", "--initial-branch=main"]);
  assert.deepEqual(inspectSignedDescriptorCustodyRepository(realpathSync(unborn)).candidate, { commit: "0".repeat(40), tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904" });
  commit(unborn, "first");
  assert.deepEqual(inspectSignedDescriptorCustodyRepository(realpathSync(unborn)).candidate, truth(unborn));

  // a legacy symlinked HEAD (HEAD -> refs/heads/main) is answered by git
  if (!win32) {
    const { primary } = repoFixture();
    const root = realpathSync(primary);
    inspectSignedDescriptorCustodyRepository(root);
    unlinkSync(join(primary, ".git", "HEAD"));
    symlinkSync("refs/heads/main", join(primary, ".git", "HEAD"));
    const viaGit = gitStarts(() => inspectSignedDescriptorCustodyRepository(root));
    assert.deepEqual(viaGit.value.candidate, truth(primary));
  }

  // replace refs: a cached tree must not outlive a replacement that changes what HEAD^{tree} answers
  for (const pack of [false, true]) {
    const { primary } = repoFixture();
    const root = realpathSync(primary);
    const original = inspectSignedDescriptorCustodyRepository(root).candidate;
    git(primary, ["checkout", "-q", "--detach"]);
    writeFileSync(join(primary, "other.txt"), "other\n");
    git(primary, ["add", "other.txt"]);
    git(primary, ["commit", "-m", "other"]);
    const other = truth(primary).commit;
    git(primary, ["checkout", "-q", "main"]);
    assert.deepEqual(inspectSignedDescriptorCustodyRepository(root).candidate, original, "before the replacement");
    git(primary, ["replace", original.commit, other]);
    if (pack) git(primary, ["pack-refs", "--all", "--prune"]);
    const expected = truth(primary);
    assert.notEqual(expected.tree, original.tree, "the replacement really changes the tree git answers");
    assert.deepEqual(inspectSignedDescriptorCustodyRepository(root).candidate, expected, `replace ref ${pack ? "packed" : "loose"}`);
  }

  // reftable (git >= 2.45)
  const probe = fixtureDir();
  const reftableInit = git(probe, ["init", "--ref-format=reftable", "--initial-branch=main", "rt"], { allowNonzero: true });
  if (reftableInit.status === 0) {
    const primary = join(probe, "rt");
    commit(primary, "one");
    const root = realpathSync(primary);
    assert.deepEqual(inspectSignedDescriptorCustodyRepository(root).candidate, truth(primary));
    commit(primary, "two");
    assert.deepEqual(inspectSignedDescriptorCustodyRepository(root).candidate, truth(primary));
  }
});

test("W241-05 the topology is observed once per process and still re-validated on every use", () => {
  const { fixture, primary } = repoFixture();
  const root = realpathSync(primary);
  inspectSignedDescriptorCustodyRepository(root);
  const warm = gitStarts(() => { for (let i = 0; i < 3; i += 1) inspectSignedDescriptorCustodyRepository(root); });
  assert.equal(warm.starts, 0, "outside any boundary scope nothing is rediscovered either");

  // a repository whose directories vanished is refused as before
  withCeiling(realpathSync(fixture), () => {
    rmSync(join(primary, ".git"), { recursive: true, force: true });
    assert.throws(() => inspectSignedDescriptorCustodyRepository(root), "a vanished common directory is refused");
  });
});

test("W241-06 a nested repository created below a memoized start is found, not shadowed by the memo", () => {
  const { fixture, primary } = repoFixture();
  const sub = join(primary, "sub");
  mkdirSync(sub);
  const subRoot = realpathSync(sub);
  withCeiling(realpathSync(fixture), () => {
    assert.equal(inspectSignedDescriptorCustodyRepository(subRoot).primaryRoot, realpathSync(primary));
    git(sub, ["init", "--initial-branch=main"]);
    commit(sub, "nested");
    const after = inspectSignedDescriptorCustodyRepository(subRoot);
    assert.equal(after.primaryRoot, subRoot);
    assert.deepEqual(after.candidate, truth(sub));
  });
});

test("W241-07 a repository replaced at the same path is not answered from the old topology or tree", () => {
  const { fixture, primary } = repoFixture();
  const root = realpathSync(primary);
  const old = inspectSignedDescriptorCustodyRepository(root);
  rmSync(primary, { recursive: true, force: true });
  mkdirSync(primary);
  git(primary, ["init", "--initial-branch=main"]);
  writeFileSync(join(primary, "different.txt"), "different\n");
  git(primary, ["add", "different.txt"]);
  git(primary, ["commit", "-m", "different"]);
  const replaced = withCeiling(realpathSync(fixture), () => inspectSignedDescriptorCustodyRepository(root));
  assert.deepEqual(replaced.candidate, truth(primary));
  assert.notEqual(replaced.candidate.commit, old.candidate.commit);
});

// ---- (3) the Windows private-state batch, driven through a fake fixed PowerShell on any platform --------------------

function withFakePowerShell(operation) {
  const home = fixtureDir("w241-ps-");
  writeFileSync(join(home, POWERSHELL_LITERAL), "");
  const cwd = process.cwd();
  process.chdir(home);
  try { return operation(home); } finally { process.chdir(cwd); fake.foreign.clear(); fake.failBatch = false; }
}
function privateTree(home, count) {
  const root = join(home, `tree${Math.random().toString(16).slice(2)}`, ".git", "agent-pipeline");
  mkdirSync(join(root, "members"), { recursive: true });
  const files = [];
  for (let i = 0; i < count; i += 1) {
    const file = join(root, "members", `m${String(i).padStart(4, "0")}.json`);
    writeFileSync(file, "{}");
    files.push(file);
  }
  return { root, files };
}
function psStarts(operation) {
  const before = powershellCalls.length;
  const value = operation();
  return { value, starts: powershellCalls.length - before };
}

test("W241-08 a private tree wider than the first batch window is observed in a bounded number of PowerShell starts", { skip: win32 }, () => {
  withFakePowerShell((home) => {
    const tree = privateTree(home, 300);
    const run = psStarts(() => tree.files.map((file) => assessWindowsPrivatePath(file).status));
    assert.deepEqual([...new Set(run.value)], ["secure"]);
    assert.ok(run.starts <= 4, `300 entries cost ${run.starts} PowerShell starts (bound 4)`);
    const again = psStarts(() => tree.files.map((file) => assessWindowsPrivatePath(file).status));
    assert.equal(again.starts, 0, "an unchanged tree is not observed twice in one process");
  });
});

test("W241-09 a verdict from the wide pass equals the single-path verdict, including a foreign principal outside the first window", { skip: win32 }, () => {
  withFakePowerShell((home) => {
    const tree = privateTree(home, 300);
    const foreign = tree.files[250];
    fake.foreign.add(foreign);
    const verdicts = tree.files.map((file) => assessWindowsPrivatePath(file));
    for (const [index, verdict] of verdicts.entries()) {
      const expected = tree.files[index] === foreign ? "insecure" : "secure";
      assert.equal(verdict.status, expected, tree.files[index]);
    }
    const single = assessWindowsPrivatePath(foreign, { fresh: true });
    assert.equal(single.status, "insecure");
  });
});

test("W241-10 a replaced object and a fresh request are observed again; the other entries stay cached", { skip: win32 }, () => {
  withFakePowerShell((home) => {
    const tree = privateTree(home, 200);
    for (const file of tree.files) assessWindowsPrivatePath(file);
    const donor = join(tree.root, "members", "donor.json");
    writeFileSync(donor, "{}");
    renameSync(donor, tree.files[7]);
    const replaced = psStarts(() => { for (const file of tree.files) assessWindowsPrivatePath(file); });
    assert.equal(replaced.starts, 1, "only the replaced object costs a start");
    const fresh = psStarts(() => assessWindowsPrivatePath(tree.files[3], { fresh: true }));
    assert.equal(fresh.starts, 1, "fresh: true observes natively, once, as the single-path route");
    assert.ok(powershellCalls.at(-1).single !== undefined, "and not through a batch");
  });
});

test("W241-11 a failed wide batch falls back to the single-path observation and caches nothing it did not read", { skip: win32 }, () => {
  withFakePowerShell((home) => {
    const tree = privateTree(home, 200);
    assessWindowsPrivatePath(tree.files[0]);
    fake.failBatch = true;
    const results = [];
    const run = psStarts(() => { for (const file of tree.files.slice(150)) results.push(assessWindowsPrivatePath(file).status); });
    assert.deepEqual([...new Set(results)], ["secure"]);
    assert.ok(run.starts >= 50, "with every batch failing each unread object still gets its own single-path observation");
  });
});

test("W241-12 hardening drops the cached tree knowledge: objects are observed again afterwards", { skip: win32 }, () => {
  withFakePowerShell((home) => {
    const tree = privateTree(home, 20);
    for (const file of tree.files) assessWindowsPrivatePath(file);
    const settled = psStarts(() => { for (const file of tree.files) assessWindowsPrivatePath(file); });
    assert.equal(settled.starts, 0);
    hardenWindowsPrivateDirectory(join(tree.root, "members"));
    const after = psStarts(() => { assessWindowsPrivatePath(tree.files[0]); });
    assert.ok(after.starts <= 1, "at most one start for the hardened object");
    assert.equal(observeWindowsPrivatePath(tree.files[1]).status, null);
  });
});

// ---- (4) the default git spawn of onboarding-continuity.mjs: the common-directory question ------------------------------

test("W241-13 the common-directory question is replayed only while the root's .git directory is the one observed", () => {
  const onboarding = awaitedOnboarding;
  const dir = fixtureDir();
  git(dir, ["init", "--initial-branch=main"]);
  const resolve = () => onboarding.resolveIntakeCheckpointPaths({ rootDir: dir });
  const cold = gitStarts(resolve);
  assert.equal(cold.starts, 1, "two identical questions per resolution cost one git start (it was two)");
  const warm = gitStarts(resolve);
  assert.equal(warm.starts, 0);
  assert.deepEqual(warm.value, cold.value);

  // the same path, a different .git directory: asked again, answered by git
  renameSync(join(dir, ".git"), join(dir, ".git.old"));
  git(dir, ["init", "--initial-branch=main"]);
  const replaced = gitStarts(resolve);
  assert.ok(replaced.starts >= 1, "a replaced .git directory is never answered from the memo");
  assert.notDeepEqual(replaced.value, cold.value, "the intake scope is bound to the repository identity, so the replaced repository resolves to its own scope");
  assert.equal(gitStarts(resolve).starts, 0, "and the new .git directory is memoized in turn");

  // a vanished .git: the failure is git's own
  withCeiling(realpathSync(join(dir, "..")), () => {
    rmSync(join(dir, ".git"), { recursive: true, force: true });
    assert.throws(resolve);
  });
});
