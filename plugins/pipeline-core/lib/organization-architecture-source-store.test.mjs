// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonical } from "./po-approval-proof.mjs";
import { inspectConfiguredOrganizationArchitectureSources } from "./organization-architecture-source-store.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const po = generateKeyPairSync("ed25519");
const organization = generateKeyPairSync("ed25519");
function key(pair, keyReference) {
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
  return { pair, publicKey, trustAnchor: { keyReference, publicKeySha256: sha(publicKey) } };
}
const poKey = key(po, "project-po");
const orgKey = key(organization, "organization-owner");
function proof(subject, signer) {
  const intentSha256 = sha(canonical(subject));
  return { schema: "pipeline.po-approval-proof.v1", intentSha256,
    keyReference: signer.trustAnchor.keyReference, publicKey: signer.publicKey,
    signatureBase64: sign(null, Buffer.from(intentSha256), signer.pair.privateKey).toString("base64") };
}
function fixture(t, { required = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "org-architecture-source-store-"));
  const common = join(root, ".git");
  mkdirSync(join(root, "project"));
  mkdirSync(join(common, "agent-pipeline", "architecture-inherited-sources"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", trustAnchors: [poKey.trustAnchor],
  })}\n`);
  const descriptor = { sourceId: "organization-adr-feed", layer: "organization", required,
    trustAnchor: orgKey.trustAnchor };
  const config = { schema: "pipeline.organization-architecture-config.v1", sources: [descriptor],
    expectedPriorSha256: null };
  writeFileSync(join(root, "project", "architecture-inherited-sources.json"), `${JSON.stringify({
    ...config, proof: proof(config, poKey),
  })}\n`);
  const source = { schema: "pipeline.organization-architecture-source.v1", sourceId: descriptor.sourceId,
    layer: descriptor.layer, observedAt: "2026-09-26T00:00:00.000Z",
    expiresAt: "2026-10-26T00:00:00.000Z", decisions: [{ id: "ORG-ADR-1",
      digest: sha("private ADR"), status: "accepted", moduleIds: ["pipeline-core"],
      authorityClass: "governed-default" }] };
  const sourcePath = join(common, "agent-pipeline", "architecture-inherited-sources", `${descriptor.sourceId}.json`);
  const writeSource = (value = source) => writeFileSync(sourcePath, `${JSON.stringify({
    source: value, proof: proof(value, orgKey),
  })}\n`);
  const inspect = () => inspectConfiguredOrganizationArchitectureSources({ rootDir: root,
    gitCommonDir: common, now: "2026-09-27T12:00:00.000Z" });
  return { root, common, config, source, sourcePath, writeSource, inspect };
}

test("#9 private source loader admits a PO-bound registry and separately signed organization feed", (t) => {
  const item = fixture(t);
  assert.equal(item.inspect().findings[0].code, "mandatory-source-unavailable");
  item.writeSource();
  const result = item.inspect();
  assert.equal(result.status, "ready");
  assert.equal(result.decisions[0].id, "ORG-ADR-1");
  assert.equal(result.decisions[0].layer, "organization");
  assert.equal(Object.hasOwn(result, "proof"), false);
  const tampered = structuredClone(item.source);
  tampered.decisions[0].digest = sha("forged");
  writeFileSync(item.sourcePath, `${JSON.stringify({ source: tampered,
    proof: proof(item.source, orgKey) })}\n`);
  assert.equal(item.inspect().status, "blocked");
});

test("#9 loader keeps no registry distinct from optional absence and invalid registry", (t) => {
  const item = fixture(t, { required: false });
  assert.equal(item.inspect().status, "advisory");
  writeFileSync(join(item.root, "project", "architecture-inherited-sources.json"),
    `${JSON.stringify({ ...item.config, sources: [{ ...item.config.sources[0], required: true }],
      proof: proof(item.config, poKey) })}\n`);
  assert.equal(item.inspect().code, "ORG-ARCH-CONFIGURATION-AUTHORITY-UNVERIFIED");
  const fresh = mkdtempSync(join(tmpdir(), "org-architecture-no-config-"));
  t.after(() => rmSync(fresh, { recursive: true, force: true }));
  assert.equal(inspectConfiguredOrganizationArchitectureSources({ rootDir: fresh,
    now: "2026-09-27T12:00:00.000Z" }).code, "ORG-ARCH-SOURCES-NONE");
});
