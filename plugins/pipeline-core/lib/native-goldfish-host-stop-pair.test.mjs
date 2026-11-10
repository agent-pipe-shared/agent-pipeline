// SPDX-License-Identifier: SUL-1.0
// C19J-W242 (candidate 19j, AC-108): (A) the second stop of a simultaneous pair lands its host commit on top of its sibling's commit
// instead of refusing native-managed-repository-drift, and a sibling advance that touches its own scope still refuses with a named cause;
// (B) a refused admission leaves the governed queue exactly as it was, whatever a sibling wrote meanwhile.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
/** A HEAD that is no descendant of any briefing candidate, so the candidate-git check refuses. */
const foreignHead = (root, args) => args.join(" ") === "rev-parse --verify HEAD^{commit}" ? "f".repeat(40) : realGit(root, args);

// C19K-W245: the registry as a LATER, separate process reads it (the inspect and heal commands each start with no in-memory operations).
const SAR = new URL("../scripts/session-authority-repair.mjs", import.meta.url).pathname, ROUTINE = new URL("../scripts/routine-repair.mjs", import.meta.url).pathname;
const runCli = (script, args) => { const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" }); let json = null; try { json = JSON.parse(r.stdout); } catch { /* reported with the stderr below */ } return { status: r.status, json, text: `${r.stdout.slice(0, 1500)} ${r.stderr.slice(0, 600)}` }; };
const inspectRegistry = (root) => runCli(SAR, ["inspect", "--root", root]);
const registryProblems = (inspect) => (inspect.json?.registry?.producers ?? []).filter((row) => row.status !== "ok");
/** C19K-W246: the receipt of the later stop of a pair names the earlier stop's host commit as its sibling proof (the settle keeps the lineage). */
function assertSiblingProof(repository, commit) {
  const dir = join(repository.commonDir, "agent-pipeline/run/native-goldfish-host-commit");
  const proofs = readdirSync(dir).filter((name) => name.startsWith("observation-")).map((name) => JSON.parse(readFileSync(join(dir, name), "utf8"))).flatMap((row) => row.foreignCommits ?? []);
  assert.ok(proofs.some((row) => row.commit === commit), `a receipt names the first stop's commit as foreign: ${JSON.stringify(proofs)}`);
}
/** Two admitted launches that both land their host commits, one after the other in the given order (the second one lands on top of the first's commit). */
function landPair(runtime, root, pair) {
  for (const one of pair) { const admitted = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: one.input })); assert.equal(admitted.ok, true, `${one.id} admitted: ${JSON.stringify(admitted).slice(0, 900)}`); }
  for (const one of pair) writeFileSync(join(root, one.file), one.content);
  return pair.map((one) => { const result = runtime.run(() => finalizeNativeGoldfishHostReturn({ root, runner: "claude", input: one.returned })); assert.equal(result.status, "authored-commit-recorded", `${one.id}: ${JSON.stringify(result)}`); return result; });
}

/** One real stop in its own process: own controlled-method runtime, admits its own launch, waits for the start gate, then stops. Both stops of a pair wait for
 * each other after the terminal preparation and then reach the commit lock together; the commit is held 300 ms inside the lock so the second one meets it. */
function stopChild({ root, tag, dir, other, launchPath, returnedPath, mode = "sync" }) {
  // C19K-W246 (A): mode "early" stops without waiting for the other and marks its host commit; mode "late" starts its terminal preparation (on the repository the
  // finalizer inspected before) only once the early stop has finished (its host commit moved HEAD), so it holds a repository inspected before that commit. Waiting for the early stop's own post-commit writes keeps this case off the separate authority-terminal-release race (see the notes).
  const prepareTerminal = mode === "late" || mode === "late-sim" ? `args=>{wait(join(dir,${mode === "late" ? "'out-'+other+'.json'" : "'committed-'+other"}),60000);return prepareNativeGoldfishAuthorityTerminal(args);}`
    : mode === "early" ? `args=>prepareNativeGoldfishAuthorityTerminal(args)`
    : `args=>{const done=prepareNativeGoldfishAuthorityTerminal(args);writeFileSync(join(dir,'prepared-'+tag),'1');wait(join(dir,'prepared-'+other),60000);return done;}`;
  const commit = mode === "early" ? `request=>{const landed=commitAdmittedNativeGoldfishReturn(request);writeFileSync(join(dir,'committed-'+tag),'1');return landed;}`
    : `request=>{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);return commitAdmittedNativeGoldfishReturn(request);}`;
  const url = (name) => JSON.stringify(new URL(name, import.meta.url).href);
  const script = `import {existsSync,readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';`
    + `import {inspectSignedDescriptorCustodyRepository} from ${url("./worktree-lifecycle.mjs")};`
    + `import {createControlledMethodRuntimeFixture} from ${url("./session-requester-bridge.mjs")};`
    + `import {prepareNativeGoldfishHostState,prepareNativeGoldfishAuthorityTerminal} from ${url("./native-goldfish-host-state.mjs")};`
    + `import {finalizeNativeGoldfishHostReturn} from ${url("./native-goldfish-host-finalizer.mjs")};`
    + `import {commitAdmittedNativeGoldfishReturn} from ${url("./agy-host-commit-execution.mjs")};`
    + `const root=${JSON.stringify(root)},dir=${JSON.stringify(dir)},tag=${JSON.stringify(tag)},other=${JSON.stringify(other)};`
    + `const wait=(path,ms)=>{const until=Date.now()+ms;while(!existsSync(path)&&Date.now()<until)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);};`
    + `const lead=tag.slice(0,-1)+'0';` // the first stop of a round ("t0", or "r2t0" in a later round) creates its runtime first
    + `const repository=inspectSignedDescriptorCustodyRepository(root);if(tag!==lead)wait(join(dir,'runtime-'+lead),60000);`
    + `const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/stop-pair-'+tag),sessionId:'stop-pair-'+tag+'-owner'});if(tag===lead)writeFileSync(join(dir,'runtime-'+lead),'1');`
    + `const launch=JSON.parse(readFileSync(${JSON.stringify(launchPath)},'utf8')),returned=JSON.parse(readFileSync(${JSON.stringify(returnedPath)},'utf8'));`
    + `let result;try{`
    + `const admitted=runtime.run(()=>prepareNativeGoldfishHostState({root,runner:'claude',input:launch}));if(admitted.ok!==true)throw new Error('admission '+JSON.stringify(admitted));`
    + `writeFileSync(join(dir,'admitted-'+tag),'1');wait(join(dir,'go'),120000);`
    + `result=runtime.run(()=>finalizeNativeGoldfishHostReturn({root,runner:'claude',input:returned},{`
    + `prepareTerminal:${prepareTerminal},`
    + `commit:${commit}}));`
    + `}catch(error){result={thrown:String(error?.code??error?.message)};}`
    + `writeFileSync(join(dir,'out-'+tag+'.json'),JSON.stringify(result));`;
  return spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "ignore", openSync(join(dir, `stderr-${tag}.log`), "w")] });
}

/** Both launches stop for real, each in its own process (see stopChild); `round` keeps the runtimes of a later pair apart from an earlier one's. Returns both results. */
async function concurrentPair(root, launches, round = "", { staged = false } = {}) {
  // The markers live outside the repository: the host-commit admission compares the working tree to its baseline and must not see them.
  const dir = mkdtempSync(join(nativeContractFixtureParent(), "native-goldfish-stop-pair-markers-")), tags = launches.map((_, index) => `${round}t${index}`);
  const children = launches.map((one, index) => {
    writeFileSync(join(dir, `launch-${index}.json`), JSON.stringify(one.input)); writeFileSync(join(dir, `returned-${index}.json`), JSON.stringify(one.returned));
    return stopChild({ root, tag: tags[index], dir, other: tags[1 - index], launchPath: join(dir, `launch-${index}.json`), returnedPath: join(dir, `returned-${index}.json`), mode: staged ? (index === 0 ? "early" : staged === "simultaneous" ? "late-sim" : "late") : "sync" });
  });
  const exits = children.map((child) => new Promise((resolve) => child.once("exit", resolve)));
  try {
    const until = Date.now() + 120000;
    while (!tags.every((tag) => existsSync(join(dir, `admitted-${tag}`))) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(tags.every((tag) => existsSync(join(dir, `admitted-${tag}`))), `both launches were admitted: ${tags.map((tag) => existsSync(join(dir, `out-${tag}.json`)) ? readFileSync(join(dir, `out-${tag}.json`), "utf8") : "no result").join(" | ")} stderr: ${tags.map((tag) => readFileSync(join(dir, `stderr-${tag}.log`), "utf8").slice(0, 600)).join(" | ")}`);
    for (const one of launches) writeFileSync(join(root, one.file), one.content);
    writeFileSync(join(dir, "go"), "go");
    await Promise.all(exits);
  } finally { for (const child of children) child.kill(); }
  const results = tags.map((tag) => existsSync(join(dir, `out-${tag}.json`)) ? JSON.parse(readFileSync(join(dir, `out-${tag}.json`), "utf8")) : { thrown: "no result written" });
  rmSync(dir, { recursive: true, force: true });
  return results;
}

const cases = [
  { id: "NGSP1", name: "C19J-W242 (A): two real stops of one reply with disjoint scopes both land their host commits, the second on top of the first even though the first moved HEAD while the second waited for the commit lock", run: () => fixture(async ({ root }) => {
    const { repository, launch, original } = setup(root, { ownRuntime: false });
    const results = await concurrentPair(root, [launch(0), launch(1)]);
    for (const result of results) assert.equal(result.status, "authored-commit-recorded", JSON.stringify(results));
    const first = results.find((result) => git(root, "rev-parse", `${result.commit}^`) === original.candidate.commit), second = results.find((result) => result !== first);
    assert.ok(first && second, "one stop landed on the original candidate and the other on top of it");
    assert.equal(git(root, "rev-parse", `${first.commit}^`), original.candidate.commit, "the first stop landed on the original candidate");
    assert.equal(git(root, "rev-parse", `${second.commit}^`), first.commit, "the second stop landed on top of the first's host commit");
    assert.equal(git(root, "rev-parse", "HEAD"), second.commit);
    assertSiblingProof(repository, first.commit);
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
    // QG-04, candidate 23 (PO tile 2026-11-09): a commit outside the slice's paths now admits (NGSP3A), so the candidate-git check is reached
    // with a HEAD the briefing cannot descend to. The intent of this case, the rollback of the row after that refusal, is unchanged.
    writeFileSync(join(root, "unrelated.txt"), "unrelated\n"); git(root, "add", "--", "unrelated.txt"); git(root, "commit", "-q", "-m", "unrelated");
    const refused = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(0).input }, { git: foreignHead }));
    assert.equal(refused.ok, false, JSON.stringify(refused)); assert.equal(refused.code, "NGHS-CANDIDATE-MISMATCH", JSON.stringify(refused));
    assert.deepEqual(queueState(root), before, "the refused admission left the queue exactly as it was");
    const candidate = { commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") };
    const successor = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: launch(0, { id: "SLICE-0B", candidate }).input }));
    assert.equal(successor.ok, true, JSON.stringify(successor));
    void original;
  }) },

  { id: "NGSP3A", name: "candidate 23 (PO tile 2026-11-09): a briefing behind a checkout that advanced only outside its paths is admitted, and its host commit lands on that advance", run: () => fixture(({ root }) => {
    const { runtime, launch } = setup(root);
    const one = launch(0);
    writeFileSync(join(root, "unrelated.txt"), "unrelated\n"); git(root, "add", "--", "unrelated.txt"); git(root, "commit", "-q", "-m", "unrelated");
    const advanced = git(root, "rev-parse", "HEAD");
    const admitted = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: one.input }));
    assert.equal(admitted.ok, true, JSON.stringify(admitted));
    writeFileSync(join(root, one.file), one.content);
    const result = runtime.run(() => finalizeNativeGoldfishHostReturn({ root, runner: "claude", input: one.returned }));
    assert.equal(result.status, "authored-commit-recorded", JSON.stringify(result));
    assert.equal(git(root, "rev-parse", `${result.commit}^`), advanced, "the host commit sits on the advanced checkout");
  }) },

  { id: "NGSP3A2", name: "candidate 23: an advance that touches the briefing's own path stays refused before anything is admitted", run: () => fixture(({ root }) => {
    const { runtime, launch } = setup(root);
    const one = launch(0);
    writeFileSync(join(root, one.file), "export const value='foreign';\n"); git(root, "add", "--", one.file); git(root, "commit", "-q", "-m", "foreign change on the slice scope");
    const refused = runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: one.input }));
    assert.equal(refused.ok, false, JSON.stringify(refused));
    assert.equal(refused.code, "SQ-ITEM-CANDIDATE-DRIFT", JSON.stringify(refused));
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
      // QG-04, candidate 23: the refusal is reached through a foreign HEAD, see NGSP3.
      git: (rootArg, args) => { if (!wrote) { wrote = true; siblingRow(root, "SIBLING-ROW", "src/second.mjs"); } return foreignHead(rootArg, args); } }));
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

  // C19K-W245 (AC-108): the receipt of the second stop of a pair names its sibling's pending state. A registry read in a process that holds no operation
  // yet used to look that sibling up before the scan had reached it, so whether the registry stayed readable depended on the order of two file names.
  // Both orders of one pair run, so exactly one of them has the receipt-bearing state ahead of its sibling's.
  { id: "NGSP6", name: "C19K-W245: after a pair whose second stop landed on its sibling's commit, a later process reads the registry, in either order of the two pending states", run: () => {
    for (const order of [[0, 1], [1, 0]]) fixture(({ root }) => {
      const { runtime, launch } = setup(root), launches = [launch(0), launch(1)];
      landPair(runtime, root, order.map((index) => launches[index]));
      const inspect = inspectRegistry(root);
      assert.equal(inspect.status, 0, `order ${order}: ${inspect.text}`);
      assert.deepEqual(registryProblems(inspect), [], `order ${order}: the registry stays readable after the pair: ${inspect.text}`);
    });
  } },

  { id: "NGSP7", name: "C19K-W245: with no registry member left for the settled pending states of a pair (registry initialized anew) a later admission is not refused, and the ordinary heal keeps the registry readable across another pair", run: () => fixture(async ({ root }) => {
      const { launch, repository } = setup(root, { ownRuntime: false });
      for (const result of await concurrentPair(root, [launch(0), launch(1)], "a")) assert.equal(result.status, "authored-commit-recorded", JSON.stringify(result));
      // The settled pending states stay while the registry holds no member for them: it is initialized anew, as after a move-aside.
      const registry = join(repository.commonDir, "agent-pipeline/session-authority");
      rmSync(registry, { recursive: true, force: true });
      const current = inspectSignedDescriptorCustodyRepository(root); // HEAD moved with the pair
      initializeSessionAuthorityRegistry({ repository: current }, createSessionAuthorityParticipantPorts({ repository: current }));
      const empty = inspectRegistry(root);
      assert.deepEqual(registryProblems(empty), [], `a registry without members for the settled pending states reads: ${empty.text}`);
      // A second pair over the leftovers: each later pair is bound to the commit the earlier one left.
      const next = () => ({ candidate: { commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") } });
      for (const result of await concurrentPair(root, [launch(2, next()), launch(3, next())], "b")) assert.equal(result.status, "authored-commit-recorded", JSON.stringify(result));
      const over = inspectRegistry(root);
      assert.deepEqual(registryProblems(over), [], `readable after a pair over the leftover settled pending states: ${over.text}`);
      // The ordinary heal retires the settled pending states on its own, and the registry stays readable across one more pair.
      const healed = runCli(ROUTINE, ["run", "heal", "--root", root, "--reason", "C19K-W245 heal after pairs"]);
      assert.equal(healed.status, 0, healed.text);
      assert.ok((healed.json?.settledPending?.retiredPending ?? []).length >= 4, `heal retired the settled pending states: ${healed.text}`);
      assert.deepEqual(registryProblems(inspectRegistry(root)), [], "readable after the ordinary heal");
      for (const result of await concurrentPair(root, [launch(0, { id: "SLICE-0C", ...next() }), launch(1, { id: "SLICE-1C", ...next() })], "c")) assert.equal(result.status, "authored-commit-recorded", JSON.stringify(result));
      const after = inspectRegistry(root);
      assert.deepEqual(registryProblems(after), [], `readable after the heal and another pair: ${after.text}`);
  }) },

  // The lineage check is the one the scan runs for a receipt that names a sibling: a receipt whose sibling pending state is gone still refuses by name.
  { id: "NGSP8", name: "C19K-W245: a receipt that names a sibling pending state which is not there still refuses the registry read by name (the check is not weakened)", run: () => fixture(({ root }) => {
    const { runtime, launch, repository } = setup(root);
    landPair(runtime, root, [launch(0), launch(1)]);
    const dir = join(repository.commonDir, "agent-pipeline/run/native-goldfish-host-commit"), names = readdirSync(dir);
    const proof = names.filter((name) => name.startsWith("observation-")).map((name) => JSON.parse(readFileSync(join(dir, name), "utf8"))).flatMap((row) => row.foreignCommits ?? [])[0];
    assert.ok(proof, "the second stop's receipt names its sibling");
    const sibling = names.filter((name) => name.startsWith("pending-")).find((name) => createHash("sha256").update(readFileSync(join(dir, name))).digest("hex") === proof.pendingSha256);
    assert.ok(sibling, "the sibling's pending state is on disk");
    for (const name of names) if (name === sibling || (name.startsWith("authority-") && name.includes(proof.pendingSha256))) rmSync(join(dir, name));
    const inspect = inspectRegistry(root);
    assert.deepEqual(registryProblems(inspect).map((row) => [row.producerId, row.reason]), [["native-goldfish", "native-concurrent-receipt-lineage"]], inspect.text);
  }) },

  // C19K-W246 (AC-108): a HEAD advance that touches none of the slice's write scope, check or dependency paths is accepted wherever it comes from.
  { id: "NGSP9", name: "C19K-W246 (A): a second stop whose terminal preparation holds a repository inspected before the first stop's host commit moved HEAD rebinds and lands its own host commit on top", run: () => fixture(async ({ root }) => {
    const { launch, original } = setup(root, { ownRuntime: false });
    const results = await concurrentPair(root, [launch(0), launch(1)], "", { staged: true });
    for (const result of results) assert.equal(result.status, "authored-commit-recorded", JSON.stringify(results));
    assert.equal(git(root, "rev-parse", `${results[0].commit}^`), original.candidate.commit, "the early stop landed on the original candidate");
    assert.equal(git(root, "rev-parse", `${results[1].commit}^`), results[0].commit, "the late stop landed on top of the early stop's host commit");
    assert.equal(git(root, "rev-parse", "HEAD"), results[1].commit);
  }) },

  { id: "NGSP9B", name: "C19K-W246 (B): an ordinary commit on another path between the slice's base and its stop (not a Goldfish host commit) does not stop the host commit", run: () => fixture(({ root }) => {
    const { runtime, launch, original } = setup(root);
    const one = launch(0);
    assert.equal(runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: one.input })).ok, true);
    writeFileSync(join(root, "plan-note.txt"), "an ordinary orchestrator commit\n"); git(root, "add", "--", "plan-note.txt"); git(root, "commit", "-q", "-m", "plan document");
    const advanced = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, one.file), one.content);
    const result = runtime.run(() => finalizeNativeGoldfishHostReturn({ root, runner: "claude", input: one.returned }));
    assert.equal(result.status, "authored-commit-recorded", JSON.stringify(result));
    assert.equal(git(root, "rev-parse", `${result.commit}^`), advanced, "the host commit sits on the advanced HEAD");
    assert.notEqual(advanced, original.candidate.commit);
    assert.deepEqual(registryProblems(inspectRegistry(root)), [], "the registry reads after a host commit on an advanced HEAD without sibling proof");
  }) },

  { id: "NGSP9C", name: "C19K-W246 (B): an ordinary commit that touches the slice's check path still refuses with a named stop-failure record, and commits nothing", run: () => fixture(({ root }) => {
    const { runtime, launch } = setup(root);
    const one = launch(0);
    assert.equal(runtime.run(() => prepareNativeGoldfishHostState({ root, runner: "claude", input: one.input })).ok, true);
    writeFileSync(join(root, "src/change.test.mjs"), "// an ordinary commit on the slice's check\n"); git(root, "add", "--", "src/change.test.mjs"); git(root, "commit", "-q", "-m", "ordinary commit on the check");
    const head = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, one.file), one.content);
    const result = runtime.run(() => finalizeNativeGoldfishHostReturn({ root, runner: "claude", input: one.returned }));
    assert.notEqual(result.status, "authored-commit-recorded", JSON.stringify(result));
    assert.equal(result.detail?.reason, "native-concurrent-advance-touches-scope", JSON.stringify(result));
    assert.equal(git(root, "rev-parse", "HEAD"), head, "nothing was committed on top of the advance");
  }) },

  // The real Windows case: the second stop starts its terminal preparation while the first stop is inside, and then finishing, its host commit.
  { id: "NGSP9D", name: "C19K-W246 (A): simultaneous: a second stop whose terminal preparation starts once the first stop's host commit moved HEAD, while that stop is still writing, lands its own host commit with the first one as its sibling proof", run: () => fixture(async ({ root }) => {
    const { repository, launch, original } = setup(root, { ownRuntime: false });
    const results = await concurrentPair(root, [launch(0), launch(1)], "", { staged: "simultaneous" });
    for (const result of results) assert.equal(result.status, "authored-commit-recorded", JSON.stringify(results));
    assert.equal(git(root, "rev-parse", `${results[0].commit}^`), original.candidate.commit);
    assert.equal(git(root, "rev-parse", `${results[1].commit}^`), results[0].commit, "the late stop landed on top of the early stop's host commit");
    assertSiblingProof(repository, results[0].commit);
    assert.deepEqual(registryProblems(inspectRegistry(root)), [], "the registry reads after the simultaneous pair");
  }) },
];

const fd =process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
