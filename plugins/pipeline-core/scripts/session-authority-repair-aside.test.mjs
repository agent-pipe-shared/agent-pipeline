// SPDX-License-Identifier: SUL-1.0
// C19J-W243 (AC-108): the repair script reads a retained aside without writing, and its wait / inspect survive a host commit.
//   C19J-W243-7  inspect-aside lists every file of one retained aside with size, mtime, schema and whether the aside's own catalogue indexes it; it writes nothing
//   C19J-W243-8  inspect-aside refuses a missing, unsafe or unknown aside name with a typed code
//   C19J-W243-9  a wait whose repository HEAD moves between iterations returns lock-free instead of timing out
//   C19J-W243-10 inspect rebinds the repository once before it reports, so a HEAD that moved during the verb is not read as a changed binding
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { devNull, hostname } from "node:os";
import { join } from "node:path";
import { canonical } from "../lib/po-approval-proof.mjs";
import { observeLinuxProcess } from "../lib/native-platform-process-observer.mjs";
import { createSessionAuthorityParticipantPorts } from "../lib/session-authority-observers.mjs";
import { initializeSessionAuthorityRegistry } from "../lib/session-authority-registry.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../lib/worktree-lifecycle.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "../lib/test-item-approved-course-fixture.mjs";
import { runSessionAuthorityRepair } from "./session-authority-repair.mjs";

const linuxOnly = { skip: process.platform !== "linux" };
const ROOT = "agent-pipeline/session-authority";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture(run) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "session-authority-repair-aside-"));
  try {
    mkdirSync(join(root, "evidence"), { mode: 0o700 });
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"], ["core.hooksPath", devNull]]) assert.equal(spawnSync("git", ["-C", root, "config", name, value]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "commit", "--allow-empty", "-q", "-m", "fixture"]).status, 0);
    const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host") });
    const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "fixture explicit course" });
    assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
    prepareApprovedItemCourseFixture({ root });
    const repository = inspectSignedDescriptorCustodyRepository(root);
    assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
    return run({ root, repository });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function repair(argv, deps) {
  let text = "";
  const code = runSessionAuthorityRepair(argv, (chunk) => { text += chunk; }, deps);
  return { code, result: JSON.parse(text) };
}
const commit = (root) => assert.equal(spawnSync("git", ["-C", root, "commit", "--allow-empty", "-q", "-m", "host commit moves HEAD"]).status, 0);
/** Every file under a directory with size and mtime, for an unchanged-tree comparison. */
function snapshot(dir, base = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name), stat = lstatSync(path), relative = base ? `${base}/${name}` : name;
    if (stat.isDirectory()) out.push(...snapshot(path, relative)); else out.push(`${relative}:${stat.size}:${stat.mtimeMs}:${sha256(readFileSync(path))}`);
  }
  return out;
}
function liveLock(repository) {
  const own = observeLinuxProcess(process.pid);
  const lock = { schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "d".repeat(64), owner: { pid: process.pid, hostSha256: sha256(hostname()), process: { start: own.start, bootSha256: own.bootSha256 }, acquiredAt: new Date(Date.now() - 3600000).toISOString() } };
  const path = join(repository.commonDir, ROOT, "registry.lock");
  writeFileSync(path, JSON.stringify(lock), { mode: 0o600, flag: "wx" });
  return path;
}

test("C19J-W243-7 inspect-aside lists a retained aside with size, mtime, schema and whether its own catalogue indexes each file, and writes nothing", linuxOnly, () => fixture(({ root, repository }) => {
  writeFileSync(join(repository.commonDir, ROOT, "zz-stray.json"), canonical({ schema: "pipeline.session-authority-member.v1", note: "left behind" }), { mode: 0o600 });
  const moved = repair(["move-aside", "--root", root, "--no-goldfish-running", "--reason", "fixture"]);
  assert.equal(moved.code, 0, JSON.stringify(moved.result));
  const [aside] = moved.result.retained;
  assert.match(aside, /-repair-move-aside$/u);
  const abandoned = join(repository.commonDir, "agent-pipeline/session-authority-abandoned");
  const before = snapshot(abandoned);
  const out = repair(["inspect-aside", "--root", root, "--aside", aside]);
  assert.equal(out.code, 0, JSON.stringify(out.result));
  assert.equal(out.result.status, "aside-inspected");
  assert.equal(out.result.aside, aside);
  assert.equal(out.result.catalogue, "present");
  const byPath = new Map(out.result.entries.map((entry) => [entry.path, entry]));
  const catalogue = byPath.get("catalogue.json");
  assert.ok(catalogue && catalogue.indexed === true && catalogue.schema === "pipeline.session-authority-catalogue.v1" && Number.isSafeInteger(catalogue.size) && typeof catalogue.mtime === "string", JSON.stringify(catalogue));
  assert.equal(byPath.get("producers/native-goldfish.json")?.indexed, true, "a producer record the catalogue names is indexed");
  const stray = byPath.get("zz-stray.json");
  assert.ok(stray, "the stray file is listed");
  assert.equal(stray.indexed, false);
  assert.equal(stray.schema, "pipeline.session-authority-member.v1");
  assert.deepEqual(out.result.unindexed, ["zz-stray.json"]);
  assert.deepEqual(snapshot(abandoned), before, "inspect-aside wrote nothing and touched nothing");
}));

test("C19J-W243-8 inspect-aside refuses a missing, unsafe or unknown aside name with a typed code", linuxOnly, () => fixture(({ root }) => {
  assert.equal(repair(["inspect-aside", "--root", root]).result.code, "SAR-ARGS");
  for (const name of ["../x", "a/b", "..", "a\\b"]) assert.equal(repair(["inspect-aside", "--root", root, "--aside", name]).result.code, "SAR-ARGS", name);
  const unknown = repair(["inspect-aside", "--root", root, "--aside", "20260101000000000-00000000-nothing"]);
  assert.equal(unknown.code, 2);
  assert.equal(unknown.result.code, "SAR-ASIDE");
}));

test("C19J-W243-9 a wait whose repository HEAD moves between iterations returns lock-free instead of SAR-WAIT-TIMEOUT", linuxOnly, () => fixture(({ root, repository }) => {
  const lock = liveLock(repository);
  let clock = 0, pauses = 0;
  const waited = repair(["wait", "--root", root, "--timeout", "30"], { waitDeps: { now: () => clock, pause: (ms) => {
    clock += ms; pauses += 1;
    if (pauses === 1) { commit(root); rmSync(lock); }
  } } });
  assert.equal(waited.code, 0, JSON.stringify(waited.result));
  assert.equal(waited.result.status, "lock-free");
  assert.equal(pauses, 1, "the lock was held once, then free after the host commit");
}));

test("C19J-W243-10 inspect rebinds once before it reports, so a HEAD that moved while the verb ran is not a changed binding", linuxOnly, () => fixture(({ root, repository }) => {
  liveLock(repository);
  // The judge runs inside release-lock after it bound the repository; the commit moves HEAD before the closing inspect.
  const released = repair(["release-lock", "--root", root, "--no-pipeline-running", "--reason", "fixture"], { releaseDeps: { judge: () => { commit(root); return "dead"; } } });
  assert.equal(released.code, 0, JSON.stringify(released.result).slice(0, 600));
  assert.equal(released.result.status, "released");
  assert.equal(released.result.lock.status, "absent", `the report read the lock through a fresh binding: ${JSON.stringify(released.result.lock)}`);
  assert.notEqual(released.result.registry.read.reason, "repository-binding-changed");
}));
