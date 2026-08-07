#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createPublicationCapabilityPreflight, validatePublicationCapabilityPreflight } from "./publication-capability-preflight.mjs";

const h = (c) => c.repeat(64); const oid = (c) => c.repeat(40);
const cell = (status, c) => ({ status, evidenceSha256: h(c) });
function fixture() {
  return {
    preflightId: "nova-publication", candidate: { commit: oid("a"), tree: oid("b") },
    remote: { name: "origin", fingerprint: h("c"), ...cell("available", "d") },
    destinationRef: "refs/heads/main", remotePreimage: oid("e"),
    credential: cell("available", "1"), permissions: cell("available", "2"),
    workflowUpdate: cell("not-required", "3"), policy: cell("available", "4"),
    executor: cell("available", "5"),
  };
}
const ready = createPublicationCapabilityPreflight(fixture());
assert.equal(ready.status, "ready"); assert.deepEqual(ready.reasons, []); assert.equal(validatePublicationCapabilityPreflight(ready), true);
for (const [key, status, reason] of [
  ["credential", "unavailable", "credentials-unavailable"],
  ["permissions", "insufficient", "ref-permission-insufficient"],
  ["workflowUpdate", "unavailable", "workflow-permission-missing"],
  ["policy", "insufficient", "repository-policy-rejected"],
  ["executor", "unavailable", "executor-unavailable"],
]) {
  const input = fixture(); input[key] = cell(status, "f");
  const result = createPublicationCapabilityPreflight(input);
  assert.equal(result.status, "blocked"); assert.deepEqual(result.reasons, [reason]);
}
const ambiguous = fixture(); ambiguous.remote.status = "unavailable";
assert.deepEqual(createPublicationCapabilityPreflight(ambiguous).reasons, ["transport-unavailable"]);
ambiguous.remote.status = "insufficient";
assert.deepEqual(createPublicationCapabilityPreflight(ambiguous).reasons, ["ambiguous-endpoint"]);
const polluted = fixture(); polluted.remote.endpoint = "secret.example.invalid";
assert.throws(() => createPublicationCapabilityPreflight(polluted), /keys invalid/u);
console.log("publication-capability-preflight: 8 tests passed");
