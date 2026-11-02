// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { compactSigningDisclosure, formatHumanApprovalCliResult } from "./po-human-approval.mjs";

const digest = "a".repeat(64);
const longPath = `scratch/${"nested/".repeat(25)}review-${digest}.json`;
const cases = [];
function test(name, run) { cases.push({ id: `PHS${String(cases.length + 1).padStart(3, "0")}`, name, run }); }

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

test("N31r: human-facing critical authorization of a non-push kind names the request, proof and authority paths the reconcile needs", () => {
  const result = { ok: true, code: "PO-HUMAN-CRITICAL-AUTHORIZATION-READY",
    action: { kind: "feature-package-reconcile" },
    paths: { request: "/keys/request.json", proof: "/keys/proof.json", signer: "/keys/signer.json" },
    externalPaths: { request: "/keys/request.json", proof: "/keys/proof.json", authority: "/keys/authority.json" } };
  assert.deepEqual(JSON.parse(formatHumanApprovalCliResult(result, { humanFacing: true })),
    { ok: true, code: result.code, proofPath: "/keys/proof.json", requestPath: "/keys/request.json", authorityPath: "/keys/authority.json", scratchMirror: result.paths });
  const push = { ...result, action: { kind: "push" } };
  assert.deepEqual(JSON.parse(formatHumanApprovalCliResult(push, { humanFacing: true })),
    { ok: true, code: result.code, proofPath: "/keys/proof.json" }, "the push output stays as it was");
  // C18-11 (restated, QG-04): the non-TTY output is still the full result, and now also carries the
  // same path keys the TTY output names (it used to equal the bare result).
  assert.deepEqual(JSON.parse(formatHumanApprovalCliResult(result, { humanFacing: false })),
    { ...result, proofPath: "/keys/proof.json", requestPath: "/keys/request.json", authorityPath: "/keys/authority.json", scratchMirror: result.paths });
});

test("C18-11: a non-push critical result names the scratch mirror and the original paths on a TTY and on a non-TTY alike, never key material", () => {
  const mirror = { request: "/repo/scratch/critical-deploy-request-fp.json", proof: "/repo/scratch/critical-deploy-proof-fp.json",
    authority: "/repo/scratch/critical-deploy-authority-fp.json", signer: "/repo/scratch/critical-deploy-signer-fp.json" };
  const result = { ok: true, code: "PO-HUMAN-CRITICAL-AUTHORIZATION-READY", action: { kind: "deploy" }, paths: mirror,
    externalPaths: { request: "/keys/request.json", proof: "/keys/proof.json", authority: "/keys/authority.json" } };
  for (const humanFacing of [true, false]) {
    const printed = JSON.parse(formatHumanApprovalCliResult(result, { humanFacing }));
    assert.deepEqual(printed.scratchMirror, mirror, `humanFacing=${humanFacing}`);
    assert.equal(printed.proofPath, "/keys/proof.json");
    assert.equal(printed.requestPath, "/keys/request.json");
    assert.equal(printed.authorityPath, "/keys/authority.json");
    assert.equal(JSON.stringify(printed).includes("PRIVATE"), false);
  }
  const push = { ...result, action: { kind: "push" } };
  assert.deepEqual(JSON.parse(formatHumanApprovalCliResult(push, { humanFacing: false })), push, "the push output is untouched");
});

if (cases.length !== 6) throw new Error("signing handoff case count drift");
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
