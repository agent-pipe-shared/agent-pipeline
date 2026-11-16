// SPDX-License-Identifier: SUL-1.0
// Pure-function cases of the Full Verify wrapper: the --resume run choice, the resumed count and the summary line (AC-140).
import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countResumed, leakedFixtureNames, newestRunId, summarize } from "./full-verify.mjs";
import { isLeftoverName, planLeftovers, sweepLeftovers } from "./clean-test-leftovers.mjs";
import { keepTestHomes, removeTestTree, sweepOldChildren } from "../plugins/pipeline-core/lib/test-home-cleanup.mjs";

test("newestRunId picks the most recently modified safe run directory name", () => {
  assert.equal(newestRunId([{ name: "verify-a", mtimeMs: 1 }, { name: "verify-b", mtimeMs: 3 }, { name: "verify-c", mtimeMs: 2 }]), "verify-b");
  assert.equal(newestRunId([{ name: "../escape", mtimeMs: 9 }, { name: "verify-a", mtimeMs: 1 }]), "verify-a");
  assert.equal(newestRunId([]), null);
  assert.equal(newestRunId(undefined), null);
});

test("countResumed counts only resumed progress lines", () => {
  const line = (state) => JSON.stringify({ schema: "pipeline.verify-progress.v1", state, suite: "s" });
  assert.equal(countResumed([line("started"), line("resumed"), "not json", line("resumed"), line("completed")].join("\n")), 2);
  assert.equal(countResumed(""), 0);
});

// ---- C30-5 (PO 2026-11-15): tests and Verify clean up after themselves; the home folder keeps nothing a run created ----

const HOUR = 3600000;
function fakeHome(t) {
  const home = mkdtempSync(join(tmpdir(), "c30-5-"));
  t.after(() => removeTestTree(home));
  return home;
}
const agedBy = (path, hours) => { const when = new Date(Date.now() - hours * HOUR); utimesSync(path, when, when); };

test("C30-5: removeTestTree removes a tree a fixture made unreadable, never follows a link out, and reports a missing path as gone", (t) => {
  const home = fakeHome(t);
  const tree = join(home, "tree"), outside = join(home, "outside");
  mkdirSync(join(tree, "locked", "inner"), { recursive: true });
  writeFileSync(join(tree, "locked", "inner", "file.txt"), "x");
  mkdirSync(outside); writeFileSync(join(outside, "keep.txt"), "keep");
  symlinkSync(outside, join(tree, "link-out"));
  chmodSync(join(tree, "locked"), 0o000);
  assert.equal(removeTestTree(tree), true);
  assert.equal(existsSync(tree), false);
  assert.equal(existsSync(join(outside, "keep.txt")), true, "the link target is untouched");
  assert.equal(removeTestTree(join(home, "never-existed")), true);
  assert.equal(removeTestTree(""), false);
});

test("C30-5: sweepOldChildren removes only children older than the guard", (t) => {
  const home = fakeHome(t);
  for (const name of ["old-one", "old-two", "young"]) mkdirSync(join(home, name));
  agedBy(join(home, "old-one"), 30); agedBy(join(home, "old-two"), 13);
  const result = sweepOldChildren(home, { minAgeHours: 12 });
  assert.deepEqual(result.removed.sort(), ["old-one", "old-two"]);
  assert.deepEqual(result.kept, ["young"]);
  assert.equal(existsSync(join(home, "young")), true);
});

test("C30-5: the cleaner plans and removes only allowlisted names older than the guard, and leaves live state and every other name alone", (t) => {
  const home = fakeHome(t);
  const leftovers = [".pipeline-signing-method-AbCd12", ".pipeline-existing-public-anchor-Zz9Yy8", "design-route-route-9SUHKj", "pipeline-test-tmp", "fv19g"];
  const live = [".fv", "fvc", ".ptp", ".apsp", ".agent-pipeline", ".claude", ".ssh", "src", "agent-pipeline-local-marketplace", "agent-pipeline-po", "notes.txt"];
  for (const name of [...leftovers, ...live, ".pipeline-signing-method-Young1"]) mkdirSync(join(home, name));
  for (const name of leftovers) agedBy(join(home, name), 40);
  for (const name of live) agedBy(join(home, name), 4000);
  const plan = planLeftovers({ home, minAgeHours: 12 });
  assert.deepEqual(plan.planned.map((item) => item.name).sort(), [...leftovers].sort());
  assert.ok(plan.skipped.some((item) => item.name === ".pipeline-signing-method-Young1" && /younger/u.test(item.reason)), "a young entry may belong to a running suite");
  const dry = sweepLeftovers({ home, apply: false });
  assert.deepEqual([dry.planned, dry.removed], [leftovers.length, 0]);
  const done = sweepLeftovers({ home });
  assert.deepEqual([done.planned, done.removed], [leftovers.length, leftovers.length]);
  for (const name of leftovers) assert.equal(existsSync(join(home, name)), false, name);
  for (const name of [...live, ".pipeline-signing-method-Young1"]) assert.equal(existsSync(join(home, name)), true, `${name} stays`);
  assert.equal(sweepLeftovers({ home }).planned, 0, "a second sweep finds nothing");
});

test("C30-5: finished Full Verify homes and clones are planned only when asked, only their children, and only past the day count", (t) => {
  const home = fakeHome(t);
  for (const path of [".fv/fv29e", ".fv/fv28a", "fvc/c29e", "fvc/c28a"]) mkdirSync(join(home, path), { recursive: true });
  for (const path of [".fv/fv28a", "fvc/c28a"]) agedBy(join(home, path), 24 * 20);
  assert.deepEqual(planLeftovers({ home }).planned, [], "without the flag .fv and fvc are never touched");
  const plan = planLeftovers({ home, verifyHomeDays: 14 });
  assert.deepEqual(plan.planned.map((item) => item.name).sort(), [".fv/fv28a", "fvc/c28a"]);
  assert.equal(sweepLeftovers({ home, verifyHomeDays: 14 }).removed, 2);
  assert.equal(existsSync(join(home, ".fv", "fv29e")), true, "the recent run stays");
  assert.equal(existsSync(join(home, ".fv")), true, "the folder itself stays");
});

test("C30-5: a new fixture-shaped folder the cleaner does not know is a leak; known names, ordinary new names and old names are not", () => {
  const before = ["src", ".claude", "notes.txt"];
  const after = [...before, ".pipeline-newsuite-Ab12Cd", ".pipeline-signing-method-AbCd12", ".bash_history", "Downloads", ".cache-k79-scan-X37qSd", "plain-name-xyz"];
  assert.deepEqual(leakedFixtureNames({ before, after, isKnownLeftover: isLeftoverName }), [".pipeline-newsuite-Ab12Cd"]);
  assert.deepEqual(leakedFixtureNames({ before: after, after, isKnownLeftover: isLeftoverName }), [], "nothing new, nothing leaked");
});

test("C30-5: the keep switch is PIPELINE_KEEP_TEST_HOMES=1 and nothing else", () => {
  assert.equal(keepTestHomes({ PIPELINE_KEEP_TEST_HOMES: "1" }), true);
  for (const value of [undefined, "", "0", "true", "yes"]) assert.equal(keepTestHomes({ PIPELINE_KEEP_TEST_HOMES: value }), false, String(value));
});

test("summarize states the resumed count only when resuming, and keeps the old lines otherwise", () => {
  const record = { steps: [{ name: "a", exitCode: 0 }, { name: "b", exitCode: 1 }] };
  const plain = summarize({ exitCode: 1, seconds: 5, outputPath: "o.txt", record });
  assert.equal(plain.some((entry) => /resumed/u.test(entry)), false);
  assert.deepEqual(plain.slice(0, 2), ["verify exit 1 after 5 s; output in o.txt", "steps 2, red 1"]);
  const resumed = summarize({ exitCode: 1, seconds: 5, outputPath: "o.txt", record, resumed: 3 });
  assert.match(resumed[1], /resumed over 3 suite/u);
});
