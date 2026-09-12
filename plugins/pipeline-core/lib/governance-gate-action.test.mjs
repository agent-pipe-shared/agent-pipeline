#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GOVERNANCE_GATE_RETRY_SCHEMA,
  GOVERNANCE_GATE_SOURCE_SCHEMA,
  GovernanceGateActionError,
  buildGovernanceGateAction,
  buildGovernanceGateRetry,
  preflightGovernanceActionOutput,
  retryGovernanceGateAction,
  validateGovernanceGateRetry,
  writeGovernanceGateAction,
} from "./governance-gate-action.mjs";
import { validateGovernanceActionEvent } from "./governance-action-events.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function check(name, run) { cases.push({ id: `GGA${String(cases.length + 1).padStart(2, "0")}`, name, run }); }
const candidate = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const na = Object.freeze({ state: "not-applicable" });
function source(action = "push", overrides = {}) {
  return { schema: GOVERNANCE_GATE_SOURCE_SCHEMA, approvalSubjectSha256: "c".repeat(64), action, candidate, featureId: "nova-b", sessionId: na, ...overrides };
}

check("push and deploy map exactly to completed gate actions", () => {
  for (const [action, reasonCode] of [["push", "PUSH_APPROVED"], ["deploy", "DEPLOY_APPROVED"]]) {
    const event = buildGovernanceGateAction(source(action));
    assert.equal(event.kind, "gate");
    assert.equal(event.status, "completed");
    assert.equal(event.reasonCode, reasonCode);
    assert.equal(event.correlation.requestId, "c".repeat(64));
    assert.deepEqual(event.candidate, candidate);
    assert.deepEqual(validateGovernanceActionEvent(event), event);
  }
});
check("source is closed against runner, signer and destination data", () => {
  for (const extra of [{ runner: "codex" }, { signer: "Andre" }, { key: "secret" }, { destination: "origin" }, { reason: "approved" }]) {
    assert.throws(() => buildGovernanceGateAction({ ...source(), ...extra }), (error) => error instanceof GovernanceGateActionError && error.code === "GGA-SOURCE-SHAPE");
  }
  assert.deepEqual(Object.keys(buildGovernanceGateAction(source())).sort(), ["candidate", "correlation", "eventId", "kind", "reasonCode", "status"]);
});
check("invalid digest, action and candidate fail closed", () => {
  assert.throws(() => buildGovernanceGateAction(source("push", { approvalSubjectSha256: "ABC" })), (error) => error.code === "GGA-SOURCE-DIGEST");
  assert.throws(() => buildGovernanceGateAction(source("release")), (error) => error.code === "GGA-SOURCE-ACTION");
  assert.throws(() => buildGovernanceGateAction(source("push", { candidate: { commit: "short", tree: candidate.tree } })), (error) => error.code === "GGA-SOURCE-BINDING");
});
check("gate retry is closed and rejects non-gate events", () => {
  const event = buildGovernanceGateAction(source());
  const retry = buildGovernanceGateRetry({ eventOutPath: "evidence/push.json", event });
  assert.equal(retry.schema, GOVERNANCE_GATE_RETRY_SCHEMA);
  assert.deepEqual(validateGovernanceGateRetry(structuredClone(retry)), retry);
  assert.throws(() => validateGovernanceGateRetry({ ...retry, command: "push" }), (error) => error.code === "GGA-RETRY-SHAPE");
  assert.throws(() => buildGovernanceGateRetry({ eventOutPath: retry.eventOutPath, event: { ...event, kind: "verification" } }), (error) => error.code === "GGA-RETRY-EVENT");
});
check("gate writer uses the physical preflight and is create-only", () => {
  const root = mkdtempSync(join(tmpdir(), "gga-write-"));
  try {
    const event = buildGovernanceGateAction(source());
    preflightGovernanceActionOutput({ rootDir: root, eventOutPath: "evidence/push.json" });
    assert.equal(existsSync(join(root, "evidence")), false);
    const written = writeGovernanceGateAction({ rootDir: root, eventOutPath: "evidence/push.json", event });
    assert.equal(written.status, "written");
    assert.deepEqual(JSON.parse(readFileSync(written.outPath, "utf8")), event);
    assert.throws(() => writeGovernanceGateAction({ rootDir: root, eventOutPath: "evidence/push.json", event }), (error) => error.code === "GGA-OUTPUT-EXISTS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
check("event-only retry accepts only a byte-identical gate artifact", () => {
  const root = mkdtempSync(join(tmpdir(), "gga-retry-"));
  try {
    const event = buildGovernanceGateAction(source("deploy"));
    const retry = buildGovernanceGateRetry({ eventOutPath: "deploy.json", event });
    writeGovernanceGateAction({ rootDir: root, eventOutPath: retry.eventOutPath, event });
    assert.equal(retryGovernanceGateAction({ rootDir: root, retry }).status, "existing-identical");
    writeFileSync(join(root, "deploy.json"), JSON.stringify(event));
    assert.throws(() => retryGovernanceGateAction({ rootDir: root, retry }), (error) => error.code === "GGA-OUTPUT-EXISTS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
check("different approved actions retain their distinct candidate-bound facts", () => {
  const push = buildGovernanceGateAction(source("push"));
  const deploy = buildGovernanceGateAction(source("deploy"));
  assert.equal(push.correlation.actionId, deploy.correlation.actionId);
  assert.notEqual(push.eventId, deploy.eventId);
  const drift = buildGovernanceGateAction(source("push", { candidate: { commit: "d".repeat(40), tree: candidate.tree } }));
  assert.equal(push.correlation.actionId, drift.correlation.actionId);
  assert.notEqual(push.eventId, drift.eventId);
});

assert.equal(cases.length, 7);
const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
