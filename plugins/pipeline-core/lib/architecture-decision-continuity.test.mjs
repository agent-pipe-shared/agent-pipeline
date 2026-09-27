// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonical } from "./po-approval-proof.mjs";
import { composeArchitectureDecisionContinuity, compareArchitectureDecisionContinuity,
  inspectArchitectureDecisionContinuity } from "./architecture-decision-continuity.mjs";

const SHA = "a".repeat(64);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const local = { schema: "pipeline.architecture-effective-decisions.v1", status: "ready",
  area: "pipeline-core", decisions: [{ id: "PROJECT-1", digest: "b".repeat(64), scope: "project",
    path: "docs/adr/PROJECT-1.md" }], activeExceptions: [], findings: [], projectionSha256: SHA };
const inherited = { schema: "pipeline.effective-organization-architecture-sources.v1", status: "ready",
  decisions: [{ id: "ORG-1", digest: "c".repeat(64), status: "accepted",
    moduleIds: ["pipeline-core"], authorityClass: "governed-default", layer: "organization",
    sourceId: "org-feed", sourceSha256: "d".repeat(64) }],
  sourceBindings: [{ sourceId: "org-feed", layer: "organization", required: true,
    status: "consumed", sourceSha256: "d".repeat(64), expiresAt: "2026-10-27T00:00:00.000Z" }],
  findings: [] };

test("AC-19 composition includes inherited refs and source revision in parity", () => {
  const first = composeArchitectureDecisionContinuity({ local, inherited, area: "pipeline-core" });
  assert.equal(first.status, "ready");
  assert.deepEqual(first.decisions.map(({ id }) => id), ["ORG-1", "PROJECT-1"]);
  assert.equal(compareArchitectureDecisionContinuity(first, structuredClone(first)).ok, true);
  const changed = composeArchitectureDecisionContinuity({ local, inherited: {
    ...inherited, sourceBindings: [{ ...inherited.sourceBindings[0], sourceSha256: "e".repeat(64) }],
  }, area: "pipeline-core" });
  assert.equal(compareArchitectureDecisionContinuity(first, changed).code,
    "ARCH-CONTINUITY-PARITY-DIVERGENCE");
  const forged = structuredClone(first);
  forged.decisions[0].digest = "f".repeat(64);
  assert.equal(compareArchitectureDecisionContinuity(first, forged).code,
    "ARCH-CONTINUITY-PARITY-UNRESOLVED");
});

test("AC-19 composition cannot choose between conflicting project and inherited authority", () => {
  const conflict = { ...inherited, decisions: [{ ...inherited.decisions[0], id: "PROJECT-1" }] };
  const result = composeArchitectureDecisionContinuity({ local, inherited: conflict,
    area: "pipeline-core" });
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "ARCH-CONTINUITY-CONFLICT");
  assert.deepEqual(result.decisions, []);
  assert.equal(compareArchitectureDecisionContinuity(result, result).code,
    "ARCH-CONTINUITY-PARITY-UNRESOLVED");
  const signedWaiver = { id: "PO-EX-1", decisionId: "PROJECT-1", decisionDigest: "c".repeat(64),
    moduleIds: ["pipeline-core"], expiresAt: "2026-10-27T00:00:00.000Z",
    rationaleSha256: "d".repeat(64) };
  const excepted = composeArchitectureDecisionContinuity({ local, inherited: conflict,
    waivers: { status: "ready", waivers: [signedWaiver], findings: [] }, area: "pipeline-core" });
  assert.equal(excepted.status, "ready");
  assert.deepEqual(excepted.activeExceptions.map(({ id }) => id), ["PO-EX-1"]);
  assert.equal(compareArchitectureDecisionContinuity(excepted, excepted).ok, true);
  const wrongScope = composeArchitectureDecisionContinuity({ local, inherited: conflict,
    waivers: { status: "ready", waivers: [{ ...signedWaiver, moduleIds: ["harness"] }], findings: [] },
    area: "pipeline-core" });
  assert.equal(wrongScope.status, "blocked");
});

test("AC-19 production reader treats a repo with no configured org feed as none, not consumed", (t) => {
  const root = mkdtempSync(join(tmpdir(), "architecture-continuity-none-"));
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = inspectArchitectureDecisionContinuity({ rootDir: root,
    area: "pipeline-core", now: "2026-09-27T12:00:00.000Z" });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.decisions, []);
  assert.deepEqual(result.sourceBindings, []);
});

test("AC-19 productive readback binds local ADR and configured signed inherited feed", (t) => {
  const root = mkdtempSync(join(tmpdir(), "architecture-continuity-configured-"));
  const common = join(root, ".git");
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  mkdirSync(join(root, "project"));
  mkdirSync(join(common, "agent-pipeline", "architecture-inherited-sources"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const localBody = "# Project decision\n";
  writeFileSync(join(root, "docs", "adr", "ADR-PROJECT.md"), localBody);
  writeFileSync(join(root, "docs", "adr", "ADR-PROJECT.json"), `${JSON.stringify({
    schema: "pipeline.architecture-decision.v1", id: "ADR-PROJECT", title: "Project decision",
    status: "accepted", digest: digest(localBody), scope: "project", date: "2026-09-27",
  })}\n`);
  const makeKey = (name) => {
    const pair = generateKeyPairSync("ed25519");
    const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
    return { pair, publicKey, anchor: { keyReference: name, publicKeySha256: digest(publicKey) } };
  };
  const projectKey = makeKey("project-po");
  const orgKey = makeKey("organization-owner");
  const proof = (subject, key) => {
    const intentSha256 = digest(canonical(subject));
    return { schema: "pipeline.po-approval-proof.v1", intentSha256,
      keyReference: key.anchor.keyReference, publicKey: key.publicKey,
      signatureBase64: sign(null, Buffer.from(intentSha256), key.pair.privateKey).toString("base64") };
  };
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", trustAnchors: [projectKey.anchor],
  })}\n`);
  const config = { schema: "pipeline.organization-architecture-config.v1", expectedPriorSha256: null, sources: [{
    sourceId: "org-feed", layer: "organization", required: true, trustAnchor: orgKey.anchor,
  }] };
  writeFileSync(join(root, "project", "architecture-inherited-sources.json"), `${JSON.stringify({
    ...config, proof: proof(config, projectKey),
  })}\n`);
  const sourcePath = join(common, "agent-pipeline", "architecture-inherited-sources", "org-feed.json");
  const baseSource = { schema: "pipeline.organization-architecture-source.v1",
    sourceId: "org-feed", layer: "organization", observedAt: "2026-09-26T00:00:00.000Z",
    expiresAt: "2026-10-26T00:00:00.000Z", decisions: [{ id: "ORG-ADR-1",
      digest: digest("private organization ADR"), status: "accepted", moduleIds: ["pipeline-core"],
      authorityClass: "governed-default" }] };
  const store = (source) => writeFileSync(sourcePath, `${JSON.stringify({ source,
    proof: proof(source, orgKey) })}\n`);
  store(baseSource);
  const read = () => inspectArchitectureDecisionContinuity({ rootDir: root,
    area: "pipeline-core", now: "2026-09-27T12:00:00.000Z", gitCommonDir: common });
  const first = read();
  assert.equal(first.status, "ready");
  assert.deepEqual(first.decisions.map(({ id }) => id), ["ADR-PROJECT", "ORG-ADR-1"]);
  store({ ...baseSource, decisions: [{ ...baseSource.decisions[0], digest: digest("revised ADR") }] });
  const revised = read();
  assert.equal(compareArchitectureDecisionContinuity(first, revised).code,
    "ARCH-CONTINUITY-PARITY-DIVERGENCE");
});
