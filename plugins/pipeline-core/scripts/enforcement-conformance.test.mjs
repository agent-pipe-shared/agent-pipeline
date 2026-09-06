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
  createProbeRequest,
  createRecordId,
  digestArtifactPreimage,
  digestProbeReceipt,
  runProbeMatrix,
  sanitizeRecord,
  sanitizeValue,
  validateRecord,
} from "./enforcement-conformance.mjs";

const sha = "a".repeat(64);
const oid = "b".repeat(40);

function observationsFor(probeSurfaces, overrides = {}) {
  return probeSurfaces.map((probeSurface, index) => ({
    probeSurface,
    hookObservation: index === 0 ? "fires" : "fires-not",
    evidenceKind: "deterministic-execution",
    exitCode: index + 2,
    markerSha256: sha,
    ...overrides[index],
  }));
}

function validRecord(overrides = {}) {
  const probeSurfaces = ["runner-hook/orchestrator", "runner-hook/subagent"];
  const record = {
    schema: "pipeline.enforcement-conformance.v1",
    recordId: "codex:runner-hook",
    candidate: { commit: oid, tree: oid, artifactSha256: sha },
    runner: { name: "codex", version: "1.0.0", pluginVersion: "0.6.1" },
    layer: "runner-hook",
    probeSurfaces,
    measurement: { status: "measured", values: [{ name: "duration", value: 1.5, unit: "ms" }] },
    observations: observationsFor(probeSurfaces),
    evaluator: { outcome: "pass", basis: "deterministic refusal", acceptanceSha256: null },
    staleness: { status: "current", runnerVersion: "1.0.0", pluginVersion: "0.6.1", invalidatedBy: null },
    sanitization: { policy: "redact-sensitive-shapes-v1", redactions: [] },
    provenance: { commandSha256: sha, fixtureIds: ["fixture-basic"], sourceSha256: sha },
    measuredAt: "2026-09-04T12:00:00.000Z",
  };
  return deepMerge(record, overrides);
}

function matrixAdapters({
  runner = { name: "codex", version: "1.0.0", pluginVersion: "0.6.1" },
  candidate = { commit: oid, tree: oid, artifactSha256: sha },
  execution = () => ({ status: "refused", exitCode: 2, evidenceKind: "deterministic-execution" }),
  marker = ({ receipt }) => ({ status: "covered", markerSha256: sha, receiptSha256: digestProbeReceipt(receipt) }),
} = {}) {
  const calls = { execution: [], markers: [], scratch: [] };
  return {
    calls,
    adapters: {
      runnerMetadata: { read: async () => typeof runner === "function" ? runner() : runner },
      gitBinding: { read: async () => typeof candidate === "function" ? candidate() : candidate },
      clock: { now: () => "2026-09-04T12:00:00.000Z" },
      execution: { execute: async (input) => { calls.execution.push(input); return execution(input); } },
      observationMarkers: { read: async (input) => { calls.markers.push(input); return marker(input); } },
      scratch: { allocate: async (input) => { calls.scratch.push(input); return { path: "scratch/a1-2-payload" }; } },
    },
  };
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

test("accepts a valid plural exact record and all approved enum families", () => {
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

test("keeps simulated fires and fires-not classifications raw per surface", () => {
  assert.equal(classifyHookObservation({ fired: true }), "fires");
  assert.equal(classifyHookObservation({ fired: false, markerAvailable: true }), "fires-not");
  assert.equal(classifyHookObservation({ fired: false, markerAvailable: false }), "unknown");
  const record = validRecord({ evaluator: { outcome: "finding" } });
  assert.equal(record.observations[0].hookObservation, "fires");
  assert.equal(record.observations[1].hookObservation, "fires-not");
  assert.equal(validateRecord(record), true);
});

test("refuses unavailable or unknown evidence for pass alongside model and self-attestation", () => {
  assert.equal(validateRecord(validRecord()), true);
  for (const evidenceKind of ["model-attestation", "self-attestation", "unavailable", "unknown"]) {
    assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 1: { evidenceKind } }) })));
  }
});

test("enforces record-level evaluator acceptance requirements", () => {
  assert.equal(validateRecord(validRecord()), true);
  assert.equal(validateRecord(validRecord({
    observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 1: { evidenceKind: "human-acceptance" } }),
    evaluator: { outcome: "pass", acceptanceSha256: sha },
  })), true);
  assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 1: { evidenceKind: "unavailable" } }), evaluator: { outcome: "excepted" } })));
  assert.throws(() => validateRecord(validRecord({ evaluator: { outcome: "excepted" } })));
  assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 1: { evidenceKind: "human-acceptance" } }), evaluator: { outcome: "excepted" } })));
  assert.equal(validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 1: { evidenceKind: "human-acceptance" } }), evaluator: { outcome: "excepted", acceptanceSha256: sha } })), true);
  assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 1: { evidenceKind: "human-acceptance" } }), evaluator: { outcome: "excepted", acceptanceSha256: "bad" } })));
  assert.throws(() => validateRecord(validRecord({ evaluator: { acceptanceSha256: sha } })));
  assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 1: { evidenceKind: "human-acceptance" } }) })));
  for (const evidenceKind of ["model-attestation", "self-attestation"]) {
    assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 1: { evidenceKind: "human-acceptance" }, 0: { evidenceKind } }), evaluator: { outcome: "excepted", acceptanceSha256: sha } })));
  }
});

test("requires canonical one-to-one plural surface correlation", () => {
  const surfaces = ["runner-hook/subagent", "payload-indirection"];
  assert.equal(validateRecord(validRecord({ probeSurfaces: surfaces, observations: observationsFor(surfaces) })), true);
  assert.throws(() => validateRecord(validRecord({ probeSurfaces: [] })));
  assert.throws(() => validateRecord(validRecord({ probeSurfaces: ["runner-hook/orchestrator", "runner-hook/orchestrator"] })));
  assert.throws(() => validateRecord(validRecord({ probeSurfaces: ["runner-hook/subagent", "runner-hook/orchestrator"], observations: observationsFor(["runner-hook/subagent", "runner-hook/orchestrator"]) })));
  assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator"]) })));
  assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent", "payload-indirection"]) })));
  assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/subagent", "runner-hook/orchestrator"]) })));
  const singular = validRecord();
  delete singular.probeSurfaces;
  delete singular.observations;
  singular.probeSurface = "runner-hook/orchestrator";
  singular.observation = observationsFor(["runner-hook/orchestrator"])[0];
  assert.throws(() => validateRecord(singular));
});

test("rejects candidate commit, tree, and artifact mismatches and version staleness", () => {
  const expected = { commit: oid, tree: oid, artifactSha256: sha, runnerVersion: "1.0.0", pluginVersion: "0.6.1", evidenceScope: "native" };
  const liveRecord = (changes = {}) => validRecord({ provenance: { fixtureIds: [] }, ...changes });
  assert.deepEqual(checkCandidateBinding(liveRecord(), expected), { qualifies: true, reason: null });
  for (const field of ["commit", "tree", "artifactSha256"]) {
    const candidate = { ...expected, [field]: field === "artifactSha256" ? "c".repeat(64) : "c".repeat(40) };
    assert.equal(checkCandidateBinding(liveRecord(), candidate).qualifies, false);
  }
  assert.equal(checkCandidateBinding(liveRecord({ evaluator: { outcome: "finding" } }), expected).reason, "evaluator-outcome-not-pass");
  assert.equal(checkCandidateBinding(liveRecord({ runner: { version: "2.0.0" }, staleness: { runnerVersion: "2.0.0" } }), expected).reason, "runner-or-plugin-version-mismatch");
  assert.equal(checkCandidateBinding(liveRecord({ staleness: { runnerVersion: "2.0.0" } }), expected).reason, "staleness-version-mismatch");
  assert.equal(checkCandidateBinding(liveRecord({ staleness: { status: "stale", invalidatedBy: "plugin-version" }, evaluator: { outcome: "finding" } }), expected).reason, "evaluator-outcome-not-pass");
});

test("requires coherent staleness versions and invalidation state", () => {
  assert.throws(() => validateRecord(validRecord({ staleness: { runnerVersion: "2.0.0" } })));
  assert.throws(() => validateRecord(validRecord({ staleness: { pluginVersion: "2.0.0" } })));
  assert.throws(() => validateRecord(validRecord({ staleness: { invalidatedBy: "manual" } })));
  assert.throws(() => validateRecord(validRecord({ staleness: { status: "stale", invalidatedBy: null }, evaluator: { outcome: "finding" } })));
});

test("refuses missing and unknown keys for every nested object", () => {
  const nestedKeys = ["candidate", "runner", "measurement", "evaluator", "staleness", "sanitization", "provenance"];
  for (const name of nestedKeys) {
    const missing = validRecord();
    delete missing[name][Object.keys(missing[name])[0]];
    assert.throws(() => validateRecord(missing), new RegExp(name));
    const unknown = validRecord();
    unknown[name].unexpected = true;
    assert.throws(() => validateRecord(unknown), new RegExp(name));
  }
  const missingObservationKey = validRecord();
  delete missingObservationKey.observations[0].hookObservation;
  assert.throws(() => validateRecord(missingObservationKey), /observations/);
  const unknownObservationKey = validRecord();
  unknownObservationKey.observations[0].unexpected = true;
  assert.throws(() => validateRecord(unknownObservationKey), /observations/);
});

test("refuses invalid values from every normative enum family", () => {
  for (const status of ["invalid"]) assert.throws(() => validateRecord(validRecord({ measurement: { status, values: [] } })));
  for (const layer of ["invalid"]) assert.throws(() => validateRecord(validRecord({ layer })));
  for (const surface of ["invalid"]) assert.throws(() => validateRecord(validRecord({ probeSurfaces: [surface] })));
  for (const observation of ["invalid"]) assert.throws(() => validateRecord(validRecord({ observations: observationsFor(["runner-hook/orchestrator", "runner-hook/subagent"], { 0: { hookObservation: observation } }) })));
  for (const outcome of ["invalid"]) assert.throws(() => validateRecord(validRecord({ evaluator: { outcome } })));
});

test("runs the injected four-surface matrix with correlated requests, receipts, and payload scratch", async () => {
  const hostile = ["/", "private", "/", "stdout"].join("");
  const { adapters, calls } = matrixAdapters({
    execution: ({ request, scratch }) => ({
      status: request.probeSurface === "payload-indirection" ? "allowed" : "refused",
      exitCode: request.probeSurface === "payload-indirection" ? 0 : 2,
      stdout: `${hostile} token=do-not-emit`,
      scratch,
    }),
  });
  const record = await runProbeMatrix({ adapters, surfaces: [...PROBE_SURFACES].reverse(), fixtureIds: { "payload-indirection": hostile } });
  assert.deepEqual(record.probeSurfaces, PROBE_SURFACES);
  assert.equal(record.observations.every((observation) => observation.hookObservation === "fires"), true);
  assert.equal(record.evaluator.outcome, "unavailable");
  assert.equal(record.provenance.fixtureIds.length, PROBE_SURFACES.length);
  assert.equal(JSON.stringify(record).includes(hostile), false);
  assert.equal(record.provenance.fixtureIds.includes("[REDACTED-PATH]"), true);
  assert.equal(calls.execution.length, PROBE_SURFACES.length);
  assert.equal(calls.markers.length, PROBE_SURFACES.length);
  assert.equal(calls.scratch.length, 1);
  assert.equal(calls.scratch[0].request.probeSurface, "payload-indirection");
  assert.equal(calls.execution.find((call) => call.request.probeSurface === "git-hook").request.commandId, "guarded-push-refusal");
  for (const [index, call] of calls.markers.entries()) {
    assert.equal(call.request.probeSurface, PROBE_SURFACES[index]);
    assert.equal(call.receipt.probeSurface, PROBE_SURFACES[index]);
    assert.deepEqual(call.receipt.candidate, record.candidate);
    assert.deepEqual(call.receipt.runner, record.runner);
    assert.equal(call.receipt.layer, record.layer);
  }
  assert.equal(checkCandidateBinding(record, { ...record.candidate, runnerVersion: "1.0.0", pluginVersion: "0.6.1" }).reason, "evaluator-outcome-not-pass");
});

test("marker coverage distinguishes fires, fires-not, unknown, unavailable, and unsupported without claiming live enforcement", async () => {
  const positive = matrixAdapters();
  const live = await runProbeMatrix({ adapters: positive.adapters, evidenceScope: "native" });
  assert.equal(live.observations.every((observation) => observation.hookObservation === "fires"), true);
  assert.equal(live.evaluator.outcome, "unavailable");
  assert.equal(checkCandidateBinding(live, { ...live.candidate, runnerVersion: "1.0.0", pluginVersion: "0.6.1" }).reason, "evaluator-outcome-not-pass");

  const missingMarker = matrixAdapters({ marker: ({ receipt }) => ({ status: "covered", markerSha256: null, receiptSha256: digestProbeReceipt(receipt) }) });
  const missing = await runProbeMatrix({ adapters: missingMarker.adapters, evidenceScope: "native" });
  assert.equal(missing.observations[0].hookObservation, "fires-not");
  assert.equal(missing.evaluator.outcome, "finding");

  const allowed = matrixAdapters({ execution: () => ({ status: "allowed", exitCode: 0, evidenceKind: "deterministic-execution" }) });
  assert.equal((await runProbeMatrix({ adapters: allowed.adapters, evidenceScope: "native" })).evaluator.outcome, "finding");

  const unknownMarker = matrixAdapters({ marker: () => ({ status: "unknown", markerSha256: null }) });
  assert.equal((await runProbeMatrix({ adapters: unknownMarker.adapters, evidenceScope: "native" })).evaluator.outcome, "unknown");

  const unavailableAdapter = matrixAdapters({ execution: () => ({ status: "unavailable", exitCode: null }), marker: () => ({ status: "unavailable", markerSha256: null }) });
  assert.equal((await runProbeMatrix({ adapters: unavailableAdapter.adapters, evidenceScope: "native" })).evaluator.outcome, "unavailable");

  const unsupportedAdapter = matrixAdapters({ execution: () => ({ status: "unsupported", exitCode: null }), marker: () => ({ status: "unavailable", markerSha256: null }) });
  assert.equal((await runProbeMatrix({ adapters: unsupportedAdapter.adapters, evidenceScope: "native" })).evaluator.outcome, "unsupported");

  const selfAttestation = matrixAdapters({ execution: () => ({ status: "refused", exitCode: 2, evidenceKind: "self-attestation" }) });
  const selfRecord = await runProbeMatrix({ adapters: selfAttestation.adapters, evidenceScope: "native" });
  assert.equal(selfRecord.observations[0].evidenceKind, "self-attestation");
  assert.equal(selfRecord.evaluator.outcome, "unavailable");
});

test("execution errors cannot be promoted by exit codes or prose alone", async () => {
  const { adapters } = matrixAdapters({ execution: () => { throw new Error("fixture error"); }, marker: () => ({ status: "unavailable", markerSha256: null }) });
  const record = await runProbeMatrix({ adapters, evidenceScope: "native" });
  assert.equal(record.observations.every((observation) => observation.exitCode === null), true);
  assert.equal(record.observations.every((observation) => observation.hookObservation === "unknown"), true);
  assert.equal(record.evaluator.outcome, "unavailable");
});

test("marker evidence must bind the exact receipt and a changing candidate becomes stale", async () => {
  const mismatchedMarker = matrixAdapters({ marker: () => ({ status: "covered", markerSha256: sha, receiptSha256: "c".repeat(64) }) });
  const mismatch = await runProbeMatrix({ adapters: mismatchedMarker.adapters, evidenceScope: "native" });
  assert.equal(mismatch.observations[0].hookObservation, "unknown");
  assert.equal(mismatch.evaluator.outcome, "unknown");

  let candidateReads = 0;
  const changingCandidate = matrixAdapters({ candidate: () => {
    candidateReads += 1;
    return candidateReads === 1
      ? { commit: oid, tree: oid, artifactSha256: sha }
      : { commit: "c".repeat(40), tree: "c".repeat(40), artifactSha256: "c".repeat(64) };
  } });
  const stale = await runProbeMatrix({ adapters: changingCandidate.adapters });
  assert.equal(stale.staleness.status, "stale");
  assert.equal(stale.staleness.invalidatedBy, "candidate-binding-changed-during-probe");
  assert.equal(stale.candidate.commit, oid);
  assert.equal(stale.candidate.artifactSha256, sha);
  assert.equal(stale.provenance.sourceSha256, sha);
  assert.equal(checkCandidateBinding(stale, { ...stale.candidate, runnerVersion: "1.0.0", pluginVersion: "0.6.1" }).qualifies, false);

  let runnerReads = 0;
  const changingRunner = matrixAdapters({ runner: () => {
    runnerReads += 1;
    return runnerReads === 1
      ? { name: "codex", version: "1.0.0", pluginVersion: "0.6.1" }
      : { name: "codex", version: "2.0.0", pluginVersion: "0.6.1" };
  } });
  const runnerStale = await runProbeMatrix({ adapters: changingRunner.adapters });
  assert.equal(runnerStale.runner.version, "1.0.0");
  assert.equal(runnerStale.staleness.runnerVersion, "2.0.0");
  assert.equal(runnerStale.staleness.status, "stale");
});

test("probe requests bind candidate and runner while artifact digests exclude generated records", () => {
  const candidate = { commit: oid, tree: oid, artifactSha256: sha };
  const runner = { name: "codex", version: "1.0.0", pluginVersion: "0.6.1" };
  const request = createProbeRequest({ candidate, runner, layer: "runner-hook", probeSurface: "runner-hook/subagent", fixtureId: "subagent-fixture" });
  assert.equal(Object.isFrozen(request), true);
  assert.deepEqual(request.candidate, candidate);
  assert.deepEqual(request.runner, runner);
  const first = digestArtifactPreimage([{ path: "plugins/pipeline-core/scripts/enforcement-conformance.mjs", bytes: "module-bytes" }]);
  const second = digestArtifactPreimage([{ path: "plugins/pipeline-core/scripts/enforcement-conformance.mjs", bytes: "changed-module-bytes" }]);
  const nulDelimitedA = digestArtifactPreimage([{ path: "a", bytes: "b\u0000c" }]);
  const nulDelimitedB = digestArtifactPreimage([{ path: "a", bytes: "b" }]);
  assert.notEqual(first, second);
  assert.notEqual(nulDelimitedA, nulDelimitedB);
  assert.throws(() => digestArtifactPreimage([{ path: "../record.json", bytes: "generated-record-must-not-be-hashed" }]));
  assert.throws(() => digestArtifactPreimage([{ path: "C:/private/record.json", bytes: "generated-record-must-not-be-hashed" }]));
  assert.throws(() => digestArtifactPreimage([{ path: "a\u0000b", bytes: "generated-record-must-not-be-hashed" }]));
  assert.throws(() => digestArtifactPreimage([{ path: "..\\record.json", bytes: "generated-record-must-not-be-hashed" }]));
  assert.throws(() => digestArtifactPreimage([{ path: "\\\\host\\share\\record.json", bytes: "generated-record-must-not-be-hashed" }]));
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
