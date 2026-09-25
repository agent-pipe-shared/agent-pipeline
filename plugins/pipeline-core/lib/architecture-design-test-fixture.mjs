// SPDX-License-Identifier: SUL-1.0

/** Test-only real architecture-design materialization for lifecycle fixtures. */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { prepareAdoptionAuthority } from "./architecture-adoption-authority.mjs";
import { applyAdoptionDecision } from "../scripts/architecture-adoption.mjs";
import { readHumanApprovalMode } from "./critical-human-proof-policy.mjs";
import { initialGreenfieldAgentEntryTarget } from "./architecture-map-scaffold.mjs";

function write(root, relativePath, bytes) {
  const output = resolve(root, relativePath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes, "utf8");
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Architecture Fixture",
      GIT_AUTHOR_EMAIL: "architecture-fixture@example.invalid",
      GIT_COMMITTER_NAME: "Architecture Fixture",
      GIT_COMMITTER_EMAIL: "architecture-fixture@example.invalid",
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "architecture fixture git failed");
}

function commitIfStaged(root, message) {
  const staged = spawnSync("git", ["-C", root, "diff", "--cached", "--quiet"], { encoding: "utf8" });
  if (staged.status === 0) return false;
  if (staged.status !== 1) throw new Error(staged.stderr || staged.error?.message || "architecture fixture staged-diff check failed");
  git(root, ["commit", "-m", message, "-m", "AI-Assisted: true\nDispatch: architecture-design-fixture (goldfish)"]);
  return true;
}

function addEphemeralSignatureAnchor(root, decisionRef) {
  const policyPath = resolve(root, "project/critical-human-proof.json");
  if (!existsSync(policyPath)) throw new Error("architecture design fixture requires an existing critical proof policy in signature mode");
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (![
    "pipeline.critical-human-proof-policy.v1",
    "pipeline.critical-human-proof-policy.v2",
    "pipeline.critical-human-proof-policy.v3",
  ].includes(policy.schema)) throw new Error("architecture design fixture requires a supported critical proof policy in signature mode");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const keyReference = `architecture-design-fixture-${createHash("sha256").update(decisionRef).digest("hex").slice(0, 16)}`;
  const anchor = {
    keyReference,
    publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex"),
  };
  if (policy.schema === "pipeline.critical-human-proof-policy.v3") policy.trustAnchors = [...(policy.trustAnchors ?? []), anchor];
  else policy.trustAnchor = anchor;
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
  return { keyReference, publicKeyPem, privateKey };
}

/**
 * Materialize a deliberately small but real design package.  It has a
 * physical map, valid fitness/baseline data, a declared JS implementation
 * path, and a real chat-mode adoption authority.  It does not bypass the
 * production readiness reader.
 */
export function materializeArchitectureDesignFixture({
  rootDir,
  planPath,
  sourcePath = "src/index.mjs",
  decisionScope = null,
  decisionRef = "TEST-ARCHITECTURE-DESIGN",
  by = "Test PO",
} = {}) {
  const root = resolve(rootDir);
  if (typeof planPath !== "string" || planPath === "" || planPath.startsWith("/") || planPath.includes("\\") || planPath.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError("planPath must be a bounded repository-relative path");
  }
  if (typeof sourcePath !== "string" || sourcePath === "" || sourcePath.startsWith("/") || sourcePath.includes("\\") || sourcePath.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError("sourcePath must be a bounded repository-relative path");
  }
  const moduleId = "application";
  const plan = resolve(root, planPath);
  if (!existsSync(plan)) throw new Error(`plan fixture is missing: ${planPath}`);
  const currentPlan = readFileSync(plan, "utf8");
  if (!currentPlan.includes(sourcePath)) writeFileSync(plan, `${currentPlan.trimEnd()}\n\nImplementation surface: \`${sourcePath}\`.\n`, "utf8");
  if (!existsSync(resolve(root, sourcePath))) write(root, sourcePath, "export const ready = true;\n");
  const createdAgentEntry = !existsSync(resolve(root, "AGENTS.md"));
  if (createdAgentEntry) {
    const entry = initialGreenfieldAgentEntryTarget("fresh");
    write(root, entry.path, entry.bytes);
  }
  write(root, "architecture/map/index.md", "# Architecture Navigation Map Index\n\n## Governed Modules\n\n- [application](application.md)\n");
  write(root, "architecture/map/application.md", [
    "---",
    `id: ${moduleId}`,
    "responsibility: The bounded implementation surface for this feature fixture.",
    "nonResponsibilities: []",
    "ownedPaths:",
    "  - src/**",
    "publicContracts:",
    `  - ${sourcePath}`,
    "allowedDependencies: []",
    "authorityEffects: []",
    "verificationEntryPoints:",
    `  - ${sourcePath}`,
    "adrReferences: []",
    "---",
    "",
    "# Module: application",
  ].join("\n") + "\n");
  write(root, "architecture/fitness-model.json", `${JSON.stringify({
    schema: "pipeline.fitness-model.v1",
    profileId: "test-design-materialization",
    revision: 1,
    modules: [{ id: moduleId, ownedPaths: ["src/**"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: [sourcePath] }],
    allowedBoundaryCrossings: [],
    antiFragmentationPolicy: { rejectTrivialFacades: true, rejectDuplicatedFacades: true, minStatementsPerModule: 1 },
  }, null, 2)}\n`);
  write(root, "architecture/baseline.json", `${JSON.stringify({
    schema: "pipeline.architecture-baseline.v1",
    baselineRevision: 1,
    acceptedViolations: [],
    ratchetMetrics: { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 },
  }, null, 2)}\n`);
  const mode = readHumanApprovalMode(root).mode;
  const signer = mode === "signature" ? addEphemeralSignatureAnchor(root, decisionRef) : null;
  // The temporary fixture signer is intentionally test-private and never
  // commits a protected proof-policy mutation.  The physical design artifacts
  // still get a real candidate commit, while the actual signature is verified
  // against the temporary policy bytes for this isolated fixture.
  git(root, ["add", "--", "architecture", ...(createdAgentEntry ? ["AGENTS.md"] : []), sourcePath, planPath]);
  commitIfStaged(root, "test fixture architecture design");

  const scope = decisionScope ?? [
    `${dirname(planPath).replace(/\\/gu, "/")}/`,
    "architecture/map/",
    "project/pipeline.json",
    "pipeline.user.yaml",
  ];
  const rationale = "Test fixture: the bounded design package materializes its map, baseline, and implementation surface.";
  const decidedAt = "2026-09-19T00:00:00.000Z";
  const approvalRequest = prepareAdoptionAuthority({
    rootDir: root,
    decision: "approved-scoped",
    scope,
    rationale,
    decidedAt,
    decisionRef,
  });
  const authority = approvalRequest.mode === "chat-attributed-unattested"
    ? { chatApproval: { mode: "chat-attributed-unattested", by, decisionRef, intentSha256: approvalRequest.intent.sha256 } }
    : { proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalRequest.intent.sha256, keyReference: signer.keyReference, publicKey: signer.publicKeyPem, signatureBase64: sign(null, Buffer.from(approvalRequest.intent.sha256), signer.privateKey).toString("base64") } };
  const applied = applyAdoptionDecision({
    rootDir: root,
    decision: "approved-scoped",
    scope,
    rationale,
    decidedAt,
    decisionRef,
    by,
    approvalRequest,
    ...authority,
  });
  return { sourcePath, planPath, scope, decisionRef, adoption: applied };
}
