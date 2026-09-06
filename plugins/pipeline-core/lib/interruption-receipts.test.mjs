// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildInterruptionReceipt as build, classifyInterruption as classify, validateInterruptionReceipt as validate, validateInterruptionRegistry } from "./interruption-receipts.mjs";
import { canonicalInvocationJson, createInvocationRequest, createInvocationAttempt, invocationResolutionKey, validateInvocationChain } from "./invocation-reliability.mjs";

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
