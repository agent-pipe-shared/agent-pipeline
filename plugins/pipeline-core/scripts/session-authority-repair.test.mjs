// SPDX-License-Identifier: SUL-1.0
// D52 (2), PF-55: the general session-authority repair. Every refusal it reports ends in a runnable command,
// and the last resort leaves no state that blocks the next dispatch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { devNull, hostname, tmpdir } from "node:os";
import { observeLinuxProcess } from "../lib/native-platform-process-observer.mjs";
import { join, resolve } from "node:path";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { runSessionAuthorityRepair } from "./session-authority-repair.mjs";
import { cancelUnstartedGovernedItemSlice, checkpointNativeGoldfishItemDelivery, prepareGovernedItemQueue, prepareNativeGoldfishHostState, resolveGovernedItemQueue } from "../lib/native-goldfish-host-state.mjs";
import { enterSessionOwnerFromEnvironment, runCli } from "./slice-queue.mjs";
import { run as runState, describeStateAuthorityRefusal } from "./pipeline-state.mjs";
import * as pipelineState from "./pipeline-state.mjs";
import { fileURLToPath } from "node:url";
import { nativeAuthorityStats, recordNativeAuthoritySpawn, inspectWindowsOwnedAuthorityPath, readWindowsOwnedAuthorityFile, publishWindowsOwnedAuthorityFile, removeWindowsOwnedAuthorityFile, setWindowsOwnedAuthorityBackendTestSeam, resetWindowsOwnedAuthorityBackendMemo } from "../lib/windows-owned-authority-backend.mjs";
import { enterClaudeHookSessionOwner, leaveClaudeHookSessionOwner, readClaudeHookSessionOwner } from "../lib/claude-hook-session-owner.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "../lib/native-goldfish-host-return.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { createSessionAuthorityParticipantPorts } from "../lib/session-authority-observers.mjs";
import { initializeSessionAuthorityRegistry, inspectSessionAuthorityLock, judgeSessionAuthorityLockOwner, releaseSessionAuthorityLock, sessionAuthorityLockOwner } from "../lib/session-authority-registry.mjs";
import { inspectSignedDescriptorCustodyRepository, loadSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { createControlledMethodRuntimeFixture } from "../lib/session-requester-bridge.mjs";
import { prepareApprovedItemCourseFixture, nativeContractFixtureParent } from "../lib/test-item-approved-course-fixture.mjs";
import { CANCEL_CLASS_HELP, CANCEL_CLASSES } from "../lib/slice-queue.mjs";

// Memo cases (SAS09..SAS17): a fake native spawn on a real temp file; the real PowerShell exists only on Windows.
const MEMO_FACTS = `1:1:1:1:1:directory:1:1:directory:${"a".repeat(64)}`;
function memoFixture(run, { hook, refuse = false, bytes = "hello" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "authority-memo-"));
  const calls = [];
  const spawn = (_executable, _args, options) => {
    const request = JSON.parse(options.input);
    calls.push(request.operation);
    if (hook) hook(request);
    const body = refuse ? { ok: false, code: "WIN-AUTH-ACL", committed: false }
      : { ok: true, facts: request.operation === "remove" ? "removed" : MEMO_FACTS, bytes: Buffer.from(bytes).toString("base64"), committed: request.operation === "publish" || request.operation === "remove" };
    return { status: 0, signal: null, stderr: "", stdout: JSON.stringify(body) };
  };
  setWindowsOwnedAuthorityBackendTestSeam({ platform: "win32", spawn });
  resetWindowsOwnedAuthorityBackendMemo();
  try { return run({ dir, calls, file: join(dir, "a.txt") }); }
  finally { setWindowsOwnedAuthorityBackendTestSeam(undefined); resetWindowsOwnedAuthorityBackendMemo(); delete process.env.PIPELINE_AUTHORITY_NO_MEMO; rmSync(dir, { recursive: true, force: true }); }
}

function fixture(run) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "session-authority-repair-"));
  try {
    mkdirSync(join(root, "evidence"), { mode: 0o700 });
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"], ["core.hooksPath", devNull]]) assert.equal(spawnSync("git", ["-C", root, "config", name, value]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "commit", "--allow-empty", "-q", "-m", "fixture"]).status, 0);
    return run({ root });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function course(root) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host") });
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "fixture explicit course" });
  assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  const original = prepareApprovedItemCourseFixture({ root });
  const repository = inspectSignedDescriptorCustodyRepository(root);
  const runtime = createControlledMethodRuntimeFixture({ repository, fixtureRoot: join(repository.commonDir, "agent-pipeline/controlled-method-fixtures/original-course"), sessionId: "original-course-owner" });
  const dispatch = (sliceId, dispatchId, toolUseId) => {
    const binding = { schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId, candidateCommit: original.candidate.commit, candidateTree: original.candidate.tree, runner: "claude",
      role: "pipeline-core:goldfish-implementor", agentType: "goldfish-implementor", model: "sonnet", effort: "medium", rulesetSha: "c".repeat(64), allowedPaths: ["src/change.mjs"],
      criticDecision: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
        diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" },
      itemDelivery: { schema: "pipeline.item-delivery-briefing.v1", sliceId, itemId: "AC-1", criterionLocator: original.criterionLocator, checks: [{ id: "criterion-one", path: "src/change.test.mjs", dependencies: ["src/change.mjs", "src/change.test.mjs"] }] } };
    const prompt = `Goldfish briefing\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nReturn contract follows.\nSlice: ${sliceId}\nWrite scope: src/change.mjs\n`;
    const input = { cwd: root, session_id: "native-session-one", tool_name: "Task", tool_use_id: toolUseId, tool_input: { subagent_type: "pipeline-core:goldfish-implementor", prompt, run_in_background: false } };
    return runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input }));
  };
  return { original, repository, runtime, dispatch };
}
// The stored row of a slice in the governed item queue (D75: a cancelled row carries its cancelClass).
function governedRow(root, sliceId) {
  const governed = resolveGovernedItemQueue({ root });
  assert.equal(governed.status, "required", JSON.stringify(governed));
  return JSON.parse(readFileSync(resolve(root, governed.path), "utf8")).slices.find((row) => row.id === sliceId);
}
function repair(...argv) {
  let text = "";
  const code = runSessionAuthorityRepair(argv, (chunk) => { text += chunk; });
  return { code, result: JSON.parse(text) };
}

const cases = [
  { id: "SAR01", name: "usage: an unknown verb or flag, a missing root, and a move-aside without its assertion are refused SAR-ARGS", run: () => fixture(({ root }) => {
    for (const argv of [[], ["fix", "--root", root], ["inspect"], ["inspect", "--root", root, "--force"], ["move-aside", "--root", root, "--reason", "x"], ["move-aside", "--root", root, "--no-goldfish-running"]]) {
      const { code, result } = repair(...argv);
      assert.equal(code, 2, JSON.stringify(argv)); assert.equal(result.code, "SAR-ARGS");
    }
  }) },
  { id: "SAR02", name: "inspect is read-only and reports an absent registry with nothing to do", run: () => fixture(({ root }) => {
    course(root);
    const { code, result } = repair("inspect", "--root", root);
    assert.equal(code, 0); assert.equal(result.status, "inspected"); assert.equal(result.registry.status, "absent"); assert.deepEqual(result.next, []);
  }) },
  { id: "SAR03", name: "a namespace rewritten outside the registry with nothing in flight is named with the heal command, and heal clears it (D51 (1))", run: () => fixture(({ root }) => {
    const { repository } = course(root);
    assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
    const statePath = join(root, ".claude/pipeline-state.json");
    writeFileSync(statePath, `${JSON.stringify(JSON.parse(readFileSync(statePath, "utf8")))}\n`);
    const found = repair("inspect", "--root", root).result;
    const drifted = found.registry.producers.find((row) => row.producerId === "onboarding-continuity");
    assert.equal(drifted.status, "drifted", JSON.stringify(found.registry)); assert.ok(drifted.drifted.includes("selected-state"));
    assert.ok(found.next.some((row) => / heal --root /u.test(row.command)), JSON.stringify(found.next));
    // Critic F8: a heal whose marker cannot be written heals nothing; the prior baseline stays the record.
    const abandoned = join(repository.commonDir, "agent-pipeline/session-authority-abandoned");
    assert.equal(existsSync(abandoned), false); writeFileSync(abandoned, "not a directory\n");
    const blocked = repair("heal", "--root", root);
    assert.equal(blocked.code, 2, JSON.stringify(blocked.result)); assert.equal(blocked.result.status, "refused");
    assert.match(blocked.result.repair, /session-authority-abandoned .*writable directory, run node \S+session-authority-repair\.mjs heal --root /u, JSON.stringify(blocked.result));
    const still = repair("inspect", "--root", root).result.registry.producers.find((row) => row.producerId === "onboarding-continuity");
    assert.equal(still.status, "drifted", JSON.stringify(still));
    rmSync(abandoned);
    const healed = repair("heal", "--root", root);
    assert.equal(healed.code, 0, JSON.stringify(healed.result)); assert.equal(healed.result.status, "healed");
    assert.ok(healed.result.retained.some((name) => name.endsWith("-drift-heal")), JSON.stringify(healed.result.retained));
    assert.equal(healed.result.registry.producers.filter((row) => row.status !== "ok").length, 0, JSON.stringify(healed.result.registry));
    assert.deepEqual(healed.result.next, []);
  }) },
  { id: "SAR04", name: "a registry that no longer reads under an in-flight slice names the cancel and the move-aside; after both the next dispatch runs (D52 (2))", run: () => fixture(({ root }) => {
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    // A registry record whose bytes no longer match the catalogue, as an interrupted write or a foreign tool leaves it.
    const record = join(repository.commonDir, "agent-pipeline/session-authority/producers/native-goldfish.json");
    writeFileSync(record, `${readFileSync(record, "utf8")} `);
    const stuck = dispatch("ITEM-AC-2", "DELIVER-AC-2", "native-tool-two");
    assert.equal(stuck.ok, false, "the record no longer reads, so every operation refuses");
    const found = repair("inspect", "--root", root).result;
    assert.equal(found.registry.read.status, "refused", JSON.stringify(found.registry));
    assert.deepEqual(found.reservations.filter((row) => row.settled === null).map((row) => row.sliceId), ["ITEM-AC-1"]);
    assert.ok(found.next.some((row) => /slice-queue\.mjs cancel ITEM-AC-1 --started --reason/u.test(row.command)), JSON.stringify(found.next));
    assert.ok(found.next.some((row) => / move-aside --root .* --no-goldfish-running --reason/u.test(row.command)), JSON.stringify(found.next));
    // D75: the named cancel carries the class argument and teaches every class from the step's own text.
    const cancelStep = found.next.find((row) => /slice-queue\.mjs cancel ITEM-AC-1 --started --reason/u.test(row.command));
    assert.match(cancelStep.command, /--reason "<why>" --class <budget\|wrong-premise\|review-defect\|integrated-elsewhere\|superseded>$/u, cancelStep.command);
    for (const name of CANCEL_CLASSES) assert.ok(cancelStep.why.includes(`${name} = ${CANCEL_CLASS_HELP[name]}`), `${name} is taught: ${cancelStep.why}`);
    assert.equal(cancelUnstartedGovernedItemSlice({ root, sliceId: "ITEM-AC-1", reason: "its Goldfish stopped", started: true, cancelClass: "budget" }).status, "cancelled");
    const moved = repair("move-aside", "--root", root, "--no-goldfish-running", "--reason", "the native namespace changed under a stopped slice");
    assert.equal(moved.code, 0, JSON.stringify(moved.result)); assert.equal(moved.result.status, "moved-aside");
    const aside = moved.result.retained.find((name) => name.endsWith("-repair-move-aside"));
    assert.ok(aside, JSON.stringify(moved.result.retained));
    const abandoned = join(repository.commonDir, "agent-pipeline/session-authority-abandoned", aside);
    assert.equal(existsSync(join(abandoned, "catalogue.json")), true, "the old registry is retained, not deleted");
    assert.equal(JSON.parse(readFileSync(join(abandoned, "repair.json"), "utf8")).reason, "the native namespace changed under a stopped slice");
    assert.equal(moved.result.registry.status, "absent");
    const next = dispatch("ITEM-AC-2", "DELIVER-AC-2", "native-tool-two");
    assert.equal(next.ok, true, JSON.stringify(next));
  }) },
  { id: "SAR05", name: "a running session binds late from its own session id, to the same descriptor its hooks use; a shell without one stays unbound (D52 (1))", run: () => fixture(({ root }) => {
    const { original, repository, runtime } = course(root);
    const itemDelivery = { schema: "pipeline.item-delivery-briefing.v1", sliceId: "ITEM-AC-0", itemId: "AC-1", criterionLocator: original.criterionLocator, checks: [{ id: "criterion-one", path: "src/change.test.mjs", dependencies: ["src/change.mjs", "src/change.test.mjs"] }] };
    assert.equal(runtime.run(() => prepareGovernedItemQueue({ root, itemDelivery, candidate: original.candidate, writeScope: ["src/change.mjs"] })).status, "required");
    const cwd = process.cwd();
    process.chdir(root);
    try {
      leaveClaudeHookSessionOwner();
      const unbound = runCli(["defer", "ITEM-AC-0", "--reason", "later"]);
      assert.equal(unbound.output.code, "SQ-ITEM-OWNER-REQUIRED", JSON.stringify(unbound.output));
      assert.equal(enterSessionOwnerFromEnvironment({}, root), false, "a shell without a session id stays unbound");
      const sessionId = "abcdef12-0000-4000-8000-000000000001";
      assert.equal(enterSessionOwnerFromEnvironment({ CLAUDE_CODE_SESSION_ID: sessionId }, root), true);
      const bound = runCli(["defer", "ITEM-AC-0", "--reason", "later"]);
      assert.equal(bound.exit, 0, JSON.stringify(bound.output));
      const fromShell = readClaudeHookSessionOwner({ repository });
      enterClaudeHookSessionOwner({ root, input: { session_id: sessionId } });
      const fromHook = readClaudeHookSessionOwner({ repository });
      assert.equal(fromHook.descriptorSha256, fromShell.descriptorSha256, "the hook and the shell resolve one descriptor");
      assert.equal(fromHook.ownerNonceSha256, fromShell.ownerNonceSha256, "so one association");
    } finally { leaveClaudeHookSessionOwner(); process.chdir(cwd); }
  }) },
  { id: "SAR06", name: "a State route the companion has not adopted runs while a catalogue exists and nothing is in flight; an unreadable State producer refuses naming the repair (PF-54, D52 (2))", run: () => fixture(({ root }) => {
    const { repository } = course(root);
    assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
    const state = (...argv) => {
      const lines = [], saved = { log: console.log, error: console.error, warn: console.warn };
      for (const key of Object.keys(saved)) console[key] = (...args) => { lines.push(args.map(String).join(" ")); };
      let status;
      try { status = runState(argv, { dir: root }); } finally { Object.assign(console, saved); }
      return { status, text: lines.join("\n") };
    };
    const subject = () => state("prepare-push-subject", "--by", "Synthetic fixture", "--remote", "origin", "--destination", "refs/heads/main");
    const admitted = subject();
    assert.doesNotMatch(admitted.text, /State authority route unavailable/u, admitted.text);
    assert.match(admitted.text, /prepare-push-subject/u, "the route itself answered");
    // Critic F5: a bound State member that is armed holds the route. The gate reads the raw records, so a member
    // record named by the producer stands in for a State operation in flight.
    const producerPath = join(repository.commonDir, "agent-pipeline/session-authority/producers/onboarding-continuity.json");
    const producerBytes = readFileSync(producerPath), producer = JSON.parse(producerBytes);
    const memberLocal = "agent-pipeline/session-authority/members/onboarding-continuity/fixture-in-flight.json";
    mkdirSync(join(repository.commonDir, "agent-pipeline/session-authority/members/onboarding-continuity"), { recursive: true });
    writeFileSync(join(repository.commonDir, memberLocal), JSON.stringify({ association: { state: "bound" }, phase: "armed" }));
    writeFileSync(producerPath, JSON.stringify({ ...producer, members: [...producer.members, { memberRef: { path: `.git/${memberLocal}` } }] }));
    const held = subject();
    assert.equal(held.status, 2, held.text);
    assert.match(held.text, /State authority route unavailable \(SDC-AUTHORITY-HELD: state-operation-in-flight\)/u, held.text);
    assert.match(held.text, /Repair: node \S+session-authority-repair\.mjs inspect --root /u, held.text);
    // Released, the same member no longer holds it.
    writeFileSync(join(repository.commonDir, memberLocal), JSON.stringify({ association: { state: "bound" }, phase: "released" }));
    assert.doesNotMatch(subject().text, /State authority route unavailable/u);
    writeFileSync(producerPath, producerBytes); rmSync(join(repository.commonDir, memberLocal));
    writeFileSync(producerPath, "{");
    const refused = subject();
    assert.equal(refused.status, 2);
    assert.match(refused.text, /State authority route unavailable \(SDC-AUTHORITY-UNAVAILABLE: state-producer-unreadable\)/u, refused.text);
    assert.match(refused.text, /Repair: node \S+session-authority-repair\.mjs inspect --root /u, refused.text);
    // Critic F6 (C12): both State producers are fixed participants, so with the catalogue present a missing
    // producer record is a broken registry, never an idle producer.
    rmSync(producerPath);
    const missing = subject();
    assert.equal(missing.status, 2, missing.text);
    assert.match(missing.text, /State authority route unavailable \(SDC-AUTHORITY-UNAVAILABLE: state-producer-unreadable\)/u, missing.text);
    assert.match(missing.text, /Repair: node \S+session-authority-repair\.mjs inspect --root /u, missing.text);
  }) },
  { id: "SAR07", name: "a session's unbound, dead-anchored or directory-less scratch binding is named with heal, and heal binds or re-anchors it; outside a session nothing changes (D54)", run: () => fixture(({ root }) => {
    course(root);
    mkdirSync(join(root, "scratch"), { recursive: true });
    const sessionId = "aaaaaaaa-1111-2222-3333-444444444444";
    const env = { CLAUDE_CODE_SESSION_ID: sessionId };
    const owner = (pid, alive) => ({ pidFn: () => pid, processIdentityFn: () => null, isProcessAliveFn: () => alive });
    const run = (options, ...argv) => {
      let text = "";
      const code = runSessionAuthorityRepair(argv, (chunk) => { text += chunk; }, options);
      return { code, result: JSON.parse(text) };
    };
    const healNamed = (result) => result.next.some((row) => / heal --root /u.test(row.command) && /scratch binding/u.test(row.why));
    const descriptorPath = join(root, ".git/agent-pipeline/scratch-descriptors", `${sessionId}.json`);

    const outside = run({}, "inspect", "--root", root).result;
    assert.equal(outside.scratchBinding.status, "no-session-identity");
    assert.equal(healNamed(outside), false, JSON.stringify(outside.next));
    assert.equal(run({}, "heal", "--root", root).result.scratchBound, "no-session-identity");
    assert.equal(existsSync(descriptorPath), false, "a heal without a session id bound something");

    const unbound = run({ env, scratchDeps: owner(4242, true) }, "inspect", "--root", root).result;
    assert.equal(unbound.scratchBinding.status, "unbound");
    assert.ok(healNamed(unbound), JSON.stringify(unbound.next));
    const bound = run({ env, scratchDeps: owner(4242, true) }, "heal", "--root", root);
    assert.equal(bound.code, 0, JSON.stringify(bound.result));
    assert.equal(bound.result.scratchBound, "bound");
    assert.equal(bound.result.scratchBinding.status, "bound");
    const directory = join(root, bound.result.scratchBinding.scratchRelativePath);
    assert.ok(existsSync(directory));

    const dead = run({ env, scratchDeps: owner(4343, false) }, "inspect", "--root", root).result;
    assert.equal(dead.scratchBinding.status, "dead-anchor");
    assert.ok(healNamed(dead), JSON.stringify(dead.next));
    writeFileSync(join(directory, "kept.txt"), "kept\n");
    const reanchored = run({ env, scratchDeps: owner(4343, false) }, "heal", "--root", root).result;
    assert.equal(reanchored.scratchBound, "reanchored");
    assert.equal(JSON.parse(readFileSync(descriptorPath, "utf8")).pid, 4343);
    assert.equal(readFileSync(join(directory, "kept.txt"), "utf8"), "kept\n", "re-anchoring lost the session's scratch files");

    rmSync(directory, { recursive: true, force: true });
    const missing = run({ env, scratchDeps: owner(4343, true) }, "inspect", "--root", root).result;
    assert.equal(missing.scratchBinding.status, "directory-missing");
    const rebound = run({ env, scratchDeps: owner(4343, true) }, "heal", "--root", root).result;
    assert.equal(rebound.scratchBound, "bound");
    assert.ok(existsSync(join(root, rebound.scratchBinding.scratchRelativePath)));
  }) },
  { id: "SAR08", name: "an orphaned registry lock never blocks for good: a gone owner is retired on the next dispatch, an unjudgeable one is named and released with release-lock, a live one is named with wait (FB3-PF-55, FB3-PF-56)", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const { repository, dispatch } = course(root);
    assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
    const lockPath = join(repository.commonDir, "agent-pipeline/session-authority/registry.lock");
    const abandoned = join(repository.commonDir, "agent-pipeline/session-authority-abandoned");
    const asides = () => existsSync(abandoned) ? readdirSync(abandoned).filter((name) => name.endsWith("-registry-lock")) : [];
    const sha = (text) => createHash("sha256").update(text).digest("hex");
    const writeLock = (value) => writeFileSync(lockPath, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    const own = observeLinuxProcess(process.pid);
    const owner = (pid, process) => ({ pid, hostSha256: sha(hostname()), process, acquiredAt: new Date(Date.now() - 3600000).toISOString() });

    // A lock left by a version that recorded no owner: it cannot be judged, so it is named, never taken over.
    writeLock({ schema: "pipeline.session-authority-lock.v1", repositorySha256: "a".repeat(64), nonce: "b".repeat(64) });
    const legacy = repair("inspect", "--root", root).result;
    assert.equal(legacy.lock.status, "held"); assert.equal(legacy.lock.owner, "unknown");
    assert.match(legacy.next[0].command, / release-lock --root .* --no-pipeline-running --reason/u, JSON.stringify(legacy.next));
    assert.equal(legacy.next.some((row) => / move-aside /u.test(row.command)), false, "a held lock must not be answered with a repair that needs the lock");
    const healRefused = repair("heal", "--root", root);
    assert.equal(healRefused.code, 2); assert.equal(healRefused.result.code, "SAR-LOCK-HELD"); assert.match(healRefused.result.repair, / release-lock --root /u);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, false, "a dispatch is refused while the lock is held");
    assert.equal(repair("release-lock", "--root", root, "--reason", "x").result.code, "SAR-ARGS");
    const released = repair("release-lock", "--root", root, "--no-pipeline-running", "--reason", "no Pipeline process runs");
    assert.equal(released.code, 0, JSON.stringify(released.result)); assert.equal(released.result.status, "released");
    assert.equal(existsSync(lockPath), false); assert.equal(asides().length, 1);
    assert.match(readFileSync(join(abandoned, asides()[0], "retire.json"), "utf8"), /released by repair: no Pipeline process runs/u);
    assert.equal(existsSync(join(abandoned, asides()[0], "registry.lock")), true, "the released lock is retained, not deleted");

    // A lock whose recorded owner process is gone is retired by the next dispatch itself.
    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    writeLock({ schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "c".repeat(64), owner: owner(gone, { start: "1", bootSha256: own.bootSha256 }) });
    assert.equal(repair("inspect", "--root", root).result.lock.owner, "dead");
    const next = dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one");
    assert.equal(next.ok, true, JSON.stringify(next));
    assert.equal(asides().length, 2); assert.equal(existsSync(lockPath), false);

    // A live owner is named with wait, and release-lock refuses it.
    writeLock({ schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "d".repeat(64), owner: owner(process.pid, { start: own.start, bootSha256: own.bootSha256 }) });
    const live = repair("inspect", "--root", root).result;
    assert.equal(live.lock.owner, "live"); assert.match(live.next[0].command, / wait --root .* --timeout 120/u);
    const refused = repair("release-lock", "--root", root, "--no-pipeline-running", "--reason", "x");
    assert.equal(refused.code, 2); assert.equal(refused.result.code, "SAR-LOCK-HELD"); assert.match(refused.result.repair, / wait --root /u);
    let clock = 0;
    const waitRun = (...argv) => { let text = ""; const code = runSessionAuthorityRepair(argv, (chunk) => { text += chunk; }, { waitDeps: { now: () => clock, pause: (ms) => { clock += ms; } } }); return { code, result: JSON.parse(text) }; };
    const timedOut = waitRun("wait", "--root", root, "--timeout", "2");
    assert.equal(timedOut.code, 2); assert.equal(timedOut.result.code, "SAR-WAIT-TIMEOUT"); assert.equal(timedOut.result.lock.pid, process.pid);
    assert.equal(waitRun("wait", "--root", root, "--timeout", "0").result.code, "SAR-ARGS");
    rmSync(lockPath);
    assert.equal(waitRun("wait", "--root", root, "--timeout", "2").result.status, "lock-free");
  }) },
  { id: "SAR09", name: "an item operation another session owns is refused naming that session, the started cancel and inspect (D52 (2), Critic F1)", run: () => fixture(({ root }) => {
    const { dispatch } = course(root);
    const prepared = dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one");
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    // Outside the dispatching session's scope, as a later session or the PO's terminal is.
    const refused = checkpointNativeGoldfishItemDelivery({ root, pendingSha256: prepared.sha256,
      checkpoint: { schema: "pipeline.item-owned-checkpoint.v1", declaredPhase: "analysis", contextPaths: [], remainingClauses: [], summary: "fixture" } });
    assert.equal(refused.status, "refused", JSON.stringify(refused));
    assert.equal(refused.reason, "native-item-checkpoint-owner");
    assert.match(refused.repair, /belongs to session \S+, not to this process, which has no bound session/u, refused.repair);
    assert.match(refused.repair, /slice-queue\.mjs cancel ITEM-AC-1 --started --reason /u);
    assert.match(refused.repair, /session-authority-repair\.mjs inspect --root /u);
  }) },
  { id: "SAR10", name: "take-over frees every unsettled slice another session started, on the caller's word, and retains the decision (Q13 (a), D57)", run: () => fixture(({ root }) => {
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    const named = repair("inspect", "--root", root).result.next.find((row) => / take-over --root /u.test(row.command));
    assert.match(named?.command ?? "", / take-over --root \S+ --from native-session-one --no-other-session-running --reason /u, JSON.stringify(named));
    // D75: the named take-over carries the class argument and teaches every class.
    assert.match(named.command, /--reason "<why>" --class <budget\|wrong-premise\|review-defect\|integrated-elsewhere\|superseded>$/u, named.command);
    for (const name of CANCEL_CLASSES) assert.ok(named.why.includes(`${name} = ${CANCEL_CLASS_HELP[name]}`), `${name} is taught: ${named.why}`);
    // Without a valid class the take-over is refused before it cancels anything, naming every class.
    for (const extra of [[], ["--class", "bogus"], ["--class", "unclassified"]]) {
      const noClass = repair("take-over", "--root", root, "--from", "native-session-one", "--no-other-session-running", "--reason", "the old session ended", ...extra);
      assert.equal(noClass.result.code, "SAR-ARGS", JSON.stringify(extra));
      for (const name of CANCEL_CLASSES) assert.ok(noClass.result.reason.includes(name) && noClass.result.reason.includes(CANCEL_CLASS_HELP[name]), `${name} is taught in the refusal: ${noClass.result.reason}`);
    }
    assert.deepEqual(repair("inspect", "--root", root).result.reservations.filter((row) => row.settled === null).map((row) => row.sliceId), ["ITEM-AC-1"], "a refused take-over cancels nothing");
    for (const argv of [["take-over", "--root", root, "--from", "native-session-one", "--reason", "x"], ["take-over", "--root", root, "--no-other-session-running", "--reason", "x"],
      ["take-over", "--root", root, "--from", "../x", "--no-other-session-running", "--reason", "x"]]) assert.equal(repair(...argv).result.code, "SAR-ARGS", JSON.stringify(argv));
    assert.equal(repair("take-over", "--root", root, "--from", "another-session", "--no-other-session-running", "--reason", "x", "--class", "superseded").result.status, "nothing-to-take-over");
    const taken = repair("take-over", "--root", root, "--from", "native-session-one", "--no-other-session-running", "--reason", "the old session ended", "--class", "budget");
    assert.equal(taken.code, 0, JSON.stringify(taken.result)); assert.equal(taken.result.status, "taken-over");
    assert.deepEqual(taken.result.cancelled.map((row) => row.sliceId), ["ITEM-AC-1"]);
    assert.deepEqual(taken.result.cancelled.map((row) => row.cancelClass), ["budget"], "the class reaches the cancelled row's result");
    assert.equal(governedRow(root, "ITEM-AC-1").cancelClass, "budget", "and into the governed queue row");
    const record = taken.result.retained.find((name) => name.endsWith("-take-over"));
    const kept = JSON.parse(readFileSync(join(repository.commonDir, "agent-pipeline/session-authority-abandoned", record, "take-over.json"), "utf8"));
    assert.equal(kept.from, "native-session-one"); assert.equal(kept.reason, "the old session ended"); assert.equal(kept.cancelClass, "budget", "the retained decision names the class");
    assert.equal(taken.result.next.some((row) => / take-over /u.test(row.command)), false, "nothing of that session is left to free");
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1B", "native-tool-two").ok, false, "the cancelled slice is not re-dispatched under its old row");
  }) },
  { id: "SAR11", name: "the queue CLI's cancel on a governed item queue needs --class, refuses before any write and stores the class on the row (D75 S5)", run: () => fixture(({ root }) => {
    const { original, runtime } = course(root);
    const itemDelivery = { schema: "pipeline.item-delivery-briefing.v1", sliceId: "ITEM-AC-0", itemId: "AC-1", criterionLocator: original.criterionLocator, checks: [{ id: "criterion-one", path: "src/change.test.mjs", dependencies: ["src/change.mjs", "src/change.test.mjs"] }] };
    assert.equal(runtime.run(() => prepareGovernedItemQueue({ root, itemDelivery, candidate: original.candidate, writeScope: ["src/change.mjs"] })).status, "required");
    const before = readFileSync(resolve(root, resolveGovernedItemQueue({ root }).path));
    const cwd = process.cwd();
    process.chdir(root);
    try {
      leaveClaudeHookSessionOwner();
      assert.equal(enterSessionOwnerFromEnvironment({ CLAUDE_CODE_SESSION_ID: "abcdef12-0000-4000-8000-000000000002" }, root), true);
      for (const extra of [[], ["--class", "bogus"]]) {
        const refused = runCli(["cancel", "ITEM-AC-0", "--reason", "not needed", ...extra]);
        assert.equal(refused.exit, 2, JSON.stringify(refused.output)); assert.equal(refused.output.code, "SQ-CANCEL-CLASS");
        for (const name of CANCEL_CLASSES) assert.ok(refused.output.repair.includes(name) && refused.output.repair.includes(CANCEL_CLASS_HELP[name]), `${name} is taught: ${refused.output.repair}`);
      }
      assert.ok(readFileSync(resolve(root, resolveGovernedItemQueue({ root }).path)).equals(before), "a refused cancel writes nothing");
      const cancelled = runCli(["cancel", "ITEM-AC-0", "--reason", "not needed", "--class", "superseded"]);
      assert.equal(cancelled.exit, 0, JSON.stringify(cancelled.output));
      assert.equal(cancelled.output.cancelClass, "superseded");
    } finally { leaveClaudeHookSessionOwner(); process.chdir(cwd); }
    assert.equal(governedRow(root, "ITEM-AC-0").cancelClass, "superseded");
    assert.equal(governedRow(root, "ITEM-AC-0").state, "cancelled");
  }) },
  // W2-R2 (AC-127; C2-P1-WIN-FSYNC, C2-P1-WIN-ORPHAN): the Windows branches of the registry lock, driven on any host through the
  // module's injected seams (judge options, io, owner observer). Native Windows qualification stays pending.
  { id: "SAR12", name: "release-lock reports the real postcondition: removed with directory durability unsupported (an EPERM fsync after removal), removed and synced, or retained, each with a typed next action (AC-127, C2-P1-WIN-FSYNC)", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const repository = inspectSignedDescriptorCustodyRepository(root);
    mkdirSync(join(repository.commonDir, "agent-pipeline/session-authority"), { recursive: true, mode: 0o700 });
    const lockPath = join(repository.commonDir, "agent-pipeline/session-authority/registry.lock");
    const sha = (text) => createHash("sha256").update(text).digest("hex");
    const writeLock = () => writeFileSync(lockPath, JSON.stringify({ schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "e".repeat(64),
      owner: { pid: 9036, hostSha256: sha(hostname()), process: null, acquiredAt: new Date(Date.now() - 3600000).toISOString() } }), { mode: 0o600, flag: "wx" });
    const eperm = () => { const error = new Error("EPERM: operation not permitted, fsync"); error.code = "EPERM"; throw error; };

    writeLock();
    const unsupported = releaseSessionAuthorityLock({ repository, reason: "orphan", io: { syncDirectory: eperm } });
    assert.equal(unsupported.status, "released", JSON.stringify(unsupported));
    assert.equal(existsSync(lockPath), false, "the lock is gone, so the release must not report a failure");
    assert.deepEqual(unsupported.postcondition, { lock: "removed", durability: "unsupported", syncErrorCode: "EPERM" });
    assert.equal(unsupported.nextAction.kind, "none");
    assert.equal(existsSync(join(repository.commonDir, "agent-pipeline/session-authority-abandoned", unsupported.aside.split("/").pop(), "registry.lock")), true, "retained aside, never deleted");

    writeLock();
    const synced = releaseSessionAuthorityLock({ repository, reason: "orphan" });
    assert.equal(synced.status, "released"); assert.deepEqual(synced.postcondition, { lock: "removed", durability: "synced" }); assert.equal(synced.nextAction.kind, "none");

    writeLock();
    const retained = releaseSessionAuthorityLock({ repository, reason: "orphan", io: { rename: () => { const error = new Error("EPERM: operation not permitted, rename"); error.code = "EPERM"; throw error; } } });
    assert.equal(retained.status, "retained", JSON.stringify(retained));
    assert.equal(existsSync(lockPath), true, "the lock is still there, so no removal and no rollback is claimed");
    assert.deepEqual(retained.postcondition, { lock: "retained", durability: "not-attempted", errorCode: "EPERM" });
    assert.equal(retained.nextAction.kind, "inspect"); assert.match(retained.nextAction.command, / inspect --root /u);
  }) },
  { id: "SAR13", name: "a Windows lock owner is judged by pid plus process start: gone is dead, the same start is live, a reused pid is dead, and an unknown, unavailable or foreign-host owner is never reclaimable (AC-127, C2-P1-WIN-ORPHAN)", run: () => fixture(({ root }) => {
    const host = createHash("sha256").update(hostname()).digest("hex");
    const win = (observeWindows) => (value) => judgeSessionAuthorityLockOwner(value, { platform: "win32", host, observeWindows });
    const lock = (owner) => ({ schema: "pipeline.session-authority-lock.v2", owner });
    const stamped = { pid: 9036, hostSha256: host, process: { start: "win32-133000000000000000" }, acquiredAt: "2026-10-25T10:00:00.000Z" };
    const absent = win(() => ({ status: "absent", pid: 9036 }));
    assert.equal(absent(lock(stamped)), "dead", "the recorded pid is gone");
    assert.equal(absent(lock({ ...stamped, process: null })), "dead", "a pid that no longer exists cannot be the owner, recorded start or not");
    assert.equal(win(() => ({ status: "present", pid: 9036, processStart: "win32-133000000000000000" }))(lock(stamped)), "live");
    assert.equal(win(() => ({ status: "present", pid: 9036, processStart: "win32-133000000000000001" }))(lock(stamped)), "dead", "pid reused by a later process");
    assert.equal(win(() => ({ status: "present", pid: 9036, processStart: "win32-133000000000000000" }))(lock({ ...stamped, process: null })), "unknown", "a present pid with no recorded start is not provably the owner");
    assert.equal(win(() => ({ status: "present", pid: 9036, processStart: "win32-133000000000000001" }))(lock({ ...stamped, process: { start: "12345", bootSha256: "b".repeat(64) } })), "unknown", "a start of another platform's shape is not comparable");
    assert.equal(win(() => ({ status: "unavailable", reason: "native-query-failed" }))(lock(stamped)), "unknown");
    assert.equal(win(() => { throw new Error("boom"); })(lock(stamped)), "unknown");
    let called = false;
    assert.equal(judgeSessionAuthorityLockOwner(lock({ ...stamped, hostSha256: "f".repeat(64) }), { platform: "win32", host, observeWindows: () => { called = true; return { status: "absent" }; } }), "unknown", "a foreign host is never judged");
    assert.equal(called, false);
    assert.equal(absent({ schema: "pipeline.session-authority-lock.v1" }), "unknown", "an owner-less lock stays unjudgeable");
    assert.equal(absent(lock({ ...stamped, pid: 0 })), "unknown");

    // The owner a Windows process writes names its start, so the next reader can tell a reused pid.
    assert.equal(sessionAuthorityLockOwner({ platform: "win32", observeWindows: () => ({ status: "present", processStart: "win32-777" }) }).process.start, "win32-777");
    assert.equal(sessionAuthorityLockOwner({ platform: "win32", observeWindows: () => ({ status: "unavailable", reason: "x" }) }).process, null);

    if (process.platform !== "linux") return;
    const repository = inspectSignedDescriptorCustodyRepository(root);
    mkdirSync(join(repository.commonDir, "agent-pipeline/session-authority"), { recursive: true, mode: 0o700 });
    const lockPath = join(repository.commonDir, "agent-pipeline/session-authority/registry.lock");
    writeFileSync(lockPath, JSON.stringify(lock(stamped)), { mode: 0o600, flag: "wx" });
    const seen = inspectSessionAuthorityLock({ repository, judge: absent });
    assert.equal(seen.owner, "dead"); assert.equal(seen.pid, 9036);
    assert.equal(inspectSessionAuthorityLock({ repository, judge: win(() => ({ status: "unavailable", reason: "x" })) }).owner, "unknown");
    const released = releaseSessionAuthorityLock({ repository, reason: "orphan", judge: absent });
    assert.equal(released.status, "released"); assert.equal(released.owner, "dead"); assert.equal(existsSync(lockPath), false);
  }) },
  { id: "SAR14", name: "a session-cleanup manifest lock left by a gone writer is named by the dispatch refusal and by inspect, heal retires it aside and the next dispatch runs; a live or foreign lock is kept (P0 2026-10-26)", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    assert.equal(cancelUnstartedGovernedItemSlice({ root, sliceId: "ITEM-AC-1", reason: "its Goldfish stopped", started: true, cancelClass: "budget" }).status, "cancelled");
    const active = join(repository.commonDir, "agent-pipeline/session-cleanup/active");
    const sessions = readdirSync(join(repository.commonDir, "agent-pipeline/session-descriptors/active")).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));
    assert.ok(sessions.length > 0, "the course binds at least one session descriptor");
    const sha = (text) => createHash("sha256").update(text).digest("hex");
    const plant = (sessionId, pid, processStartId, nonceSha256) => { mkdirSync(active, { recursive: true, mode: 0o700 });
      writeFileSync(join(active, `${sessionId}.json.lock`), JSON.stringify({ schema: "pipeline.session-cleanup-lock.v1", sessionId, ownerNonceSha256: nonceSha256, pid, processStartId }), { mode: 0o600, flag: "wx" }); };
    const nonce = (sessionId) => sha(loadSessionDescriptor(root, sessionId).ownerNonce);
    // A hook process killed inside custody leaves the lock of its own session behind; its writer is gone.
    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    for (const sessionId of sessions) plant(sessionId, gone, "1", nonce(sessionId));
    const refused = dispatch("ITEM-AC-2", "DELIVER-AC-2", "native-tool-two");
    assert.equal(refused.ok, false); assert.equal(refused.code, "SDC-LOCK-HELD");
    assert.match(String(refused.reason), /manifest lock/u, "the refusal names its cause instead of no reason");
    const found = repair("inspect", "--root", root).result;
    assert.ok(found.cleanupLocks.some((row) => row.owner === "dead" && sessions.includes(row.sessionId)), JSON.stringify(found.cleanupLocks));
    assert.ok(found.next.some((row) => / heal --root /u.test(row.command) && /session-cleanup lock/u.test(row.why)), JSON.stringify(found.next));
    const healed = repair("heal", "--root", root);
    assert.equal(healed.code, 0, JSON.stringify(healed.result));
    assert.equal(healed.result.retiredCleanupLocks.length, sessions.length, JSON.stringify(healed.result));
    assert.deepEqual(readdirSync(active).filter((name) => name.endsWith(".lock")), [], "every dead lock is gone from active");
    const kept = healed.result.retained.find((name) => name.endsWith("-session-cleanup-lock"));
    assert.ok(kept, JSON.stringify(healed.result.retained));
    assert.equal(readdirSync(join(repository.commonDir, "agent-pipeline/session-authority-abandoned", kept)).filter((name) => name.endsWith(".json.lock")).length, sessions.length, "retired locks are retained aside, not deleted");
    const resumed = dispatch("ITEM-AC-2", "DELIVER-AC-2", "native-tool-three");
    assert.equal(resumed.ok, true, `the next dispatch runs: ${JSON.stringify(resumed)}`);
    // A live writer and a lock whose nonce does not match the session's descriptor are never retired.
    const own = observeLinuxProcess(process.pid);
    plant(sessions[0], process.pid, own.start, nonce(sessions[0]));
    const foreign = "foreign-session-lock";
    plant(foreign, gone, "1", "f".repeat(64));
    const live = repair("inspect", "--root", root).result;
    assert.equal(live.cleanupLocks.find((row) => row.sessionId === sessions[0]).owner, "live");
    assert.equal(live.cleanupLocks.find((row) => row.sessionId === foreign).owner, "untrusted");
    const again = repair("heal", "--root", root);
    assert.deepEqual(again.result.retiredCleanupLocks ?? [], []);
    assert.equal(existsSync(join(active, `${sessions[0]}.json.lock`)), true); assert.equal(existsSync(join(active, `${foreign}.json.lock`)), true);
  }) },
  { id: "SAR15", name: "D165-S5 (W2) release-lock exits non-zero (2) when the lock was retained rather than released, with the JSON unchanged, and 0 when it was released (AC-127)", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const repository = inspectSignedDescriptorCustodyRepository(root);
    mkdirSync(join(repository.commonDir, "agent-pipeline/session-authority"), { recursive: true, mode: 0o700 });
    const lockPath = join(repository.commonDir, "agent-pipeline/session-authority/registry.lock");
    const sha = (text) => createHash("sha256").update(text).digest("hex");
    const writeLock = () => writeFileSync(lockPath, JSON.stringify({ schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "e".repeat(64),
      owner: { pid: 9036, hostSha256: sha(hostname()), process: null, acquiredAt: new Date(Date.now() - 3600000).toISOString() } }), { mode: 0o600, flag: "wx" });
    const argv = ["release-lock", "--root", root, "--no-pipeline-running", "--reason", "orphan"];
    const run = (releaseDeps) => { let text = ""; const code = runSessionAuthorityRepair(argv, (chunk) => { text += chunk; }, { releaseDeps }); return { code, result: JSON.parse(text) }; };
    writeLock();
    const retained = run({ io: { rename: () => { const error = new Error("EPERM: operation not permitted, rename"); error.code = "EPERM"; throw error; } } });
    assert.equal(retained.result.status, "retained", JSON.stringify(retained.result));
    assert.equal(existsSync(lockPath), true, "the lock is still there");
    assert.deepEqual(retained.result.postcondition, { lock: "retained", durability: "not-attempted", errorCode: "EPERM" });
    assert.equal(retained.code, 2, "a retained lock is not a success");
    rmSync(lockPath, { force: true });
    writeLock();
    const released = run({});
    assert.equal(released.result.status, "released", JSON.stringify(released.result));
    assert.equal(released.code, 0);
  }) },
  { id: "SAR16", name: "D180b a stop-failure diagnostic written AFTER registry init, into the diagnostics directory outside the native Goldfish namespace, leaves the registry readable and the native-goldfish producer ok", run: () => fixture(({ root }) => {
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    // The dispatch above already initialised the registry; initialising again is idempotent and the baseline is taken here.
    assert.ok(["initialized", "already-initialized"].includes(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status));
    const diagnostics =join(repository.commonDir, "agent-pipeline/run/native-goldfish-host-diagnostics");
    mkdirSync(diagnostics, { recursive: true, mode: 0o700 });
    writeFileSync(join(diagnostics, `stop-failure-${"a".repeat(32)}.json`), `${JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "DELIVER-AC-1", toolUseId: "native-tool-one", status: "refused", code: "NGHF-HANDBACK-INVALID", commit: null, observedAt: "2026-10-27T00:00:00.000Z" })}\n`, { mode: 0o600 });
    const found = repair("inspect", "--root", root).result;
    assert.notEqual(found.registry.status, "refused", JSON.stringify(found.registry));
    const goldfish = found.registry.producers.find((row) => row.producerId === "native-goldfish");
    assert.ok(goldfish, JSON.stringify(found.registry));
    assert.equal(goldfish.status, "ok", JSON.stringify(goldfish));
  }) },
  { id: "SAR17", name: "D181b heal retires a legacy finalizer stop-failure record from the old native-goldfish-host-commit directory aside, reports it in retiredStopFailures, leaves the registry readable and has nothing to retire the second time", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    const legacy = join(repository.commonDir, "agent-pipeline/run/native-goldfish-host-commit");
    const name = `stop-failure-${"b".repeat(32)}.json`;
    writeFileSync(join(legacy, name), `${JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "GONE-DISPATCH", toolUseId: "native-tool-gone", status: "refused", code: "NGHF-HANDBACK-INVALID", commit: null, observedAt: "2026-10-27T00:00:00.000Z" })}\n`, { mode: 0o600 });
    const healed = repair("heal", "--root", root);
    assert.equal(healed.code, 0, JSON.stringify(healed.result));
    assert.deepEqual(healed.result.retiredStopFailures, [{ name, dispatchId: "GONE-DISPATCH", code: "NGHF-HANDBACK-INVALID", observedAt: "2026-10-27T00:00:00.000Z" }], JSON.stringify(healed.result));
    assert.equal(existsSync(join(legacy, name)), false, "the record left the old directory");
    const kept = healed.result.retained.find((row) => row.endsWith("-stop-failure"));
    assert.ok(kept, JSON.stringify(healed.result.retained));
    assert.deepEqual(readdirSync(join(repository.commonDir, "agent-pipeline/session-authority-abandoned", kept)), [name], "moved aside, not deleted");
    const found = repair("inspect", "--root", root).result;
    assert.notEqual(found.registry.status, "refused", JSON.stringify(found.registry));
    const again = repair("heal", "--root", root);
    assert.deepEqual(again.result.retiredStopFailures ?? [], []);
  }) },
  { id: "SAR18", name: "D181b heal keeps a legacy stop-failure record whose dispatch still has an unsettled pending state and lists it under keptStopFailures with the reason", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    const legacy = join(repository.commonDir, "agent-pipeline/run/native-goldfish-host-commit");
    const name = `stop-failure-${"c".repeat(32)}.json`;
    writeFileSync(join(legacy, name), `${JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "DELIVER-AC-1", toolUseId: "native-tool-one", status: "refused", code: "NGHF-HANDBACK-INVALID", commit: null, observedAt: "2026-10-27T00:00:00.000Z" })}\n`, { mode: 0o600 });
    const healed = repair("heal", "--root", root);
    assert.deepEqual(healed.result.retiredStopFailures ?? [], [], JSON.stringify(healed.result));
    assert.equal(existsSync(join(legacy, name)), true, "an in-flight dispatch's record stays");
    const row = (healed.result.keptStopFailures ?? []).find((entry) => entry.name === name);
    assert.ok(row && typeof row.reason === "string" && row.reason !== "", JSON.stringify(healed.result.keptStopFailures));
  }) },
  { id: "SAR19", name: "D181b heal never moves a stop-failure-named file with another schema, array JSON or a symlink and lists each as kept", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    const legacy = join(repository.commonDir, "agent-pipeline/run/native-goldfish-host-commit");
    const other = `stop-failure-${"d".repeat(32)}.json`, array = `stop-failure-${"e".repeat(32)}.json`, link = `stop-failure-${"f".repeat(32)}.json`;
    writeFileSync(join(legacy, other), `${JSON.stringify({ schema: "pipeline.something-else.v1", dispatchId: "GONE-DISPATCH" })}\n`, { mode: 0o600 });
    writeFileSync(join(legacy, array), "[]\n", { mode: 0o600 });
    symlinkSync(join(legacy, other), join(legacy, link));
    const healed = repair("heal", "--root", root);
    assert.deepEqual(healed.result.retiredStopFailures ?? [], [], JSON.stringify(healed.result));
    for (const entry of [other, array, link]) {
      assert.equal(existsSync(join(legacy, entry)) || lstatSync(join(legacy, entry), { throwIfNoEntry: false }) !== undefined, true, `${entry} stays`);
      assert.ok((healed.result.keptStopFailures ?? []).some((row) => row.name === entry && row.reason), `${entry} listed: ${JSON.stringify(healed.result.keptStopFailures)}`);
    }
  }) },
  { id: "SAR20", name: "D181b heal never touches a record in the new native-goldfish-host-diagnostics directory", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    const diagnostics = join(repository.commonDir, "agent-pipeline/run/native-goldfish-host-diagnostics");
    mkdirSync(diagnostics, { recursive: true, mode: 0o700 });
    const file = join(diagnostics, `stop-failure-${"a".repeat(32)}.json`);
    writeFileSync(file, `${JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "GONE-DISPATCH", toolUseId: "t", status: "refused", code: "X", commit: null, observedAt: "2026-10-27T00:00:00.000Z" })}\n`, { mode: 0o600 });
    const healed = repair("heal", "--root", root);
    assert.deepEqual(healed.result.retiredStopFailures ?? [], [], JSON.stringify(healed.result));
    assert.equal(existsSync(file), true);
  }) },
  { id: "SAR21", name: "D181b the inspect next text for move-aside says it does not clear a finalizer stop-failure record", run: () => fixture(({ root }) => {
    if (process.platform !== "linux") return;
    const { repository, dispatch } = course(root);
    assert.equal(dispatch("ITEM-AC-1", "DELIVER-AC-1", "native-tool-one").ok, true);
    const legacy = join(repository.commonDir, "agent-pipeline/run/native-goldfish-host-commit");
    writeFileSync(join(legacy, `stop-failure-${"b".repeat(32)}.json`), `${JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "GONE-DISPATCH", toolUseId: "t", status: "refused", code: "X", commit: null, observedAt: "2026-10-27T00:00:00.000Z" })}\n`, { mode: 0o600 });
    const found = repair("inspect", "--root", root).result;
    const aside = found.next.find((row) => / move-aside --root /u.test(row.command));
    assert.ok(aside, JSON.stringify(found.next));
    assert.match(aside.why, /does not clear a finalizer stop-failure record/u, aside.why);
  }) },
  // ---- SAD diag: the state authority refusal names an untyped cause after the code parenthesis, its elapsed time, and an opt-in trace ----
  { id: "SAS01", name: "SAD diag (1) a typed refusal keeps its text and ends with the elapsed time", run: () => {
    const typed = describeStateAuthorityRefusal({ code: "SDC-AUTHORITY-HELD", reason: "state-operation-in-flight" }, { elapsedMs: 12 });
    assert.ok(typed.includes("State authority route unavailable (SDC-AUTHORITY-HELD: state-operation-in-flight); no success is reported."), typed);
    assert.ok(typed.endsWith(" Elapsed: 12 ms."), typed);
  } },
  { id: "SAS02", name: "SAD diag (2) an error without code and reason keeps the default code alone in the parenthesis and names its class, message and at most two bare frames after it", run: () => {
    const untyped = describeStateAuthorityRefusal(new TypeError("boom"), { elapsedMs: 5 });
    assert.ok(untyped.includes("(SDC-AUTHORITY-UNAVAILABLE); cause: untyped TypeError: boom; at "), untyped);
    const afterAt = untyped.split("; at ")[1] ?? "";
    const framesPart = afterAt.slice(0, afterAt.indexOf("; no success"));
    const frameCount = framesPart.length === 0 ? 0 : framesPart.split(", ").length;
    assert.ok(frameCount >= 1 && frameCount <= 2, untyped);
    assert.doesNotMatch(framesPart, /[\\/]/u, framesPart);
  } },
  { id: "SAS03", name: "SAD diag (3) an error with a code but no reason keeps the code alone in the parenthesis, a long message is cut to 240 and a multi-line one is one line", run: () => {
    const coded = describeStateAuthorityRefusal(Object.assign(new Error("a\nb\r\nc"), { code: "WT-PATH-TYPE" }), { elapsedMs: 1 });
    assert.ok(coded.includes("(WT-PATH-TYPE); cause: untyped Error: a b c;"), coded);
    const longText = describeStateAuthorityRefusal(new Error("x".repeat(1000)), { elapsedMs: 1 });
    assert.equal((/x+/u.exec(longText)?.[0] ?? "").length, 240);
  } },
  { id: "SAS04", name: "SAD diag (4) a non-Error throw prints its type as the cause", run: () => {
    const stringThrow = describeStateAuthorityRefusal("plain text", { elapsedMs: 3 });
    assert.ok(stringThrow.includes("(SDC-AUTHORITY-UNAVAILABLE); cause: untyped string;"), stringThrow);
    assert.ok(stringThrow.endsWith(" Elapsed: 3 ms."), stringThrow);
  } },
  { id: "SAS05", name: "SAD diag (5) PIPELINE_AUTHORITY_TRACE=1 prints exactly one parseable trace line on stderr for a spawned state verb", run: () => fixture(({ root }) => {
    const cli = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
    const traced = spawnSync(process.execPath, [cli, "set-feature", "--id", "trace", "--plan-path", "specs/trace/prd_trace.md"], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root, PIPELINE_AUTHORITY_TRACE: "1" } });
    const traceLines = String(traced.stderr).split("\n").filter((line) => line.startsWith("AUTHORITY-TRACE "));
    assert.equal(traceLines.length, 1, String(traced.stderr).slice(-600));
    const traceJson = JSON.parse(traceLines[0].slice("AUTHORITY-TRACE ".length));
    assert.equal(traceJson.schema, "pipeline.authority-trace.v1");
    assert.ok(traceJson.custodyInspections.count >= 1, JSON.stringify(traceJson));
    assert.equal(typeof traceJson.elapsedMs, "number");
    assert.ok(["ok", "refused"].includes(traceJson.outcome), JSON.stringify(traceJson));
  }) },
  { id: "SAS06", name: "SAD diag (6) without the variable no trace text appears", run: () => fixture(({ root }) => {
    const cli = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
    const quiet = spawnSync(process.execPath, [cli, "set-feature", "--id", "trace", "--plan-path", "specs/trace/prd_trace.md"], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root, PIPELINE_AUTHORITY_TRACE: "" } });
    assert.ok(!String(quiet.stderr).includes("AUTHORITY-TRACE") && !String(quiet.stdout).includes("AUTHORITY-TRACE"), String(quiet.stderr).slice(-300));
  }) },
  { id: "SAS07", name: "SAD diag (7) the backend spawn counters report count, ms, maxMs, failed and byOperation", run: () => {
    const before = nativeAuthorityStats();
    recordNativeAuthoritySpawn("inspect", 10, true); recordNativeAuthoritySpawn("read", 30, false);
    const after = nativeAuthorityStats();
    assert.equal(after.count - before.count, 2); assert.equal(after.ms - before.ms, 40); assert.equal(after.failed - before.failed, 1);
    assert.ok(after.maxMs >= 30, JSON.stringify(after));
    assert.equal((after.byOperation.inspect ?? 0) - (before.byOperation.inspect ?? 0), 1);
    assert.equal((after.byOperation.read ?? 0) - (before.byOperation.read ?? 0), 1);
  } },
  { id: "SAS08", name: "SAD diag (8) the line for an error coded WT-GIT-FAILED without a reason matches the PSXL05 pin", run: () => {
    const text = describeStateAuthorityRefusal(Object.assign(new Error("git failed"), { code: "WT-GIT-FAILED" }), { elapsedMs: 1 });
    assert.match(text, /State authority route unavailable \(WT-GIT-FAILED\)/u, text);
  } },
  // ---- authority memo: repeated read-only native observations of an unchanged object are answered process-locally ----
  { id: "SAS09", name: "authority memo (1) two identical inspections spawn once and count one hit", run: () => memoFixture(({ calls, file }) => {
    writeFileSync(file, "one");
    const before = nativeAuthorityStats();
    const first = inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    const second = inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    assert.equal(calls.length, 1, JSON.stringify(calls));
    assert.equal(second.nativeFacts, first.nativeFacts);
    assert.equal(nativeAuthorityStats().authorityMemoHits - before.authorityMemoHits, 1);
    assert.equal(nativeAuthorityStats().authorityMemoMisses - before.authorityMemoMisses, 1);
  }) },
  { id: "SAS10", name: "authority memo (2) a different size or a touched mtime is a miss and spawns again", run: () => memoFixture(({ calls, file }) => {
    writeFileSync(file, "one");
    inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    writeFileSync(file, "longer content");
    inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    assert.equal(calls.length, 2, JSON.stringify(calls));
    utimesSync(file, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
    inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    assert.equal(calls.length, 3, JSON.stringify(calls));
  }) },
  { id: "SAS11", name: "authority memo (3) a publish or a remove between two reads clears the memo", run: () => memoFixture(({ calls, file }) => {
    writeFileSync(file, "one");
    const read = () => readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 });
    read(); read();
    assert.deepEqual(calls, ["read"]);
    publishWindowsOwnedAuthorityFile({ path: file, bytes: Buffer.from("x"), expectedSha256: null, expectedFacts: null });
    read();
    assert.deepEqual(calls, ["read", "publish", "read"]);
    read();
    assert.equal(calls.length, 3, JSON.stringify(calls));
    removeWindowsOwnedAuthorityFile({ path: file, expectedSha256: "b".repeat(64), expectedFacts: MEMO_FACTS });
    read();
    assert.deepEqual(calls, ["read", "publish", "read", "remove", "read"]);
  }) },
  { id: "SAS12", name: "authority memo (4) a read hit returns equal bytes in a fresh Buffer that a caller cannot corrupt", run: () => memoFixture(({ calls, file }) => {
    writeFileSync(file, "one");
    const first = readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 });
    const second = readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 });
    assert.equal(calls.length, 1);
    assert.deepEqual(second.bytes, first.bytes);
    assert.notEqual(second.bytes, first.bytes);
    first.bytes[0] = 0x7a;
    const third = readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 });
    assert.equal(third.bytes.toString("utf8"), "hello");
  }) },
  { id: "SAS13", name: "authority memo (5) a refusal is never memoized", run: () => memoFixture(({ calls, file }) => {
    writeFileSync(file, "one");
    for (let attempt = 0; attempt < 2; attempt += 1) assert.throws(() => inspectWindowsOwnedAuthorityPath({ path: file, directory: false }), /WIN-AUTH-ACL/u);
    assert.equal(calls.length, 2, JSON.stringify(calls));
  }, { refuse: true }) },
  { id: "SAS14", name: "authority memo (6) another maxBytes or directory flag is another key", run: () => memoFixture(({ calls, file }) => {
    writeFileSync(file, "one");
    readWindowsOwnedAuthorityFile({ path: file, maxBytes: 10 });
    readWindowsOwnedAuthorityFile({ path: file, maxBytes: 20 });
    assert.equal(calls.length, 2, JSON.stringify(calls));
    inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    inspectWindowsOwnedAuthorityPath({ path: file, directory: true });
    assert.equal(calls.length, 4, JSON.stringify(calls));
  }) },
  { id: "SAS15", name: "authority memo (7) PIPELINE_AUTHORITY_NO_MEMO=1 disables the memo", run: () => memoFixture(({ calls, file }) => {
    writeFileSync(file, "one");
    process.env.PIPELINE_AUTHORITY_NO_MEMO = "1";
    inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    assert.equal(calls.length, 2, JSON.stringify(calls));
  }) },
  { id: "SAS16", name: "authority memo (8) an object that changes while it is observed is returned but not stored", run: () => {
    let armed = true;
    return memoFixture(({ calls, file }) => {
      writeFileSync(file, "one");
      const result = inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
      assert.equal(result.nativeFacts, MEMO_FACTS);
      assert.equal(armed, false);
      inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
      inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
      assert.equal(calls.length, 2, JSON.stringify(calls));
    }, { hook: (request) => { if (armed) { armed = false; writeFileSync(request.path, "rewritten while the native call runs"); } } });
  } },
  { id: "SAS17", name: "authority memo (9) the memo is bounded at 512 entries", run: () => memoFixture(({ dir, calls }) => {
    for (let index = 0; index < 600; index += 1) {
      const file = join(dir, `f${index}.txt`);
      writeFileSync(file, String(index));
      inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    }
    assert.equal(calls.length, 600);
    assert.ok(nativeAuthorityStats().authorityMemoSize <= 512, String(nativeAuthorityStats().authorityMemoSize));
    assert.ok(nativeAuthorityStats().authorityMemoSize > 0);
  }) },
  // ---- the one-line authority trace carries the memo counters (schema stays pipeline.authority-trace.v1) ----
  { id: "SAS18", name: "authority trace (1) the CLI trace line carries an authorityMemo object with three integer keys and keeps every existing key", run: () => fixture(({ root }) => {
    const cli = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
    const traced = spawnSync(process.execPath, [cli, "set-feature", "--id", "trace", "--plan-path", "specs/trace/prd_trace.md"], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root, PIPELINE_AUTHORITY_TRACE: "1" } });
    const traceLines = String(traced.stderr).split("\n").filter((line) => line.startsWith("AUTHORITY-TRACE "));
    assert.equal(traceLines.length, 1, String(traced.stderr).slice(-600));
    const traceJson = JSON.parse(traceLines[0].slice("AUTHORITY-TRACE ".length));
    assert.equal(traceJson.schema, "pipeline.authority-trace.v1");
    for (const key of ["elapsedMs", "custodyInspections", "nativeObservations", "outcome"]) assert.ok(key in traceJson, `${key} missing: ${JSON.stringify(traceJson)}`);
    assert.deepEqual(Object.keys(traceJson.authorityMemo ?? {}).sort(), ["hits", "misses", "size"], JSON.stringify(traceJson));
    for (const key of ["hits", "misses", "size"]) assert.ok(Number.isInteger(traceJson.authorityMemo[key]), JSON.stringify(traceJson));
    if (process.platform !== "win32") assert.deepEqual(traceJson.authorityMemo, { hits: 0, misses: 0, size: 0 }, JSON.stringify(traceJson));
  }) },
  { id: "SAS19", name: "authority trace (2) one memo hit and one miss driven through the backend seam show as hits 1 and misses 1 in the built trace", run: () => memoFixture(({ file }) => {
    assert.equal(typeof pipelineState.buildAuthorityTrace, "function");
    writeFileSync(file, "one");
    const before = pipelineState.buildAuthorityTrace(0, "ok").authorityMemo;
    inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
    const trace = pipelineState.buildAuthorityTrace(5, "ok");
    assert.equal(trace.schema, "pipeline.authority-trace.v1");
    assert.equal(trace.authorityMemo.hits - before.hits, 1, JSON.stringify(trace));
    assert.equal(trace.authorityMemo.misses - before.misses, 1, JSON.stringify(trace));
    assert.equal(trace.authorityMemo.size, 1, JSON.stringify(trace));
    assert.equal(trace.elapsedMs, 5);
  }) },
];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
