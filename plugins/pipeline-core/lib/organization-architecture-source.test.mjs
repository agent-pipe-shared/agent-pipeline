// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonical } from "./po-approval-proof.mjs";
import { admitOrganizationArchitectureSource, ORGANIZATION_ARCHITECTURE_SOURCE_SCHEMA,
  resolveOrganizationArchitectureSources } from "./organization-architecture-source.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const trustAnchors = [{ keyReference: "test-po-key", publicKeySha256: sha(publicKey) }];
const now = "2026-09-27T12:00:00.000Z";
function source() {
  return { schema: ORGANIZATION_ARCHITECTURE_SOURCE_SCHEMA, sourceId: "org-architecture-revision-1",
    layer: "organization", observedAt: "2026-09-26T12:00:00.000Z",
    expiresAt: "2026-10-27T12:00:00.000Z", decisions: [{ id: "ORG-ADR-1",
      digest: sha("private ADR bytes"), status: "accepted", moduleIds: ["pipeline-core"],
      authorityClass: "governed-default" }] };
}
function proof(value) {
  const intentSha256 = sha(canonical(value));
  return { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: "test-po-key",
    publicKey, signatureBase64: sign(null, Buffer.from(intentSha256), pair.privateKey).toString("base64") };
}
const admit = (value, overrides = {}) => admitOrganizationArchitectureSource({ source: value,
  proof: proof(value), trustAnchors, now, ...overrides });

test("#9 inherited ADR source admits only an independently anchored signed reference set", () => {
  const value = source();
  const result = admit(value);
  assert.equal(result.ok, true);
  assert.equal(result.layer, "organization");
  assert.deepEqual(result.decisions.map((entry) => entry.id), ["ORG-ADR-1"]);
  assert.equal(Object.hasOwn(result, "proof"), false);
  assert.equal(admit(value, { trustAnchors: [] }).code, "ORG-ARCH-TRUST-UNAVAILABLE");
  assert.equal(admit(value, { trustAnchors: [{ keyReference: "other", publicKeySha256: sha(publicKey) }] }).code,
    "ORG-ARCH-AUTHORITY-UNVERIFIED");
  const changed = structuredClone(value);
  changed.decisions[0].digest = sha("forged ADR bytes");
  assert.equal(admitOrganizationArchitectureSource({ source: changed, proof: proof(value), trustAnchors, now }).code,
    "ORG-ARCH-AUTHORITY-UNVERIFIED");
});

test("#9 inherited ADR source fails closed on stale, malformed, unsorted and false-supersession data", () => {
  const value = source();
  assert.equal(admit(value, { now: "2026-10-28T12:00:00.000Z" }).code, "ORG-ARCH-SOURCE-STALE");
  const cases = [
    { ...value, extra: "unknown" },
    { ...value, layer: "project" },
    { ...value, decisions: [{ ...value.decisions[0], moduleIds: ["pipeline-core", "harness"] }] },
    { ...value, decisions: [{ ...value.decisions[0], status: "superseded" }] },
    { ...value, decisions: [{ ...value.decisions[0], supersedes: "missing" }] },
  ];
  for (const candidate of cases) assert.equal(admit(candidate).code, "ORG-ARCH-SOURCE-INVALID");
});

test("#9 source resolution distinguishes absent, optional and mandatory sources", () => {
  const none = resolveOrganizationArchitectureSources({ configured: [], now });
  assert.equal(none.status, "ready");
  assert.equal(none.code, "ORG-ARCH-SOURCES-NONE");
  const missing = { sourceId: "org-architecture-revision-1", layer: "organization",
    required: false, source: null, proof: null, trustAnchors: trustAnchors };
  const optional = resolveOrganizationArchitectureSources({ configured: [missing], now });
  assert.equal(optional.status, "advisory");
  assert.deepEqual(optional.decisions, []);
  assert.equal(optional.findings[0].code, "optional-source-unavailable");
  const mandatory = resolveOrganizationArchitectureSources({ configured: [{ ...missing, required: true }], now });
  assert.equal(mandatory.status, "blocked");
  assert.equal(mandatory.findings[0].code, "mandatory-source-unavailable");
  const value = source();
  const consumed = resolveOrganizationArchitectureSources({ configured: [{ ...missing,
    required: true, source: value, proof: proof(value) }], now });
  assert.equal(consumed.status, "ready");
  assert.equal(consumed.decisions[0].id, "ORG-ADR-1");
});

test("#9 source resolution refuses contradictory active inherited decisions", () => {
  const first = source();
  const second = { ...source(), sourceId: "team-architecture-revision-1", layer: "team",
    decisions: [{ ...source().decisions[0], digest: sha("different content") }] };
  const configured = [first, second].map((value) => ({ sourceId: value.sourceId,
    layer: value.layer, required: true, source: value, proof: proof(value), trustAnchors }));
  const result = resolveOrganizationArchitectureSources({ configured, now });
  assert.equal(result.status, "blocked");
  assert.equal(result.decisions.length, 0);
  assert.ok(result.findings.some(({ code }) => code === "inherited-decision-conflict"));
  const explicitFirst = { ...first, decisions: [{ ...first.decisions[0],
    conflictsWith: ["TEAM-ADR-2"] }] };
  const explicitSecond = { ...second, decisions: [{ ...second.decisions[0],
    id: "TEAM-ADR-2" }] };
  const explicit = [explicitFirst, explicitSecond].map((value) => ({
    sourceId: value.sourceId, layer: value.layer, required: true,
    source: value, proof: proof(value), trustAnchors,
  }));
  assert.equal(resolveOrganizationArchitectureSources({ configured: explicit, now }).status, "blocked");
});
