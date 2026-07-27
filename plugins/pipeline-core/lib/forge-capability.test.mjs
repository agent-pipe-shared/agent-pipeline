#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FORGE_CAPABILITY_IDS,
  FORGE_CAPABILITY_SCHEMA,
  forgeCapabilityDigest,
  hasObservedReadOnlyCapability,
  mapGitHubForgeObservation,
  sealForgeCapabilityReport,
  validateForgeCapabilityReport,
} from "./forge-capability.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const clone = (value) => structuredClone(value);
const evidence = (kind, digest = A) => ({ kind, path: null, fileSha256: digest, recordSha256: null });

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}

function githubInput() {
  const observed = { mode: "native", status: "observed", evidence: [evidence("synthetic-readback")] };
  const unavailable = { mode: "unavailable", status: "unavailable", evidence: [] };
  return {
    reportId: "github-neutral-map-01",
    baseUrlClass: "github-com",
    projectCoordinatesSha256: B,
    authenticationMode: "operator-local",
    observations: {
      actionsJobsRead: observed,
      actionsPipelinesRead: observed,
      actionsPipelinesRetry: unavailable,
      branchProtectionRead: observed,
      issuesRead: observed,
      issuesWrite: { mode: "manual", status: "not-observed", evidence: [] },
      pullRequestsRead: observed,
      pullRequestsWrite: unavailable,
    },
    governance: [
      { controlId: "approval-policy", mode: "native", status: "observed", tier: "advanced", evidence: [evidence("synthetic-governance", C)] },
    ],
    evidence: [evidence("synthetic-report", B)],
  };
}

const report = mapGitHubForgeObservation(githubInput());

check("B4F01 seals the exact provider-neutral root and digest", () => {
  assert.equal(report.schema, FORGE_CAPABILITY_SCHEMA);
  assert.deepEqual(Object.keys(report), [
    "schema", "reportId", "provider", "baseUrlClass", "projectCoordinatesSha256",
    "authenticationMode", "cells", "governance", "evidence", "recordSha256",
  ]);
  assert.equal(forgeCapabilityDigest(report), report.recordSha256);
  assert.deepEqual(validateForgeCapabilityReport(report), { ok: true, code: null });
  assert.equal(Object.isFrozen(report), true);
});

check("B4F02 Git VCS is absent from the hosting capability root", () => {
  assert.equal(Object.hasOwn(report, "vcs"), false);
  assert.equal(JSON.stringify(report).includes('"git"'), false);
});

check("B4F03 GitHub extension terms map to neutral capability IDs", () => {
  assert.deepEqual(report.cells.map((cell) => cell.capabilityId), [
    "branch-protection.observe",
    "change-request.mutate",
    "change-request.read",
    "ci.job.read",
    "ci.pipeline.mutate",
    "ci.pipeline.read",
    "issue.mutate",
    "issue.read",
  ]);
  assert.doesNotMatch(JSON.stringify(report.cells), /pull|actions|github/iu);
});

check("B4F04 all root omissions and additions fail closed", () => {
  for (const key of Object.keys(report)) {
    const value = clone(report);
    delete value[key];
    assert.equal(validateForgeCapabilityReport(value).ok, false, key);
  }
  assert.match(validateForgeCapabilityReport({ ...clone(report), token: "secret" }).code, /^SHAPE:/u);
});

check("B4F05 provider and base URL class cannot drift", () => {
  const value = clone(report);
  value.baseUrlClass = "gitlab-com";
  value.recordSha256 = forgeCapabilityDigest(value);
  assert.match(validateForgeCapabilityReport(value).code, /^BOUND:/u);
});

check("B4F06 cells and governance observations are sorted and unique", () => {
  const cells = clone(report);
  cells.cells.reverse();
  cells.recordSha256 = forgeCapabilityDigest(cells);
  assert.match(validateForgeCapabilityReport(cells).code, /^BOUND:/u);
  const governance = clone(report);
  governance.governance.push(clone(governance.governance[0]));
  governance.recordSha256 = forgeCapabilityDigest(governance);
  assert.match(validateForgeCapabilityReport(governance).code, /^BOUND:/u);
});

check("B4F07 unsupported and unavailable cells remain explicit", () => {
  const unsupported = clone(report);
  unsupported.cells.find((cell) => cell.capabilityId === "issue.mutate").mode = "unsupported";
  unsupported.cells.find((cell) => cell.capabilityId === "issue.mutate").status = "unsupported";
  unsupported.recordSha256 = forgeCapabilityDigest(unsupported);
  assert.deepEqual(validateForgeCapabilityReport(unsupported), { ok: true, code: null });
  const weaker = clone(unsupported);
  weaker.cells.find((cell) => cell.capabilityId === "issue.mutate").status = "observed";
  weaker.recordSha256 = forgeCapabilityDigest(weaker);
  assert.match(validateForgeCapabilityReport(weaker).code, /^BOUND:/u);
});

check("B4F08 observed claims require evidence", () => {
  const value = clone(report);
  value.cells.find((cell) => cell.capabilityId === "issue.read").evidence = [];
  value.recordSha256 = forgeCapabilityDigest(value);
  assert.match(validateForgeCapabilityReport(value).code, /^BOUND:/u);
});

check("B4F09 live read-only eligibility is honest and never inferred from writes", () => {
  assert.equal(hasObservedReadOnlyCapability(report), true);
  const value = clone(report);
  for (const cell of value.cells) {
    if (cell.capabilityId.endsWith(".read") || cell.capabilityId.endsWith(".observe")) {
      cell.mode = "unavailable";
      cell.status = "unavailable";
      cell.evidence = [];
    }
  }
  value.recordSha256 = forgeCapabilityDigest(value);
  assert.equal(hasObservedReadOnlyCapability(value), false);
});

check("B4F10 raw provider or private-host fields cannot enter cells or governance", () => {
  const cell = clone(report);
  cell.cells[0].mergeRequestId = 7;
  cell.recordSha256 = forgeCapabilityDigest(cell);
  assert.match(validateForgeCapabilityReport(cell).code, /^BOUND:/u);
  const governance = clone(report);
  governance.governance[0].rawTierPayload = {};
  governance.recordSha256 = forgeCapabilityDigest(governance);
  assert.match(validateForgeCapabilityReport(governance).code, /^BOUND:/u);
});

check("B4F10b evidence paths are bounded repository-relative POSIX files", () => {
  for (const path of [
    "/etc/passwd",
    "../private.json",
    "evidence/../private.json",
    "C:\\private\\receipt.json",
    "evidence//receipt.json",
    "evidence/",
    `evidence/${"a".repeat(505)}.json`,
  ]) {
    const value = clone(report);
    value.evidence[0].path = path;
    value.recordSha256 = forgeCapabilityDigest(value);
    assert.match(validateForgeCapabilityReport(value).code, /^BOUND:/u, path);
  }
  const value = clone(report);
  value.evidence[0].path = "evidence/forge/readback.json";
  value.recordSha256 = forgeCapabilityDigest(value);
  assert.deepEqual(validateForgeCapabilityReport(value), { ok: true, code: null });
});

check("B4F11 the digest binds target, auth, cells, governance and evidence", () => {
  for (const mutate of [
    (value) => { value.projectCoordinatesSha256 = C; },
    (value) => { value.authenticationMode = "none"; },
    (value) => { value.cells[0].mode = "emulated"; },
    (value) => { value.governance[0].tier = "enterprise"; },
    (value) => { value.evidence[0].fileSha256 = C; },
  ]) {
    const value = clone(report);
    mutate(value);
    assert.match(validateForgeCapabilityReport(value).code, /^CONFLICT:/u);
  }
});

check("B4F12 GitHub mapping input is exact and cannot carry credentials", () => {
  assert.throws(() => mapGitHubForgeObservation({ ...githubInput(), token: "not-allowed" }), /^Error: SHAPE:/u);
  const value = githubInput();
  delete value.observations.issuesRead;
  assert.throws(() => mapGitHubForgeObservation(value), /^Error: SHAPE:/u);
});

check("B4F13 schema root and enum stay aligned with runtime", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/forge-capability.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$id, FORGE_CAPABILITY_SCHEMA);
  assert.deepEqual(schema.required, Object.keys(report));
  assert.deepEqual(schema.$defs.cell.properties.capabilityId.enum, FORGE_CAPABILITY_IDS);
  assert.match("evidence/forge/readback.json", new RegExp(schema.$defs.path.pattern, "u"));
  assert.doesNotMatch("../private.json", new RegExp(schema.$defs.path.pattern, "u"));
  assert.equal(schema.allOf.length, 2);
  assert.equal(schema.$defs.cell.allOf.length, 4);
});

check("B4F14 a direct GitLab report uses only its valid base URL classes", () => {
  const draft = {
    reportId: "gitlab-neutral-01",
    provider: "gitlab",
    baseUrlClass: "self-managed",
    projectCoordinatesSha256: A,
    authenticationMode: "unavailable",
    cells: [{ capabilityId: "issue.read", mode: "unavailable", status: "unavailable", evidence: [] }],
    governance: [],
    evidence: [],
  };
  assert.deepEqual(validateForgeCapabilityReport(sealForgeCapabilityReport(draft)), { ok: true, code: null });
  assert.throws(() => sealForgeCapabilityReport({ ...draft, baseUrlClass: "github-com" }), /^Error: BOUND:/u);
});

console.log(`\nforge-capability: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
