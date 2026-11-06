// SPDX-License-Identifier: SUL-1.0
// w237 (candidate 19i, AC-108): the SubagentStop of an item-delivery Goldfish reads its pending state and its terminal
// preparation under the lock-free registry read scope (O10) and takes the exclusive registry lock only for its writes.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { prepareApprovedItemCourseFixture, nativeContractFixtureParent } from "./test-item-approved-course-fixture.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "./native-goldfish-host-return.mjs";
import { prepareNativeGoldfishHostState, readNativeGoldfishPending, withNativeStopReadMemo, nativeStopWaitBudgetMs, NATIVE_GOLDFISH_STOP_LOCK_WAIT_MS } from "./native-goldfish-host-state.mjs";
import { finalizeNativeGoldfishHostReturn } from "./native-goldfish-host-finalizer.mjs";
import { readNativeGoldfishStopFailure } from "../hooks/native-goldfish-host.mjs";
import { commitAdmittedNativeGoldfishReturn } from "./agy-host-commit-execution.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { createControlledMethodRuntimeFixture } from "./session-requester-bridge.mjs";
import { initializeSessionAuthorityRegistry } from "./session-authority-registry.mjs";
import { createSessionAuthorityParticipantPorts } from "./session-authority-observers.mjs";

const PROGRESS = Symbol.for("pipeline.authority-trace-progress");
const criticDecision = { schema: "pipeline.critic-required-decision.v1",
  trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
    diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" };

/** Phase marks the code under test writes through admission-progress, with the time each was written. */
function recordMarks(run) {
  const marks = [];
  globalThis[PROGRESS] = (phase) => marks.push({ phase, at: Date.now() });
  try { return run(marks); } finally { delete globalThis[PROGRESS]; }
}

/** An enrolled approved-course repository with a registry, one admitted item-delivery pending state on the SubagentStop route,
 * and the child's meta file outside the repository, as the real hook sees them. */
function stopFixture(run) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "native-goldfish-stop-read-scope-"));
  const stopDir = mkdtempSync(join(parent, "native-goldfish-stop-read-scope-hook-"));
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
    const runtime = createControlledMethodRuntimeFixture({ repository, fixtureRoot: join(repository.commonDir, "agent-pipeline/controlled-method-fixtures/original-course"), sessionId: "original-course-owner" });
    initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository }));
    const itemDelivery = { schema: "pipeline.item-delivery-briefing.v1", sliceId: "ITEM-AC-1", itemId: "AC-1", criterionLocator: original.criterionLocator,
      checks: [{ id: "criterion-one", path: "src/change.test.mjs", dependencies: ["src/change.mjs", "src/change.test.mjs"] }] };
    const binding = { schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId: "DELIVER-AC-1", candidateCommit: original.candidate.commit, candidateTree: original.candidate.tree,
      runner: "claude", role: "pipeline-core:goldfish-implementor", agentType: "goldfish-implementor", model: "sonnet", effort: "medium", rulesetSha: "c".repeat(64),
      allowedPaths: ["src/change.mjs"], criticDecision, itemDelivery };
    const prompt = `Goldfish briefing\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nReturn contract follows.\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n`;
    const input = { cwd: root, session_id: "native-session-one", tool_name: "Task", tool_use_id: "native-tool-one",
      tool_input: { subagent_type: binding.role, prompt, run_in_background: true } };
    const prepared = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input, subagentStopCompletionRegistered: true }));
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    mkdirSync(join(stopDir, "session", "subagents"), { recursive: true });
    writeFileSync(join(stopDir, "session", "subagents", "agent-agent-bg.meta.json"), JSON.stringify({ spawnDepth: 1, agentType: "goldfish-implementor", toolUseId: "native-tool-one" }));
    const stopInput = () => ({ hook_event_name: "SubagentStop", session_id: "native-session-one", transcript_path: join(stopDir, "session.jsonl"), cwd: root, agent_id: "agent-bg", agent_type: binding.role,
      last_assistant_message: JSON.stringify({ schema: "pipeline.native-goldfish-host-return.v1", dispatchId: binding.dispatchId, candidateCommit: binding.candidateCommit, outcome: "succeeded",
        report: "Implemented the original dependency behavior.", changedPaths: ["src/change.mjs"] }) });
    const deliver = () => writeFileSync(join(root, "src/change.mjs"), "export const value='expected'; // delivered implementation\n");
    const head = () => spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const readPending = (extra = {}) => runtime.run(() => readNativeGoldfishPending({ commonDir: repository.commonDir, runner: "claude", sessionId: "native-session-one", correlationId: "native-tool-one", ...extra }));
    const stop = (dependencies = {}) => runtime.run(() => finalizeNativeGoldfishHostReturn({ root, runner: "claude", input: stopInput() }, dependencies));
    // The sibling hook of the same dispatch: another process holds the registry boundary for `ms`; it writes `released` just before it lets go.
    const holder = (ms) => {
      // Outside the repository: the host-commit admission compares the working tree to its baseline and must not see these.
      const marker = join(stopDir, "sibling-holds-lock"), released = join(stopDir, "sibling-released-lock");
      rmSync(marker, { force: true }); rmSync(released, { force: true });
      const script = `import {inspectSignedDescriptorCustodyRepository} from ${JSON.stringify(new URL("./worktree-lifecycle.mjs", import.meta.url).href)};`
        + `import {withSessionAuthorityBoundary} from ${JSON.stringify(new URL("./session-authority-registry.mjs", import.meta.url).href)};`
        + `import {writeFileSync} from 'node:fs';const repository=inspectSignedDescriptorCustodyRepository(${JSON.stringify(root)});`
        + `withSessionAuthorityBoundary({repository},()=>{writeFileSync(${JSON.stringify(marker)},'held');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${ms});writeFileSync(${JSON.stringify(released)},String(Date.now()));});`;
      const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: "ignore" });
      const until = Date.now() + 20000;
      while (!existsSync(marker) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      assert.ok(existsSync(marker), "the sibling took the lock");
      return { child, releasedAt: () => (existsSync(released) ? Number(readFileSync(released, "utf8")) : null) };
    };
    return run({ root, repository, original, head, deliver, readPending, stop, holder, binding });
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(stopDir, { recursive: true, force: true }); }
}

const cases = [
  { id: "NGSR01", name: "w237 O10: a stop's read of an item-delivery pending state is not blocked by a registry lock a sibling holds (it reads under the read scope and does not wait)", run: () => stopFixture(({ readPending, holder }) => {
    assert.equal(readPending().ok, true, "with no sibling the pending state reads");
    const sibling = holder(8000);
    try {
      recordMarks((marks) => {
        const started = Date.now(), read = readPending();
        assert.equal(read.ok, true, JSON.stringify(read));
        assert.ok(Date.now() - started < 4000, `the read did not wait for the sibling (${Date.now() - started} ms)`);
        assert.equal(sibling.child.exitCode, null, "the sibling still holds the lock when the read has returned");
        assert.equal(sibling.releasedAt(), null, "the lock was not yet released");
        assert.equal(marks.some((mark) => mark.phase === "lock-wait"), false, "no lock wait mark");
      });
    } finally { sibling.child.kill(); }
  }) },

  { id: "NGSR02", name: "w237 O10: a registry generation that moves during the stop's read is detected and the read is repeated; a generation that never settles ends in the exclusive route, not in a refusal", run: () => stopFixture(({ readPending }) => {
    // Seam: the generation witness read before and after the scan (withSessionAuthorityReadScope's generationOf). Attempt 1 sees g1 then g2: drift.
    let calls = 0;
    const settling = () => { calls += 1; return calls <= 2 ? `g${calls}` : "settled"; };
    const read = readPending({ generationOf: settling });
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.equal(calls, 4, "two scope attempts, each reading the generation before and after");
    // A generation that moves on every look: the drift budget ends and the read still answers (exclusive route), it is not refused.
    let moving = 0;
    // (One scope attempt takes a few hundred milliseconds on the fixture, so the budget must cover several attempts.)
    const never = readPending({ generationOf: () => String(moving++), lockWait: { budgetMs: 3000 } });
    assert.equal(never.ok, true, JSON.stringify(never));
    assert.ok(moving >= 4, `the drift was retried before giving up (${moving} looks)`);
  }) },

  { id: "NGSR03", name: "w237 O10: with a sibling holding the lock the stop reads without waiting and waits only at its first write; the host commit lands after the sibling released", run: () => stopFixture(({ head, deliver, stop, holder, original }) => {
    deliver();
    const sibling = holder(5000);
    let commitAt = null;
    try {
      recordMarks((marks) => {
        const started = Date.now();
        const result = stop({ commit: (request) => { commitAt = Date.now(); return commitAdmittedNativeGoldfishReturn(request); } });
        assert.equal(result.status, "authored-commit-recorded", JSON.stringify(result));
        assert.ok(Date.now() - started >= 3000, "the write waited for the sibling's lock");
        const released = sibling.releasedAt();
        assert.ok(released !== null && commitAt !== null && commitAt >= released - 50, `the commit ran under the lock, after the sibling released (${commitAt} vs ${released})`);
        const commitMark = marks.findIndex((mark) => mark.phase === "commit"), firstWait = marks.findIndex((mark) => mark.phase === "lock-wait");
        assert.ok(commitMark >= 0, "the commit mark is written");
        assert.ok(firstWait === -1 || firstWait > commitMark, `no lock wait before the commit mark: ${JSON.stringify(marks.map((mark) => mark.phase))}`);
        assert.notEqual(head(), original.candidate.commit, "HEAD advanced to the host commit");
        assert.equal(head(), result.commit);
      });
    } finally { sibling.child.kill(); }
  }) },

  { id: "NGSR04", name: "w237: one stop authenticates the item-delivery pending state against the registry at most twice, and its host commit, record and item checks still land", run: () => stopFixture(({ head, deliver, stop, original }) => {
    deliver();
    recordMarks((marks) => {
      const result = stop();
      assert.equal(result.status, "authored-commit-recorded", JSON.stringify(result));
      assert.equal(result.delivery?.checkStatus?.verdict, "passed", JSON.stringify(result.delivery));
      assert.equal(result.record.authorship, "host-observed-local");
      assert.notEqual(head(), original.candidate.commit);
      assert.equal(head(), result.commit);
      const authenticated = marks.filter((mark) => mark.phase === "pending-auth").length, reads = marks.filter((mark) => mark.phase === "pending-read").length;
      assert.ok(reads >= 2, `the stop still asks for its pending state at each step (${reads})`);
      assert.ok(authenticated >= 1 && authenticated <= 2, `registry authentications of the pending state in one stop: ${authenticated}`);
    });
  }) },

  { id: "NGSR05", name: "w237 O10: a stop whose first write cannot take the registry lock within the budget fails typed with the holder named, commits nothing and leaves the pending state", run: () => stopFixture(({ root, repository, head, deliver, stop, holder, original }) => {
    deliver();
    const sibling = holder(6000);
    try {
      const result = stop({ lockWait: { budgetMs: 300 } });
      assert.equal(result.status, "recovery-required", JSON.stringify(result));
      // The failure shape of the terminal-prepare wait (w234): the registry's own error code, the stage that met the lock, the holder facts.
      assert.equal(result.code, "SDC-LOCK-HELD", JSON.stringify(result));
      assert.equal(result.stage, "authority-commit-lock", JSON.stringify(result));
      assert.equal(result.lock?.errorCode, "SDC-LOCK-HELD", JSON.stringify(result));
      assert.equal(result.lock.holderPid, sibling.child.pid, "the failure names the holder process");
      assert.equal(head(), original.candidate.commit, "nothing was committed");
      const recorded = readNativeGoldfishStopFailure({ commonDir: repository.commonDir });
      assert.equal(recorded?.code, "SDC-LOCK-HELD", JSON.stringify(recorded));
      assert.equal(recorded.stage, "authority-commit-lock");
      assert.equal(recorded.lock?.holderPid, sibling.child.pid, "the stop-failure record carries the w234 lock fields");
      assert.equal(JSON.stringify(recorded).includes(root), false, "no host path in the record");
    } finally { sibling.child.kill(); }
  }) },
  { id: "NGSR06", name: "w237: the lock waits of one stop (the read, the terminal prepare, the commit and both completion writes) share a ceiling inside the 300 s hook budget, so a stop that cannot complete still has time to write its stop-failure record", run: () => {
    assert.equal(nativeStopWaitBudgetMs(), NATIVE_GOLDFISH_STOP_LOCK_WAIT_MS, "outside a stop the per-wait budget is unchanged");
    const realNow = Date.now, started = realNow();
    try {
      withNativeStopReadMemo(() => {
        assert.equal(nativeStopWaitBudgetMs(), NATIVE_GOLDFISH_STOP_LOCK_WAIT_MS, "early in a stop each wait still gets its full budget");
        Date.now = () => started + 200_000;
        const late = nativeStopWaitBudgetMs();
        assert.ok(late > 0 && late <= 40_000, `200 s into a stop at most the remaining ceiling is left (${late} ms)`);
        Date.now = () => started + 250_000;
        assert.equal(nativeStopWaitBudgetMs(), 0, "past the ceiling a wait gets no budget: the lock refusal is reported at once");
        assert.equal(nativeStopWaitBudgetMs(5000), 0);
      });
    } finally { Date.now = realNow; }
    assert.equal(nativeStopWaitBudgetMs(), NATIVE_GOLDFISH_STOP_LOCK_WAIT_MS, "the ceiling ends with the stop");
  } },
];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
