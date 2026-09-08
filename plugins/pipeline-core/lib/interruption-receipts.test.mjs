// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import childProcess from "node:child_process";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { buildInterruptionReceipt as build, classifyInterruption as classify, validateInterruptionReceipt as validate, validateInterruptionRegistry, aggregateInterruptionReceipts } from "./interruption-receipts.mjs";
import { canonicalInvocationJson, createInvocationRequest, createInvocationAttempt, invocationResolutionKey, validateInvocationChain } from "./invocation-reliability.mjs";
import { projectC1SourceJoins } from "./interruption-source-adapter.mjs";
import { createSelectedSandboxDisposition, reduceSelectedSandboxDisposition, validateSelectedSandboxDisposition } from "./selected-sandbox-disposition.mjs";
import { compileCriticReviewLineage, validateCriticReviewHistory } from "./critic-review-lineage.mjs";
import { REVIEW_LIMITS, sha256Canonical } from "./review-economy.mjs";

const registry = JSON.parse(readFileSync(new URL("../../../policies/interruption-registry.v1.json", import.meta.url), "utf8"));
const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), D = "d".repeat(64);
const clone = (value) => structuredClone(value);
const time = (seconds, status = "measured") => ({ value: `2026-08-01T00:00:${String(seconds).padStart(2, "0")}.000Z`, status });
const absent = (status = "unknown") => ({ value: null, status });
function input() {
  return { eventId: "event-1", lineageId: "episode-1", scope: { featureId: "alfred", packageId: "C1", dispatchId: "dispatch-1", phase: "implementation" }, actor: { runner: "test-runner", role: "worker" }, typedCode: "SOURCE-REQUIRED",
    observations: [{ sourceKind: "lifecycle-boundary", facts: ["expected-boundary"], artifact: { id: "observation-1", sha256: A } }],
    state: "unresolved", firstObservedAt: time(0), observedThroughAt: time(10), resolvedAt: absent(), terminalAt: absent(),
    attemptCoverage: "measured", recoveryCoverage: "measured", joins: { invocations: [], reviews: [], usages: [], recoveries: [] }, resolution: null,
    binding: { candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, artifacts: [{ id: "observation-1", sha256: A }] } };
}
function receipt(value = input(), rules = registry) {
  const result = build(value, rules);
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(Object.keys(result).sort(), ["code", "ok", "receipt"]);
  assert.deepEqual(validate(result.receipt, rules), { ok: true, code: null });
  return result.receipt;
}
function rejected(value, code = "C1-SHAPE", rules = registry) {
  assert.deepEqual(build(value, rules), { ok: false, code, receipt: null });
}
function observe(value, sourceKind, facts, identity = "observation-1", sha256 = A) {
  const row = { sourceKind, facts: [...facts].sort(), artifact: { id: identity, sha256 } };
  value.observations.push(row);
  value.binding.artifacts.push(clone(row.artifact));
  value.observations.sort((a, b) => a.artifact.id.localeCompare(b.artifact.id));
  value.binding.artifacts.sort((a, b) => a.id.localeCompare(b.id));
}
const unknown = { classification: "unknown", category: "unknown", matchedRuleIds: [] };
const EXPECTED = [
  ["lifecycle-boundary", ["expected-boundary"], "planned-gate", "lifecycle-gate", ["expected-gate"]],
  ["workflow-observer", ["next-step-prevented"], "unplanned-interrupt", "workflow-interruption", ["prevented-step"]],
  ["authority-wait", ["declared-authority-wait"], "external-wait", "authority-wait", ["authority-wait"]],
  ["terminal-decision", ["deliberately-stopped"], "terminal-blocker", "terminal-stop", ["deliberate-stop"]],
  ["terminal-decision", ["non-recoverable"], "terminal-blocker", "terminal-stop", ["non-recoverable"]],
  ["guard-observation", ["next-step-prevented", "read-only-command"], "unplanned-interrupt", "read-only-refusal", ["read-only-refusal"]],
  ["readiness-observer", ["next-step-prevented", "readiness-partial", "writer-observer-disagreement"], "unplanned-interrupt", "readiness-partial-deadlock", ["readiness-partial"]],
  ["authority-wait", ["declared-authority-wait", "tp-ceremony"], "external-wait", "tp-ceremony-wait", ["authority-wait", "tp-wait"]],
  ["dispatch-observer", ["dispatch-ended", "next-step-prevented", "report-missing"], "unplanned-interrupt", "dispatch-truncation", ["dispatch-truncation"]],
];
for (const [sourceKind, facts, classification, category, matchedRuleIds] of EXPECTED) test(`predicate ${category} ${matchedRuleIds.join("+")}`, () => {
  const value = input(); Object.assign(value.observations[0], { sourceKind, facts });
  assert.deepEqual(classify(value, registry), { classification, category, matchedRuleIds });
  assert.equal(receipt(value).category, category);
});
test("missing code or insufficient facts stay unknown; suffix has no authority", () => {
  for (const change of [(v) => { v.typedCode = null; }, (v) => { v.observations[0].facts = []; }, (v) => { v.observations[0].sourceKind = "dispatch-observer"; }]) {
    const value = input(); change(value); assert.deepEqual(classify(value, registry), unknown); assert.equal(receipt(value).classification, "unknown");
  }
});
test("conflicting classes and distinct seed categories do not use first match", () => {
  const value = input(); observe(value, "workflow-observer", ["next-step-prevented"], "observation-2", B);
  assert.deepEqual(classify(value, registry), unknown);
  value.observations[0].sourceKind = "guard-observation"; value.observations[0].facts = ["next-step-prevented", "read-only-command"];
  assert.equal(classify(value, registry).category, "read-only-refusal");
  observe(value, "dispatch-observer", ["dispatch-ended", "next-step-prevented", "report-missing"], "observation-3", C);
  assert.deepEqual(classify(value, registry), unknown);
});
test("multiple terminal rules retain both matches and facts never combine across observations", () => {
  const value = input(); Object.assign(value.observations[0], { sourceKind: "terminal-decision", facts: ["deliberately-stopped", "non-recoverable"] });
  assert.deepEqual(classify(value, registry).matchedRuleIds, ["deliberate-stop", "non-recoverable"]);
  Object.assign(value.observations[0], { sourceKind: "guard-observation", facts: ["next-step-prevented"] });
  observe(value, "guard-observation", ["read-only-command"], "observation-2", B);
  assert.deepEqual(classify(value, registry), unknown);
});
test("canonical hashes and values are deterministic without mutation or shared output references", () => {
  const value = input(), before = clone(value), rulesBefore = clone(registry);
  const first = receipt(value), second = receipt(Object.fromEntries(Object.entries(value).reverse()));
  assert.deepEqual(first, second); assert.deepEqual(value, before); assert.deepEqual(registry, rulesBefore);
  const { recordSha256, ...core } = first;
  assert.equal(recordSha256, createHash("sha256").update(canonicalInvocationJson(core)).digest("hex"));
  assert.equal(first.registrySha256, createHash("sha256").update(canonicalInvocationJson(registry)).digest("hex"));
  first.scope.phase = "other"; assert.equal(value.scope.phase, "implementation");
  value.eventId = "event-2"; assert.equal(receipt(value).lineageId, second.lineageId);
});
test("unresolved measured elapsed and applicable-status fold do not fabricate resolution", () => {
  const value = receipt(); assert.deepEqual(value.blockedWallTime, { value: 10000, status: "measured", unit: "ms" });
  assert.equal(value.collectionStatus, "measured"); assert.equal(value.state, "unresolved"); assert.equal(value.resolvedAt.value, null);
  assert.equal(Object.hasOwn(value, "green"), false); assert.equal(Object.hasOwn(value, "outcome"), false);
});
function resolve(value, state = "resolved", resolutionClass = "resumed") {
  value.state = state; value[state === "resolved" ? "resolvedAt" : "terminalAt"] = time(state === "resolved" ? 4 : 6);
  value.resolution = { class: resolutionClass, reference: { id: "resolution-1", sha256: B } };
  value.binding.artifacts.push(clone(value.resolution.reference));
  if (state === "terminal") Object.assign(value.observations[0], { sourceKind: "terminal-decision", facts: [resolutionClass === "deliberate-stop" ? "deliberately-stopped" : "non-recoverable"] });
}
test("resolved and sanctioned recovery endpoints bind evidence", () => {
  const value = input(); resolve(value); assert.equal(receipt(value).blockedWallTime.value, 4000);
  value.resolution.class = "sanctioned-recovery"; rejected(value, "C1-BINDING");
  value.joins.recoveries = [clone(value.resolution.reference), clone(value.resolution.reference)];
  assert.deepEqual(receipt(value).recoveryCount, { value: 1, status: "measured", unit: "count" });
  value.joins.recoveries[1].sha256 = C; rejected(value, "C1-CONFLICT");
});
for (const resolutionClass of ["deliberate-stop", "non-recoverable"]) test(`terminal endpoint ${resolutionClass}`, () => {
  const value = input(); resolve(value, "terminal", resolutionClass);
  const result = receipt(value); assert.equal(result.blockedWallTime.value, 6000); assert.equal(result.classification, "terminal-blocker");
  value.observations[0].facts = []; rejected(value, "C1-CONFLICT");
});
test("unknown, unavailable and estimated times remain tagged", () => {
  const value = input(); value.firstObservedAt = absent(); assert.deepEqual(receipt(value).blockedWallTime, { value: null, status: "unknown", unit: "ms" });
  value.firstObservedAt = absent("unavailable"); assert.equal(receipt(value).blockedWallTime.status, "unavailable");
  value.firstObservedAt = time(0); value.observedThroughAt = time(10, "estimated"); assert.deepEqual(receipt(value).blockedWallTime, { value: 10000, status: "estimated", unit: "ms" });
  for (const state of ["skipped", "unavailable", "unknown"]) { value.state = state; assert.equal(receipt(value).blockedWallTime.value, null); }
});
test("invalid endpoint ordering, date spelling, absent endpoints and conflicting resolutions reject", () => {
  for (const change of [(v) => { v.firstObservedAt = time(11); }, (v) => { resolve(v); v.resolvedAt = time(11); }, (v) => { resolve(v); v.firstObservedAt = time(5); }, (v) => { resolve(v); v.terminalAt = time(6); }, (v) => { v.state = "resolved"; }, (v) => { v.resolvedAt = time(2); }, (v) => { v.firstObservedAt.value = "2026-02-30T00:00:00.000Z"; }, (v) => { v.firstObservedAt.value = "2026-08-01T00:00:00Z"; }, (v) => { v.firstObservedAt.status = "unknown"; }]) {
    const value = input(); change(value); rejected(value, "C1-TIME");
  }
  const value = input(); resolve(value); value.resolution.class = "deliberate-stop"; rejected(value, "C1-CONFLICT");
});
function invocations() {
  const request = createInvocationRequest({ invocationId: "invocation-1", subject: { kind: "dispatch", sha256: A }, route: { runner: "fixture", adapterId: "adapter-1", adapterVersion: "v1", requestedModel: "fixture-model" }, duty: "fixture-duty", sandboxDispositionSha256: B, command: { contractId: "fixture-command", executableSha256: C, arguments: [] }, inputDigests: [], timeoutMs: 1000, allowedOutputs: ["result"], privacyClass: "public" });
  const attempts = [];
  for (let index = 0; index < 2; index++) attempts.push(createInvocationAttempt({ attemptId: `attempt-${index}`, invocationId: request.invocationId, index, requestSha256: request.requestSha256, launchDecision: "suppressed", failureClass: "request-invalid", started: null, ended: null, resultSha256: null, previousSha256: attempts.at(-1)?.recordSha256 ?? null }));
  assert.equal(validateInvocationChain(request, attempts).ok, true);
  const key = invocationResolutionKey(request, { fixture: "fingerprint-1" });
  return attempts.map(({ invocationId, attemptId, requestSha256, previousSha256, recordSha256 }) => ({ invocationId, attemptId, requestSha256, previousSha256, recordSha256, invocationResolutionKey: key }));
}
const reviews = () => [{ reviewId: "review-1", parentReviewId: null, previousSha256: null, recordSha256: C }, { reviewId: "review-2", parentReviewId: "review-1", previousSha256: C, recordSha256: D }];
test("validated source invocation attempts preserve grouping and collapse replay", () => {
  const value = input(); value.joins.invocations = invocations(); value.joins.invocations.push(clone(value.joins.invocations[0]));
  value.joins.reviews = reviews(); value.joins.reviews.push(clone(value.joins.reviews[0]));
  const result = receipt(value); assert.equal(result.attemptCount.value, 2); assert.equal(result.joins.invocations.length, 2); assert.equal(result.joins.reviews.length, 2);
  assert.deepEqual(result.joins.invocations, invocations());
  value.joins.invocations = []; assert.equal(receipt(value).attemptCount.value, 2);
});
test("invocation precedence never sums review views", () => {
  const value = input(); value.joins.invocations = invocations().slice(0, 1); value.joins.reviews = reviews();
  assert.equal(receipt(value).attemptCount.value, 1);
  value.binding.candidate = { commit: "c".repeat(40), tree: "d".repeat(40) }; assert.equal(receipt(value).joins.reviews.length, 2);
});
for (const source of ["invocations", "reviews"]) test(`conflicts, partial predecessor and cycles in ${source}`, () => {
  const value = input(); value.joins[source] = source === "invocations" ? invocations() : reviews();
  const all = clone(value.joins[source]);
  value.joins[source].push({ ...value.joins[source][0], recordSha256: B }); rejected(value, "C1-CONFLICT");
  value.joins[source] = [all[1]]; rejected(value, "C1-LINEAGE");
  value.attemptCoverage = "estimated"; assert.equal(receipt(value).attemptCount.value, 1);
  value.attemptCoverage = "measured"; value.joins[source] = clone(all);
  value.joins[source][0].previousSha256 = all[1].recordSha256;
  if (source === "reviews") value.joins[source][0].parentReviewId = all[1].reviewId;
  rejected(value, "C1-LINEAGE");
  value.joins[source] = clone(all); const branch = clone(all[1]); branch.recordSha256 = B;
  branch[source === "reviews" ? "reviewId" : "attemptId"] = "branch-3"; value.joins[source].push(branch); rejected(value, "C1-LINEAGE");
});
test("request and predecessor identities cannot cross invocation or review bindings", () => {
  const value = input(); value.joins.invocations = invocations(); value.joins.invocations[1].requestSha256 = D; rejected(value, "C1-LINEAGE");
  value.joins.invocations = invocations(); value.joins.invocations[1].invocationId = "other"; rejected(value, "C1-LINEAGE");
  value.joins.invocations = []; value.joins.reviews = reviews(); value.joins.reviews[1].parentReviewId = "different"; rejected(value, "C1-LINEAGE");
  value.joins.reviews = reviews(); value.joins.reviews[0].reviewId = "review+forbidden"; rejected(value);
});
test("usage joins require existing dispatch context and deduplicate event bytes", () => {
  const value = input(); const usage = { scope: { dispatchId: "dispatch-1" }, source: { eventSha256: C } };
  value.joins.usages = [usage, clone(usage)]; assert.equal(receipt(value).joins.usages.length, 1);
  value.scope.dispatchId = null; rejected(value, "C1-LINEAGE");
  value.scope.dispatchId = "dispatch-1"; delete value.joins.usages[0].scope.dispatchId; rejected(value);
});
test("complete empty, partial, unknown and unavailable counts are distinct", () => {
  const value = input(); assert.deepEqual(receipt(value).attemptCount, { value: 0, status: "measured", unit: "count" });
  value.joins.invocations = invocations();
  for (const status of ["estimated", "unknown", "unavailable"]) {
    value.attemptCoverage = status; value.recoveryCoverage = status;
    assert.deepEqual(receipt(value).attemptCount, { value: status === "estimated" ? 2 : null, status, unit: "count" });
    assert.equal(receipt(value).recoveryCount.status, status);
  }
  value.actor = { runner: null, role: null }; value.binding.candidate = null; receipt(value);
});
test("closed records reject fabricated private fields at every nested boundary", () => {
  const locators = [(v) => v, (v) => v.scope, (v) => v.actor, (v) => v.observations[0], (v) => v.observations[0].artifact, (v) => v.firstObservedAt, (v) => v.joins];
  for (const field of ["prompt", "transcript", "path", "account", "threadId", "token"]) for (const locate of locators) {
    const value = input(); locate(value)[field] = "synthetic"; assert.equal(build(value, registry).ok, false);
  }
  const value = input(); value.observations = [{ prose: "expected gate" }]; rejected(value);
});
test("Id privacy screen covers allowed fields using synthetic credential shapes", () => {
  for (const ordinary of ["task-1", "risk-owner", "mask-value"]) { const value = input(); value.eventId = ordinary; receipt(value); }
  const mutations = [(v, token) => { v.eventId = token; }, (v, token) => { v.actor.runner = token; }, (v, token) => { v.scope.dispatchId = token; }, (v, token) => { v.typedCode = token; }, (v, token) => { v.observations[0].artifact.id = token; }, (v, token) => { v.joins.invocations = invocations(); v.joins.invocations[0].attemptId = token; }];
  for (const token of ["sk-syntheticFixtureToken", "ghp_syntheticFixtureToken", "prefix:sk-syntheticFixtureToken"]) for (const mutate of mutations) {
    const value = input(); mutate(value, token); rejected(value);
  }
});
test("accessors, symbols, sparse arrays and custom prototypes reject without getter execution", () => {
  let invoked = 0;
  for (const mutate of [(v) => { Object.defineProperty(v.actor, "runner", { enumerable: true, get() { invoked++; return "fixture"; } }); }, (v) => { v.actor[Symbol("private")] = "synthetic"; }, (v) => { Object.setPrototypeOf(v.actor, { extra: "synthetic" }); }, (v) => { v.joins.recoveries.length = 1; }, (v) => { v.observations.extra = "synthetic"; }, (v) => { Object.defineProperty(v.observations, "0", { get() { invoked++; return null; } }); }, (v) => { v.actor.runner = v; }]) {
    const value = input(); mutate(value); rejected(value);
  }
  assert.equal(invoked, 0);
  for (const thrown of [null, "synthetic", Object.defineProperty({}, "message", { get() { invoked++; return "C1-TIME"; } })]) {
    const hostile = new Proxy({}, { getPrototypeOf() { throw thrown; } });
    rejected(hostile); assert.deepEqual(validate(hostile, registry), { ok: false, code: "C1-SHAPE" });
  }
  assert.equal(invoked, 0);
  const value = input(); Object.setPrototypeOf(value, null); Object.setPrototypeOf(value.scope, null); receipt(value);
});
for (const kind of ["null", "string", "message getter", "private message", "descriptor trap"]) test(`classifier closes hostile ${kind} exceptions without reading getters`, () => {
  let invoked = 0;
  const privateText = "synthetic-private-path/token";
  const thrown = kind === "null" ? null : kind === "string" ? privateText
    : kind === "message getter" ? Object.defineProperty({}, "message", { get() { invoked++; return privateText; } })
    : kind === "private message" ? new Error(privateText)
    : new Proxy({}, { getOwnPropertyDescriptor() { throw privateText; } });
  const hostile = new Proxy({}, { getPrototypeOf() { throw thrown; } });
  assert.throws(() => classify(hostile, registry), { name: "TypeError", message: "C1-SHAPE" });
  assert.throws(() => classify(input(), hostile), { name: "TypeError", message: "C1-REGISTRY" });
  assert.equal(invoked, 0);
});
test("classifier rejects input getters and retains closed validation categories", () => {
  let invoked = 0;
  const value = input();
  Object.defineProperty(value.actor, "runner", { enumerable: true, get() { invoked++; return "synthetic-private"; } });
  assert.throws(() => classify(value, registry), { name: "TypeError", message: "C1-SHAPE" });
  assert.equal(invoked, 0);
  const cases = [
    ["C1-SHAPE", (v) => { v.observations[0].sourceKind = "synthetic-private"; }],
    ["C1-BINDING", (v) => { v.binding.artifacts[0].sha256 = B; }],
    ["C1-TIME", (v) => { v.firstObservedAt = time(11); }],
    ["C1-LINEAGE", (v) => { v.joins.reviews = reviews().slice(1); }],
    ["C1-CONFLICT", (v) => { resolve(v); v.resolution.class = "deliberate-stop"; }],
  ];
  for (const [message, mutate] of cases) {
    const invalid = input(); mutate(invalid);
    assert.throws(() => classify(invalid, registry), { name: "TypeError", message });
  }
  const rules = clone(registry); rules.rules[0].provenance.section = "synthetic-private";
  assert.throws(() => classify(input(), rules), { name: "TypeError", message: "C1-REGISTRY" });
});
test("collection bounds, primitive types and sorted unique observations are enforced", () => {
  for (const mutate of [(v) => { v.joins.usages = Array(4097).fill({}); }, (v) => { v.observations[0].facts = ["expected-boundary", "expected-boundary"]; }, (v) => { v.typedCode = 42; }, (v) => { v.actor.runner = Infinity; }, (v) => { delete v.actor.runner; }, (v) => { v.observations = []; }]) {
    const value = input(); mutate(value); rejected(value);
  }
  const value = input(); observe(value, "workflow-observer", [], "observation-2", B); value.observations.reverse(); rejected(value);
});
test("observation and candidate bindings reject absent, half, conflicting and unequal-length evidence", () => {
  const value = input(); value.binding.artifacts[0].sha256 = B; rejected(value, "C1-BINDING");
  value.binding.artifacts[0].sha256 = A; delete value.binding.candidate.tree; rejected(value, "C1-BINDING");
  value.binding.candidate.tree = B; rejected(value, "C1-BINDING");
  value.binding.candidate = null; value.observations.push(clone(value.observations[0])); value.observations[1].artifact.sha256 = B; rejected(value, "C1-CONFLICT");
});
test("registry pins, rules, provenance and injected predicates are closed", () => {
  assert.deepEqual(validateInterruptionRegistry(registry), { ok: true, code: null });
  for (const mutate of [(r) => { r.extra = "synthetic"; }, (r) => { r.contractPin.revision = 2; }, (r) => { r.contractPin.digest = A; }, (r) => { r.rules[0].allFacts = ["expected-boundary"]; }, (r) => { r.rules[0].classification = "planned-gate"; }, (r) => { r.rules[0].provenance.section = "invented"; }, (r) => { r.rules.push(clone(r.rules[0])); }, (r) => { r.rules.reverse(); }, (r) => { r.rules = []; }]) {
    const rules = clone(registry); mutate(rules); assert.deepEqual(validateInterruptionRegistry(rules), { ok: false, code: "C1-REGISTRY" }); rejected(input(), "C1-REGISTRY", rules);
  }
});
test("receipt validation recomputes classification, counts, statuses, hashes and normalized joins", () => {
  const valid = receipt();
  for (const mutate of [(r) => { r.classification = "external-wait"; }, (r) => { r.category = "unknown"; }, (r) => { r.attemptCount.value = 8; }, (r) => { r.collectionStatus = "unknown"; }, (r) => { r.blockedWallTime.value = 9000; }, (r) => { r.recordSha256 = B; }, (r) => { r.matchedRuleIds = []; }, (r) => { r.green = true; }, (r) => { r.recoveryCount.value = -1; }]) {
    const changed = clone(valid); mutate(changed); assert.equal(validate(changed, registry).ok, false);
  }
  const changed = clone(valid); changed.category = "unknown"; const { recordSha256: ignored, ...core } = changed;
  changed.recordSha256 = createHash("sha256").update(canonicalInvocationJson(core)).digest("hex"); assert.equal(validate(changed, registry).ok, false);
  const rules = clone(registry); rules.rules.pop(); assert.equal(validate(valid, rules).code, "C1-REGISTRY");
  changed.registrySha256 = A; assert.equal(validate(changed, registry).code, "C1-REGISTRY");
});

const observedCount = (value) => ({ value, status: "measured", unit: "count" });
const aggregateInput = (receipts, options = {}) => ({ receipts,
  window: options.window ?? { start: time(0), end: time(20) },
  coverage: options.coverage ?? { receipts: "measured", followup: "measured" } });
function aggregate(receipts, options = {}) {
  const result = aggregateInterruptionReceipts(aggregateInput(receipts, options), registry);
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(Object.keys(result).sort(), ["aggregate", "code", "ok"]);
  return result.aggregate;
}
function aggregateRejected(receipts, code, options = {}) {
  assert.deepEqual(aggregateInterruptionReceipts(aggregateInput(receipts, options), registry), { ok: false, code, aggregate: null });
}
function event(eventId, lineageId = eventId, edit = () => {}) {
  const value = input(); value.eventId = eventId; value.lineageId = lineageId; edit(value); return receipt(value);
}
const phaseEffect = (result) => result.groups.phase.find((row) => row.key === "implementation").effectiveness;
const expectedRatio = (numerator, denominator, status = "measured") => ({ numerator: observedCount(numerator), denominator: observedCount(denominator),
  value: denominator > 0 && ["measured", "estimated"].includes(status) ? numerator / denominator : null,
  status: denominator === 0 ? "unknown" : status, unit: "ratio" });

test("aggregate empty observations preserve complete versus unknown population and closed root", () => {
  for (const status of ["measured", "estimated", "unavailable", "unknown"]) {
    const value = aggregate([], { coverage: { receipts: status, followup: status } });
    assert.deepEqual(Object.keys(value).sort(), ["schema", "contractPin", "derivationRevision", "registrySha256", "window", "coverage", "receipts", "episodes", "totals", "groups", "categoryRanking", "recordSha256"].sort());
    assert.equal(value.schema, "pipeline.interruption-aggregate.v1");
    assert.deepEqual(value.contractPin, registry.contractPin);
    assert.equal(value.derivationRevision, registry.derivationRevision);
    assert.deepEqual(value.coverage, { receipts: status, followup: status });
    assert.deepEqual(value.groups, { phase: [], codeFamily: [], runner: [], role: [], recurrenceSignature: [], resolutionClass: [] });
    assert.deepEqual(value.receipts, []); assert.deepEqual(value.episodes, []); assert.deepEqual(value.categoryRanking, []);
    assert.deepEqual(Object.keys(value.totals).sort(), ["eventCount", "episodeCount", "unresolvedCount", "resolvedCount", "terminalCount", "skippedCount", "unavailableCount", "unknownCount", "unassessedCount"].sort());
    for (const metric of Object.values(value.totals)) assert.deepEqual(metric, observedCount(0));
  }
  assert.deepEqual(aggregateInterruptionReceipts(aggregateInput([]), {}), { ok: false, code: "C1-REGISTRY", aggregate: null });
});
test("aggregate replay and key permutation preserve complete canonical bytes and detached data", () => {
  const one = event("event-z", "lineage-a"), two = event("event-a", "lineage-b");
  const source = aggregateInput([one, two]), before = clone(source), rulesBefore = clone(registry);
  const value = aggregate(source.receipts), repeated = aggregate([two, one, clone(one)]);
  const reverse = (value) => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, value]) => [key, reverse(value)])) : value;
  assert.deepEqual(aggregateInterruptionReceipts(reverse(source), reverse(registry)).aggregate, value);
  assert.deepEqual(repeated, value); assert.deepEqual(source, before); assert.deepEqual(registry, rulesBefore);
  assert.deepEqual(value.receipts.map((row) => row.eventId), ["event-a", "event-z"]);
  const { recordSha256, ...core } = value;
  assert.equal(recordSha256, createHash("sha256").update(canonicalInvocationJson(core)).digest("hex"));
  value.receipts[0].scope.phase = "changed"; value.contractPin.revision = 10; value.groups.phase[0].lineageIds.push("changed");
  assert.deepEqual(aggregate(source.receipts), repeated); assert.deepEqual(source, before); assert.deepEqual(registry, rulesBefore);
  aggregateRejected([one, event("event-z", "other-lineage")], "C1-CONFLICT");
});
test("aggregate updates select lifetime costs without adding overlapping attempts or review views", () => {
  const initial = event("initial", "lineage", (v) => { v.observedThroughAt = time(2); v.joins.invocations = invocations().slice(0, 1); });
  const finished = event("finished", "lineage", (v) => { resolve(v); v.joins.invocations = invocations(); v.joins.reviews = reviews(); });
  const peer = event("peer", "peer-lineage", (v) => { v.firstObservedAt = time(8); });
  const result = aggregate([finished, peer, initial]);
  assert.deepEqual(result.episodes[0], { lineageId: "lineage", eventIds: ["finished", "initial"], latestEventId: "finished", orderingStatus: "measured",
    classifications: ["planned-gate"], states: ["resolved", "unresolved"], blockedWallTime: { value: 4000, status: "measured", unit: "ms" }, attemptCount: observedCount(2), recoveryCount: observedCount(0) });
  assert.deepEqual(result.totals.eventCount, observedCount(3)); assert.deepEqual(result.totals.episodeCount, observedCount(2));
  assert.deepEqual(result.categoryRanking[0].repeatCount, observedCount(1));
  assert.deepEqual(result.receipts.find((row) => row.eventId === "initial"), initial);
  assert.deepEqual(phaseEffect(result).followup.recurredCount, observedCount(1));
  const late = event("late-unresolved", "lineage", (v) => { v.observedThroughAt = time(6); v.joins.invocations = invocations().slice(0, 1); });
  aggregateRejected([finished, late], "C1-TIME");
});
test("aggregate sole uncertain cutoff remains latest and multiple uncertain cutoffs never choose a winner", () => {
  for (const status of ["estimated", "unknown", "unavailable"]) {
    const uncertain = event("uncertain", "lineage", (v) => { v.observedThroughAt = status === "estimated" ? time(12, status) : absent(status); });
    const sole = aggregate([uncertain]).episodes[0];
    assert.equal(sole.latestEventId, "uncertain"); assert.equal(sole.orderingStatus, status);
    for (const key of ["blockedWallTime", "attemptCount", "recoveryCount"]) assert.deepEqual(sole[key], uncertain[key]);
    const result = aggregate([uncertain, event("measured", "lineage")]);
    assert.equal(result.episodes[0].latestEventId, null); assert.equal(result.episodes[0].orderingStatus, status);
    for (const key of ["blockedWallTime", "attemptCount", "recoveryCount"]) assert.deepEqual(result.episodes[0][key], { value: null, status: status === "unavailable" ? status : "unknown", unit: key === "blockedWallTime" ? "ms" : "count" });
    assert.deepEqual(result.totals.unassessedCount, observedCount(1));
  }
  const unknown = event("unknown", "lineage", (v) => { v.observedThroughAt = absent(); });
  const unavailable = event("unavailable", "lineage", (v) => { v.observedThroughAt = absent("unavailable"); });
  assert.equal(aggregate([unknown, unavailable]).episodes[0].orderingStatus, "unknown");
});
test("aggregate measured ties require equivalent payloads and choose the smallest existing event ID", () => {
  assert.equal(aggregate([event("z", "lineage"), event("a", "lineage")]).episodes[0].latestEventId, "a");
  aggregateRejected([event("a", "lineage"), event("z", "lineage", (v) => { v.state = "skipped"; })], "C1-CONFLICT");
  aggregateRejected([event("a", "lineage"), event("z", "lineage", (v) => { v.scope.phase = "review"; })], "C1-CONFLICT");
});
test("aggregate rejects measured clock and final-state contradictions across individually valid events", () => {
  aggregateRejected([event("a", "lineage"), event("b", "lineage", (v) => { v.firstObservedAt = time(1); v.observedThroughAt = time(12); })], "C1-TIME");
  const resolved = event("resolved", "lineage", (v) => { resolve(v); });
  aggregateRejected([resolved, event("later", "lineage", (v) => { v.observedThroughAt = time(12); })], "C1-CONFLICT");
  aggregateRejected([resolved, event("different-end", "lineage", (v) => { resolve(v); v.resolvedAt = time(5); v.observedThroughAt = time(12); })], "C1-TIME");
  aggregateRejected([resolved, event("different-reference", "lineage", (v) => { resolve(v); v.resolution.reference.id = "resolution-2"; v.binding.artifacts[1].id = "resolution-2"; v.observedThroughAt = time(12); })], "C1-CONFLICT");
  const terminal = event("terminal", "lineage", (v) => { resolve(v, "terminal", "deliberate-stop"); v.observedThroughAt = absent(); v.observations[0].artifact.id = "terminal-observation"; v.binding.artifacts[0].id = "terminal-observation"; v.binding.artifacts.sort((a, b) => a.id < b.id ? -1 : 1); });
  aggregateRejected([resolved, terminal], "C1-CONFLICT");
  const estimated = [1, 2].map((second) => event(`estimated-${second}`, "lineage", (v) => { v.firstObservedAt = time(second, "estimated"); v.observedThroughAt = time(second + 10, "estimated"); }));
  assert.equal(aggregate(estimated).episodes[0].latestEventId, null);
});
test("aggregate preserves historical membership, null buckets and candidate changes without adding episodes", () => {
  const initial = event("initial", "lineage", (v) => { v.actor.role = null; v.scope.featureId = null; });
  const changed = event("changed", "lineage", (v) => { v.scope.phase = "review"; v.actor = { runner: "other", role: "unknown" }; v.observedThroughAt = time(12); v.binding.candidate = { commit: "c".repeat(40), tree: "d".repeat(40) }; });
  const result = aggregate([changed, initial]);
  assert.deepEqual(result.groups.phase.map((row) => row.key), ["implementation", "review"]);
  assert.deepEqual(result.groups.role.map((row) => row.key), ["unknown", null]);
  assert.equal(result.groups.phase.reduce((sum, row) => sum + row.episodeCount.value, 0), 2);
  assert.equal(result.totals.episodeCount.value, 1);
  assert.deepEqual(result.receipts.find((row) => row.eventId === "initial").binding, initial.binding);
  assert.deepEqual(result.groups.recurrenceSignature.map((row) => row.key), [
    { phase: "implementation", codeFamily: "lifecycle-gate", runner: "test-runner", role: null, typedCode: "SOURCE-REQUIRED", classification: "planned-gate" },
    { phase: "review", codeFamily: "lifecycle-gate", runner: "other", role: "unknown", typedCode: "SOURCE-REQUIRED", classification: "planned-gate" },
  ]);
  for (const key of ["featureId", "packageId", "dispatchId"]) aggregateRejected([event("a", "lineage"), event("b", "lineage", (v) => { v.scope[key] = "different"; v.observedThroughAt = time(12); })], "C1-LINEAGE");
});
test("aggregate category ranking counts historical lineages, includes unknown and uses ordinal ties", () => {
  const rows = [];
  for (const [kind, total, sourceKind, facts] of [
    ["tp", 3, "authority-wait", ["declared-authority-wait", "tp-ceremony"]],
    ["refusal", 2, "guard-observation", ["next-step-prevented", "read-only-command"]],
    ["unknown", 2, "lifecycle-boundary", []],
  ]) for (let n = 0; n < total; n++) rows.push(event(`${kind}-${n}`, `${kind}-${n}`, (v) => { Object.assign(v.observations[0], { sourceKind, facts }); }));
  const value = aggregate([...rows, ...rows]);
  assert.deepEqual(value.categoryRanking.map((row) => [row.category, row.episodeCount.value, row.repeatCount.value]), [
    ["tp-ceremony-wait", 3, 2], ["read-only-refusal", 2, 1], ["unknown", 2, 1] ]);
  assert.deepEqual(new Set(value.receipts.map((row) => row.classification)), new Set(["external-wait", "unplanned-interrupt", "unknown"]));
});
for (const kind of ["invocations", "reviews", "usages", "recoveries"]) test(`aggregate ${kind} unions retain identity and reject measured drops`, () => {
  const links = kind === "invocations" ? invocations().slice(0, 1) : kind === "reviews" ? reviews().slice(0, 1)
    : kind === "usages" ? [{ scope: { dispatchId: "dispatch-1" }, source: { eventSha256: C } }] : [{ id: "recovery", sha256: C }];
  const first = event("a", "lineage", (v) => { v.joins[kind] = clone(links); });
  aggregateRejected([first, event("b", "lineage", (v) => { v.observedThroughAt = time(12); })], "C1-LINEAGE");
  const partial = event("b", "lineage", (v) => { v.observedThroughAt = time(12); v.attemptCoverage = "estimated"; v.recoveryCoverage = "estimated"; });
  assert.deepEqual(aggregate([first, partial]).receipts.find((row) => row.eventId === "a").joins[kind], first.joins[kind]);
  if (kind !== "usages") {
    const changed = event("b", "lineage", (v) => { v.observedThroughAt = time(12); v.joins[kind] = clone(links); v.joins[kind][0][kind === "recoveries" ? "sha256" : "recordSha256"] = B; });
    aggregateRejected([first, changed], "C1-CONFLICT");
  }
});
test("aggregate observation and bound artifact identities cannot change content", () => {
  const first = event("a", "lineage");
  aggregateRejected([first, event("b", "lineage", (v) => { v.observedThroughAt = time(12); v.observations[0].facts = []; })], "C1-CONFLICT");
  aggregateRejected([first, event("b", "lineage", (v) => { v.observedThroughAt = time(12); v.binding.artifacts[0].sha256 = B; v.observations[0].artifact.sha256 = B; })], "C1-CONFLICT");
});
for (const kind of ["invocations", "reviews"]) test(`aggregate partial ${kind} union detects forks, cycles and contradictory predecessors`, () => {
  const base = kind === "invocations" ? invocations() : reviews();
  const make = (name, links) => event(name, "lineage", (v) => { v.attemptCoverage = "estimated"; v.observedThroughAt = absent(); v.joins[kind] = links; });
  const left = clone(base[1]), right = clone(base[1]);
  right[kind === "invocations" ? "attemptId" : "reviewId"] = "branch"; right.recordSha256 = B;
  aggregateRejected([make("left", [left]), make("right", [right])], "C1-LINEAGE");
  const cycle = clone(base); cycle[0].previousSha256 = cycle[1].recordSha256;
  if (kind === "reviews") cycle[0].parentReviewId = cycle[1].reviewId;
  aggregateRejected([make("left", [cycle[0]]), make("right", [cycle[1]])], "C1-LINEAGE");
  const contradictory = clone(base);
  if (kind === "reviews") contradictory[1].parentReviewId = "other-parent";
  else contradictory[1].requestSha256 = B;
  aggregateRejected([make("left", [contradictory[0]]), make("right", [contradictory[1]])], "C1-LINEAGE");
  const valid = aggregate([make("left", [base[0]]), make("right", [base[1]])]);
  assert.equal(valid.episodes[0].latestEventId, null);
  assert.equal(valid.receipts.every((row) => row.attemptCount.status === "estimated"), true);
});

// Resolution/followup scenarios adapted from the independent C1 test-author draft;
// expectations follow the approved closed dimension and assessed-cohort contracts.
test("aggregate resolution share exposes the exact assessed subset and all current states", () => {
  const rows = [event("r1", "r1", resolve), event("r2", "r2", resolve), event("unresolved"),
    event("terminal", "terminal", (v) => resolve(v, "terminal", "deliberate-stop")),
    event("skipped", "skipped", (v) => { v.state = "skipped"; }),
    event("unknown", "unknown", (v) => { v.state = "unknown"; v.observations[0].facts = []; })];
  const result = aggregate(rows), effect = phaseEffect(result);
  assert.deepEqual(effect.assessedCount, observedCount(4)); assert.deepEqual(effect.resolvedCount, observedCount(2));
  assert.deepEqual(effect.unassessedCount, observedCount(2)); assert.deepEqual(effect.resolvedShare, expectedRatio(2, 4));
  assert.deepEqual(result.totals, { eventCount: observedCount(6), episodeCount: observedCount(6), unresolvedCount: observedCount(1), resolvedCount: observedCount(2), terminalCount: observedCount(1), skippedCount: observedCount(1), unknownCount: observedCount(1), unavailableCount: observedCount(0), unassessedCount: observedCount(0) });
  const blocker = event("resolved-blocker", "resolved-blocker", (v) => { resolve(v); Object.assign(v.observations[0], { sourceKind: "terminal-decision", facts: ["non-recoverable"] }); });
  assert.deepEqual(phaseEffect(aggregate([blocker])).unassessedCount, observedCount(1));
  assert.deepEqual(phaseEffect(aggregate([blocker])).resolvedShare, expectedRatio(0, 0));
});
test("aggregate ratios retain measured cohort operands under collection and population uncertainty", () => {
  for (const status of ["measured", "estimated", "unavailable", "unknown"]) {
    const row = event("resolved", "resolved", (v) => { resolve(v); v.attemptCoverage = status; });
    assert.deepEqual(phaseEffect(aggregate([row])).resolvedShare, expectedRatio(1, 1, status));
    const result = aggregate([event("resolved", "resolved", resolve)], { coverage: { receipts: status, followup: status } });
    assert.deepEqual(phaseEffect(result).resolvedShare, expectedRatio(1, 1, status));
    assert.deepEqual(result.totals.episodeCount, observedCount(1));
  }
  for (const state of ["skipped", "unavailable", "unknown"]) {
    const result = phaseEffect(aggregate([event(state, state, (v) => { v.state = state; })]));
    assert.deepEqual(result.resolvedShare, expectedRatio(0, 0)); assert.deepEqual(result.followup.recurrenceShare, expectedRatio(0, 0));
  }
});
test("aggregate recurrence denominators count resolved members once under complete and partial exposure", () => {
  const rows = [event("r1", "r1", resolve), event("r2", "r2", (v) => { resolve(v); v.typedCode = "OTHER"; }),
    event("peer", "peer", (v) => { v.firstObservedAt = time(8); }), event("peer2", "peer2", (v) => { v.firstObservedAt = time(9); })];
  const complete = phaseEffect(aggregate(rows)).followup;
  assert.deepEqual(complete, { resolvedCohortCount: observedCount(2), assessedCount: observedCount(2), recurredCount: observedCount(1), noRecurrenceObservedCount: observedCount(1), unknownCount: observedCount(0), recurrenceShare: expectedRatio(1, 2) });
  const partial = phaseEffect(aggregate(rows, { coverage: { receipts: "measured", followup: "estimated" } })).followup;
  assert.deepEqual(partial, { resolvedCohortCount: observedCount(2), assessedCount: observedCount(1), recurredCount: observedCount(1), noRecurrenceObservedCount: observedCount(0), unknownCount: observedCount(1), recurrenceShare: expectedRatio(1, 1, "estimated") });
  for (const status of ["unavailable", "unknown"]) {
    const followup = phaseEffect(aggregate(rows, { coverage: { receipts: status, followup: status } })).followup;
    assert.deepEqual(followup.recurredCount, observedCount(1)); assert.deepEqual(followup.recurrenceShare, expectedRatio(1, 1, status));
  }
  const resolutionGroup = aggregate(rows).groups.resolutionClass.find((group) => group.key === "resumed");
  assert.deepEqual(resolutionGroup.effectiveness.followup, complete); // Peers searched outside this group.
});
test("aggregate followup observes strict resolution and inclusive end boundaries without invented exposure", () => {
  const resolved = event("resolved", "resolved", resolve);
  for (const [start, expected] of [[4, 0], [5, 1], [20, 1]]) {
    const peer = event("peer", "peer", (v) => { v.firstObservedAt = time(start); v.observedThroughAt = time(20); });
    assert.deepEqual(phaseEffect(aggregate([resolved, peer])).followup.recurredCount, observedCount(expected));
  }
  const atEnd = event("at-end", "at-end", (v) => { resolve(v); v.resolvedAt = time(20); v.observedThroughAt = time(20); });
  const result = phaseEffect(aggregate([atEnd])).followup;
  assert.deepEqual(result.unknownCount, observedCount(1)); assert.deepEqual(result.recurrenceShare, expectedRatio(0, 0));
  const retry = event("retry", "resolved", (v) => { resolve(v); v.observedThroughAt = time(12); });
  assert.deepEqual(phaseEffect(aggregate([resolved, retry])).followup.noRecurrenceObservedCount, observedCount(1));
});
test("aggregate uncertain peer signatures and clocks prevent absence while a measured peer still proves recurrence", () => {
  const resolved = event("resolved", "resolved", resolve);
  for (const edit of [(v) => { v.firstObservedAt = absent(); }, (v) => { v.firstObservedAt = time(8, "estimated"); },
    (v) => { v.actor.runner = null; v.firstObservedAt = time(8); }, (v) => { v.typedCode = null; v.firstObservedAt = time(8); }, (v) => { v.observedThroughAt = absent(); v.firstObservedAt = absent(); }]) {
    const uncertain = event("uncertain", "uncertain", edit);
    const followup = phaseEffect(aggregate([resolved, uncertain])).followup;
    assert.deepEqual(followup.noRecurrenceObservedCount, observedCount(0)); assert.deepEqual(followup.unknownCount, observedCount(1));
    assert.deepEqual(followup.recurrenceShare, expectedRatio(0, 0));
    const positive = event("positive", "positive", (v) => { v.firstObservedAt = time(8); });
    assert.deepEqual(phaseEffect(aggregate([resolved, uncertain, positive])).followup.recurrenceShare, expectedRatio(1, 1));
  }
  const changed = event("changed", "resolved", (v) => { resolve(v); v.actor.runner = "other"; v.observedThroughAt = time(12); });
  assert.deepEqual(phaseEffect(aggregate([resolved, changed])).followup.unknownCount, observedCount(1));
  const unrelated = event("unrelated", "unrelated", (v) => { v.typedCode = "OTHER"; v.firstObservedAt = absent(); });
  assert.deepEqual(phaseEffect(aggregate([resolved, unrelated])).followup.noRecurrenceObservedCount, observedCount(1));
});
test("aggregate wrapper rejects hostile data without reading accessors or proxy property traps", () => {
  let called = 0;
  const accessor = (object, key) => Object.defineProperty(object, key, { enumerable: true, get() { called++; throw new Error("synthetic-private"); } });
  for (const change of [(v) => accessor(v, "receipts"), (v) => accessor(v.window, "end"), (v) => accessor(v.receipts, "0"),
    (v) => accessor(v.receipts[0].actor, "runner"), (v) => { v.coverage[Symbol("private")] = true; },
    (v) => { Object.setPrototypeOf(v.window, { private: true }); }, (v) => { v.receipts.length = 2; },
    (v) => { v.receipts.extra = true; }, (v) => { v.receipts[0].actor.runner = v; }, (v) => { v.private = "synthetic"; },
    (v) => { v.receipts[0].actor.runner = Number.MAX_SAFE_INTEGER + 1; }, (v) => { v.receipts[0].actor.runner = "sk-syntheticFixtureToken"; }]) {
    const value = aggregateInput([receipt()]); change(value);
    assert.deepEqual(aggregateInterruptionReceipts(value, registry), { ok: false, code: "C1-SHAPE", aggregate: null });
  }
  const proxy = new Proxy(receipt(), { get() { called++; throw new Error("synthetic-private"); } });
  assert.deepEqual(aggregate([proxy]), aggregate([receipt()]));
  const hostile = new Proxy({}, { getPrototypeOf() { throw Object.defineProperty({}, "message", { get() { called++; return "private"; } }); } });
  assert.deepEqual(aggregateInterruptionReceipts(hostile, registry), { ok: false, code: "C1-SHAPE", aggregate: null });
  assert.deepEqual(aggregateInterruptionReceipts(aggregateInput([]), hostile), { ok: false, code: "C1-REGISTRY", aggregate: null });
  assert.equal(called, 0);
});
test("aggregate validates every receipt and enforces closed bounds, registry bindings and supplied windows", () => {
  aggregateRejected(Array(4097).fill(receipt()), "C1-SHAPE");
  assert.equal(aggregate(Array(4096).fill(receipt())).totals.eventCount.value, 1);
  for (const [code, mutate] of [["C1-REGISTRY", (v) => { v.contractPin.revision++; }], ["C1-CONFLICT", (v) => { v.recordSha256 = B; }],
    ["C1-BINDING", (v) => { v.binding.candidate.tree = null; }], ["C1-SHAPE", (v) => { v.attemptCount.value = Infinity; }]]) {
    const changed = clone(receipt()); mutate(changed); aggregateRejected([receipt(), changed], code);
  }
  for (const window of [{ start: time(11), end: time(20) }, { start: time(0), end: time(9) }, { start: time(20), end: time(0) },
    { start: absent(), end: time(20) }, { start: time(0), end: time(20, "estimated") }]) aggregateRejected([receipt()], "C1-TIME", { window });
  const lifetime = aggregate([event("resolved", "resolved", resolve)], { window: { start: time(8), end: time(20) } });
  assert.equal(lifetime.episodes[0].blockedWallTime.value, 4000);
  const partial = aggregate([receipt()], { window: { start: absent(), end: absent("unavailable") }, coverage: { receipts: "unknown", followup: "unknown" } });
  assert.deepEqual(partial.totals.eventCount, observedCount(1));
  const deep = clone(receipt()); let cursor = deep.actor; for (let n = 0; n < 18; n++) cursor = cursor.extra = {};
  aggregateRejected([deep], "C1-SHAPE");
});
test("aggregate computed source union respects 4096 bound even when each receipt is valid", () => {
  const make = (start) => event(`event-${start}`, "lineage", (v) => {
    v.observedThroughAt = absent(); v.attemptCoverage = "estimated";
    v.joins.usages = Array.from({ length: 2049 }, (_, n) => ({ scope: { dispatchId: "dispatch-1" }, source: { eventSha256: (start + n).toString(16).padStart(64, "0") } }));
  });
  aggregateRejected([make(0), make(2049)], "C1-SHAPE");
});
test("aggregate peers with measured starts outside the exposure cannot conceal recurrence", () => {
  const resolved = event("resolved", "resolved", resolve);
  for (const start of [0, 4, 21]) {
    const peer = event("peer", "peer", (v) => { v.firstObservedAt = time(start); v.observedThroughAt = absent(); v.actor.runner = null; });
    assert.deepEqual(phaseEffect(aggregate([resolved, peer])).followup.noRecurrenceObservedCount, observedCount(1));
  }
});
test("aggregate runs only on supplied data under time, filesystem, process and network tripwires", (t) => {
  const supplied = aggregateInput([event("resolved", "resolved", resolve)]), expected = aggregateInterruptionReceipts(supplied, registry);
  const OriginalDate = Date;
  let touched = 0;
  const denied = () => { touched++; throw new Error("ambient I/O unavailable in pure aggregation"); };
  try {
    for (const [object, name] of [[fs, "readFileSync"], [fs, "writeFileSync"], [fs, "readFile"], [fs, "writeFile"],
      [childProcess, "spawnSync"], [childProcess, "spawn"], [childProcess, "execSync"], [net, "connect"], [process, "cwd"]]) t.mock.method(object, name, denied);
    t.mock.method(globalThis, "fetch", denied);
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { if (args.length === 0) denied(); super(...args); }
      static now() { return denied(); }
    };
    syncBuiltinESMExports();
    assert.deepEqual(aggregateInterruptionReceipts(supplied, registry), expected);
    assert.equal(touched, 0);
  } finally { globalThis.Date = OriginalDate; t.mock.restoreAll(); syncBuiltinESMExports(); }
});


// Full-source adapter fixtures use the owning Nova constructors. They are
// synthetic records, not evidence of a live dispatch or interruption.
function sourceDisposition(duty = "fixture-duty", terminal = false) {
  let disposition = createSelectedSandboxDisposition({
    dispositionId: "fixture-disposition", duty, transport: "fixture-transport",
    fingerprint: { runnerSha256: A, hostBootSha256: B, platformClass: "fixture-platform", architectureClass: "fixture-arch",
      sandboxSha256: C, profileSha256: D, policySha256: A, duty, contractVersion: "fixture-v1" },
    assurance: { requested: "selected-sandbox", observed: "not-observed", evidenceSha256: null }, nowMonotonicMs: 0,
  });
  if (terminal) {
    const probing = reduceSelectedSandboxDisposition(disposition, { kind: "probe-start",
      attempt: { attemptId: "fixture-probe", index: 0, startedMonotonicMs: 0 }, challenge: { nonceSha256: A, bits: 256 } });
    assert.equal(probing.ok, true);
    const failed = reduceSelectedSandboxDisposition(probing.disposition,
      { kind: "probe-failure", failure: "terminal-unavailable", observationReceiptSha256: B, nowMonotonicMs: 1 });
    assert.equal(failed.ok, true); disposition = failed.disposition;
  }
  assert.equal(validateSelectedSandboxDisposition(disposition).ok, true);
  return disposition;
}
function invocationSource({ count = 2, disposition = sourceDisposition(), invocationId = "source-invocation", attemptIds = ["z-attempt", "A-attempt"], commandText = "/synthetic/private/command" } = {}) {
  const request = createInvocationRequest({ invocationId, subject: { kind: "dispatch", sha256: A },
    route: { runner: "private-runner", adapterId: "private-adapter", adapterVersion: "v1", requestedModel: "private-model" },
    duty: "fixture-duty", sandboxDispositionSha256: disposition?.recordSha256 ?? B,
    command: { contractId: "private-command", executableSha256: C, arguments: [{ type: "literal", value: commandText }] },
    inputDigests: [], timeoutMs: 1000, allowedOutputs: ["result"], privacyClass: "private" });
  const attempts = [];
  for (let index = 0; index < count; index++) attempts.push(createInvocationAttempt({
    attemptId: attemptIds[index] ?? `attempt-${index}`, invocationId, index, requestSha256: request.requestSha256,
    launchDecision: "suppressed", failureClass: "selected-sandbox-terminal",
    started: null, ended: null, resultSha256: null, previousSha256: attempts.at(-1)?.recordSha256 ?? null,
  }));
  assert.equal(validateInvocationChain(request, attempts).ok, true);
  return { request, attempts, sandboxDisposition: disposition };
}
function reviewSource(firstId = "z-review", count = 2) {
  const history = [];
  for (let index = 0; index < count; index++) {
    const parent = history.at(-1) ?? null;
    const candidate = { base: parent?.candidate.commit ?? "1".repeat(40),
      commit: (index ? "4" : "2").repeat(40), tree: (index ? "5" : "3").repeat(40) };
    const packet = { packetId: (index ? "2" : "1").repeat(32), request: { taskId: "synthetic-private-task" },
      candidate, diff: { base: candidate.base, commit: candidate.commit, path: "synthetic/private.diff", bytes: 1, sha256: A },
      diffPaths: ["synthetic/private-source.mjs"], bindings: { requestSha256: B, diffPathsSha256: C, governanceSha256: D } };
    history.push(compileCriticReviewLineage({
      packet, reviewId: parent ? "A-review" : firstId, parent,
      packages: [{ id: "private-package", subjectSha256: A, changedPaths: packet.diffPaths, integrationEdges: ["fixture-edge"] }],
      coverage: { changedPaths: packet.diffPaths, acceptanceIds: ["C1-source-fixture"], integrationEdges: ["fixture-edge"], complete: false, receiptSha256: null },
      lane: { laneId: `private-lane-${index}`, contextSha256: index ? B : A, evidenceSha256: C },
      verdict: { status: "pending", schemaValid: false, resultSha256: null, failure: null }, findings: [],
      correction: parent ? { commit: candidate.commit, deltaSha256: A, impactSha256: sha256Canonical(["fixture-edge"]) } : null,
      invalidation: parent ? { kind: "full-review-required", reason: "explicit-broad-review", evidenceSha256: D }
        : { kind: "none", reason: null, evidenceSha256: null },
      reviewAttempt: { round: index + 1, correctionCommits: index, requestedMode: "full" },
    }));
  }
  assert.equal(validateCriticReviewHistory(history).ok, true);
  return history;
}
function sourceInput(invocation = invocationSource(), review = reviewSource()) {
  return { invocationBytes: invocation === null ? null : JSON.stringify(invocation),
    reviewBytes: review === null ? null : JSON.stringify(review), currentCandidate: review?.at(-1).candidate ?? null,
    coverage: { invocations: invocation === null ? "unknown" : "measured", reviews: review === null ? "unknown" : "measured" } };
}
function projected(value = sourceInput()) {
  const result = projectC1SourceJoins(value);
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(Object.keys(result).sort(), ["code", "ok", "projection"]);
  return result.projection;
}
function projectionRejected(value, code) {
  assert.deepEqual(projectC1SourceJoins(value), { ok: false, code, projection: null });
}
const rawSourceHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function resealAttempt(row, patch) {
  const { schema: _schema, recordSha256: _digest, ...semantic } = row;
  return createInvocationAttempt({ ...semantic, ...patch });
}
function resealReview(row, patch) {
  const { recordSha256: _digest, ...semantic } = { ...row, ...patch };
  return { ...semantic, recordSha256: sha256Canonical(semantic) };
}

test("source projection validates real histories then sorts exact closed public rows", () => {
  const invocation = invocationSource(), review = reviewSource(), value = sourceInput(invocation, review);
  const projection = projected(value);
  assert.deepEqual(projection, {
    joins: {
      invocations: invocation.attempts.map(({ invocationId, attemptId, requestSha256, previousSha256, recordSha256 }) =>
        ({ invocationId, attemptId, requestSha256, previousSha256, recordSha256,
          invocationResolutionKey: invocationResolutionKey(invocation.request, invocation.sandboxDisposition.fingerprint) })).reverse(),
      reviews: review.map(({ reviewId, parentReviewId, previousSha256, recordSha256 }) =>
        ({ reviewId, parentReviewId, previousSha256, recordSha256 })).reverse(),
    },
    coverage: { invocations: "measured", reviews: "measured" }, binding: { candidate: clone(review.at(-1).candidate) },
    sourceSha256: { invocation: rawSourceHash(value.invocationBytes), review: rawSourceHash(value.reviewBytes) },
  });
  assert.notDeepEqual(review[0].candidate, review[1].candidate);
  for (const privateText of ["private-command", "/synthetic/private", "private-lane", "private-package", "fingerprint", "findings", "requestedModel", "privacyClass"])
    assert.equal(JSON.stringify(projection).includes(privateText), false, privateText);
});
test("source projection permits null disposition and terminal-unavailable observations without admission", () => {
  for (const disposition of [null, sourceDisposition(), sourceDisposition("fixture-duty", true)]) {
    const source = invocationSource({ disposition }), result = projected(sourceInput(source, null));
    assert.equal(result.joins.invocations[0].invocationResolutionKey, disposition === null ? null : invocationResolutionKey(source.request, disposition.fingerprint));
  }
});
test("source projection rejects original invalid invocation order, identities, digest and predecessor", () => {
  for (const mutate of [
    (v) => { v.request.requestSha256 = D; },
    (v) => { v.attempts[0].recordSha256 = D; },
    (v) => { v.attempts.reverse(); },
    (v) => { v.attempts.push(clone(v.attempts[0])); },
    (v) => { v.attempts[1] = resealAttempt(v.attempts[1], { previousSha256: D }); },
    (v) => { v.attempts[1] = resealAttempt(v.attempts[1], { attemptId: v.attempts[0].attemptId }); },
    (v) => { v.attempts = v.attempts.slice(1); },
    (v) => { v.extra = null; },
    (v) => { v.sandboxDisposition = { fingerprint: v.sandboxDisposition.fingerprint }; },
    (v) => { v.sandboxDisposition.recordSha256 = D; },
  ]) { const source = clone(invocationSource()); mutate(source); projectionRejected(sourceInput(source, null), "C1J-INVOCATION"); }
});
test("source projection binds the full disposition digest and duty", () => {
  const source = clone(invocationSource());
  source.sandboxDisposition = sourceDisposition("fixture-duty", true);
  projectionRejected(sourceInput(source, null), "C1J-BINDING");
  const otherDuty = sourceDisposition("other-duty"), mismatch = invocationSource({ disposition: otherDuty });
  projectionRejected(sourceInput(mismatch, null), "C1J-BINDING");
});
test("source projection rejects invalid review history before projection and binds final candidate", () => {
  for (const mutate of [
    (rows) => { rows.reverse(); }, (rows) => { rows.push(clone(rows[0])); },
    (rows) => { rows[0].recordSha256 = D; },
    (rows) => { rows[1] = resealReview(rows[1], { previousSha256: D }); },
    (rows) => { rows.splice(0, 1); },
    (rows) => { rows[0].extra = null; },
  ]) {
    const history = clone(reviewSource()); mutate(history);
    projectionRejected(sourceInput(null, history), "C1J-REVIEW");
  }
  const value = sourceInput(null, reviewSource());
  for (const candidate of [null, reviewSource()[0].candidate, { commit: "f".repeat(40), tree: value.currentCandidate.tree }])
    projectionRejected({ ...value, currentCandidate: candidate }, "C1J-BINDING");
  assert.equal(projected(sourceInput(null, reviewSource("only-review", 1))).joins.reviews.length, 1);
});
test("source projection preserves explicit coverage and distinguishes absent from measured empty", () => {
  for (const status of ["measured", "estimated", "unavailable", "unknown"]) {
    const value = sourceInput(); value.coverage = { invocations: status, reviews: status };
    assert.deepEqual(projected(value).coverage, value.coverage);
  }
  for (const status of ["unknown", "unavailable"]) {
    const value = sourceInput(null, null); value.coverage = { invocations: status, reviews: status };
    assert.deepEqual(projected(value), { joins: { invocations: [], reviews: [] }, coverage: value.coverage,
      binding: { candidate: null }, sourceSha256: { invocation: null, review: null } });
  }
  for (const field of ["invocations", "reviews"]) for (const status of ["measured", "estimated"]) {
    const value = sourceInput(null, null); value.coverage[field] = status; projectionRejected(value, "C1J-BINDING");
  }
  const empty = projected(sourceInput(invocationSource({ count: 0 }), null));
  assert.deepEqual(empty.joins.invocations, []); assert.equal(empty.coverage.invocations, "measured");
  projectionRejected({ ...sourceInput(null, null), reviewBytes: "[]" }, "C1J-REVIEW");
});
test("source projection rejects missing context and invalid closed coverage or document roots", () => {
  for (const value of [null, undefined, [], "source", {}, { ...sourceInput(), coverage: null },
    { ...sourceInput(), coverage: { invocations: "complete", reviews: "measured" } },
    { ...sourceInput(), coverage: { invocations: "measured" } },
    { ...sourceInput(), currentCandidate: { commit: A } }]) projectionRejected(value, "C1J-SHAPE");
  for (const document of ["null", "true", "42", '"source"', "{}", "[]"]) {
    projectionRejected({ ...sourceInput(), invocationBytes: document }, "C1J-INVOCATION");
    projectionRejected({ ...sourceInput(), reviewBytes: document }, "C1J-REVIEW");
  }
});
test("source projection accepts exactly string Buffer Uint8Array bytes and snapshots without iterators", () => {
  const original = sourceInput(), expected = projected(original);
  for (const encode of [(v) => v, (v) => Buffer.from(v), (v) => new Uint8Array(Buffer.from(v)),
    (v) => { const backing = Buffer.from("xx" + v + "yy"); return new Uint8Array(backing.buffer, backing.byteOffset + 2, Buffer.byteLength(v)); }])
    assert.deepEqual(projected({ ...original, invocationBytes: encode(original.invocationBytes), reviewBytes: encode(original.reviewBytes) }), expected);
  let touched = 0;
  const bytes = Buffer.from(original.invocationBytes);
  Object.defineProperty(bytes, Symbol.iterator, { get() { touched++; throw null; } });
  Object.defineProperty(bytes, "byteLength", { get() { touched++; throw null; } });
  assert.deepEqual(projected({ ...original, invocationBytes: bytes }), expected); assert.equal(touched, 0);
  for (const unsupported of [{}, [], new ArrayBuffer(1), new Uint16Array(1), new DataView(new ArrayBuffer(1)), 2, undefined,
    Object.defineProperty({}, "toString", { get() { touched++; throw null; } }), new Proxy(new Uint8Array(1), {})])
    projectionRejected({ ...original, invocationBytes: unsupported }, "C1J-SHAPE");
  assert.equal(touched, 0);
});
test("source projection rejects hostile context without getters, iterators, coercion or exception disclosure", () => {
  let touched = 0;
  for (const locate of [(v) => v, (v) => v.coverage, (v) => v.currentCandidate]) for (const mutate of [
    (v) => { v.extra = null; }, (v) => { v[Symbol("extra")] = null; },
    (v) => { Object.setPrototypeOf(v, { privateField: "synthetic" }); },
    (v) => { Object.defineProperty(v, Object.keys(v)[0], { get() { touched++; throw null; } }); },
  ]) { const value = sourceInput(); mutate(locate(value)); projectionRejected(value, "C1J-SHAPE"); }
  for (const thrown of [null, "C1J-PRIVACY", Object.defineProperty({}, "message", { get() { touched++; return "private"; } })])
    projectionRejected(new Proxy({}, { getPrototypeOf() { throw thrown; } }), "C1J-SHAPE");
  const value = sourceInput(); Object.setPrototypeOf(value, null); Object.setPrototypeOf(value.coverage, null); Object.setPrototypeOf(value.currentCandidate, null);
  projected(value); assert.equal(touched, 0);
  for (const candidate of [{ commit: "A".repeat(40), tree: "b".repeat(40) }, { commit: A, tree: "b".repeat(40) }, { commit: "abc", tree: "abc" }])
    projectionRejected({ ...sourceInput(null, null), currentCandidate: candidate }, "C1J-SHAPE");
  projected({ ...sourceInput(null, null), currentCandidate: { commit: A, tree: B } });
});
test("source projection rejects duplicate keys, trailing JSON, BOM and malformed Unicode at every byte boundary", () => {
  const documents = ['{"request":{},"request":{}}', '{"request":{"nested":{"x":1,"x":2}}}',
    '{"request":{"__proto__":1,"__proto__":2}}', '{"request":{"x":1,"\\u0078":2}}',
    '{} null', '\ufeff{}', '{"x":1e999}', '{"x":"\\ud800"}', '{"x":"\\udfff"}',
    '{"\\ud800":0}', '{"x":"\ud800"}', '{"x":"\udfff"}', '{"x":"\\uZZZZ"}', '{"x":NaN}' ];
  for (const document of documents) for (const field of ["invocationBytes", "reviewBytes"])
    projectionRejected({ ...sourceInput(), [field]: document }, "C1J-JSON");
  for (const bytes of [Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), Buffer.from([0xc0, 0xaf]),
    Buffer.from([0xed, 0xa0, 0x80]), Buffer.from([0xf0, 0x9f]), Buffer.from([0xff])])
    projectionRejected({ ...sourceInput(), invocationBytes: bytes }, "C1J-JSON");
  // A scalar surrogate pair remains valid in private command data.
  projected(sourceInput(invocationSource({ commandText: "fixture-😀" }), null));
});
test("source projection enforces full-source depth64 independently of receipt depth16 and quoted brackets", () => {
  for (const depth of [16, 17, 64])
    projectionRejected({ ...sourceInput(null, null), invocationBytes: "[".repeat(depth) + "0" + "]".repeat(depth) }, "C1J-INVOCATION");
  for (const field of ["invocationBytes", "reviewBytes"])
    projectionRejected({ ...sourceInput(), [field]: "[".repeat(65) + "0" + "]".repeat(65) }, "C1J-LIMIT");
  projected(sourceInput(invocationSource({ commandText: '[{"escaped":"\\\""}]'.repeat(10) }), null));
});
test("source projection enforces exact UTF8 byte and owning history cardinality bounds", () => {
  const value = sourceInput(invocationSource({ count: 0 }), null);
  value.invocationBytes += " ".repeat(1_048_576 - Buffer.byteLength(value.invocationBytes));
  projected(value);
  for (const bytes of [value.invocationBytes + " ", Buffer.alloc(1_048_577), "é".repeat(524289)])
    projectionRejected({ ...value, invocationBytes: bytes }, "C1J-LIMIT");
  const full = invocationSource({ count: 256 });
  assert.equal(projected(sourceInput(full, null)).joins.invocations.length, 256);
  full.attempts.push(full.attempts[0]); projectionRejected(sourceInput(full, null), "C1J-INVOCATION");
  const review = reviewSource("only-review", 1);
  projectionRejected(sourceInput(null, Array(REVIEW_LIMITS.criticRounds + 2).fill(review[0])), "C1J-REVIEW");
});
test("source projection hashes exact original bytes while semantic rows remain deterministic and detached", () => {
  const value = sourceInput(), before = clone(value), first = projected(value), next = projected(value);
  const whitespace = projected({ ...value, invocationBytes: " \n" + value.invocationBytes + "\t", reviewBytes: "\n" + value.reviewBytes });
  assert.deepEqual(first.joins, whitespace.joins); assert.notDeepEqual(first.sourceSha256, whitespace.sourceSha256);
  assert.equal(whitespace.sourceSha256.invocation, rawSourceHash(" \n" + value.invocationBytes + "\t"));
  const reordered = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(value.invocationBytes)).reverse()));
  assert.deepEqual(projected({ ...value, invocationBytes: reordered }).joins, first.joins);
  first.joins.invocations[0].attemptId = "changed"; first.coverage.reviews = "unknown"; first.binding.candidate.commit = A;
  assert.deepEqual(projected(value), next); assert.deepEqual(value, before);
  const bytes = Buffer.from(value.invocationBytes), retained = projected({ ...value, invocationBytes: bytes });
  bytes.fill(0); assert.deepEqual(retained, next);
});
test("source projection screens exposed IDs without leaking or rejecting omitted private fields", () => {
  for (const unsafe of ["sk-syntheticFixture", "ghp_syntheticFixture", "prefix:github_pat_synthetic", "AKIA" + "0".repeat(16)]) {
    projectionRejected(sourceInput(invocationSource({ invocationId: unsafe }), null), "C1J-PRIVACY");
    projectionRejected(sourceInput(invocationSource({ attemptIds: [unsafe, "safe-attempt"] }), null), "C1J-PRIVACY");
    projectionRejected(sourceInput(null, reviewSource(unsafe, 1)), "C1J-PRIVACY");
  }
  projected(sourceInput(invocationSource({ commandText: "sk-privateSyntheticCommand" }), null));
});
test("source projection composes existing joins into an explicitly synthetic C1 receipt", () => {
  const projection = projected(), value = input();
  value.joins.invocations = projection.joins.invocations; value.joins.reviews = projection.joins.reviews;
  value.binding.candidate = projection.binding.candidate;
  const result = receipt(value); assert.equal(result.attemptCount.value, 2);
  assert.deepEqual(result.joins.invocations, projection.joins.invocations);
  assert.deepEqual(result.joins.reviews, projection.joins.reviews);
});
test("source adapter and its entire fresh import graph evaluate and run under ambient I/O tripwires", () => {
  // Preload source text, then evaluate a fresh VM graph with no ambient facilities.
  // Builtin module namespaces are prepared before installing the tripwires.
  const script = `
    import fs from "node:fs"; import vm from "node:vm"; import childProcess from "node:child_process";
    import net from "node:net"; import { syncBuiltinESMExports } from "node:module";
    const modules = new Map(), builtins = new Map();
    function preload(url) {
      if (modules.has(url)) return;
      const source = fs.readFileSync(new URL(url), "utf8");
      const mod = new vm.SourceTextModule(source, { identifier: url }); modules.set(url, mod);
      for (const match of source.matchAll(/from\\s+["']([^"']+)["']/gu)) {
        if (match[1].startsWith(".")) preload(new URL(match[1], url).href);
        else builtins.set(match[1], null);
      }
    }
    const root = process.argv[1]; preload(root);
    for (const name of builtins.keys()) {
      const namespace = await import(name), keys = Object.keys(namespace);
      builtins.set(name, new vm.SyntheticModule(keys, function() { for (const key of keys) this.setExport(key, namespace[key]); }));
    }
    const entry = modules.get(root);
    await entry.link((name, mod) => builtins.get(name) ?? modules.get(new URL(name, mod.identifier).href));
    const fixture = JSON.parse(process.argv[2]);
    let touched = 0; const denied = () => { touched++; throw new Error("ambient access"); };
    const OriginalDate = Date, environment = process.env, originalCwd = process.cwd, originalHrtime = process.hrtime;
    const restore = [];
    try {
      for (const object of [fs, fs.promises, childProcess, net]) {
        for (const key of Object.keys(object)) if (typeof object[key] === "function") {
          const descriptor = Object.getOwnPropertyDescriptor(object, key);
          restore.push([object, key, descriptor]);
          Object.defineProperty(object, key, { value: denied, configurable: descriptor.configurable, enumerable: descriptor.enumerable, writable: true });
        }
      }
      globalThis.fetch = denied; process.cwd = denied; process.hrtime = denied;
      process.env = new Proxy({}, { get: denied, ownKeys: denied, getOwnPropertyDescriptor: denied });
      globalThis.Date = class extends OriginalDate { constructor(...args) { if (!args.length) denied(); super(...args); } static now() { return denied(); } };
      syncBuiltinESMExports();
      await entry.evaluate();
      const result = entry.namespace.projectC1SourceJoins(fixture);
      if (!result.ok || touched !== 0) throw new Error("pure projection failed");
      if (Object.keys(entry.namespace).join(",") !== "projectC1SourceJoins") throw new Error("unexpected public API");
    } finally {
      process.env = environment; process.cwd = originalCwd; process.hrtime = originalHrtime; globalThis.Date = OriginalDate;
      for (const [object, key, descriptor] of restore) Object.defineProperty(object, key, descriptor);
      syncBuiltinESMExports();
    }
  `;
  const result = childProcess.spawnSync(process.execPath, ["--no-warnings", "--experimental-vm-modules", "--input-type=module", "-e", script,
    new URL("./interruption-source-adapter.mjs", import.meta.url).href, JSON.stringify(sourceInput())], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, "");
});
