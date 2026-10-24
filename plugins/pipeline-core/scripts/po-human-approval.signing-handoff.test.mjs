// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { compactSigningDisclosure, formatHumanApprovalCliResult } from "./po-human-approval.mjs";

const digest = "a".repeat(64);
const longPath = `scratch/${"nested/".repeat(25)}review-${digest}.json`;

test("K150B: a long material path retains its full identity and digest in the disclosure", () => {
  assert.ok(longPath.length > 240);
  const lines = compactSigningDisclosure({ intentSha256: digest,
    record: { resolved: true, lines: ["action: approve exact candidate"] },
    materialArtifact: { path: longPath, sha256: digest } });
  assert.ok(lines.some(line => line.includes(`review-${digest}.json`) && line.includes("scratch/")));
  if (`full review material: ${JSON.stringify(longPath)}`.length > 300)
    assert.ok(lines.some(line => line.includes("full path") && line.includes("record")));
  assert.ok(lines.every(line => line.length <= 300));
  assert.ok(lines.includes(`full review material sha256: ${digest}`));
});

test("K150B: multi-kilobyte nested path still gives a bounded exact locator", () => {
  const path = `scratch/${"nested/".repeat(400)}review-${digest}.json`;
  const lines = compactSigningDisclosure({ intentSha256: digest,
    record: { resolved: true, lines: ["action: approve exact candidate"] },
    materialArtifact: { path, sha256: digest } });
  assert.ok(lines.every(line => line.length <= 300));
  assert.ok(lines.some(line => line.includes(`review-${digest}.json`)));
  assert.ok(lines.some(line => line.includes("scratch/") && line.includes("full path")));
  assert.ok(lines.includes(`full review material sha256: ${digest}`));
});

test("K150B: malformed digest and control-bearing material paths refuse", () => {
  const record = { resolved: true, lines: [] };
  for (const path of [longPath + "\n", longPath + "\u001b", longPath + "\0"]) {
    assert.throws(() => compactSigningDisclosure({ intentSha256: digest, record,
      materialArtifact: { path, sha256: digest } }), /PO-SIGN-DISCLOSURE-MATERIAL/u);
  }
  assert.throws(() => compactSigningDisclosure({ intentSha256: digest, record,
    materialArtifact: { path: longPath, sha256: "invalid" } }), /PO-SIGN-DISCLOSURE-MATERIAL/u);
});

test("G31: human-facing critical authorization names the external proof", () => {
  const result = { ok: true, code: "PO-HUMAN-CRITICAL-AUTHORIZATION-READY",
    paths: { proof: "/repo/scratch/critical-push-proof.json" },
    externalPaths: { proof: "/keys/proof-critical-push.json" } };
  assert.deepEqual(JSON.parse(formatHumanApprovalCliResult(result, { humanFacing: true })),
    { ok: true, code: result.code, proofPath: result.externalPaths.proof });
  assert.equal(JSON.parse(formatHumanApprovalCliResult({ ...result, externalPaths: null }, { humanFacing: true })).proofPath,
    null, "a missing external path cannot fall back to the scratch mirror");
  assert.deepEqual(JSON.parse(formatHumanApprovalCliResult(result, { humanFacing: false })), result);
});
