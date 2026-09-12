// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalSha256 } from "./governance-event.mjs";
import {
  buildGovernanceActionEvent,
  deriveGovernanceActionEventId,
  deriveGovernanceActionId,
  GOVERNANCE_ACTION_EVENT_ID_DOMAIN,
  GOVERNANCE_ACTION_EVENT_SCHEMA,
  GOVERNANCE_ACTION_ID_DOMAIN,
  GOVERNANCE_ACTION_MATRIX,
  GovernanceActionEventError,
  validateGovernanceActionEvent,
} from "./governance-action-events.mjs";
import {
  GOVERNANCE_HGO_CONSUMPTION_RETRY_SCHEMA,
  GovernanceHgoConsumptionActionError,
  buildGovernanceHgoConsumptionAction,
  buildGovernanceHgoConsumptionRetry,
  retryGovernanceHgoConsumptionAction,
  validateGovernanceHgoConsumptionRetry,
  writeGovernanceHgoConsumptionAction,
} from "./governance-hgo-consumption-action.mjs";
import {
  HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA,
  buildGovernanceHgoConsumptionSource,
  validateGovernanceHgoConsumptionSource,
} from "./governance-hgo-consumption-source.mjs";

const schema = JSON.parse(readFileSync(new URL("../../../governance/schemas/governance-action-event.schema.json", import.meta.url), "utf8"));
const candidate = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const notApplicable = () => ({ state: "not-applicable" });
const base = (overrides = {}) => ({
  kind: "verification",
  status: "completed",
  reasonCode: "VERIFICATION_PASSED",
  requestId: "verify-run-01",
  featureId: "sprint-nova-epic",
  sessionId: notApplicable(),
  candidate,
  ...overrides,
});

function expectCode(code, fn) {
  assert.throws(fn, (error) => error instanceof GovernanceActionEventError && error.code === code);
}

function clone(value) { return structuredClone(value); }

test("schema and runtime expose the same closed fields, kinds, statuses, reasons, and eleven matrix rows", () => {
  assert.equal(schema.$id, "https://agent-pipeline.dev/schemas/pipeline.governance-action-event.v1.json");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["eventId", "kind", "status", "reasonCode", "correlation", "candidate"]);
  assert.deepEqual(Object.keys(schema.properties), schema.required);
  assert.deepEqual(schema.properties.kind.enum, Object.keys(GOVERNANCE_ACTION_MATRIX));
  assert.deepEqual(schema.properties.status.enum, ["completed", "failed", "unknown", "unavailable"]);
  const runtimeRows = Object.entries(GOVERNANCE_ACTION_MATRIX).flatMap(([kind, statuses]) =>
    Object.entries(statuses).flatMap(([status, reasons]) => reasons.map((reasonCode) => ({ kind, status, reasonCode }))));
  const schemaRows = schema.allOf[0].oneOf.map((branch) => ({
    kind: branch.properties.kind.const,
    status: branch.properties.status.const,
    reasonCode: branch.properties.reasonCode.const,
  }));
  assert.deepEqual(schemaRows, runtimeRows);
  assert.equal(runtimeRows.length, 11);
  assert.equal(schema.$defs.correlation.additionalProperties, false);
  assert.deepEqual(schema.$defs.correlation.required, ["actionId", "featureId", "requestId", "sessionId"]);
  assert.equal(schema.$defs.candidate.additionalProperties, false);
});

test("every D3 matrix row builds, validates, and returns deeply frozen canonical output", () => {
  for (const [kind, statuses] of Object.entries(GOVERNANCE_ACTION_MATRIX)) {
    for (const [status, reasons] of Object.entries(statuses)) for (const reasonCode of reasons) {
      const event = buildGovernanceActionEvent(base({ kind, status, reasonCode, requestId: `${kind}-request` }));
      assert.deepEqual(validateGovernanceActionEvent(event), event);
      assert.ok(Object.isFrozen(event));
      assert.ok(Object.isFrozen(event.correlation));
      assert.ok(Object.isFrozen(event.correlation.sessionId));
      assert.ok(Object.isFrozen(event.candidate));
      assert.notEqual(event.eventId, event.correlation.actionId);
    }
  }
});

test("actionId and eventId use the exact canonical D3 preimages and remain digest-stable", () => {
  const event = buildGovernanceActionEvent(base());
  const actionPreimage = { domain: GOVERNANCE_ACTION_ID_DOMAIN, kind: event.kind, requestId: event.correlation.requestId };
  const eventPreimage = {
    domain: GOVERNANCE_ACTION_EVENT_ID_DOMAIN,
    kind: event.kind,
    status: event.status,
    reasonCode: event.reasonCode,
    correlation: event.correlation,
    candidate: event.candidate,
  };
  assert.equal(GOVERNANCE_ACTION_EVENT_SCHEMA, "pipeline.governance-action-event.v1");
  assert.equal(event.correlation.actionId, canonicalSha256(actionPreimage));
  assert.equal(event.eventId, canonicalSha256(eventPreimage));
  assert.equal(event.correlation.actionId, "294ff58437e9fd51c019ad685046954851500777e707fa59144a752f96a46b63");
  assert.equal(event.eventId, "514204e519e2722a33d66d526ed17a47d67902b83d4b1bceca065d74a5d839ee");
  assert.equal(event.correlation.actionId, deriveGovernanceActionId({ kind: event.kind, requestId: event.correlation.requestId }));
  assert.equal(event.eventId, deriveGovernanceActionEventId(eventPreimage));
});

test("validator rejects extra fields, open text, and dispatch identity without dropping them", () => {
  const event = buildGovernanceActionEvent(base());
  expectCode("GAE-SHAPE", () => validateGovernanceActionEvent({ ...event, message: "free form" }));
  expectCode("GAE-SHAPE", () => validateGovernanceActionEvent({ ...event, runner: "codex" }));
  expectCode("GAE-CORRELATION", () => validateGovernanceActionEvent({ ...event, correlation: { ...event.correlation, dispatchId: "dispatch-1" } }));
  expectCode("GAE-CORRELATION", () => validateGovernanceActionEvent({ ...event, correlation: { ...event.correlation, sessionId: { state: "unknown" } } }));
});

test("validator rejects every unlisted kind, status, reason, and candidate shape", () => {
  const event = buildGovernanceActionEvent(base());
  expectCode("GAE-KIND", () => validateGovernanceActionEvent({ ...event, kind: "dispatch" }));
  expectCode("GAE-STATUS", () => validateGovernanceActionEvent({ ...event, status: "cancelled" }));
  expectCode("GAE-STATUS", () => validateGovernanceActionEvent({ ...event, kind: "review", status: "failed", reasonCode: "REVIEW_FINDINGS" }));
  expectCode("GAE-REASON", () => validateGovernanceActionEvent({ ...event, reasonCode: "ARBITRARY_REASON" }));
  expectCode("GAE-REASON", () => validateGovernanceActionEvent({ ...event, kind: "gate", reasonCode: "HGO_NOT_CONSUMED" }));
  expectCode("GAE-CANDIDATE", () => validateGovernanceActionEvent({ ...event, candidate: { state: "unavailable" } }));
  expectCode("GAE-CANDIDATE", () => validateGovernanceActionEvent({ ...event, candidate: { commit: "A".repeat(40), tree: candidate.tree } }));
});

test("validator recomputes and rejects mismatched action and event digests", () => {
  const event = buildGovernanceActionEvent(base());
  expectCode("GAE-ACTION-ID", () => validateGovernanceActionEvent({
    ...event, correlation: { ...event.correlation, actionId: "c".repeat(64) },
  }));
  expectCode("GAE-EVENT-ID", () => validateGovernanceActionEvent({ ...event, eventId: "d".repeat(64) }));
  expectCode("GAE-ACTION-ID", () => validateGovernanceActionEvent({
    ...event, correlation: { ...event.correlation, actionId: "not-a-digest" },
  }));
  expectCode("GAE-EVENT-ID", () => validateGovernanceActionEvent({ ...event, eventId: "not-a-digest" }));
});

test("builder is exact and source identity fields admit only validated IDs or not-applicable", () => {
  expectCode("GAE-BUILD-SHAPE", () => buildGovernanceActionEvent({ ...base(), rationale: "because" }));
  expectCode("GAE-CORRELATION", () => buildGovernanceActionEvent(base({ requestId: "" })));
  expectCode("GAE-CORRELATION", () => buildGovernanceActionEvent(base({ featureId: notApplicable(), sessionId: { state: "not-applicable", detail: "x" } })));
  const input = base({ featureId: notApplicable(), sessionId: "session-1" });
  const snapshot = clone(input);
  const event = buildGovernanceActionEvent(input);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(event.correlation.featureId, notApplicable());
  assert.equal(event.correlation.sessionId, "session-1");
});

function hgoSource(overrides = {}) {
  return {
    schema: HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA,
    status: "consumed",
    consumptionSha256: "c".repeat(64),
    candidate,
    ...overrides,
  };
}
function hgoBuild(overrides = {}) {
  return buildGovernanceHgoConsumptionAction({ source: hgoSource(), ...overrides });
}
function expectHgoCode(expected, run) {
  assert.throws(run, (error) => error instanceof GovernanceHgoConsumptionActionError && error.code === expected);
}

test("private HGO identifiers collapse into one stable public source digest", () => {
  const input = { planSha256: "d".repeat(64), requestSha256: "e".repeat(64), candidate };
  const projected = buildGovernanceHgoConsumptionSource(input);
  assert.deepEqual(Object.keys(projected).sort(), ["candidate", "consumptionSha256", "schema", "status"]);
  assert.match(projected.consumptionSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(validateGovernanceHgoConsumptionSource(structuredClone(projected)), projected);
  assert.deepEqual(buildGovernanceHgoConsumptionSource(input), projected);
  assert.notEqual(
    buildGovernanceHgoConsumptionSource({ ...input, planSha256: "f".repeat(64) }).consumptionSha256,
    projected.consumptionSha256,
  );
  assert.equal(JSON.stringify(projected).includes(input.planSha256), false);
  assert.equal(JSON.stringify(projected).includes(input.requestSha256), false);
});

test("authenticated consumption source maps to the one minimal HGO gate row", () => {
  const event = hgoBuild();
  assert.equal(event.kind, "gate");
  assert.equal(event.status, "completed");
  assert.equal(event.reasonCode, "HGO_CONSUMED");
  assert.equal(event.correlation.requestId, "c".repeat(64));
  assert.deepEqual(event.correlation.featureId, { state: "not-applicable" });
  assert.deepEqual(event.correlation.sessionId, { state: "not-applicable" });
  assert.deepEqual(hgoBuild(), event, "one consumed source must derive one stable action and event identity");
  assert.deepEqual(event.candidate, candidate);
  assert.deepEqual(validateGovernanceActionEvent(event), event);
  assert.deepEqual(Object.keys(event).sort(), ["candidate", "correlation", "eventId", "kind", "reasonCode", "status"]);
});

test("HGO source and portable result reject every private or descriptive field", () => {
  for (const extra of [
    { command: "git push" }, { path: "secret.txt" }, { humanName: "Andre" },
    { reason: "approved" }, { target: "origin" }, { requestSha256: "d".repeat(64) },
    { planSha256: "e".repeat(64) }, { receipt: { private: true } },
  ]) expectHgoCode("GHCA-SOURCE-SHAPE", () => hgoBuild({ source: hgoSource(extra) }));
});

test("only an exact consumed HGO source with a valid digest and candidate is admitted", () => {
  expectHgoCode("GHCA-SOURCE-SHAPE", () => hgoBuild({ source: hgoSource({ status: "armed" }) }));
  expectHgoCode("GHCA-SOURCE-DIGEST", () => hgoBuild({ source: hgoSource({ consumptionSha256: "ABC" }) }));
  expectHgoCode("GHCA-SOURCE-BINDING", () => hgoBuild({ source: hgoSource({ candidate: { state: "unavailable" } }) }));
  expectHgoCode("GHCA-SOURCE-SHAPE", () => buildGovernanceHgoConsumptionAction({
    source: hgoSource(), featureId: "nova-b",
  }));
  expectHgoCode("GHCA-SOURCE-SHAPE", () => buildGovernanceHgoConsumptionAction({
    source: hgoSource(), sessionId: "session-1",
  }));
});

test("HGO artifact publication is create-only and retry is byte-identical", () => {
  const root = mkdtempSync(join(tmpdir(), "governance-hgo-consumption-"));
  try {
    const event = hgoBuild();
    const eventOutPath = "evidence/hgo-consumed.json";
    const published = writeGovernanceHgoConsumptionAction({ rootDir: root, eventOutPath, event });
    assert.equal(published.status, "written");
    assert.deepEqual(JSON.parse(readFileSync(join(root, eventOutPath), "utf8")), event);
    expectHgoCode("GHCA-OUTPUT-EXISTS", () => writeGovernanceHgoConsumptionAction({ rootDir: root, eventOutPath, event }));
    const retry = buildGovernanceHgoConsumptionRetry({ eventOutPath, event });
    assert.equal(retry.schema, GOVERNANCE_HGO_CONSUMPTION_RETRY_SCHEMA);
    assert.deepEqual(validateGovernanceHgoConsumptionRetry(structuredClone(retry)), retry);
    assert.equal(retryGovernanceHgoConsumptionAction({ rootDir: root, retry }).status, "existing-identical");
    writeFileSync(join(root, eventOutPath), JSON.stringify(event));
    expectHgoCode("GHCA-OUTPUT-EXISTS", () => retryGovernanceHgoConsumptionAction({ rootDir: root, retry }));
    assert.equal(existsSync(join(root, eventOutPath)), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("HGO retry accepts no other gate fact", () => {
  const event = hgoBuild();
  expectHgoCode("GHCA-RETRY-EVENT", () => buildGovernanceHgoConsumptionRetry({
    eventOutPath: "event.json", event: { ...event, reasonCode: "PUSH_APPROVED" },
  }));
  expectHgoCode("GHCA-RETRY-SHAPE", () => validateGovernanceHgoConsumptionRetry({
    schema: GOVERNANCE_HGO_CONSUMPTION_RETRY_SCHEMA,
    eventOutPath: "event.json",
    event,
    command: "retry",
  }));
});
