// SPDX-License-Identifier: SUL-1.0
// K1 / D71 / D72: the typed repair verb for the session-power address root. Every case uses a private
// temporary home passed to the library; nothing here touches the real home or the real address root.
// The test never removes anything either: fixtures stay in the runner's private TMPDIR.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADDRESS_ANCHOR_SCHEMA,
  ADDRESS_ROOT_BOUND,
  AddressRepairError,
  applyAddressRootRepair,
  planAddressRootRepair,
  repairAddressRootQuietly,
} from "./session-power-address-repair.mjs";
import { parseAddressRepairArgs } from "../scripts/session-power-address-repair.mjs";

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const posix = { skip: process.platform === "linux" && typeof process.getuid === "function" ? false : "address custody is linux-only" };
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (index) => sha(`k1r-fixture-${index}`);
const codeIs = (code) => (error) => error instanceof AddressRepairError && error.code === code;

// A private home whose whole ancestry passes the library's own chain check. TMPDIR first (the
// runner's private one); the account's home only when the system temp ancestry is world-writable.
function makeHome() {
  for (const base of [tmpdir(), join(userInfo().homedir, "pipeline-test-tmp")]) {
    mkdirSync(base, { recursive: true, mode: 0o700 });
    const home = mkdtempSync(join(base, "k1r-"));
    chmodSync(home, 0o700);
    try { planAddressRootRepair({ home }); return home; } catch (error) {
      if (!codeIs("ARR-CHAIN-UNSAFE")(error)) throw error;
    }
  }
  throw new Error("no private temporary home with a safe ancestry is available");
}
function ensureRoot(home) {
  const root = join(home, ".apsp");
  mkdirSync(root, { mode: 0o700 });
  chmodSync(root, 0o700);
  return root;
}
const liveRepo = (home, index) => { const path = join(home, "repos", `live-${index}`); mkdirSync(path, { recursive: true }); return path; };
const goneRepo = (home, index) => join(home, "repos", `gone-${index}`);
function anchorBytes(index, primaryRoot) {
  return JSON.stringify({ schema: ADDRESS_ANCHOR_SCHEMA, repositoryFingerprint: fingerprint(index), primaryRoot, commonDir: join(primaryRoot, ".git") });
}
function writeSlot(home, index, primaryRoot) {
  const name = fingerprint(index).slice(0, 16);
  const slot = join(home, ".apsp", name);
  mkdirSync(slot, { mode: 0o700 });
  writeFileSync(join(slot, "anchor.json"), anchorBytes(index, primaryRoot), { mode: 0o600 });
  return name;
}
function rewriteAnchor(home, name, primaryRoot) {
  const file = join(home, ".apsp", name, "anchor.json");
  const value = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...value, primaryRoot }));
}
function scenario({ kept = 1, absent = 3 } = {}) {
  const home = makeHome();
  ensureRoot(home);
  const result = { home, root: join(home, ".apsp"), kept: [], absent: [], absentRepo: {} };
  let index = 0;
  for (let n = 0; n < kept; n += 1, index += 1) result.kept.push(writeSlot(home, index, liveRepo(home, index)));
  for (let n = 0; n < absent; n += 1, index += 1) {
    const repo = goneRepo(home, index);
    const name = writeSlot(home, index, repo);
    result.absent.push(name);
    result.absentRepo[name] = repo;
  }
  result.kept.sort();
  result.absent.sort();
  return result;
}
function addForeign(home) {
  const root = join(home, ".apsp");
  const expected = {};
  const directory = (name, reason) => { mkdirSync(join(root, name), { mode: 0o700 }); expected[name] = reason; return join(root, name); };
  directory("not-a-hex-name", "name-not-16-hex");
  directory("aaaaaaaaaaaaaaaa", "anchor-missing");
  writeFileSync(join(directory("bbbbbbbbbbbbbbbb", "anchor-invalid"), "anchor.json"), "{not json", { mode: 0o600 });
  writeFileSync(join(directory("cccccccccccccccc", "anchor-invalid"), "anchor.json"),
    JSON.stringify({ schema: "other.v1", repositoryFingerprint: "c".repeat(64), primaryRoot: goneRepo(home, "x"), commonDir: goneRepo(home, "x") }), { mode: 0o600 });
  writeFileSync(join(directory("ffffffffffffffff", "anchor-invalid"), "anchor.json"), anchorBytes(777, goneRepo(home, 777)), { mode: 0o600 });
  symlinkSync(join(home, "somewhere.json"), join(directory("1111111111111111", "anchor-unreadable"), "anchor.json"));
  writeFileSync(join(root, "dddddddddddddddd"), "a file, not a slot", { mode: 0o600 });
  expected.dddddddddddddddd = "slot-not-a-directory";
  symlinkSync(home, join(root, "eeeeeeeeeeeeeeee"));
  expected.eeeeeeeeeeeeeeee = "slot-not-a-directory";
  return expected;
}
// name -> file contents of every slot directory, wherever it currently lives (root or any aside).
function allSlots(home) {
  const found = {};
  const places = [join(home, ".apsp")];
  const asideRoot = join(home, ".apsp-aside");
  if (existsSync(asideRoot)) for (const stamp of readdirSync(asideRoot)) places.push(join(asideRoot, stamp));
  for (const place of places) {
    for (const name of readdirSync(place)) {
      const slot = join(place, name);
      if (!lstatSync(slot).isDirectory()) continue;
      assert.equal(found[name], undefined, `slot ${name} exists in two places`);
      found[name] = Object.fromEntries(readdirSync(slot).map((file) => {
        const path = join(slot, file);
        return [file, lstatSync(path).isSymbolicLink() ? `symlink:${readlinkSync(path)}` : sha(readFileSync(path))];
      }));
    }
  }
  return found;
}
const rootNames = (home) => readdirSync(join(home, ".apsp")).sort();
const asideDirs = (home) => (existsSync(join(home, ".apsp-aside")) ? readdirSync(join(home, ".apsp-aside")).sort() : []);

test("plan classifies kept, absent-repository and foreign entries and changes nothing", posix, () => {
  const s = scenario({ kept: 2, absent: 3 });
  const foreign = addForeign(s.home);
  const before = { names: rootNames(s.home), slots: allSlots(s.home), mtime: lstatSync(s.root).mtimeMs };
  const plan = planAddressRootRepair({ home: s.home });
  const byName = Object.fromEntries(plan.entries.map((entry) => [entry.name, entry]));
  for (const name of s.kept) assert.equal(byName[name].class, "kept");
  for (const name of s.absent) assert.equal(byName[name].class, "absent-repository");
  for (const [name, reason] of Object.entries(foreign)) assert.deepEqual(byName[name], { name, class: "foreign", reason }, name);
  assert.deepEqual(plan.candidates.map((candidate) => candidate.name), s.absent);
  for (const candidate of plan.candidates) {
    assert.equal(candidate.primaryRoot, s.absentRepo[candidate.name]);
    assert.equal(candidate.anchorSha256, sha(readFileSync(join(s.root, candidate.name, "anchor.json"))));
  }
  assert.equal(plan.counts.total, s.kept.length + s.absent.length + Object.keys(foreign).length);
  assert.equal(plan.counts.kept, 2);
  assert.equal(plan.counts.absentRepository, 3);
  assert.equal(plan.counts.foreign, Object.keys(foreign).length);
  assert.equal(plan.counts.afterRepair, plan.counts.total - 3);
  assert.equal(plan.bound, 4096);
  assert.equal(plan.overBound, false);
  const stat = lstatSync(s.root);
  assert.deepEqual(plan.root, { dev: String(stat.dev), ino: String(stat.ino) });
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
  assert.equal(planAddressRootRepair({ home: s.home }).planSha256, plan.planSha256);
  assert.deepEqual({ names: rootNames(s.home), slots: allSlots(s.home), mtime: lstatSync(s.root).mtimeMs }, before, "plan is read-only");
  assert.equal(existsSync(join(s.home, ".apsp-aside")), false);
});

test("the plan digest binds the root identity and the candidate set, not kept or foreign entries", posix, () => {
  const s = scenario();
  const first = planAddressRootRepair({ home: s.home });
  writeSlot(s.home, 9001, liveRepo(s.home, 9001));
  mkdirSync(join(s.root, "not-a-slot"), { mode: 0o700 });
  const second = planAddressRootRepair({ home: s.home });
  assert.notEqual(second.counts.total, first.counts.total);
  assert.equal(second.planSha256, first.planSha256, "a new kept slot and a new foreign entry must not change the digest");
  rewriteAnchor(s.home, s.absent[0], goneRepo(s.home, "elsewhere"));
  const changed = planAddressRootRepair({ home: s.home });
  assert.notEqual(changed.planSha256, first.planSha256, "a candidate whose anchor bytes changed must change the digest");
  writeSlot(s.home, 9002, goneRepo(s.home, 9002));
  assert.notEqual(planAddressRootRepair({ home: s.home }).planSha256, changed.planSha256, "a new candidate must change the digest");
});

test("a missing address root is a plan with nothing to do, and apply of that plan changes nothing", posix, () => {
  const home = makeHome();
  const plan = planAddressRootRepair({ home });
  assert.equal(plan.root, null);
  assert.deepEqual(plan.candidates, []);
  assert.equal(plan.counts.total, 0);
  const result = applyAddressRootRepair({ home, expectedPlanSha256: plan.planSha256 });
  assert.equal(result.status, "nothing-to-do");
  assert.equal(result.asidePath, null);
  assert.equal(existsSync(join(home, ".apsp")), false);
  assert.equal(existsSync(join(home, ".apsp-aside")), false);
});

test("apply moves only absent-repository slots, deletes nothing and reads the move back", posix, () => {
  const s = scenario({ kept: 2, absent: 3 });
  const foreign = addForeign(s.home);
  writeFileSync(join(s.root, s.absent[0], "0123456789abcdef01234567.binding.json"), "{\"binding\":true}", { mode: 0o600 });
  const slotsBefore = allSlots(s.home);
  const rootBefore = rootNames(s.home);
  const plan = planAddressRootRepair({ home: s.home });
  const result = applyAddressRootRepair({ home: s.home, expectedPlanSha256: plan.planSha256 });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.moved, s.absent);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.counts, { before: rootBefore.length, after: rootBefore.length - 3, moved: 3 });
  assert.deepEqual(result.readback, { movedPresentInAside: true, movedAbsentFromRoot: true, anchorsIntact: true });
  const aside = result.asidePath;
  assert.ok(aside.startsWith(join(s.home, ".apsp-aside") + sep), "aside lives beside the root");
  assert.ok(!aside.startsWith(s.root + sep), "aside is never inside the root");
  assert.match(aside.slice(join(s.home, ".apsp-aside").length + 1), /^\d{8}T\d{6}Z-[a-f0-9]{8}$/);
  assert.equal(lstatSync(aside).mode & 0o7777, 0o700);
  assert.equal(lstatSync(join(s.home, ".apsp-aside")).mode & 0o7777, 0o700);
  assert.deepEqual(readdirSync(aside).sort(), s.absent);
  assert.deepEqual(rootNames(s.home), rootBefore.filter((name) => !s.absent.includes(name)));
  for (const name of [...s.kept, ...Object.keys(foreign)]) assert.ok(existsSync(join(s.root, name)) || lstatSync(join(s.root, name)).isSymbolicLink(), `${name} stays`);
  assert.deepEqual(allSlots(s.home), slotsBefore, "every slot, including its extra files, is intact after the move");
  assert.equal(planAddressRootRepair({ home: s.home }).candidates.length, 0);
});

test("apply refuses a stale or malformed digest and moves nothing", posix, () => {
  const s = scenario();
  const stale = planAddressRootRepair({ home: s.home }).planSha256;
  writeSlot(s.home, 9003, goneRepo(s.home, 9003));
  const before = { names: rootNames(s.home), slots: allSlots(s.home) };
  assert.throws(() => applyAddressRootRepair({ home: s.home, expectedPlanSha256: stale }), codeIs("ARR-PLAN-MISMATCH"));
  assert.throws(() => applyAddressRootRepair({ home: s.home, expectedPlanSha256: "not-a-digest" }), codeIs("ARR-PLAN-DIGEST-REQUIRED"));
  assert.throws(() => applyAddressRootRepair({ home: s.home }), codeIs("ARR-PLAN-DIGEST-REQUIRED"));
  assert.deepEqual({ names: rootNames(s.home), slots: allSlots(s.home) }, before);
  assert.equal(existsSync(join(s.home, ".apsp-aside")), false, "a refused apply creates no aside directory");
});

test("a slot another live session adds between plan and apply does not make apply refuse", posix, () => {
  const s = scenario();
  const digest = planAddressRootRepair({ home: s.home }).planSha256;
  const newcomer = writeSlot(s.home, 9004, liveRepo(s.home, 9004));
  mkdirSync(join(s.root, "stranger"), { mode: 0o700 });
  const result = applyAddressRootRepair({ home: s.home, expectedPlanSha256: digest });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.moved, s.absent);
  assert.ok(existsSync(join(s.root, newcomer)));
  assert.ok(existsSync(join(s.root, "stranger")));
});

test("a repository that reappears before apply makes the plan stale and its slot stays", posix, () => {
  const s = scenario();
  const digest = planAddressRootRepair({ home: s.home }).planSha256;
  mkdirSync(s.absentRepo[s.absent[0]], { recursive: true });
  assert.throws(() => applyAddressRootRepair({ home: s.home, expectedPlanSha256: digest }), codeIs("ARR-PLAN-MISMATCH"));
  assert.deepEqual(rootNames(s.home), [...s.kept, ...s.absent].sort());
  assert.equal(existsSync(join(s.home, ".apsp-aside")), false);
});

test("a slot whose repository reappears or whose anchor changes inside the apply window is not moved", posix, () => {
  const s = scenario({ kept: 1, absent: 4 });
  const digest = planAddressRootRepair({ home: s.home }).planSha256;
  const hooks = {
    beforeMove(name, index) {
      if (index === 1) mkdirSync(s.absentRepo[name], { recursive: true });
      if (index === 2) rewriteAnchor(s.home, name, goneRepo(s.home, "other"));
    },
  };
  const result = applyAddressRootRepair({ home: s.home, expectedPlanSha256: digest, hooks });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.moved, [s.absent[0], s.absent[3]]);
  assert.deepEqual(result.skipped, [{ name: s.absent[1], reason: "repository-reappeared" }, { name: s.absent[2], reason: "anchor-changed" }]);
  assert.deepEqual(rootNames(s.home), [...s.kept, s.absent[1], s.absent[2]].sort());
  assert.deepEqual(readdirSync(result.asidePath).sort(), [s.absent[0], s.absent[3]]);
});

test("a crash between two renames leaves whole slots only and converges on rerun", posix, () => {
  const s = scenario({ kept: 1, absent: 3 });
  const slotsBefore = allSlots(s.home);
  const digest = planAddressRootRepair({ home: s.home }).planSha256;
  const hooks = { afterMove(_name, index) { if (index === 0) throw new Error("simulated host crash after the first rename"); } };
  assert.throws(() => applyAddressRootRepair({ home: s.home, expectedPlanSha256: digest, hooks }), /simulated host crash/);
  assert.deepEqual(allSlots(s.home), slotsBefore, "after the crash every slot is whole and in exactly one place");
  assert.equal(asideDirs(s.home).length, 1);
  assert.equal(readdirSync(join(s.home, ".apsp-aside", asideDirs(s.home)[0])).length, 1);
  assert.equal(rootNames(s.home).length, 3);
  const replan = planAddressRootRepair({ home: s.home });
  assert.equal(replan.candidates.length, 2);
  assert.throws(() => applyAddressRootRepair({ home: s.home, expectedPlanSha256: digest }), codeIs("ARR-PLAN-MISMATCH"));
  const result = applyAddressRootRepair({ home: s.home, expectedPlanSha256: replan.planSha256 });
  assert.equal(result.status, "applied");
  assert.deepEqual(rootNames(s.home), s.kept);
  assert.deepEqual(allSlots(s.home), slotsBefore);
  assert.equal(asideDirs(s.home).length, 2);
});

test("a group- or world-writable root, a symlinked root and an unsafe ancestry are refused", posix, () => {
  const s = scenario();
  for (const mode of [0o770, 0o707, 0o777]) {
    chmodSync(s.root, mode);
    assert.throws(() => planAddressRootRepair({ home: s.home }), codeIs("ARR-ROOT-UNSAFE"), mode.toString(8));
    assert.throws(() => applyAddressRootRepair({ home: s.home, expectedPlanSha256: "0".repeat(64) }), codeIs("ARR-ROOT-UNSAFE"));
  }
  chmodSync(s.root, 0o755);
  assert.throws(() => planAddressRootRepair({ home: s.home }), codeIs("ARR-ROOT-UNSAFE"), "a root that is not private is refused");
  chmodSync(s.root, 0o700);
  assert.equal(planAddressRootRepair({ home: s.home }).candidates.length, 3);

  const linked = makeHome();
  mkdirSync(join(linked, "elsewhere"), { mode: 0o700 });
  symlinkSync(join(linked, "elsewhere"), join(linked, ".apsp"));
  assert.throws(() => planAddressRootRepair({ home: linked }), codeIs("ARR-ROOT-UNSAFE"));
  assert.equal(existsSync(join(linked, ".apsp-aside")), false);

  const wide = makeHome();
  const inner = join(wide, "inner");
  mkdirSync(inner, { mode: 0o700 });
  chmodSync(wide, 0o770);
  assert.throws(() => planAddressRootRepair({ home: inner }), codeIs("ARR-CHAIN-UNSAFE"));
  assert.throws(() => planAddressRootRepair({ home: wide }), codeIs("ARR-CHAIN-UNSAFE"));
  assert.throws(() => planAddressRootRepair({ home: "relative/home" }), codeIs("ARR-HOME-INVALID"));
  assert.throws(() => planAddressRootRepair({}), codeIs("ARR-HOME-INVALID"));
});

test("a private root with 4097 slots, most of absent repositories, is brought under the bound", posix, () => {
  const s = scenario({ kept: 97, absent: 4000 });
  const plan = planAddressRootRepair({ home: s.home });
  assert.equal(plan.counts.total, 4097);
  assert.equal(plan.overBound, true);
  assert.equal(plan.withinBoundAfterRepair, true);
  assert.equal(plan.candidates.length, 4000);
  const result = applyAddressRootRepair({ home: s.home, expectedPlanSha256: plan.planSha256 });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.counts, { before: 4097, after: 97, moved: 4000 });
  assert.ok(rootNames(s.home).length <= ADDRESS_ROOT_BOUND);
  assert.deepEqual(rootNames(s.home), s.kept);
  assert.equal(readdirSync(result.asidePath).length, 4000);
  const after = planAddressRootRepair({ home: s.home });
  assert.equal(after.overBound, false);
  assert.equal(after.candidates.length, 0);
});

test("repairAddressRootQuietly returns failed instead of throwing on a refused root", posix, () => {
  const s = scenario();
  chmodSync(s.root, 0o770);
  let result;
  assert.doesNotThrow(() => { result = repairAddressRootQuietly({ home: s.home }); });
  assert.deepEqual(result, { status: "failed", code: "ARR-ROOT-UNSAFE", moved: 0 });
  assert.deepEqual(repairAddressRootQuietly({}), { status: "failed", code: "ARR-HOME-INVALID", moved: 0 });
  assert.deepEqual(repairAddressRootQuietly(), { status: "failed", code: "ARR-HOME-INVALID", moved: 0 });
});

test("repairAddressRootQuietly plans and applies only when there is something to move", posix, () => {
  const s = scenario({ kept: 1, absent: 2 });
  assert.deepEqual(repairAddressRootQuietly({ home: s.home }), { status: "repaired", code: "ARR-OK", moved: 2 });
  assert.deepEqual(rootNames(s.home), s.kept);
  assert.deepEqual(repairAddressRootQuietly({ home: s.home }), { status: "nothing-to-do", code: "ARR-NOTHING-TO-DO", moved: 0 });
  assert.equal(asideDirs(s.home).length, 1, "the second call created no further aside directory");
  assert.deepEqual(repairAddressRootQuietly({ home: makeHome() }), { status: "nothing-to-do", code: "ARR-NOTHING-TO-DO", moved: 0 });
});

test("repairAddressRootQuietly off linux reads nothing and reports nothing to do", () => {
  assert.deepEqual(repairAddressRootQuietly({ home: "/this/home/does/not/exist", platform: "win32" }), { status: "nothing-to-do", code: "ARR-NOT-LINUX", moved: 0 });
  assert.deepEqual(repairAddressRootQuietly({ platform: "darwin" }), { status: "nothing-to-do", code: "ARR-NOT-LINUX", moved: 0 });
});

test("the refusal for a root past the bound names the plan and apply commands, a foreign name names plan", async () => {
  const mod = await import("./session-power.mjs");
  assert.equal(typeof mod.addressNamespaceRefusalMessage, "function", "session-power.mjs must export addressNamespaceRefusalMessage");
  const script = here("../scripts/session-power-address-repair.mjs");
  assert.ok(existsSync(script), "the CLI named by the message exists");
  const over = mod.addressNamespaceRefusalMessage({ count: 4097, foreign: false });
  assert.ok(over.includes("unknown fixed address namespace"));
  assert.ok(over.includes("4096"));
  assert.ok(over.includes(`node ${script} plan`), over);
  assert.ok(over.includes(`node ${script} apply --plan-sha256 <`), over);
  const foreign = mod.addressNamespaceRefusalMessage({ count: 3, foreign: true });
  assert.ok(foreign.includes("unknown fixed address namespace"));
  assert.ok(foreign.includes(`node ${script} plan`), foreign);
  assert.ok(!foreign.includes("4096"), "a foreign name is not reported as a bound overrun");
  const both = mod.addressNamespaceRefusalMessage({ count: 5000, foreign: true });
  assert.ok(both.includes(`node ${script} plan`) && both.includes("apply --plan-sha256"), both);
});

test("the library constants stay pinned to session-power.mjs", () => {
  const source = readFileSync(here("./session-power.mjs"), "utf8");
  assert.ok(source.includes(`ADDRESS_ROOT_SCHEMA='${ADDRESS_ANCHOR_SCHEMA}'`));
  assert.ok(source.includes(`names.length>${ADDRESS_ROOT_BOUND}`));
  assert.ok(source.includes("addressNamespaceRefusalMessage({count:names.length"));
});

test("the CLI accepts only plan and apply with a digest and has no way to select another home", () => {
  assert.deepEqual(parseAddressRepairArgs(["plan"]), { verb: "plan" });
  const digest = "a".repeat(64);
  assert.deepEqual(parseAddressRepairArgs(["apply", "--plan-sha256", digest]), { verb: "apply", planSha256: digest });
  for (const argv of [[], ["bogus"], ["plan", "--home", "/x"], ["apply"], ["apply", "--plan-sha256"], ["apply", "--plan-sha256", "zz"],
    ["apply", "--plan-sha256", digest, "--home", "/x"], ["apply", digest], ["plan", "extra"]]) {
    assert.throws(() => parseAddressRepairArgs(argv), codeIs("ARR-USAGE"), JSON.stringify(argv));
  }
  const cli = readFileSync(here("../scripts/session-power-address-repair.mjs"), "utf8");
  const library = readFileSync(here("./session-power-address-repair.mjs"), "utf8");
  for (const source of [cli, library]) assert.ok(!/process\.env/.test(source), "no environment variable selects anything");
  assert.equal((cli.match(/\bhomedir\b/g) ?? []).length, (cli.match(/userInfo\(\)\.homedir/g) ?? []).length, "the CLI home is only userInfo().homedir");
  assert.ok(!/\bhomedir\b|userInfo/.test(library), "the library takes its home as a parameter and never resolves one");
  const removals = new RegExp(`\\b(${["rm", "unlink", "rmdir"].join("|")})(Sync)?\\b`);
  for (const source of [cli, library]) assert.ok(!removals.test(source), "moving aside is the only mutation");
  for (const argv of [["bogus"], ["plan", "--home", "/nonexistent"]]) {
    const run = spawnSync(process.execPath, [here("../scripts/session-power-address-repair.mjs"), ...argv], { encoding: "utf8" });
    assert.equal(run.status, 2, JSON.stringify(argv));
    const printed = JSON.parse(run.stdout);
    assert.equal(printed.status, "refused");
    assert.equal(printed.code, "ARR-USAGE");
  }
});
