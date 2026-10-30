// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonical } from "./po-approval-proof.mjs";
import { parseAcceptedCriticCriterion } from "./critic-accepted-contract.mjs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { bindNativeCodexStart, prepareNativeGoldfishHostState,
  readNativeCodexPending, readNativeGoldfishPending } from "./native-goldfish-host-state.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "./native-goldfish-host-return.mjs";
import { resolveGovernedItemQueue, executeGovernedItemDeliveryChecks, inspectGovernedItemDeliveryChecks, prepareGovernedItemQueue, checkpointNativeGoldfishItemDelivery, inspectNativeGoldfishItemDelivery, cancelNativeGoldfishItemDelivery, integrateNativeGoldfishItemDelivery, requalifyNativeGoldfishItemDelivery, amendNativeGoldfishItemWriteScope, observeGovernedItemIntegrationReadiness, readOrchestratorCommitIntegratedSlices, sessionAuthorityRegistryAbsent, createNativeGoldfishAuthorityProducerPort, heldDependencyReason, cancelUnstartedGovernedItemSlice } from "./native-goldfish-host-state.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { createSessionAuthorityParticipantPorts } from "./session-authority-observers.mjs";
import { prepareApprovedItemCourseFixture, nativeContractFixtureParent, nativeContractFixtureRepositoryRoot } from "./test-item-approved-course-fixture.mjs";
import { assessAgyHostCommit, assessSourceOwnedNativeHostCommit } from "./agy-host-commit-admission.mjs";
import { withSourceOwnedNativeConcurrentCommit, inspectSourceOwnedNativeConcurrentAuthority } from "./native-goldfish-host-state.mjs";
import { requiresGovernedItemAdmission } from "../hooks/guard-dispatch.mjs";
import { qualifyNativeGoldfishHookDelivery } from "../hooks/native-goldfish-host.mjs";
import { readyAndLive, SLICE_QUEUE_MAX_BYTES, validateSliceQueue } from "./slice-queue.mjs";
import { runCli, writeQueueAtomic } from "../scripts/slice-queue.mjs";
import { finalizeNativeGoldfishHostReturn } from "./native-goldfish-host-finalizer.mjs";
import { createAgyAuthorityJournalOwner } from "./agy-host-observed-store.mjs";
import { nativeManagedDigest, nativeManagedCurrentOwner } from "./native-managed-authority-support.mjs";
import { enterClaudeHookSessionOwner, leaveClaudeHookSessionOwner, readClaudeHookSessionOwner, CLAUDE_HOOK_SESSION_OWNER_SOURCE } from "./claude-hook-session-owner.mjs";
import { initializeSessionAuthorityRegistry, refreshSourceOwnedDispatchAuthorityMember, withSessionAuthorityBoundary, inspectSourceOwnedSessionAuthorityProducerRecord } from "./session-authority-registry.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { createControlledMethodRuntimeFixture } from "./session-requester-bridge.mjs";

function fixture(run) {
  // Authority-domain inventory refuses writable ancestors such as /tmp.
  const fixtureRoot=nativeContractFixtureParent();
  mkdirSync(fixtureRoot,{recursive:true,mode:0o700});
  const root = mkdtempSync(join(fixtureRoot, "native-goldfish-host-state-"));
  const commonDir = join(root, ".git");
  try {
    mkdirSync(join(root,"evidence"),{mode:0o700});
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0, "actual Git topology required by the Source authority observer");
    for(const [name,value] of [["user.name","Fixture"],["user.email","fixture@example.invalid"],["commit.gpgsign","false"],["core.hooksPath",devNull]]) assert.equal(spawnSync("git",["-C",root,"config",name,value]).status,0,"isolated fixture Git identity/config");
    assert.equal(spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", `core.hooksPath=${devNull}`, "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-q", "-m", "fixture"]).status, 0);
    const commit = "a".repeat(40); const tree = "b".repeat(40);
    const dependencies = {
      git: (_root, args) => args.at(-1) === "HEAD^{commit}" ? commit : tree,
      resolveCommonDir: () => commonDir,
      captureBaseline: ({ root: candidateRoot, candidateCommit, resultPath }) => {
        if (existsSync(join(candidateRoot, "dirty-marker"))) return { ok: false, code: "AGY-HOST-BASELINE-DIRTY" };
        return { ok: true, baseline: { schema: "pipeline.agy-host-commit-baseline.v1",
          root: candidateRoot, candidateCommit, resultPath, untracked: [] } };
      },
    };
    return run({ root, commonDir, dependencies, commit, tree });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function prompt(binding) { return `Goldfish briefing\n<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nReturn contract follows.`; }
function makeBinding({ dispatchId, commit, tree, runner = "claude" }) {
  return { schema: "pipeline.native-goldfish-host-briefing.v1", dispatchId,
    candidateCommit: commit, candidateTree: tree, runner, role: "pipeline-core:goldfish-implementor",
    agentType: "goldfish-implementor", model: "gpt-6-luna", effort: "high",
    rulesetSha: "c".repeat(64), allowedPaths: ["src/change.mjs"],
    criticDecision: { schema: "pipeline.critic-required-decision.v1",
      trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
        diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" } };
}
function makeCodexWorkerBinding({ dispatchId, commit, tree }) {
  const binding = makeBinding({ dispatchId, commit, tree, runner: "codex" });
  const { agentType: _legacyAgentType, ...withoutNativeAlias } = binding;
  return { ...withoutNativeAlias, schema: "pipeline.native-goldfish-host-briefing.v2", nativeAgentType: "worker" };
}
function toolInput(runner, { root, session, toolUseId, binding, toolName = "Task" }) {
  return runner === "claude"
    ? { cwd: root, session_id: session, tool_name: toolName, tool_use_id: toolUseId,
      tool_input: { subagent_type: "pipeline-core:goldfish-implementor", prompt: prompt(binding), run_in_background: false } }
    : { cwd: root, session_id: session, tool_name: "spawn_agent", tool_use_id: toolUseId,
      tool_input: { agent_type: "goldfish-implementor", message: prompt(binding) } };
}
function itemContinuity() {
  const ref=path=>({path,sha256:"a".repeat(64)});
  return {schema:"pipeline.continuity.v0",featureId:"unit",revision:0,
    runtime:{humanFacingLanguage:"en",activeDuty:"Coordinator",sessionCleanup:null},
    authority:{prd:ref("specs/unit/prd.md"),spec:ref("specs/unit/spec.md"),result:ref("specs/unit/result.md")},
    queueHead:{packageId:"unit-package",actionId:"item-admission",nextAction:"dispatch",productRetryCount:0,environmentRerouteCount:0,dispatch:null},
    blocker:null,acknowledgedFinal:null,resume:{mode:"immediate",sourceRevision:0,reasonCode:"active-turn"},recovery:null,decisionTxn:null,closeTransition:null,
    capacity:{concurrencyLimit:3,reservedCriticSlots:1,reservedRecoverySlots:1,fallbackPolicy:"defer"}};
}

function d177Item(runtime, root, original, id, path, locator, extra = {}) {
  const itemDelivery = { schema: "pipeline.item-delivery-briefing.v1", sliceId: id, itemId: id, criterionLocator: locator, checks: [{ id: "original-criterion", path: `src/${path}.test.mjs`, dependencies: [`src/${path}.mjs`, `src/${path}.test.mjs`] }] };
  const binding = { ...makeBinding({ dispatchId: id, commit: original.candidate.commit, tree: original.candidate.tree }), allowedPaths: [`src/${path}.mjs`], schema: "pipeline.native-goldfish-host-briefing.v3", model: "sonnet", effort: "medium", itemDelivery };
  const input = toolInput("claude", { root, session: `session-${id}`, toolUseId: `tool-${id}`, binding });
  input.tool_input.prompt = input.tool_input.prompt.replace("host-commit:v1", "host-commit:v3") + `\nSlice: ${id}\nWrite scope: src/${path}.mjs\n`;
  const prepared = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input, ...extra }));
  return { binding, input, prepared, path };
}
// Two admitted original items (LEFT, RIGHT) in an enrolled fixture, the NGHS17 shape. prepareBoth=false returns before preparing.
function d177Setup(root, prepareBoth = true) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host") }), plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "fixture explicit original course" });
  assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/second.mjs"), "export const value='expected';\n");
  writeFileSync(join(root, "src/second.test.mjs"), "import test from 'node:test';import assert from 'node:assert/strict';import {value} from './second.mjs';test('second original criterion',()=>assert.equal(value,'expected'));\n");
  const original = prepareApprovedItemCourseFixture({ root, additionalCriteria: [{ id: "AC-2", text: "The independent second dependency returns expected bytes." }] }), repository = inspectSignedDescriptorCustodyRepository(root);
  const runtime = createControlledMethodRuntimeFixture({ repository, fixtureRoot: join(repository.commonDir, "agent-pipeline/controlled-method-fixtures/parallel-original"), sessionId: "parallel-original-owner" });
  initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository }));
  const items = {};
  if (prepareBoth) for (const [id, path, locator] of [["LEFT", "change", original.criterionLocator], ["RIGHT", "second", original.criterionLocators["AC-2"]]]) {
    items[id] = d177Item(runtime, root, original, id, path, locator); assert.equal(items[id].prepared.ok, true, JSON.stringify(items[id].prepared));
  }
  return { original, repository, runtime, items };
}

const cases = [
  { id: "D177-a-memo-per-admission", name: "D177 the admission memo computes once per key and boundary and does not leak across boundaries", run: async () => {
    const { memoPerAdmission } = await import("./native-goldfish-host-state.mjs");
    const first = {}, second = {}; let calls = 0;
    const compute = () => { calls += 1; return { calls }; };
    assert.equal(memoPerAdmission(first, "k1", compute), memoPerAdmission(first, "k1", compute));
    assert.equal(calls, 1, "same boundary and key: one computation");
    memoPerAdmission(first, "k2", compute); // a changed queue sha or candidate commit changes the key
    assert.equal(calls, 2, "changed key: fresh computation");
    memoPerAdmission(second, "k1", compute); // a later admission has its own boundary object
    assert.equal(calls, 3, "another boundary: no leak");
    memoPerAdmission(null, "k1", compute); memoPerAdmission(null, "k1", compute);
    assert.equal(calls, 5, "no boundary object: never memoised");
  } },
  { id: "D177-b-member-records-once-per-admission", name: "D182 the member records of one admission are inspected once per member set and boundary, and a changed member set or another boundary reads again", run: async () => {
    const { inspectNativeMemberRecords } = await import("./native-goldfish-host-state.mjs");
    const boundary = {}, other = {}, port = { name: "port" };
    const producerOf = (refs) => ({ record: { members: refs.map((memberRef) => ({ memberRef })) } });
    let reads = 0;
    const inspect = ({ producerPort, memberRefs }) => { reads += 1; assert.equal(producerPort, port); return memberRefs.map((memberRef) => ({ record: { phase: "released", bindingSha256: `h-${memberRef}` } })); };
    const refs = ["m1", "m2", "m3"];
    const first = inspectNativeMemberRecords({ boundary, port, producer: producerOf(refs), inspectMany: inspect });
    assert.equal(reads, 1, "all members come from one registry read");
    const second = inspectNativeMemberRecords({ boundary, port, producer: producerOf(refs), inspectMany: inspect });
    assert.equal(reads, 1, "the integrated-slice computation, the released-reservation read and the concurrent plan share one pass");
    assert.equal(second, first);
    assert.deepEqual(second.map((member) => member.record.bindingSha256), ["h-m1", "h-m2", "h-m3"], "order and content follow the producer record");
    inspectNativeMemberRecords({ boundary, port, producer: producerOf([...refs, "m4"]), inspectMany: inspect });
    assert.equal(reads, 2, "a changed member set is never served from the memo");
    inspectNativeMemberRecords({ boundary: other, port, producer: producerOf(refs), inspectMany: inspect });
    assert.equal(reads, 3, "a later admission has its own boundary and reads again");
    inspectNativeMemberRecords({ boundary: null, port, producer: producerOf(refs), inspectMany: inspect }); inspectNativeMemberRecords({ boundary: null, port, producer: producerOf(refs), inspectMany: inspect });
    assert.equal(reads, 5, "no boundary object: never memoised");
  } },
  { id: "D177-c-batch-member-records-equal-single", name: "D182 the batch member inspection returns exactly the rows of the single inspection in the order asked, from one read, and refuses a ref that is not current", run: async () => { const registry = await import("./session-authority-registry.mjs"); return fixture(({ root }) => {
    const { runtime } = d177Setup(root), repo = inspectSignedDescriptorCustodyRepository(root), port = createNativeGoldfishAuthorityProducerPort({ repository: repo });
    runtime.run(() => withSessionAuthorityBoundary({ repository: repo }, (boundary) => {
      const producer = inspectSourceOwnedSessionAuthorityProducerRecord({ boundary, producerPort: port });
      const refs = producer.record.members.map((row) => row.memberRef);
      assert.ok(refs.length >= 2, "the fixture dispatched two items");
      const single = refs.map((memberRef) => registry.inspectSourceOwnedSessionAuthorityMemberRecord({ boundary, producerPort: port, memberRef }));
      assert.deepEqual(registry.inspectSourceOwnedSessionAuthorityMemberRecords({ boundary, producerPort: port, memberRefs: refs }), single);
      assert.deepEqual(registry.inspectSourceOwnedSessionAuthorityMemberRecords({ boundary, producerPort: port, memberRefs: [...refs].reverse() }), [...single].reverse(), "the order asked is the order returned");
      assert.deepEqual(registry.inspectSourceOwnedSessionAuthorityMemberRecords({ boundary, producerPort: port, memberRefs: [] }), []);
      assert.throws(() => registry.inspectSourceOwnedSessionAuthorityMemberRecords({ boundary, producerPort: port, memberRefs: [{ ...refs[0], sha256: "f".repeat(64) }] }), (error) => error.code === "SDC-AUTHORITY-CAS");
      assert.throws(() => registry.inspectSourceOwnedSessionAuthorityMemberRecords({ boundary, producerPort: port, memberRefs: "not-an-array" }), (error) => error.code === "SDC-AUTHORITY-CAS");
    }));
  }); } },
  { id: "D177-differential-settled", name: "D177 the skip and the memo leave the integrated, released and settled results identical to the unfiltered computation, and a memo hit reads no repository", run: async () => { const mod = await import("./native-goldfish-host-state.mjs"); return fixture(({ root }) => {
    assert.equal(typeof mod.readNativeIntegratedSlices, "function", "the unfiltered reader is reachable for the differential");
    assert.equal(typeof mod.settledItemSlices, "function");
    const { original, repository, runtime, items } = d177Setup(root);
    const returned = (id) => { const item = items[id]; return { ...item.input, hook_event_name: "PostToolUse", tool_response: { status: "completed", resolvedModel: item.binding.model, content: [{ type: "text", text: JSON.stringify({ schema: "pipeline.native-goldfish-host-return.v1", dispatchId: id, candidateCommit: item.binding.candidateCommit, outcome: "succeeded", report: "D177 fixture return.", changedPaths: [`src/${item.path}.mjs`] }) }] } }; };
    writeFileSync(join(root, "src/change.mjs"), "export const value='expected'; // D177 LEFT\n");
    const finalized = runtime.run(() => finalizeNativeGoldfishHostReturn({ root, runner: "claude", input: returned("LEFT") }));
    assert.equal(finalized.status, "authored-commit-recorded", JSON.stringify(finalized));
    assert.equal(runtime.run(() => integrateNativeGoldfishItemDelivery({ root, pendingSha256: items.LEFT.prepared.sha256 })).status, "integrated");
    const repo = inspectSignedDescriptorCustodyRepository(root), governed = resolveGovernedItemQueue({ root });
    // integrated LEFT, open RIGHT; a second view marks RIGHT cancelled (a new queue sha256, so a fresh computation)
    const views = [governed, { ...governed, sha256: "c".repeat(64), normalized: { ...governed.normalized, slices: governed.normalized.slices.map((row) => row.id === "RIGHT" ? { ...row, state: "cancelled" } : row) } }];
    for (const view of views) {
      const got = runtime.run(() => withSessionAuthorityBoundary({ repository: repo }, (boundary) => {
        const unfiltered = mod.readNativeIntegratedSlices({ governed: view, repository: repo, boundary });
        const commit = readOrchestratorCommitIntegratedSlices({ root: repo.primaryRoot, candidateCommit: repo.candidate.commit, slices: view.normalized.slices });
        const oldSettled = mod.settledItemSlices([...unfiltered.integrated, ...commit], view);
        const fresh = mod.readSettledItemSliceIds({ repository: repo, boundary, governed: view });
        const skipped = mod.readNativeIntegratedSlices({ governed: view, repository: repo, boundary, skipCancelled: true });
        const only = mod.readNativeIntegratedSlices({ governed: view, repository: repo, boundary, only: new Set(["LEFT"]) });
        let reads = 0;
        const counted = new Proxy(repo, { get(target, key) { if (key === "primaryRoot") reads += 1; return target[key]; } });
        mod.readSettledItemSliceIds({ repository: counted, boundary, governed: view });
        return { unfiltered, oldSettled: [...oldSettled].sort(), fresh: [...fresh].sort(), skipped, only, reads };
      }));
      assert.deepEqual(got.fresh, got.oldSettled, "settled set identical to the unfiltered computation");
      assert.ok(got.unfiltered.integrated.includes("LEFT"), "the fixture has an integrated row");
      assert.deepEqual([...got.skipped.releasedPendingHashes].sort(), [...got.unfiltered.releasedPendingHashes].sort(), "releasedPendingHashes complete in every shape");
      assert.deepEqual(got.only.integrated, got.unfiltered.integrated.filter((id) => id === "LEFT"), "only: the dependency ids that were asked for");
      assert.equal(got.reads, 0, "a memo hit performs no repository-root read (no per-row git proof)");
    }
  }); } },
  { id: "D177-slow-phase-releases-lock", name: "D177 a stubbed clock past the budget yields GUARD-DISPATCH-SLOW naming the phase, one stderr-style line per phase, and the registry lock is free afterwards", run: () => fixture(({ root }) => {
    const { original, repository, runtime, items } = d177Setup(root, false);
    const lines = []; let calls = 0;
    const admissionDeadline = { startMs: 0, budgetMs: 100000, now: () => (calls++ < 1 ? 0 : 200000), write: (line) => lines.push(line) };
    const item = d177Item(runtime, root, original, "LEFT", "change", original.criterionLocator, { admissionDeadline });
    assert.equal(item.prepared.ok, false);
    assert.equal(item.prepared.code, "GUARD-DISPATCH-SLOW");
    assert.match(String(item.prepared.reason), /integrated-slice-read|collision-check/u);
    assert.ok(lines.length >= 1 && lines.every((line) => /^guard-dispatch: phase [a-z-]+ at \d+(\.\d+)?s\n?$/u.test(line)), JSON.stringify(lines));
    const repo = inspectSignedDescriptorCustodyRepository(root);
    assert.equal(runtime.run(() => withSessionAuthorityBoundary({ repository: repo }, () => "free")), "free", "the throw released the registry lock");
  }) },
  { id: "NGHS01", name: "unmarked native dispatch stays untouched", run: () => fixture(({ root, commit, tree }) => {
    const input = toolInput("claude", { root, session: "session-1", toolUseId: "tool-1", binding: makeBinding({ dispatchId: "TASK-1", commit, tree }) });
    input.tool_input.prompt = "ordinary Goldfish briefing";
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input }).code, "NGHS-NOT-APPLICABLE");
  }) },
  { id: "NGHS02", name: "clean Claude preflight binds exact session and tool-use identity", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const binding = makeBinding({ dispatchId: "TASK-CLAUDE-1", commit, tree });
    const input = toolInput("claude", { root, session: "session-claude", toolUseId: "tool-claude-1", binding });
    const prepared = prepareNativeGoldfishHostState({ root, runner: "claude", input }, dependencies);
    assert.equal(prepared.ok, true, prepared.code);
    const readback = readNativeGoldfishPending({ commonDir: join(root, ".git"), runner: "claude",
      sessionId: "session-claude", correlationId: "tool-claude-1" });
    assert.equal(readback.ok, true, readback.code);
    assert.equal(readback.state.binding.dispatchId, binding.dispatchId);
    assert.equal(readback.state.baseline.candidateCommit, commit);
    const agentBinding = makeBinding({ dispatchId: "TASK-CLAUDE-AGENT-1", commit, tree });
    const agentInput = toolInput("claude", { root, session: "session-agent", toolUseId: "tool-agent-1",
      binding: agentBinding, toolName: "Agent" });
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: agentInput }, dependencies).ok, true);
    const backgroundInput = toolInput("claude", { root, session: "session-bg", toolUseId: "tool-bg-1", binding: agentBinding });
    delete backgroundInput.tool_input.run_in_background;
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: backgroundInput }, dependencies).code,
      "NGHS-CLAUDE-FOREGROUND-REQUIRED");
  }) },
  { id: "NGHS03", name: "Codex start-stop association consumes resolved pending bindings and refuses true ambiguity", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const first = makeBinding({ dispatchId: "TASK-CODEX-1", commit, tree, runner: "codex" });
    const initial = prepareNativeGoldfishHostState({ root, runner: "codex",
      input: toolInput("codex", { root, session: "session-codex", toolUseId: "tool-codex-1", binding: first }) }, dependencies);
    assert.equal(initial.ok, true, initial.code);
    const start = { hook_event_name: "SubagentStart", session_id: "session-codex",
      agent_id: "child-codex-1", agent_type: "goldfish-implementor", model: first.model };
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: start }).ok, true);
    const stop = { ...start, hook_event_name: "SubagentStop" };
    const pending = readNativeCodexPending({ commonDir: join(root, ".git"), input: stop });
    assert.equal(pending.ok, true, pending.code);
    assert.equal(pending.state.agentId, start.agent_id);
    assert.equal(pending.state.binding.dispatchId, first.dispatchId);

    const second = makeBinding({ dispatchId: "TASK-CODEX-2", commit, tree, runner: "codex" });
    const another = prepareNativeGoldfishHostState({ root, runner: "codex",
      input: toolInput("codex", { root, session: "session-codex", toolUseId: "tool-codex-2", binding: second }) }, dependencies);
    assert.equal(another.ok, true, another.code);
    const secondStart = { ...start, agent_id: "child-codex-2" };
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: secondStart }).ok, true);
    const secondStop = readNativeCodexPending({ commonDir: join(root, ".git"), input: {
      ...secondStart, hook_event_name: "SubagentStop" } });
    assert.equal(secondStop.ok, true, secondStop.code);
    assert.equal(secondStop.state.binding.dispatchId, second.dispatchId);

    for (const suffix of ["3", "4"]) {
      const next = makeBinding({ dispatchId: `TASK-CODEX-${suffix}`, commit, tree, runner: "codex" });
      const pendingNext = prepareNativeGoldfishHostState({ root, runner: "codex",
        input: toolInput("codex", { root, session: "session-codex", toolUseId: `tool-codex-${suffix}`, binding: next }) }, dependencies);
      assert.equal(pendingNext.ok, true, pendingNext.code);
    }
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: {
      ...start, agent_id: "child-codex-3" } }).code, "NGHS-CODEX-START-AMBIGUOUS");
  }) },
  { id: "NGHS04", name: "candidate, runner role and dirty checkout are checked before model launch", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const binding = makeBinding({ dispatchId: "TASK-DRIFT-1", commit, tree });
    const wrongCandidate = toolInput("claude", { root, session: "session-drift", toolUseId: "tool-drift-1",
      binding: { ...binding, candidateCommit: "0".repeat(40) } });
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: wrongCandidate }, dependencies).code, "NGHS-CANDIDATE-MISMATCH");
    const wrongRole = toolInput("claude", { root, session: "session-drift", toolUseId: "tool-drift-2",
      binding: { ...binding, role: "pipeline-core:goldfish-mechanic", agentType: "goldfish-mechanic" } });
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: wrongRole }, dependencies).code, "NGHS-ROLE-MISMATCH");
    writeFileSync(join(root, "dirty-marker"), "dirty after candidate\n");
    const dirty = toolInput("claude", { root, session: "session-drift", toolUseId: "tool-drift-3", binding });
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: dirty }, dependencies).code, "AGY-HOST-BASELINE-DIRTY");
  }) },
  { id: "NGHS05", name: "expired unstarted Codex pending state cannot poison a later exact start", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const oldBinding = makeBinding({ dispatchId: "TASK-CODEX-STALE", commit, tree, runner: "codex" });
    const oldInput = toolInput("codex", { root, session: "session-expiry", toolUseId: "tool-stale", binding: oldBinding });
    const oldPending = prepareNativeGoldfishHostState({ root, runner: "codex", input: oldInput },
      { ...dependencies, nowEpochMs: () => 1_000 });
    assert.equal(oldPending.ok, true, oldPending.code);
    const start = { hook_event_name: "SubagentStart", session_id: "session-expiry", agent_id: "child-fresh",
      agent_type: oldBinding.agentType, model: oldBinding.model };
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: start,
      nowEpochMs: 121_001 }).code, "NGHS-CODEX-START-UNBOUND");
    const freshBinding = makeBinding({ dispatchId: "TASK-CODEX-FRESH", commit, tree, runner: "codex" });
    const freshInput = toolInput("codex", { root, session: "session-expiry", toolUseId: "tool-fresh", binding: freshBinding });
    const freshPending = prepareNativeGoldfishHostState({ root, runner: "codex", input: freshInput },
      { ...dependencies, nowEpochMs: () => 121_001 });
    assert.equal(freshPending.ok, true, freshPending.code);
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: start,
      nowEpochMs: 121_002 }).ok, true);
  }) },

  {id:"NGHS06",name:"governed approved course refuses missing and legacy queue independently of fanout environment",run:()=>fixture(({root,commit,tree,dependencies})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,"fixture-host")});
    const plan=controller.planDecision({rootDir:root,decision:"enroll",by:"fixture explicit selection"});
    assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,"active");
    mkdirSync(join(root,".claude"));mkdirSync(join(root,"specs/unit"),{recursive:true});
    writeFileSync(join(root,".claude/pipeline.yaml"),"schema: pipeline.manifest.v0\n");
    writeFileSync(join(root,".claude/pipeline-state.json"),JSON.stringify({schema:"pipeline.state.v0",activeFeature:{id:"unit",planPath:"specs/unit/plan.md",phase:"implementation"},planApproved:true}));
    const binding=makeBinding({dispatchId:"ITEM-A",commit,tree});
    const input=toolInput("claude",{root,session:"item-session",toolUseId:"item-tool",binding});
    assert.equal(resolveGovernedItemQueue({root}).status,"refused");
    assert.equal(prepareNativeGoldfishHostState({root,runner:"claude",input},dependencies).ok,false);
    writeFileSync(join(root,"specs/unit/slice-queue.json"),JSON.stringify({schema:"pipeline.slice-queue.v1"}));
    assert.equal(resolveGovernedItemQueue({root}).code,"SQ-DELIVERY-MIGRATION-REQUIRED");
  })},
  {id:"NGHS07",name:"actual native authority admission reserves item and scopes across sessions",run:()=>fixture(({root,commit,tree,dependencies})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,"fixture-host")});
    const plan=controller.planDecision({rootDir:root,decision:"enroll",by:"fixture explicit selection"});
    controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
    mkdirSync(join(root,".claude"));mkdirSync(join(root,"specs/unit"),{recursive:true});
    writeFileSync(join(root,".claude/pipeline.yaml"),"schema: pipeline.manifest.v0\n");
    writeFileSync(join(root,".claude/pipeline-state.json"),JSON.stringify({schema:"pipeline.state.v0",activeFeature:{id:"unit",planPath:"specs/unit/plan.md",phase:"implementation"},planApproved:true}));
    const item=(id,itemId,path)=>({id,title:id,state:"ready",dependsOn:[],writeScope:[path],tier:"implementor",commitMode:"diff-only",loadClass:"light",delivery:{itemId,criteria:["CR-1"],baseCommit:commit}});
    const queue={schema:"pipeline.slice-queue.v2",feature:"unit",slices:[item("ITEM-A","AC-1","src/change.mjs"),item("ITEM-B","AC-1","src/b.mjs"),item("ITEM-C","AC-2","src/c.mjs")]};
    queue.slices[0].writeScope.push("src/shared/**");
    writeFileSync(join(root,"specs/unit/slice-queue.json"),JSON.stringify(queue));
    assert.equal(resolveGovernedItemQueue({root}).status,"required");
    const statePath=join(root,".claude/pipeline-state.json");
    writeFileSync(statePath,JSON.stringify({...JSON.parse(readFileSync(statePath,"utf8")),continuity:itemContinuity()}));
    chmodSync(statePath,0o600);
    const repository=inspectSignedDescriptorCustodyRepository(root);
    const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,"agent-pipeline/controlled-method-fixtures/item-owner"),sessionId:"item-owner-unit"});
    const ports=createSessionAuthorityParticipantPorts({repository});
    for(const row of ports)assert.doesNotThrow(()=>row.port.readBaseline(),row.producerId);
    assert.equal(initializeSessionAuthorityRegistry({repository},ports).status,"initialized");
    const launch=(id,path,session)=>{
      const binding={...makeBinding({dispatchId:id,commit,tree}),allowedPaths:[path]};
      const input=toolInput("claude",{root,session,toolUseId:`tool-${id}`,binding});
      input.tool_input.prompt+=`\nSlice: ${id}\nWrite scope: ${path}\n`;
      return runtime.run(()=>prepareNativeGoldfishHostState({root,runner:"claude",input},dependencies));
    };
    const first=launch("ITEM-A","src/change.mjs","session-one");
    assert.equal(first.ok,true,JSON.stringify(first));
    const duplicate=launch("ITEM-B","src/b.mjs","session-two");
    assert.equal(duplicate.ok,false);assert.equal(duplicate.reason,"item-delivery-owner-collision");
    const other=launch("ITEM-C","src/c.mjs","session-three");
    assert.equal(other.ok,true,JSON.stringify(other));
    // A governed queue replacement cannot hide a still-held older reservation.
    queue.slices=[item("ITEM-D","AC-3","src/shared/regression.test.mjs")];
    writeFileSync(join(root,"specs/unit/slice-queue.json"),JSON.stringify(queue));
    const overlap=launch("ITEM-D","src/shared/regression.test.mjs","session-four");
    assert.equal(overlap.ok,false);assert.equal(overlap.reason,"item-delivery-scope-collision");
  })},
  {id:"NGHS08",name:"AGY dispatch journal v2 retains stable physical identity across a real candidate advance; v1 never silently migrates",run:()=>fixture(({root,commonDir})=>{
    const repository=inspectSignedDescriptorCustodyRepository(root);
    const directory=join(commonDir,"agent-pipeline/run/agy-authority-contexts");
    mkdirSync(directory,{recursive:true,mode:0o700});
    const basis={association:{state:"unbound",target:null},candidate:repository.candidate,operationNonce:"a".repeat(64)};
    const entry={schema:"pipeline.agy-authority-lifetime.v2",producerId:"agy-family-dispatch",repositorySha256:nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir}),operationId:"a".repeat(32),basis,bindingSha256:nativeManagedDigest(basis),phase:"armed",terminal:null,terminalEvidence:null,sourcePaths:[]};
    const file=join(directory,`op.${entry.operationId}.1.json`);
    writeFileSync(file,JSON.stringify(entry),{mode:0o600});
    const owner=createAgyAuthorityJournalOwner({repository,namespaceIds:["registered-opaque-context-lifetimes"],journalNamespace:"registered-opaque-context-lifetimes",producerId:"agy-family-dispatch",kinds:["dispatch","armed-capability"],classifyLegacy:()=>null});
    const first=owner.port.readBaseline();assert.equal(first.legacyOperations.length,1);
    assert.equal(spawnSync("git",["-C",root,"-c","user.name=Fixture","-c","user.email=fixture@example.invalid","-c",`core.hooksPath=${devNull}`, "-c", "commit.gpgsign=false","commit","--allow-empty","-q","-m","actual Main candidate advance"]).status,0);
    assert.notEqual(inspectSignedDescriptorCustodyRepository(root).candidate.commit,repository.candidate.commit);
    assert.equal(owner.port.observeOperation(first.legacyOperations[0]).phase,"armed");
    entry.schema="pipeline.agy-authority-lifetime.v1";entry.repositorySha256=nativeManagedDigest(repository);
    writeFileSync(file,JSON.stringify(entry));
    assert.throws(()=>owner.port.readBaseline(),/AGY-AUTHORITY-JOURNAL/);
    assert.throws(()=>refreshSourceOwnedDispatchAuthorityMember({boundary:{},producerPort:owner.port,memberHandle:{},expectedMemberRef:{},operationHandle:{}}));
  })},
  {id:"NGHS09",name:"targeted check evidence observes real process failures and binds tests, dependencies and candidate; forged PASS is rejected",run:()=>fixture(({root})=>{
    writeFileSync(join(root,'unit.test.cjs'),"const test=require('node:test');const assert=require('node:assert/strict');test('nested recorder identity',()=>assert.equal(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD,undefined));test('actual criterion',()=>assert.equal(require('node:fs').readFileSync('dependency.txt','utf8'),'expected\\n'));\n");
    writeFileSync(join(root,'dependency.txt'),'expected\n');
    const commit=()=>{assert.equal(spawnSync('git',['-C',root,'add','unit.test.cjs','dependency.txt']).status,0);assert.equal(spawnSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c',`core.hooksPath=${devNull}`,'commit','-q','-m','targeted source']).status,0);return inspectSignedDescriptorCustodyRepository(root).candidate;};
    const candidate=commit();
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-A',itemId:'AC-1',criterionLocator:{schema:'pipeline.critic-criterion-locator.v1',sourcePath:'specs/unit/spec.md',sourceSha256:'a'.repeat(64),criterionId:'AC-1',startByte:1,endByte:20,excerptSha256:'b'.repeat(64)},checks:[{id:'unit',path:'unit.test.cjs',dependencies:['dependency.txt']}]};
    const observed=executeGovernedItemDeliveryChecks({root,itemDelivery,candidate});
    assert.equal(observed.code,'SQ-TARGETED-CHECKS-PASSED',JSON.stringify(observed));
    const evidence=inspectGovernedItemDeliveryChecks({root,handle:observed.handle,candidate,itemDelivery});
    assert.equal(evidence.files.length,2);assert.equal(evidence.results[0].status,0);
    assert.throws(()=>inspectGovernedItemDeliveryChecks({root,handle:{evidence:{verdict:'passed'}},candidate,itemDelivery}),/unowned/);
    writeFileSync(join(root,'dependency.txt'),'changed\n');
    assert.throws(()=>inspectGovernedItemDeliveryChecks({root,handle:observed.handle,candidate,itemDelivery}),/not-candidate/);
    const changed=commit();
    const failed=executeGovernedItemDeliveryChecks({root,itemDelivery,candidate:changed});
    assert.equal(failed.code,'SQ-TARGETED-CHECKS-FAILED',JSON.stringify(failed));
    assert.equal(failed.evidence.verdict,'failed');assert.notEqual(failed.evidence.results[0].status,0);
    assert.throws(()=>inspectGovernedItemDeliveryChecks({root,handle:observed.handle,candidate:changed,itemDelivery}),/stale/);
    const weakened={...itemDelivery,checks:[{id:'unit',path:'unit.test.cjs',dependencies:['unit.test.cjs']}]};
    assert.throws(()=>inspectGovernedItemDeliveryChecks({root,handle:failed.handle,candidate:changed,itemDelivery:weakened}),/stale/);
    assert.equal(prepareGovernedItemQueue({root,itemDelivery:{...itemDelivery,pass:true},candidate,writeScope:['dependency.txt']}).code,'SQ-ITEM-BINDING-INVALID');
  })},
  {id:"NGHS10",name:"same authenticated item owner checkpoints survive reconstruction without granting phase PASS or cancellation release",run:()=>fixture(({root,commit,tree,dependencies})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,"fixture-host")});
    const plan=controller.planDecision({rootDir:root,decision:"enroll",by:"fixture explicit selection"});
    controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
    mkdirSync(join(root,".claude"));mkdirSync(join(root,"specs/unit"),{recursive:true});
    writeFileSync(join(root,".claude/pipeline.yaml"),"schema: pipeline.manifest.v0\n");
    writeFileSync(join(root,".claude/pipeline-state.json"),JSON.stringify({schema:"pipeline.state.v0",activeFeature:{id:"unit",planPath:"specs/unit/plan.md",phase:"implementation"},planApproved:true}));
    const item=(id,itemId,path)=>({id,title:id,state:"ready",dependsOn:[],writeScope:[path],tier:"implementor",commitMode:"diff-only",loadClass:"light",delivery:{itemId,criteria:["CR-1"],baseCommit:commit}});
    const queue={schema:"pipeline.slice-queue.v2",feature:"unit",slices:[item("ITEM-A","AC-1","src/change.mjs"),item("ITEM-B","AC-1","src/b.mjs"),item("ITEM-C","AC-2","src/c.mjs")]};
    queue.slices[0].writeScope.push("src/shared/**");
    writeFileSync(join(root,"specs/unit/slice-queue.json"),JSON.stringify(queue));
    assert.equal(resolveGovernedItemQueue({root}).status,"required");
    const statePath=join(root,".claude/pipeline-state.json");
    writeFileSync(statePath,JSON.stringify({...JSON.parse(readFileSync(statePath,"utf8")),continuity:itemContinuity()}));
    chmodSync(statePath,0o600);
    const repository=inspectSignedDescriptorCustodyRepository(root);
    const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,"agent-pipeline/controlled-method-fixtures/item-owner"),sessionId:"item-owner-unit"});
    const ports=createSessionAuthorityParticipantPorts({repository});
    for(const row of ports)assert.doesNotThrow(()=>row.port.readBaseline(),row.producerId);
    assert.equal(initializeSessionAuthorityRegistry({repository},ports).status,"initialized");
    const launch=(id,path,session)=>{
      const binding={...makeBinding({dispatchId:id,commit,tree}),allowedPaths:[path]};
      const input=toolInput("claude",{root,session,toolUseId:`tool-${id}`,binding});
      input.tool_input.prompt+=`\nSlice: ${id}\nWrite scope: ${path}\n`;
      return runtime.run(()=>prepareNativeGoldfishHostState({root,runner:"claude",input},dependencies));
    };

    const first=launch('ITEM-A','src/change.mjs','session-one');assert.equal(first.ok,true,JSON.stringify(first));
    const checkpoint={schema:'pipeline.item-owned-checkpoint.v1',declaredPhase:'implementation',contextPaths:['specs/unit/plan.md','src/change.mjs'],remainingClauses:['AC-1'],summary:'Keep original item, owner and criterion context through Compact.'};
    const saved=runtime.run(()=>checkpointNativeGoldfishItemDelivery({root,pendingSha256:first.sha256,checkpoint}));
    assert.equal(saved.status,'checkpointed',JSON.stringify(saved));assert.equal(saved.revision,1);
    const second=runtime.run(()=>checkpointNativeGoldfishItemDelivery({root,pendingSha256:first.sha256,checkpoint:{...checkpoint,declaredPhase:'targeted-checks'}}));
    assert.equal(second.revision,2,JSON.stringify(second));
    const fake=runtime.run(()=>checkpointNativeGoldfishItemDelivery({root,pendingSha256:first.sha256,checkpoint:{...checkpoint,pass:true}}));assert.equal(fake.status,'refused');
    const prose=runtime.run(()=>integrateNativeGoldfishItemDelivery({root,pendingSha256:first.sha256,pass:true}));assert.equal(prose.status,'refused');
    const cancelled=runtime.run(()=>cancelNativeGoldfishItemDelivery({root,pendingSha256:first.sha256,cancelled:true}));assert.equal(cancelled.code,'NGHS-ITEM-CANCELLATION-WITNESS-UNAVAILABLE');assert.equal(cancelled.reservation,'retained');
    const ownership=runtime.run(()=>inspectNativeGoldfishItemDelivery({root}));assert.equal(ownership.status,'observed',JSON.stringify(ownership));assert.equal(ownership.items[0].itemId,'AC-1');assert.equal(ownership.items[0].checkpoint.declaredPhase,'targeted-checks');assert.deepEqual(ownership.items[0].checkpoint.remainingClauses,['AC-1']);assert.ok(ownership.items[0].checkpointRef);
    const readiness=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));assert.equal(readiness.status,'observed',JSON.stringify(readiness));assert.deepEqual(readiness.integrated,[]);
    const duplicate=launch('ITEM-B','src/b.mjs','session-two');assert.equal(duplicate.reason,'item-delivery-owner-collision');
  })},

  {id:'NGHS11',name:'actual original approval continuation automatically creates and rebinds legacy queue without promoting old completion',run:()=>fixture(({root})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const prepare=()=>runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery,candidate:original.candidate,writeScope:['src/change.mjs']}));
    const created=prepare();assert.equal(created.status,'required',JSON.stringify(created));assert.equal(created.queue.slices.length,1);assert.equal(created.queue.slices[0].delivery.criteria[0],'AC-1');
    const unchanged=readFileSync(join(root,created.path));assert.equal(prepare().sha256,created.sha256);assert.deepEqual(readFileSync(join(root,created.path)),unchanged);
    const wrong=runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:{...itemDelivery,criterionLocator:{...original.criterionLocator,sourceSha256:'f'.repeat(64)}},candidate:original.candidate,writeScope:['src/change.mjs']}));assert.equal(wrong.status,'refused');assert.deepEqual(readFileSync(join(root,created.path)),unchanged);
    const basic=JSON.parse(readFileSync(join(root,created.path),'utf8'));basic.slices[0].delivery={itemId:itemDelivery.itemId,criteria:['AC-1'],baseCommit:original.candidate.commit};writeFileSync(join(root,created.path),JSON.stringify(basic));
    const rebound=prepare();assert.equal(rebound.status,'required',JSON.stringify(rebound));assert.equal(nativeManagedDigest(rebound.queue.slices[0].delivery.criterionLocator),nativeManagedDigest(original.criterionLocator),'actual original criterion mapping automatically rebinds old basic v2 without accepting its completed evidence');
    const legacy={schema:'pipeline.slice-queue.v1',feature:'unit',slices:[{id:'LEGACY-A',title:'Retained prior outcome',state:'ready',dependsOn:[],writeScope:['src/legacy.mjs'],tier:'implementor',commitMode:'diff-only',loadClass:'light'}]};
    const oldBytes=JSON.stringify(legacy);writeFileSync(join(root,created.path),oldBytes);
    const migrated=prepare();assert.equal(migrated.status,'required',JSON.stringify(migrated));assert.equal(migrated.queue.slices[0].state,'deferred');assert.equal(migrated.queue.slices[0].delivery.status,'unbound-legacy');assert.equal(migrated.queue.slices[1].id,itemDelivery.sliceId);
    const retained=join(root,'specs/unit',`.slice-queue-legacy-${nativeManagedDigest(oldBytes)}.json`);assert.equal(readFileSync(retained,'utf8'),oldBytes);
    const priorCwd=process.cwd();process.chdir(root);
    try {
      assert.equal(runCli(['validate']).exit,0,'governed consumer queue location is automatic');
      const unauthorized=runCli(['hold',itemDelivery.sliceId,'--external-reason','fixture hold']);assert.notEqual(unauthorized.exit,0,'unbranded caller cannot mutate productive queue');
      const held=runtime.run(()=>runCli(['hold',itemDelivery.sliceId,'--external-reason','fixture hold']));assert.equal(held.exit,0,JSON.stringify(held));
      const changed=JSON.parse(readFileSync(join(root,created.path),'utf8'));changed.slices.find(row=>row.id===itemDelivery.sliceId).writeScope=['src/foreign.mjs'];
      assert.throws(()=>runtime.run(()=>writeQueueAtomic(join(root,created.path),changed)),error=>error.code==='SQ-ITEM-QUEUE-CAS'||error.code==='SQ-ITEM-BINDING-AMENDMENT-REQUIRED');
      assert.deepEqual(JSON.parse(readFileSync(join(root,created.path),'utf8')).slices.find(row=>row.id===itemDelivery.sliceId).writeScope,['src/change.mjs']);
    } finally { process.chdir(priorCwd); }

  })},

  {id:'NGHS12',name:'controlled Source native return runs candidate-bound checks and only verified Main integration releases dependency readiness',run:()=>fixture(({root})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};

    const binding={...makeBinding({dispatchId:'DELIVER-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const before=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));assert.equal(before.status,'observed');assert.deepEqual(before.integrated,[]);
    writeFileSync(join(root,'src/change.mjs'),"export const value='expected'; // delivered implementation\n");
    const returned={...input,hook_event_name:'PostToolUse',tool_response:{status:'completed',resolvedModel:binding.model,content:[{type:'text',text:JSON.stringify({schema:'pipeline.native-goldfish-host-return.v1',dispatchId:binding.dispatchId,candidateCommit:binding.candidateCommit,outcome:'succeeded',report:'Implemented the original dependency behavior.',changedPaths:['src/change.mjs']})}]}};
    const finalized=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned}));assert.equal(finalized.status,'authored-commit-recorded',JSON.stringify(finalized));
    assert.equal(finalized.delivery?.status,'integration-pending',JSON.stringify(finalized));assert.equal(finalized.delivery?.checkStatus?.verdict,'passed',JSON.stringify(finalized));
    const queuePath=join(root,'specs/unit/slice-queue.json'),queue=JSON.parse(readFileSync(queuePath,'utf8'));
    queue.slices.push({id:'DEPENDENT',title:'Waiting dependency fixture',state:'ready',dependsOn:[itemDelivery.sliceId],writeScope:['src/dependent.mjs'],tier:'implementor',commitMode:'diff-only',loadClass:'light',delivery:{itemId:'AC-2',criteria:['AC-2'],baseCommit:original.candidate.commit}});
    writeFileSync(queuePath,JSON.stringify(queue,null,2)+'\n');
    const stillHeld=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));assert.deepEqual(stillHeld.integrated,[]);
    assert.equal(readyAndLive({queue,records:[],live:[],integrationReadiness:stillHeld.handle}).ready.includes('DEPENDENT'),false,'terminal completed cannot release the dependent');
    const integrated=runtime.run(()=>qualifyNativeGoldfishHookDelivery({root,result:finalized})).integration;assert.equal(integrated.status,'integrated',JSON.stringify(integrated));
    const observed=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));assert.equal(observed.status,'observed',JSON.stringify(observed));assert.deepEqual(observed.integrated,['ITEM-AC-1']);assert.equal(readyAndLive({queue,records:[],live:[],integrationReadiness:observed.handle}).ready.includes('DEPENDENT'),true,'genuine integrated Source evidence releases the dependent');
    const replayed=runtime.run(()=>integrateNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(replayed.status,'integrated',JSON.stringify(replayed));assert.equal(replayed.replayed,true);
    writeFileSync(join(root,'src/change.test.mjs'),"import test from 'node:test';test('weakened checker',()=>{});\n");
    const invalidated=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));assert.equal(invalidated.status,'refused',JSON.stringify(invalidated));
  })},

  {id:'NGHS13',name:'same retained Source item requalifies only actually impacted dependencies and rejects unchanged replay or checker weakening',run:()=>fixture(({root})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    mkdirSync(join(root,'src'),{recursive:true});
    writeFileSync(join(root,'src/steady.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,writeFileSync} from 'node:fs';test('unaffected check runs once',()=>{assert.equal(existsSync('.git/steady-check-ran'),false);writeFileSync('.git/steady-check-ran','actual initial check');});\n");
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']},{id:'unaffected',path:'src/steady.test.mjs',dependencies:['src/steady.test.mjs']}]};

    const binding={...makeBinding({dispatchId:'DELIVER-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const before=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));assert.equal(before.status,'observed');assert.deepEqual(before.integrated,[]);
    writeFileSync(join(root,'src/change.mjs'),"export const value='expected'; // delivered implementation\n");
    const returned={...input,hook_event_name:'PostToolUse',tool_response:{status:'completed',resolvedModel:binding.model,content:[{type:'text',text:JSON.stringify({schema:'pipeline.native-goldfish-host-return.v1',dispatchId:binding.dispatchId,candidateCommit:binding.candidateCommit,outcome:'succeeded',report:'Implemented the original dependency behavior.',changedPaths:['src/change.mjs']})}]}};
    const finalized=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned}));assert.equal(finalized.status,'authored-commit-recorded',JSON.stringify(finalized));
    assert.equal(finalized.delivery?.status,'integration-pending',JSON.stringify(finalized));assert.equal(finalized.delivery?.checkStatus?.verdict,'passed',JSON.stringify(finalized));
    const commit=message=>{assert.equal(spawnSync('git',['-C',root,'add','src/change.mjs','src/change.test.mjs']).status,0);assert.equal(spawnSync('git',['-C',root,'commit','-qm',message]).status,0);};
    const unchanged=runtime.run(()=>requalifyNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(unchanged.status,'unchanged',JSON.stringify(unchanged));assert.deepEqual(unchanged.executedCheckIds,[]);
    const forged=runtime.run(()=>requalifyNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256,evidence:{verdict:'passed'}}));assert.equal(forged.status,'refused');
    writeFileSync(join(root,'src/change.mjs'),"export const value='wrong after changed dependency';\n");commit('actual dependency change');
    const held=runtime.run(()=>integrateNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(held.status,'refused');assert.equal(held.reason,'native-item-impacted-dependency-check-required');
    const unauthorized=requalifyNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256});assert.equal(unauthorized.status,'refused');
    const failed=runtime.run(()=>requalifyNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(failed.status,'targeted-failed',JSON.stringify(failed));assert.deepEqual(failed.executedCheckIds,['criterion-one']);assert.deepEqual(failed.reusedCheckIds,['unaffected']);assert.equal(failed.revision,1);
    assert.deepEqual(runtime.run(()=>observeGovernedItemIntegrationReadiness({root})).integrated,[]);
    writeFileSync(join(root,'src/change.mjs'),"export const value='expected'; // same-owner dependency repair\n");commit('same item dependency repair');
    const repaired=runtime.run(()=>requalifyNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(repaired.status,'requalified',JSON.stringify(repaired));assert.equal(repaired.revision,2);assert.deepEqual(repaired.executedCheckIds,['criterion-one']);assert.deepEqual(repaired.reusedCheckIds,['unaffected']);
    const replay=runtime.run(()=>requalifyNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(replay.status,'unchanged');
    writeFileSync(join(root,'src/change.test.mjs'),"import test from 'node:test';test('weakened',()=>{});\n");commit('visible checker change');
    const weakened=runtime.run(()=>requalifyNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(weakened.status,'refused');assert.equal(weakened.reason,'native-item-check-source-amendment-required');
    writeFileSync(join(root,'src/change.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import {value} from './change.mjs';test('original criterion',()=>assert.equal(value,'expected'));\n");commit('retain original checker');
    const integrated=runtime.run(()=>integrateNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(integrated.status,'integrated',JSON.stringify(integrated));assert.deepEqual(runtime.run(()=>observeGovernedItemIntegrationReadiness({root})).integrated,['ITEM-AC-1']);
    const released=runtime.run(()=>requalifyNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(released.status,'refused');assert.equal(released.reason,'native-item-recheck-released-or-foreign');
  })},
  {id:'NGHS14',name:'same Source item extends its checked scope atomically without hiding collisions and real host adopts added paths',run:()=>fixture(({root,dependencies})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    mkdirSync(join(root,'src'),{recursive:true});writeFileSync(join(root,'src/additional.mjs'),"export const extra='expected';\n");writeFileSync(join(root,'src/blocked.mjs'),"export const blocked='expected';\n");
    writeFileSync(join(root,'src/additional.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import {extra} from './additional.mjs';test('additional checked dependency',()=>assert.equal(extra,'expected'));\n");
    const original=prepareApprovedItemCourseFixture({root}),repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']},{id:'additional',path:'src/additional.test.mjs',dependencies:['src/additional.mjs','src/additional.test.mjs','src/blocked.mjs']}]};
    const binding={...makeBinding({dispatchId:'DELIVER-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const queuePath=join(root,'specs/unit/slice-queue.json'),queue=JSON.parse(readFileSync(queuePath,'utf8'));queue.slices.push({id:'OTHER',title:'Actual other live reservation',state:'ready',dependsOn:[],writeScope:['src/blocked.mjs'],tier:'implementor',commitMode:'diff-only',loadClass:'light',delivery:{itemId:'AC-2',criteria:['AC-2'],baseCommit:original.candidate.commit}});writeFileSync(queuePath,JSON.stringify(queue,null,2)+'\n');
    const otherBinding={...makeBinding({dispatchId:'OTHER',commit:original.candidate.commit,tree:original.candidate.tree}),allowedPaths:['src/blocked.mjs']};const otherInput=toolInput('claude',{root,session:'other-session',toolUseId:'other-tool',binding:otherBinding});otherInput.tool_input.prompt+='\nSlice: OTHER\nWrite scope: src/blocked.mjs\n';
    const otherPrepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input:otherInput}));assert.equal(otherPrepared.ok,true,JSON.stringify(otherPrepared));
    const prior=readFileSync(queuePath),amend=additionalPaths=>runtime.run(()=>amendNativeGoldfishItemWriteScope({root,pendingSha256:prepared.sha256,additionalPaths}));
    const unauthorized=amendNativeGoldfishItemWriteScope({root,pendingSha256:prepared.sha256,additionalPaths:['src/additional.mjs']});assert.equal(unauthorized.status,'refused');assert.deepEqual(readFileSync(queuePath),prior);
    const collision=amend(['src/blocked.mjs']);assert.equal(collision.status,'refused',JSON.stringify(collision));assert.equal(collision.reason,'item-delivery-scope-collision');assert.deepEqual(readFileSync(queuePath),prior);
    const outside=amend(['src/unexamined.mjs']);assert.equal(outside.reason,'native-item-scope-check-contract-amendment-required');
    for(const path of ['C:\\src\\additional.mjs','../additional.mjs','src/**'])assert.equal(amend([path]).status,'refused');
    const forged=runtime.run(()=>amendNativeGoldfishItemWriteScope({root,pendingSha256:prepared.sha256,additionalPaths:['src/additional.mjs'],approved:true}));assert.equal(forged.status,'refused');
    const changed=amend(['src/additional.mjs']);assert.equal(changed.status,'amended',JSON.stringify(changed));assert.equal(changed.pendingSha256,prepared.sha256);assert.equal(changed.revision,1);
    const registeredPostimage=readFileSync(queuePath);
    writeFileSync(queuePath,prior); // interruption after authenticated wider reservation, before queue publication
    assert.equal(runtime.run(()=>readNativeGoldfishPending({commonDir:repository.commonDir,runner:'claude',sessionId:'native-session-one',correlationId:'native-tool-one'})).ok,false);
    const recovered=amend(['src/additional.mjs']);assert.equal(recovered.status,'amended',JSON.stringify(recovered));assert.equal(recovered.revision,1);assert.deepEqual(readFileSync(queuePath),registeredPostimage);
    const readback=runtime.run(()=>readNativeGoldfishPending({commonDir:repository.commonDir,runner:'claude',sessionId:'native-session-one',correlationId:'native-tool-one'}));assert.equal(readback.ok,true,JSON.stringify(readback));assert.deepEqual(readback.state.binding.allowedPaths,['src/additional.mjs','src/change.mjs']);assert.equal(readback.sha256,prepared.sha256);
    assert.equal(amend(['src/additional.mjs']).status,'unchanged');
    const hidden=JSON.parse(readFileSync(queuePath,'utf8'));hidden.slices.find(row=>row.id==='ITEM-AC-1').writeScope=['src/change.mjs'];hidden.slices.push({id:'HIDDEN',title:'Cannot hide amended scope',state:'ready',dependsOn:[],writeScope:['src/additional.mjs'],tier:'implementor',commitMode:'diff-only',loadClass:'light',delivery:{itemId:'AC-3',criteria:['AC-3'],baseCommit:original.candidate.commit}});writeFileSync(queuePath,JSON.stringify(hidden,null,2)+'\n');
    const hiddenBinding={...makeBinding({dispatchId:'HIDDEN',commit:original.candidate.commit,tree:original.candidate.tree}),allowedPaths:['src/additional.mjs']},hiddenInput=toolInput('claude',{root,session:'hidden-session',toolUseId:'hidden-tool',binding:hiddenBinding});hiddenInput.tool_input.prompt+='\nSlice: HIDDEN\nWrite scope: src/additional.mjs\n';
    const denied=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input:hiddenInput}));assert.equal(denied.ok,false);assert.equal(denied.reason,'item-delivery-scope-collision',JSON.stringify(denied));hidden.slices=hidden.slices.filter(row=>row.id!=='HIDDEN');hidden.slices.find(row=>row.id==='ITEM-AC-1').writeScope=['src/additional.mjs','src/change.mjs'];writeFileSync(queuePath,JSON.stringify(hidden,null,2)+'\n');
    writeFileSync(join(root,'src/change.mjs'),"export const value='expected'; // original owner delivery\n");writeFileSync(join(root,'src/additional.mjs'),"export const extra='expected'; // genuinely amended checked path\n");
    const returned={...input,hook_event_name:'PostToolUse',tool_response:{status:'completed',resolvedModel:binding.model,content:[{type:'text',text:JSON.stringify({schema:'pipeline.native-goldfish-host-return.v1',dispatchId:binding.dispatchId,candidateCommit:binding.candidateCommit,outcome:'succeeded',report:'Original item with its authenticated expanded scope.',changedPaths:['src/additional.mjs','src/change.mjs']})}]}};
    const finalized=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned}));assert.equal(finalized.status,'authored-commit-recorded',JSON.stringify({finalized,readback:runtime.run(()=>readNativeGoldfishPending({commonDir:repository.commonDir,runner:'claude',sessionId:'native-session-one',correlationId:'native-tool-one'}))}));assert.equal(finalized.delivery?.checkStatus?.verdict,'passed',JSON.stringify(finalized));
    const integrated=runtime.run(()=>integrateNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256}));assert.equal(integrated.status,'integrated',JSON.stringify(integrated));assert.deepEqual(runtime.run(()=>observeGovernedItemIntegrationReadiness({root})).integrated,['ITEM-AC-1']);assert.equal(amend(['src/blocked.mjs']).status,'refused');
  })},
  {id:'NGHS15',name:'caller write-scope prose cannot exempt a writable Goldfish dispatch from governed item admission',run:()=>{
    for(const prompt of ['Write scope: none','**Write scope:** none','- Write scope: none','Write scope: src/file.mjs'])assert.equal(requiresGovernedItemAdmission({role:'goldfish',prompt}),true);
    for(const role of ['critic','advisor',null])assert.equal(requiresGovernedItemAdmission({role,prompt:'Write scope: none'}),false);
  }},
  {id:'NGHS16',name:'actual approved original criterion aliases cannot acquire another owner and independent queue preparation preserves first native return custody',run:()=>fixture(({root})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    mkdirSync(join(root,'src'),{recursive:true});for(const name of ['second','alias']){writeFileSync(join(root,`src/${name}.mjs`),"export const value='expected';\n");writeFileSync(join(root,`src/${name}.test.mjs`),`import test from 'node:test';import assert from 'node:assert/strict';import {value} from './${name}.mjs';test('separate examined dependency',()=>assert.equal(value,'expected'));\n`);}
    const original=prepareApprovedItemCourseFixture({root,additionalCriteria:[{id:'AC-2',text:'The separate dependency returns expected bytes.'}]}),repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
    const launch=(id,itemId,locator,path,correlation)=>{const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:id,itemId,criterionLocator:locator,checks:[{id:'original-criterion',path:`src/${path}.test.mjs`,dependencies:[`src/${path}.mjs`,`src/${path}.test.mjs`]}]};const binding={...makeBinding({dispatchId:id,commit:original.candidate.commit,tree:original.candidate.tree}),allowedPaths:[`src/${path}.mjs`],schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};const input=toolInput('claude',{root,session:`session-${id}`,toolUseId:correlation,binding});input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+`\nSlice: ${id}\nWrite scope: src/${path}.mjs\n`;return {input,binding,prepared:runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}))};};
    const first=launch('FIRST','AC-1',original.criterionLocator,'change','first-tool');assert.equal(first.prepared.ok,true,JSON.stringify(first.prepared));
    const alias=launch('ALIAS','ALIAS-LABEL',original.criterionLocator,'alias','alias-tool');assert.equal(alias.prepared.ok,false);assert.equal(alias.prepared.reason,'item-delivery-criterion-owner-collision',JSON.stringify(alias.prepared));assert.match(JSON.stringify(alias.prepared),/bind the same item criterion cannot run at the same time/u,'PF-66: the refusal teaches why two disjoint-scope slices collide and how to serialise them');
    const second=launch('SECOND','AC-2',original.criterionLocators['AC-2'],'second','second-tool');assert.equal(second.prepared.ok,true,JSON.stringify(second.prepared));
    const readback=runtime.run(()=>readNativeGoldfishPending({commonDir:repository.commonDir,runner:'claude',sessionId:'session-FIRST',correlationId:'first-tool'}));assert.equal(readback.ok,true,JSON.stringify(readback));assert.equal(readback.sha256,first.prepared.sha256);
    // Only runtime metadata gained rows; the first item's original approved
    // criterion/checks/scope and all other untracked baseline bytes stay bound.
    const queuePath=join(root,'specs/unit/slice-queue.json'),queue=JSON.parse(readFileSync(queuePath,'utf8')),tampered=structuredClone(queue);tampered.slices.find(row=>row.id==='FIRST').delivery.checks[0].dependencies=['src/alias.mjs'];writeFileSync(queuePath,JSON.stringify(tampered,null,2)+'\n');assert.equal(runtime.run(()=>readNativeGoldfishPending({commonDir:repository.commonDir,runner:'claude',sessionId:'session-FIRST',correlationId:'first-tool'})).ok,false);writeFileSync(queuePath,JSON.stringify(queue,null,2)+'\n');
    writeFileSync(join(root,'src/change.mjs'),"export const value='expected'; // independently delivered first item\n");
    const returned={...first.input,hook_event_name:'PostToolUse',tool_response:{status:'completed',resolvedModel:first.binding.model,content:[{type:'text',text:JSON.stringify({schema:'pipeline.native-goldfish-host-return.v1',dispatchId:first.binding.dispatchId,candidateCommit:first.binding.candidateCommit,outcome:'succeeded',report:'First original outcome; second admitted separately.',changedPaths:['src/change.mjs']})}]}};
    const finalized=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned}));assert.equal(finalized.status,'authored-commit-recorded',JSON.stringify(finalized));assert.equal(finalized.delivery?.checkStatus?.verdict,'passed');assert.equal(runtime.run(()=>integrateNativeGoldfishItemDelivery({root,pendingSha256:first.prepared.sha256})).status,'integrated');
    const inventory=runtime.run(()=>inspectNativeGoldfishItemDelivery({root}));assert.equal(inventory.items.find(row=>row.itemId==='AC-2').phase,'active','another admitted item remains held and cannot be called completed');
  })},

  {id:'NGHS17',name:'two genuine original items author simultaneously and return in either order without admitting unowned dirty paths or HEAD advances',run:()=>{
    for(const order of [['LEFT','RIGHT'],['RIGHT','LEFT']])fixture(({root})=>{
      const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')}),plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit original course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
      mkdirSync(join(root,'src'),{recursive:true});writeFileSync(join(root,'src/second.mjs'),"export const value='expected';\n");writeFileSync(join(root,'src/second.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import {value} from './second.mjs';test('second original criterion',()=>assert.equal(value,'expected'));\n");
      if(order[0]==='RIGHT'){mkdirSync(join(root,'specs/unit'),{recursive:true});writeFileSync(join(root,'specs/unit/slice-queue.json'),JSON.stringify({schema:'pipeline.slice-queue.v1',feature:'unit',slices:[]},null,2)+'\n');}
      const original=prepareApprovedItemCourseFixture({root,additionalCriteria:[{id:'AC-2',text:'The independent second dependency returns expected bytes.'}]}),repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/parallel-original'),sessionId:'parallel-original-owner'});
      initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
      const items={};
      for(const [id,path,locator] of [['LEFT','change',original.criterionLocator],['RIGHT','second',original.criterionLocators['AC-2']]]){
        const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:id,itemId:id,criterionLocator:locator,checks:[{id:'original-criterion',path:`src/${path}.test.mjs`,dependencies:[`src/${path}.mjs`,`src/${path}.test.mjs`]}]},binding={...makeBinding({dispatchId:id,commit:original.candidate.commit,tree:original.candidate.tree}),allowedPaths:[`src/${path}.mjs`],schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
        const input=toolInput('claude',{root,session:`session-${id}`,toolUseId:`tool-${id}`,binding});input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+`\nSlice: ${id}\nWrite scope: src/${path}.mjs\n`;
        const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));assert.equal(prepared.ok,true,JSON.stringify(prepared));items[id]={binding,input,prepared,path};
      }
      for(const item of Object.values(items))writeFileSync(join(root,`src/${item.path}.mjs`),`export const value='expected'; // ${item.binding.dispatchId} simultaneous author\n`);
      const returned=id=>{const item=items[id];return {...item.input,hook_event_name:'PostToolUse',tool_response:{status:'completed',resolvedModel:item.binding.model,content:[{type:'text',text:JSON.stringify({schema:'pipeline.native-goldfish-host-return.v1',dispatchId:id,candidateCommit:item.binding.candidateCommit,outcome:'succeeded',report:'Genuine independent approved item completed.',changedPaths:[`src/${item.path}.mjs`]})}]}};};
      const originalPending=runtime.run(()=>readNativeGoldfishPending({commonDir:repository.commonDir,runner:'claude',sessionId:`session-${order[0]}`,correlationId:`tool-${order[0]}`}));
      const priorStrict=assessAgyHostCommit({baseline:{...originalPending.state.baseline,schema:'pipeline.agy-host-commit-baseline.v1'},final:{changedPaths:[`src/${items[order[0]].path}.mjs`]},allowedPaths:[`src/${items[order[0]].path}.mjs`]});assert.equal(priorStrict.code,'AGY-HOST-COMMIT-PATH-MISMATCH','unchanged strict baseline examiner demonstrates the actual previously blocked simultaneous product edits');
      writeFileSync(join(root,'unowned.txt'),'not owned by any retained original item');
      const rejected=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned(order[0])}));assert.notEqual(rejected.status,'authored-commit-recorded');assert.equal(spawnSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),original.candidate.commit,'unowned dirty path cannot advance HEAD');rmSync(join(root,'unowned.txt'));
      const first=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned(order[0])}));assert.equal(first.status,'authored-commit-recorded',JSON.stringify(first));assert.equal(first.delivery.checkStatus.verdict,'passed');
      assert.equal(readFileSync(join(root,`src/${items[order[1]].path}.mjs`),'utf8').includes('simultaneous author'),true,'other genuine owner dirty product remains untouched');
      const second=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned(order[1])}));assert.equal(second.status,'authored-commit-recorded',JSON.stringify(second));assert.equal(second.delivery.checkStatus.verdict,'passed');assert.equal(spawnSync('git',['-C',root,'rev-parse',`${second.commit}^`],{encoding:'utf8'}).stdout.trim(),first.commit,'second parent is actual Source-authored first return');
      for(const id of order)assert.equal(runtime.run(()=>integrateNativeGoldfishItemDelivery({root,pendingSha256:items[id].prepared.sha256})).status,'integrated');
      if(order[0]==='RIGHT'){assert.equal(JSON.parse(spawnSync('git',['-C',root,'show','HEAD:specs/unit/slice-queue.json'],{encoding:'utf8'}).stdout).schema,'pipeline.slice-queue.v1','host product commits never stage governed queue metadata');assert.equal(JSON.parse(readFileSync(join(root,'specs/unit/slice-queue.json'),'utf8')).schema,'pipeline.slice-queue.v2','authenticated course writer migrated tracked runtime queue in place');}
    });
  }},

  {id:'NGHS18',name:'native concurrency rejects fabricated foreign authority, expired custody, aliased roots, other repositories and unauthenticated HEAD commits',run:()=>fixture(({root})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')}),plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit original course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root}),repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/concurrent-negatives'),sessionId:'concurrent-original-owner'});initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ONLY',itemId:'ONLY',criterionLocator:original.criterionLocator,checks:[{id:'original-criterion',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]},binding={...makeBinding({dispatchId:'ONLY',commit:original.candidate.commit,tree:original.candidate.tree}),allowedPaths:['src/change.mjs'],schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery},input=toolInput('claude',{root,session:'only-session',toolUseId:'only-tool',binding});input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ONLY\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const pending=runtime.run(()=>readNativeGoldfishPending({commonDir:repository.commonDir,runner:'claude',sessionId:'only-session',correlationId:'only-tool'}));
    assert.throws(()=>assessSourceOwnedNativeHostCommit({baseline:pending.state.baseline,final:{changedPaths:['src/change.mjs']},allowedPaths:['src/change.mjs'],authority:{foreignPaths:['unowned.txt'],parentCommit:original.candidate.commit}}));
    assert.throws(()=>withSourceOwnedNativeConcurrentCommit({root,pendingSha256:prepared.sha256},()=>{}),'an unauthenticated caller cannot acquire the Source mutex authority');
    let expired;const alias=join(root,'alias-root');symlinkSync(root,alias,'dir');
    runtime.run(()=>withSourceOwnedNativeConcurrentCommit({root,pendingSha256:prepared.sha256},authority=>{expired=authority;assert.throws(()=>inspectSourceOwnedNativeConcurrentAuthority(authority,{root:alias}));assert.throws(()=>inspectSourceOwnedNativeConcurrentAuthority(authority,{root:join(root,'other-repository')}));assert.equal(inspectSourceOwnedNativeConcurrentAuthority(authority,{root}).parentCommit,original.candidate.commit);}));rmSync(alias);
    assert.throws(()=>inspectSourceOwnedNativeConcurrentAuthority(expired,{root}),'the borrowed authority expires when its actual boundary returns');
    const originalRef=spawnSync('git',['-C',root,'symbolic-ref','HEAD'],{encoding:'utf8'}).stdout.trim();assert.equal(spawnSync('git',['-C',root,'update-ref','refs/heads/aliased-primary',original.candidate.commit]).status,0);assert.equal(spawnSync('git',['-C',root,'symbolic-ref','HEAD','refs/heads/aliased-primary']).status,0);
    assert.throws(()=>runtime.run(()=>withSourceOwnedNativeConcurrentCommit({root,pendingSha256:prepared.sha256},()=>{})),error=>error.reason==='native-concurrent-reference-drift','an alias branch with equal commit cannot replace the admitted primary ref');assert.equal(spawnSync('git',['-C',root,'symbolic-ref','HEAD',originalRef]).status,0);
    writeFileSync(join(root,'unowned.txt'),'unauthenticated HEAD change');assert.equal(spawnSync('git',['-C',root,'add','unowned.txt']).status,0);assert.equal(spawnSync('git',['-C',root,'commit','-qm','unauthenticated foreign change']).status,0);
    assert.throws(()=>runtime.run(()=>withSourceOwnedNativeConcurrentCommit({root,pendingSha256:prepared.sha256},()=>{})),error=>error.reason==='native-concurrent-unowned-head','HEAD ancestry alone cannot substitute for a genuine Source return');
  })},


  {id:'NGHS19',name:'closed native v2 requires delivery even after additive v3 and canonical fixtures remain inside their actual outer Git checkout',run:()=>fixture(({root})=>{
    const parent=nativeContractFixtureParent(),outerRepository=nativeContractFixtureRepositoryRoot();assert.equal(parent,join(outerRepository,'scratch','native-goldfish-contract-fixtures'));assert.notEqual(outerRepository,root);assert.ok(root.startsWith(join(parent,'native-goldfish-host-state-')));
    const cwd=process.cwd();process.chdir(root);try{assert.equal(nativeContractFixtureParent(),parent,'fixture parent binds actual module Git checkout, not caller cwd');assert.equal(nativeContractFixtureRepositoryRoot(),outerRepository);}finally{process.chdir(cwd);}
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')}),plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture original selection'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root}),repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/closed-native-v2'),sessionId:'closed-native-v2-owner'});
    const ports=createSessionAuthorityParticipantPorts({repository});initializeSessionAuthorityRegistry({repository},ports);
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'original-criterion',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const binding={...makeBinding({dispatchId:'ITEM-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),allowedPaths:['src/change.mjs'],schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery},input=toolInput('claude',{root,session:'closed-v2-session',toolUseId:'closed-v2-tool',binding});input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const pendingPath=join(repository.commonDir,prepared.path),originalBytes=readFileSync(pendingPath),state=JSON.parse(originalBytes);assert.equal(state.schema,'pipeline.native-goldfish-host-state.v2');assert.ok(state.delivery);
    const port=ports.find(row=>row.producerId==='native-goldfish').port;
    assert.doesNotThrow(()=>port.readBaseline());
    try {
      for(const disposition of ['missing','null']) {
        const damaged={...state};if(disposition==='missing')delete damaged.delivery;else damaged.delivery=null;
        writeFileSync(pendingPath,JSON.stringify(damaged)+'\n');
        assert.throws(()=>port.readBaseline(),error=>error.reason==='native-item-delivery-shape',`${disposition} delivery must fail the original closed v2 shape before any Source recovery`);
        writeFileSync(pendingPath,originalBytes);assert.doesNotThrow(()=>port.readBaseline(),'restoring the original authenticated bytes restores original readiness');
      }
    } finally {writeFileSync(pendingPath,originalBytes);}
  })},

  {id:'NGHS20',name:'T6-A Claude hook-observed session owner lets governed admission create the queue only inside its own entered scope',run:()=>fixture(({root})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root);
    initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const prepare=()=>prepareGovernedItemQueue({root,itemDelivery,candidate:original.candidate,writeScope:['src/change.mjs']});
    const sessionId='0f6c2c1e-5b7a-4d1e-9a3b-7c2d1e0f9a8b',queuePath=join(root,'specs/unit/slice-queue.json');
    try {
      // Original behavior: a hook process has no in-process requester, so admission refuses.
      const unbound=prepare();assert.equal(unbound.status,'refused',JSON.stringify(unbound));assert.equal(unbound.reason,'item-course-requester-unavailable');assert.equal(existsSync(queuePath),false);
      assert.equal(nativeManagedCurrentOwner(repository).association.state,'unbound');
      // Unusable hook identity binds nothing.
      assert.equal(enterClaudeHookSessionOwner({root,input:{session_id:'../escape'}}),false);assert.equal(prepare().reason,'item-course-requester-unavailable');
      // A different repository root never binds this repository.
      const foreign=mkdtempSync(join(nativeContractFixtureParent(),'claude-hook-foreign-'));
      try { assert.equal(enterClaudeHookSessionOwner({root:foreign,input:{session_id:sessionId}}),true);assert.equal(readClaudeHookSessionOwner({repository}),null);assert.equal(nativeManagedCurrentOwner(repository).association.state,'unbound'); }
      finally { rmSync(foreign,{recursive:true,force:true}); }
      // Own entered scope: a private descriptor is created once and admission proceeds.
      assert.equal(enterClaudeHookSessionOwner({root,input:{session_id:sessionId}}),true);
      const owner=nativeManagedCurrentOwner(repository);assert.equal(owner.association.state,'bound',JSON.stringify(owner));
      assert.equal(owner.association.target.sessionId,`claude-${sessionId}`);assert.equal(owner.assurance,'physical-readback');assert.equal(owner.ownerSource,CLAUDE_HOOK_SESSION_OWNER_SOURCE);
      const descriptor=JSON.parse(readFileSync(join(repository.commonDir,'agent-pipeline/session-descriptors/active',`claude-${sessionId}.json`),'utf8'));
      assert.equal(descriptor.ownerRuntime,null,'transient hook process records no owner pid');
      assert.deepEqual(nativeManagedCurrentOwner(repository).association,owner.association,'a later read reuses the same descriptor and nonce');
      const created=prepare();assert.equal(created.status,'required',JSON.stringify(created));assert.equal(created.queue.slices[0].id,'ITEM-AC-1');assert.equal(created.queue.slices[0].delivery.criteria[0],'AC-1');
      // Approval/criterion binding is unchanged by the owner source.
      const wrong=prepareGovernedItemQueue({root,itemDelivery:{...itemDelivery,criterionLocator:{...original.criterionLocator,sourceSha256:'f'.repeat(64)}},candidate:original.candidate,writeScope:['src/change.mjs']});assert.equal(wrong.status,'refused');
      // Leaving the scope restores the original refusal.
      leaveClaudeHookSessionOwner();assert.equal(nativeManagedCurrentOwner(repository).association.state,'unbound');
    } finally { leaveClaudeHookSessionOwner(); }
  })},

  {id:'NGHS21',name:'approved feature without a slice queue reports a typed absent course naming the course writer, while an unsafe queue file still fails closed',run:()=>fixture(({root})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});
    const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit selection'});
    assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    mkdirSync(join(root,'.claude'));mkdirSync(join(root,'specs/unit'),{recursive:true});
    writeFileSync(join(root,'.claude/pipeline.yaml'),'schema: pipeline.manifest.v0\n');
    writeFileSync(join(root,'.claude/pipeline-state.json'),JSON.stringify({schema:'pipeline.state.v0',activeFeature:{id:'unit',planPath:'specs/unit/plan.md',phase:'implementation'},planApproved:true}));
    const absent=resolveGovernedItemQueue({root});
    assert.equal(absent.status,'refused');assert.equal(absent.code,'SQ-DELIVERY-COURSE-ABSENT');
    assert.match(absent.repair,/prepareGovernedItemQueue/u);
    symlinkSync(join(root,'nowhere.json'),join(root,'specs/unit/slice-queue.json'));
    const unsafe=resolveGovernedItemQueue({root});
    assert.equal(unsafe.status,'refused');assert.equal(unsafe.code,'SQ-DELIVERY-STATE-UNAVAILABLE');
  })},

  {id:'NGHS22',name:'accepted criterion parser binds numbered and R-n rows of a two-column table under a German acceptance heading and keeps fail-closed boundaries',run:()=>{
    const critic='The package must receive a passing verdict from an independent critic before acceptance.';
    const locate=(text,cell)=>{
      const bytes=Buffer.from(text),start=bytes.indexOf(Buffer.from(cell));assert.ok(start>=0);
      return {bytes,locator:{schema:'pipeline.critic-criterion-locator.v1',sourcePath:'specs/unit/spec.md',sourceSha256:createHash('sha256').update(bytes).digest('hex'),
        criterionId:'',startByte:start,endByte:start+Buffer.byteLength(cell),excerptSha256:createHash('sha256').update(cell).digest('hex')}};
    };
    const parse=(text,cell,criterionId)=>{
      const {bytes,locator}=locate(text,cell);
      return parseAcceptedCriticCriterion({sourceBytes:bytes,locator:{...locator,criterionId},packageContext:{featureId:'unit',sourceBindings:[{path:'specs/unit/spec.md',sha256:locator.sourceSha256,role:'spec'}]}});
    };
    const german=`# Spezifikation\n\n## Abnahmekriterien\n\n| # | Kriterium |\n|---|---|\n| 1 | ${critic} |\n| R-2 | Die Anzeige ist lesbar. |\n`;
    const numbered=parse(german,critic,'AC-1');
    assert.equal(numbered.status,'explicit-actual-independent-pass',JSON.stringify(numbered));
    const requirement=parse(german,'Die Anzeige ist lesbar.','AC-2');
    assert.equal(requirement.status,'no-explicit-criterion',JSON.stringify(requirement));
    // A non-normative heading, a duplicate numbering and a wrong locator never bind.
    assert.equal(parse(german.replace('## Abnahmekriterien','## Beispiele'),critic,'AC-1').status,'unsupported-or-ambiguous');
    assert.equal(parse(german.replace('| R-2 |','| R-1 |'),critic,'AC-1').status,'unsupported-or-ambiguous');
    assert.equal(parse(german,critic,'AC-2').status,'unsupported-or-ambiguous');
    // The existing English three-column form keeps working.
    const english=`# Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | ${critic} | review |\n`;
    assert.equal(parse(english,critic,'AC-1').status,'explicit-actual-independent-pass');
  }},

  {id:'NGHS23',name:'a delivery course larger than 1 MiB stays readable, and one beyond the shared slice-queue bound is refused with its own typed code',run:()=>fixture(({root})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});
    const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit selection'});
    assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    mkdirSync(join(root,'.claude'));mkdirSync(join(root,'specs/unit'),{recursive:true});
    writeFileSync(join(root,'.claude/pipeline.yaml'),'schema: pipeline.manifest.v0\n');
    writeFileSync(join(root,'.claude/pipeline-state.json'),JSON.stringify({schema:'pipeline.state.v0',activeFeature:{id:'unit',planPath:'specs/unit/plan.md',phase:'implementation'},planApproved:true}));
    const queuePath=join(root,'specs/unit/slice-queue.json');
    const body=JSON.stringify({schema:'pipeline.slice-queue.v2',feature:'unit',slices:[]});
    writeFileSync(queuePath,`{${' '.repeat(1024*1024+4096)}${body.slice(1)}`,{mode:0o600});
    const large=resolveGovernedItemQueue({root});
    assert.equal(large.status,'required',JSON.stringify(large));
    writeFileSync(queuePath,`{${' '.repeat(SLICE_QUEUE_MAX_BYTES)}${body.slice(1)}`,{mode:0o600});
    const oversized=resolveGovernedItemQueue({root});
    assert.equal(oversized.status,'refused');assert.equal(oversized.code,'SQ-DELIVERY-QUEUE-TOO-LARGE');
    assert.match(oversized.repair,/slice-queue size bound/u);
  })},

  { id: "NGHS24", name: "an explicit Claude run_in_background: true is admitted only with the strictly-boolean SubagentStop completion-route fact; every other launch is unchanged", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const commonDir = join(root, ".git");
    const stateDirectory = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit");
    const pendingFiles = () => existsSync(stateDirectory) ? readdirSync(stateDirectory).filter((name) => name.startsWith("pending-")) : [];
    const deps = { ...dependencies, nowEpochMs: () => 1_700_000_000_000 };
    const binding = makeBinding({ dispatchId: "TASK-BG-1", commit, tree });
    const launch = (session, toolUseId, background) => {
      const input = toolInput("claude", { root, session, toolUseId, binding });
      if (background === undefined) delete input.tool_input.run_in_background; else input.tool_input.run_in_background = background;
      return input;
    };
    // Explicit background without the fact, or with anything but the boolean true, is refused exactly as before and writes nothing.
    const unregistered = [["absent", undefined], ["false", false], ["string true", "true"], ["number one", 1], ["null", null], ["object", {}], ["array", [true]]];
    for (const [label, fact] of unregistered) {
      const options = fact === undefined ? {} : { subagentStopCompletionRegistered: fact };
      const refused = prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(`s-${label.replace(/\W+/gu, "-")}`, `t-${label.replace(/\W+/gu, "-")}`, true), ...options }, deps);
      assert.equal(refused.ok, false, `${label}: ${JSON.stringify(refused)}`);
      assert.equal(refused.code, "NGHS-CLAUDE-FOREGROUND-REQUIRED", label);
    }
    assert.deepEqual(pendingFiles(), [], "a refused background launch must leave no pending state");
    // D19 (PF-26): a missing run_in_background key is refused WITHOUT the completion-route fact (NGHS02 unchanged) ...
    const keylessRefused = prepareNativeGoldfishHostState({ root, runner: "claude", input: launch("s-keyless-refused", "t-keyless-refused", undefined) }, deps);
    assert.equal(keylessRefused.code, "NGHS-CLAUDE-FOREGROUND-REQUIRED");
    assert.deepEqual(pendingFiles(), []);
    // ... and, WITH the registered fact, takes the SubagentStop route exactly like an explicit true.
    const keyless = prepareNativeGoldfishHostState({ root, runner: "claude", input: launch("s-keyless", "t-keyless", undefined), subagentStopCompletionRegistered: true }, deps);
    assert.equal(keyless.ok, true, JSON.stringify(keyless));
    assert.equal(pendingFiles().length, 1);
    const keylessReadback = readNativeGoldfishPending({ commonDir, runner: "claude", sessionId: "s-keyless", correlationId: "t-keyless" });
    assert.equal(keylessReadback.ok, true, keylessReadback.code);
    assert.equal(keylessReadback.state.completionRoute, "subagent-stop");
    // Explicit background plus the registered fact is admitted and records the one exact discriminator.
    const admitted = prepareNativeGoldfishHostState({ root, runner: "claude", input: launch("s-bg", "t-bg", true), subagentStopCompletionRegistered: true }, deps);
    assert.equal(admitted.ok, true, JSON.stringify(admitted));
    assert.equal(pendingFiles().length, 2);
    const readback = readNativeGoldfishPending({ commonDir, runner: "claude", sessionId: "s-bg", correlationId: "t-bg" });
    assert.equal(readback.ok, true, readback.code);
    assert.equal(readback.state.completionRoute, "subagent-stop");
    assert.equal(readback.state.binding.dispatchId, binding.dispatchId);
    // Foreground pending state is byte-identical whether or not the fact is passed: no discriminator, no other drift.
    const plain = prepareNativeGoldfishHostState({ root, runner: "claude", input: launch("s-fg-a", "t-fg-a", false) }, deps);
    const withFact = prepareNativeGoldfishHostState({ root, runner: "claude", input: launch("s-fg-b", "t-fg-b", false), subagentStopCompletionRegistered: true }, deps);
    assert.equal(plain.ok, true, plain.code); assert.equal(withFact.ok, true, withFact.code);
    const read = (session, tool) => readNativeGoldfishPending({ commonDir, runner: "claude", sessionId: session, correlationId: tool }).state;
    const first = read("s-fg-a", "t-fg-a"), second = read("s-fg-b", "t-fg-b");
    assert.equal(Object.hasOwn(first, "completionRoute"), false);
    assert.equal(Object.hasOwn(second, "completionRoute"), false);
    assert.equal(JSON.stringify({ ...second, sessionId: first.sessionId, toolUseId: first.toolUseId }), JSON.stringify(first));
  }) },

  { id: "NGHS25", name: "a slice is integrated only on its own Goldfish Dispatch trailer in base..candidate touching its write scope; a stopped attempt is superseded only by an integrated same-item successor (D40, D40a, D40b)", run: () => fixture(({ root }) => {
    const git = (...args) => { const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
    const commitFile = (path, body, ...paragraphs) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), body); git("add", path); git("commit", "-q", "-m", `fixture ${path}`, ...paragraphs.flatMap(p => ["-m", p])); return git("rev-parse", "HEAD"); };
    const base = git("rev-parse", "HEAD");
    commitFile("src/a.mjs", "a1\n", "AI-Assisted: true\nDispatch: S-A (goldfish)\nCommit-Act: orchestrator");
    commitFile("src/b.mjs", "b1\n", "AI-Assisted: true\nDispatch: S-B (goldfish)");
    commitFile("src/ele.mjs", "l1\n", "AI-Assisted: true\nDispatch: S-ELE (elephant)");
    commitFile("src/c.mjs", "c1\n", "AI-Assisted: true\nDispatch: S-OTHER (goldfish)\nCommit-Act: orchestrator");
    commitFile("src/unrelated.mjs", "u1\n", "AI-Assisted: true\nDispatch: S-D (goldfish)\nCommit-Act: orchestrator");
    commitFile("src/e.mjs", "e1\n", "AI-Assisted: true\nDispatch: S-E (goldfish)\nCommit-Act: orchestrator");
    const afterE = git("rev-parse", "HEAD");
    commitFile("src/h.mjs", "h1\n", "AI-Assisted: true\nDispatch: S-H1 (goldfish)\nDispatch: S-H2 (goldfish)\nDispatch: S-UNRELATED-BASE (goldfish)\nCommit-Act: orchestrator");
    commitFile("src/x.mjs", "x1\n", "AI-Assisted: true\nDispatch: S-CANCELLED (goldfish)\nDispatch: S-CRITIC (goldfish)\nCommit-Act: orchestrator");
    git("checkout", "-q", "-b", "unrelated", base);
    const unrelated = commitFile("src/unrelated-base.mjs", "r1\n");
    git("checkout", "-q", "-");
    git("checkout", "-q", "-b", "merged");
    commitFile("src/m-side.mjs", "m0\n");
    git("checkout", "-q", "-");
    commitFile("src/m-main.mjs", "m1\n");
    git("merge", "-q", "--no-ff", "merged", "-m", "fixture merge", "-m", "Dispatch: S-M (goldfish)\nCommit-Act: orchestrator");
    git("checkout", "-q", "-b", "side");
    commitFile("src/f.mjs", "f1\n", "AI-Assisted: true\nDispatch: S-F (goldfish)\nCommit-Act: orchestrator");
    git("checkout", "-q", "-");
    const candidate = git("rev-parse", "HEAD");
    const slice = (id, writeScope, extra = {}) => ({ id, state: "ready", dependsOn: [], writeScope, tier: "implementor", delivery: { itemId: `item-${id}`, criteria: ["AC-1"], baseCommit: base }, ...extra });
    const slices = [
      slice("S-A", ["src/a.mjs"]),
      slice("S-B", ["src/b.mjs"]),
      slice("S-C", ["src/c.mjs"]),
      slice("S-D", ["src/d.mjs"]),
      slice("S-E", ["src/e.mjs"], { delivery: { itemId: "item-S-E", criteria: ["AC-1"], baseCommit: afterE } }),
      slice("S-F", ["src/f.mjs"]),
      slice("S-G", ["src/g.mjs"], { delivery: { itemId: "item-S-G", criteria: ["AC-1"], baseCommit: "0".repeat(40) } }),
      slice("STOPPED", ["src/a.mjs"], { delivery: { itemId: "item-S-A", criteria: ["AC-1"], baseCommit: base } }),
      slice("STOPPED-OTHER-ITEM", ["src/a.mjs"]),
      slice("S-ELE", ["src/ele.mjs"]),
      slice("STOPPED-NO-SUCCESSOR", ["src/ele.mjs"], { delivery: { itemId: "item-S-ELE", criteria: ["AC-1"], baseCommit: base } }),
      slice("S-H1", ["src/h.mjs"]),
      slice("S-H2", ["src/h.mjs"]),
      slice("S-CANCELLED", ["src/x.mjs"], { state: "cancelled", holdReason: "fixture" }),
      slice("S-CRITIC", ["src/x.mjs"], { tier: "critic" }),
      slice("S-UNRELATED-BASE", ["src/h.mjs"], { delivery: { itemId: "item-S-UNRELATED-BASE", criteria: ["AC-1"], baseCommit: unrelated } }),
      slice("S-M", ["src/m-side.mjs", "src/m-main.mjs"]),
      slice("HELD-PREDECESSOR", ["src/a.mjs"], { state: "hold-po", holdReason: "fixture", delivery: { itemId: "item-S-A", criteria: ["AC-1"], baseCommit: base } }),
    ];
    slices[0].dependsOn = ["STOPPED", "STOPPED-OTHER-ITEM", "HELD-PREDECESSOR"];
    slices.find(row => row.id === "S-ELE").dependsOn = ["STOPPED-NO-SUCCESSOR"];
    const integrated = readOrchestratorCommitIntegratedSlices({ root, candidateCommit: candidate, slices });
    assert.deepEqual([...integrated].sort(), ["S-A", "S-B", "S-H1", "S-H2", "STOPPED"], JSON.stringify(integrated));
    // S-B was committed by the Goldfish itself (Dispatch, no Commit-Act) and counts (D40b);
    // S-ELE's commit carries an Elephant Dispatch trailer and does not count.
    // S-C's commit names another slice, S-D's commit misses its write scope,
    // S-E's commit is its own base (not strictly after it), S-F's commit is not reachable from the candidate,
    // S-G's base is unknown, S-UNRELATED-BASE's base is not an ancestor of the qualifying commit,
    // S-CANCELLED and S-CRITIC are never released, and the merge commit naming S-M does not count.
    // Several Dispatch trailers on one commit release each named slice (S-H1, S-H2).
    // STOPPED-OTHER-ITEM has a different item; STOPPED-NO-SUCCESSOR's same-item successor S-ELE is not integrated;
    // HELD-PREDECESSOR is not `ready`, so a same-item successor does not supersede it.
    assert.deepEqual(readOrchestratorCommitIntegratedSlices({ root, candidateCommit: base, slices }), [], "nothing after the base is visible from the base itself");
    assert.deepEqual(readOrchestratorCommitIntegratedSlices({ root, candidateCommit: "not-a-commit", slices }), [], "a malformed candidate releases nothing and does not throw");
    assert.deepEqual(readOrchestratorCommitIntegratedSlices({ root, candidateCommit: "f".repeat(40), slices }), [], "a git fault on an absent candidate releases nothing and does not throw");
  }) },

  { id: "NGHS26", name: "only the never-created session-authority catalogue counts as an absent native registry; any other fault still refuses readiness (PF-41)", run: () => fixture(({ root }) => {
    const repository = inspectSignedDescriptorCustodyRepository(root);
    let thrown = null;
    try { withSessionAuthorityBoundary({ repository }, boundary => inspectSourceOwnedSessionAuthorityProducerRecord({ boundary, producerPort: createNativeGoldfishAuthorityProducerPort({ repository }) })); }
    catch (error) { thrown = error; }
    assert.ok(thrown, "an uninitialized repository has no producer record");
    assert.equal(sessionAuthorityRegistryAbsent(thrown), true, JSON.stringify({ code: thrown.code, message: thrown.message }));
    const other = Object.assign(new Error("ENOENT"), { code: "ENOENT", path: join(root, ".git/agent-pipeline/session-authority/members/x.json") });
    assert.equal(sessionAuthorityRegistryAbsent(other), false, "a missing member record is a fault, not an absent registry");
    assert.equal(sessionAuthorityRegistryAbsent(Object.assign(new Error("EACCES"), { code: "EACCES", path: thrown.path })), false, "an unreadable catalogue is a fault");
    assert.equal(sessionAuthorityRegistryAbsent(null), false);
  }) },

  { id: "NGHS27", name: "a governed item dispatch in a repository whose session-authority registry was never created initializes it once and is admitted; readiness is then observed (D44)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    assert.equal(existsSync(join(repository.commonDir,'agent-pipeline/session-authority/catalogue.json')),false,'the fixture starts without a registry, like a real repository');
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const binding={...makeBinding({dispatchId:'DELIVER-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));assert.equal(prepared.ok,true,JSON.stringify(prepared));
    assert.equal(existsSync(join(repository.commonDir,'agent-pipeline/session-authority/catalogue.json')),true,'the first governed dispatch created the registry');
    const observed=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));assert.equal(observed.status,'observed',JSON.stringify(observed));assert.equal(observed.nativeRegistry,'read');
    // PF-47: a rebinding whose write scope differs from the queue row is refused with that cause and the exact repair.
    const queuePath=join(root,'specs/unit/slice-queue.json'),before=readFileSync(queuePath,'utf8');
    const drift=runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery,candidate:original.candidate,writeScope:['src/change.mjs','src/change.test.mjs']}));
    assert.equal(drift.status,'refused',JSON.stringify(drift));assert.equal(drift.code,'SQ-ITEM-BINDING-DRIFT',JSON.stringify(drift));
    assert.match(drift.reason,/ITEM-AC-1 differs from its queue row in write scope/u);assert.match(drift.repair,/: src\/change\.mjs$/u);
    assert.equal(readFileSync(queuePath,'utf8'),before,'a refused rebinding leaves the queue untouched');
  })},

  { id: "NGHS28", name: "a held-dependency refusal names the actual cause per dependency (Critic F1)", run: () => {
    const base = "a".repeat(40);
    const slices = [{ id: "OPEN", state: "ready", tier: "implementor", delivery: { baseCommit: base } }, { id: "GONE", state: "cancelled", tier: "implementor", delivery: { baseCommit: base } },
      { id: "REVIEW", state: "ready", tier: "critic", delivery: {} }, { id: "WAIT", state: "hold-po", tier: "implementor", delivery: { baseCommit: base } }];
    const reason = heldDependencyReason(["OPEN", "GONE", "REVIEW"], slices);
    assert.match(reason, /OPEN \(no "Dispatch: OPEN \(goldfish\)" commit/u);
    assert.match(reason, /GONE \(cancelled/u);
    assert.match(reason, /REVIEW \(critic slice\)/u);
    assert.match(heldDependencyReason(["WAIT", "MISSING"], slices), /WAIT \(state hold-po\); MISSING \(not in the queue\)/u);
    assert.match(heldDependencyReason(["OPEN", "GONE", "REVIEW", "WAIT", "MISSING"], slices), /; and 2 more$/u);
  } },

  { id: "NGHS29", name: "a held dependency refuses before the queue is written; a never-started slice is cancelled and stops holding, a started one is refused (PF-45)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const delivery=sliceId=>({schema:'pipeline.item-delivery-briefing.v1',sliceId,itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]});
    const prepare=sliceId=>runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:delivery(sliceId),candidate:original.candidate,writeScope:['src/change.mjs']}));
    assert.equal(prepare('ITEM-AC-1').status,'required');
    const queuePath=join(root,'specs/unit/slice-queue.json'),before=readFileSync(queuePath,'utf8');
    const held=prepare('ITEM-AC-2');
    assert.equal(held.code,'NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD',JSON.stringify(held));assert.match(held.reason,/held on ITEM-AC-1 .*the queue was not written$/u);assert.match(held.repair,/slice-queue\.mjs cancel <slice id>/u);
    assert.equal(readFileSync(queuePath,'utf8'),before,'a held dependency leaves the queue untouched');
    const cancel=(sliceId,reason='never started')=>runtime.run(()=>cancelUnstartedGovernedItemSlice({root,sliceId,reason,cancelClass:'superseded'}));
    assert.equal(cancel('ITEM-AC-1','').code,'SQ-ITEM-CANCEL-INPUT');assert.equal(cancel('NOPE').code,'SQ-NOT-FOUND');
    const cancelled=cancel('ITEM-AC-1');assert.equal(cancelled.status,'cancelled',JSON.stringify(cancelled));assert.deepEqual(cancelled.released,[]);
    assert.equal(cancel('ITEM-AC-1').code,'SQ-ITEM-CANCEL-ALREADY');
    assert.equal(prepare('ITEM-AC-2').status,'required','the successor is admitted once its never-started predecessor is cancelled');
    const rows=JSON.parse(readFileSync(queuePath,'utf8')).slices;
    assert.equal(rows.find(row=>row.id==='ITEM-AC-1').state,'cancelled');assert.deepEqual(rows.find(row=>row.id==='ITEM-AC-2').dependsOn,[]);
    // A slice with a native dispatch state was started: it is not cancelled with this verb.
    const binding={...makeBinding({dispatchId:'DELIVER-AC-2',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery:delivery('ITEM-AC-2')};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-2\nWrite scope: src/change.mjs\n';
    assert.equal(runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input})).ok,true);
    assert.equal(cancel('ITEM-AC-2').code,'SQ-ITEM-CANCEL-STARTED');
  })},

  { id: "NGHS30", name: "fragments of an interrupted registry initialization are moved aside and the first dispatch still initializes; every queue refusal names its cause and repair (Critic F1-F3)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const registry=join(repository.commonDir,'agent-pipeline/session-authority');
    mkdirSync(join(registry,'producers'),{recursive:true,mode:0o700});chmodSync(registry,0o700);writeFileSync(join(registry,'producers/stale.json'),'{}',{mode:0o600});
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const binding={...makeBinding({dispatchId:'DELIVER-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));assert.equal(prepared.ok,true,JSON.stringify(prepared));
    assert.equal(existsSync(join(registry,'catalogue.json')),true);assert.equal(existsSync(join(registry,'producers/stale.json')),false);
    const aside=readdirSync(join(repository.commonDir,'agent-pipeline/session-authority-abandoned'));
    assert.equal(aside.length,1);assert.equal(existsSync(join(repository.commonDir,'agent-pipeline/session-authority-abandoned',aside[0],'producers/stale.json')),true,'the fragment is retained, not deleted');
    const scope=runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery,candidate:original.candidate,writeScope:['elsewhere.mjs']}));
    assert.equal(scope.code,'SQ-ITEM-SCOPE-INVALID');assert.match(scope.reason,/not a dependency of the item check/u);assert.match(scope.repair,/dispatch-briefing\.mjs binding/u);
    const invalid=runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:{...itemDelivery,pass:true},candidate:original.candidate,writeScope:['src/change.mjs']}));
    assert.equal(invalid.code,'SQ-ITEM-BINDING-INVALID');assert.match(invalid.repair,/regenerate the binding/u);
    const otherItem=runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:{...itemDelivery,itemId:'AC-OTHER'},candidate:original.candidate,writeScope:['src/change.mjs']}));
    assert.equal(otherItem.code,'SQ-ITEM-BINDING-DRIFT',JSON.stringify(otherItem));assert.match(otherItem.reason,/in item/u);assert.match(otherItem.repair,/choose a new slice id/u);
  })},

  { id: "NGHS31", name: "a dispatch whose dependency is integrated only by its Dispatch commit passes the final pre-launch publish, not just the admission (D40 at publish)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const git=(...args)=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
    const delivery=sliceId=>({schema:'pipeline.item-delivery-briefing.v1',sliceId,itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]});
    assert.equal(runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:delivery('ITEM-AC-1'),candidate:original.candidate,writeScope:['src/change.mjs']})).status,'required');
    writeFileSync(join(root,'src/change.mjs'),'delivered by ITEM-AC-1\n');git('add','src/change.mjs');git('commit','-q','-m','fixture delivery','-m','AI-Assisted: true\nDispatch: ITEM-AC-1 (goldfish)\nCommit-Act: orchestrator');
    const candidate={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};
    const binding={...makeBinding({dispatchId:'DELIVER-AC-2',commit:candidate.commit,tree:candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery:delivery('ITEM-AC-2')};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-2\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const row=JSON.parse(readFileSync(join(root,'specs/unit/slice-queue.json'),'utf8')).slices.find(entry=>entry.id==='ITEM-AC-2');
    assert.deepEqual(row.dependsOn,['ITEM-AC-1'],'the successor really depends on the commit-integrated slice');
  })},

  { id: "NGHS32", name: "an override journal grown past one MiB does not block item dispatch; an oversized non-journal file is refused naming file, size and bound (PF-51)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const hgo=join(repository.commonDir,'agent-pipeline/human-guard-overrides');
    mkdirSync(hgo,{recursive:true,mode:0o700});chmodSync(hgo,0o700);
    writeFileSync(join(hgo,'command-offers.jsonl'),`${JSON.stringify({schema:'fixture.offer',padding:'x'.repeat(1000)})}\n`.repeat(1600),{mode:0o600});
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const dispatch=(dispatchId,toolUseId)=>{const binding={...makeBinding({dispatchId,commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
      const input=toolInput('claude',{root,session:'native-session-one',toolUseId,binding});
      input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
      return runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));};
    const prepared=dispatch('DELIVER-AC-1','native-tool-one');
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    mkdirSync(join(hgo,'plans'),{mode:0o700});writeFileSync(join(hgo,'plans/oversized.json'),'x'.repeat(1048577),{mode:0o600});
    const refused=dispatch('DELIVER-AC-1B','native-tool-two');
    assert.equal(refused.ok,false);assert.match(JSON.stringify(refused),/hgo:source-size-bound plans\/oversized\.json 1048577 bytes exceeds 1048576/u);
  })},

  { id: "NGHS33", name: "a catalogue written by another plugin version is migrated, and a successor of a commit-integrated slice dispatches after the update; another repository's catalogue is refused (PF-52)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const git=(...args)=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
    const delivery=sliceId=>({schema:'pipeline.item-delivery-briefing.v1',sliceId,itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]});
    const dispatch=(sliceId,dispatchId,toolUseId,candidate)=>{const binding={...makeBinding({dispatchId,commit:candidate.commit,tree:candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery:delivery(sliceId)};
      const input=toolInput('claude',{root,session:'native-session-one',toolUseId,binding});
      input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+`\nSlice: ${sliceId}\nWrite scope: src/change.mjs\n`;
      return runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));};
    assert.equal(initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository})).status,'initialized','the catalogue an earlier plugin version wrote');
    assert.equal(runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:delivery('ITEM-AC-1'),candidate:original.candidate,writeScope:['src/change.mjs']})).status,'required');
    writeFileSync(join(root,'src/change.mjs'),'delivered by ITEM-AC-1\n');git('add','src/change.mjs');git('commit','-q','-m','fixture delivery','-m','AI-Assisted: true\nDispatch: ITEM-AC-1 (goldfish)\nCommit-Act: orchestrator');
    const candidate={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};
    const registry=join(repository.commonDir,'agent-pipeline/session-authority'),cataloguePath=join(registry,'catalogue.json');
    const rewrite=change=>{const value=JSON.parse(readFileSync(cataloguePath,'utf8'));change(value);writeFileSync(cataloguePath,canonical(value));};
    const sha=value=>createHash('sha256').update(canonical(value)).digest('hex');
    const update=index=>rewrite(value=>{value.participants[index]={...value.participants[index],sourceSha256:'f'.repeat(64)};value.participantSetSha256=sha(value.participants);});
    const abandoned=join(repository.commonDir,'agent-pipeline/session-authority-abandoned');
    const migrations=()=>readdirSync(abandoned).filter(name=>name.includes('-source-update-')&&!name.endsWith('-partial'));
    const members=()=>{const out={};const walk=dir=>{for(const name of readdirSync(dir,{withFileTypes:true})){const path=join(dir,name.name);if(name.isDirectory())walk(path);else out[path.slice(registry.length)]=readFileSync(path,'utf8');}};if(existsSync(join(registry,'members')))walk(join(registry,'members'));return out;};
    update(4);
    const second=dispatch('ITEM-AC-2','DELIVER-AC-2','native-tool-two',candidate);
    assert.equal(second.ok,true,JSON.stringify(second));
    assert.equal(migrations().length,1);assert.equal(existsSync(join(abandoned,migrations()[0],'catalogue.json')),true,'the old catalogue is retained, not deleted');
    const row=JSON.parse(readFileSync(join(root,'specs/unit/slice-queue.json'),'utf8')).slices.find(entry=>entry.id==='ITEM-AC-2');
    assert.deepEqual(row.dependsOn,['ITEM-AC-1'],'the successor really depends on the commit-integrated slice');
    const held=members();assert.ok(Object.keys(held).length>0,'the dispatch holds a registry member');
    update(1);
    const readiness=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));
    assert.equal(readiness.status,'observed',JSON.stringify(readiness));assert.deepEqual(readiness.integrated,['ITEM-AC-1']);
    assert.equal(migrations().length,2);assert.deepEqual(members(),held,'a second update rebinds the registry; every member survives byte for byte');
    const latest=JSON.parse(readFileSync(join(abandoned,migrations().sort().at(-1),'migration.json'),'utf8'));
    assert.equal(latest.mode,'rebound',JSON.stringify(latest));
    assert.notEqual(JSON.parse(readFileSync(cataloguePath,'utf8')).participants[1].sourceSha256,'f'.repeat(64));
    rewrite(value=>{value.repositorySha256='e'.repeat(64);});
    const foreign=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));
    assert.equal(foreign.status,'refused');assert.match(JSON.stringify(foreign),/record-repository/u);
    assert.equal(migrations().length,2,'another repository\'s catalogue is never migrated');
  })},

  { id: "NGHS34", name: "a shared agent-pipeline/run directory another component created 0755 does not block the first item dispatch (PF-53)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const run=join(repository.commonDir,'agent-pipeline/run');mkdirSync(run,{recursive:true});chmodSync(run,0o755);
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const binding={...makeBinding({dispatchId:'DELIVER-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    assert.equal(existsSync(join(repository.commonDir,'agent-pipeline/session-authority/catalogue.json')),true);
  })},

  { id: "NGHS35", name: "a catalogue whose producer structure changed is retained with a marker and the registry starts fresh; the dispatch still runs (PF-52, Critic F7/F9)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    assert.equal(initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository})).status,'initialized');
    const cataloguePath=join(repository.commonDir,'agent-pipeline/session-authority/catalogue.json');
    const value=JSON.parse(readFileSync(cataloguePath,'utf8'));
    value.participants[2]={...value.participants[2],namespaceIds:[...value.participants[2].namespaceIds,'a-namespace-an-older-version-had']};
    value.participantSetSha256=createHash('sha256').update(canonical(value.participants)).digest('hex');writeFileSync(cataloguePath,canonical(value));
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const binding={...makeBinding({dispatchId:'DELIVER-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const abandoned=join(repository.commonDir,'agent-pipeline/session-authority-abandoned');
    const migrated=readdirSync(abandoned).filter(name=>name.includes('-source-update-'));
    assert.equal(migrated.length,1);
    const marker=JSON.parse(readFileSync(join(abandoned,migrated[0],'migration.json'),'utf8'));
    assert.equal(marker.mode,'fresh');assert.equal(marker.oldParticipantSetSha256,value.participantSetSha256);assert.match(marker.cause,/structure changed/u);
    assert.equal(existsSync(join(abandoned,migrated[0],'catalogue.json')),true,'the old catalogue is retained');
    assert.notEqual(JSON.parse(readFileSync(cataloguePath,'utf8')).participantSetSha256,value.participantSetSha256,'a fresh catalogue of the installed sources');
  })},

  { id: "NGHS36", name: "a state file rewritten outside the registry, as push-prepare's fold does, is healed and the dispatch runs; a changed namespace under an armed bound member stays refused (PF-55, D51)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    assert.equal(initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository})).status,'initialized');
    // Another writer's bytes for the same state, as a fold, a git checkout or an older route leave them.
    const statePath=join(root,'.claude/pipeline-state.json'),before=readFileSync(statePath,'utf8');
    writeFileSync(statePath,`${JSON.stringify(JSON.parse(before))}\n`);assert.notEqual(readFileSync(statePath,'utf8'),before);
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-1',itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    const binding={...makeBinding({dispatchId:'DELIVER-AC-1',commit:original.candidate.commit,tree:original.candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery};
    const input=toolInput('claude',{root,session:'native-session-one',toolUseId:'native-tool-one',binding});
    input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+'\nSlice: ITEM-AC-1\nWrite scope: src/change.mjs\n';
    const prepared=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const abandoned=join(repository.commonDir,'agent-pipeline/session-authority-abandoned');
    const heals=()=>existsSync(abandoned)?readdirSync(abandoned).filter(name=>name.endsWith('-drift-heal')).sort():[];
    assert.equal(heals().length,1);
    const marker=JSON.parse(readFileSync(join(abandoned,heals()[0],'heal.json'),'utf8'));
    assert.ok(marker.healed.some(row=>row.producerId==='onboarding-continuity'&&row.namespaces.includes('selected-state')),JSON.stringify(marker));
    assert.equal(existsSync(join(abandoned,heals()[0],'onboarding-continuity.json')),true,'the prior producer record is retained');
    // Healing is per producer: the dispatch's armed native member does not hold back the state file's producers.
    writeFileSync(statePath,`${readFileSync(statePath,'utf8').trimEnd()}\n\n`);
    const readiness=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));
    assert.equal(readiness.status,'observed',JSON.stringify(readiness));assert.equal(heals().length,2);
    // A namespace that changed under its own armed bound member is never healed.
    const pending=[];const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(entry.name.startsWith('pending-'))pending.push(path);}};walk(join(repository.commonDir,'agent-pipeline'));
    assert.equal(pending.length,1,JSON.stringify(pending));writeFileSync(pending[0],`${readFileSync(pending[0],'utf8')} `);
    const refused=runtime.run(()=>observeGovernedItemIntegrationReadiness({root}));
    assert.equal(refused.status,'refused',JSON.stringify(refused));
    // Critic F7: the refusal names the member in flight and the inspect that names its release.
    assert.match(refused.repair??'',/native-goldfish's namespace changed outside the registry while \S+ \((armed|running)\) is in flight, so it is not healed/u,JSON.stringify(refused));
    assert.match(refused.repair,/session-authority-repair\.mjs inspect --root /u);
    assert.equal(heals().every(name=>!JSON.parse(readFileSync(join(abandoned,name,'heal.json'),'utf8')).healed.some(row=>row.producerId==='native-goldfish')),true);
  })},

  { id: "NGHS37", name: "a refused dispatch leaves no member and no queue row and names its dirty paths; a slice integrated by its Dispatch commit or cancelled with --started stops holding its item; cancel needs no bound session (PF-55, D51)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const git=(...args)=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
    const delivery=sliceId=>({schema:'pipeline.item-delivery-briefing.v1',sliceId,itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]});
    const dispatch=(sliceId,dispatchId,toolUseId,candidate)=>{const binding={...makeBinding({dispatchId,commit:candidate.commit,tree:candidate.tree}),schema:'pipeline.native-goldfish-host-briefing.v3',model:'sonnet',effort:'medium',itemDelivery:delivery(sliceId)};
      const input=toolInput('claude',{root,session:'native-session-one',toolUseId,binding});
      input.tool_input.prompt=input.tool_input.prompt.replace('host-commit:v1','host-commit:v3')+`\nSlice: ${sliceId}\nWrite scope: src/change.mjs\n`;
      return runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input}));};
    assert.equal(initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository})).status,'initialized');
    const registry=join(repository.commonDir,'agent-pipeline/session-authority'),queuePath=join(root,'specs/unit/slice-queue.json');
    const members=()=>{const out={};const walk=dir=>{for(const name of readdirSync(dir,{withFileTypes:true})){const path=join(dir,name.name);if(name.isDirectory())walk(path);else out[path.slice(registry.length)]=readFileSync(path,'utf8');}};if(existsSync(join(registry,'members')))walk(join(registry,'members'));return out;};
    const row=sliceId=>JSON.parse(readFileSync(queuePath,'utf8')).slices.find(entry=>entry.id===sliceId);
    // A dirty tracked path refuses before any member is reserved, names the path, and the queue row it prepared is removed again.
    const membersBefore=members();
    writeFileSync(join(root,'.gitignore'),`${readFileSync(join(root,'.gitignore'),'utf8')}# local edit\n`);
    const dirty=dispatch('ITEM-AC-1','DELIVER-AC-1','native-tool-one',original.candidate);
    assert.equal(dirty.reason,'AGY-HOST-BASELINE-DIRTY',JSON.stringify(dirty));assert.match(dirty.repair,/commit or restore these tracked paths before dispatching: \.gitignore/u);
    assert.deepEqual(members(),membersBefore,'a refused dispatch leaves no reserved member behind');
    assert.equal(existsSync(queuePath),false,'a refused dispatch leaves no phantom queue row');
    git('checkout','-q','--','.gitignore');
    // A never-started slice is cancelled from an unbound shell (D51 (3)).
    assert.equal(runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:delivery('ITEM-AC-0'),candidate:original.candidate,writeScope:['src/change.mjs']})).status,'required');
    const unbound=cancelUnstartedGovernedItemSlice({root,sliceId:'ITEM-AC-0',reason:'not needed',cancelClass:'superseded'});
    assert.equal(unbound.status,'cancelled',JSON.stringify(unbound));
    assert.equal(dispatch('ITEM-AC-1','DELIVER-AC-1','native-tool-one',original.candidate).ok,true);
    // The Goldfish delivered and the orchestrator committed it by hand: the commit evidence releases the item (D40, D51 (2)).
    writeFileSync(join(root,'src/change.mjs'),'delivered by ITEM-AC-1\n');git('add','src/change.mjs');git('commit','-q','-m','fixture delivery','-m','AI-Assisted: true\nDispatch: ITEM-AC-1 (goldfish)\nCommit-Act: orchestrator');
    const candidate={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};
    const second=dispatch('ITEM-AC-2','DELIVER-AC-2','native-tool-two',candidate);
    assert.equal(second.ok,true,JSON.stringify(second));
    assert.equal(runtime.run(()=>cancelUnstartedGovernedItemSlice({root,sliceId:'ITEM-AC-1',reason:'delivered',cancelClass:'integrated-elsewhere'})).code,'SQ-ITEM-CANCEL-INTEGRATED');
    // A started slice whose Goldfish no longer runs is cancelled from an unbound shell on the caller's word.
    const started=cancelUnstartedGovernedItemSlice({root,sliceId:'ITEM-AC-2',reason:'its Goldfish stopped',cancelClass:'budget'});
    assert.equal(started.code,'SQ-ITEM-CANCEL-STARTED',JSON.stringify(started));assert.match(started.repair,/slice-queue\.mjs cancel ITEM-AC-2 --started --reason "<why>" --class <budget\|wrong-premise\|review-defect\|integrated-elsewhere\|superseded>/u);
    const cancelled=cancelUnstartedGovernedItemSlice({root,sliceId:'ITEM-AC-2',reason:'its Goldfish stopped',started:true,cancelClass:'budget'});
    assert.equal(cancelled.status,'cancelled',JSON.stringify(cancelled));assert.equal(cancelled.started,true);assert.equal(row('ITEM-AC-2').state,'cancelled');
    const third=dispatch('ITEM-AC-3','DELIVER-AC-3','native-tool-three',candidate);
    assert.equal(third.ok,true,JSON.stringify(third));assert.deepEqual(row('ITEM-AC-3').dependsOn,['ITEM-AC-1']);
  })},

  { id: "NGHS38", name: "a slice with an unreleased AGY reservation counts as started: its cancel needs --started, with or without a registry (Critic F2)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const delivery=sliceId=>({schema:'pipeline.item-delivery-briefing.v1',sliceId,itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]});
    const prepare=sliceId=>runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:delivery(sliceId),candidate:original.candidate,writeScope:['src/change.mjs']}));
    assert.equal(prepare('ITEM-AC-1').status,'required');
    // An AGY dispatch reserved ITEM-AC-1; nothing released it.
    const journal=join(repository.commonDir,'agent-pipeline/run/agy-authority-contexts');mkdirSync(journal,{recursive:true,mode:0o700});chmodSync(journal,0o700);
    const basis={association:{state:'unbound',target:null},candidate:repository.candidate,operationNonce:'a'.repeat(64),itemDelivery:{itemId:'AC-1',sliceId:'ITEM-AC-1',queuePath:'specs/unit/slice-queue.json',queueSha256:'b'.repeat(64),writeScope:['src/change.mjs']}};
    const entry={schema:'pipeline.agy-authority-lifetime.v2',producerId:'agy-family-dispatch',repositorySha256:nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir}),operationId:'a'.repeat(32),basis,bindingSha256:nativeManagedDigest(basis),phase:'armed',terminal:null,terminalEvidence:null,sourcePaths:[]};
    writeFileSync(join(journal,`op.${entry.operationId}.1.json`),JSON.stringify(entry),{mode:0o600});
    const cancel=(sliceId,started=false)=>cancelUnstartedGovernedItemSlice({root,sliceId,reason:'its AGY run stopped',started,cancelClass:'budget'});
    const absent=cancel('ITEM-AC-1');
    assert.equal(absent.code,'SQ-ITEM-CANCEL-STARTED',JSON.stringify(absent));assert.match(absent.reason,/unreleased AGY reservation/u);assert.match(absent.repair,/slice-queue\.mjs cancel ITEM-AC-1 --started/u);
    assert.equal(initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository})).status,'initialized');
    const registered=cancel('ITEM-AC-1');
    assert.equal(registered.code,'SQ-ITEM-CANCEL-STARTED',`a registry whose AGY producer released nothing keeps the slice started: ${JSON.stringify(registered)}`);
    const forced=cancel('ITEM-AC-1',true);
    assert.equal(forced.status,'cancelled',JSON.stringify(forced));assert.equal(forced.started,true);
    // A slice no reservation names is still cancelled without --started.
    assert.equal(prepare('ITEM-AC-2').status,'required');assert.equal(cancel('ITEM-AC-2').status,'cancelled');
  })},

  { id: "NGHS39", name: "a cancel needs a reason class: a missing or unknown class is refused SQ-CANCEL-CLASS with a repair and leaves the queue untouched, a valid class is stored in row.cancelClass, a legacy row reads as unclassified, the repairs teach --class (D75)", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const delivery=sliceId=>({schema:'pipeline.item-delivery-briefing.v1',sliceId,itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]});
    const prepare=sliceId=>runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:delivery(sliceId),candidate:original.candidate,writeScope:['src/change.mjs']}));
    assert.equal(prepare('ITEM-AC-1').status,'required');
    const queuePath=join(root,'specs/unit/slice-queue.json'),before=readFileSync(queuePath,'utf8');
    const classes=['budget','wrong-premise','review-defect','integrated-elsewhere','superseded'];
    const held=prepare('ITEM-AC-2');
    assert.equal(held.code,'NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD',JSON.stringify(held));
    assert.match(held.repair,/slice-queue\.mjs cancel <slice id> --reason "<why>" --class <budget\|wrong-premise\|review-defect\|integrated-elsewhere\|superseded>/u);
    const cancel=cancelClass=>runtime.run(()=>cancelUnstartedGovernedItemSlice({root,sliceId:'ITEM-AC-1',reason:'wrong base',...(cancelClass===undefined?{}:{cancelClass})}));
    for(const bad of [undefined,'','whatever','unclassified',7,null]){
      const refused=cancel(bad);
      assert.equal(refused.status,'refused',`${String(bad)}: ${JSON.stringify(refused)}`);assert.equal(refused.code,'SQ-CANCEL-CLASS',String(bad));
      for(const name of classes){assert.ok(refused.reason.includes(name),`reason names ${name}`);assert.ok(refused.repair.includes(name),`repair names ${name}`);}
      assert.equal(readFileSync(queuePath,'utf8'),before,'a refused class leaves the queue untouched');
    }
    const cancelled=cancel('wrong-premise');
    assert.equal(cancelled.status,'cancelled',JSON.stringify(cancelled));
    const stored=JSON.parse(readFileSync(queuePath,'utf8'));
    assert.equal(stored.slices.find(entry=>entry.id==='ITEM-AC-1').cancelClass,'wrong-premise');
    assert.equal(validateSliceQueue(stored).queue.slices.find(entry=>entry.id==='ITEM-AC-1').cancelClass,'wrong-premise');
    // A row cancelled before D75 carries no class and is reported unclassified, never as classified.
    const legacy=structuredClone(stored);delete legacy.slices.find(entry=>entry.id==='ITEM-AC-1').cancelClass;
    const legacyResult=validateSliceQueue(legacy);assert.equal(legacyResult.ok,true,JSON.stringify(legacyResult.errors));
    assert.equal(legacyResult.queue.slices.find(entry=>entry.id==='ITEM-AC-1').cancelClass,'unclassified');
  })},

  { id: "NGHS40", name: "DR1 an aggregate dispatch-readiness assessment lists every failing probe in input order, not only the first", run: async () => {
    const { assessDispatchReadiness } = await import("./dispatch-readiness.mjs");
    const result = assessDispatchReadiness({ probes: [
      { area: "host-identity", observe: () => ({ ok: true }) },
      { area: "reservation", observe: () => ({ code: "R-1", nextAction: "release the reservation" }) },
      { area: "reviewer-admission", observe: () => ({ code: "C-2", nextAction: "run the critic preflight" }) },
    ] });
    assert.equal(result.schema, "pipeline.dispatch-readiness.v1");
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockers, [
      { area: "reservation", code: "R-1", nextAction: "release the reservation" },
      { area: "reviewer-admission", code: "C-2", nextAction: "run the critic preflight" },
    ]);
  }},

  { id: "NGHS41", name: "DR2 every blocker carries a non-empty nextAction; a probe without one yields DR-NEXT-ACTION-MISSING", run: async () => {
    const { assessDispatchReadiness } = await import("./dispatch-readiness.mjs");
    const result = assessDispatchReadiness({ probes: [
      { area: "a", observe: () => ({ code: "A-1", nextAction: "do a" }) },
      { area: "b", observe: () => ({ code: "B-1" }) },
      { area: "c", observe: () => ({ code: "C-1", nextAction: "  " }) },
    ] });
    assert.equal(result.blockers.length, 3);
    for (const blocker of result.blockers) assert.ok(typeof blocker.nextAction === "string" && blocker.nextAction.trim().length > 0, JSON.stringify(blocker));
    assert.equal(result.blockers[1].code, "DR-NEXT-ACTION-MISSING");
    assert.equal(result.blockers[2].code, "DR-NEXT-ACTION-MISSING");
    assert.equal(result.blockers[0].code, "A-1");
  }},

  { id: "NGHS42", name: "DR3 a throwing probe yields a typed DR-PROBE-THREW blocker, never an exception, and later probes still run", run: async () => {
    const { assessDispatchReadiness } = await import("./dispatch-readiness.mjs");
    let result;
    assert.doesNotThrow(() => { result = assessDispatchReadiness({ probes: [
      { area: "x", observe: () => { throw new Error("boom"); } },
      { area: "y", observe: () => ({ code: "Y-1", nextAction: "fix y" }) },
    ] }); });
    assert.equal(result.status, "blocked");
    assert.equal(result.blockers.length, 2);
    assert.equal(result.blockers[0].area, "x");
    assert.equal(result.blockers[0].code, "DR-PROBE-THREW");
    assert.ok(result.blockers[0].nextAction.trim().length > 0);
    assert.equal(result.blockers[1].code, "Y-1");
  }},

  { id: "NGHS43", name: "DR4 the assessment is ready only when blockers is empty", run: async () => {
    const { assessDispatchReadiness } = await import("./dispatch-readiness.mjs");
    const ready = assessDispatchReadiness({ probes: [{ area: "a", observe: () => ({ ok: true }) }, { area: "b", observe: () => ({ ok: true }) }] });
    assert.deepEqual(ready, { schema: "pipeline.dispatch-readiness.v1", status: "ready", blockers: [] });
    assert.equal(assessDispatchReadiness({ probes: [] }).status, "ready");
    const blocked = assessDispatchReadiness({ probes: [{ area: "a", observe: () => ({ code: "A", nextAction: "n" }) }] });
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.blockers.length > 0);
  }},
  { id: "NGHS44", name: "PF-85 1b: every item-delivery refusal names the sanctioned repair: a held-dependency admission refusal and the reservation-publish refusal carry slice-queue.mjs cancel, all five classes and the Dispatch trailer; the owner collision keeps its repair", run: async () => { const mod = await import("./native-goldfish-host-state.mjs"); return fixture(({root,commit,tree,dependencies})=>{
    const classes=['budget','wrong-premise','review-defect','integrated-elsewhere','superseded'];
    const namesRepair=(repair,label)=>{
      assert.equal(typeof repair,'string',`${label}: a non-empty repair is present`);assert.ok(repair.length>0,label);
      assert.match(repair,/slice-queue\.mjs cancel/u,label);
      for(const name of classes)assert.ok(repair.includes(name),`${label} names ${name}`);
      assert.match(repair,/Dispatch: .* \(goldfish\)/u,label);
    };
    const controller=createGovernanceScopeController({hostStateRoot:join(root,"fixture-host")});
    const plan=controller.planDecision({rootDir:root,decision:"enroll",by:"fixture explicit selection"});
    controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
    mkdirSync(join(root,".claude"));mkdirSync(join(root,"specs/unit"),{recursive:true});
    writeFileSync(join(root,".claude/pipeline.yaml"),"schema: pipeline.manifest.v0\n");
    writeFileSync(join(root,".claude/pipeline-state.json"),JSON.stringify({schema:"pipeline.state.v0",activeFeature:{id:"unit",planPath:"specs/unit/plan.md",phase:"implementation"},planApproved:true}));
    const item=(id,itemId,path,dependsOn=[])=>({id,title:id,state:"ready",dependsOn,writeScope:[path],tier:"implementor",commitMode:"diff-only",loadClass:"light",delivery:{itemId,criteria:["CR-1"],baseCommit:commit}});
    const queue={schema:"pipeline.slice-queue.v2",feature:"unit",slices:[item("ITEM-A","AC-1","src/change.mjs"),item("ITEM-B","AC-1","src/b.mjs"),item("ITEM-D","AC-2","src/d.mjs",["ITEM-A"])]};
    writeFileSync(join(root,"specs/unit/slice-queue.json"),JSON.stringify(queue));
    assert.equal(resolveGovernedItemQueue({root}).status,"required");
    const statePath=join(root,".claude/pipeline-state.json");
    writeFileSync(statePath,JSON.stringify({...JSON.parse(readFileSync(statePath,"utf8")),continuity:itemContinuity()}));
    chmodSync(statePath,0o600);
    const repository=inspectSignedDescriptorCustodyRepository(root);
    const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,"agent-pipeline/controlled-method-fixtures/item-owner"),sessionId:"item-owner-unit"});
    const ports=createSessionAuthorityParticipantPorts({repository});
    for(const row of ports)assert.doesNotThrow(()=>row.port.readBaseline(),row.producerId);
    assert.equal(initializeSessionAuthorityRegistry({repository},ports).status,"initialized");
    const launch=(id,path,session)=>{
      const binding={...makeBinding({dispatchId:id,commit,tree}),allowedPaths:[path]};
      const input=toolInput("claude",{root,session,toolUseId:`tool-${id}`,binding});
      input.tool_input.prompt+=`\nSlice: ${id}\nWrite scope: ${path}\n`;
      return runtime.run(()=>prepareNativeGoldfishHostState({root,runner:"claude",input},dependencies));
    };
    assert.equal(launch("ITEM-A","src/change.mjs","session-one").ok,true);
    // Pin: the owner collision already carries a repair (reservationFault).
    const duplicate=launch("ITEM-B","src/b.mjs","session-two");
    assert.equal(duplicate.reason,"item-delivery-owner-collision");namesRepair(duplicate.repair,'owner collision');
    // A successor whose dependency is held is refused at the held-dependency branch (not the readiness branch) with a repair.
    const successor=launch("ITEM-D","src/d.mjs","session-three");
    assert.equal(successor.ok,false,JSON.stringify(successor));
    assert.equal(successor.code,"NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD",JSON.stringify(successor));
    assert.ok(!String(successor.reason).startsWith("integration readiness"),`reached the held branch: ${successor.reason}`);
    namesRepair(successor.repair,'held-dependency admission');
    // The reservation-publish refusal is only reachable on an admission race, so it is pinned at its source and through the one shared text.
    assert.equal(typeof mod.heldDependencyRepair,"function","heldDependencyRepair is exported");
    namesRepair(mod.heldDependencyRepair(),'heldDependencyRepair');
    const source=readFileSync(new URL("./native-goldfish-host-state.mjs",import.meta.url),"utf8");
    assert.match(source,/item-delivery-integration-dependency-held:[^\n]*\n?[^\n]*heldDependencyRepair\(\)|heldDependencyRepair\(\)[^\n]*item-delivery-integration-dependency-held/u,"the reservation-publish throw attaches the repair");
    // PO 2026-10-30: an unreadable registry (a producer refuses its reconcile) names inspect, the routine heal and the human move-aside.
    assert.equal(typeof mod.readinessUnavailableRepair,"function","readinessUnavailableRepair is exported");
    const unavailable=mod.readinessUnavailableRepair();
    assert.match(unavailable,/session-authority-repair\.mjs inspect --root <root>/u);
    assert.match(unavailable,/routine-repair\.mjs run heal --root <root> --reason/u);
    assert.match(unavailable,/move-aside --no-goldfish-running/u);
    assert.match(unavailable,/still reconcile-refused and no Goldfish runs, run [^\n]*move-aside/u);
    assert.match(unavailable,/nothing is deleted/u);
    assert.match(source,/integration readiness \$\{readiness\.status\}[^\n]*repair:readinessUnavailableRepair\(\)/u,"the readiness-unavailable refusal attaches the repair");
  })}},

  { id: "NGHS45", name: "PF-86 (i): two admissions with disjoint scopes both succeed through the lock-free pre-scan, and a third on the first scope sees the first reservation", run: async () => { const mod = await import("./native-goldfish-host-state.mjs"); return fixture(({root,commit,tree,dependencies})=>{
    assert.equal(typeof mod.prescanCommitIntegratedSlices,"function","the pre-scan is exported");
    assert.equal(typeof mod.adoptPrescanInBoundary,"function","the compare-and-adopt step is exported");
    const controller=createGovernanceScopeController({hostStateRoot:join(root,"fixture-host")});
    const plan=controller.planDecision({rootDir:root,decision:"enroll",by:"fixture explicit selection"});
    controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
    mkdirSync(join(root,".claude"));mkdirSync(join(root,"specs/unit"),{recursive:true});
    writeFileSync(join(root,".claude/pipeline.yaml"),"schema: pipeline.manifest.v0\n");
    writeFileSync(join(root,".claude/pipeline-state.json"),JSON.stringify({schema:"pipeline.state.v0",activeFeature:{id:"unit",planPath:"specs/unit/plan.md",phase:"implementation"},planApproved:true}));
    const item=(id,itemId,path,dependsOn=[])=>({id,title:id,state:"ready",dependsOn,writeScope:[path],tier:"implementor",commitMode:"diff-only",loadClass:"light",delivery:{itemId,criteria:["CR-1"],baseCommit:commit}});
    writeFileSync(join(root,"specs/unit/slice-queue.json"),JSON.stringify({schema:"pipeline.slice-queue.v2",feature:"unit",slices:[item("ITEM-A","AC-1","src/a.mjs"),item("ITEM-B","AC-2","src/b.mjs"),item("ITEM-C","AC-1","src/c.mjs")]}));
    const statePath=join(root,".claude/pipeline-state.json");
    writeFileSync(statePath,JSON.stringify({...JSON.parse(readFileSync(statePath,"utf8")),continuity:itemContinuity()}));
    chmodSync(statePath,0o600);
    const repository=inspectSignedDescriptorCustodyRepository(root);
    const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,"agent-pipeline/controlled-method-fixtures/item-owner"),sessionId:"item-owner-unit"});
    const ports=createSessionAuthorityParticipantPorts({repository});
    assert.equal(initializeSessionAuthorityRegistry({repository},ports).status,"initialized");
    const launch=(id,path,session)=>{
      const binding={...makeBinding({dispatchId:id,commit,tree}),allowedPaths:[path]};
      const input=toolInput("claude",{root,session,toolUseId:`tool-${id}`,binding});
      input.tool_input.prompt+=`\nSlice: ${id}\nWrite scope: ${path}\n`;
      return runtime.run(()=>prepareNativeGoldfishHostState({root,runner:"claude",input},dependencies));
    };
    const firstLaunch=launch("ITEM-A","src/a.mjs","session-one");
    assert.equal(firstLaunch.ok,true,JSON.stringify(firstLaunch));
    const secondLaunch=launch("ITEM-B","src/b.mjs","session-two");
    assert.equal(secondLaunch.ok,true,JSON.stringify(secondLaunch));
    const third=launch("ITEM-C","src/c.mjs","session-three");
    assert.equal(third.ok,false,JSON.stringify(third));
    assert.match(String(third.reason),/item-delivery-(scope|owner|criterion-owner)-collision/u);
  })}},

  { id: "NGHS46", name: "PF-86 (ii): a pre-scan is adopted only when the queue digest and the candidate commit still match; a competing change is re-read, never silently overwritten", run: async () => { const mod = await import("./native-goldfish-host-state.mjs");
    assert.equal(typeof mod.prescanCommitIntegratedSlices,"function");assert.equal(typeof mod.adoptPrescanInBoundary,"function");
    const repository={primaryRoot:"/fixture-root",candidate:{commit:"c1"}};
    const governed=(sha,ids)=>({status:"required",sha256:sha,normalized:{slices:ids.map(id=>({id}))}});
    const reads=[];
    const read=({candidateCommit,slices})=>{reads.push([candidateCommit,slices.map(row=>row.id)]);return slices.map(row=>row.id);};
    const key=(g,c)=>JSON.stringify(["commit-integrated",g.sha256,c]);
    // match: one read in total (the pre-scan), the boundary memo is seeded from it
    const g1=governed("a".repeat(64),["S1"]);
    const scan=mod.prescanCommitIntegratedSlices({repository,governed:g1,read});
    assert.equal(reads.length,1);
    const b1={};
    assert.equal(mod.adoptPrescanInBoundary({boundary:b1,repository,governed:g1,prescan:scan,read}).status,"reused");
    assert.equal(reads.length,1,"no second read under the boundary");
    assert.deepEqual(mod.memoPerAdmission(b1,key(g1,"c1"),()=>{throw new Error("memo must be seeded");}),["S1"]);
    // queue digest changed between pre-scan and publish: the delta is re-read under the boundary from the CURRENT queue
    const g2=governed("b".repeat(64),["S1","S2"]);
    const b2={};
    assert.equal(mod.adoptPrescanInBoundary({boundary:b2,repository,governed:g2,prescan:scan,read}).status,"recomputed-after-drift");
    assert.equal(reads.length,2);
    assert.deepEqual(mod.memoPerAdmission(b2,key(g2,"c1"),()=>{throw new Error("memo must be seeded");}),["S1","S2"]);
    // candidate commit changed: same refusal to adopt
    const b3={},moved={primaryRoot:"/fixture-root",candidate:{commit:"c2"}};
    assert.equal(mod.adoptPrescanInBoundary({boundary:b3,repository:moved,governed:g1,prescan:scan,read}).status,"recomputed-after-drift");
    assert.equal(reads.at(-1)[0],"c2");
  }},

  { id: "NGHS47", name: "PF-86 (iii): the pre-scanned admission yields the same integrated set as the unchanged in-boundary read, and a pre-scan fault or an absent queue falls back to it", run: async () => { const mod = await import("./native-goldfish-host-state.mjs");
    assert.equal(typeof mod.prescanCommitIntegratedSlices,"function");assert.equal(typeof mod.adoptPrescanInBoundary,"function");
    const repository={primaryRoot:"/fixture-root",candidate:{commit:"c1"}};
    const g={status:"required",sha256:"c".repeat(64),normalized:{slices:[{id:"S1"},{id:"S2"}]}};
    const read=({slices})=>slices.map(row=>row.id).filter(id=>id==="S2");
    const key=JSON.stringify(["commit-integrated",g.sha256,"c1"]);
    const direct=read({slices:g.normalized.slices});
    const withScan={};mod.adoptPrescanInBoundary({boundary:withScan,repository,governed:g,prescan:mod.prescanCommitIntegratedSlices({repository,governed:g,read}),read});
    const without={};assert.equal(mod.adoptPrescanInBoundary({boundary:without,repository,governed:g,prescan:null,read}).status,"computed");
    assert.deepEqual(mod.memoPerAdmission(withScan,key,()=>[]),direct);
    assert.deepEqual(mod.memoPerAdmission(without,key,()=>[]),direct);
    assert.equal(mod.prescanCommitIntegratedSlices({repository,governed:{status:"absent"},read}),null);
  }},

  { id: "NGHS48", name: "PF-86 c2 (i): the lock-free registry read returns the same admission facts as the in-lock path for an unchanged registry", run: async () => { const mod = await import("./native-goldfish-host-state.mjs"); const reg = await import("./session-authority-registry.mjs"); return fixture((env)=>{
    assert.equal(typeof reg.readSessionAuthorityGeneration,"function");assert.equal(typeof reg.withSessionAuthorityReadScope,"function");assert.equal(typeof mod.prescanAdmissionFacts,"function");assert.equal(typeof mod.adoptAdmissionFacts,"function");
    const {repository,governed}=governedRegistryFixture(env);
    const generation=reg.readSessionAuthorityGeneration({repository});
    assert.match(generation,/^[0-9a-f]{64}$/u);
    const facts=mod.prescanAdmissionFacts({repository,governed,dependsOn:[]});
    assert.equal(facts.generation,generation);
    const viaFacts=reg.withSessionAuthorityBoundary({repository},boundary=>{const status=mod.adoptAdmissionFacts({boundary,repository,governed,facts}).status;return {status,settled:[...mod.readSettledItemSliceIds({repository,boundary,governed})].sort(),native:mod.readNativeIntegratedSlices({governed,repository,boundary,only:new Set()}).integrated};});
    const direct=reg.withSessionAuthorityBoundary({repository},boundary=>({settled:[...mod.readSettledItemSliceIds({repository,boundary,governed})].sort(),native:mod.readNativeIntegratedSlices({governed,repository,boundary,only:new Set()}).integrated}));
    assert.equal(viaFacts.status,"reused");
    assert.deepEqual({settled:viaFacts.settled,native:viaFacts.native},direct);
  })}},

  { id: "NGHS49", name: "PF-86 c2 (ii): a registry generation, queue digest or candidate commit that moved between read and publish is detected and the facts are re-read under the boundary, never adopted", run: async () => { const mod = await import("./native-goldfish-host-state.mjs"); const reg = await import("./session-authority-registry.mjs"); return fixture((env)=>{
    const {repository,governed}=governedRegistryFixture(env);
    const facts=mod.prescanAdmissionFacts({repository,governed,dependsOn:[]});
    const direct=reg.withSessionAuthorityBoundary({repository},boundary=>[...mod.readSettledItemSliceIds({repository,boundary,governed})].sort());
    for(const forged of [{...facts,generation:"0".repeat(64)},{...facts,queueSha256:"1".repeat(64)},{...facts,candidateCommit:"2".repeat(40)}]) {
      const got=reg.withSessionAuthorityBoundary({repository},boundary=>({status:mod.adoptAdmissionFacts({boundary,repository,governed,facts:forged}).status,settled:[...mod.readSettledItemSliceIds({repository,boundary,governed})].sort()}));
      assert.equal(got.status,"recomputed-after-drift");assert.deepEqual(got.settled,direct);
    }
    assert.equal(reg.withSessionAuthorityBoundary({repository},boundary=>mod.adoptAdmissionFacts({boundary,repository,governed,facts:null}).status),"computed");
    // the read scope itself refuses a result whose generation moved while it ran
    assert.throws(()=>reg.withSessionAuthorityReadScope({repository,generationOf:(()=>{let n=0;return ()=>"g"+(n++);})()},()=>"x"),/read-generation-drift/u);
  })}},

  { id: "NGHS50", name: "PF-86 c2 (iii): a slow admission scan does not hold the registry lock, a second admission acquires it while the first scan runs", run: async () => { const mod = await import("./native-goldfish-host-state.mjs"); return fixture((env)=>{
    const {repository,governed}=governedRegistryFixture(env);
    let child=null;
    const facts=mod.prescanAdmissionFacts({repository,governed,dependsOn:[],slowScan:()=>{
      // the URLs are embedded in the script, never passed as extra args: with `-e` an extra arg becomes process.argv[1], and model-family-approval-request.mjs (imported transitively) runs realpathSync(process.argv[1]) in its main-module guard
      const script=`const {withSessionAuthorityBoundary}=await import(${JSON.stringify(new URL("./session-authority-registry.mjs",import.meta.url).href)});const {inspectSignedDescriptorCustodyRepository}=await import(${JSON.stringify(new URL("./worktree-lifecycle.mjs",import.meta.url).href)});withSessionAuthorityBoundary({repository:inspectSignedDescriptorCustodyRepository(${JSON.stringify(env.root)})},()=>{process.stdout.write('entered');});`;
      child=spawnSync(process.execPath,["--input-type=module","-e",script],{encoding:"utf8",timeout:60000});
    }});
    assert.ok(facts);assert.equal(child.stdout,"entered",child.stderr);assert.equal(child.status,0);
  })}},

  { id: "NGHS51", name: "PF-86 c2 (iv): every pre-existing registry and host-state export keeps its name and arity", run: async () => { const mod = await import("./native-goldfish-host-state.mjs"); const reg = await import("./session-authority-registry.mjs");
    for(const name of ["withSessionAuthorityBoundary","inspectSourceOwnedSessionAuthorityProducerRecord","inspectSourceOwnedSessionAuthorityMemberRecord","inspectSourceOwnedSessionAuthorityMemberRecords","initializeSessionAuthorityRegistry"])assert.equal(typeof reg[name],"function",name);
    assert.equal(reg.withSessionAuthorityBoundary.length,2);
    for(const name of ["readNativeIntegratedSlices","readSettledItemSliceIds","memoPerAdmission","prescanCommitIntegratedSlices","adoptPrescanInBoundary","inspectNativeMemberRecords"])assert.equal(typeof mod[name],"function",name);
    assert.equal(mod.memoPerAdmission.length,3);
  }},

  { id: "NGHS52", name: "PF-85 1a: continuationOf is admitted only for a budget or wrong-premise cancelled predecessor; any other predecessor is refused with the sanctioned repair", run: () => fixture(({ root }) => {
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'fixture explicit course'});assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
    const original=prepareApprovedItemCourseFixture({root});
    const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/original-course'),sessionId:'original-course-owner'});
    const delivery=(sliceId,extra={})=>({schema:'pipeline.item-delivery-briefing.v1',sliceId,itemId:'AC-1',criterionLocator:original.criterionLocator,checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}],...extra});
    const prepare=(sliceId,extra)=>runtime.run(()=>prepareGovernedItemQueue({root,itemDelivery:delivery(sliceId,extra),candidate:original.candidate,writeScope:['src/change.mjs']}));
    const cancel=(sliceId,cancelClass)=>runtime.run(()=>cancelUnstartedGovernedItemSlice({root,sliceId,reason:'stopped',cancelClass}));
    const queuePath=join(root,'specs/unit/slice-queue.json'),rowOf=id=>JSON.parse(readFileSync(queuePath,'utf8')).slices.find(entry=>entry.id===id);
    const refusedWith=(label,sliceId,predecessor,reason)=>{
      const before=readFileSync(queuePath,'utf8'),refused=prepare(sliceId,{continuationOf:predecessor});
      assert.equal(refused.status,'refused',`${label}: ${JSON.stringify(refused)}`);assert.equal(refused.code,'NGHS-ITEM-CONTINUATION-PREDECESSOR-INVALID',`${label}: ${JSON.stringify(refused)}`);
      assert.match(refused.reason,reason,label);assert.match(refused.repair,/slice-queue\.mjs cancel <slice id> --class budget/u,label);assert.match(refused.repair,/regenerate the binding/u,label);
      assert.equal(readFileSync(queuePath,'utf8'),before,`${label}: a refused continuation leaves the queue untouched`);
    };
    assert.equal(prepare('ITEM-AC-1').status,'required');
    refusedWith('ready predecessor','ITEM-AC-2','ITEM-AC-1',/ready/u);
    refusedWith('unknown predecessor','ITEM-AC-2','ITEM-NOPE',/ITEM-NOPE/u);
    assert.equal(cancel('ITEM-AC-1','budget').status,'cancelled');
    const budget=prepare('ITEM-AC-2',{continuationOf:'ITEM-AC-1'});
    assert.equal(budget.status,'required',JSON.stringify(budget));
    assert.equal(rowOf('ITEM-AC-2').continuationOf,'ITEM-AC-1');assert.deepEqual(rowOf('ITEM-AC-2').dependsOn,[]);
    const stored=JSON.parse(readFileSync(queuePath,'utf8')),validated=validateSliceQueue(stored);
    assert.equal(validated.ok,true,JSON.stringify(validated.errors));assert.equal(validated.queue.slices.find(entry=>entry.id==='ITEM-AC-2').continuationOf,'ITEM-AC-1');
    assert.equal(cancel('ITEM-AC-2','wrong-premise').status,'cancelled');
    const premise=prepare('ITEM-AC-3',{continuationOf:'ITEM-AC-2'});
    assert.equal(premise.status,'required',JSON.stringify(premise));assert.equal(rowOf('ITEM-AC-3').continuationOf,'ITEM-AC-2');
    assert.equal(cancel('ITEM-AC-3','review-defect').status,'cancelled');
    refusedWith('other-class predecessor','ITEM-AC-4','ITEM-AC-3',/review-defect/u);
    const plain=prepare('ITEM-AC-5');
    assert.equal(plain.status,'required',JSON.stringify(plain));assert.equal('continuationOf' in rowOf('ITEM-AC-5'),false,'a briefing without the field leaves the row without it');
  })},

  { id: "NGHS53", name: "PF-85 1a: validateItemDeliveryBriefing accepts an absent or safe-id continuationOf and refuses any other type or shape", run: async () => {
    const { validateItemDeliveryBriefing } = await import("./native-goldfish-host-return.mjs");
    const base={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-AC-2',itemId:'AC-1',criterionLocator:{schema:'pipeline.critic-criterion-locator.v1',sourcePath:'specs/unit/spec.md',sourceSha256:'a'.repeat(64),criterionId:'AC-1',startByte:0,endByte:10,excerptSha256:'b'.repeat(64)},checks:[{id:'criterion-one',path:'src/change.test.mjs',dependencies:['src/change.mjs','src/change.test.mjs']}]};
    assert.equal(validateItemDeliveryBriefing(base).ok,true,'no field validates as before');
    assert.equal(validateItemDeliveryBriefing({...base,continuationOf:'ITEM-AC-1'}).ok,true,'a safe task id validates');
    for(const bad of [7,'',null,['ITEM-AC-1'],{},'has space','../x','x'.repeat(200),true]){
      const verdict=validateItemDeliveryBriefing({...base,continuationOf:bad});
      assert.equal(verdict.ok,false,JSON.stringify(bad));assert.equal(verdict.code,'NGHR-ITEM-DELIVERY-SHAPE',JSON.stringify(bad));
    }
  }},

  { id: "NGHS54", name: "D195: a command check runs exactly the registered command; the row records the command id and the exact command string", run: () => fixture(({root})=>{
    const h=commandCheckHarness(root),candidate=h.calibrate([{id:'make-check',command:'node check.mjs'}],0);
    const observed=executeGovernedItemDeliveryChecks({root,itemDelivery:h.delivery('make-check'),candidate});
    assert.equal(observed.code,'SQ-TARGETED-CHECKS-PASSED',JSON.stringify(observed));
    const [row]=observed.evidence.results;
    assert.equal(row.commandId,'make-check');assert.equal(row.command,'node check.mjs');assert.equal(row.status,0);assert.equal(row.args,undefined);assert.equal(row.path,'project/pipeline.json');
    assert.ok(observed.evidence.files.some(file=>file.path==='project/pipeline.json'),'the calibration digest binds the run');
    assert.equal(inspectGovernedItemDeliveryChecks({root,handle:observed.handle,candidate,itemDelivery:h.delivery('make-check')}).verdict,'passed');
  })},
  { id: "NGHS55", name: "D195: a failing registered command fails the check", run: () => fixture(({root})=>{
    const h=commandCheckHarness(root),candidate=h.calibrate([{id:'make-check',command:'node check.mjs'}],3);
    const observed=executeGovernedItemDeliveryChecks({root,itemDelivery:h.delivery('make-check'),candidate});
    assert.equal(observed.code,'SQ-TARGETED-CHECKS-FAILED',JSON.stringify(observed));
    assert.equal(observed.evidence.results[0].status,3);assert.equal(observed.evidence.verdict,'failed');
  })},
  { id: "NGHS56", name: "D195: a command id that is no longer registered is refused item-check-command-unregistered", run: () => fixture(({root})=>{
    const h=commandCheckHarness(root);h.calibrate([{id:'make-check',command:'node check.mjs'}],0);
    const candidate=h.calibrate([{id:'other-check',command:'node check.mjs'}],0);
    const refused=executeGovernedItemDeliveryChecks({root,itemDelivery:h.delivery('make-check'),candidate});
    assert.equal(refused.status,'refused',JSON.stringify(refused));assert.match(refused.reason,/item-check-command-unregistered/);
  })},
  { id: "NGHS57", name: "D195: a delivery that changes the calibration path of a command check is refused at first delivery; the .test form is not asked", run: () => fixture(({root})=>{
    const h=commandCheckHarness(root),base=h.calibrate([{id:'make-check',command:'node check.mjs'}],0);
    const candidate=h.calibrate([{id:'make-check',command:'node check.mjs'},{id:'weaker',command:'node -e 0'}],0);
    const refused=executeGovernedItemDeliveryChecks({root,itemDelivery:h.delivery('make-check'),candidate,baseCommit:base.commit});
    assert.equal(refused.status,'refused',JSON.stringify(refused));assert.match(refused.reason,/native-item-check-source-amendment-required/);
    const untouched=executeGovernedItemDeliveryChecks({root,itemDelivery:h.delivery('make-check'),candidate,baseCommit:candidate.commit});
    assert.equal(untouched.code,'SQ-TARGETED-CHECKS-PASSED',JSON.stringify(untouched));
  })},

];

/** D195 fixture: a real calibration (project name = root basename) registering verifyImpact commands over a committed check script. */
function commandCheckHarness(root){
  const name=root.split('/').pop();
  const git=(...args)=>assert.equal(spawnSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c',`core.hooksPath=${devNull}`,'-c','commit.gpgsign=false',...args]).status,0,args.join(' '));
  const calibrate=(baseline,exitCode)=>{
    mkdirSync(join(root,'project'),{recursive:true});
    writeFileSync(join(root,'project/pipeline.json'),JSON.stringify({project:name,verify:'node check.mjs',verifyImpact:{schema:'pipeline.project-verify-impact.v1',baseline,areas:[]}}));
    writeFileSync(join(root,'check.mjs'),`process.exit(${exitCode});\n`);writeFileSync(join(root,'dependency.txt'),'dependency\n');
    git('add','project/pipeline.json','check.mjs','dependency.txt');git('commit','-q','-m','calibrate');
    return inspectSignedDescriptorCustodyRepository(root).candidate;
  };
  const delivery=id=>({schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-A',itemId:'AC-1',criterionLocator:{schema:'pipeline.critic-criterion-locator.v1',sourcePath:'specs/unit/spec.md',sourceSha256:'a'.repeat(64),criterionId:'AC-1',startByte:1,endByte:20,excerptSha256:'b'.repeat(64)},
    checks:[{id:'unit',path:'project/pipeline.json',command:id,dependencies:['check.mjs','dependency.txt','project/pipeline.json']}]});
  return {calibrate,delivery};
}

function governedRegistryFixture({root,commit}){
  const controller=createGovernanceScopeController({hostStateRoot:join(root,"fixture-host")});
  const plan=controller.planDecision({rootDir:root,decision:"enroll",by:"fixture explicit selection"});
  controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
  mkdirSync(join(root,".claude"));mkdirSync(join(root,"specs/unit"),{recursive:true});
  writeFileSync(join(root,".claude/pipeline.yaml"),"schema: pipeline.manifest.v0\n");
  const statePath=join(root,".claude/pipeline-state.json");
  writeFileSync(statePath,JSON.stringify({schema:"pipeline.state.v0",activeFeature:{id:"unit",planPath:"specs/unit/plan.md",phase:"implementation"},planApproved:true,continuity:itemContinuity()}));
  chmodSync(statePath,0o600);
  const item=(id,itemId,path)=>({id,title:id,state:"ready",dependsOn:[],writeScope:[path],tier:"implementor",commitMode:"diff-only",loadClass:"light",delivery:{itemId,criteria:["CR-1"],baseCommit:commit}});
  writeFileSync(join(root,"specs/unit/slice-queue.json"),JSON.stringify({schema:"pipeline.slice-queue.v2",feature:"unit",slices:[item("ITEM-A","AC-1","src/a.mjs"),item("ITEM-B","AC-2","src/b.mjs")]}));
  const repository=inspectSignedDescriptorCustodyRepository(root);
  assert.equal(initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository})).status,"initialized");
  return {repository,governed:resolveGovernedItemQueue({root})};
}

const fd =process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
