// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHECKPOINT_LANE,
  PROTECTED_LANE,
  PUSH_DESTINATION_POLICY_SCHEMA,
  classifyPushDestination,
  parsePushDestinationPolicy,
  validCheckpointIntent,
} from "./push-destination-policy.mjs";
import { CHECKPOINT_AUDIT_SCHEMA, checkpointAuditRecord, recordCheckpointPushAttempt } from "./checkpoint-push-audit.mjs";

const policy = { schema: PUSH_DESTINATION_POLICY_SCHEMA, checkpointNamespace: "refs/heads/feat/" };
const binding = {
  ok: true,
  remote: "origin",
  source: "refs/heads/feat/checkpoint",
  sourceRef: "refs/heads/feat/checkpoint",
  destination: "refs/heads/feat/checkpoint",
};

test("configured exact feature branch is the sole checkpoint lane", () => {
  const result = classifyPushDestination({ manifestStatus: "ok", policy, binding });
  assert.equal(result.lane, CHECKPOINT_LANE);
  assert.equal(result.policy.namespace, "refs/heads/feat/");
});

test("missing, malformed, future, or invalid manifest policy remains protected", () => {
  const cases = [
    undefined,
    {},
    { schema: "pipeline.push-destination-policy.v2", checkpointNamespace: "refs/heads/feat/" },
    { schema: PUSH_DESTINATION_POLICY_SCHEMA, checkpointNamespace: "refs/heads/" },
    { schema: PUSH_DESTINATION_POLICY_SCHEMA, checkpointNamespace: "refs/heads/feat/", future: true },
  ];
  for (const candidate of cases) {
    assert.equal(classifyPushDestination({ manifestStatus: "ok", policy: candidate, binding }).lane, PROTECTED_LANE);
  }
  assert.equal(classifyPushDestination({ manifestStatus: "invalid", policy, binding }).lane, PROTECTED_LANE);
});

test("main, protected/release/stable refs, tags, unknowns, and mismatched sources stay protected", () => {
  const destinations = [
    "refs/heads/main",
    "refs/heads/release/0.6.2",
    "refs/heads/stable",
    "refs/tags/v0.6.2",
    "refs/heads/other",
  ];
  for (const destination of destinations) {
    assert.equal(classifyPushDestination({ manifestStatus: "ok", policy, binding: { ...binding, destination } }).lane, PROTECTED_LANE);
  }
  assert.equal(classifyPushDestination({ manifestStatus: "ok", policy, binding: { ...binding, sourceRef: "refs/heads/feat/other" } }).lane, PROTECTED_LANE);
  assert.equal(classifyPushDestination({ manifestStatus: "ok", policy, binding: { ...binding, destination: null } }).lane, PROTECTED_LANE);
});

test("checkpoint intent is bounded, printable, and non-empty", () => {
  assert.equal(validCheckpointIntent("remote backup before refactor"), true);
  for (const intent of ["", "x", " three", "three ", "multi\nline", "x".repeat(281)]) {
    assert.equal(validCheckpointIntent(intent), false);
  }
});

test("policy parser never supplies an implicit namespace", () => {
  assert.equal(parsePushDestinationPolicy(undefined).ok, false);
  assert.equal(parsePushDestinationPolicy({ schema: PUSH_DESTINATION_POLICY_SCHEMA, checkpointNamespace: "refs/heads/feat/" }).ok, true);
});

test("checkpoint audit records bind candidate, target, timestamp, and human intent", () => {
  const record = checkpointAuditRecord({
    commit: "a".repeat(40), tree: "b".repeat(40), remote: "origin", destination: "refs/heads/feat/checkpoint",
    intent: "remote backup before refactor", at: "2026-09-15T12:00:00.000Z",
  });
  assert.equal(record.schema, CHECKPOINT_AUDIT_SCHEMA);
  let appended = null;
  const result = recordCheckpointPushAttempt({
    projectDir: "/fixture/project",
    record,
    deps: {
      run: () => ({ status: 0, stdout: ".git\n" }),
      mkdir: () => {},
      appendFile: (_path, line) => { appended = JSON.parse(line); },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(appended, record);
  assert.equal(checkpointAuditRecord({ commit: "bad", tree: "b".repeat(40), remote: "origin", destination: "refs/heads/feat/checkpoint", intent: "valid" }), null);
});
