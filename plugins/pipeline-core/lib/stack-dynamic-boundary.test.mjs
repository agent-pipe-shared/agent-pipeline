// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createDynamicTargetAuthorization, evaluateDynamicTargetAuthorization } from "./stack-dynamic-boundary.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const target = { id: "synthetic-api", environment: "test", bindingSha256: "c".repeat(64) };
const scope = { id: "api-contract", paths: ["fixtures/api"] };
const execution = { network: "offline", credential: "none", timeoutMs: 5000 };
let pass = 0;
function check(name, fn) { fn(); pass++; console.log(`PASS ${name}`); }

const created = createDynamicTargetAuthorization({ candidate, target, scope, execution });
assert.equal(created.ok, true);

check("exact non-production target and authorized scope are admitted", () => {
  assert.deepEqual(evaluateDynamicTargetAuthorization({ candidate, target, scope, receipt: created.receipt }), {
    allowed: true, code: "DYNAMIC-AUTHORIZED",
  });
});
check("candidate, target, and scope drift each fail closed", () => {
  assert.equal(evaluateDynamicTargetAuthorization({ candidate: { ...candidate, tree: "d".repeat(40) }, target, scope, receipt: created.receipt }).code, "DYNAMIC-CANDIDATE-MISMATCH");
  assert.equal(evaluateDynamicTargetAuthorization({ candidate, target: { ...target, bindingSha256: "d".repeat(64) }, scope, receipt: created.receipt }).code, "DYNAMIC-TARGET-MISMATCH");
  assert.equal(evaluateDynamicTargetAuthorization({ candidate, target, scope: { ...scope, paths: ["fixtures/other"] }, receipt: created.receipt }).code, "DYNAMIC-SCOPE-MISMATCH");
});
check("production-looking targets and escaping scopes are rejected before authorization", () => {
  assert.deepEqual(createDynamicTargetAuthorization({ candidate, target: { ...target, id: "production-api", environment: "staging" }, scope, execution }), { ok: false, code: "DYNAMIC-BOUNDARY-INVALID" });
  assert.deepEqual(createDynamicTargetAuthorization({ candidate, target, scope: { ...scope, paths: ["../secret"] }, execution }), { ok: false, code: "DYNAMIC-BOUNDARY-INVALID" });
});
check("implicit network and credential expansion are rejected", () => {
  assert.equal(createDynamicTargetAuthorization({ candidate, target, scope, execution: { ...execution, network: "bounded" } }).code, "DYNAMIC-BOUNDARY-INVALID");
  assert.equal(createDynamicTargetAuthorization({ candidate, target, scope, execution: { ...execution, credential: "ambient" } }).code, "DYNAMIC-BOUNDARY-INVALID");
});
check("receipt tampering cannot authorize a dynamic run", () => {
  assert.deepEqual(evaluateDynamicTargetAuthorization({ candidate, target, scope, receipt: { ...created.receipt, execution: { ...execution, network: "bounded" } } }), {
    allowed: false, code: "DYNAMIC-AUTHORIZATION-TAMPERED",
  });
});
check("a syntactically valid receipt cannot widen the timeout on revalidation", () => {
  const receipt = { ...created.receipt, execution: { ...execution, timeoutMs: 60001 } }; const { digest, ...unsigned } = receipt; receipt.digest = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  assert.deepEqual(evaluateDynamicTargetAuthorization({ candidate, target, scope, receipt }), { allowed: false, code: "DYNAMIC-EXECUTION-BOUNDARY" });
});

console.log(`${pass} stack dynamic boundary checks passed`);
