// Purpose: pin scripts/housekeeping.mjs (hook-runtime-snapshots collector): plan is read-only, the live snapshot is never planned,
// apply only moves aside and never deletes. Every case works in its own temp directory with a real `git init`.
// Usage:   node --test scripts/housekeeping.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, existsSync, utimesSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = resolve(import.meta.dirname, "housekeeping.mjs");
const HOOKS = ["pre-commit-hook", "commit-msg-hook", "pre-push-hook"];
const hex = (i) => String(i).repeat(64);
const snap = (i) => `runtime-${hex(i)}`;

function mkRepo() {
  const root = mkdtempSync(join(tmpdir(), "hk-root-"));
  execFileSync("git", ["init", "-q", root]);
  return root;
}
const stateDir = (root) => join(root, ".git", "agent-pipeline");
const mkAside = () => mkdtempSync(join(tmpdir(), "hk-aside-"));

// Four snapshots 1..4 (mtime ascending, 1 oldest). `live` is the number named in impl.mjs.
function mkHook(root, hook, { live = 2, implText } = {}) {
  const dir = join(stateDir(root), hook);
  mkdirSync(dir, { recursive: true });
  const base = Math.floor(Date.now() / 1000) - 100000;
  for (let i = 1; i <= 4; i++) {
    const s = join(dir, snap(i));
    mkdirSync(join(s, "lib"), { recursive: true });
    writeFileSync(join(s, "lib", "a.txt"), "x".repeat(i * 100));
    utimesSync(s, base + i * 1000, base + i * 1000);
  }
  writeFileSync(join(dir, "impl.mjs"), implText ?? `const LIB = "/some/where/${snap(live)}/lib";\n`);
  writeFileSync(join(dir, "install-marker.json"), "{}\n");
  return dir;
}
function mkAll(root, opts) { for (const h of HOOKS) mkHook(root, h, opts); }

function tree(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(`${rel}${e.name}${e.isDirectory() ? "/" : ""}`);
      if (e.isDirectory()) walk(join(d, e.name), `${rel}${e.name}/`);
    }
  };
  walk(dir, "");
  return out;
}
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
const plan = (root, extra = []) => {
  const r = run(["plan", "--root", root, ...extra]);
  assert.equal(r.status, 0, r.stderr);
  return { r, doc: JSON.parse(r.stdout) };
};
const hookOf = (doc, dir) => doc.collectors[0].hookDirs.find((h) => h.dir === dir);
const plannedNames = (h) => h.planned.map((p) => p.name);

test("HK01 plan lists exactly the non-live non-newest snapshots with bytes and changes nothing", () => {
  const root = mkRepo();
  mkAll(root);
  const before = tree(stateDir(root));
  const { doc } = plan(root);
  assert.equal(doc.schema, "pipeline.housekeeping-plan.v1");
  assert.equal(doc.collectors[0].id, "hook-runtime-snapshots");
  for (const h of HOOKS) {
    const hd = hookOf(doc, h);
    assert.equal(hd.status, "ok");
    assert.equal(hd.live, snap(2));
    assert.deepEqual(hd.planned, [{ name: snap(1), bytes: 100 }, { name: snap(3), bytes: 300 }]);
    assert.deepEqual(hd.retained.map((x) => x.name), [snap(4)]);
  }
  assert.equal(doc.collectors[0].count, 6);
  assert.equal(doc.collectors[0].bytes, 1200);
  assert.match(doc.planSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(tree(stateDir(root)), before);
});

test("HK02 the live snapshot is never planned, even when it is the oldest", () => {
  const root = mkRepo();
  mkAll(root, { live: 1 });
  const { doc } = plan(root, ["--keep-newest", "0"]);
  for (const h of HOOKS) {
    const hd = hookOf(doc, h);
    assert.ok(!plannedNames(hd).includes(snap(1)));
    assert.deepEqual(plannedNames(hd).sort(), [snap(2), snap(3), snap(4)]);
  }
});

test("HK03 missing impl.mjs or an impl.mjs naming a missing snapshot is unreadable and plans nothing there", () => {
  const root = mkRepo();
  mkAll(root);
  rmSync(join(stateDir(root), "pre-commit-hook", "impl.mjs"));
  writeFileSync(join(stateDir(root), "commit-msg-hook", "impl.mjs"), `const LIB = "/x/${snap(9)}/lib";\n`);
  const { doc } = plan(root);
  for (const h of ["pre-commit-hook", "commit-msg-hook"]) {
    const hd = hookOf(doc, h);
    assert.equal(hd.status, "unreadable");
    assert.ok(hd.reason && hd.reason.length > 0);
    assert.deepEqual(hd.planned, []);
  }
  assert.deepEqual(plannedNames(hookOf(doc, "pre-push-hook")), [snap(1), snap(3)]);
});

test("HK04 a symlink and a plain file named runtime-<hex> are never planned", () => {
  const root = mkRepo();
  mkHook(root, "pre-commit-hook");
  const dir = join(stateDir(root), "pre-commit-hook");
  const target = mkdtempSync(join(tmpdir(), "hk-target-"));
  symlinkSync(target, join(dir, snap(7)));
  writeFileSync(join(dir, snap(8)), "plain file");
  const { doc } = plan(root, ["--keep-newest", "0"]);
  const names = plannedNames(hookOf(doc, "pre-commit-hook"));
  assert.ok(!names.includes(snap(7)));
  assert.ok(!names.includes(snap(8)));
  assert.deepEqual(names.sort(), [snap(1), snap(3), snap(4)]);
  assert.ok(lstatSync(join(dir, snap(7))).isSymbolicLink());
});

test("HK05 apply with the right digest moves planned snapshots aside with a manifest; a second plan is empty", () => {
  const root = mkRepo();
  mkAll(root);
  const aside = mkAside();
  const { doc } = plan(root);
  const r = run(["apply", "--root", root, "--plan-sha256", doc.planSha256, "--aside", aside]);
  assert.equal(r.status, 0, r.stderr);
  const stamps = readdirSync(aside);
  assert.equal(stamps.length, 1);
  const manifest = JSON.parse(readFileSync(join(aside, stamps[0], "manifest.json"), "utf8"));
  assert.equal(manifest.plan.planSha256, doc.planSha256);
  assert.ok(manifest.items.every((i) => i.result === "moved"));
  assert.equal(manifest.items.length, 6);
  for (const h of HOOKS) {
    assert.ok(existsSync(join(aside, stamps[0], h, snap(1), "lib", "a.txt")));
    assert.ok(existsSync(join(aside, stamps[0], h, snap(3), "lib", "a.txt")));
    assert.ok(!existsSync(join(stateDir(root), h, snap(1))));
    assert.ok(existsSync(join(stateDir(root), h, snap(2))));
    assert.ok(existsSync(join(stateDir(root), h, snap(4))));
    assert.ok(existsSync(join(stateDir(root), h, "impl.mjs")));
  }
  const again = plan(root).doc;
  assert.equal(again.collectors[0].count, 0);
});

test("HK06 apply with a wrong digest refuses HK-PLAN-DRIFT and moves nothing", () => {
  const root = mkRepo();
  mkAll(root);
  const aside = mkAside();
  const before = tree(stateDir(root));
  const r = run(["apply", "--root", root, "--plan-sha256", "0".repeat(64), "--aside", aside]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /HK-PLAN-DRIFT/);
  assert.deepEqual(tree(stateDir(root)), before);
  assert.deepEqual(readdirSync(aside), []);
});

test("HK07 an aside inside the git common dir or inside the root is refused and moves nothing", () => {
  const root = mkRepo();
  mkAll(root);
  const { doc } = plan(root);
  const before = tree(stateDir(root));
  for (const aside of [join(root, ".git", "aside"), join(root, "aside"), join(stateDir(root), "x")]) {
    const r = run(["apply", "--root", root, "--plan-sha256", doc.planSha256, "--aside", aside]);
    assert.notEqual(r.status, 0, aside);
    assert.match(r.stdout + r.stderr, /HK-ASIDE/);
    assert.ok(!existsSync(aside));
  }
  const r2 = run(["apply", "--root", root, "--plan-sha256", doc.planSha256]);
  assert.notEqual(r2.status, 0);
  assert.deepEqual(tree(stateDir(root)), before);
});

test("HK08 a rename failure is reported failed, the snapshot stays and nothing is deleted", () => {
  const root = mkRepo();
  mkHook(root, "pre-commit-hook");
  const aside = mkAside();
  writeFileSync(join(aside, "fixed"), "i am a file, so the destination parent cannot be created");
  const before = tree(stateDir(root));
  const { doc } = plan(root);
  const r = run(["apply", "--root", root, "--plan-sha256", doc.planSha256, "--aside", aside, "--stamp", "fixed"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.items.length > 0 && out.items.every((i) => i.result === "failed" && i.error));
  assert.deepEqual(tree(stateDir(root)), before);
  assert.equal(readFileSync(join(aside, "fixed"), "utf8").startsWith("i am a file"), true);
});

test("HK09 --keep-newest 0 plans every non-live snapshot and --keep-newest 2 retains two", () => {
  const root = mkRepo();
  mkHook(root, "pre-commit-hook");
  const d0 = hookOf(plan(root, ["--keep-newest", "0"]).doc, "pre-commit-hook");
  assert.deepEqual(plannedNames(d0).sort(), [snap(1), snap(3), snap(4)]);
  const d2 = hookOf(plan(root, ["--keep-newest", "2"]).doc, "pre-commit-hook");
  assert.deepEqual(plannedNames(d2), [snap(1)]);
  assert.deepEqual(d2.retained.map((x) => x.name).sort(), [snap(3), snap(4)]);
});

test("HK10 the plan contains no absolute path", () => {
  const root = mkRepo();
  mkAll(root);
  const { r } = plan(root);
  assert.ok(!r.stdout.includes(root));
  assert.ok(!r.stdout.includes(tmpdir()));
  assert.ok(!/"[A-Za-z]:\\/.test(r.stdout));
  assert.ok(!/"\/[^"]*"/.test(r.stdout.replace(/"\/\//g, "")), "no JSON string value starts with a slash");
});
