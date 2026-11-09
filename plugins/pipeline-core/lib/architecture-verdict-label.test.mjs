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
