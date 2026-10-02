// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import assert from "node:assert/strict";
import { parseAntigravityRawCoverage, createAntigravityFamilyAdapter } from "./model-family-antigravity-adapter.mjs";
import { createModelFamilyDiscoveryHost } from "./model-family-discovery.mjs";
completionCases.push({ id: "MFAGA" + String(completionCases.length + 1).padStart(3, "0"), name: "Antigravity two columns retain exact IDs/labels but completeness/order/effort stay unknown", run: () => {
  const r = parseAntigravityRawCoverage({ source: "synthetic-fixture-only", pages: [{ request: { argv: ["models"] }, responseBytes: "opaque_id_A Display name A\nopaque_id_B Display name B\n" }] });
  assert.equal(r.ok, true); assert.deepEqual(r.value.entries.map((e) => e.modelId), ["opaque_id_A", "opaque_id_B"]);
  assert.equal(r.value.entries[0].displayName, "Display name A");
  assert.equal(r.value.completeness, "unknown"); assert.equal(r.value.order, "unknown"); assert.equal(r.value.effort, "unknown");
} });
completionCases.push({ id: "MFAGA" + String(completionCases.length + 1).padStart(3, "0"), name: "Antigravity has no Argon/number/date/name heuristic or completeness assertion", run: () => {
  const host = createModelFamilyDiscoveryHost(), adapter = createAntigravityFamilyAdapter(host);
  assert.equal(adapter.verifyCoverage({ admitted: true }, {}, {}).code, "HOST_HANDLE_REQUIRED");
  assert.equal(parseAntigravityRawCoverage({ pages: [{ request: { argv: ["models"] }, responseBytes: "single-column-id\n" }] }).code, "AGY_CATALOGUE_SHAPE_UNKNOWN");
  assert.equal(parseAntigravityRawCoverage({ pages: [{ request: { argv: ["models", "--complete"] }, responseBytes: "opaque Display" }] }).code, "AGY_CATALOGUE_SOURCE_INVALID");
} });

completionCases.push({ id: "MFAGA" + String(completionCases.length + 1).padStart(3, "0"), name: "Antigravity main-session source port is distinct and absent defaults fail closed", run: async () => {
  const adapter = createAntigravityFamilyAdapter({});
  assert.equal(typeof adapter.launchMainFromDriverContext, "function");
  assert.deepEqual(await adapter.launchMainFromDriverContext(Object.freeze(Object.create(null))),
    { ok: false, code: "MAIN_PRELAUNCH_UNQUALIFIED", retryable: false });
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
