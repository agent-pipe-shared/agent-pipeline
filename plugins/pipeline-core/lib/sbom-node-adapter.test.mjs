// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { generateNodeSbom, NODE_GRAPH_SCHEMA, validateNodeDependencyGraph } from "./sbom-node-adapter.mjs";
let passed = 0;
function test(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
const graph = { schema: NODE_GRAPH_SCHEMA, components: [{ id: "pkg:npm/app@1.0.0", scope: "apps/app", name: "app", version: "1.0.0", dependencies: ["pkg:npm/left-pad@1.3.0"] }, { id: "pkg:npm/left-pad@1.3.0", scope: "packages/shared", name: "left-pad", version: "1.3.0", dependencies: [] }] };
test("single/multi-scope graph yields both pinned views deterministically", () => { const first = generateNodeSbom(graph); const second = generateNodeSbom({ ...graph, components: [...graph.components].reverse() }); assert.equal(first.valid, true); assert.deepEqual(first.digests, second.digests); assert.equal(first.cyclonedx.components[0]["bom-ref"], "pkg:npm/app@1.0.0"); assert.equal(first.spdx.relationships[0].relatedSpdxElement, "SPDXRef-pkg:npm/left-pad@1.3.0"); });
test("aggregation preserves scopes and relationships", () => { const result = generateNodeSbom(graph); assert.match(JSON.stringify(result.cyclonedx), /apps\/app/); assert.match(JSON.stringify(result.cyclonedx), /packages\/shared/); assert.equal(result.cyclonedx.dependencies[0].dependsOn.length, 1); });
test("missing transitive node and malformed graph fail closed", () => { assert.deepEqual(validateNodeDependencyGraph({ ...graph, components: [{ ...graph.components[0], dependencies: ["pkg:npm/missing@1"] }] }), { valid: false, code: "SBOM-NODE-TRANSITIVE-MISSING" }); assert.equal(generateNodeSbom({ schema: NODE_GRAPH_SCHEMA, components: [{}] }).valid, false); });
console.log(`\n${passed} passed`);
