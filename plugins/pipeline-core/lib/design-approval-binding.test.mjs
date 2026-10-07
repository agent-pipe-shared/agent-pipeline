// SPDX-License-Identifier: SUL-1.0
// RED pins for U3 of ADR-0085: design-approval-binding.mjs (does not exist yet, so this file
// fails with a missing-module error until the module lands).
// Contract: specs/sprint-alfred-epic/plans/adr-0085-u1-u3-api-contract.md section 4 (API,
// binding, request, verify order, legacy distinction, refusal codes), section 5 "U3" (cases
// 1-18) and the section 6 resolution of PO-Q2 option b / decision Z (cases 6b-6d).
// Every receipt is a REAL U2 receipt (createDesignReviewReceipt) and every chain expectation is
// cross-checked against the REAL U1 chain check (reviewChainInconsistencies); nothing is
// stubbed. Pure in-memory data: no filesystem, no git (the import-rule case reads the module
// source only).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DESIGN_APPROVAL_BINDING_SCHEMA,
  DESIGN_APPROVAL_INTENT_KIND,
  DESIGN_APPROVAL_POLICY_REVISION,
  DESIGN_APPROVAL_RECORD_SCHEMA,
  DESIGN_APPROVAL_REQUEST_SCHEMA,
  classifyDesignApprovalIntent,
  classifyDesignApprovalRecord,
  createDesignApprovalBinding,
  createDesignApprovalRequest,
  validateDesignApprovalBinding,
  verifyDesignApprovalRequest,
} from "./design-approval-binding.mjs";
import { reviewChainInconsistencies } from "./design-consistency-check.mjs";
import { createDesignReviewReceipt, summarizeDesignReviewReceipt } from "./design-review-receipt.mjs";
import { canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";

// ---------------------------------------------------------------------------
// Shared fixture F (contract section 5), built in memory from real U2 receipts.
// ---------------------------------------------------------------------------

const FEATURE = "feat-x";
const DIR = "specs/feat-x";
const PRD_PATH = `${DIR}/prd_feat-x.md`;
const SPEC_PATH = `${DIR}/spec.md`;
const DESIGN_PATH = `${DIR}/design.md`;
const MAP_PATH = `${DIR}/spec.requirements.json`;
const TRACE_PATH = `${DIR}/traceability.md`;
const RECEIPT_1 = `${DIR}/review/design-review-1.json`;
const RECEIPT_2 = `${DIR}/review/design-review-2.json`;
const REPORT_1 = `${DIR}/review/design-review-1.md`;
const REPORT_2 = `${DIR}/review/design-review-2.md`;
const REVIEWER = { runner: "claude", model: "claude-sonnet-5-5" };
const CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };
const LEGACY_REMEDY = "DWP2-LEGACY-APPROVED-REREAD";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digestOf = (label) => sha256(`u3-fixture:${label}`);
const bindingShaOf = (binding) => sha256(canonical(binding));
const encode = (text) => new TextEncoder().encode(text);
const asInput = (...receipts) => receipts.map(({ path, bytes }) => ({ path, bytes }));

/** A SourceSet whose digests are named by label, so a test can change exactly one file. */
function sourcesWith({ prd = "prd-v1", spec = "spec-v1", design = "design-v1", map = "map-v1", trace = "trace-v1" } = {}) {
  return {
    prd: { path: PRD_PATH, sha256: digestOf(prd) },
    spec: { path: SPEC_PATH, sha256: digestOf(spec) },
    companions: [
      { path: DESIGN_PATH, sha256: digestOf(design) },
      { path: MAP_PATH, sha256: digestOf(map) },
      { path: TRACE_PATH, sha256: digestOf(trace) },
    ],
  };
}

function initialReceipt(sources, openFindingIds) {
  const made = createDesignReviewReceipt({
    featureId: FEATURE,
    previous: null,
    sources,
    reviewer: REVIEWER,
    report: { path: REPORT_1, sha256: digestOf("report-1") },
    openFindingIds,
    reviewedAt: "2026-10-07T10:00:00.000Z",
  });
  assert.equal(made.ok, true, `fixture: U2 must accept the initial receipt (${made.code})`);
  return { path: RECEIPT_1, bytes: made.bytes, sha256: made.sha256 };
}

function deltaReceipt(previous, sources, openFindingIds) {
  const made = createDesignReviewReceipt({
    featureId: FEATURE,
    previous: { path: previous.path, bytes: previous.bytes },
    sources,
    reviewer: REVIEWER,
    report: { path: REPORT_2, sha256: digestOf("report-2") },
    openFindingIds,
    reviewedAt: "2026-10-07T11:00:00.000Z",
  });
  assert.equal(made.ok, true, `fixture: U2 must accept the delta receipt (${made.code})`);
  return { path: RECEIPT_2, bytes: made.bytes, sha256: made.sha256 };
}

/** One initial PASS receipt bound to the current sources. */
function passScenario() {
  const sources = sourcesWith();
  const first = initialReceipt(sources, []);
  return { sources, first, receipts: [first], currentSources: sources };
}

/** Initial receipt with open findings, then a delta receipt (changed spec) with ["F-3"]. */
function deltaScenario() {
  const initialSources = sourcesWith();
  const deltaSources = sourcesWith({ spec: "spec-v2" });
  const first = initialReceipt(initialSources, ["F-1", "F-2"]);
  const second = deltaReceipt(first, deltaSources, ["F-3"]);
  return { initialSources, deltaSources, first, second, receipts: [first, second], currentSources: deltaSources };
}

/** The delta scenario, then PRD, Spec and design.md change after the round-2 review. */
function driftScenario() {
  const base = deltaScenario();
  const currentSources = sourcesWith({ prd: "prd-v2", spec: "spec-v3", design: "design-v2" });
  return { ...base, currentSources };
}

function create(scenario, overrides = {}) {
  return createDesignApprovalBinding({
    featureId: FEATURE,
    receipts: asInput(...scenario.receipts),
    currentSources: scenario.currentSources,
    ...overrides,
  });
}

function mustCreate(scenario) {
  const made = create(scenario);
  assert.equal(made.ok, true, `fixture: the binding must be created (${JSON.stringify(made)})`);
  return made;
}

function mustRequest(made, candidate = CANDIDATE) {
  const created = createDesignApprovalRequest({ binding: made.binding, candidate });
  assert.equal(created.ok, true, `fixture: the request must be created (${JSON.stringify(created)})`);
  return created;
}

function verify(request, scenario, overrides = {}) {
  return verifyDesignApprovalRequest({
    request,
    featureId: FEATURE,
    receipts: asInput(...scenario.receipts),
    currentSources: scenario.currentSources,
    ...overrides,
  });
}

/**
 * An independent request builder: it hand-assembles a request for ANY binding value and lets a
 * test override single intent fields. Literal kind/policy strings are used on purpose, so the
 * module constants are not the only witness of those values.
 */
function requestFor(binding, overrides = {}) {
  const bindingSha256 = bindingShaOf(binding);
  const intent = createPoApprovalIntent({
    kind: "design-approval",
    featureId: binding.featureId,
    planSha256: binding.sources.prd.sha256,
    specSha256: binding.sources.spec.sha256,
    candidate: CANDIDATE,
    policyRevision: "design-approval-v1",
    subjectSha256: bindingSha256,
    decision: "approve",
    ...overrides,
  });
  return {
    schema: "pipeline.design-approval-request.v1",
    binding: structuredClone(binding),
    bindingSha256,
    approvalIntent: { value: intent.value, sha256: intent.sha256 },
  };
}

/** Oracle: the unique, sorted DCC codes the REAL U1 chain check reports for these inputs. */
function chainCauses(featureId, inputs, currentSources) {
  const receipts = inputs.map(({ path, bytes }) => {
    const summarized = summarizeDesignReviewReceipt({ path, bytes });
    assert.equal(summarized.ok, true, `fixture: U2 must summarize ${path} (${summarized.code})`);
    return summarized.summary;
  });
  const entries = reviewChainInconsistencies({ featureId, receipts, currentSources });
  return [...new Set(entries.map((entry) => entry.code))].sort();
}

/** A refusal is the closed object { ok: false, code, causes } with sorted causes. */
function assertRefusal(result, code, causes = [], label = "") {
  const where = label === "" ? "" : ` [${label}]`;
  assert.deepStrictEqual(Object.keys(result).sort(), ["causes", "code", "ok"], `refusal key set${where} (${JSON.stringify(result)})`);
  assert.equal(result.ok, false, `ok${where}`);
  assert.equal(result.code, code, `code${where}`);
  assert.deepStrictEqual(result.causes, causes, `causes${where}`);
  assert.deepStrictEqual(result.causes, [...result.causes].sort(), `causes must be sorted${where}`);
}

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)]));
  }
  return value;
}

function prettyPrinted(receipt) {
  return encode(`${JSON.stringify(JSON.parse(new TextDecoder().decode(receipt.bytes)), null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// U3-0: the exported surface
// ---------------------------------------------------------------------------

test("U3-0: the module exports the five constants with their contract values and the six functions", () => {
  assert.equal(DESIGN_APPROVAL_BINDING_SCHEMA, "pipeline.design-approval-binding.v1");
  assert.equal(DESIGN_APPROVAL_REQUEST_SCHEMA, "pipeline.design-approval-request.v1");
  assert.equal(DESIGN_APPROVAL_RECORD_SCHEMA, "pipeline.design-approval.v1");
  assert.equal(DESIGN_APPROVAL_INTENT_KIND, "design-approval");
  assert.equal(DESIGN_APPROVAL_POLICY_REVISION, "design-approval-v1");
  for (const fn of [classifyDesignApprovalIntent, classifyDesignApprovalRecord, createDesignApprovalBinding, createDesignApprovalRequest, validateDesignApprovalBinding, verifyDesignApprovalRequest]) {
    assert.equal(typeof fn, "function");
  }
});

// ---------------------------------------------------------------------------
// U3-1 .. U3-3: building the binding
// ---------------------------------------------------------------------------

test("U3-1: a binding from one initial PASS receipt has the closed key set, one receipt entry and an empty open-finding list", () => {
  const scenario = passScenario();
  assert.deepStrictEqual(chainCauses(FEATURE, asInput(...scenario.receipts), scenario.currentSources), [], "fixture: U1 sees a consistent chain");
  const made = create(scenario);
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.deepStrictEqual(Object.keys(made).sort(), ["binding", "bindingSha256", "ok"]);
  assert.deepStrictEqual(made.binding, {
    schema: "pipeline.design-approval-binding.v1",
    featureId: FEATURE,
    sources: scenario.sources,
    reviewReceipts: [{ path: RECEIPT_1, sha256: scenario.first.sha256, round: 1 }],
    verdict: "pass",
    openFindingIds: [],
  });
  assert.equal(Object.hasOwn(made.binding, "unreviewedSourceDelta"), false, "no drift, so no unreviewedSourceDelta key");
  assert.match(made.bindingSha256, /^[a-f0-9]{64}$/u);
  assert.deepStrictEqual(validateDesignApprovalBinding(made.binding), { ok: true, bindingSha256: made.bindingSha256 });
});

test("U3-2: an initial receipt followed by a delta receipt with [F-3] gives an open-findings binding with two ascending entries", () => {
  const scenario = deltaScenario();
  assert.deepStrictEqual(chainCauses(FEATURE, asInput(...scenario.receipts), scenario.currentSources), [], "fixture: U1 sees a consistent chain");
  const made = mustCreate(scenario);
  assert.deepStrictEqual(made.binding, {
    schema: "pipeline.design-approval-binding.v1",
    featureId: FEATURE,
    sources: scenario.deltaSources,
    reviewReceipts: [
      { path: RECEIPT_1, sha256: scenario.first.sha256, round: 1 },
      { path: RECEIPT_2, sha256: scenario.second.sha256, round: 2 },
    ],
    verdict: "open-findings",
    openFindingIds: ["F-3"],
  });
  assert.equal(Object.hasOwn(made.binding, "unreviewedSourceDelta"), false);
});

test("U3-3: bindingSha256 is sha256(canonical(binding)), independent of key order, and creation is deterministic", () => {
  const made = mustCreate(deltaScenario());
  assert.equal(made.bindingSha256, sha256(canonical(made.binding)));
  const reordered = reverseKeys(made.binding);
  assert.notDeepStrictEqual(Object.keys(reordered), Object.keys(made.binding), "fixture: the key order really differs");
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(made.binding));
  assert.deepStrictEqual(validateDesignApprovalBinding(reordered), { ok: true, bindingSha256: made.bindingSha256 });
  assert.deepStrictEqual(mustCreate(deltaScenario()), made, "same inputs, same result");
  const changed = structuredClone(made.binding);
  changed.openFindingIds = ["F-4"];
  assert.deepStrictEqual(validateDesignApprovalBinding(changed), { ok: true, bindingSha256: bindingShaOf(changed) });
  assert.notEqual(bindingShaOf(changed), made.bindingSha256);
});

// ---------------------------------------------------------------------------
// U3-4: the binding is closed
// ---------------------------------------------------------------------------

test("U3-4: a binding with a dispatch id, course id, packageSha256, advisor exception or candidate is DAB-SHAPE", () => {
  const made = mustCreate(deltaScenario());
  for (const key of ["authoringDispatchId", "courseId", "packageSha256", "advisorException", "candidate"]) {
    assertRefusal(validateDesignApprovalBinding({ ...made.binding, [key]: digestOf(key) }), "DAB-SHAPE");
  }
  const nestedReceipt = structuredClone(made.binding);
  nestedReceipt.reviewReceipts[0].dispatchId = "d-1";
  assertRefusal(validateDesignApprovalBinding(nestedReceipt), "DAB-SHAPE");
  const nestedSources = structuredClone(made.binding);
  nestedSources.sources.extra = "x";
  assertRefusal(validateDesignApprovalBinding(nestedSources), "DAB-SHAPE");
});

test("U3-4b: other shape violations (schema, missing key, null digest, receipt count and rounds, bad featureId, non-objects) are DAB-SHAPE", () => {
  const made = mustCreate(deltaScenario());
  const mutations = {
    "wrong schema": (b) => { b.schema = "pipeline.design-approval-binding.v2"; },
    "missing verdict": (b) => { delete b.verdict; },
    "unknown verdict": (b) => { b.verdict = "maybe"; },
    "null companion digest": (b) => { b.sources.companions[0].sha256 = null; },
    "no receipts": (b) => { b.reviewReceipts = []; },
    "three receipts": (b) => { b.reviewReceipts = [...b.reviewReceipts, b.reviewReceipts[1]]; },
    "descending rounds": (b) => { b.reviewReceipts.reverse(); },
    "round three": (b) => { b.reviewReceipts[1].round = 3; },
    "bad featureId": (b) => { b.featureId = "Feat_X"; },
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const forged = structuredClone(made.binding);
    mutate(forged);
    assertRefusal(validateDesignApprovalBinding(forged), "DAB-SHAPE", [], label);
  }
  for (const value of [null, "binding", []]) assertRefusal(validateDesignApprovalBinding(value), "DAB-SHAPE");
});

// ---------------------------------------------------------------------------
// U3-5 .. U3-8: refusals while building the binding
// ---------------------------------------------------------------------------

test("U3-5: a pretty-printed receipt is DAB-RECEIPT with the U2 code, and receipt refusals come before the chain check", () => {
  const scenario = passScenario();
  const pretty = [{ path: RECEIPT_1, bytes: prettyPrinted(scenario.first) }];
  assertRefusal(createDesignApprovalBinding({ featureId: FEATURE, receipts: pretty, currentSources: scenario.currentSources }), "DAB-RECEIPT", ["DRR-NONCANONICAL"]);
  const delta = deltaScenario();
  const mixed = [{ path: RECEIPT_1, bytes: prettyPrinted(delta.first) }, { path: RECEIPT_2, bytes: encode("{") }];
  assertRefusal(createDesignApprovalBinding({ featureId: FEATURE, receipts: mixed, currentSources: delta.currentSources }), "DAB-RECEIPT", ["DRR-JSON", "DRR-NONCANONICAL"]);
  assertRefusal(createDesignApprovalBinding({ featureId: "feat-y", receipts: pretty, currentSources: scenario.currentSources }), "DAB-RECEIPT", ["DRR-NONCANONICAL"]);
});

test("U3-6: a changed design.md digest after an initial receipt is DAB-REVIEW-CHAIN with DCC-REVIEW-RECEIPT-BINDING", () => {
  const scenario = { ...passScenario(), currentSources: sourcesWith({ design: "design-v2" }) };
  const refusal = create(scenario);
  assertRefusal(refusal, "DAB-REVIEW-CHAIN", ["DCC-REVIEW-RECEIPT-BINDING"]);
  assert.deepStrictEqual(refusal.causes, chainCauses(FEATURE, asInput(...scenario.receipts), scenario.currentSources), "the causes are what the real U1 check reports");
});

test("U3-6b: initial and delta receipts followed by a source drift give a binding with the current sources and an unreviewedSourceDelta", () => {
  const scenario = driftScenario();
  assert.deepStrictEqual(chainCauses(FEATURE, asInput(...scenario.receipts), scenario.currentSources), [], "fixture: U1 reports no inconsistency after a delta receipt");
  const made = mustCreate(scenario);
  const expected = {
    schema: "pipeline.design-approval-binding.v1",
    featureId: FEATURE,
    sources: scenario.currentSources,
    reviewReceipts: [
      { path: RECEIPT_1, sha256: scenario.first.sha256, round: 1 },
      { path: RECEIPT_2, sha256: scenario.second.sha256, round: 2 },
    ],
    verdict: "open-findings",
    openFindingIds: ["F-3"],
    unreviewedSourceDelta: [
      { path: DESIGN_PATH, reviewedSha256: digestOf("design-v1"), currentSha256: digestOf("design-v2") },
      { path: PRD_PATH, reviewedSha256: digestOf("prd-v1"), currentSha256: digestOf("prd-v2") },
      { path: SPEC_PATH, reviewedSha256: digestOf("spec-v2"), currentSha256: digestOf("spec-v3") },
    ],
  };
  assert.deepStrictEqual(made.binding, expected);
  assert.notDeepStrictEqual(made.binding.sources, scenario.deltaSources, "the binding carries the CURRENT sources, not the reviewed ones");
  assert.equal(made.bindingSha256, bindingShaOf(expected));
  assert.deepStrictEqual(validateDesignApprovalBinding(made.binding), { ok: true, bindingSha256: made.bindingSha256 });
  const created = mustRequest(made);
  const verified = verify(created.request, scenario);
  assert.deepStrictEqual(verified, {
    ok: true,
    bindingSha256: made.bindingSha256,
    intentSha256: created.intentSha256,
    candidate: CANDIDATE,
    verdict: "open-findings",
    openFindingIds: ["F-3"],
  });
});

test("U3-6c: a binding carrying unreviewedSourceDelta whose latest receipt is round 1 is DAB-SHAPE", () => {
  const withDelta = mustCreate(driftScenario()).binding;
  assert.equal(validateDesignApprovalBinding(withDelta).ok, true, "control: the same key beside a round-2 receipt is valid");
  const forged = structuredClone(withDelta);
  forged.reviewReceipts = [forged.reviewReceipts[0]];
  assertRefusal(validateDesignApprovalBinding(forged), "DAB-SHAPE");
  const initialOnly = mustCreate(passScenario()).binding;
  const afterDrift = {
    ...initialOnly,
    sources: sourcesWith({ design: "design-v2" }),
    unreviewedSourceDelta: [{ path: DESIGN_PATH, reviewedSha256: digestOf("design-v1"), currentSha256: digestOf("design-v2") }],
  };
  assertRefusal(validateDesignApprovalBinding(afterDrift), "DAB-SHAPE");
});

test("U3-6d: an empty, unsorted or malformed unreviewedSourceDelta is DAB-SHAPE (it is present only when non-empty and sorted by path)", () => {
  const valid = mustCreate(driftScenario()).binding;
  const empty = { ...structuredClone(valid), unreviewedSourceDelta: [] };
  assertRefusal(validateDesignApprovalBinding(empty), "DAB-SHAPE");
  const unsorted = structuredClone(valid);
  unsorted.unreviewedSourceDelta.reverse();
  assertRefusal(validateDesignApprovalBinding(unsorted), "DAB-SHAPE");
  const extraKey = structuredClone(valid);
  extraKey.unreviewedSourceDelta[0].note = "x";
  assertRefusal(validateDesignApprovalBinding(extraKey), "DAB-SHAPE");
  const notHex = structuredClone(valid);
  notHex.unreviewedSourceDelta[0].reviewedSha256 = "not-a-digest";
  assertRefusal(validateDesignApprovalBinding(notHex), "DAB-SHAPE");
});

test("U3-7: no receipts is DAB-REVIEW-CHAIN with DCC-REVIEW-RECEIPT-MISSING; three receipts with DCC-REVIEW-ROUND-EXCEEDED", () => {
  const scenario = deltaScenario();
  const none = createDesignApprovalBinding({ featureId: FEATURE, receipts: [], currentSources: scenario.currentSources });
  assertRefusal(none, "DAB-REVIEW-CHAIN", ["DCC-REVIEW-RECEIPT-MISSING"]);
  assert.deepStrictEqual(none.causes, chainCauses(FEATURE, [], scenario.currentSources));
  const three = createDesignApprovalBinding({ featureId: FEATURE, receipts: asInput(scenario.first, scenario.second, scenario.second), currentSources: scenario.currentSources });
  assertRefusal(three, "DAB-REVIEW-CHAIN", ["DCC-REVIEW-ROUND-EXCEEDED"]);
  assert.deepStrictEqual(three.causes, chainCauses(FEATURE, asInput(scenario.first, scenario.second, scenario.second), scenario.currentSources));
});

test("U3-7b: the receipts are taken in chain order, so a reversed chain is DAB-REVIEW-CHAIN with the codes the real U1 check reports", () => {
  const scenario = deltaScenario();
  const reversed = asInput(scenario.second, scenario.first);
  const refusal = createDesignApprovalBinding({ featureId: FEATURE, receipts: reversed, currentSources: scenario.currentSources });
  assert.equal(refusal.ok, false);
  assert.equal(refusal.code, "DAB-REVIEW-CHAIN");
  assert.ok(refusal.causes.length > 0);
  assert.deepStrictEqual(refusal.causes, chainCauses(FEATURE, reversed, scenario.currentSources));
  assert.ok(refusal.causes.includes("DCC-REVIEW-DELTA-CHAIN"));
  assertRefusal(refusal, "DAB-REVIEW-CHAIN", chainCauses(FEATURE, reversed, scenario.currentSources));
});

test("U3-8: a featureId different from the receipts' (feat-y) is DAB-REVIEW-CHAIN with DCC-REVIEW-RECEIPT-BINDING, on create and on verify", () => {
  const scenario = passScenario();
  const refusal = createDesignApprovalBinding({ featureId: "feat-y", receipts: asInput(...scenario.receipts), currentSources: scenario.currentSources });
  assertRefusal(refusal, "DAB-REVIEW-CHAIN", ["DCC-REVIEW-RECEIPT-BINDING"]);
  assert.deepStrictEqual(refusal.causes, chainCauses("feat-y", asInput(...scenario.receipts), scenario.currentSources));
  const created = mustRequest(mustCreate(scenario));
  assertRefusal(verify(created.request, scenario, { featureId: "feat-y" }), "DAB-REVIEW-CHAIN", ["DCC-REVIEW-RECEIPT-BINDING"]);
  const tampered = { ...created.request, bindingSha256: digestOf("forged-binding") };
  assertRefusal(verify(tampered, scenario, { featureId: "feat-y" }), "DAB-REVIEW-CHAIN", ["DCC-REVIEW-RECEIPT-BINDING"]);
});

// ---------------------------------------------------------------------------
// U3-9, U3-10: the request and its intent
// ---------------------------------------------------------------------------

test("U3-9: the request is the closed object with the exact intent from createPoApprovalIntent, and intentSha256 is that intent's digest", () => {
  const made = mustCreate(deltaScenario());
  const created = createDesignApprovalRequest({ binding: made.binding, candidate: CANDIDATE });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.deepStrictEqual(Object.keys(created).sort(), ["intentSha256", "ok", "request"]);
  assert.deepStrictEqual(Object.keys(created.request).sort(), ["approvalIntent", "binding", "bindingSha256", "schema"]);
  assert.equal(created.request.schema, "pipeline.design-approval-request.v1");
  assert.deepStrictEqual(created.request.binding, made.binding);
  assert.equal(created.request.bindingSha256, made.bindingSha256);
  const expected = createPoApprovalIntent({
    kind: "design-approval",
    featureId: FEATURE,
    planSha256: made.binding.sources.prd.sha256,
    specSha256: made.binding.sources.spec.sha256,
    candidate: CANDIDATE,
    policyRevision: "design-approval-v1",
    subjectSha256: made.bindingSha256,
    decision: "approve",
  });
  assert.deepStrictEqual(created.request.approvalIntent, { value: expected.value, sha256: expected.sha256 });
  assert.deepStrictEqual(created.request.approvalIntent.value, {
    schema: "pipeline.po-approval-intent.v1",
    kind: "design-approval",
    featureId: FEATURE,
    planSha256: made.binding.sources.prd.sha256,
    specSha256: made.binding.sources.spec.sha256,
    candidate: CANDIDATE,
    policyRevision: "design-approval-v1",
    subjectSha256: made.bindingSha256,
    decision: "approve",
  });
  assert.equal(created.intentSha256, expected.sha256);
});

test("U3-9b: a request over an invalid binding is refused with the binding's DAB-SHAPE", () => {
  const made = mustCreate(passScenario());
  assertRefusal(createDesignApprovalRequest({ binding: { ...made.binding, courseId: "c-1" }, candidate: CANDIDATE }), "DAB-SHAPE");
});

test("U3-10: a candidate whose commit equals its tree, or whose commit is 39 hex digits, is DAB-INTENT", () => {
  const made = mustCreate(passScenario());
  const same = "c".repeat(40);
  assertRefusal(createDesignApprovalRequest({ binding: made.binding, candidate: { commit: same, tree: same } }), "DAB-INTENT");
  assertRefusal(createDesignApprovalRequest({ binding: made.binding, candidate: { commit: "a".repeat(39), tree: "b".repeat(40) } }), "DAB-INTENT");
  assertRefusal(createDesignApprovalRequest({ binding: made.binding, candidate: null }), "DAB-INTENT");
  assertRefusal(createDesignApprovalRequest({ binding: made.binding, candidate: { ...CANDIDATE, extra: "x" } }), "DAB-INTENT");
});

test("U3-10b: a request whose own intent carries an unusable candidate is DAB-INTENT at verify (the recomputation throws)", () => {
  const scenario = passScenario();
  const created = mustRequest(mustCreate(scenario));
  const forged = structuredClone(created.request);
  forged.approvalIntent.value.candidate = { commit: "d".repeat(40), tree: "d".repeat(40) };
  assertRefusal(verify(forged, scenario), "DAB-INTENT");
});

// ---------------------------------------------------------------------------
// U3-11: verify happy paths and the recomputation (steps 4 and 5)
// ---------------------------------------------------------------------------

test("U3-11: verify accepts a request over unchanged receipts and sources and returns the closed result", () => {
  for (const scenario of [passScenario(), deltaScenario()]) {
    const made = mustCreate(scenario);
    const created = mustRequest(made);
    const verified = verify(created.request, scenario);
    assert.deepStrictEqual(Object.keys(verified).sort(), ["bindingSha256", "candidate", "intentSha256", "ok", "openFindingIds", "verdict"]);
    assert.deepStrictEqual(verified, {
      ok: true,
      bindingSha256: made.bindingSha256,
      intentSha256: created.intentSha256,
      candidate: CANDIDATE,
      verdict: made.binding.verdict,
      openFindingIds: made.binding.openFindingIds,
    });
  }
});

test("U3-11b: a source drift after an initial receipt since the request was made is the recomputation's DAB-REVIEW-CHAIN, passed through", () => {
  const scenario = passScenario();
  const created = mustRequest(mustCreate(scenario));
  const drifted = { ...scenario, currentSources: sourcesWith({ design: "design-v2" }) };
  assertRefusal(verify(created.request, drifted), "DAB-REVIEW-CHAIN", ["DCC-REVIEW-RECEIPT-BINDING"]);
});

test("U3-11c: a source drift after a delta receipt since the request was made recomputes a different binding, so DAB-BINDING-DRIFT", () => {
  const scenario = deltaScenario();
  const created = mustRequest(mustCreate(scenario));
  const drifted = driftScenario();
  assert.deepStrictEqual(drifted.receipts, scenario.receipts, "fixture: same receipts");
  assertRefusal(verify(created.request, drifted), "DAB-BINDING-DRIFT");
});

test("U3-11d: a receipt that no longer parses at verify time is the recomputation's DAB-RECEIPT, passed through", () => {
  const scenario = passScenario();
  const created = mustRequest(mustCreate(scenario));
  const pretty = [{ path: RECEIPT_1, bytes: prettyPrinted(scenario.first) }];
  assertRefusal(verifyDesignApprovalRequest({ request: created.request, featureId: FEATURE, receipts: pretty, currentSources: scenario.currentSources }), "DAB-RECEIPT", ["DRR-NONCANONICAL"]);
});

// ---------------------------------------------------------------------------
// U3-12 .. U3-14: tampering
// ---------------------------------------------------------------------------

test("U3-12: a binding with its open findings emptied (and its digest and intent recomputed to match) is DAB-BINDING-DRIFT", () => {
  const scenario = deltaScenario();
  const real = mustCreate(scenario);
  const forgedBinding = { ...structuredClone(real.binding), verdict: "pass", openFindingIds: [] };
  assert.equal(validateDesignApprovalBinding(forgedBinding).ok, true, "fixture: the forgery is a valid binding on its own");
  const forged = requestFor(forgedBinding);
  assert.equal(forged.bindingSha256, bindingShaOf(forgedBinding));
  assertRefusal(verify(forged, scenario), "DAB-BINDING-DRIFT");
});

test("U3-13: an altered bindingSha256 is DAB-BINDING-DRIFT", () => {
  const scenario = deltaScenario();
  const created = mustRequest(mustCreate(scenario));
  assertRefusal(verify({ ...created.request, bindingSha256: digestOf("forged-binding") }, scenario), "DAB-BINDING-DRIFT");
});

test("U3-14: an intent that differs from the recomputed one (decision reject, subject, plan digest, feature, own digest) is DAB-INTENT-DRIFT", () => {
  const scenario = deltaScenario();
  const real = mustCreate(scenario);
  const variants = {
    "decision reject": requestFor(real.binding, { decision: "reject" }),
    "altered subjectSha256": requestFor(real.binding, { subjectSha256: digestOf("other-subject") }),
    "altered planSha256": requestFor(real.binding, { planSha256: digestOf("other-plan") }),
    "other featureId": requestFor(real.binding, { featureId: "feat-y" }),
  };
  const tamperedDigest = structuredClone(mustRequest(real).request);
  tamperedDigest.approvalIntent.sha256 = digestOf("tampered-intent");
  variants["altered intent sha256"] = tamperedDigest;
  for (const [label, request] of Object.entries(variants)) {
    assertRefusal(verify(request, scenario), "DAB-INTENT-DRIFT", [], label);
  }
  assert.deepStrictEqual(verify(requestFor(real.binding), scenario).ok, true, "control: the same hand-built request without a deviation verifies");
});

// ---------------------------------------------------------------------------
// U3-15 .. U3-17: the legacy distinction
// ---------------------------------------------------------------------------

test("U3-15: a legacy design-workflow-package intent is DAB-LEGACY-KIND (remedy DWP2-LEGACY-APPROVED-REREAD); any other kind is DAB-KIND", () => {
  const scenario = deltaScenario();
  const real = mustCreate(scenario);
  for (const policyRevision of ["design-workflow-package-v1", "design-workflow-package-v2"]) {
    const legacy = requestFor(real.binding, { kind: "design-workflow-package", policyRevision });
    assertRefusal(verify(legacy, scenario), "DAB-LEGACY-KIND", [LEGACY_REMEDY]);
  }
  const other = requestFor(real.binding, { kind: "other-kind" });
  assertRefusal(verify(other, scenario), "DAB-KIND");
  const wrongPolicy = requestFor(real.binding, { policyRevision: "design-approval-v2" });
  assertRefusal(verify(wrongPolicy, scenario), "DAB-KIND");
  const legacyTampered = { ...requestFor(real.binding, { kind: "design-workflow-package", policyRevision: "design-workflow-package-v1" }), bindingSha256: digestOf("forged-binding") };
  assertRefusal(verify(legacyTampered, scenario), "DAB-LEGACY-KIND", [LEGACY_REMEDY]);
  const legacyOtherFeature = requestFor(real.binding, { kind: "design-workflow-package", policyRevision: "design-workflow-package-v1" });
  assertRefusal(verify(legacyOtherFeature, scenario, { featureId: "feat-y" }), "DAB-LEGACY-KIND", [LEGACY_REMEDY]);
});

function intentWith(overrides) {
  return createPoApprovalIntent({
    kind: "design-approval",
    featureId: FEATURE,
    planSha256: digestOf("plan"),
    specSha256: digestOf("spec"),
    candidate: CANDIDATE,
    policyRevision: "design-approval-v1",
    subjectSha256: digestOf("subject"),
    decision: "approve",
    ...overrides,
  });
}

/** The contract does not say whether the classifier takes the intent VALUE or the { value, sha256 } pair; both are pinned. */
function assertIntentClass(intent, expected, label) {
  assert.equal(classifyDesignApprovalIntent(intent.value), expected, `${label} (bare value)`);
  assert.equal(classifyDesignApprovalIntent({ value: intent.value, sha256: intent.sha256 }), expected, `${label} ({ value, sha256 })`);
}

test("U3-16: the intent classifier tells the new intent, both legacy intents and everything else apart", () => {
  assertIntentClass(intentWith({}), "design-approval", "new intent");
  assertIntentClass(intentWith({ kind: "design-workflow-package", policyRevision: "design-workflow-package-v1" }), "legacy-design-workflow-package", "legacy v1");
  assertIntentClass(intentWith({ kind: "design-workflow-package", policyRevision: "design-workflow-package-v2" }), "legacy-design-workflow-package", "legacy v2");
  assertIntentClass(intentWith({ policyRevision: "design-workflow-package-v1" }), "unknown", "new kind with a legacy policy");
  assertIntentClass(intentWith({ kind: "design-workflow-package", policyRevision: "design-approval-v1" }), "unknown", "legacy kind with the new policy");
  assertIntentClass(intentWith({ policyRevision: "design-approval-v2" }), "unknown", "new kind with another policy revision");
  assertIntentClass(intentWith({ kind: "design-workflow-package", policyRevision: "design-workflow-package-v3" }), "unknown", "legacy kind with another policy revision");
  assertIntentClass(intentWith({ kind: "other-kind" }), "unknown", "another kind");
  const wrongSchema = intentWith({});
  const altered = { value: { ...wrongSchema.value, schema: "pipeline.po-approval-intent.v2" }, sha256: wrongSchema.sha256 };
  assert.equal(classifyDesignApprovalIntent(altered.value), "unknown", "new intent with another schema (bare value)");
  assert.equal(classifyDesignApprovalIntent(altered), "unknown", "new intent with another schema ({ value, sha256 })");
  for (const garbage of [null, undefined, {}, [], "design-approval", 42]) assert.equal(classifyDesignApprovalIntent(garbage), "unknown");
});

const PROOF = {
  schema: "pipeline.po-approval-proof.v1",
  intentSha256: digestOf("intent"),
  keyReference: "po-key-1",
  publicKey: "PUBLIC-KEY-PLACEHOLDER",
  signatureBase64: "c2lnbmF0dXJl",
};

const NEW_RECORD = {
  schema: "pipeline.design-approval.v1",
  mode: "signature",
  approvedBy: "verified:po-key-1",
  approvedAt: "2026-10-07T12:00:00.000Z",
  bindingSha256: digestOf("binding"),
  intentSha256: digestOf("intent"),
  proofSha256: digestOf("proof"),
  proof: PROOF,
};

const LEGACY_RECORD = {
  schema: "pipeline.design-workflow-package-approval.v1",
  mode: "signature",
  approvedBy: "verified:po-key-1",
  approvedAt: "2026-10-07T12:00:00.000Z",
  packageSha256: digestOf("package"),
  intentSha256: digestOf("intent"),
  proofSha256: digestOf("proof"),
  proof: PROOF,
};

test("U3-17: the record classifier tells the new record, the legacy record, an invalid hybrid and everything else apart", () => {
  assert.equal(classifyDesignApprovalRecord(structuredClone(NEW_RECORD)), "design-approval");
  assert.equal(classifyDesignApprovalRecord(structuredClone(LEGACY_RECORD)), "legacy-design-workflow-package");
  assert.equal(classifyDesignApprovalRecord({ ...structuredClone(LEGACY_RECORD), advisorException: { reason: "recorded exception" } }), "legacy-design-workflow-package", "a legacy record may carry its advisorException");
  assert.equal(classifyDesignApprovalRecord({ ...structuredClone(NEW_RECORD), packageSha256: digestOf("package") }), "invalid");
  assert.equal(classifyDesignApprovalRecord({ ...structuredClone(NEW_RECORD), advisorException: { reason: "recorded exception" } }), "invalid");
  assert.equal(classifyDesignApprovalRecord({ schema: "pipeline.something-else.v1" }), "unknown");
  for (const garbage of [null, undefined, {}, [], "record", 42]) assert.equal(classifyDesignApprovalRecord(garbage), "unknown");
});

// ---------------------------------------------------------------------------
// U3-18: the request is closed (verify step 1 wins over every later step)
// ---------------------------------------------------------------------------

test("U3-18: a request with an advisorException or packageSha256 key, or without bindingSha256, is DAB-SHAPE; shape beats the intent check", () => {
  const scenario = deltaScenario();
  const created = mustRequest(mustCreate(scenario));
  assertRefusal(verify({ ...created.request, advisorException: { reason: "x" } }, scenario), "DAB-SHAPE");
  assertRefusal(verify({ ...created.request, packageSha256: digestOf("package") }, scenario), "DAB-SHAPE");
  assertRefusal(verify({ ...created.request, extra: "x" }, scenario), "DAB-SHAPE");
  const { bindingSha256: _omitted, ...withoutBindingSha } = created.request;
  assertRefusal(verify(withoutBindingSha, scenario), "DAB-SHAPE");
  const { approvalIntent: _omittedIntent, ...withoutIntent } = created.request;
  assertRefusal(verify(withoutIntent, scenario), "DAB-SHAPE");
  const legacyWithExtra = { ...requestFor(created.request.binding, { kind: "design-workflow-package", policyRevision: "design-workflow-package-v1" }), advisorException: { reason: "x" } };
  assertRefusal(verify(legacyWithExtra, scenario), "DAB-SHAPE");
  const invalidBinding = { ...structuredClone(created.request.binding), courseId: "c-1" };
  assertRefusal(verify({ ...created.request, binding: invalidBinding, bindingSha256: bindingShaOf(invalidBinding) }, scenario), "DAB-SHAPE");
});

// ---------------------------------------------------------------------------
// U3-19: import rule (contract header: U3 imports U1, U2 and po-approval-proof.mjs)
// ---------------------------------------------------------------------------

test("U3-19: the module imports only node:crypto, the U1 and U2 modules and po-approval-proof (import rule of the contract header)", () => {
  const source = readFileSync(new URL("./design-approval-binding.mjs", import.meta.url), "utf8");
  const specifiers = [...source.matchAll(/\bfrom\s*["']([^"']+)["']/gu)].map((match) => match[1]);
  assert.deepStrictEqual([...new Set(specifiers)].sort(), ["./design-consistency-check.mjs", "./design-review-receipt.mjs", "./po-approval-proof.mjs", "node:crypto"]);
});

// ---------------------------------------------------------------------------
// U3-20: a companion deleted after a round-2 receipt (U3 Critic round 1, F1 and
// ruling (7), derived from decision Z). Contract section 4 ("no null sha256" in
// sources) and section 6 ("an absent current file has currentSha256: null") meet
// here: the deleted companion leaves binding.sources and appears in the delta.
// Each case first builds its unmutated input and asserts it is accepted.
// ---------------------------------------------------------------------------

/** The sources with exactly one companion's digest nulled: the file is gone from the working tree. */
function withDeletedCompanion(sources, path) {
  assert.ok(sources.companions.some((companion) => companion.path === path), `fixture: ${path} is a bound companion`);
  return {
    prd: sources.prd,
    spec: sources.spec,
    companions: sources.companions.map((companion) => (companion.path === path ? { path: companion.path, sha256: null } : companion)),
  };
}

test("U3-20: a companion deleted after a round-2 receipt is omitted from binding.sources and listed in unreviewedSourceDelta with a null current digest", () => {
  const base = deltaScenario();
  const unmutated = mustCreate(base);
  assert.deepStrictEqual(unmutated.binding.sources, base.deltaSources, "fixture: the unmutated input binds all three companions");
  assert.equal(Object.hasOwn(unmutated.binding, "unreviewedSourceDelta"), false, "fixture: the unmutated input has no unreviewed delta");
  for (const { path, sha256: reviewedSha256 } of base.deltaSources.companions) {
    assert.match(reviewedSha256, /^[a-f0-9]{64}$/u);
    const scenario = { ...base, currentSources: withDeletedCompanion(base.currentSources, path) };
    assert.deepStrictEqual(chainCauses(FEATURE, asInput(...scenario.receipts), scenario.currentSources), [], `fixture: U1 reports no inconsistency after a delta receipt (${path} deleted)`);
    const made = create(scenario);
    assert.equal(made.ok, true, `${path} deleted: ${JSON.stringify(made)}`);
    assert.deepStrictEqual(Object.keys(made).sort(), ["binding", "bindingSha256", "ok"]);
    const expected = {
      schema: "pipeline.design-approval-binding.v1",
      featureId: FEATURE,
      sources: {
        prd: base.deltaSources.prd,
        spec: base.deltaSources.spec,
        companions: base.deltaSources.companions.filter((companion) => companion.path !== path),
      },
      reviewReceipts: [
        { path: RECEIPT_1, sha256: base.first.sha256, round: 1 },
        { path: RECEIPT_2, sha256: base.second.sha256, round: 2 },
      ],
      verdict: "open-findings",
      openFindingIds: ["F-3"],
      unreviewedSourceDelta: [{ path, reviewedSha256, currentSha256: null }],
    };
    assert.equal(made.binding.sources.companions.some((companion) => companion.path === path), false, `${path} is omitted from binding.sources`);
    assert.deepStrictEqual(made.binding, expected, `${path} deleted`);
    assert.equal(made.bindingSha256, bindingShaOf(expected));
    assert.deepStrictEqual(validateDesignApprovalBinding(made.binding), { ok: true, bindingSha256: made.bindingSha256 });
    const created = mustRequest(made);
    assert.deepStrictEqual(verify(created.request, scenario), {
      ok: true,
      bindingSha256: made.bindingSha256,
      intentSha256: created.intentSha256,
      candidate: CANDIDATE,
      verdict: "open-findings",
      openFindingIds: ["F-3"],
    }, `${path} deleted: the request round-trips`);
  }
});

test("U3-20b: an absent PRD or an absent Spec after a round-2 receipt stays a refusal (DAB-SHAPE), because the approval intent binds both digests", () => {
  const base = deltaScenario();
  mustCreate(base);
  const { prd, spec, companions } = base.currentSources;
  const variants = {
    "absent PRD": { prd: { path: prd.path, sha256: null }, spec, companions },
    "absent Spec": { prd, spec: { path: spec.path, sha256: null }, companions },
  };
  for (const [label, currentSources] of Object.entries(variants)) {
    assertRefusal(create({ ...base, currentSources }), "DAB-SHAPE", [], label);
  }
});

test("U3-20c: a companion deleted after an initial (round-1) receipt stays DAB-REVIEW-CHAIN with DCC-REVIEW-RECEIPT-BINDING (the delta review is still owed)", () => {
  const base = passScenario();
  mustCreate(base);
  for (const { path } of base.sources.companions) {
    const scenario = { ...base, currentSources: withDeletedCompanion(base.currentSources, path) };
    const refusal = create(scenario);
    assertRefusal(refusal, "DAB-REVIEW-CHAIN", ["DCC-REVIEW-RECEIPT-BINDING"], `${path} deleted`);
    assert.deepStrictEqual(refusal.causes, chainCauses(FEATURE, asInput(...scenario.receipts), scenario.currentSources), `${path} deleted: the causes are what the real U1 check reports`);
  }
});

// ---------------------------------------------------------------------------
// U3-21: negative pins for the validator rules that carry decisions U and Z
// (U3 Critic round 1, F2, QG-11). Each mutation is applied alone to a fresh copy
// of a binding that is first asserted to be accepted.
// ---------------------------------------------------------------------------

/** A valid round-2 binding with two open findings and no unreviewed delta. */
function plainBinding() {
  const binding = structuredClone(mustCreate(deltaScenario()).binding);
  binding.openFindingIds = ["F-3", "F-5"];
  return binding;
}

/** A valid round-2 binding with two open findings and a three-entry unreviewedSourceDelta over bound paths. */
function driftBinding() {
  const binding = structuredClone(mustCreate(driftScenario()).binding);
  binding.openFindingIds = ["F-3", "F-5"];
  return binding;
}

/** A valid round-2 binding whose delta is the deletion shape: one entry for a path the sources do not bind. */
function deletionBinding() {
  const binding = plainBinding();
  binding.unreviewedSourceDelta = [{ path: `${DIR}/gone.md`, reviewedSha256: digestOf("gone"), currentSha256: null }];
  return binding;
}

/** Entries for unbound paths, ascending by path, each a deletion: the only way to build a long valid delta. */
const deletionEntries = (count) => Array.from({ length: count }, (_, index) => ({
  path: `${DIR}/gone/file-${String(index).padStart(3, "0")}.md`,
  reviewedSha256: digestOf(`gone-${index}`),
  currentSha256: null,
}));

const strictlyAscending = (list) => list.every((entry, index) => index === 0 || entry > list[index - 1]);

function assertMutationsRefused(makeBase, mutations) {
  const base = makeBase();
  assert.deepStrictEqual(validateDesignApprovalBinding(base), { ok: true, bindingSha256: bindingShaOf(base) }, "fixture: the unmutated binding is accepted");
  for (const [label, mutate] of Object.entries(mutations)) {
    const forged = structuredClone(base);
    mutate(forged);
    assert.notDeepStrictEqual(forged, base, `fixture: the mutation changes the binding (${label})`);
    assertRefusal(validateDesignApprovalBinding(forged), "DAB-SHAPE", [], label);
  }
}

test("U3-21: a verdict that disagrees with the open-finding list (pass with findings, open-findings with none) is DAB-SHAPE", () => {
  assertMutationsRefused(plainBinding, {
    "verdict pass with a non-empty openFindingIds": (b) => { b.verdict = "pass"; },
    "verdict open-findings with an empty openFindingIds": (b) => { b.openFindingIds = []; },
  });
});

test("U3-21b: an untruthful unreviewedSourceDelta entry (reviewed digest equals current digest; current digest differs from the binding's own) is DAB-SHAPE", () => {
  assertMutationsRefused(driftBinding, {
    "reviewedSha256 equals currentSha256": (b) => { b.unreviewedSourceDelta[0].reviewedSha256 = b.unreviewedSourceDelta[0].currentSha256; },
    "currentSha256 differs from the binding's own digest for the path": (b) => { b.unreviewedSourceDelta[0].currentSha256 = digestOf("not-the-bound-digest"); },
    "currentSha256 null for a path the sources bind": (b) => { b.unreviewedSourceDelta[0].currentSha256 = null; },
  });
});

test("U3-21c: a binding path that is not a SafePath (absolute, with .., with a backslash) is DAB-SHAPE", () => {
  const badForms = {
    absolute: (path) => `/${path}`,
    "parent traversal": (path) => `../${path}`,
    backslash: (path) => path.replaceAll("/", "\\"),
  };
  const mutations = {};
  for (const [form, bad] of Object.entries(badForms)) {
    mutations[`PRD path ${form}`] = (b) => { b.sources.prd.path = bad(b.sources.prd.path); };
    mutations[`receipt path ${form}`] = (b) => { b.reviewReceipts[0].path = bad(b.reviewReceipts[0].path); };
  }
  assertMutationsRefused(plainBinding, mutations);
  const deltaMutations = {};
  for (const [form, bad] of Object.entries(badForms)) {
    deltaMutations[`delta path ${form}`] = (b) => { b.unreviewedSourceDelta[0].path = bad(b.unreviewedSourceDelta[0].path); };
  }
  assertMutationsRefused(deletionBinding, deltaMutations);
});

test("U3-21d: a PRD path equal to the Spec path, a companion equal to the PRD or Spec path, or companions not strictly ascending is DAB-SHAPE", () => {
  assertMutationsRefused(plainBinding, {
    "PRD path equal to the Spec path": (b) => { b.sources.prd.path = b.sources.spec.path; },
    "companion equal to the PRD path": (b) => {
      b.sources.companions[0].path = b.sources.prd.path;
      assert.ok(strictlyAscending(b.sources.companions.map(({ path }) => path)), "fixture: only the overlap is wrong, the order is still ascending");
    },
    "companion equal to the Spec path": (b) => {
      b.sources.companions[1].path = b.sources.spec.path;
      assert.ok(strictlyAscending(b.sources.companions.map(({ path }) => path)), "fixture: only the overlap is wrong, the order is still ascending");
    },
    "companions in descending order": (b) => { b.sources.companions.reverse(); },
    "two adjacent companions with the same path": (b) => { b.sources.companions[1] = { ...b.sources.companions[0] }; },
  });
});

test("U3-21e: an openFindingIds list with duplicates, in the wrong order or holding an id outside the finding-id pattern is DAB-SHAPE", () => {
  assertMutationsRefused(plainBinding, {
    "duplicate ids": (b) => { b.openFindingIds = ["F-3", "F-3"]; },
    "unsorted ids": (b) => { b.openFindingIds = ["F-5", "F-3"]; },
    "id without a hyphenated segment": (b) => { b.openFindingIds = ["F3"]; },
    "lowercase id": (b) => { b.openFindingIds = ["f-3"]; },
    "id with a trailing space": (b) => { b.openFindingIds = ["F-3 "]; },
    "id that is only a prefix": (b) => { b.openFindingIds = ["F-"]; },
    "non-string id": (b) => { b.openFindingIds = [3]; },
  });
});

test("U3-21f: an unreviewedSourceDelta of 133 entries is DAB-SHAPE, while 132 otherwise valid entries are accepted (the size cap)", () => {
  const withEntries = (count) => () => {
    const binding = plainBinding();
    binding.unreviewedSourceDelta = deletionEntries(count);
    return binding;
  };
  assertMutationsRefused(withEntries(132), {
    "133 entries": (b) => { b.unreviewedSourceDelta = deletionEntries(133); },
  });
});
