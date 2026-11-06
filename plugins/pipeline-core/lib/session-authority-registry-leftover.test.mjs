// SPDX-License-Identifier: SUL-1.0
// C19J-W243 (AC-108): the registry names an entry it refuses, and no writer leaves an unindexed file behind under ROOT.
// Windows semantics run on Linux through the registry's platform seam (rename/unlink faults, a fake helper spawn that leaves its temp behind).
//   C19J-W243-1  the refusal for an unindexed entry names the registry-relative path and the parsed schema
//   C19J-W243-2  a member published before a producer publication that fails (rename EPERM) is moved aside, and the publish temp is not left behind
//   C19J-W243-3  a rename that fails with EPERM once on the aside move is retried: the leftover still ends outside the walk
//   C19J-W243-4  a leftover that cannot be moved aside is never kept silently: the refusal names its path
//   C19J-W243-5  a Windows lock create that fails leaves no helper temp (.authority-*.tmp) behind in the registry root (the same sweep serves a failed native publish)
//   C19J-W243-6  a move-aside that faults part-way puts every moved entry back
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { devNull, hostname } from "node:os";
import { dirname, join } from "node:path";
import { canonical } from "./po-approval-proof.mjs";
import { observeLinuxProcess } from "./native-platform-process-observer.mjs";
import { createSessionAuthorityParticipantPorts } from "./session-authority-observers.mjs";
import * as registry from "./session-authority-registry.mjs";
import * as backend from "./windows-owned-authority-backend.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { createControlledMethodRuntimeFixture } from "./session-requester-bridge.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "./native-goldfish-host-return.mjs";
import { prepareNativeGoldfishHostState } from "./native-goldfish-host-state.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "./test-item-approved-course-fixture.mjs";

const { initializeSessionAuthorityRegistry, withSessionAuthorityBoundary } = registry;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const linuxOnly = { skip: process.platform !== "linux" };
const ROOT = "agent-pipeline/session-authority";
const ABANDONED = "agent-pipeline/session-authority-abandoned";
const enter = (repository, callback = () => null) => withSessionAuthorityBoundary({ repository }, callback);
const eperm = (what) => Object.assign(new Error(`injected ${what}`), { code: "EPERM" });

function fixture(run) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "session-authority-leftover-"));
  try {
    mkdirSync(join(root, "evidence"), { mode: 0o700 });
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"], ["core.hooksPath", devNull]]) assert.equal(spawnSync("git", ["-C", root, "config", name, value]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "commit", "--allow-empty", "-q", "-m", "fixture"]).status, 0);
    const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host") });
    const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "fixture explicit course" });
    assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
    const original = prepareApprovedItemCourseFixture({ root });
    const repository = inspectSignedDescriptorCustodyRepository(root);
    assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
    return run({ root, repository, original });
  } finally { registry.setSessionAuthorityRegistryTestSeam?.(undefined); rmSync(root, { recursive: true, force: true }); }
}

const hostPrompt = (binding) => `Goldfish briefing\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nReturn contract follows.\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n`;
/** One real native dispatch prepared (it reserves a registry member); the caller sets any seam fault first. */
function dispatchOnce({ root, repository, original }) {
  const runtime = createControlledMethodRuntimeFixture({ repository, fixtureRoot: join(repository.commonDir, "agent-pipeline/controlled-method-fixtures/original-course"), sessionId: "original-course-owner" });
  const itemDelivery = { schema: "pipeline.item-delivery-briefing.v1", sliceId: "ITEM-AC-1", itemId: "AC-1", criterionLocator: original.criterionLocator, checks: [{ id: "criterion-one", path: "src/change.test.mjs", dependencies: ["src/change.mjs", "src/change.test.mjs"] }] };
  const binding = { schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId: "DELIVER-AC-1", candidateCommit: original.candidate.commit, candidateTree: original.candidate.tree, runner: "claude", role: "pipeline-core:goldfish-implementor", agentType: "goldfish-implementor", model: "sonnet", effort: "medium", rulesetSha: "c".repeat(64), allowedPaths: ["src/change.mjs"], itemDelivery,
    criticDecision: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false, diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" } };
  const input = { cwd: root, session_id: "native-session-one", tool_name: "Task", tool_use_id: "native-tool-one", tool_input: { subagent_type: "pipeline-core:goldfish-implementor", prompt: hostPrompt(binding), run_in_background: false } };
  try { return runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input })); } catch (error) { return { ok: false, thrown: error?.reason ?? error?.message }; }
}

/** Every file under the registry root, relative to it. */
function walk(repository, dir = join(repository.commonDir, ROOT), base = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name), relative = base ? `${base}/${name}` : name;
    if (lstatSync(path).isDirectory()) out.push(...walk(repository, path, relative)); else out.push(relative);
  }
  return out;
}
/** Files of the native-goldfish member directory that the producer record does not index (what the closure walk would refuse). */
function unindexedMembers(repository) {
  const common = repository.commonDir;
  const producer = JSON.parse(readFileSync(join(common, ROOT, "producers/native-goldfish.json"), "utf8"));
  const indexed = new Set(producer.members.map((entry) => entry.memberRef.path.split("/").pop()));
  const dir = join(common, ROOT, "members/native-goldfish");
  return (existsSync(dir) ? readdirSync(dir) : []).filter((name) => !indexed.has(name));
}
/** True for the publication of the producer record that follows a reservation's member record (an earlier heal also republishes it, so a member must exist already). */
function producerAfterMember(repository, to) {
  if (!String(to).endsWith("producers/native-goldfish.json")) return false;
  const dir = join(repository.commonDir, ROOT, "members/native-goldfish");
  return existsSync(dir) && readdirSync(dir).length > 0;
}
const abandonedNames = (repository, suffix) => { const dir = join(repository.commonDir, ABANDONED); return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(suffix)) : []; };

test("C19J-W243-1 the refusal for an unindexed entry names its registry-relative path and parsed schema", linuxOnly, () => fixture(({ repository }) => {
  const dir = join(repository.commonDir, ROOT, "members/native-goldfish");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, "member-stray.7.json"), canonical({ schema: "pipeline.session-authority-member.v1", note: "left behind" }), { mode: 0o600 });
  const read = registry.inspectSessionAuthorityRegistryRead({ repository });
  assert.equal(read.status, "refused", JSON.stringify(read));
  assert.equal(read.code, "SDC-AUTHORITY-UNAVAILABLE");
  assert.match(read.reason, /^unknown-registry-entry\b/u, "the reason keeps the leading word the repair tools classify on");
  assert.ok(read.reason.includes("members/native-goldfish/member-stray.7.json"), `the refusal names the entry: ${read.reason}`);
  assert.ok(read.reason.includes("pipeline.session-authority-member.v1"), `the refusal names the parsed schema: ${read.reason}`);
  writeFileSync(join(repository.commonDir, ROOT, "zz-plain.json"), canonical({ nothing: true }), { mode: 0o600 });
  rmSync(join(dir, "member-stray.7.json"));
  const plain = registry.inspectSessionAuthorityRegistryRead({ repository });
  assert.ok(plain.reason.includes("zz-plain.json") && /schema none/u.test(plain.reason), `an entry without a schema is named too: ${plain.reason}`);
}));

test("C19J-W243-2 a member published before a producer publication that fails is moved aside, and the publish temp does not stay behind", linuxOnly, () => fixture((f) => {
  const { repository } = f;
  const before = walk(repository);
  registry.setSessionAuthorityRegistryTestSeam({ rename: (from, to) => { if (producerAfterMember(repository, to)) throw eperm("rename over the producer record"); return renameSync(from, to); } });
  const prepared = dispatchOnce(f);
  registry.setSessionAuthorityRegistryTestSeam(undefined);
  assert.equal(prepared.ok, false, "the dispatch is refused when its reservation cannot be indexed");
  assert.deepEqual(unindexedMembers(repository), [], "no member record is left that the producer does not index");
  assert.deepEqual(walk(repository).filter((name) => name.includes(".tmp-")), [], "no publish temp is left behind");
  assert.deepEqual(walk(repository), before, "the registry holds exactly the files it held before the refused reservation");
  const asides = abandonedNames(repository, "-unindexed-record");
  assert.equal(asides.length, 1, "the orphan is retained aside, not deleted");
  assert.ok(readdirSync(join(repository.commonDir, ABANDONED, asides[0], "members/native-goldfish")).length === 1);
  assert.equal(registry.inspectSessionAuthorityRegistryRead({ repository }).reason?.startsWith("unknown-registry-entry") ?? false, false, "the read no longer refuses an unknown entry");
}));

test("C19J-W243-3 a rename that fails with EPERM once on the aside move is retried and the leftover still leaves the walk", linuxOnly, () => fixture((f) => {
  const { repository } = f;
  let asideFaults = 0;
  registry.setSessionAuthorityRegistryTestSeam({ rename: (from, to) => {
    if (producerAfterMember(repository, to)) throw eperm("rename over the producer record");
    if (String(to).includes(`${ABANDONED}/`) && String(to).endsWith(".json") && asideFaults < 1) { asideFaults += 1; throw eperm("rename of the orphan"); }
    return renameSync(from, to);
  } });
  const prepared = dispatchOnce(f);
  registry.setSessionAuthorityRegistryTestSeam(undefined);
  assert.equal(prepared.ok, false);
  assert.equal(asideFaults, 1, "the aside move met its EPERM");
  assert.deepEqual(unindexedMembers(repository), [], "the retry moved the orphan");
}));

test("C19J-W243-4 a leftover that cannot be moved aside is not kept silently: the refusal names it", linuxOnly, () => fixture((f) => {
  const { repository } = f;
  registry.setSessionAuthorityRegistryTestSeam({ rename: (from, to) => {
    if (producerAfterMember(repository, to) || String(to).includes(`${ABANDONED}/`)) throw eperm("rename");
    return renameSync(from, to);
  } });
  const prepared = dispatchOnce(f);
  registry.setSessionAuthorityRegistryTestSeam(undefined);
  assert.equal(prepared.ok, false);
  const [orphan] = unindexedMembers(repository);
  assert.ok(orphan, "the orphan could not be moved, so it is still there");
  assert.ok(JSON.stringify(prepared).includes(orphan), `the refusal carries the orphan's name (${orphan}): ${JSON.stringify(prepared).slice(0, 400)}`);
}));

// ---- Windows helper: a failed lock create leaves its temp ---------------------------------------------------------------------------------------
function factsOf(path) {
  const s = lstatSync(path, { bigint: true });
  if (s.isDirectory()) return [s.dev, s.ino, s.nlink, s.mode, 0, "directory", s.mtimeNs, s.ctimeNs, "directory", sha256(path)].join(":");
  return [s.dev, s.ino, s.nlink, s.mode, 0, `0:${s.size}`, s.mtimeNs, s.ctimeNs, `0:${s.birthtimeNs}`, sha256(readFileSync(path))].join(":");
}
/** The helper's documented behaviour on a lost exclusive create: the temp it wrote stays when its own cleanup loses ("Keep an unverified orphan"). */
function emulateLeavingTemp(request) {
  const { operation, path } = request;
  const answer = (facts, bytes, committed) => ({ ok: true, facts, bytes, committed });
  try {
    if (["inspect", "ancestor", "ancestor-above-root"].includes(operation)) return answer(factsOf(path), null, false);
    if (operation === "read" || operation === "read-source") return answer(factsOf(path), readFileSync(path).toString("base64"), false);
    if (operation === "publish") {
      if (request.expectedSha256 === null && existsSync(path)) {
        writeFileSync(join(dirname(path), `.authority-${randomBytes(16).toString("hex")}.tmp`), Buffer.from(request.bytes, "base64"), { mode: 0o600 });
        return { ok: false, code: "WIN-AUTH-EXCLUSIVE-CREATE", committed: false };
      }
      writeFileSync(path, Buffer.from(request.bytes, "base64"), { mode: 0o600 });
      return answer(factsOf(path), null, true);
    }
    if (operation === "remove") { rmSync(path); return answer("removed", null, true); }
    if (operation === "create-directory") { mkdirSync(path, { mode: 0o700 }); return answer(factsOf(path), null, true); }
  } catch { return { ok: false, code: "WIN-AUTH-IO", committed: false }; }
  return { ok: false, code: "WIN-AUTH-OPERATION", committed: false };
}

test("C19J-W243-5 a Windows lock create that fails leaves no helper temp in the registry root", linuxOnly, () => fixture(({ repository }) => {
  const own = observeLinuxProcess(process.pid);
  const holder = { schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "d".repeat(64), owner: { pid: process.pid, hostSha256: sha256(hostname()), process: { start: own.start, bootSha256: own.bootSha256 }, acquiredAt: new Date().toISOString() } };
  const lockFile = join(repository.commonDir, ROOT, "registry.lock");
  writeFileSync(lockFile, canonical(holder), { mode: 0o600, flag: "wx" });
  const spawn = (_executable, _args, options) => ({ status: 0, signal: null, stderr: "", stdout: JSON.stringify(emulateLeavingTemp(JSON.parse(options.input))) });
  const previous = process.env.PIPELINE_AUTHORITY_NO_MEMO;
  process.env.PIPELINE_AUTHORITY_NO_MEMO = "1";
  backend.setWindowsOwnedAuthorityBackendTestSeam({ platform: "win32", spawn });
  backend.resetWindowsOwnedAuthorityBackendMemo();
  try {
    registry.setSessionAuthorityRegistryTestSeam({ platform: "win32" });
    assert.throws(() => enter(repository), (error) => error.code === "SDC-LOCK-HELD", "the holder is alive, so the entry waits and is refused");
    const temps = readdirSync(join(repository.commonDir, ROOT)).filter((name) => /^\.authority-.*\.tmp$/u.test(name));
    assert.deepEqual(temps, [], "the helper temps of the lost creates were removed by the writer that made them");
  } finally {
    registry.setSessionAuthorityRegistryTestSeam(undefined);
    backend.setWindowsOwnedAuthorityBackendTestSeam(undefined);
    backend.resetWindowsOwnedAuthorityBackendMemo();
    if (previous === undefined) delete process.env.PIPELINE_AUTHORITY_NO_MEMO; else process.env.PIPELINE_AUTHORITY_NO_MEMO = previous;
  }
}));

test("C19J-W243-6 a move-aside that faults part-way puts every moved entry back", linuxOnly, () => fixture(({ repository }) => {
  const before = walk(repository);
  registry.setSessionAuthorityRegistryTestSeam({ rename: (from, to) => {
    if (String(to).includes(`${ABANDONED}/`) && String(to).endsWith("-repair-move-aside/producers")) throw eperm("rename of producers");
    return renameSync(from, to);
  } });
  try {
    assert.throws(() => registry.moveSessionAuthorityRegistryAside({ repository, reason: "fixture" }), (error) => error.code === "EPERM");
  } finally { registry.setSessionAuthorityRegistryTestSeam(undefined); }
  assert.deepEqual(walk(repository), before, "every entry is back where it was");
  assert.equal(registry.inspectSessionAuthorityRegistryRead({ repository }).status, "readable");
}));
