// SPDX-License-Identifier: SUL-1.0
// C19I-W238 (AC-108, PO decision 2026-11-06): the registry makes fewer native observations without giving up a check.
// Windows branches run on Linux: the registry's platform seam says win32 and the backend's fake spawn emulates the helper over the real
// file system, so every case counts the native operations the registry asks for.
//   C19I-W238-1  O7  the closure walk does not inspect a file the same boundary already read; an unknown file is still inspected
//   C19I-W238-2  O8  the boundary-entry heal runs once per process, not on every entry
//   C19I-W238-3  O3  (ii) the persisted source-digest memo module: identity-keyed, validated, bounded
//   C19I-W238-4  O3  (ii) installedSourceSha256 reads a source file natively once across processes, and again after any identity change
//   C19I-W238-5  Pru settled (released) native-goldfish members older than the newest N leave the walked registry, retained under abandoned
//   C19I-W238-6  O9  an override refusal reads the baseline of the override producer only (the registry's test seam counts the reads)
//   C19I-W238-7  O8  a namespace rewritten outside the registry after the process's first entry is healed by the next boundary's first strict read
//   C19I-W238-8  Pru a fault in the prune that rides on a release never fails the release and leaves the registry readable
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync, utimesSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordHumanGuardDenial } from "./human-guard-override.mjs";
import { canonical } from "./po-approval-proof.mjs";
import { createSessionAuthorityParticipantPorts } from "./session-authority-observers.mjs";
import * as registry from "./session-authority-registry.mjs";
import * as backend from "./windows-owned-authority-backend.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { createControlledMethodRuntimeFixture } from "./session-requester-bridge.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "./native-goldfish-host-return.mjs";
import { integrateNativeGoldfishItemDelivery, prepareNativeGoldfishHostState } from "./native-goldfish-host-state.mjs";
import { finalizeNativeGoldfishHostReturn } from "./native-goldfish-host-finalizer.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "./test-item-approved-course-fixture.mjs";

const { initializeSessionAuthorityRegistry, withSessionAuthorityBoundary } = registry;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const linuxOnly = { skip: process.platform !== "linux" };

function fixture(run) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "session-authority-fewer-checks-"));
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
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// ---- the helper emulator: real file system, helper-shaped answers -------------------------------------------------------------------------------
function factsOf(path) {
  const s = lstatSync(path, { bigint: true });
  if (s.isDirectory()) return [s.dev, s.ino, s.nlink, s.mode, 0, "directory", s.mtimeNs, s.ctimeNs, "directory", sha256(path)].join(":");
  return [s.dev, s.ino, s.nlink, s.mode, 0, `0:${s.size}`, s.mtimeNs, s.ctimeNs, `0:${s.birthtimeNs}`, sha256(readFileSync(path))].join(":");
}
const answer = (facts, bytes, committed) => ({ ok: true, facts, bytes, committed });
const refusal = (code) => ({ ok: false, code, committed: false });
function emulate(request) {
  const { operation, path } = request;
  try {
    if (["inspect", "ancestor", "ancestor-above-root"].includes(operation)) return answer(factsOf(path), null, false);
    if (operation === "read" || operation === "read-source") return answer(factsOf(path), readFileSync(path).toString("base64"), false);
    if (operation === "publish") {
      const exists = existsSync(path);
      if (request.expectedSha256 === null) { if (exists) return refusal("WIN-AUTH-EXISTS"); }
      else if (!exists || sha256(readFileSync(path)) !== request.expectedSha256) return refusal("WIN-AUTH-CAS");
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, Buffer.from(request.bytes, "base64"), { mode: 0o600 });
      return answer(factsOf(path), null, true);
    }
    if (operation === "remove") { unlinkSync(path); return answer("removed", null, true); }
    if (operation === "create-directory") { mkdirSync(path, { mode: 0o700 }); return answer(factsOf(path), null, true); }
  } catch { return refusal("WIN-AUTH-IO"); }
  return refusal("WIN-AUTH-OPERATION");
}
function withWin32(run, { sourceDigestMemoFile } = {}) {
  const calls = [];
  const spawn = (_executable, _args, options) => {
    const request = JSON.parse(options.input);
    calls.push({ op: request.operation, path: request.path, directory: request.directory === true });
    return { status: 0, signal: null, stderr: "", stdout: JSON.stringify(emulate(request)) };
  };
  const previous = process.env.PIPELINE_AUTHORITY_NO_MEMO;
  // The backend's own memo would absorb repeats inside one process; this file counts the observations the registry asks for.
  process.env.PIPELINE_AUTHORITY_NO_MEMO = "1";
  backend.setWindowsOwnedAuthorityBackendTestSeam({ platform: "win32", spawn });
  backend.resetWindowsOwnedAuthorityBackendMemo();
  try {
    registry.setSessionAuthorityRegistryTestSeam({ platform: "win32", sourceDigestMemoFile });
    return run({ calls });
  } finally {
    registry.setSessionAuthorityRegistryTestSeam?.(undefined);
    backend.setWindowsOwnedAuthorityBackendTestSeam(undefined);
    backend.resetWindowsOwnedAuthorityBackendMemo();
    if (previous === undefined) delete process.env.PIPELINE_AUTHORITY_NO_MEMO; else process.env.PIPELINE_AUTHORITY_NO_MEMO = previous;
  }
}
const ROOT = "agent-pipeline/session-authority";
const enter = (repository, callback = () => null) => withSessionAuthorityBoundary({ repository }, callback);
const count = (calls, ...ops) => calls.filter((c) => ops.includes(c.op)).length;

// ---- O7 -----------------------------------------------------------------------------------------------------------------------------------------
test("C19I-W238-1 (O7) a file read in the boundary is not inspected a second time by the closure walk; an unknown file still is", linuxOnly, () => fixture(({ repository }) => withWin32(({ calls }) => {
  calls.length = 0;
  enter(repository);
  assert.ok(count(calls, "publish") >= 1 && count(calls, "remove") >= 1, "the Windows branch ran: the lock was created and removed natively");
  assert.ok(count(calls, "read") >= 10, `the entry heal read the indexed records natively (${count(calls, "read")})`);
  const fileInspects = calls.filter((c) => c.op === "inspect" && !c.directory);
  assert.deepEqual(fileInspects, [], "every file the walk lists was read or created in this boundary, so no second inspect is made");
  assert.ok(calls.some((c) => c.op === "inspect" && c.directory), "directories are still inspected");

  const stray = join(repository.commonDir, ROOT, "zz-unknown.json");
  writeFileSync(stray, "{}", { mode: 0o600 });
  calls.length = 0;
  assert.throws(() => enter(repository, (token) => registry.healSessionAuthorityDrift({ boundary: token })), (error) => /^unknown-registry-entry: zz-unknown\.json \(schema none\)$/u.test(error.reason)); // C19J-W243: the same refusal, now naming the entry
  const strays = calls.filter((c) => c.op === "inspect" && !c.directory);
  assert.deepEqual(strays.map((c) => c.path), [stray], "a file the boundary never read is inspected natively before it is refused as unknown");
})));

// ---- O8 -----------------------------------------------------------------------------------------------------------------------------------------
test("C19I-W238-2 (O8) the boundary-entry heal reads the registry once per process, not on every entry", linuxOnly, () => fixture(({ repository }) => withWin32(({ calls }) => {
  calls.length = 0;
  enter(repository);
  const first = count(calls, "read", "inspect");
  calls.length = 0;
  enter(repository);
  const second = count(calls, "read", "inspect");
  assert.ok(first >= 20, `the first entry healed (${first} observations)`);
  assert.ok(second * 3 < first, `a later entry in the same process makes far fewer observations (${second} against ${first})`);
  // The stateRead of a callback is not affected: it still walks the whole registry.
  calls.length = 0;
  enter(repository, (token) => registry.healSessionAuthorityDrift({ boundary: token }));
  assert.ok(count(calls, "read") >= 10, "an explicit heal (the repair verb) and a callback's own stateRead still read everything");
})));

// ---- O3 (ii) ------------------------------------------------------------------------------------------------------------------------------------
test("C19I-W238-3 (O3 ii) the persisted source-digest memo answers only for the identity it stored and ignores anything malformed", async () => {
  const memo = await import("./source-digest-memo.mjs");
  const dir = mkdtempSync(join(nativeContractFixtureParent(), "source-digest-memo-"));
  try {
    const source = join(dir, "source.mjs"), file = join(dir, "memo.json");
    writeFileSync(source, "export const a = 1;\n");
    const identity = memo.sourceIdentity(source);
    assert.match(identity, /^[0-9:]+$/u);
    assert.equal(identity.split(":").length, 8, "dev, ino, mode, nlink, size, mtimeNs, ctimeNs, birthtimeNs");
    const first = memo.createSourceDigestMemo({ file });
    assert.equal(first.lookup(source, identity), null);
    first.remember(source, identity, "a".repeat(64));
    first.flush();
    const second = memo.createSourceDigestMemo({ file });
    assert.equal(second.lookup(source, identity), "a".repeat(64), "another process reads the digest back");
    writeFileSync(source, "export const a = 2;\n");
    assert.equal(second.lookup(source, memo.sourceIdentity(source)), null, "a changed identity is a miss");
    assert.equal(second.lookup(join(dir, "other.mjs"), identity), null, "another path is a miss");

    const good = JSON.parse(readFileSync(file, "utf8"));
    for (const [label, text] of [
      ["not json", "{"],
      ["foreign schema", JSON.stringify({ ...good, schema: "other.v1" })],
      ["extra top key", JSON.stringify({ ...good, extra: 1 })],
      ["relative path", JSON.stringify({ ...good, entries: [{ ...good.entries[0], path: "source.mjs" }] })],
      ["non-hex digest", JSON.stringify({ ...good, entries: [{ ...good.entries[0], sha256: "zz" }] })],
      ["bad identity", JSON.stringify({ ...good, entries: [{ ...good.entries[0], identity: "1:2;3" }] })],
      ["extra entry key", JSON.stringify({ ...good, entries: [{ ...good.entries[0], extra: 1 }] })],
      ["oversized", `${JSON.stringify(good)}${" ".repeat(2 * 1024 * 1024)}`],
    ]) {
      writeFileSync(file, text);
      assert.equal(memo.createSourceDigestMemo({ file }).lookup(source, identity), null, `${label}: no persisted answer`);
    }
    const bounded = memo.createSourceDigestMemo({ file: join(dir, "bounded.json") });
    for (let i = 0; i < memo.SOURCE_DIGEST_MEMO_MAX_ENTRIES + 20; i++) bounded.remember(join(dir, `f${i}.mjs`), `1:${i}:1:1:1:1:1:1`, "b".repeat(64));
    bounded.flush();
    assert.ok(JSON.parse(readFileSync(join(dir, "bounded.json"), "utf8")).entries.length <= memo.SOURCE_DIGEST_MEMO_MAX_ENTRIES, "the file keeps at most the bound");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("C19I-W238-4 (O3 ii) a source file is read natively once across processes and again after any identity change", linuxOnly, () => {
  const dir = mkdtempSync(join(nativeContractFixtureParent(), "source-digest-registry-"));
  try {
    const source = join(dir, "producer.mjs"), memoFile = join(dir, "memo.json");
    writeFileSync(source, "export const producer = 1;\n");
    withWin32(({ calls }) => {
      const cold = registry.installedSourceSha256(source, "fixture-producer");
      assert.equal(cold, sha256("export const producer = 1;\n"));
      assert.equal(count(calls, "read-source"), 1, "the cold digest is read natively");
      assert.equal(registry.installedSourceSha256(source, "fixture-producer"), cold);
      assert.equal(count(calls, "read-source"), 1, "the per-process memo answers the repeat");
    }, { sourceDigestMemoFile: memoFile });
    assert.ok(existsSync(memoFile), "the digest was persisted");
    withWin32(({ calls }) => {
      // A new process: the seam call above cleared the per-process memo; only the persisted file is left.
      assert.equal(registry.installedSourceSha256(source, "fixture-producer"), sha256("export const producer = 1;\n"));
      assert.equal(count(calls, "read-source"), 0, "an unchanged source file is not read again in another process");
    }, { sourceDigestMemoFile: memoFile });
    writeFileSync(source, "export const producer = 2;\n");
    withWin32(({ calls }) => {
      assert.equal(registry.installedSourceSha256(source, "fixture-producer"), sha256("export const producer = 2;\n"));
      assert.equal(count(calls, "read-source"), 1, "a changed file is read again");
    }, { sourceDigestMemoFile: memoFile });
    // Same bytes, same size, but a later mtime: the identity moved, so the file is read again.
    const later = new Date(Date.now() + 5000);
    utimesSync(source, later, later);
    withWin32(({ calls }) => {
      assert.equal(registry.installedSourceSha256(source, "fixture-producer"), sha256("export const producer = 2;\n"));
      assert.equal(count(calls, "read-source"), 1, "any identity change re-reads");
    }, { sourceDigestMemoFile: memoFile });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- prune --------------------------------------------------------------------------------------------------------------------------------------
const rnd = (label) => sha256(`seed:${label}`);
/** Settled native-goldfish members written the way the registry writes them (canonical JSON, 0600), indexed by the producer and the catalogue. */
function seedNativeMembers(repository, released, { reserved = 0 } = {}) {
  const common = repository.commonDir, local = (path) => join(common, path);
  const write = (path, value) => { mkdirSync(dirname(local(path)), { recursive: true, mode: 0o700 }); writeFileSync(local(path), canonical(value), { mode: 0o600 }); const bytes = readFileSync(local(path)); return { path: `.git/${path}`, sha256: sha256(bytes), size: bytes.length }; };
  const catalogue = JSON.parse(readFileSync(local(`${ROOT}/catalogue.json`), "utf8"));
  const at = catalogue.producers.findIndex((entry) => entry.producerId === "native-goldfish");
  const producer = JSON.parse(readFileSync(local(catalogue.producers[at].producerRef.path.slice(5)), "utf8"));
  const fact = (label) => ({ namespaceId: "native-goldfish-host-commit", pathSha256: rnd(`path:${label}`), sha256: rnd(`bytes:${label}`), size: 10, identity: { dev: "1", ino: "1", mode: 384, nlink: 1 }, semanticSha256: rnd(`semantic:${label}`) });
  const ids = [];
  for (let i = 0; i < released + reserved; i++) {
    const settled = i < released, memberId = `member-seed-${String(i).padStart(3, "0")}`, memberGeneration = i + 1;
    const base = { repositorySha256: catalogue.repositorySha256, producerId: "native-goldfish", memberId, memberGeneration };
    let releaseRef = null;
    if (settled) releaseRef = write(`${ROOT}/releases/native-goldfish/${memberId}.${memberGeneration}.json`, { schema: "pipeline.session-authority-release.v1", ...base, memberPreimageSha256: rnd(`pre:${i}`), bindingSha256: rnd(`binding:${i}`), terminal: "completed", sourceFacts: [fact(`release:${i}`)], createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, i)).toISOString() });
    const when = new Date(Date.UTC(2026, 10, 1, 1, 0, i)).toISOString();
    const memberRef = write(`${ROOT}/members/native-goldfish/${memberId}.${memberGeneration}.json`, { schema: "pipeline.session-authority-member.v1", ...base, revision: 2, association: { state: "unbound", target: null }, kinds: ["dispatch"], bindingSha256: rnd(`binding:${i}`), phase: settled ? "released" : "reserved", sourceFacts: [], createdAt: when, updatedAt: when, releaseRef });
    producer.members.push({ memberId, memberGeneration, memberRef });
    ids.push({ memberId, settled });
  }
  const producerRef = write(catalogue.producers[at].producerRef.path.slice(5), producer);
  catalogue.producers[at] = { ...catalogue.producers[at], producerRef };
  write(`${ROOT}/catalogue.json`, catalogue);
  return ids;
}

test("C19I-W238-5 (prune) released native-goldfish members older than the newest N leave the walked registry and are retained", linuxOnly, () => fixture(({ repository }) => {
  const kept = registry.SESSION_AUTHORITY_SETTLED_MEMBERS_KEPT;
  assert.ok(Number.isSafeInteger(kept) && kept >= 1);
  const extra = 5, ids = seedNativeMembers(repository, kept + extra, { reserved: 1 });
  assert.equal(registry.inspectSessionAuthorityRegistryRead({ repository }).status, "readable", "the seeded registry reads");
  const walkReads = () => withWin32(({ calls }) => { calls.length = 0; enter(repository, (token) => registry.healSessionAuthorityDrift({ boundary: token })); return count(calls, "read"); });
  const before = walkReads();

  const result = enter(repository, (token) => registry.pruneSettledSessionAuthorityMembers({ boundary: token }));
  assert.equal(result.status, "pruned");
  assert.deepEqual(result.pruned.map((row) => row.memberId).sort(), ids.slice(0, extra).map((row) => row.memberId), "the oldest settled members are the ones archived");
  assert.equal(registry.inspectSessionAuthorityRegistryRead({ repository }).status, "readable", "the pruned registry still closes");
  const memberFiles = readdirSync(join(repository.commonDir, ROOT, "members/native-goldfish"));
  assert.equal(memberFiles.length, kept + 1, "the newest N settled members and the unsettled one stay");
  assert.ok(memberFiles.some((name) => name.startsWith(ids.at(-1).memberId)), "a member that is not released is never archived");
  assert.equal(readdirSync(join(repository.commonDir, ROOT, "releases/native-goldfish")).length, kept);
  const abandoned = join(repository.commonDir, "agent-pipeline/session-authority-abandoned");
  const archive = readdirSync(abandoned).filter((name) => name.endsWith("-settled-members"));
  assert.equal(archive.length, 1);
  assert.equal(readdirSync(join(abandoned, archive[0], "members/native-goldfish")).length, extra, "nothing is deleted: the members are retained");
  assert.equal(readdirSync(join(abandoned, archive[0], "releases/native-goldfish")).length, extra);
  assert.ok(existsSync(join(abandoned, archive[0], "prune.json")));

  const after = walkReads();
  assert.ok(after <= before - 2 * extra, `the closure walk reads fewer files (${after} against ${before})`);
  assert.equal(enter(repository, (token) => registry.pruneSettledSessionAuthorityMembers({ boundary: token })).status, "nothing-to-prune", "a second run has nothing to do");
}));

// ---- O9 -----------------------------------------------------------------------------------------------------------------------------------------
const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
test("C19I-W238-6 (O9) an override refusal reads the baselines of the override producer only, not of all twelve", linuxOnly, () => {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "session-authority-planning-"));
  const observed = [];
  try {
    assert.equal(spawnSync("git", ["init", "-q", "-b", "main", root]).status, 0);
    for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"], ["core.hooksPath", devNull]]) assert.equal(spawnSync("git", ["-C", root, "config", name, value]).status, 0);
    writeFileSync(join(root, "README.md"), "fixture\n");
    writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
    assert.equal(spawnSync("git", ["-C", root, "add", "README.md", "pipeline.user.yaml"]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "commit", "-q", "-m", "fixture"]).status, 0);
    const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host") });
    const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "fixture explicit course" });
    assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
    prepareApprovedItemCourseFixture({ root });
    const repository = inspectSignedDescriptorCustodyRepository(root);
    assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
    registry.setSessionAuthorityRegistryTestSeam({ onPlanningBaseline: (producerId) => observed.push(producerId) });
    const recorded = recordHumanGuardDenial({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput: { file_path: "notes.md", content: "O9\n" }, denials: [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DEVPLAN-SHELL" }], nowMs: Date.now() });
    assert.equal(recorded.status, "planned", JSON.stringify(recorded));
    assert.ok(observed.length >= 1, "the refusal went through the registry planning path");
    assert.deepEqual([...new Set(observed)], ["human-guard-override"], "no other producer's baseline is read");
    assert.ok(observed.length <= 3, `the baseline is read before, after and once more before the compare-and-swap (${observed.length})`);
    assert.equal(registry.inspectSessionAuthorityRegistryRead({ repository }).status, "readable", "the registry closes after the planning publication");
  } finally { registry.setSessionAuthorityRegistryTestSeam(undefined); rmSync(root, { recursive: true, force: true }); }
});

// ---- O8 re-arm ----------------------------------------------------------------------------------------------------------------------------------
test("C19I-W238-7 (O8) a namespace rewritten outside the registry after the process's first entry is healed by the next boundary's first strict read", linuxOnly, () => fixture(({ root, repository }) => {
  const producerPort = createSessionAuthorityParticipantPorts({ repository }).find((row) => row.producerId === "onboarding-continuity").port;
  const read = () => enter(repository, (token) => registry.inspectSourceOwnedSessionAuthorityProducerRecord({ boundary: token, producerPort }));
  const abandoned = join(repository.commonDir, "agent-pipeline/session-authority-abandoned");
  const heals = () => (existsSync(abandoned) ? readdirSync(abandoned).filter((name) => name.endsWith("-drift-heal")) : []);
  assert.equal(read().record.producerId, "onboarding-continuity", "the process's first entry heals and reads");
  assert.equal(heals().length, 0, "no drift, no heal");
  // Another writer's bytes for the selected state, as a fold or a git checkout leave them, between two entries of this process.
  const statePath = join(root, ".claude/pipeline-state.json");
  writeFileSync(statePath, `${readFileSync(statePath, "utf8")}\n`);
  let second;
  try { second = read(); } catch (error) { second = { refused: error?.reason ?? String(error) }; }
  assert.equal(second.record?.producerId, "onboarding-continuity", `the second entry does not refuse the rewrite: the heal runs again (${JSON.stringify(second)})`);
  assert.equal(heals().length, 1, "the heal retained the prior producer record under a marker");
  const marker = JSON.parse(readFileSync(join(abandoned, heals()[0], "heal.json"), "utf8"));
  assert.ok(marker.healed.some((row) => row.producerId === "onboarding-continuity" && row.namespaces.includes("selected-state")), JSON.stringify(marker));
  read();
  assert.equal(heals().length, 1, "a later entry with no further drift heals nothing");
}));

// ---- prune fault on release ---------------------------------------------------------------------------------------------------------------------
const hostPrompt = (binding) => `Goldfish briefing\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nReturn contract follows.\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n`;
/** One real native dispatch delivered, finalized and integrated (which releases its member) over a registry that already holds kept+1 settled members, with the prune faulted at `stage`. */
function releaseWithPruneFault(stage, check) {
  return fixture(({ root, repository, original }) => {
    const kept = registry.SESSION_AUTHORITY_SETTLED_MEMBERS_KEPT;
    seedNativeMembers(repository, kept + 1);
    const memberFiles = () => readdirSync(join(repository.commonDir, ROOT, "members/native-goldfish")).length;
    const abandoned = join(repository.commonDir, "agent-pipeline/session-authority-abandoned");
    const runtime = createControlledMethodRuntimeFixture({ repository, fixtureRoot: join(repository.commonDir, "agent-pipeline/controlled-method-fixtures/original-course"), sessionId: "original-course-owner" });
    const itemDelivery = { schema: "pipeline.item-delivery-briefing.v1", sliceId: "ITEM-AC-1", itemId: "AC-1", criterionLocator: original.criterionLocator, checks: [{ id: "criterion-one", path: "src/change.test.mjs", dependencies: ["src/change.mjs", "src/change.test.mjs"] }] };
    const binding = { schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId: "DELIVER-AC-1", candidateCommit: original.candidate.commit, candidateTree: original.candidate.tree, runner: "claude", role: "pipeline-core:goldfish-implementor", agentType: "goldfish-implementor", model: "sonnet", effort: "medium", rulesetSha: "c".repeat(64), allowedPaths: ["src/change.mjs"], itemDelivery,
      criticDecision: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false, diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" } };
    const input = { cwd: root, session_id: "native-session-one", tool_name: "Task", tool_use_id: "native-tool-one", tool_input: { subagent_type: "pipeline-core:goldfish-implementor", prompt: hostPrompt(binding), run_in_background: false } };
    const prepared = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input }));
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.equal(memberFiles(), kept + 2, "the dispatch reserved one member next to the settled ones");
    // The Goldfish delivered; the finalizer records the authored commit and the integration releases the member.
    writeFileSync(join(root, "src/change.mjs"), "export const value='expected'; // delivered\n");
    const returned = { ...input, hook_event_name: "PostToolUse", tool_response: { status: "completed", resolvedModel: binding.model, content: [{ type: "text", text: JSON.stringify({ schema: "pipeline.native-goldfish-host-return.v1", dispatchId: binding.dispatchId, candidateCommit: binding.candidateCommit, outcome: "succeeded", report: "Delivered.", changedPaths: ["src/change.mjs"] }) }] } };
    const finalized = runtime.run(() => finalizeNativeGoldfishHostReturn({ root, runner: "claude", input: returned }));
    assert.equal(finalized.status, "authored-commit-recorded", JSON.stringify(finalized));
    assert.equal(memberFiles(), kept + 2, "nothing is released or archived before the integration");
    if (stage === "marker") { rmSync(abandoned, { recursive: true, force: true }); writeFileSync(abandoned, "not a directory"); }
    else if (stage !== "none") registry.setSessionAuthorityRegistryTestSeam({ pruneFault: (at) => { if (at === stage) throw Object.assign(new Error("injected prune fault"), { code: "EIO" }); } });
    try {
      const integrated = runtime.run(() => integrateNativeGoldfishItemDelivery({ root, pendingSha256: prepared.sha256 }));
      assert.equal(integrated.status, "integrated", `a prune fault never reports the release as failed (${stage}): ${JSON.stringify(integrated)}`);
    } finally { registry.setSessionAuthorityRegistryTestSeam(undefined); if (stage === "marker") rmSync(abandoned, { force: true }); }
    const after = inspectSignedDescriptorCustodyRepository(root); // the authored commit moved HEAD, so the binding is read afresh
    const read = registry.inspectSessionAuthorityRegistryRead({ repository: after });
    assert.equal(read.status, "readable", `the registry stays readable (${stage}): ${JSON.stringify(read)}`);
    return check({ repository: after, memberFiles, kept });
  });
}
test("C19I-W238-8 (prune) a fault in the prune that rides on a release never fails the release and leaves the registry readable; the next prune retries", linuxOnly, () => {
  releaseWithPruneFault("none", ({ memberFiles, kept }) => assert.equal(memberFiles(), kept, "the control: without a fault the release trims to the newest N"));
  for (const stage of ["marker", "before-publication"]) {
    releaseWithPruneFault(stage, ({ repository, memberFiles, kept }) => {
      assert.equal(memberFiles(), kept + 2, `nothing was archived and every indexed record is where the producer says (${stage})`);
      const retried = enter(repository, (token) => registry.pruneSettledSessionAuthorityMembers({ boundary: token }));
      assert.equal(retried.status, "pruned", "the next prune finishes the work");
      assert.equal(memberFiles(), kept);
      assert.equal(registry.inspectSessionAuthorityRegistryRead({ repository }).status, "readable");
    });
  }
  releaseWithPruneFault("after-producer-publication", ({ repository, memberFiles, kept }) => {
    assert.equal(memberFiles(), kept, "the producer already indexes the smaller set, so the archived records stay archived");
    assert.equal(enter(repository, (token) => registry.pruneSettledSessionAuthorityMembers({ boundary: token })).status, "nothing-to-prune");
  });
});
