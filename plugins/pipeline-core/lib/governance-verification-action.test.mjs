#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GOVERNANCE_VERIFICATION_RETRY_SCHEMA,
  GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA,
  GovernanceVerificationActionError,
  buildGovernanceVerificationAction,
  buildGovernanceVerificationRetry,
  preflightGovernanceVerificationActionOutput,
  retryGovernanceVerificationAction,
  validateGovernanceVerificationRetry,
  writeGovernanceVerificationAction,
} from "./governance-verification-action.mjs";
import { validateGovernanceActionEvent } from "./governance-action-events.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
const injectedFailure = process.env.PIPELINE_GVA_TEST_INJECT_FAILURE ?? "";
const selfProbeChild = process.env.PIPELINE_GVA_TEST_SELF_PROBE_CHILD === "1";
function check(name, run) {
  const id = `GVA${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({ id, name, run() { if (injectedFailure === id) assert.fail("intentional governance verification action case-completion failure"); return run(); } });
}

const candidate = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const notApplicable = Object.freeze({ state: "not-applicable" });
function source(outcome = "passed", overrides = {}) {
  return {
    schema: GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA,
    terminalEvidenceSha256: "c".repeat(64),
    outcome,
    candidate,
    featureId: notApplicable,
    sessionId: notApplicable,
    ...overrides,
  };
}

check("all four aggregate outcomes map exactly to the ADR-0083 verification rows", () => {
  const expected = {
    passed: ["completed", "VERIFICATION_PASSED"],
    failed: ["failed", "VERIFICATION_FAILED"],
    unknown: ["unknown", "VERIFICATION_UNKNOWN"],
    unavailable: ["unavailable", "VERIFICATION_UNAVAILABLE"],
  };
  for (const [outcome, [status, reasonCode]] of Object.entries(expected)) {
    const event = buildGovernanceVerificationAction(source(outcome));
    assert.equal(event.kind, "verification");
    assert.equal(event.status, status);
    assert.equal(event.reasonCode, reasonCode);
    assert.equal(event.correlation.requestId, "c".repeat(64));
    assert.deepEqual(event.candidate, candidate);
    assert.deepEqual(validateGovernanceActionEvent(event), event);
  }
});

check("the same terminal fact is idempotent while candidate or outcome drift changes the retained fact", () => {
  const first = buildGovernanceVerificationAction(source());
  const replay = buildGovernanceVerificationAction(structuredClone(source()));
  assert.deepEqual(replay, first);
  assert.equal(replay.eventId, first.eventId);
  assert.equal(replay.correlation.actionId, first.correlation.actionId);
  const changedCandidate = buildGovernanceVerificationAction(source("passed", { candidate: { commit: "d".repeat(40), tree: candidate.tree } }));
  assert.equal(changedCandidate.correlation.actionId, first.correlation.actionId);
  assert.notEqual(changedCandidate.eventId, first.eventId);
  const changedOutcome = buildGovernanceVerificationAction(source("failed"));
  assert.equal(changedOutcome.correlation.actionId, first.correlation.actionId);
  assert.notEqual(changedOutcome.eventId, first.eventId);
});

check("suite and runner detail cannot enter the closed aggregate source or payload", () => {
  for (const extra of [{ runner: "codex" }, { suites: [{ id: "unit" }] }, { receipt: "suite-1" }]) {
    assert.throws(() => buildGovernanceVerificationAction({ ...source(), ...extra }),
      (error) => error instanceof GovernanceVerificationActionError && error.code === "GVA-SOURCE-SHAPE");
  }
  assert.deepEqual(Object.keys(buildGovernanceVerificationAction(source())).sort(),
    ["candidate", "correlation", "eventId", "kind", "reasonCode", "status"]);
});

check("malformed digest, outcome, candidate, and source correlation fail closed", () => {
  const cases = [
    [source("running"), "GVA-SOURCE-OUTCOME"],
    [source("passed", { terminalEvidenceSha256: "ABC" }), "GVA-SOURCE-DIGEST"],
    [source("passed", { candidate: { commit: "short", tree: candidate.tree } }), "GVA-SOURCE-BINDING"],
    [source("passed", { featureId: "contains spaces" }), "GVA-SOURCE-BINDING"],
  ];
  for (const [input, code] of cases) {
    assert.throws(() => buildGovernanceVerificationAction(input),
      (error) => error instanceof GovernanceVerificationActionError && error.code === code);
  }
});

check("event-only retry data is closed, validated, and retains the identical event", () => {
  const event = buildGovernanceVerificationAction(source());
  const retry = buildGovernanceVerificationRetry({ eventOutPath: "evidence/actions/verify.json", event });
  assert.equal(retry.schema, GOVERNANCE_VERIFICATION_RETRY_SCHEMA);
  assert.deepEqual(validateGovernanceVerificationRetry(structuredClone(retry)), retry);
  assert.throws(() => validateGovernanceVerificationRetry({ ...retry, command: "node verify" }),
    (error) => error.code === "GVA-RETRY-SHAPE");
  assert.throws(() => buildGovernanceVerificationRetry({ eventOutPath: retry.eventOutPath, event: { ...event, eventId: "0".repeat(64) } }),
    (error) => error.code === "GVA-RETRY-EVENT");
  for (const eventOutPath of [
    "", ".", "..", "/absolute/event.json", "C:/private/event.json", "private\\event.json",
    "event\0.json", "a/./event.json", "a/../event.json", "a//event.json", "a/",
  ]) {
    assert.throws(() => buildGovernanceVerificationRetry({ eventOutPath, event }),
      (error) => error.code === "GVA-RETRY-PATH");
  }
});

check("the artifact boundary is physical, create-only, read back, and idempotent only for retry", () => {
  const root = mkdtempSync(join(tmpdir(), "governance-verification-action-"));
  try {
    const event = buildGovernanceVerificationAction(source());
    assert.equal(existsSync(join(root, "evidence")), false);
    preflightGovernanceVerificationActionOutput({ rootDir: root, eventOutPath: "evidence/actions/verify.json" });
    assert.equal(existsSync(join(root, "evidence")), false, "preflight must not mutate the source checkout");
    const written = writeGovernanceVerificationAction({ rootDir: root, eventOutPath: "evidence/actions/verify.json", event });
    assert.equal(written.status, "written");
    assert.deepEqual(JSON.parse(readFileSync(written.outPath, "utf8")), event);
    assert.throws(() => writeGovernanceVerificationAction({ rootDir: root, eventOutPath: "evidence/actions/verify.json", event }),
      (error) => error.code === "GVA-OUTPUT-EXISTS");
    const retry = buildGovernanceVerificationRetry({ eventOutPath: "evidence/actions/verify.json", event });
    assert.equal(retryGovernanceVerificationAction({ rootDir: root, retry }).status, "existing-identical");
    writeFileSync(written.outPath, JSON.stringify(event));
    assert.throws(() => retryGovernanceVerificationAction({ rootDir: root, retry }),
      (error) => error.code === "GVA-OUTPUT-EXISTS", "semantic JSON equality is not byte-identical publication");
    writeFileSync(written.outPath, `${JSON.stringify(buildGovernanceVerificationAction(source("failed")), null, 2)}\n`);
    assert.throws(() => retryGovernanceVerificationAction({ rootDir: root, retry }),
      (error) => error.code === "GVA-OUTPUT-EXISTS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("absolute, escaping, existing, and symlinked output paths fail during read-only preflight", () => {
  const root = mkdtempSync(join(tmpdir(), "governance-verification-path-"));
  const outside = mkdtempSync(join(tmpdir(), "governance-verification-outside-"));
  try {
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "existing.json"), "owned\n");
    symlinkSync(outside, join(root, "alias"), "dir");
    for (const eventOutPath of ["../escape.json", join(outside, "absolute.json"), "evidence/existing.json", "alias/event.json"]) {
      assert.throws(() => preflightGovernanceVerificationActionOutput({ rootDir: root, eventOutPath }),
        (error) => ["GVA-OUTPUT-PATH", "GVA-OUTPUT-EXISTS"].includes(error.code));
    }
    assert.equal(existsSync(join(outside, "event.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

check("an early failed case still emits dispositions for the complete declared corpus", () => {
  if (selfProbeChild) return;
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PIPELINE_GVA_TEST_INJECT_FAILURE: "GVA02",
      PIPELINE_GVA_TEST_SELF_PROBE_CHILD: "1",
      PIPELINE_VERIFY_CASE_COMPLETION_FD: "3",
      PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "65536",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  assert.notEqual(probe.status, 0, "the injected early case must fail");
  const records = String(probe.output[3]).trim().split("\n").map((line) => JSON.parse(line));
  const disposed = records.filter((record) => record.event === "DISPOSED");
  assert.equal(records[0].event, "DECLARED");
  assert.equal(records[0].caseCount, 8);
  assert.equal(disposed.length, 8);
  assert.equal(disposed.find((record) => record.id === "GVA02")?.disposition, "fail");
  assert.equal(disposed.find((record) => record.id === "GVA08")?.disposition, "pass");
  assert.deepEqual(records.at(-1).counts, { pass: 7, fail: 1, skip: 0, todo: 0 });
  assert.equal(records.at(-1).declaredCount, 8);
  assert.equal(records.at(-1).disposedCount, 8);
});

assert.equal(cases.length, 8, "the complete governance verification action corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
