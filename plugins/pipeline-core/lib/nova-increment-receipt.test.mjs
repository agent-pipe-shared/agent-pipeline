// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NOVA_A_ISSUES,
  NOVA_A_PACKAGES,
  compileNovaIncrementReadback,
  compileNovaIncrementReceipt,
  novaIncrementReceiptDigest,
  validateNovaIncrementGateOnlyAncestry,
  validateNovaIncrementReadback,
  validateNovaIncrementReceipt,
} from "./nova-increment-receipt.mjs";

const h = (char) => char.repeat(64);
const oid = (char) => char.repeat(40);
const candidate = { commit: oid("c"), tree: oid("d") };
const ref = (kind, char) => ({ kind, path: `specs/sprint-nova-epic/evidence/nova-a/${kind}.json`, fileSha256: h(char), recordSha256: h(char) });
function fixture() {
  return {
    increment: { sprint: "Nova", phase: "A" }, base: { commit: oid("a"), tree: oid("b") }, candidate,
    specification: { kind: "specification", path: "specs/sprint-nova-epic/spec.md", sha256: h("1") },
    acceptance: { kind: "acceptance", path: "specs/sprint-nova-epic/acceptance.md", sha256: h("2") },
    issues: NOVA_A_ISSUES.map((issue, index) => ({ issue, acceptanceIds: [`NVA-A${issue}-1`], status: "complete", evidenceSha256: h(String((index + 3) % 10)) })),
    backlog: { status: "green", evidence: ref("backlog", "3") },
    packages: NOVA_A_PACKAGES.map((id, index) => ({ id, status: "complete", evidenceSha256: h(String((index + 4) % 10)) })),
    gates: [
      { gate: "security", candidate, evidence: ref("security", "4"), status: "passed" },
      { gate: "verify", candidate, evidence: ref("verify", "5"), status: "passed" },
    ],
    critic: { candidate, evidence: ref("critic", "6"), lineageSha256: h("7"), status: "accepted" },
    collisions: { status: "reconciled", entries: [{ path: "plugins/pipeline-core/lib/shared.mjs", status: "reconciled", evidenceSha256: h("8") }] },
    evidenceManifest: { path: "specs/sprint-nova-epic/evidence/nova-a/evidence-manifest.json", fileSha256: h("9"), treeDigest: h("a") },
    result: { candidate, evidence: ref("result", "b") }, createdAt: "2026-07-25T12:00:00.000Z",
  };
}
let passed = 0;
function check(name, callback) { callback(); passed += 1; console.log(`PASS NIR${String(passed).padStart(2, "0")} ${name}`); }

check("ships closed receipt and readback schemas with exact roots", () => {
  const receipt = JSON.parse(readFileSync(new URL("../scripts/nova-increment-receipt.schema.json", import.meta.url), "utf8"));
  const readback = JSON.parse(readFileSync(new URL("../scripts/nova-increment-readback.schema.json", import.meta.url), "utf8"));
  assert.equal(receipt.additionalProperties, false); assert.equal(readback.additionalProperties, false);
  assert.deepEqual(receipt.required, ["schema", "increment", "base", "candidate", "specification", "acceptance", "issues", "backlog", "packages", "gates", "critic", "collisions", "evidenceManifest", "result", "createdAt", "receiptSha256"]);
});
check("compiles immutable candidate-bound receipt and independent E1 readback", () => {
  const receipt = compileNovaIncrementReceipt(fixture());
  assert.equal(validateNovaIncrementReceipt(receipt).ok, true); assert.equal(novaIncrementReceiptDigest(receipt), receipt.receiptSha256);
  assert.equal(Object.isFrozen(receipt.gates), true);
  const readback = compileNovaIncrementReadback({ receipt, receiptPath: "specs/sprint-nova-epic/evidence/nova-a/increment-receipt.json", receiptFileSha256: h("c"), evidenceCommit: oid("e"), evidenceTree: oid("f"), status: "verified", observedAt: "2026-07-25T12:01:00.000Z" });
  assert.equal(validateNovaIncrementReadback(readback, receipt).ok, true);
  assert.equal(JSON.stringify(readback).includes("activation"), false);
});
check("rejects changed, missing, or unverified candidate-bound gates", () => {
  const changed = fixture(); changed.gates[0].candidate = { commit: oid("e"), tree: oid("f") };
  assert.throws(() => compileNovaIncrementReceipt(changed), /NIR-SHAPE/u);
  const missing = fixture(); missing.gates.pop(); assert.throws(() => compileNovaIncrementReceipt(missing), /NIR-SHAPE/u);
  const unverified = fixture(); unverified.gates[1].status = "unavailable"; assert.throws(() => compileNovaIncrementReceipt(unverified), /NIR-SHAPE/u);
});
check("rejects hidden partial issue/package completion and unresolved collisions", () => {
  const partial = fixture(); partial.packages[6].status = "partial"; assert.throws(() => compileNovaIncrementReceipt(partial), /NIR-SHAPE/u);
  const hidden = fixture(); hidden.issues.pop(); assert.throws(() => compileNovaIncrementReceipt(hidden), /NIR-SHAPE/u);
  const collision = fixture(); collision.collisions = { status: "reconciled", entries: [] }; assert.throws(() => compileNovaIncrementReceipt(collision), /NIR-SHAPE/u);
});
check("rejects self-binding receipt and stale/mismatched readback evidence", () => {
  const receipt = compileNovaIncrementReceipt(fixture());
  const readback = compileNovaIncrementReadback({ receipt, receiptPath: "specs/sprint-nova-epic/evidence/nova-a/increment-receipt.json", receiptFileSha256: h("c"), evidenceCommit: oid("e"), evidenceTree: oid("f"), status: "verified", observedAt: "2026-07-25T12:01:00.000Z" });
  assert.equal(validateNovaIncrementReadback({ ...readback, evidenceCommit: candidate.commit }, receipt).code, "NIR-READBACK-SELF-BINDING");
  assert.equal(validateNovaIncrementReadback({ ...readback, evidenceManifestSha256: h("0") }, receipt).code, "NIR-READBACK-DIGEST");
});
check("receipt never has a PO activation or enclosing-commit input channel", () => {
  const input = fixture(); input.poActivation = { status: "accepted" }; assert.throws(() => compileNovaIncrementReceipt(input), /NIR-COMPILE-SHAPE/u);
  input.commit = oid("e"); assert.throws(() => compileNovaIncrementReceipt(input), /NIR-COMPILE-SHAPE/u);
});
check("requires E1/E2 gate-only ancestry and a PO decision that names the receipt", () => {
  const receipt = compileNovaIncrementReceipt(fixture());
  const readback = compileNovaIncrementReadback({ receipt, receiptPath: "specs/sprint-nova-epic/evidence/nova-a/increment-receipt.json", receiptFileSha256: h("c"), evidenceCommit: oid("e"), evidenceTree: oid("f"), status: "verified", observedAt: "2026-07-25T12:01:00.000Z" });
  const topology = { receipt, readback, e1: { commit: oid("e"), tree: oid("f"), parentCommit: candidate.commit }, e2: { commit: oid("1"), tree: oid("2"), parentCommit: oid("e") }, poDecision: { status: "accepted", receiptSha256: receipt.receiptSha256 }, e1ChangedPaths: ["specs/sprint-nova-epic/evidence/nova-a/critic.json", "specs/sprint-nova-epic/evidence/nova-a/evidence-manifest.json", "specs/sprint-nova-epic/evidence/nova-a/increment-receipt.json", "specs/sprint-nova-epic/evidence/nova-a/security.json", "specs/sprint-nova-epic/evidence/nova-a/verify.json", "specs/sprint-nova-epic/result.md"], e2ChangedPaths: ["specs/sprint-nova-epic/evidence/nova-a/increment-readback.json", "specs/sprint-nova-epic/evidence/nova-a/po-activation.json"] };
  assert.equal(validateNovaIncrementGateOnlyAncestry(topology).ok, true);
  assert.equal(validateNovaIncrementGateOnlyAncestry({ ...topology, e2: { ...topology.e2, parentCommit: candidate.commit } }).code, "NIR-ANCESTRY-BINDING");
  assert.equal(validateNovaIncrementGateOnlyAncestry({ ...topology, e2ChangedPaths: ["plugins/pipeline-core/lib/nova-increment-receipt.mjs"] }).code, "NIR-ANCESTRY-SHAPE");
  assert.equal(validateNovaIncrementGateOnlyAncestry({ ...topology, e1ChangedPaths: [...topology.e1ChangedPaths, "specs/sprint-nova-epic/evidence/nova-a/increment-readback.json"] }).code, "NIR-ANCESTRY-SHAPE");
  assert.equal(validateNovaIncrementGateOnlyAncestry({ ...topology, e2ChangedPaths: [...topology.e2ChangedPaths, "specs/sprint-nova-epic/evidence/nova-a/increment-receipt.json"] }).code, "NIR-ANCESTRY-SHAPE");
  assert.equal(validateNovaIncrementGateOnlyAncestry({ ...topology, e1ChangedPaths: topology.e1ChangedPaths.slice(1) }).code, "NIR-ANCESTRY-PATHS");
});
console.log(`${passed}/7 checks passed.`);
