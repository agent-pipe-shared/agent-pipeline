// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildRunnerNativeContinuationRequest, computeRunnerNativeContinuationDigest, materializeRunnerNativeContinuation, materializeRunnerNativeTerminal, planNativeGoalTransition, projectRunnerNativeProgress, recordRunnerNativeAdditiveInput, validateRunnerNativeContinuation } from "./runner-native-continuation.mjs";

const D = "a".repeat(64);
function record(overrides = {}) {
  const value = {
    schema: "pipeline.runner-native-continuation.v1", continuationId: "nova-b0", subject: { featureId: "nova", phase: "implementation", planSha256: D, specSha256: D, queueRevision: 3, packageId: "b0", actionId: "implement" }, objective: { conditionSha256: D, summarySha256: D }, acceptance: [{ criterionId: "goal-readback", status: "pending", evidenceSha256: null }], evidence: [], terminal: { kind: "none", atRevision: 3 }, runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" }, generation: { number: 1, goalSha256: D }, status: "active", progress: [{ kind: "tests", status: "unknown", evidenceSha256: null }], readback: { goalIdSha256: D, generation: 1, observedAt: "2026-07-25T00:00:00.000Z", status: "active" }, reason: { code: "active", evidenceSha256: null }, ...overrides,
  };
  if (value.status !== "active" && value.reason.code === "active") value.reason = { code: "terminal", evidenceSha256: D };
  value.recordSha256 = computeRunnerNativeContinuationDigest(value);
  return value;
}

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

check("active record requires a native active readback", () => assert.equal(validateRunnerNativeContinuation(record()).ok, true));
check("active pipeline continuity derives a sanitised request from canonical PRD authority and only readback materialises active", () => {
  const request = buildRunnerNativeContinuationRequest({ continuationId: "nova-b0", activeFeature: { id: "nova", phase: "implementation" }, continuity: { featureId: "nova", revision: 3, blocker: null, queueHead: { packageId: "b0", actionId: "implement" }, authority: { prd: { sha256: D }, spec: { sha256: D } } }, runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" }, acceptance: [], evidence: [], progress: [] });
  const materialized = materializeRunnerNativeContinuation({ request, generation: 1, adapterResult: { ok: true, code: "CGH-ACTIVE", status: "active", readback: { goalIdSha256: D, generation: 1, observedAt: "2026-07-25T00:00:00.000Z", status: "active" } }, observedAt: "2026-07-25T00:00:00.000Z" });
  assert.equal(materialized.ok, true); assert.equal(materialized.continuation.status, "active");
  assert.equal(materialized.continuation.subject.planSha256, D);
  assert.equal(validateRunnerNativeContinuation(materialized.continuation).ok, true);
});
check("a native blocked readback remains a typed blocker and retains its resume evidence", () => {
  const request = buildRunnerNativeContinuationRequest({ continuationId: "nova-b0", activeFeature: { id: "nova", phase: "implementation" }, continuity: { featureId: "nova", revision: 3, blocker: null, queueHead: { packageId: "b0", actionId: "implement" }, authority: { prd: { sha256: D }, plan: { sha256: D }, spec: { sha256: D } } }, runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" } });
  const adapterResult = { ok: false, code: "CGH-BLOCKED-RESUME-REQUIRED", status: "blocked", readback: { goalIdSha256: D, generation: 1, observedAt: "2026-07-25T00:00:00.000Z", status: "blocked" } };
  const materialized = materializeRunnerNativeContinuation({ request, generation: 1, adapterResult, observedAt: adapterResult.readback.observedAt });
  assert.equal(materialized.ok, true);
  assert.equal(materialized.continuation.status, "blocked");
  assert.equal(materialized.continuation.terminal.kind, "typed-blocker");
  assert.deepEqual(materialized.continuation.readback, adapterResult.readback);
  assert.equal(validateRunnerNativeContinuation(materialized.continuation).ok, true);
});
check("stale or malformed adapter generations become typed unavailable rather than fresh active evidence", () => {
  const request = buildRunnerNativeContinuationRequest({ continuationId: "nova-b0", activeFeature: { id: "nova", phase: "implementation" }, continuity: { featureId: "nova", revision: 3, blocker: null, queueHead: { packageId: "b0", actionId: "implement" }, authority: { prd: { sha256: D }, plan: { sha256: D }, spec: { sha256: D } } }, runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" } });
  for (const readback of [{ goalIdSha256: D, generation: 0, observedAt: "2026-07-25T00:00:00.000Z", status: "active" }, { goalIdSha256: D, generation: 1, observedAt: "2026-07-25T00:00:00.000Z", status: "paused" }]) {
    const materialized = materializeRunnerNativeContinuation({ request, generation: 1, adapterResult: { ok: true, code: "CGH-ACTIVE", status: "active", readback }, observedAt: "2026-07-25T00:00:00.000Z" });
    assert.equal(materialized.ok, true); assert.equal(materialized.continuation.status, "unavailable");
  }
});
check("adapter readback timestamp is exact and is never replaced by caller input", () => {
  const request = buildRunnerNativeContinuationRequest({ continuationId: "nova-b0", activeFeature: { id: "nova", phase: "implementation" }, continuity: { featureId: "nova", revision: 3, blocker: null, queueHead: { packageId: "b0", actionId: "implement" }, authority: { prd: { sha256: D }, plan: { sha256: D }, spec: { sha256: D } } }, runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" } });
  const adapterResult = { ok: true, code: "CGH-ACTIVE", status: "active", readback: { goalIdSha256: D, generation: 1, observedAt: "2026-07-25T00:00:00.000Z", status: "active" } };
  const exact = materializeRunnerNativeContinuation({ request, generation: 1, adapterResult, observedAt: adapterResult.readback.observedAt });
  assert.equal(exact.continuation.readback.observedAt, adapterResult.readback.observedAt);
  assert.equal(materializeRunnerNativeContinuation({ request, generation: 1, adapterResult, observedAt: "2026-07-25T00:00:01.000Z" }).continuation.status, "unavailable");
});
check("evidence paths reject empty and dot segments", () => {
  for (const path of ["a//b", "./a", "a/.", "../a", "a/.."] ) {
    const value = record({ evidence: [{ kind: "gate", path, fileSha256: D, recordSha256: null }] }); value.recordSha256 = computeRunnerNativeContinuationDigest(value);
    assert.equal(validateRunnerNativeContinuation(value).code, "RNC-SCHEMA");
  }
});
check("missing native readback records typed unavailable rather than active", () => {
  const request = buildRunnerNativeContinuationRequest({ continuationId: "nova-b0", activeFeature: { id: "nova", phase: "implementation" }, continuity: { featureId: "nova", revision: 3, blocker: null, queueHead: { packageId: "b0", actionId: "implement" }, authority: { prd: { sha256: D }, plan: { sha256: D }, spec: { sha256: D } } }, runner: { runnerId: "claude", adapterVersion: "v1", capability: "available" } });
  const materialized = materializeRunnerNativeContinuation({ request, generation: 1, adapterResult: { ok: false, code: "CLG-CAPABILITY", status: "unavailable", readback: null }, observedAt: "2026-07-25T00:00:00.000Z" });
  assert.equal(materialized.continuation.status, "unavailable"); assert.equal(materialized.continuation.runner.capability, "unavailable");
});
check("cross-runner fixture covers every required B0 terminal and re-entry case", () => {
  const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/fixtures/runner-native-continuation/conformance.json", import.meta.url)), "utf8"));
  assert.equal(fixture.schema, "pipeline.runner-native-continuation-fixture.v1");
  assert.deepEqual(new Set(fixture.cases.map(({ id }) => id)), new Set(["premature-turn-completion", "intermediate-question", "po-gate-wait", "po-gate-resolution", "typed-blocker", "explicit-pause-cancel-replace-redirect", "compact-resume", "read-only-progress", "successful-completion", "unsupported-capability"]));
  for (const entry of fixture.cases) assert.deepEqual(entry.runners, ["codex", "claude"]);
});
check("cross-runner conformance fixture executes each bounded lifecycle disposition", () => {
  const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/fixtures/runner-native-continuation/conformance.json", import.meta.url)), "utf8"));
  const terminalEvents = new Set(["po-gate", "typed-blocker", "explicit-control", "verified-completion", "capability-unavailable"]);
  for (const entry of fixture.cases) for (const runnerId of entry.runners) {
    const paused = entry.initialStatus === "paused-po-gate";
    const source = record({
      runner: { runnerId, adapterVersion: "v1", capability: "available" },
      ...(paused ? { status: "paused-po-gate", terminal: { kind: "named-po-gate", atRevision: 4 }, readback: { goalIdSha256: null, generation: 1, status: "cleared" } } : {}),
      ...(entry.event === "verified-completion" ? { acceptance: [{ criterionId: "goal-readback", status: "passed", evidenceSha256: D }] } : {}),
    });
    if (entry.event === "additive-question") {
      const added = recordRunnerNativeAdditiveInput({ continuation: source, input: { kind: "question", evidenceSha256: D } });
      assert.equal(added.ok, true, `${runnerId}:${entry.id}`); assert.equal(added.continuation.status, "active", `${runnerId}:${entry.id}`);
    } else if (entry.event === "project-progress") {
      const projected = projectRunnerNativeProgress({ continuity: { queueHead: { dispatch: null } }, acceptance: source.acceptance, evidence: source.evidence });
      assert.equal(projected.ok, true, `${runnerId}:${entry.id}`); assert.equal(projected.progress.some(({ kind }) => kind === "diff"), false, `${runnerId}:${entry.id}`);
    } else {
      const event = { kind: entry.event, atRevision: paused ? 5 : 4, ...(terminalEvents.has(entry.event) ? { evidenceSha256: D } : {}) };
      assert.equal(planNativeGoalTransition({ continuation: source, event }).action, entry.expectedAction, `${runnerId}:${entry.id}`);
    }
  }
});
check("raw prompt-like fields are rejected by the closed record", () => {
  const value = record(); value.prompt = "continue"; value.recordSha256 = computeRunnerNativeContinuationDigest(value);
  assert.equal(validateRunnerNativeContinuation(value).code, "RNC-SCHEMA");
});
check("intermediate input is durably additive and never a terminal event", () => {
  const added = recordRunnerNativeAdditiveInput({ continuation: record(), input: { kind: "question", evidenceSha256: D } });
  assert.equal(added.ok, true); assert.equal(added.continuation.status, "active"); assert.equal(added.continuation.progress.at(-1).kind, "input-question");
  assert.equal(planNativeGoalTransition({ continuation: added.continuation, event: { kind: "question", atRevision: 3 } }).code, "RNC-EVENT");
});
check("progress is projected from state and evidence without a diff requirement", () => {
  const progress = projectRunnerNativeProgress({
    continuity: { queueHead: { dispatch: null } }, acceptance: [],
    evidence: [{ kind: "test", path: "evidence/verify.json", fileSha256: D, recordSha256: null }],
  });
  assert.equal(progress.ok, true); assert.equal(progress.progress.find(({ kind }) => kind === "tests").status, "known");
  assert.equal(progress.progress.find(({ kind }) => kind === "dispatch").status, "unknown");
  assert.equal(progress.progress.some(({ kind }) => kind === "diff"), false);
});
check("resume creates a fresh generation", () => {
  const paused = record({ status: "paused-po-gate", terminal: { kind: "named-po-gate", atRevision: 4 }, readback: { goalIdSha256: null, generation: 1, status: "cleared" } });
  paused.recordSha256 = computeRunnerNativeContinuationDigest(paused);
  assert.deepEqual(planNativeGoalTransition({ continuation: paused, event: { kind: "po-gate-resolved", atRevision: 5 } }), { ok: true, code: "RNC-SET", action: "set", state: "active", terminal: "none", reasonCode: "po-gate-resolved", generation: 2 });
});
check("active resume and compact retain one native goal generation", () => {
  const active = record();
  for (const kind of ["resume", "compact-reentry"]) {
    assert.deepEqual(planNativeGoalTransition({ continuation: active, event: { kind, atRevision: 4 } }), { ok: true, code: "RNC-NOOP", action: "none", state: "active", terminal: "none", reasonCode: "active-goal-retained", generation: 1 });
  }
});
check("PO resolution must strictly follow the recorded named gate", () => {
  const paused = record({ status: "paused-po-gate", terminal: { kind: "named-po-gate", atRevision: 4 }, readback: { goalIdSha256: null, generation: 1, status: "cleared" } }); paused.recordSha256 = computeRunnerNativeContinuationDigest(paused);
  for (const atRevision of [3, 4]) assert.equal(planNativeGoalTransition({ continuation: paused, event: { kind: "po-gate-resolved", atRevision } }).action, "none");
  assert.equal(planNativeGoalTransition({ continuation: paused, event: { kind: "po-gate-resolved", atRevision: 5 } }).action, "set");
});
check("a PO gate from an earlier work revision is not a valid continuation record", () => {
  const stale = record({ subject: { featureId: "nova", phase: "implementation", planSha256: D, specSha256: D, queueRevision: 4, packageId: "b0", actionId: "implement" }, status: "paused-po-gate", terminal: { kind: "named-po-gate", atRevision: 3 }, readback: null }); stale.recordSha256 = computeRunnerNativeContinuationDigest(stale);
  assert.equal(validateRunnerNativeContinuation(stale).code, "RNC-SCHEMA");
  assert.equal(planNativeGoalTransition({ continuation: stale, event: { kind: "po-gate-resolved", atRevision: 4 } }).action, "none");
});
check("only an active item or a resolved PO gate may establish a successor goal", () => {
  for (const [status, terminal] of [["achieved", "verified-completion"], ["blocked", "typed-blocker"], ["cleared", "explicit-control-change"]]) {
    const terminalRecord = record({ status, terminal: { kind: terminal, atRevision: 4 }, readback: { goalIdSha256: null, generation: 1, status: "cleared" } });
    terminalRecord.recordSha256 = computeRunnerNativeContinuationDigest(terminalRecord);
    for (const kind of ["resume", "compact-reentry", "po-gate-resolved"]) assert.equal(planNativeGoalTransition({ continuation: terminalRecord, event: { kind, atRevision: 5 } }).action, "none");
  }
  const paused = record({ status: "paused-po-gate", terminal: { kind: "named-po-gate", atRevision: 4 }, readback: { goalIdSha256: null, generation: 1, status: "cleared" } }); paused.recordSha256 = computeRunnerNativeContinuationDigest(paused);
  assert.equal(planNativeGoalTransition({ continuation: paused, event: { kind: "resume", atRevision: 5 } }).action, "none");
  assert.equal(planNativeGoalTransition({ continuation: paused, event: { kind: "po-gate-resolved", atRevision: 5 } }).action, "set");
});
check("schema closes the typed observation arrays and readback object", () => {
  const schema = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/runner-native-continuation.schema.json", import.meta.url)), "utf8"));
  for (const field of ["acceptance", "evidence", "progress"]) {
    const ref = schema.properties[field].items.$ref; const definition = schema.$defs[ref.slice("#/$defs/".length)];
    assert.equal(definition.additionalProperties, false); assert.ok(Array.isArray(definition.required));
  }
  const readbackDefinition = schema.$defs[schema.properties.readback.anyOf[1].$ref.slice("#/$defs/".length)];
  const readback = schema.$defs[readbackDefinition.oneOf[1].$ref.slice("#/$defs/".length)];
  assert.equal(readback.additionalProperties, false);
  const active = schema.allOf.find((entry) => entry.if?.properties?.status?.const === "active");
  assert.equal(active.then.properties.readback.allOf[1].properties.status.const, "active");
  const achieved = schema.allOf.find((entry) => entry.if?.properties?.status?.const === "achieved");
  assert.equal(achieved.then.properties.reason.properties.evidenceSha256.$ref, "#/$defs/digest");
  assert.equal(achieved.then.properties.acceptance.items.allOf[1].properties.status.const, "passed");
});
check("schema and runtime both reject an active record with a cleared readback", () => {
  const value = record({ readback: { goalIdSha256: D, generation: 1, observedAt: "2026-07-25T00:00:00.000Z", status: "cleared" } });
  value.recordSha256 = computeRunnerNativeContinuationDigest(value);
  assert.equal(validateRunnerNativeContinuation(value).ok, false);
  const schema = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/runner-native-continuation.schema.json", import.meta.url)), "utf8"));
  const active = schema.allOf.find((entry) => entry.if?.properties?.status?.const === "active");
  assert.equal(active.then.properties.readback.allOf[1].properties.status.const, "active");
});
for (const [event, state, terminal] of [["po-gate", "paused-po-gate", "named-po-gate"], ["typed-blocker", "blocked", "typed-blocker"], ["verified-completion", "achieved", "verified-completion"], ["explicit-control", "cleared", "explicit-control-change"]]) {
  check(`${event} clears rather than continues`, () => {
    const source = event === "verified-completion" ? record({ acceptance: [{ criterionId: "goal-readback", status: "passed", evidenceSha256: D }] }) : record();
    const result = planNativeGoalTransition({ continuation: source, event: { kind: event, atRevision: 4, evidenceSha256: D } });
    assert.deepEqual(result, { ok: true, code: "RNC-CLEAR", action: "clear", state, terminal, reasonCode: event, generation: 1 });
  });
}
check("terminal clear is evidence-bound and failed clear is typed unavailable", () => {
  const source = record({ acceptance: [{ criterionId: "goal-readback", status: "passed", evidenceSha256: D }] });
  const transition = planNativeGoalTransition({ continuation: source, event: { kind: "verified-completion", atRevision: 4, evidenceSha256: D } });
  const achieved = materializeRunnerNativeTerminal({ continuation: source, transition, event: { kind: "verified-completion", atRevision: 4, evidenceSha256: D }, adapterResult: { ok: true, status: "cleared", readback: { goalIdSha256: null, generation: 1, status: "cleared" } } });
  assert.equal(achieved.ok, true); assert.equal(achieved.continuation.status, "achieved");
  assert.equal(achieved.continuation.reason.evidenceSha256, D);
  const unavailable = materializeRunnerNativeTerminal({ continuation: source, transition, event: { kind: "verified-completion", atRevision: 4, evidenceSha256: D }, adapterResult: { ok: false, code: "CGH-TRANSPORT", status: "unavailable", readback: null } });
  assert.equal(unavailable.ok, true); assert.equal(unavailable.continuation.status, "unavailable");
});
process.stdout.write(`1..${passed}\n`);
