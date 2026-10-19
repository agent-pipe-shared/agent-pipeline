// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.design-phase-runs-critic-advisor-and-readiness-instead-of-one-review (AC-155).
// The ordinary design phase needs exactly one review receipt (at most one delta follow-up), no mandatory
// Advisor stage and no readiness ceremony; the design course is retired; the signed object carries only
// the review chain. Real modules, no mocks of the behavior under test.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as receiptLib from "../design-review-receipt.mjs";
import * as fitness from "../../scripts/architecture-fitness.mjs";
import { createReceiptFromDisk } from "../../scripts/design-review-receipt.mjs";

import { createDesignApprovalBinding, createDesignApprovalRequest, verifyDesignApprovalRequest } from "../design-approval-binding.mjs";
import { DESIGN_REVIEW_MAX_ROUNDS, createDesignReviewReceipt } from "../design-review-receipt.mjs";
import { RETIRED_DESIGN_ROUTE_HINT } from "../retired-design-codes.mjs";
import { inspectDesignCourse, main as courseMain } from "../../scripts/design-course-coordinator.mjs";
import { evaluateDesignAdvisoryAdmission } from "../design-advisory-admission.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const ref = (path, text) => ({ path, sha256: sha(text) });
const sources = (specText) => ({ prd: ref("specs/f1/prd.md", "prd"), spec: ref("specs/f1/spec.md", specText), companions: [] });
const reviewer = { runner: "claude", model: "claude-sonnet-5-5" };
const report = ref("specs/f1/review-1.md", "report");

function receipt(specText, previous = null, ids = []) {
  const made = createDesignReviewReceipt({
    featureId: "f1", previous, sources: sources(specText), reviewer,
    report: previous ? ref("specs/f1/review-2.md", "report2") : report,
    openFindingIds: ids, reviewedAt: "2026-10-10T00:00:00.000Z",
  });
  assert.equal(made.ok, true, JSON.stringify(made));
  return made;
}

test("one review receipt is enough: a single PASS receipt yields a binding with only the review chain", () => {
  const r1 = receipt("spec-v1");
  assert.equal(r1.receipt.round, 1);
  assert.equal(r1.receipt.verdict, "pass");
  const binding = createDesignApprovalBinding({ featureId: "f1", receipts: [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }], currentSources: sources("spec-v1") });
  assert.equal(binding.ok, true, JSON.stringify(binding));
  assert.deepEqual(Object.keys(binding.binding).sort(), ["featureId", "openFindingIds", "reviewReceipts", "schema", "sources", "verdict"]);
  assert.equal(binding.binding.reviewReceipts.length, 1);
  const text = JSON.stringify(binding.binding).toLowerCase();
  for (const forbidden of ["advisor", "readiness", "course", "exception"]) assert.equal(text.includes(forbidden), false, forbidden);
});

test("the review is capped at one initial plus at most one delta follow-up; a third round is refused", () => {
  assert.equal(DESIGN_REVIEW_MAX_ROUNDS, 2);
  const r1 = receipt("spec-v1", null, ["F-ONE"]);
  const r2 = receipt("spec-v2", { path: "specs/f1/receipt-1.json", bytes: r1.bytes });
  assert.equal(r2.receipt.kind, "delta");
  assert.equal(r2.receipt.round, 2);
  const third = createDesignReviewReceipt({
    featureId: "f1", previous: { path: "specs/f1/receipt-2.json", bytes: r2.bytes }, sources: sources("spec-v3"), reviewer,
    report: ref("specs/f1/review-3.md", "r3"), openFindingIds: [], reviewedAt: "2026-10-11T00:00:00.000Z",
  });
  assert.deepEqual([third.ok, third.code], [false, "DRR-ROUND-EXCEEDED"]);
});

test("one PO approval request is built from receipts alone (no Advisor record, no readiness evidence) and re-verifies", () => {
  const r1 = receipt("spec-v1");
  const receipts = [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }];
  const binding = createDesignApprovalBinding({ featureId: "f1", receipts, currentSources: sources("spec-v1") });
  const request = createDesignApprovalRequest({ binding: binding.binding, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) } });
  assert.equal(request.ok, true, JSON.stringify(request));
  assert.deepEqual(Object.keys(request.request).sort(), ["approvalIntent", "binding", "bindingSha256", "schema"]);
  const verified = verifyDesignApprovalRequest({ request: request.request, featureId: "f1", receipts, currentSources: sources("spec-v1") });
  assert.equal(verified.ok, true, JSON.stringify(verified));
  assert.equal(verified.verdict, "pass");
});

test("a drifted design after the first review is refused rather than waved through (protected binding of the signed object)", () => {
  const r1 = receipt("spec-v1");
  const drifted = createDesignApprovalBinding({ featureId: "f1", receipts: [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }], currentSources: sources("spec-v2") });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.code, "DAB-REVIEW-CHAIN");
});

test("the multi-stage design course is retired: the coordinator refuses to start Advisor/readiness stages and names the one-review route", () => {
  const direct = inspectDesignCourse({ rootDir: "/nonexistent-root", runner: "codex" });
  assert.equal(direct.ok, false);
  assert.equal(direct.code, "DESIGN-COURSE-RETIRED");
  assert.equal(direct.implementationAuthority, false);
  assert.equal(direct.hint, RETIRED_DESIGN_ROUTE_HINT);
  assert.match(direct.hint, /Advisor on demand/u);
  assert.match(direct.hint, /one review/u);
  assert.match(direct.hint, /present-plan --review-receipt/u);
  const logged = [];
  const result = courseMain([], { log: (line) => logged.push(line) });
  assert.equal(result.code, "DESIGN-COURSE-RETIRED");
  assert.equal(logged.length, 1);
});

test("an Advisor admission with no consultation does not exist as a pass: the Advisor gate remains an explicit on-demand record, never auto-satisfied", () => {
  assert.equal(evaluateDesignAdvisoryAdmission(null).ok, false);
});

// RED mirrors: each case below is the negative counterpart of one case above. A regression that re-introduced a
// mandatory Advisor/readiness stage, skipped the review chain, or uncapped the rounds would flip these.
function approvalFixture() {
  const r1 = receipt("spec-v1");
  const receipts = [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }];
  const binding = createDesignApprovalBinding({ featureId: "f1", receipts, currentSources: sources("spec-v1") });
  const request = createDesignApprovalRequest({ binding: binding.binding, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) } });
  return { receipts, binding, request };
}

test("RED mirror (one review is enough): with no review receipt at all no binding exists", () => {
  const none = createDesignApprovalBinding({ featureId: "f1", receipts: [], currentSources: sources("spec-v1") });
  assert.equal(none.ok, false);
});

test("RED mirror (only the review chain is signed): a request smuggling an Advisor or readiness field no longer verifies", () => {
  const { receipts, request } = approvalFixture();
  for (const key of ["advisor", "readiness"]) {
    const inRequest = structuredClone(request.request);
    inRequest[key] = { injected: true };
    assert.equal(verifyDesignApprovalRequest({ request: inRequest, featureId: "f1", receipts, currentSources: sources("spec-v1") }).ok, false, `request.${key}`);
    const inBinding = structuredClone(request.request);
    inBinding.binding[key] = { injected: true };
    assert.equal(verifyDesignApprovalRequest({ request: inBinding, featureId: "f1", receipts, currentSources: sources("spec-v1") }).ok, false, `binding.${key}`);
  }
});

test("RED mirror (request re-verifies): a request verified against drifted sources is refused", () => {
  const { receipts, request } = approvalFixture();
  assert.equal(verifyDesignApprovalRequest({ request: request.request, featureId: "f1", receipts, currentSources: sources("spec-v2") }).ok, false);
});

test("RED mirror (round cap): the cap is exactly two, so a zero-finding second round never turns into an unbounded loop", () => {
  const r1 = receipt("spec-v1", null, ["F-ONE"]);
  const r2 = receipt("spec-v2", { path: "specs/f1/receipt-1.json", bytes: r1.bytes }, ["F-ONE"]);
  const third = createDesignReviewReceipt({
    featureId: "f1", previous: { path: "specs/f1/receipt-2.json", bytes: r2.bytes }, sources: sources("spec-v3"), reviewer,
    report: ref("specs/f1/review-3.md", "r3"), openFindingIds: ["F-ONE"], reviewedAt: "2026-10-11T00:00:00.000Z",
  });
  assert.equal(third.ok, false);
  assert.equal(third.code, "DRR-ROUND-EXCEEDED");
});

test("RED mirror (course retired): no runner value revives the multi-stage course", () => {
  for (const runner of ["claude", "codex", undefined]) {
    const result = inspectDesignCourse({ rootDir: "/nonexistent-root", runner });
    assert.equal(result.ok, false, String(runner));
    assert.equal(result.code, "DESIGN-COURSE-RETIRED", String(runner));
    assert.equal(result.implementationAuthority, false, String(runner));
  }
});

test("RED mirror (Advisor on demand): malformed or empty Advisor admissions never pass", () => {
  for (const input of [undefined, {}, [], "ok"]) assert.equal(evaluateDesignAdvisoryAdmission(input).ok, false, JSON.stringify(input));
});

// ---------------------------------------------------------------------------------------------------------------
// Added acceptance (0.7.0, major), inside the one review and with no extra gate:
//  (1) the single design review requires, before the PO approval, an ADR/register reference or a recorded
//      non-significance reason for each foundational Spec decision (the Spec carries the evidence, the receipt
//      already binds the Spec digest, so the receipt schema and the signed object stay unchanged);
//  (2) a materialized fitness model is executed as a candidate check at the implementation boundary, and a model
//      that never ran is reported unqualified instead of being counted as qualified.
// Clause (2) is pinned on the unprotected side only (the qualifier and its CLI); the call into the protected
// implementation-boundary guard is a ceremony item recorded in the dispatch report.

const FIXTURE_ROOTS = [];
after(() => {
  for (const dir of FIXTURE_ROOTS) rmSync(dir, { recursive: true, force: true });
});
function tmpRoot(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  FIXTURE_ROOTS.push(dir);
  return dir;
}

const decisionSpecText = (lines) => ["# Spec", "", "## Foundational decisions", "", ...lines, "", "## Requirements", "", "- DEC-99: outside the section, never counted", ""].join("\n");
const DEC_TRACED = decisionSpecText([
  "- DEC-01: Persist state in SQLite. ADR: ADR-0007",
  "- DEC-02: Retry a failed job three times. Register: D12",
  "- DEC-03: Name the log file app.log. Not significant: a local naming choice that is trivially reversible",
]);
const DEC_GAP = decisionSpecText([
  "- DEC-01: Persist state in SQLite.",
  "- DEC-02: Retry a failed job three times. Register: TBD",
  "- DEC-03: Name the log file app.log. Not significant: a local naming choice that is trivially reversible",
]);

function diskFixture(specText) {
  const root = tmpRoot("alf-ac155-");
  mkdirSync(join(root, "specs", "f1"), { recursive: true });
  writeFileSync(join(root, "specs", "f1", "prd.md"), "prd");
  writeFileSync(join(root, "specs", "f1", "spec.md"), specText);
  writeFileSync(join(root, "specs", "f1", "review-1.md"), "review report");
  writeFileSync(join(root, "critic.md"), "---\nmodel: claude-sonnet-5-5\n---\n");
  return root;
}
const produce = (root) => createReceiptFromDisk(
  { repo: root, featureId: "f1", reportPath: "specs/f1/review-1.md", prdPath: "specs/f1/prd.md", specPath: "specs/f1/spec.md", outPath: "specs/f1/receipt-1.json" },
  { env: { CLAUDECODE: "1" }, now: () => new Date("2026-10-10T00:00:00.000Z"), criticAgentUrl: pathToFileURL(join(root, "critic.md")) },
);

test("decision continuity: the producer refuses a PASS receipt until each foundational Spec decision has an ADR/register reference or a non-significance reason, then the signed object still carries only the review chain", () => {
  const root = diskFixture(DEC_GAP);
  const refused = produce(root);
  assert.equal(refused.ok, false, JSON.stringify(refused));
  assert.equal(refused.code, "DRR-DECISION-TRACE");
  assert.match(refused.message, /DEC-01/u);
  assert.match(refused.message, /DEC-02/u);
  assert.doesNotMatch(refused.message, /DEC-03/u);
  assert.equal(existsSync(join(root, "specs", "f1", "receipt-1.json")), false, "a refused receipt is never written");
  writeFileSync(join(root, "specs", "f1", "spec.md"), DEC_TRACED);
  const created = produce(root);
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.receipt.verdict, "pass");
  const bytes = readFileSync(join(root, "specs", "f1", "receipt-1.json"));
  const binding = createDesignApprovalBinding({
    featureId: "f1",
    receipts: [{ path: "specs/f1/receipt-1.json", bytes }],
    currentSources: { prd: ref("specs/f1/prd.md", "prd"), spec: ref("specs/f1/spec.md", DEC_TRACED), companions: [] },
  });
  assert.equal(binding.ok, true, JSON.stringify(binding));
  assert.deepEqual(Object.keys(binding.binding).sort(), ["featureId", "openFindingIds", "reviewReceipts", "schema", "sources", "verdict"]);
});

test("decision continuity: a Spec that declares no foundational decisions passes exactly as before (no extra gate, no new stage)", () => {
  const root = diskFixture("# Spec\n\nNo decisions are declared.\n");
  const created = produce(root);
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.receipt.verdict, "pass");
});

test("RED mirror (decision continuity): placeholder traces never resolve a decision", () => {
  assert.equal(typeof receiptLib.assessSpecDecisionContinuity, "function");
  for (const trace of ["Register: TBD", "ADR: ADR-", "Not significant: n/a", "Not significant: todo todo"]) {
    const result = receiptLib.assessSpecDecisionContinuity(Buffer.from(decisionSpecText([`- DEC-01: Persist state. ${trace}`])));
    assert.deepEqual([result.ok, result.code, result.unresolved], [false, "DRR-DECISION-TRACE", ["DEC-01"]], trace);
  }
});

test("RED mirror (decision continuity, delta round): a round-2 PASS cannot launder an unresolved decision", () => {
  const make = (specText, previous, ids) => createDesignReviewReceipt({
    featureId: "f1", previous, sources: sources(specText), reviewer,
    report: previous ? ref("specs/f1/review-2.md", "report2") : report,
    openFindingIds: ids, reviewedAt: "2026-10-10T00:00:00.000Z", specBytes: Buffer.from(specText, "utf8"),
  });
  const r1 = make(DEC_GAP, null, ["F-DECISION-TRACE"]);
  assert.equal(r1.ok, true, JSON.stringify(r1));
  const previous = { path: "specs/f1/receipt-1.json", bytes: r1.bytes };
  const stillGap = make(`${DEC_GAP}\nedited\n`, previous, []);
  assert.deepEqual([stillGap.ok, stillGap.code], [false, "DRR-DECISION-TRACE"]);
  const fixed = make(DEC_TRACED, previous, []);
  assert.equal(fixed.ok, true, JSON.stringify(fixed));
  assert.deepEqual([fixed.receipt.kind, fixed.receipt.round, fixed.receipt.verdict], ["delta", 2, "pass"]);
});

test("present-plan path (real CLI run): the spawned present-plan --review-receipt route hands over one signature with no Advisor or readiness stage", { timeout: 300_000 }, () => {
  const e2e = fileURLToPath(new URL("../../scripts/design-approval-route.e2e.test.mjs", import.meta.url));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern=route 1: present-plan --review-receipt accepts finished sources", e2e], { encoding: "utf8", env, timeout: 280_000 });
  const diagnostic = `exit ${child.status}\n${child.stdout.slice(-1500)}\n${child.stderr.slice(-500)}`;
  assert.equal(child.status, 0, diagnostic);
  assert.match(child.stdout, /^# pass [1-9]\d*$/mu, diagnostic);
  assert.match(child.stdout, /^# fail 0$/mu, diagnostic);
  assert.match(child.stdout, /^# skipped 0$/mu, "the present-plan route must actually run, not skip");
});

// ---- fitness model: ran or reported unqualified ----

const COMMIT = "a".repeat(40);
const OTHER_COMMIT = "b".repeat(40);
const MATERIALIZED = { materialized: true, readable: true };
const evidence = (over = {}) => ({ schema: fitness.SCHEMA_FITNESS_EVIDENCE, evaluationMode: "candidate", overallStatus: "pass", ...over });

test("fitness model: a materialized model that never ran is reported unqualified and never counted as qualified", () => {
  assert.equal(typeof fitness.qualifyFitnessModelRun, "function");
  const result = fitness.qualifyFitnessModelRun({ materialization: MATERIALIZED, run: null, candidateCommit: COMMIT });
  assert.deepEqual([result.status, result.code, result.countedAsQualified], ["unqualified", "FITNESS-MODEL-NEVER-RAN", false]);
  const noModel = fitness.qualifyFitnessModelRun({ materialization: { materialized: false, readable: false }, run: null, candidateCommit: COMMIT });
  assert.deepEqual([noModel.status, noModel.countedAsQualified], ["not-applicable", false]);
});

test("fitness model: a candidate-boundary run bound to this candidate with a passing result is qualified", () => {
  assert.equal(typeof fitness.qualifyFitnessModelRun, "function");
  for (const overallStatus of ["pass", "excepted"]) {
    const result = fitness.qualifyFitnessModelRun({ materialization: MATERIALIZED, run: { candidateCommit: COMMIT, evidence: evidence({ overallStatus }) }, candidateCommit: COMMIT });
    assert.deepEqual([result.status, result.code, result.countedAsQualified], ["qualified", "FITNESS-MODEL-QUALIFIED", true], overallStatus);
  }
});

test("RED mirror (fitness model): a malformed, planning-mode, unbound or failing run is never counted as qualified", () => {
  assert.equal(typeof fitness.qualifyFitnessModelRun, "function");
  const cases = [
    [{ candidateCommit: COMMIT, evidence: { schema: "other.v1", evaluationMode: "candidate", overallStatus: "pass" } }, COMMIT, "FITNESS-MODEL-NEVER-RAN"],
    [{ candidateCommit: COMMIT, evidence: evidence({ evaluationMode: "planning" }) }, COMMIT, "FITNESS-MODEL-NOT-RUN-AT-BOUNDARY"],
    [{ candidateCommit: OTHER_COMMIT, evidence: evidence() }, COMMIT, "FITNESS-MODEL-RUN-NOT-BOUND-TO-CANDIDATE"],
    [{ candidateCommit: COMMIT, evidence: evidence() }, null, "FITNESS-MODEL-RUN-NOT-BOUND-TO-CANDIDATE"],
    [{ candidateCommit: COMMIT, evidence: evidence({ overallStatus: "blocked" }) }, COMMIT, "FITNESS-MODEL-RAN-NOT-PASSING"],
    [{ candidateCommit: COMMIT, evidence: evidence({ overallStatus: "unavailable" }) }, COMMIT, "FITNESS-MODEL-RAN-NOT-PASSING"],
  ];
  for (const [run, candidateCommit, code] of cases) {
    const result = fitness.qualifyFitnessModelRun({ materialization: MATERIALIZED, run, candidateCommit });
    assert.deepEqual([result.status, result.code, result.countedAsQualified], ["unqualified", code, false], code);
  }
  const unreadable = fitness.qualifyFitnessModelRun({ materialization: { materialized: true, readable: false }, run: null, candidateCommit: COMMIT });
  assert.deepEqual([unreadable.status, unreadable.code], ["unqualified", "FITNESS-MODEL-UNREADABLE"]);
});

test("fitness model: materialization is read from the file itself, not from the synthesized default", () => {
  assert.equal(typeof fitness.inspectFitnessModelMaterialization, "function");
  const root = tmpRoot("alf-ac155-fit-");
  assert.deepEqual(fitness.inspectFitnessModelMaterialization(root), { materialized: false, readable: false, path: "architecture/fitness-model.json" });
  mkdirSync(join(root, "architecture"), { recursive: true });
  writeFileSync(join(root, "architecture", "fitness-model.json"), "{ not json");
  assert.deepEqual(fitness.inspectFitnessModelMaterialization(root), { materialized: true, readable: false, path: "architecture/fitness-model.json" });
  writeFileSync(join(root, "architecture", "fitness-model.json"), JSON.stringify({ schema: "pipeline.fitness-model.v1", modules: [] }));
  assert.deepEqual(fitness.inspectFitnessModelMaterialization(root), { materialized: true, readable: true, path: "architecture/fitness-model.json" });
});

test("fitness model: runFitnessQualification executes the model as a candidate check and reports a failed or absent run honestly", () => {
  assert.equal(typeof fitness.runFitnessQualification, "function");
  const root = tmpRoot("alf-ac155-run-");
  let calls = 0;
  const evaluate = (options) => { calls += 1; assert.equal(options.mode, "candidate"); return evidence(); };
  const absent = fitness.runFitnessQualification({ rootDir: root, candidateCommit: COMMIT, evaluate });
  assert.deepEqual([absent.status, calls], ["not-applicable", 0]);
  mkdirSync(join(root, "architecture"), { recursive: true });
  writeFileSync(join(root, "architecture", "fitness-model.json"), JSON.stringify({ schema: "pipeline.fitness-model.v1", modules: [] }));
  const ran = fitness.runFitnessQualification({ rootDir: root, candidateCommit: COMMIT, evaluate });
  assert.deepEqual([ran.status, ran.countedAsQualified, calls], ["qualified", true, 1]);
  const crashed = fitness.runFitnessQualification({ rootDir: root, candidateCommit: COMMIT, evaluate: () => { throw new Error("boom"); } });
  assert.deepEqual([crashed.status, crashed.code, crashed.countedAsQualified], ["unqualified", "FITNESS-MODEL-EVALUATION-FAILED", false]);
  const unbound = fitness.runFitnessQualification({ rootDir: root, candidateCommit: null, evaluate });
  assert.deepEqual([unbound.status, unbound.code], ["unqualified", "FITNESS-MODEL-RUN-NOT-BOUND-TO-CANDIDATE"]);
});

test("fitness model: the --qualify CLI exits 0 only for a qualified or not-applicable model and prints the typed result", () => {
  const script = fileURLToPath(new URL("../../scripts/architecture-fitness.mjs", import.meta.url));
  const run = (root, extra = []) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, [script, "--qualify", "--root", root, ...extra], { encoding: "utf8", env, timeout: 60_000 });
    let parsed = null;
    try { parsed = JSON.parse(child.stdout); } catch { parsed = null; }
    return { status: child.status, parsed, diagnostic: `${child.stdout}\n${child.stderr}` };
  };
  const bare = tmpRoot("alf-ac155-cli-");
  const none = run(bare, ["--commit", COMMIT]);
  assert.deepEqual([none.status, none.parsed?.status], [0, "not-applicable"], none.diagnostic);
  mkdirSync(join(bare, "architecture"), { recursive: true });
  writeFileSync(join(bare, "architecture", "fitness-model.json"), "{ not json");
  const unreadable = run(bare, ["--commit", COMMIT]);
  assert.deepEqual([unreadable.status, unreadable.parsed?.status, unreadable.parsed?.code], [1, "unqualified", "FITNESS-MODEL-UNREADABLE"], unreadable.diagnostic);
  writeFileSync(join(bare, "architecture", "fitness-model.json"), JSON.stringify({ schema: "pipeline.fitness-model.v1", modules: [] }));
  const empty = run(bare, ["--commit", COMMIT]);
  assert.equal(empty.status, 1, empty.diagnostic);
  assert.equal(empty.parsed?.status, "unqualified", empty.diagnostic);
  assert.equal(empty.parsed?.countedAsQualified, false);
});
