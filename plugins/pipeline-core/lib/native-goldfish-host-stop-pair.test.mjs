// SPDX-License-Identifier: SUL-1.0
// C19J-W242 (candidate 19j, AC-108): (A) the second stop of a simultaneous pair lands its host commit on top of its sibling's commit
// instead of refusing native-managed-repository-drift, and a sibling advance that touches its own scope still refuses with a named cause;
// (B) a refused admission leaves the governed queue exactly as it was, whatever a sibling wrote meanwhile.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { prepareNativeGoldfishHostState, resolveGovernedItemQueue, restoreWrittenQueueRows } from "./native-goldfish-host-state.mjs";
import { finalizeNativeGoldfishHostReturn } from "./native-goldfish-host-finalizer.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "./native-goldfish-host-return.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { prepareApprovedItemCourseFixture, nativeContractFixtureParent } from "./test-item-approved-course-fixture.mjs";
import { sliceQueueLocation, readSliceQueueSource, writeWorkingQueue } from "./slice-queue-location.mjs";
import { initializeSessionAuthorityRegistry } from "./session-authority-registry.mjs";
import { createSessionAuthorityParticipantPorts } from "./session-authority-observers.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { createControlledMethodRuntimeFixture } from "./session-requester-bridge.mjs";

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const FILES = ["change", "second", "third", "fourth"];
const CRITERIA = [["AC-2", "second"], ["AC-3", "third"], ["AC-4", "fourth"]];
const criticDecision = { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
  diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" };

function fixture(run) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "native-goldfish-stop-pair-"));
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  let out;
  try {
    mkdirSync(join(root, "evidence"), { mode: 0o700 });
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0, "actual Git topology required by the Source authority observer");
    for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"], ["core.hooksPath", devNull]]) assert.equal(spawnSync("git", ["-C", root, "config", name, value]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "commit", "--allow-empty", "-q", "-m", "fixture"]).status, 0);
    out = run({ root });
  } catch (error) { cleanup(); throw error; }
  if (typeof out?.then === "function") return out.finally(cleanup);
  cleanup();
  return out;
}

const git = (root, ...args) => { const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(run.status, 0, run.stderr); return run.stdout.trim(); };

/** An enrolled approved item course with four disjoint original criteria and an initialized registry; the runtime is the in-process owner. */
function setup(root, { ownRuntime = true } = {}) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host") }), plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "fixture explicit original course" });
  assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  mkdirSync(join(root, "src"), { recursive: true });
  for (const name of FILES.slice(1)) {
    writeFileSync(join(root, `src/${name}.mjs`), "export const value='expected';\n");
    writeFileSync(join(root, `src/${name}.test.mjs`), `import test from 'node:test';import assert from 'node:assert/strict';import {value} from './${name}.mjs';test('${name} original criterion',()=>assert.equal(value,'expected'));\n`);
  }
  const original = prepareApprovedItemCourseFixture({ root, additionalCriteria: CRITERIA.map(([id]) => ({ id, text: `The independent ${id} dependency returns expected bytes.` })) });
  const repository = inspectSignedDescriptorCustodyRepository(root);
  const runtime = ownRuntime ? createControlledMethodRuntimeFixture({ repository, fixtureRoot: join(repository.commonDir, "agent-pipeline/controlled-method-fixtures/stop-pair-owner"), sessionId: "stop-pair-owner" }) : null;
  initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository }));
  /** One launch: slice `id` writing src/<file>.mjs, bound to `candidate` (default the original), as a foreground Task call. */
  const launch = (index, { id = `SLICE-${index}`, candidate = original.candidate, role = "pipeline-core:goldfish-implementor", bindingRole = "pipeline-core:goldfish-implementor" } = {}) => {
    const file = FILES[index], locator = index === 0 ? original.criterionLocator : original.criterionLocators[CRITERIA[index - 1][0]];
    const itemDelivery = { schema: "pipeline.item-delivery-briefing.v1", sliceId: id, itemId: id, criterionLocator: locator, checks: [{ id: "original-criterion", path: `src/${file}.test.mjs`, dependencies: [`src/${file}.mjs`, `src/${file}.test.mjs`] }] };
    const binding = { schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId: id, candidateCommit: candidate.commit, candidateTree: candidate.tree, runner: "claude",
      role: bindingRole, agentType: "goldfish-implementor", model: "sonnet", effort: "medium", rulesetSha: "c".repeat(64), allowedPaths: [`src/${file}.mjs`], criticDecision, itemDelivery };
    const prompt = `Goldfish briefing\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nReturn contract follows.\nSlice: ${id}\nWrite scope: src/${file}.mjs\n`;
    const input = { cwd: root, session_id: `session-${id}`, tool_name: "Task", tool_use_id: `tool-${id}`, tool_input: { subagent_type: role, prompt, run_in_background: false } };
    const returned = { ...input, hook_event_name: "PostToolUse", tool_response: { status: "completed", resolvedModel: binding.model, content: [{ type: "text", text: JSON.stringify({
      schema: "pipeline.native-goldfish-host-return.v1", dispatchId: id, candidateCommit: binding.candidateCommit, outcome: "succeeded", report: "Delivered.", changedPaths: [`src/${file}.mjs`] }) }] } };
    return { id, file: `src/${file}.mjs`, content: `export const value='expected'; // ${id} delivered\n`, binding, input, returned };
  };
  return { original, repository, runtime, launch };
}

const location = (root) => sliceQueueLocation({ root, planDir: "specs/unit" });
/** The queue as a reader sees it: the working copy's bytes (or absence) and the resolved digest. */
const queueState = (root) => ({ working: existsSync(location(root).workingPath) ? readFileSync(location(root).workingPath).toString("base64") : null, sha256: resolveGovernedItemQueue({ root }).sha256 });
const rowIds = (root) => resolveGovernedItemQueue({ root }).queue.slices.map((row) => row.id);
/** A sibling writer appends a disjoint ready row (compare-and-swap on what it read). */
function siblingRow(root, id, scope) {
  const source = readSliceQueueSource(location(root)), queue = JSON.parse(source.bytes.toString("utf8"));
  const template = queue.slices.find((row) => row.tier === "implementor");
  queue.slices.push({ ...structuredClone(template), id, title: id, dependsOn: [], writeScope: [scope] });
  writeWorkingQueue(location(root), Buffer.from(JSON.stringify(queue)), source);
}
const realGit = (root, args) => { const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); return run.error || run.status !== 0 ? null : run.stdout.trim(); };

/** One real stop in its own process: own controlled-method runtime, admits its own launch, waits for the start gate, then stops. Both stops of a pair wait for
 * each other after the terminal preparation and then reach the commit lock together; the commit is held 300 ms inside the lock so the second one meets it. */
function stopChild({ root, tag, dir, other, launchPath, returnedPath }) {
  const url = (name) => JSON.stringify(new URL(name, import.meta.url).href);
  const script = `import {existsSync,readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';`
    + `import {inspectSignedDescriptorCustodyRepository} from ${url("./worktree-lifecycle.mjs")};`
    + `import {createControlledMethodRuntimeFixture} from ${url("./session-requester-bridge.mjs")};`
    + `import {prepareNativeGoldfishHostState,prepareNativeGoldfishAuthorityTerminal} from ${url("./native-goldfish-host-state.mjs")};`
    + `import {finalizeNativeGoldfishHostReturn} from ${url("./native-goldfish-host-finalizer.mjs")};`
    + `import {commitAdmittedNativeGoldfishReturn} from ${url("./agy-host-commit-execution.mjs")};`
    + `const root=${JSON.stringify(root)},dir=${JSON.stringify(dir)},tag=${JSON.stringify(tag)},other=${JSON.stringify(other)};`
    + `const wait=(path,ms)=>{const until=Date.now()+ms;while(!existsSync(path)&&Date.now()<until)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);};`
    + `const repository=inspectSignedDescriptorCustodyRepository(root);if(tag!=='t0')wait(join(dir,'runtime-t0'),60000);`
    + `const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/stop-pair-'+tag),sessionId:'stop-pair-'+tag+'-owner'});if(tag==='t0')writeFileSync(join(dir,'runtime-t0'),'1');`
    + `const launch=JSON.parse(readFileSync(${JSON.stringify(launchPath)},'utf8')),returned=JSON.parse(readFileSync(${JSON.stringify(returnedPath)},'utf8'));`
    + `let result;try{`
    + `const admitted=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input:launch}));if(admitted.ok!==true)throw new Error('admission '+JSON.stringify(admitted));`
    + `writeFileSync(join(dir,'admitted-'+tag),'1');wait(join(dir,'go'),120000);`
    + `result=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned},{`
    + `prepareTerminal:args=>{const done=prepareNativeGoldfishAuthorityTerminal(args);writeFileSync(join(dir,'prepared-'+tag),'1');wait(join(dir,'prepared-'+other),60000);return done;},`
    + `commit:request=>{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);return commitAdmittedNativeGoldfishReturn(request);}}));`
    + `}catch(error){result={thrown:String(error?.code??error?.message)};}`
    + `writeFileSync(join(dir,'out-'+tag+'.json'),JSON.stringify(result));`;
  return spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "ignore", openSync(join(dir, `stderr-${tag}.log`), "w")] });
}

const cases = [
  { id: "NGSP1", name: "C19J-W242 (A): two real stops of one reply with disjoint scopes both land their host commits, the second on top of the first even though the first moved HEAD while the second waited for the commit lock", run: () => fixture(async ({ root }) => {
    const { repository, launch, original } = setup(root, { ownRuntime: false });
    // The markers live outside the repository: the host-commit admission compares the working tree to its baseline and must not see them.
    const dir = mkdtempSync(join(nativeContractFixtureParent(), "native-goldfish-stop-pair-markers-")), launches = [launch(0), launch(1)];
    const children = launches.map((one, index) => {
      writeFileSync(join(dir, `launch-${index}.json`), JSON.stringify(one.input)); writeFileSync(join(dir, `returned-${index}.json`), JSON.stringify(one.returned));
      return stopChild({ root, tag: `t${index}`, dir, other: `t${1 - index}`, launchPath: join(dir, `launch-${index}.json`), returnedPath: join(dir, `returned-${index}.json`) });
    });
    const exits = children.map((child) => new Promise((resolve) => child.once("exit", resolve)));
    try {
      const until = Date.now() + 120000;
      while (!launches.every((_, index) => existsSync(join(dir, `admitted-t${index}`))) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(launches.every((_, index) => existsSync(join(dir, `admitted-t${index}`))), `both launches were admitted: ${launches.map((_, index) => existsSync(join(dir, `out-t${index}.json`)) ? readFileSync(join(dir, `out-t${index}.json`), "utf8") : "no result").join(" | ")} stderr: ${launches.map((_, index) => readFileSync(join(dir, `stderr-t${index}.log`), "utf8").slice(0, 600)).join(" | ")}`);
      for (const one of launches) writeFileSync(join(root, one.file), one.content);
      writeFileSync(join(dir, "go"), "go");
      await Promise.all(exits);
    } finally { for (const child of children) child.kill(); }
    const results = launches.map((_, index) => existsSync(join(dir, `out-t${index}.json`)) ? JSON.parse(readFileSync(join(dir, `out-t${index}.json`), "utf8")) : { thrown: "no result written" });
    rmSync(dir, { recursive: true, force: true });
    for (const result of results) assert.equal(result.status, "authored-commit-recorded", JSON.stringify(results));
    const first = results.find((result) => git(root, "rev-parse", `${result.commit}^`) === original.candidate.commit), second = results.find((result) => result !== first);
    assert.ok(first && second, "one stop landed on the original candidate and the other on top of it");
    assert.equal(git(root, "rev-parse", `${first.commit}^`), original.candidate.commit, "the first stop landed on the original candidate");
    assert.equal(git(root, "rev-parse", `${second.commit}^`), first.commit, "the second stop landed on top of the first's host commit");
    assert.equal(git(root, "rev-parse", "HEAD"), second.commit);
    void repository;
  }) },

  { id: "NGSP2", name: "C19J-W242 (A): a sibling advance that touches this slice's own scope is still refused, and the stop-failure result names the cause", run: () => fixture(({ root }) => {
    const { runtime, launch } = setup(root);
    const one = launch(0);
    assert.equal(runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: one.input })).ok, true);
    // Another writer lands a commit on the slice's own path after the admission.
    writeFileSync(join(root, one.file), "export const value='expected'; // foreign change\n");
    git(root, "add", "--", one.file); git(root, "commit", "-q", "-m", "foreign change on the slice scope");
    writeFileSync(join(root, one.file), one.content);
    const result = runtime.run(() => finalizeNativeGoldfishHostReturn({ root, runner: "claude", input: one.returned }));
    assert.notEqual(result.status, "authored-commit-recorded", JSON.stringify(result));
    assert.equal(result.commit === "unknown" || result.commit === null || result.commit === undefined, true, JSON.stringify(result));
    assert.equal(result.detail?.reason, "native-concurrent-advance-touches-scope", JSON.stringify(result));
  }) },

  { id: "NGSP3", name: "C19J-W242 (B): an admission refused at candidate-git after its queue row was written leaves the queue bytes unchanged, and a successor with an overlapping scope is admitted", run: () => fixture(({ root }) => {
    const { runtime, launch, original } = setup(root);
    const before = queueState(root);
    // HEAD advances through a commit that touches none of the slice's paths: the queue accepts the old briefing, the candidate-git check refuses it.
    writeFileSync(join(root, "unrelated.txt"), "unrelated\n"); git(root, "add", "--", "unrelated.txt"); git(root, "commit", "-q", "-m", "unrelated");
    const refused = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(0).input }));
    assert.equal(refused.ok, false, JSON.stringify(refused)); assert.equal(refused.code, "NGHS-CANDIDATE-MISMATCH", JSON.stringify(refused));
    assert.deepEqual(queueState(root), before, "the refused admission left the queue exactly as it was");
    const candidate = { commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") };
    const successor = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(0, { id: "SLICE-0B", candidate }).input }));
    assert.equal(successor.ok, true, JSON.stringify(successor));
    void original;
  }) },

  { id: "NGSP3B", name: "C19J-W242 (B): an admission refused at the role check after its queue row was written leaves the queue bytes unchanged, and the same slice is admitted again", run: () => fixture(({ root }) => {
    const { runtime, launch } = setup(root);
    const before = queueState(root);
    const refused = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(0, { role: "pipeline-core:goldfish-deep" }).input }));
    assert.equal(refused.ok, false, JSON.stringify(refused)); assert.equal(refused.code, "NGHS-ROLE-MISMATCH", JSON.stringify(refused));
    assert.deepEqual(queueState(root), before, "the refused admission left the queue exactly as it was");
    assert.equal(runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(0, { id: "SLICE-0B" }).input })).ok, true, "a successor on the same scope is not held");
  }) },

  { id: "NGSP4", name: "C19J-W242 (B): a sibling's queue row written between the refused admission's write and its rollback is never removed by the rollback, and the admission's own row is", run: () => fixture(({ root }) => {
    const { runtime, launch } = setup(root);
    writeFileSync(join(root, "unrelated.txt"), "unrelated\n"); git(root, "add", "--", "unrelated.txt"); git(root, "commit", "-q", "-m", "unrelated");
    let wrote = false;
    const refused = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(0).input }, {
      git: (rootArg, args) => { if (!wrote) { wrote = true; siblingRow(root, "SIBLING-ROW", "src/second.mjs"); } return realGit(rootArg, args); } }));
    assert.equal(refused.code, "NGHS-CANDIDATE-MISMATCH", JSON.stringify(refused));
    assert.equal(wrote, true, "the sibling wrote its row after the admission's row");
    const ids = rowIds(root);
    assert.equal(ids.includes("SIBLING-ROW"), true, `the sibling's row survives: ${JSON.stringify(ids)}`);
    assert.equal(ids.includes("SLICE-0"), false, `the refused admission's own row is gone: ${JSON.stringify(ids)}`);
    assert.equal(ids.includes("BATCH-CRITIC"), false, `no critic row the admission added stays: ${JSON.stringify(ids)}`);
    assert.equal(runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(0, { id: "SLICE-0B", candidate: { commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") } }).input })).ok, true);
  }) },

  { id: "NGSP5", name: "C19J-W242 (B): a rollback that leaves the row behind for any reason (lock held, row changed, queue invalid) is counted and named, and receives the rollback window", run: () => {
    const window = { startMs: Date.now(), budgetMs: 300000 }, seen = [];
    const outcomes = [{ status: "restored" }, { status: "refused", code: "SDC-LOCK-HELD" }, { status: "unchanged", code: "SQ-ROLLBACK-CHANGED" }, { status: "unchanged", code: "SQ-ROLLBACK-INVALID" }, { status: "unchanged", code: "SQ-ROLLBACK-ROW-ABSENT" }];
    const retained = restoreWrittenQueueRows(outcomes.map((_, index) => index), { rollback: window }, (row, deadline) => { seen.push(deadline); return outcomes[row]; });
    assert.equal(retained, 3, "the lock, changed and invalid outcomes leave a row behind; a restored row and an already absent row do not");
    assert.equal(seen.every((deadline) => deadline === window), true, "every rollback receives the rollback window to wait within");
  } },
];

const fd =process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
