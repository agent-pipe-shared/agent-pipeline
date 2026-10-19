// SPDX-License-Identifier: SUL-1.0
// D52 (2), PF-55: the general session-authority repair. Every refusal it reports ends in a runnable command,
// and the last resort leaves no state that blocks the next dispatch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { runSessionAuthorityRepair } from "./session-authority-repair.mjs";
import { cancelUnstartedGovernedItemSlice, prepareGovernedItemQueue, prepareNativeGoldfishHostState } from "../lib/native-goldfish-host-state.mjs";
import { enterSessionOwnerFromEnvironment, runCli } from "./slice-queue.mjs";
import { run as runState } from "./pipeline-state.mjs";
import { enterClaudeHookSessionOwner, leaveClaudeHookSessionOwner, readClaudeHookSessionOwner } from "../lib/claude-hook-session-owner.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "../lib/native-goldfish-host-return.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { createSessionAuthorityParticipantPorts } from "../lib/session-authority-observers.mjs";
import { initializeSessionAuthorityRegistry } from "../lib/session-authority-registry.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../lib/worktree-lifecycle.mjs";
import { createControlledMethodRuntimeFixture } from "../lib/session-requester-bridge.mjs";
import { prepareApprovedItemCourseFixture, nativeContractFixtureParent } from "../lib/test-item-approved-course-fixture.mjs";

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
    assert.equal(cancelUnstartedGovernedItemSlice({ root, sliceId: "ITEM-AC-1", reason: "its Goldfish stopped", started: true }).status, "cancelled");
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
    writeFileSync(join(repository.commonDir, "agent-pipeline/session-authority/producers/onboarding-continuity.json"), "{");
    const refused = subject();
    assert.equal(refused.status, 2);
    assert.match(refused.text, /State authority route unavailable \(SDC-AUTHORITY-UNAVAILABLE: state-producer-unreadable\)/u, refused.text);
    assert.match(refused.text, /Repair: node \S+session-authority-repair\.mjs inspect --root /u, refused.text);
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
];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
