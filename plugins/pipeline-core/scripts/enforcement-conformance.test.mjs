// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";

import {
  ENFORCEMENT_LAYERS,
  EVALUATOR_OUTCOMES,
  HOOK_OBSERVATIONS,
  MEASUREMENT_STATUSES,
  PROBE_SURFACES,
  checkCandidateBinding,
  classifyHookObservation,
  createRecordId,
  sanitizeRecord,
  sanitizeValue,
  validateRecord,
} from "./enforcement-conformance.mjs";

const sha = "a".repeat(64);
const oid = "b".repeat(40);

function validRecord(overrides = {}) {
  const record = {
    schema: "pipeline.enforcement-conformance.v1",
    recordId: "codex:runner-hook",
    candidate: { commit: oid, tree: oid, artifactSha256: sha },
    runner: { name: "codex", version: "1.0.0", pluginVersion: "0.6.1" },
    layer: "runner-hook",
    probeSurface: "runner-hook/orchestrator",
    measurement: { status: "measured", values: [{ name: "duration", value: 1.5, unit: "ms" }] },
    observation: { hookObservation: "fires", evidenceKind: "deterministic-execution", exitCode: 2, markerSha256: sha },
    evaluator: { outcome: "pass", basis: "deterministic refusal", acceptanceSha256: null },
    staleness: { status: "current", runnerVersion: "1.0.0", pluginVersion: "0.6.1", invalidatedBy: null },
    sanitization: { policy: "redact-sensitive-shapes-v1", redactions: [] },
    provenance: { commandSha256: sha, fixtureIds: ["fixture-basic"], sourceSha256: sha },
    measuredAt: "2026-09-04T12:00:00.000Z",
  };
  return deepMerge(record, overrides);
}

function deepMerge(base, changes) {
  const result = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? { ...result[key], ...value }
      : value;
  }
  return result;
}

test("accepts a valid exact record and all approved enum families", () => {
  assert.equal(validateRecord(validRecord()), true);
  assert.deepEqual(ENFORCEMENT_LAYERS, ["git-hook", "tool-scope", "runner-hook", "posthoc-verify", "prose"]);
  assert.deepEqual(MEASUREMENT_STATUSES, ["measured", "estimated", "unavailable", "unknown"]);
  assert.deepEqual(EVALUATOR_OUTCOMES, ["pass", "finding", "unavailable", "unsupported", "unknown", "excepted"]);
  assert.deepEqual(HOOK_OBSERVATIONS, ["fires", "fires-not", "unknown"]);
  assert.deepEqual(PROBE_SURFACES, ["runner-hook/orchestrator", "runner-hook/subagent", "payload-indirection", "git-hook"]);
});

test("refuses missing or unknown top-level and nested keys", () => {
  const missing = validRecord();
  delete missing.provenance;
  assert.throws(() => validateRecord(missing));
  const unknownTop = validRecord({ extra: true });
  assert.throws(() => validateRecord(unknownTop));
  const unknownNested = validRecord({ runner: { extra: true } });
  assert.throws(() => validateRecord(unknownNested));
});

test("refuses noncanonical record ids, times, and hashes", () => {
  assert.throws(() => createRecordId("Codex", "runner-hook"));
  assert.throws(() => createRecordId("code x", "runner-hook"));
  assert.throws(() => createRecordId("code:x", "runner-hook"));
  assert.throws(() => validateRecord(validRecord({ recordId: "codex:runner-hook:extra" })));
  assert.throws(() => validateRecord(validRecord({ measuredAt: "2026-09-04T12:00:00Z" })));
  assert.throws(() => validateRecord(validRecord({ candidate: { commit: oid.toUpperCase() } })));
  assert.throws(() => validateRecord(validRecord({ candidate: { artifactSha256: "not-a-hash" } })));
  for (const field of ["commit", "tree", "artifactSha256"]) {
    assert.throws(() => validateRecord(validRecord({ candidate: { [field]: null } })));
  }
});

test("absent telemetry is not represented as zero", () => {
  const record = validRecord({ measurement: { status: "unknown", values: [] } });
  assert.equal(validateRecord(record), true);
  assert.throws(() => validateRecord(validRecord({ measurement: { status: "unavailable", values: [{ name: "duration", value: 0, unit: "ms" }] } })));
});

test("keeps simulated fires and fires-not classifications raw", () => {
  assert.equal(classifyHookObservation({ fired: true }), "fires");
  assert.equal(classifyHookObservation({ fired: false, markerAvailable: true }), "fires-not");
  assert.equal(classifyHookObservation({ fired: false, markerAvailable: false }), "unknown");
  assert.equal(validateRecord(validRecord({ observation: { hookObservation: "fires-not" }, evaluator: { outcome: "finding" } })), true);
});

test("allows deterministic pass but refuses model and self-attestation pass", () => {
  assert.equal(validateRecord(validRecord()), true);
  for (const evidenceKind of ["model-attestation", "self-attestation"]) {
    assert.throws(() => validateRecord(validRecord({ observation: { evidenceKind } })));
  }
  assert.equal(validateRecord(validRecord({
    observation: { evidenceKind: "human-acceptance" },
    evaluator: { outcome: "pass", acceptanceSha256: sha },
  })), true);
  assert.throws(() => validateRecord(validRecord({ observation: { evidenceKind: "unavailable" }, evaluator: { outcome: "excepted" } })));
  assert.throws(() => validateRecord(validRecord({ observation: { evidenceKind: "deterministic-execution" }, evaluator: { outcome: "excepted" } })));
  assert.throws(() => validateRecord(validRecord({ observation: { evidenceKind: "human-acceptance" }, evaluator: { outcome: "excepted" } })));
  assert.equal(validateRecord(validRecord({ observation: { evidenceKind: "human-acceptance" }, evaluator: { outcome: "excepted", acceptanceSha256: sha } })), true);
  assert.throws(() => validateRecord(validRecord({ observation: { evidenceKind: "human-acceptance" }, evaluator: { outcome: "excepted", acceptanceSha256: "bad" } })));
  assert.throws(() => validateRecord(validRecord({ observation: { evidenceKind: "deterministic-execution" }, evaluator: { acceptanceSha256: sha } })));
  for (const evidenceKind of ["model-attestation", "self-attestation"]) {
    assert.throws(() => validateRecord(validRecord({ observation: { evidenceKind }, evaluator: { outcome: "excepted" } })));
  }
});

test("rejects candidate commit, tree, and artifact mismatches and version staleness", () => {
  const expected = { commit: oid, tree: oid, artifactSha256: sha, runnerVersion: "1.0.0", pluginVersion: "0.6.1" };
  assert.deepEqual(checkCandidateBinding(validRecord(), expected), { qualifies: true, reason: null });
  for (const field of ["commit", "tree", "artifactSha256"]) {
    const candidate = { ...expected, [field]: field === "artifactSha256" ? "c".repeat(64) : "c".repeat(40) };
    assert.equal(checkCandidateBinding(validRecord(), candidate).qualifies, false);
  }
  assert.equal(checkCandidateBinding(validRecord({ evaluator: { outcome: "finding" } }), expected).reason, "evaluator-outcome-not-pass");
  assert.equal(checkCandidateBinding(validRecord({ runner: { version: "2.0.0" }, staleness: { runnerVersion: "2.0.0" } }), expected).reason, "runner-or-plugin-version-mismatch");
  assert.equal(checkCandidateBinding(validRecord({ staleness: { runnerVersion: "2.0.0" } }), expected).reason, "staleness-version-mismatch");
  assert.equal(checkCandidateBinding(validRecord({ staleness: { status: "stale", invalidatedBy: "plugin-version" }, evaluator: { outcome: "finding" } }), expected).reason, "evaluator-outcome-not-pass");
});

test("requires coherent staleness versions and invalidation state", () => {
  assert.throws(() => validateRecord(validRecord({ staleness: { runnerVersion: "2.0.0" } })));
  assert.throws(() => validateRecord(validRecord({ staleness: { pluginVersion: "2.0.0" } })));
  assert.throws(() => validateRecord(validRecord({ staleness: { invalidatedBy: "manual" } })));
  assert.throws(() => validateRecord(validRecord({ staleness: { status: "stale", invalidatedBy: null }, evaluator: { outcome: "finding" } })));
});

test("refuses missing and unknown keys for every nested object", () => {
  const nestedKeys = ["candidate", "runner", "measurement", "observation", "evaluator", "staleness", "sanitization", "provenance"];
  for (const name of nestedKeys) {
    const missing = validRecord();
    delete missing[name][Object.keys(missing[name])[0]];
    assert.throws(() => validateRecord(missing), new RegExp(name));
    const unknown = validRecord();
    unknown[name].unexpected = true;
    assert.throws(() => validateRecord(unknown), new RegExp(name));
  }
});

test("refuses invalid values from every normative enum family", () => {
  for (const status of ["invalid"]) assert.throws(() => validateRecord(validRecord({ measurement: { status, values: [] } })));
  for (const layer of ["invalid"]) assert.throws(() => validateRecord(validRecord({ layer })));
  for (const surface of ["invalid"]) assert.throws(() => validateRecord(validRecord({ probeSurface: surface })));
  for (const observation of ["invalid"]) assert.throws(() => validateRecord(validRecord({ observation: { hookObservation: observation } })));
  for (const outcome of ["invalid"]) assert.throws(() => validateRecord(validRecord({ evaluator: { outcome } })));
});

test("sanitizes known credential, coordinate, path, transcript, and control shapes", () => {
  const posix = ["/", "workspace", "/project", "/private.txt"].join("");
  const windows = ["C:", "\\", "Users", "\\example\\private.txt"].join("");
  const unc = ["\\\\", "server", "\\share", "\\private.txt"].join("");
  const githubToken = ["gh", "p", "_", "x".repeat(20)].join("");
  const openAiToken = ["sk-", "x".repeat(8)].join("");
  const awsKey = ["AKIA", "A".repeat(16)].join("");
  const jwt = ["eyJ", "header", ".payload", ".signature"].join("");
  const pemBegin = ["-----", "BEGIN PRIVATE KEY", "-----"].join("");
  const pemEnd = ["-----", "END PRIVATE KEY", "-----"].join("");
  const unsafe = {
    paths: [posix, windows, unc],
    coordinates: [["https://", "forge.example.invalid", "/org/repo?q=secret#fragment"].join(""), ["git@forge.example.invalid:org/repo"].join("")],
    named: [
      ["authorization: Bearer ", "auth-sentinel"].join(""),
      [String.fromCharCode(97, 112, 105), "_key=api-sentinel"].join(""),
      ["access-token: access-sentinel"].join(""),
      ["refresh-token=refresh-sentinel"].join(""),
      ["client-secret: client-sentinel"].join(""),
      ["pwd quoted-sentinel"].join(""),
      ["cookie: cookie-sentinel"].join(""),
    ],
    bare: [githubToken, openAiToken, awsKey, jwt, ["Bearer ", "bare-bearer"].join(""), ["Basic ", "dXNlcjpwYXNz"].join("")],
    pem: [pemBegin, "pem-body-sentinel", pemEnd].join("\n"),
    transcript: ["assistant: assistant-sentinel", "user: user-sentinel", "system: system-sentinel", "tool: tool-sentinel"],
    controls: [String.fromCharCode(0), "control-sentinel", String.fromCharCode(10)].join(""),
    ordinary: ["fixture-basic", "__PIPELINE_MARKER_0__", "basic fixture", sha, "1.0.0", "2026-09-04T12:00:00.000Z", "forge.example.invalid", "line-a\nline-b\r\nline-c"],
  };
  const safe = sanitizeValue(unsafe);
  for (const raw of [posix, windows, unc, githubToken, openAiToken, awsKey, jwt, "assistant-sentinel", "user-sentinel", "system-sentinel", "tool-sentinel", "auth-sentinel", "api-sentinel", "access-sentinel", "refresh-sentinel", "client-sentinel", "quoted-sentinel", "cookie-sentinel", "pem-body-sentinel", "control-sentinel"]) {
    assert.equal(JSON.stringify(safe).includes(raw), false, `raw sentinel leaked: ${raw}`);
  }
  assert.equal(safe.paths.every((item) => item === "[REDACTED-PATH]"), true);
  assert.equal(safe.coordinates.every((item) => item === "[REDACTED-ORG-COORDINATE]"), true);
  assert.equal(safe.named.every((item) => item === "[REDACTED-CREDENTIAL]"), true);
  assert.equal(safe.bare.every((item) => item === "[REDACTED-CREDENTIAL]"), true);
  assert.match(safe.pem, /REDACTED-CREDENTIAL/);
  assert.equal(safe.transcript.every((item) => item === " [REDACTED-TRANSCRIPT]"), true);
  assert.match(safe.controls, /REDACTED-CONTROL/);
  assert.deepEqual(safe.ordinary, unsafe.ordinary);
  assert.deepEqual(sanitizeValue(safe), safe);
  const redactedRecord = sanitizeRecord(validRecord({ sanitization: { redactions: ["credential", "path"] } }));
  assert.equal(validateRecord(redactedRecord), true);
});
