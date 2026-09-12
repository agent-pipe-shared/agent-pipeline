#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
  GovernanceActionArtifactError,
  buildGovernanceActionArtifactRetry,
  preflightGovernanceActionOutput,
  retryGovernanceActionArtifact,
  validateGovernanceActionArtifactRetry,
  writeGovernanceActionArtifact,
} from "./governance-action-artifact.mjs";
import { buildGovernanceActionEvent } from "./governance-action-events.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function check(name, run) { cases.push({ id: `GAA${String(cases.length + 1).padStart(2, "0")}`, name, run }); }
const candidate = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const na = Object.freeze({ state: "not-applicable" });
function event(kind = "verification", reasonCode = "VERIFICATION_PASSED") {
  return buildGovernanceActionEvent({ kind, status: "completed", reasonCode, requestId: "c".repeat(64), featureId: na, sessionId: na, candidate });
}

check("generic retry is closed and preserves any validated action kind", () => {
  for (const action of [event(), event("gate", "PUSH_APPROVED")]) {
    const retry = buildGovernanceActionArtifactRetry({ eventOutPath: "evidence/action.json", event: action });
    assert.equal(retry.schema, GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA);
    assert.deepEqual(validateGovernanceActionArtifactRetry(structuredClone(retry)), retry);
    assert.throws(() => validateGovernanceActionArtifactRetry({ ...retry, command: "push" }), (error) => error.code === "GAA-RETRY-SHAPE");
  }
});
check("retry rejects malformed events and non-repository paths", () => {
  assert.throws(() => buildGovernanceActionArtifactRetry({ eventOutPath: "event.json", event: { ...event(), eventId: "0".repeat(64) } }), (error) => error.code === "GAA-EVENT");
  for (const path of ["", ".", "..", "/event.json", "C:/event.json", "a\\event.json", "a/../event.json", "a//event.json", "a/"]) {
    assert.throws(() => buildGovernanceActionArtifactRetry({ eventOutPath: path, event: event() }), (error) => error.code === "GAA-RETRY-PATH");
  }
});
check("preflight is physical and does not mutate missing parents", () => {
  const root = mkdtempSync(join(tmpdir(), "gaa-preflight-"));
  try {
    const plan = preflightGovernanceActionOutput({ rootDir: root, eventOutPath: "evidence/actions/gate.json" });
    assert.equal(plan.eventOutPath, "evidence/actions/gate.json");
    assert.equal(existsSync(join(root, "evidence")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
check("preflight rejects existing leaves, escapes and physical symlink traversal", () => {
  const root = mkdtempSync(join(tmpdir(), "gaa-path-"));
  const outside = mkdtempSync(join(tmpdir(), "gaa-outside-"));
  try {
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "exists.json"), "owned\n");
    symlinkSync(outside, join(root, "alias"), "dir");
    for (const path of ["evidence/exists.json", "../escape.json", join(outside, "absolute.json"), "alias/event.json"]) {
      assert.throws(() => preflightGovernanceActionOutput({ rootDir: root, eventOutPath: path }),
        (error) => ["GAA-OUTPUT-PATH", "GAA-OUTPUT-EXISTS"].includes(error.code));
    }
    assert.equal(existsSync(join(outside, "event.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
check("writer creates, syncs and physically reads back one exact artifact", () => {
  const root = mkdtempSync(join(tmpdir(), "gaa-write-"));
  try {
    const action = event("gate", "DEPLOY_APPROVED");
    const result = writeGovernanceActionArtifact({ rootDir: root, eventOutPath: "evidence/gate.json", event: action });
    assert.equal(result.status, "written");
    assert.deepEqual(JSON.parse(readFileSync(result.outPath, "utf8")), action);
    assert.throws(() => writeGovernanceActionArtifact({ rootDir: root, eventOutPath: "evidence/gate.json", event: action }), (error) => error.code === "GAA-OUTPUT-EXISTS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
check("event-only retry accepts byte-identical publication and no other existing leaf", () => {
  const root = mkdtempSync(join(tmpdir(), "gaa-retry-"));
  try {
    const action = event("gate", "PUSH_APPROVED");
    const retry = buildGovernanceActionArtifactRetry({ eventOutPath: "gate.json", event: action });
    writeGovernanceActionArtifact({ rootDir: root, eventOutPath: retry.eventOutPath, event: action });
    assert.equal(retryGovernanceActionArtifact({ rootDir: root, retry }).status, "existing-identical");
    writeFileSync(join(root, "gate.json"), JSON.stringify(action));
    assert.throws(() => retryGovernanceActionArtifact({ rootDir: root, retry }), (error) => error.code === "GAA-OUTPUT-EXISTS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
check("retry preserves a conflicting valid event", () => {
  const root = mkdtempSync(join(tmpdir(), "gaa-conflict-"));
  try {
    const push = event("gate", "PUSH_APPROVED");
    const deploy = event("gate", "DEPLOY_APPROVED");
    writeGovernanceActionArtifact({ rootDir: root, eventOutPath: "gate.json", event: deploy });
    const before = readFileSync(join(root, "gate.json"), "utf8");
    const retry = buildGovernanceActionArtifactRetry({ eventOutPath: "gate.json", event: push });
    assert.throws(() => retryGovernanceActionArtifact({ rootDir: root, retry }), (error) => error.code === "GAA-OUTPUT-EXISTS");
    assert.equal(readFileSync(join(root, "gate.json"), "utf8"), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
check("malformed payload refuses before creating output parents", () => {
  const root = mkdtempSync(join(tmpdir(), "gaa-invalid-"));
  try {
    assert.throws(() => writeGovernanceActionArtifact({ rootDir: root, eventOutPath: "evidence/action.json", event: { ...event(), runner: "codex" } }),
      (error) => error instanceof GovernanceActionArtifactError && error.code === "GAA-EVENT");
    assert.equal(existsSync(join(root, "evidence")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

assert.equal(cases.length, 8);
const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
