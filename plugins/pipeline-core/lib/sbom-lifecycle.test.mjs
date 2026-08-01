// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { evaluateSbomLifecycle, SBOM_LIFECYCLE_CODES } from "./sbom-manifest.mjs";

let passed = 0;
function test(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
const complete = Object.freeze({ applicability: "applicable", availability: "available", support: "supported", record: "present", candidateMatches: true, sourceInputsMatch: true, completeness: "complete" });
const withFacts = (changes) => ({ ...complete, ...changes });

test("returns the one release-eligible complete result", () => assert.deepEqual(evaluateSbomLifecycle(complete), { state: "complete", code: SBOM_LIFECYCLE_CODES.complete }));
test("keeps candidate and source-input staleness distinct", () => { assert.deepEqual(evaluateSbomLifecycle(withFacts({ candidateMatches: false })), { state: "stale", code: SBOM_LIFECYCLE_CODES.candidateStale }); assert.deepEqual(evaluateSbomLifecycle(withFacts({ sourceInputsMatch: false })), { state: "stale", code: SBOM_LIFECYCLE_CODES.sourceInputsStale }); });
test("classifies invalid, partial, unsupported and unavailable independently", () => { assert.deepEqual(evaluateSbomLifecycle(withFacts({ record: "invalid" })), { state: "invalid", code: SBOM_LIFECYCLE_CODES.invalidRecord }); assert.deepEqual(evaluateSbomLifecycle(withFacts({ completeness: "partial" })), { state: "partial", code: SBOM_LIFECYCLE_CODES.partial }); assert.deepEqual(evaluateSbomLifecycle(withFacts({ support: "unsupported" })), { state: "unsupported", code: SBOM_LIFECYCLE_CODES.unsupported }); assert.deepEqual(evaluateSbomLifecycle(withFacts({ availability: "unavailable" })), { state: "unavailable", code: SBOM_LIFECYCLE_CODES.unavailable }); });
test("missing inventory is unavailable, never an implicit exemption", () => assert.deepEqual(evaluateSbomLifecycle(withFacts({ record: "missing" })), { state: "unavailable", code: SBOM_LIFECYCLE_CODES.missing }));
test("closed not-applicable decision remains distinct", () => assert.deepEqual(evaluateSbomLifecycle(withFacts({ applicability: "not-applicable" })), { state: "not-applicable", code: SBOM_LIFECYCLE_CODES.notApplicable }));
test("malformed facts fail closed and inputs remain unchanged", () => { const input = Object.freeze({ ...complete }); assert.deepEqual(evaluateSbomLifecycle({ ...input, unknown: true }), { state: "invalid", code: SBOM_LIFECYCLE_CODES.invalidFacts }); assert.deepEqual(input, complete); });
console.log(`\n${passed} passed`);
