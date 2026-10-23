// Pins scripts/run-parallel.mjs against the K53 staleness defect: a worker clone must run the source's exact HEAD,
// a source with uncommitted changes must be refused (not silently run without them), and a source whose history
// was rewritten must not crash the worker sync. Run: node scripts/run-parallel.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runner = resolve(process.env.RUN_PARALLEL_UNDER_TEST ?? join(dirname(fileURLToPath(import.meta.url)), "run-parallel.mjs"));
const sandbox = mkdtempSync(join(tmpdir(), "rp-test-"));
const home = join(sandbox, "home");
const work = join(sandbox, "work");
const src = join(sandbox, "src");
mkdirSync(home, { recursive: true });
const git = (dir, ...a) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...a], { encoding: "utf8" }).trim();
const caseSource = (n) => Array.from({ length: n }, (_, i) => `test("case ${i + 1}", () => {});`).join("\n");
const writeTests = (n) => writeFileSync(join(src, "a.test.mjs"), `import test from "node:test";\n${caseSource(n)}\n`);
const initSrc = (n) => {
  rmSync(src, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  git(src, "init", "--quiet");
  writeTests(n);
  git(src, "add", "a.test.mjs");
  git(src, "commit", "--quiet", "-m", "init");
};
const run = (...extra) => spawnSync(process.execPath, [runner, "1", "t", "--src", src, ...extra, "a.test.mjs"], {
  cwd: work, encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: sandbox, NODE_TEST_CONTEXT: "" },
});
mkdirSync(work, { recursive: true });
git(work, "init", "--quiet");
git(work, "config", "user.name", "t");
git(work, "config", "user.email", "t@example.invalid");
test.after(() => rmSync(sandbox, { recursive: true, force: true }));

test("full-verify.mjs pure parts: short TMPDIR bound, red steps from the run record, summary, private git config (K143)", async () => {
  const fv = await import("./full-verify.mjs");
  assert.equal(fv.tmpDirIsShortEnough("/home/u/.fv/fv/t"), true);
  assert.equal(fv.tmpDirIsShortEnough("/home/u/pipeline-test-tmp/a-very-long-label-name/tmp"), false);
  assert.equal(fv.tmpDirIsShortEnough(""), false);
  const record = { steps: [{ name: "a", exitCode: 0 }, { name: "b", exitCode: 1 }, { name: "c", exitCode: 2 }] };
  assert.deepEqual(fv.redStepNames(record), ["b", "c"]);
  assert.deepEqual(fv.redStepNames(null), []);
  const lines = fv.summarize({ exitCode: 1, seconds: 7, outputPath: "scratch/fv-output.txt", record });
  assert.equal(lines[0], "verify exit 1 after 7 s; output in scratch/fv-output.txt");
  assert.equal(lines[1], "steps 3, red 2");
  assert.deepEqual(lines.slice(2), ["  red: b", "  red: c"]);
  assert.match(fv.summarize({ exitCode: 0, seconds: 1, outputPath: "o", record: null })[1], /unreadable or absent/);
  assert.match(fv.privateGitConfig({ name: "N", email: "e@x" }), /defaultBranch = main/);
});

test("a clean source runs its exact HEAD and prints the commit", () => {
  initSrc(1);
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`commit=${git(src, "rev-parse", "HEAD")}`));
  assert.match(r.stdout, /tests 1 /);
});

test("a source with an uncommitted new case is refused, not run without it", () => {
  writeTests(2);
  const r = run();
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /REFUSED/);
  assert.doesNotMatch(r.stdout, /GREEN/);
});

test("--allow-dirty runs the committed state and says what was left out", () => {
  const r = run("--allow-dirty");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /DIRTY-ALLOWED\(1 uncommitted/);
  assert.match(r.stdout, /tests 1 /);
});

test("after the new case is committed the reused worker clone runs 2 cases", () => {
  git(src, "add", "a.test.mjs");
  git(src, "commit", "--quiet", "-m", "second case");
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /tests 2 /);
});

test("a source whose history was rewritten does not crash the worker sync", () => {
  initSrc(3);
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`commit=${git(src, "rev-parse", "HEAD")}`));
  assert.match(r.stdout, /tests 3 /);
});
