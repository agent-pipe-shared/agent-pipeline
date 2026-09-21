// SPDX-License-Identifier: SUL-1.0
// Test-only authority: ephemeral key remains inside the disposable fixture.
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { prepareAdoptionAuthority } from "../lib/architecture-adoption-authority.mjs";
import { applyAdoptionDecision } from "./architecture-adoption.mjs";

export function fixtureGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "fixture git failed");
  return result.stdout.trim();
}
export function setupAdoptionFixture(root, { mode = "signature" } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  mkdirSync(join(root, "project"), { recursive: true });
  if (!existsSync(join(root, "architecture", "map", "index.md"))) {
    mkdirSync(join(root, "architecture", "map"), { recursive: true });
    writeFileSync(join(root, "architecture", "map", "index.md"), "# Architecture map\n");
    writeFileSync(join(root, "architecture", "map", "core.md"), "---\nid: core\nresponsibility: Test-only adoption authority fixture.\nnonResponsibilities: []\nownedPaths:\n  - plugins/pipeline-core/lib/**\npublicContracts:\n  - plugins/pipeline-core/lib/architecture-adoption-authority.mjs\nallowedDependencies: []\nauthorityEffects: []\nverificationEntryPoints:\n  - plugins/pipeline-core/scripts/architecture-adoption.test.mjs\nadrReferences: []\n---\n# Core\n");
  }
  writeFileSync(join(root, "project/critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "test-only", publicKeySha256: createHash("sha256").update(pem).digest("hex") }] }));
  writeFileSync(join(root, "pipeline.user.yaml"), `gates:\n  human_approval: ${mode}\n`);
  fixtureGit(root, ["init", "-q"]);
  fixtureGit(root, ["add", "-A"]);
  fixtureGit(root, ["commit", "-qm", "fixture authority", "--allow-empty"]);
  return { pem, privateKey };
}
export function signAdoptionRequest(request, key) {
  return { schema: "pipeline.po-approval-proof.v1", intentSha256: request.intent.sha256, keyReference: "test-only", publicKey: key.pem, signatureBase64: sign(null, Buffer.from(request.intent.sha256), key.privateKey).toString("base64") };
}
export function fixtureAdoption(options) {
  const key = setupAdoptionFixture(options.rootDir);
  const input = { decisionRef: "TEST-ADOPTION", decidedAt: "2026-01-01T00:00:00.000Z", ...options };
  const approvalRequest = prepareAdoptionAuthority(input);
  return applyAdoptionDecision({ ...input, approvalRequest, proof: signAdoptionRequest(approvalRequest, key) });
}
