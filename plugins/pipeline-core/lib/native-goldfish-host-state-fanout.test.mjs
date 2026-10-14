// SPDX-License-Identifier: SUL-1.0
// Pure coverage of the item-queue admission step (orderAndCoverAdmittedSlice) and the disjoint-advance rule
// (candidateAdvancedDisjointly), judged by the real validator in lib/slice-queue.mjs against in-memory v2 queues.
// Deliberately no approved-course fixture: building one costs about 200 s on the Windows host and the host item
// check allows 60 s per check. prepareGovernedItemQueue itself is therefore not driven from this file.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { candidateAdvancedDisjointly, orderAndCoverAdmittedSlice, retryWhileSessionAuthorityLockHeld } from "./native-goldfish-host-state.mjs";
import { ITEM_QUEUE_SCHEMA, validateSliceQueue } from "./slice-queue.mjs";

const BASE = "a".repeat(40);
const NEXT = "b".repeat(40);
const SPEC = "specs/fixture/spec.md";
const CHECK = "src/change.test.mjs";
const sha = ch => ch.repeat(64);

/** The slice shape prepareGovernedItemQueue publishes for an admitted item: the modern v2 delivery binding. */
function itemSlice(id, criterionId, writeScope, extra = {}) {
  return { id, title: criterionId, state: "ready", dependsOn: [], writeScope: [...writeScope], readScope: [SPEC], tier: "implementor", commitMode: "host-commit", loadClass: "light",
    delivery: { itemId: id, criteria: [criterionId], baseCommit: BASE,
      criterionLocator: { schema: "pipeline.critic-criterion-locator.v1", sourcePath: SPEC, sourceSha256: sha("c"), criterionId, startByte: 100, endByte: 240, excerptSha256: sha("d") },
      checks: [{ id: `${id}-check`, path: CHECK, dependencies: [...writeScope, CHECK] }], approvalSha256: sha("e") },
    ...extra };
}
const queueOf = (...slices) => ({ schema: ITEM_QUEUE_SCHEMA, feature: "fanout-fixture", slices });
const codes = raw => validateSliceQueue(raw).errors.map(error => (error.sliceId ? `${error.code}:${error.sliceId}` : error.code)).sort();
const assertValid = raw => assert.deepEqual(codes(raw), [], JSON.stringify(validateSliceQueue(raw).errors));
const admit = (raw, slice, baseCommit) => { raw.slices.push(slice); orderAndCoverAdmittedSlice(raw, slice.id, baseCommit); return raw; };
const criticsOf = raw => raw.slices.filter(row => row.tier === "critic");
const byId = (raw, id) => raw.slices.find(row => row.id === id);
const sorted = list => [...list].sort();

// ---- git fixture for candidateAdvancedDisjointly (a tiny repository under the ignored scratch/ directory)
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
function git(root, ...args) {
  const run = spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", `core.hooksPath=${devNull}`, ...args],
    { env: gitEnv, encoding: "utf8", shell: false, timeout: 30000 });
  assert.equal(run.status, 0, `git ${args[0]} failed: ${run.stderr}`);
  return run.stdout.trim();
}
function commitFile(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
  git(root, "add", "--", path);
  git(root, "commit", "-q", "-m", `change ${path}`);
  return git(root, "rev-parse", "HEAD");
}
function gitFixture(run) {
  const parent = fileURLToPath(new URL("../../../scratch/native-goldfish-fanout-fixtures/", import.meta.url));
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(realpathSync(parent), "advance-"));
  try {
    git(root, "init", "-q");
    return run(root);
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
}

const cases = [
  { id: "NGFO01", name: "SDC-LOCK-HELD is retried within budget and rethrown with the same code afterwards", run: () => {
    let calls = 0;
    const lockHeld = () => { const e = new Error("held"); e.code = "SDC-LOCK-HELD"; throw e; };
    assert.equal(retryWhileSessionAuthorityLockHeld(() => { calls += 1; if (calls < 3) lockHeld(); return "ok"; }, { sleep: () => {} }), "ok");
    let clock = 0;
    assert.throws(() => retryWhileSessionAuthorityLockHeld(lockHeld, { sleep: ms => { clock += ms; }, now: () => clock }), error => error.code === "SDC-LOCK-HELD");
    assert.ok(clock <= 10000);
    const other = () => { const e = new Error("x"); e.code = "OTHER"; throw e; };
    assert.throws(() => retryWhileSessionAuthorityLockHeld(other, { sleep: () => {} }), error => error.code === "OTHER");
  } },
  { id: "NGFO02", name: "overlapping admitted slice is ordered after the live overlap instead of refused", run: () => {
    const raw = queueOf(itemSlice("ITEM-A", "AC-1", ["src/change.mjs"]), itemSlice("ITEM-OLD", "AC-9", ["src/change.mjs"], { state: "cancelled", holdReason: "superseded" }));
    raw.slices.push(itemSlice("ITEM-B", "AC-2", ["src/change.mjs"]));
    assert.deepEqual(codes(raw), ["SQ-OVERLAP"], "an un-ordered overlap is what the admission step has to repair");
    orderAndCoverAdmittedSlice(raw, "ITEM-B", BASE);
    assert.deepEqual(byId(raw, "ITEM-B").dependsOn, ["ITEM-A"], "ordered after the live overlap only; the cancelled overlap is ignored");
    assert.deepEqual(byId(raw, "ITEM-A").dependsOn, [], "only the slice being admitted is edited");
    assert.equal(criticsOf(raw).length, 0, "a non-critical scope needs no critic");
    assertValid(raw);
    // An overlap that already runs before the admitted slice must not be turned into a cycle.
    const cyclic = queueOf(itemSlice("ITEM-A", "AC-1", ["src/change.mjs"], { dependsOn: ["ITEM-B"] }), itemSlice("ITEM-B", "AC-2", ["src/change.mjs"]));
    orderAndCoverAdmittedSlice(cyclic, "ITEM-B", BASE);
    assert.deepEqual(byId(cyclic, "ITEM-B").dependsOn, []);
    assertValid(cyclic);
  } },
  { id: "NGFO03", name: "critical-path slice gets one shared critic slice that later critical slices join", run: () => {
    const raw = queueOf();
    admit(raw, itemSlice("ITEM-G1", "AC-1", ["hooks/guard-one.mjs"]), BASE);
    assertValid(raw);
    admit(raw, itemSlice("ITEM-G2", "AC-2", ["hooks/guard-two.mjs"]), BASE);
    assertValid(raw);
    const critics = criticsOf(raw);
    assert.equal(critics.length, 1);
    assert.equal(critics[0].id, "BATCH-CRITIC");
    assert.ok(critics[0].tierReason);
    assert.deepEqual(sorted(critics[0].dependsOn), ["ITEM-G1", "ITEM-G2"]);
  } },
  { id: "NGFO04", name: "a lib/guard slice yields a validator-clean queue whose shared critic carries a valid delivery", run: () => {
    const raw = queueOf(itemSlice("ALF-C-OTHER", "AC-7", ["docs/elsewhere.md"]), itemSlice("ALF-C-HK-01", "AC-224", ["plugins/pipeline-core/lib/guard/command-catalogue.mjs"]));
    assert.deepEqual(codes(raw), ["SQ-TIER:ALF-C-HK-01"], "a critical-path slice without a critic is the starting point");
    orderAndCoverAdmittedSlice(raw, "ALF-C-HK-01", BASE);
    assertValid(raw);
    const [critic, ...extra] = criticsOf(raw);
    assert.equal(extra.length, 0);
    assert.equal(critic.id, "BATCH-CRITIC");
    assert.deepEqual(critic.dependsOn, ["ALF-C-HK-01"]);
    assert.deepEqual(critic.delivery, { itemId: "BATCH-CRITIC", baseCommit: BASE, criteria: ["AC-224"] });
    assert.equal(critic.state, "ready");
    assert.equal(critic.commitMode, "diff-only");
    assert.deepEqual(critic.writeScope, []);
    assert.equal(byId(raw, "ALF-C-OTHER").dependsOn.length, 0, "an unrelated slice is untouched");
    // The pre-fix function built exactly this critic minus its delivery; the validator then refuses the whole
    // queue, so this case would be RED without the fix.
    const preFix = structuredClone(raw);
    delete byId(preFix, "BATCH-CRITIC").delivery;
    assert.deepEqual(codes(preFix), ["SQ-DELIVERY:BATCH-CRITIC"]);
  } },
  { id: "NGFO05", name: "a second critical slice extends the same critic: union of criteria, first base commit kept, still valid", run: () => {
    const raw = queueOf();
    admit(raw, itemSlice("G1", "AC-224", ["plugins/pipeline-core/lib/guard/one.mjs"]), BASE);
    admit(raw, itemSlice("G2", "AC-225", ["hooks/guard-two.mjs"]), NEXT);
    assertValid(raw);
    assert.equal(criticsOf(raw).length, 1);
    const critic = byId(raw, "BATCH-CRITIC");
    assert.deepEqual(sorted(critic.dependsOn), ["G1", "G2"]);
    assert.deepEqual(critic.delivery, { itemId: "BATCH-CRITIC", baseCommit: BASE, criteria: ["AC-224", "AC-225"] }, "criteria extended; the critic keeps its original base commit");
    // The same criterion arriving again must not duplicate (the validator demands unique ids).
    admit(raw, itemSlice("G3", "AC-224", ["plugins/pipeline-core/lib/guard/three.mjs"]), NEXT);
    assertValid(raw);
    assert.deepEqual(byId(raw, "BATCH-CRITIC").delivery.criteria, ["AC-224", "AC-225"]);
    assert.deepEqual(sorted(byId(raw, "BATCH-CRITIC").dependsOn), ["G1", "G2", "G3"]);
    // The validator bounds a delivery to 64 criteria; a wider batch must still validate.
    const wide = queueOf(...Array.from({ length: 65 }, (_, index) => itemSlice(`W${index + 1}`, `AC-${index + 1}`, [`plugins/pipeline-core/lib/guard/wide-${index + 1}.mjs`])));
    orderAndCoverAdmittedSlice(wide, "W65", BASE);
    assert.ok(byId(wide, "BATCH-CRITIC").delivery.criteria.length <= 64);
    assert.equal(byId(wide, "BATCH-CRITIC").dependsOn.length, 65);
    assertValid(wide);
  } },
  { id: "NGFO06", name: "an already-present critic is extended in its own shape instead of being replaced", run: () => {
    const critic = (id, extra = {}) => ({ id, title: "Shared batch Critic review", state: "ready", dependsOn: [], writeScope: [], tier: "critic", tierReason: "batch review", commitMode: "diff-only", loadClass: "light", ...extra });
    // (i) a critic persisted without any delivery gains the basic binding to the admitting candidate
    const bare = queueOf(itemSlice("G1", "AC-224", ["hooks/guard-one.mjs"]), critic("BATCH-CRITIC", { dependsOn: ["G1"] }));
    admit(bare, itemSlice("G2", "AC-225", ["hooks/guard-two.mjs"]), NEXT);
    assertValid(bare);
    assert.deepEqual(byId(bare, "BATCH-CRITIC").delivery, { itemId: "BATCH-CRITIC", baseCommit: NEXT, criteria: ["AC-224", "AC-225"] });
    // (ii) a differently named critic is the one extended; no second critic appears
    const named = queueOf(itemSlice("G1", "AC-224", ["hooks/guard-one.mjs"]),
      critic("REVIEW-9", { dependsOn: ["G1"], delivery: { itemId: "REVIEW-9", baseCommit: BASE, criteria: ["AC-224"] } }));
    admit(named, itemSlice("G2", "AC-225", ["hooks/guard-two.mjs"]), NEXT);
    assertValid(named);
    assert.deepEqual(criticsOf(named).map(row => row.id), ["REVIEW-9"]);
    assert.deepEqual(sorted(byId(named, "REVIEW-9").dependsOn), ["G1", "G2"]);
    assert.deepEqual(byId(named, "REVIEW-9").delivery, { itemId: "REVIEW-9", baseCommit: BASE, criteria: ["AC-224", "AC-225"] });
    // (iii) a legacy-unbound critic keeps its delivery byte for byte; only the ordering edge is added
    const legacyDelivery = { status: "unbound-legacy", itemId: "BATCH-CRITIC", legacyQueueSha256: sha("f") };
    const legacy = queueOf(critic("BATCH-CRITIC", { state: "deferred", holdReason: "Original item binding is required.", delivery: structuredClone(legacyDelivery) }));
    admit(legacy, itemSlice("G1", "AC-224", ["hooks/guard-one.mjs"]), NEXT);
    assertValid(legacy);
    assert.deepEqual(byId(legacy, "BATCH-CRITIC").delivery, legacyDelivery);
    assert.deepEqual(byId(legacy, "BATCH-CRITIC").dependsOn, ["G1"]);
  } },
  { id: "NGFO07", name: "a non-critical slice creates no critic and edits no other slice", run: () => {
    const raw = queueOf(itemSlice("OLD-GUARD", "AC-3", ["hooks/guard-old.mjs"], { state: "cancelled", holdReason: "superseded" }), itemSlice("ITEM-A", "AC-1", ["docs/a.md"]));
    const before = structuredClone(raw.slices);
    admit(raw, itemSlice("ITEM-N", "AC-4", ["plugins/pipeline-core/lib/native-goldfish-host-state.mjs"]), BASE);
    assert.equal(criticsOf(raw).length, 0, "a cancelled critical slice does not count, and the admitted scope is not critical");
    assert.equal(raw.slices.length, before.length + 1);
    assert.deepEqual(raw.slices.slice(0, before.length), before);
    assert.deepEqual(byId(raw, "ITEM-N").dependsOn, []);
    assertValid(raw);
  } },
  { id: "NGFO08", name: "a checkout that advanced only through disjoint commits still admits; an overlapping or unrelated advance refuses", run: () => gitFixture(root => {
    const scope = ["src/change.mjs", CHECK];
    const base = commitFile(root, "src/change.mjs", "v0\n");
    git(root, "commit", "-q", "--allow-empty", "-m", "empty advance");
    const empty = git(root, "rev-parse", "HEAD");
    const disjoint = commitFile(root, "docs/unrelated.md", "elsewhere\n");
    const admits = (from, to, paths = scope) => candidateAdvancedDisjointly(root, { commit: from }, { candidate: { commit: to } }, paths);
    assert.equal(admits(base, empty), true, "an empty intervening commit touches nothing");
    assert.equal(admits(base, disjoint), true, "a disjoint intervening commit admits");
    const overlapping = commitFile(root, "src/change.mjs", "v1\n");
    assert.equal(admits(base, overlapping), false, "an overlapping intervening commit refuses");
    assert.equal(admits(disjoint, overlapping), false, "only the commits after the candidate count, and this one overlaps");
    assert.equal(admits(base, overlapping, ["src/"]), false, "a directory scope covers the changed file");
    assert.equal(admits(base, disjoint, ["lib/other.mjs"]), true, "the same history admits for a different, disjoint scope");
    assert.equal(admits(overlapping, base), false, "a candidate that is not an ancestor of the checkout refuses");
    assert.equal(admits("f".repeat(40), overlapping), false, "an unknown commit refuses");
    assert.equal(admits("HEAD", overlapping), false, "a non-hash candidate refuses");
    assert.equal(candidateAdvancedDisjointly(root, { commit: base }, {}, scope), false, "a repository without a candidate refuses");
  }) },
];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
