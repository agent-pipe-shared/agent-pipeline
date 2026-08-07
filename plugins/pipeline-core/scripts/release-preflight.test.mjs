#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ReleasePreflightError,
  createReleasePreflight,
  validateReleasePreflight,
} from "./release-preflight.mjs";

const h = (char) => char.repeat(64);
const oid = (char) => char.repeat(40);
const gates = () => ({
  gg03: { required: true, binding: { schema: "pipeline.gg-03-binding.v1", operation: "protected-main-fast-forward", candidateCommit: oid("c"), candidateTree: oid("d"), authoritySha256: h("e"), evidenceSha256: h("f") } },
  inventory: [
    { id: "verify", kind: "local-final", status: "pending" }, { id: "security", kind: "local-final", status: "pending" }, { id: "critic", kind: "local-final", status: "pending" },
    { id: "remote", kind: "external", status: "pending" }, { id: "human", kind: "external", status: "pending" },
  ],
});
function fixture() {
  const documentation = {
    prd: { path: "specs/nova/prd.md", sha256: h("1") }, spec: { path: "specs/nova/spec.md", sha256: h("2") },
    acceptance: { path: "specs/nova/acceptance.md", sha256: h("3") }, result: { path: "specs/nova/result.md", sha256: h("4") },
  };
  return {
    preflightId: "nova-a-0.4.3", candidate: { commit: oid("c"), tree: oid("d") }, base: { commit: oid("a"), tree: oid("b") },
    version: { decisionId: h("5"), decisionSha256: h("6"), targetVersion: "0.4.3", candidateVersion: "0.4.3" },
    repository: { headCommit: oid("c"), headTree: oid("d"), clean: true }, documentation,
    lifecycle: { featureId: "sprint-nova-epic", manifestPath: "specs/nova/lifecycle.json", manifestSha256: h("7"), status: "prepared" },
    retention: { policySha256: h("8"), records: Object.values(documentation).map((document) => ({ path: document.path, classification: "public", retentionClass: "active", archiveDigest: null, archiveProvenanceSha256: null })).sort((left, right) => left.path.localeCompare(right.path)) },
    consent: { decisionId: h("9"), status: "approved", authoritySha256: h("a"), evaluatedAt: "2026-07-25T10:00:00.000Z", expiresAt: "2026-08-25T10:00:00.000Z" },
    gates: gates(),
    extensions: { schema: "pipeline.release-preflight-extension-input.v1", status: "none", registrySha256: null, requirements: [] },
  };
}
const cases = [
  ["schema closes every release-preflight nested object and bounds conditional collections", () => {
    const schema = JSON.parse(readFileSync(new URL("./release-preflight.schema.json", import.meta.url), "utf8"));
    assert.equal(schema.additionalProperties, false);
    for (const definition of ["candidate", "versionDecision", "repository", "document", "documentation", "lifecycle", "retentionRecord", "retentionSection", "consent", "gg03Binding", "gg03", "gate", "gates", "extensionRequirement", "extensions"]) assert.equal(schema.$defs[definition].additionalProperties, false, definition);
    assert.equal(schema.$defs.retentionSection.properties.records.minItems, 4);
    assert.equal(schema.$defs.retentionSection.properties.records.maxItems, 4);
    assert.equal(schema.$defs.gates.properties.inventory.prefixItems.length, 5);
    assert.equal(schema.$defs.extensions.properties.requirements.maxItems, 256);
    assert.equal(schema.$defs.gg03.allOf.length, 1);
  }],
  ["A56-1 prepared 0.4.x candidate is only eligible to begin final gates", () => {
    const result = createReleasePreflight(fixture());
    assert.equal(result.status, "ready"); assert.deepEqual(result.reasons, []); assert.equal(result.gates.inventory.every((gate) => gate.status === "pending"), true);
    assert.equal(validateReleasePreflight(result), true);
  }],
  ["A56-2 version drift blocks before any final-gate claim", () => {
    const input = fixture(); input.version.candidateVersion = "0.4.2";
    const result = createReleasePreflight(input); assert.equal(result.status, "blocked"); assert.deepEqual(result.reasons, ["version-decision-mismatch"]);
  }],
  ["A56-2 candidate and repository drift are deterministic blockers", () => {
    const input = fixture(); input.repository.headTree = oid("e"); input.repository.clean = false;
    const result = createReleasePreflight(input); assert.deepEqual(result.reasons, ["candidate-repository-drift", "repository-not-clean"]);
  }],
  ["A56-3 remote and human gates remain external pending inventory entries", () => {
    const result = createReleasePreflight(fixture());
    assert.deepEqual(result.gates.inventory.slice(-2), [{ id: "remote", kind: "external", status: "pending" }, { id: "human", kind: "external", status: "pending" }]);
  }],
  ["A56-3 rejects reordered, completed, duplicated, or extra final-gate inventory", () => {
    for (const mutate of [
      (input) => { [input.gates.inventory[0], input.gates.inventory[1]] = [input.gates.inventory[1], input.gates.inventory[0]]; },
      (input) => { input.gates.inventory[0].status = "passed"; },
      (input) => { input.gates.inventory[1].id = "verify"; },
      (input) => { input.gates.inventory.push({ id: "remote", kind: "external", status: "pending" }); },
    ]) {
      const input = fixture(); mutate(input);
      assert.throws(() => createReleasePreflight(input), (error) => error instanceof ReleasePreflightError && error.code === "RPF-GATES");
    }
  }],
  ["A56-4 valid GG-03 binding reaches normal evidence-ready evaluation", () => {
    const result = createReleasePreflight(fixture()); assert.equal(result.status, "ready");
  }],
  ["A56-4 missing GG-03 binding rejects the closed contract", () => {
    const input = fixture(); input.gates.gg03.binding = null;
    assert.throws(() => createReleasePreflight(input), (error) => error instanceof ReleasePreflightError && error.code === "RPF-SHAPE");
  }],
  ["A56-4 unrequired GG-03 rejects a stale binding instead of silently carrying it", () => {
    const input = fixture(); input.gates.gg03.required = false;
    assert.throws(() => createReleasePreflight(input), (error) => error instanceof ReleasePreflightError && error.code === "RPF-GG03");
  }],
  ["A56-4 mismatched GG-03 candidate is a local blocker", () => {
    const input = fixture(); input.gates.gg03.binding.candidateTree = oid("e");
    const result = createReleasePreflight(input); assert.deepEqual(result.reasons, ["gg03-candidate-mismatch"]);
  }],
  ["A56-4 ambiguous GG-03 command-shaped extras are rejected", () => {
    const input = fixture(); input.gates.gg03.binding.command = "git push";
    assert.throws(() => createReleasePreflight(input), (error) => error instanceof ReleasePreflightError && error.code === "RPF-SHAPE");
  }],
  ["A56-5 later Cyborg extension registration admits opaque accepted requirement digests", () => {
    const input = fixture(); input.extensions = { schema: "pipeline.release-preflight-extension-input.v1", status: "registered", registrySha256: h("b"), requirements: [{ id: "cyborg.release-39", sha256: h("c"), status: "accepted" }] };
    const result = createReleasePreflight(input); assert.equal(result.status, "ready"); assert.equal(result.extensions.requirements[0].id, "cyborg.release-39");
  }],
  ["A56-5 rejects unordered or unpublished extension payload fields", () => {
    const input = fixture(); input.extensions = { schema: "pipeline.release-preflight-extension-input.v1", status: "registered", registrySha256: h("b"), requirements: [{ id: "z", sha256: h("c"), status: "accepted" }, { id: "a", sha256: h("d"), status: "accepted" }] };
    assert.throws(() => createReleasePreflight(input), (error) => error instanceof ReleasePreflightError && error.code === "RPF-EXTENSION");
  }],
  ["A56-5 rejects an oversized registered extension set", () => {
    const input = fixture();
    input.extensions = { schema: "pipeline.release-preflight-extension-input.v1", status: "registered", registrySha256: h("b"), requirements: Array.from({ length: 257 }, (_, index) => ({ id: `r-${String(index).padStart(3, "0")}`, sha256: h("c"), status: "accepted" })) };
    assert.throws(() => createReleasePreflight(input), (error) => error instanceof ReleasePreflightError && error.code === "RPF-EXTENSION");
  }],
  ["A56-6 missing lifecycle manifest, retention archive provenance, classification, and bounded consent readback reject input", () => {
    for (const mutate of [
      (input) => { delete input.lifecycle.manifestSha256; },
      (input) => { input.retention.records[0] = { ...input.retention.records[0], retentionClass: "archive", archiveDigest: h("d"), archiveProvenanceSha256: null }; },
      (input) => { input.retention.records[0].classification = "internal"; },
      (input) => { input.consent = { decisionId: h("9"), status: "approved", authoritySha256: h("a"), evaluatedAt: "2026-07-25T10:00:00.000Z" }; },
    ]) { const input = fixture(); mutate(input); assert.throws(() => createReleasePreflight(input), ReleasePreflightError); }
  }],
  ["A56-6 rejects path traversal, duplicate documentation destinations, unordered retention, and reversed consent bounds", () => {
    for (const [code, mutate] of [
      ["RPF-PATH", (input) => { input.documentation.prd.path = "specs/../private.md"; }],
      ["RPF-DOCUMENTATION", (input) => { input.documentation.prd.path = input.documentation.spec.path; }],
      ["RPF-RETENTION", (input) => { [input.retention.records[0], input.retention.records[1]] = [input.retention.records[1], input.retention.records[0]]; }],
      ["RPF-CONSENT", (input) => { input.consent.expiresAt = "2026-06-25T10:00:00.000Z"; }],
    ]) {
      const input = fixture(); mutate(input);
      assert.throws(() => createReleasePreflight(input), (error) => error instanceof ReleasePreflightError && error.code === code);
    }
  }],
  ["declined but bounded consent is represented as a blocker without its raw text", () => {
    const input = fixture(); input.consent.status = "declined";
    const result = createReleasePreflight(input); assert.deepEqual(result.reasons, ["consent-not-approved"]); assert.equal(JSON.stringify(result).includes("raw"), false);
  }],
  ["record integrity rejects a status or digest that is not derived from closed inputs", () => {
    const result = createReleasePreflight(fixture());
    assert.throws(() => validateReleasePreflight({ ...result, status: "blocked" }), (error) => error instanceof ReleasePreflightError && error.code === "RPF-STATUS");
    assert.throws(() => validateReleasePreflight({ ...result, reasons: ["not-public-safe"] }), (error) => error instanceof ReleasePreflightError && error.code === "RPF-STATUS");
    assert.throws(() => validateReleasePreflight({ ...result, recordSha256: "invalid" }), (error) => error instanceof ReleasePreflightError && error.code === "RPF-HASH");
    assert.throws(() => validateReleasePreflight({ ...result, recordSha256: h("0") }), (error) => error instanceof ReleasePreflightError && error.code === "RPF-HASH");
  }],
];
let passed = 0;
for (const [name, run] of cases) {
  try { run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`${passed}/${cases.length} cases passed.`);
if (passed !== cases.length) process.exitCode = 1;
