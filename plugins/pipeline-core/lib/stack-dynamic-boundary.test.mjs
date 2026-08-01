// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { createDynamicTargetAuthorization, evaluateDynamicTargetAuthorization } from "./stack-dynamic-boundary.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const target = { id: "synthetic-api", environment: "test", bindingSha256: "c".repeat(64) };
const scope = { id: "api-contract", paths: ["fixtures/api"] };
const execution = { network: "offline", credential: "none", timeoutMs: 5000 };
const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const approvalAuthority = { keyReference: "test-external-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
let pass = 0;
function check(name, fn) { fn(); pass++; console.log(`PASS ${name}`); }
function authorization(overrides = {}) {
  const created = createDynamicTargetAuthorization({ candidate, target, scope, execution });
  assert.equal(created.ok, true);
  return {
    candidate,
    target,
    scope,
    execution,
    intent: created.intent,
    approvalAuthority,
    approvalProof: {
      schema: PO_APPROVAL_PROOF_SCHEMA,
      intentSha256: created.intent.sha256,
      keyReference: approvalAuthority.keyReference,
      publicKey,
      signatureBase64: sign(null, Buffer.from(created.intent.sha256), pair.privateKey).toString("base64"),
    },
    ...overrides,
  };
}

check("exact non-production target and externally authorized scope are admitted", () => {
  const result = evaluateDynamicTargetAuthorization(authorization());
  assert.equal(result.allowed, true);
  assert.equal(result.code, "DYNAMIC-AUTHORIZED");
  assert.match(result.proofSha256, /^[a-f0-9]{64}$/u);
});
check("candidate, target, and scope drift each fail closed", () => {
  assert.equal(evaluateDynamicTargetAuthorization(authorization({ candidate: { ...candidate, tree: "d".repeat(40) } })).code, "DYNAMIC-CANDIDATE-MISMATCH");
  assert.equal(evaluateDynamicTargetAuthorization(authorization({ target: { ...target, bindingSha256: "d".repeat(64) } })).code, "DYNAMIC-TARGET-MISMATCH");
  assert.equal(evaluateDynamicTargetAuthorization(authorization({ scope: { ...scope, paths: ["fixtures/other"] } })).code, "DYNAMIC-SCOPE-MISMATCH");
});
check("production-looking targets and escaping scopes are rejected before approval intent creation", () => {
  assert.deepEqual(createDynamicTargetAuthorization({ candidate, target: { ...target, id: "production-api", environment: "staging" }, scope, execution }), { ok: false, code: "DYNAMIC-BOUNDARY-INVALID" });
  assert.deepEqual(createDynamicTargetAuthorization({ candidate, target, scope: { ...scope, paths: ["../secret"] }, execution }), { ok: false, code: "DYNAMIC-BOUNDARY-INVALID" });
});
check("implicit network and credential expansion are rejected", () => {
  assert.equal(createDynamicTargetAuthorization({ candidate, target, scope, execution: { ...execution, network: "bounded" } }).code, "DYNAMIC-BOUNDARY-INVALID");
  assert.equal(createDynamicTargetAuthorization({ candidate, target, scope, execution: { ...execution, credential: "ambient" } }).code, "DYNAMIC-BOUNDARY-INVALID");
});
check("an unsigned or tampered local intent cannot authorize a dynamic run", () => {
  const unsigned = authorization({ approvalProof: {} });
  assert.deepEqual(evaluateDynamicTargetAuthorization(unsigned), { allowed: false, code: "DYNAMIC-EXTERNAL-AUTHORITY-REQUIRED", cause: "PO-APPROVAL-PROOF-INVALID" });
  const signed = authorization();
  assert.equal(evaluateDynamicTargetAuthorization({ ...signed, intent: { ...signed.intent, sha256: "d".repeat(64) } }).code, "DYNAMIC-AUTHORIZATION-INVALID");
});
check("the external authority cannot widen the offline execution boundary", () => {
  assert.equal(evaluateDynamicTargetAuthorization(authorization({ execution: { ...execution, timeoutMs: 60001 } })).code, "DYNAMIC-AUTHORIZATION-INVALID");
  assert.equal(evaluateDynamicTargetAuthorization(authorization({ execution: { ...execution, timeoutMs: 4000 } })).code, "DYNAMIC-EXECUTION-BOUNDARY");
  assert.equal(evaluateDynamicTargetAuthorization(authorization({ approvalAuthority: { ...approvalAuthority, keyReference: "wrong-key" } })).code, "DYNAMIC-EXTERNAL-AUTHORITY-REQUIRED");
});

console.log(`${pass} stack dynamic boundary checks passed`);
