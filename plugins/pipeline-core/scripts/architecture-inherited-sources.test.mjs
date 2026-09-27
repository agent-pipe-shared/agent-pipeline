// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArchitectureInheritedSources } from "./architecture-inherited-sources.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const anchor = { keyReference: "project-po", publicKeySha256: sha(publicKey) };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "architecture-inherited-sources-cli-"));
  mkdirSync(join(root, "project"));
  mkdirSync(join(root, "scratch"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", trustAnchors: [anchor],
  })}\n`);
  const draftPath = join(root, "scratch", "architecture-inherited-sources-draft.json");
  const draft = { schema: "pipeline.organization-architecture-config-draft.v1",
    sources: [{ sourceId: "org-feed", layer: "organization", required: true,
      trustAnchor: { keyReference: "organization-owner", publicKeySha256: "a".repeat(64) } }] };
  writeFileSync(draftPath, `${JSON.stringify(draft)}\n`);
  return { root, draftPath, draft };
}

test("#9 CLI prepares a bound sign-intent request, applies it after proof, and refuses replay", (t) => {
  const { root } = fixture(t);
  const prepared = runArchitectureInheritedSources(["prepare", "--root", root]);
  assert.equal(prepared.ok, true);
  const request = JSON.parse(readFileSync(join(root, prepared.requestPath), "utf8"));
  assert.equal(request.subject.expectedPriorSha256, null);
  assert.equal(request.intentSha256, prepared.intentSha256);
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: prepared.intentSha256,
    keyReference: anchor.keyReference, publicKey,
    signatureBase64: sign(null, Buffer.from(prepared.intentSha256), pair.privateKey).toString("base64") };
  const proofPath = prepared.requestPath.replace("-request-", "-proof-");
  writeFileSync(join(root, proofPath), `${JSON.stringify(proof)}\n`);
  const applied = runArchitectureInheritedSources(["apply", "--root", root,
    "--request", prepared.requestPath]);
  assert.equal(applied.ok, true, applied.code);
  const stored = JSON.parse(readFileSync(join(root, "project", "architecture-inherited-sources.json"), "utf8"));
  assert.deepEqual(stored.sources, request.subject.sources);
  assert.equal(stored.expectedPriorSha256, null);
  assert.equal(runArchitectureInheritedSources(["apply", "--root", root,
    "--request", prepared.requestPath]).code, "ORG-ARCH-CLI-AUTHORITY-OR-PREIMAGE");
  assert.equal(runArchitectureInheritedSources(["prepare", "--root", root]).ok, true);
});

test("#9 CLI never applies a changed request or untrusted proof", (t) => {
  const { root } = fixture(t);
  const prepared = runArchitectureInheritedSources(["prepare", "--root", root]);
  const requestPath = join(root, prepared.requestPath);
  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  request.subject.sources[0].required = false;
  writeFileSync(requestPath, `${JSON.stringify(request)}\n`);
  const proofPath = prepared.requestPath.replace("-request-", "-proof-");
  writeFileSync(join(root, proofPath), `${JSON.stringify({ schema: "pipeline.po-approval-proof.v1" })}\n`);
  assert.equal(runArchitectureInheritedSources(["apply", "--root", root,
    "--request", prepared.requestPath]).ok, false);
});
