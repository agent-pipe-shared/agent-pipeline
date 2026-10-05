// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved sibling callback registration");
  completionCases.push({ id: "ADW" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { canonical } from "./po-approval-proof.mjs";
import { inspectArchitectureDecisionWaivers } from "./architecture-decision-waiver-store.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const trustAnchor = { keyReference: "project-po", publicKeySha256: sha(publicKey) };
function proof(subject) {
  const intentSha256 = sha(canonical(subject));
  return { schema: "pipeline.po-approval-proof.v1", intentSha256,
    keyReference: trustAnchor.keyReference, publicKey,
    signatureBase64: sign(null, Buffer.from(intentSha256), pair.privateKey).toString("base64") };
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "architecture-waiver-store-"));
  mkdirSync(join(root, "project"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", trustAnchors: [trustAnchor],
  })}\n`);
  const subject = { schema: "pipeline.architecture-decision-waivers.v1", waivers: [{
    id: "PO-EX-1", decisionId: "ORG-ADR-1", decisionDigest: sha("original ADR"),
    moduleIds: ["pipeline-core"], rationaleSha256: sha("explained mitigation"),
    expiresAt: "2026-10-27T00:00:00.000Z",
  }] };
  const path = join(root, "project", "architecture-decision-waivers.json");
  const write = (record) => writeFileSync(path, `${JSON.stringify(record)}\n`);
  const inspect = (now = "2026-09-27T12:00:00.000Z") => inspectArchitectureDecisionWaivers({ rootDir: root, now });
  return { subject, path, write, inspect };
}

test("AC-19 waiver source requires exact PO proof, names the original and expires visibly", (t) => {
  const item = fixture(t);
  assert.equal(item.inspect().code, "ARCH-WAIVERS-NONE");
  item.write({ ...item.subject, proof: proof(item.subject) });
  const valid = item.inspect();
  assert.equal(valid.status, "ready");
  assert.equal(valid.waivers[0].decisionId, "ORG-ADR-1");
  assert.equal(item.inspect("2026-10-28T00:00:00.000Z").status, "advisory");
  assert.deepEqual(item.inspect("2026-10-28T00:00:00.000Z").waivers, []);
  item.write({ ...item.subject, waivers: [{ ...item.subject.waivers[0],
    decisionDigest: sha("different ADR") }], proof: proof(item.subject) });
  assert.equal(item.inspect().code, "ARCH-WAIVER-AUTHORITY-UNVERIFIED");
});

// Register each original sibling callback directly with the canonical recorder.
if (completionCases.length !== 1) throw new Error("Required completion case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
