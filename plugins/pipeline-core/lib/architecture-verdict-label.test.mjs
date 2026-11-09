// SPDX-License-Identifier: SUL-1.0
// CGF-08 / CGF-23 (AC-108): every architecture verdict names its candidate, observation date, scope, whether it blocks or only
// reports, and whether it is current or superseded; open report-only classes are listed beside it. Pure: no repository fixture.
import assert from "node:assert/strict";
import test from "node:test";

import * as labels from "./architecture-verdict-label.mjs";

const COMMIT = "a".repeat(40), TREE = "b".repeat(40);
const base = { source: "fixture", verdict: "pass", candidate: COMMIT, observedAt: "2026-11-09T10:00:00.000Z", scope: "the fixture scope", effect: "blocking", currency: "current" };

test("AVL01 a label carries every field, defaults to no open report-only class, and is frozen", () => {
  const label = labels.architectureVerdictLabel(base);
  assert.deepEqual(label, { schema: labels.ARCHITECTURE_VERDICT_LABEL_SCHEMA, ...base, reportOnlyOpen: [] });
  assert.equal(Object.isFrozen(label), true);
  assert.equal(labels.ARCHITECTURE_VERDICT_LABEL_SCHEMA, "pipeline.architecture-verdict-label.v1");
});

test("AVL02 a label refuses an unknown effect or currency, a malformed candidate or date, and an empty scope; a missing candidate or date is typed null, never guessed", () => {
  for (const bad of [{ effect: "advisory" }, { currency: "fresh" }, { candidate: "abc" }, { observedAt: "yesterday" }, { scope: "" }, { source: "" }, { verdict: 3 }, { reportOnlyOpen: [{ classId: 1, open: -1, detail: "x" }] }]) {
    assert.throws(() => labels.architectureVerdictLabel({ ...base, ...bad }), /AVL-INVALID/u, JSON.stringify(bad));
  }
  const unobserved = labels.architectureVerdictLabel({ ...base, candidate: null, observedAt: null, currency: "unobserved" });
  assert.equal(unobserved.candidate, null);
  assert.equal(unobserved.observedAt, null);
});

test("AVL03 the one-line text names candidate, date, scope, effect, currency and the open report-only classes", () => {
  const text = labels.describeVerdictLabel(labels.architectureVerdictLabel({ ...base, reportOnlyOpen: [{ classId: "size-budget", open: 2, detail: "2 over-budget entries" }] }));
  for (const part of ["pass", "blocking", "current", "a".repeat(12), "2026-11-09T10:00:00.000Z", "the fixture scope", "open report-only: size-budget (2)"]) assert.ok(text.includes(part), `${part} in ${text}`);
  const none = labels.describeVerdictLabel(labels.architectureVerdictLabel({ ...base, candidate: null, observedAt: null, currency: "unobserved" }));
  assert.ok(none.includes("candidate unobserved") && none.includes("observed unobserved") && none.includes("no open report-only class"), none);
});

test("AVL04 a close fitness disposition is report-only: open classes are listed, a drifted source is superseded, missing evidence is unobserved", () => {
  const row = (classId, propertyId, observedOutcome) => ({ classId, propertyId, observedOutcome, disposition: "open", reason: "r" });
  const disposition = (status, dispositions, candidate = { commit: COMMIT, tree: TREE }) => ({ schema: "pipeline.close-architecture-fitness.v1", status, rigorObservationSha256: "c".repeat(64), fitnessProjectionSha256: "d".repeat(64), candidate, dispositions });
  const open = labels.closeFitnessVerdictLabel(disposition("observed-open", [row(7, "p7", "finding")]), { observedAt: "2026-11-09T10:00:00.000Z" });
  assert.deepEqual([open.effect, open.currency, open.candidate, open.verdict], ["report-only", "current", COMMIT, "observed-open"]);
  assert.deepEqual(open.reportOnlyOpen, [{ classId: 7, open: 1, detail: "p7: finding" }]);
  const pass = labels.closeFitnessVerdictLabel(disposition("observed-pass", []), { observedAt: "2026-11-09T10:00:00.000Z" });
  assert.deepEqual([pass.currency, pass.reportOnlyOpen], ["current", []]);
  const drift = labels.closeFitnessVerdictLabel(disposition("source-drift", [row(1, "p1", "pass")]), { observedAt: "2026-11-09T10:00:00.000Z" });
  assert.equal(drift.currency, "superseded");
  assert.equal(drift.reportOnlyOpen.length, 1);
  const missing = labels.closeFitnessVerdictLabel(disposition("unavailable", [row(1, "p1", "unavailable")], null));
  assert.deepEqual([missing.currency, missing.candidate, missing.observedAt], ["unobserved", null, null]);
});

test("AVL05 a recorded pre-close observation is labelled from its own candidate, date and outcomes; its source currency is not re-checked, so it says unobserved", () => {
  const body = { observedAt: "2026-11-09T09:00:00.000Z", candidate: { commit: COMMIT, tree: TREE }, fitnessProjection: { outcomes: [{ classId: 2, propertyId: "p2", outcome: "pass" }, { classId: 3, propertyId: "p3", outcome: "finding" }, { classId: 4, propertyId: "p4", outcome: "unavailable" }] } };
  const label = labels.fitnessObservationVerdictLabel(body);
  assert.deepEqual([label.effect, label.currency, label.candidate, label.observedAt], ["report-only", "unobserved", COMMIT, "2026-11-09T09:00:00.000Z"]);
  assert.deepEqual(label.reportOnlyOpen.map((entry) => entry.classId), [3, 4]);
  const bare = labels.fitnessObservationVerdictLabel({ fitnessProjection: {} });
  assert.deepEqual([bare.candidate, bare.observedAt, bare.reportOnlyOpen], [null, null, []]);
});

// CGF-08 (AC-108, PO decision): ONE current projection. The blocking check alone decides the gate verdict; the stored fitness observation
// stays beside it, labelled report-only and open with its observation date, and neither hides a PASS nor changes the gate.
const blocking = (verdict, extra = {}) => labels.architectureVerdictLabel({ ...base, source: "architecture-boundary-check", verdict, effect: "blocking", ...extra });
const fitness = (verdict, open = []) => labels.architectureVerdictLabel({ source: "recorded-fitness-observation", verdict, candidate: COMMIT, observedAt: "2026-11-08T08:00:00.000Z",
  scope: "fitness property classes, latest recorded observation of the feature", effect: "report-only", currency: "unobserved", reportOnlyOpen: open });
const OPEN = [{ classId: 3, open: 1, detail: "p3: finding" }];

test("AVL06 the blocking check alone decides the gate: a PASS stays a PASS beside an open report-only fitness observation, which stays visible with its date", () => {
  const projection = labels.currentArchitectureProjection({ boundaryVerdict: blocking("pass"), fitnessLabel: fitness("observed-open", OPEN) });
  assert.equal(projection.schema, labels.ARCHITECTURE_PROJECTION_SCHEMA);
  assert.equal(projection.schema, "pipeline.architecture-projection.v1");
  assert.deepEqual([projection.gate.verdict, projection.gate.effect, projection.gate.candidate, projection.gate.observedAt], ["pass", "blocking", COMMIT, "2026-11-09T10:00:00.000Z"]);
  assert.deepEqual([projection.reportOnly.verdict, projection.reportOnly.effect, projection.reportOnly.observedAt], ["observed-open", "report-only", "2026-11-08T08:00:00.000Z"]);
  assert.deepEqual(projection.reportOnly.reportOnlyOpen, OPEN);
  assert.ok(projection.summary.some((line) => line.includes("observed-open") && line.includes("2026-11-08T08:00:00.000Z") && line.includes("report-only")), projection.summary.join("\n"));
  assert.ok(projection.summary.some((line) => line.includes("pass") && line.includes("blocking")), projection.summary.join("\n"));
  assert.equal(Object.isFrozen(projection), true);
});

test("AVL07 the report-only observation neither upgrades nor downgrades the gate, whichever way it reads", () => {
  for (const fitnessLabel of [null, fitness("observed-pass"), fitness("observed-open", OPEN), fitness("no-outcomes-recorded")]) {
    const pass = labels.currentArchitectureProjection({ boundaryVerdict: blocking("pass"), fitnessLabel });
    const findings = labels.currentArchitectureProjection({ boundaryVerdict: blocking("findings"), fitnessLabel });
    assert.equal(pass.gate.verdict, "pass", `${fitnessLabel?.verdict}`);
    assert.equal(findings.gate.verdict, "findings", `${fitnessLabel?.verdict}`);
    assert.deepEqual(pass.gate, labels.currentArchitectureProjection({ boundaryVerdict: blocking("pass") }).gate);
  }
});

test("AVL08 with no blocking result the projection says so, typed, and claims nothing; the fitness observation is still shown", () => {
  const none = labels.currentArchitectureProjection({ fitnessLabel: fitness("observed-open", OPEN) });
  assert.deepEqual([none.gate.verdict, none.gate.effect, none.gate.currency, none.gate.candidate, none.gate.observedAt], ["no-blocking-result", "blocking", "unobserved", null, null]);
  assert.equal(none.reportOnly.verdict, "observed-open");
  const nothing = labels.currentArchitectureProjection();
  assert.equal(nothing.gate.verdict, "no-blocking-result");
  assert.equal(nothing.reportOnly, null);
  assert.deepEqual(labels.currentArchitectureProjection({ boundaryVerdict: null, fitnessLabel: null }), nothing);
});

test("AVL09 the boundary verdict must be blocking and the fitness label report-only; a swapped or malformed label is refused, never reinterpreted", () => {
  assert.throws(() => labels.currentArchitectureProjection({ boundaryVerdict: fitness("observed-pass") }), /AVL-INVALID: boundaryVerdict/u);
  assert.throws(() => labels.currentArchitectureProjection({ fitnessLabel: blocking("pass") }), /AVL-INVALID: fitnessLabel/u);
  assert.throws(() => labels.currentArchitectureProjection({ boundaryVerdict: { verdict: "pass", effect: "blocking" } }), /AVL-INVALID/u);
  // the open report-only classes the blocking check itself lists (size budgets) stay visible beside the PASS
  const sized = labels.currentArchitectureProjection({ boundaryVerdict: blocking("pass", { reportOnlyOpen: [{ classId: "size-budget", open: 2, detail: "2 over-budget entries, advisory" }] }) });
  assert.equal(sized.gate.verdict, "pass");
  assert.deepEqual(sized.gate.reportOnlyOpen.map((entry) => entry.classId), ["size-budget"]);
});
