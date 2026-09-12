#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GOVERNANCE_RECONCILIATION_RETRY_SCHEMA,
  GOVERNANCE_RECONCILIATION_SOURCE_SCHEMA,
  GOVERNANCE_RECOVERY_RETRY_SCHEMA,
  GOVERNANCE_RECOVERY_SOURCE_SCHEMA,
  GovernanceRecoveryReconciliationActionError,
  buildGovernanceReconciliationAction,
  buildGovernanceReconciliationRetry,
  buildGovernanceRecoveryAction,
  buildGovernanceRecoveryRetry,
  preflightGovernanceReconciliationActionOutput,
  preflightGovernanceRecoveryActionOutput,
  retryGovernanceReconciliationAction,
  retryGovernanceRecoveryAction,
  validateGovernanceReconciliationRetry,
  validateGovernanceRecoveryRetry,
  writeGovernanceReconciliationAction,
  writeGovernanceRecoveryAction,
} from "./governance-recovery-reconciliation-action.mjs";
import { validateGovernanceActionEvent } from "./governance-action-events.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
const injectedFailure = process.env.PIPELINE_GRRA_TEST_INJECT_FAILURE ?? "";
const selfProbeChild = process.env.PIPELINE_GRRA_TEST_SELF_PROBE_CHILD === "1";
function check(name, run) {
  const id = `GRRA${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({ id, name, run() { if (injectedFailure === id) assert.fail("intentional recovery action case-completion failure"); return run(); } });
}

const candidate = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const na = Object.freeze({ state: "not-applicable" });
function recoverySource(overrides = {}) {
  return { schema: GOVERNANCE_RECOVERY_SOURCE_SCHEMA, recoveryPlanSha256: "c".repeat(64), candidate, featureId: "nova-b", sessionId: na, ...overrides };
}
function reconciliationSource(overrides = {}) {
  return { schema: GOVERNANCE_RECONCILIATION_SOURCE_SCHEMA, reconciliationPlanSha256: "d".repeat(64), candidate, featureId: "nova-b", sessionId: na, ...overrides };
}

check("both verified plan digests map to their exact completed action rows", () => {
  for (const [event, kind, reasonCode, requestId] of [
    [buildGovernanceRecoveryAction(recoverySource()), "recovery", "RECOVERY_COMPLETED", "c".repeat(64)],
    [buildGovernanceReconciliationAction(reconciliationSource()), "reconciliation", "RECONCILIATION_COMPLETED", "d".repeat(64)],
  ]) {
    assert.equal(event.kind, kind);
    assert.equal(event.status, "completed");
    assert.equal(event.reasonCode, reasonCode);
    assert.equal(event.correlation.requestId, requestId);
    assert.deepEqual(event.candidate, candidate);
    assert.deepEqual(validateGovernanceActionEvent(event), event);
  }
});

check("both source schemas reject runner, person, path, and free-text fields", () => {
  const builders = [[buildGovernanceRecoveryAction, recoverySource], [buildGovernanceReconciliationAction, reconciliationSource]];
  for (const [builder, source] of builders) {
    for (const extra of [{ runner: "codex" }, { person: "Andre" }, { path: "private/file" }, { message: "done" }]) {
      assert.throws(() => builder({ ...source(), ...extra }),
        (error) => error instanceof GovernanceRecoveryReconciliationActionError && error.code.endsWith("SOURCE-SHAPE"));
    }
    assert.deepEqual(Object.keys(builder(source())).sort(), ["candidate", "correlation", "eventId", "kind", "reasonCode", "status"]);
  }
});

check("invalid plan digests, candidates, and cross-kind source schemas fail closed", () => {
  assert.throws(() => buildGovernanceRecoveryAction(recoverySource({ recoveryPlanSha256: "ABC" })), (error) => error.code === "GRRA-RECOVERY-SOURCE-DIGEST");
  assert.throws(() => buildGovernanceReconciliationAction(reconciliationSource({ reconciliationPlanSha256: "short" })), (error) => error.code === "GRRA-RECONCILIATION-SOURCE-DIGEST");
  assert.throws(() => buildGovernanceRecoveryAction(recoverySource({ candidate: { commit: "short", tree: candidate.tree } })), (error) => error.code === "GRRA-RECOVERY-SOURCE-BINDING");
  assert.throws(() => buildGovernanceRecoveryAction(reconciliationSource()), (error) => error.code === "GRRA-RECOVERY-SOURCE-SHAPE");
});

check("typed retry wrappers are closed and reject cross-kind events", () => {
  const recoveryEvent = buildGovernanceRecoveryAction(recoverySource());
  const reconciliationEvent = buildGovernanceReconciliationAction(reconciliationSource());
  const recovery = buildGovernanceRecoveryRetry({ eventOutPath: "evidence/recovery.json", event: recoveryEvent });
  const reconciliation = buildGovernanceReconciliationRetry({ eventOutPath: "evidence/reconciliation.json", event: reconciliationEvent });
  assert.equal(recovery.schema, GOVERNANCE_RECOVERY_RETRY_SCHEMA);
  assert.equal(reconciliation.schema, GOVERNANCE_RECONCILIATION_RETRY_SCHEMA);
  assert.deepEqual(validateGovernanceRecoveryRetry(structuredClone(recovery)), recovery);
  assert.deepEqual(validateGovernanceReconciliationRetry(structuredClone(reconciliation)), reconciliation);
  assert.throws(() => validateGovernanceRecoveryRetry({ ...recovery, command: "recover" }), (error) => error.code === "GRRA-RECOVERY-RETRY-SHAPE");
  assert.throws(() => buildGovernanceRecoveryRetry({ eventOutPath: recovery.eventOutPath, event: reconciliationEvent }), (error) => error.code === "GRRA-RECOVERY-RETRY-EVENT");
  assert.throws(() => buildGovernanceReconciliationRetry({ eventOutPath: reconciliation.eventOutPath, event: recoveryEvent }), (error) => error.code === "GRRA-RECONCILIATION-RETRY-EVENT");
});

check("recovery publication is create-only and retry accepts only identical bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "grra-recovery-"));
  try {
    const event = buildGovernanceRecoveryAction(recoverySource());
    const eventOutPath = "evidence/recovery.json";
    preflightGovernanceRecoveryActionOutput({ rootDir: root, eventOutPath });
    assert.equal(existsSync(join(root, "evidence")), false);
    const written = writeGovernanceRecoveryAction({ rootDir: root, eventOutPath, event });
    assert.equal(written.status, "written");
    assert.deepEqual(JSON.parse(readFileSync(written.outPath, "utf8")), event);
    assert.throws(() => writeGovernanceRecoveryAction({ rootDir: root, eventOutPath, event }), (error) => error.code === "GRRA-RECOVERY-OUTPUT-EXISTS");
    const retry = buildGovernanceRecoveryRetry({ eventOutPath, event });
    assert.equal(retryGovernanceRecoveryAction({ rootDir: root, retry }).status, "existing-identical");
    writeFileSync(written.outPath, JSON.stringify(event));
    assert.throws(() => retryGovernanceRecoveryAction({ rootDir: root, retry }), (error) => error.code === "GRRA-RECOVERY-OUTPUT-EXISTS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("reconciliation publication is create-only and retry rejects different content", () => {
  const root = mkdtempSync(join(tmpdir(), "grra-reconciliation-"));
  try {
    const event = buildGovernanceReconciliationAction(reconciliationSource());
    const eventOutPath = "evidence/reconciliation.json";
    const written = writeGovernanceReconciliationAction({ rootDir: root, eventOutPath, event });
    assert.equal(written.status, "written");
    const retry = buildGovernanceReconciliationRetry({ eventOutPath, event });
    assert.equal(retryGovernanceReconciliationAction({ rootDir: root, retry }).status, "existing-identical");
    const drift = buildGovernanceReconciliationAction(reconciliationSource({ candidate: { commit: "e".repeat(40), tree: candidate.tree } }));
    writeFileSync(written.outPath, `${JSON.stringify(drift, null, 2)}\n`);
    assert.throws(() => retryGovernanceReconciliationAction({ rootDir: root, retry }), (error) => error.code === "GRRA-RECONCILIATION-OUTPUT-EXISTS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("the same plan is deterministic while candidate or kind changes the retained fact", () => {
  const first = buildGovernanceRecoveryAction(recoverySource());
  const replay = buildGovernanceRecoveryAction(structuredClone(recoverySource()));
  assert.deepEqual(replay, first);
  assert.equal(replay.eventId, first.eventId);
  const drift = buildGovernanceRecoveryAction(recoverySource({ candidate: { commit: "e".repeat(40), tree: candidate.tree } }));
  assert.equal(drift.correlation.actionId, first.correlation.actionId);
  assert.notEqual(drift.eventId, first.eventId);
  const otherKind = buildGovernanceReconciliationAction(reconciliationSource({ reconciliationPlanSha256: "c".repeat(64) }));
  assert.notEqual(otherKind.correlation.actionId, first.correlation.actionId);
});

check("typed preflights retain read-only path checks and typed errors", () => {
  const root = mkdtempSync(join(tmpdir(), "grra-preflight-"));
  try {
    preflightGovernanceRecoveryActionOutput({ rootDir: root, eventOutPath: "evidence/recovery.json" });
    preflightGovernanceReconciliationActionOutput({ rootDir: root, eventOutPath: "evidence/reconciliation.json" });
    assert.equal(existsSync(join(root, "evidence")), false);
    assert.throws(() => preflightGovernanceRecoveryActionOutput({ rootDir: root, eventOutPath: "../escape.json" }),
      (error) => error.code === "GRRA-RECOVERY-OUTPUT-PATH");
    assert.throws(() => preflightGovernanceReconciliationActionOutput({ rootDir: root, eventOutPath: "/absolute.json" }),
      (error) => error.code === "GRRA-RECONCILIATION-OUTPUT-PATH");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("an early failed case still emits dispositions for the complete corpus", () => {
  if (selfProbeChild) return;
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PIPELINE_GRRA_TEST_INJECT_FAILURE: "GRRA02",
      PIPELINE_GRRA_TEST_SELF_PROBE_CHILD: "1",
      PIPELINE_VERIFY_CASE_COMPLETION_FD: "3",
      PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "65536",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  assert.notEqual(probe.status, 0);
  const records = String(probe.output[3]).trim().split("\n").map((line) => JSON.parse(line));
  const disposed = records.filter((record) => record.event === "DISPOSED");
  assert.equal(records[0].event, "DECLARED");
  assert.equal(records[0].caseCount, 9);
  assert.equal(disposed.length, 9);
  assert.equal(disposed.find((record) => record.id === "GRRA02")?.disposition, "fail");
  assert.equal(disposed.find((record) => record.id === "GRRA09")?.disposition, "pass");
  assert.deepEqual(records.at(-1).counts, { pass: 8, fail: 1, skip: 0, todo: 0 });
});

assert.equal(cases.length, 9);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
