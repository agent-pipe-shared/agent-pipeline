// SPDX-License-Identifier: SUL-1.0
// Test-only materialization of a complete epic/feature design package. This
// helper never relaxes the production reader or mints a production PO proof.
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { designWorkflowAdvisorQuestionSha256 } from "./design-workflow-package.mjs";
import { designReadinessReportSha256 } from "./design-readiness-host-evidence.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialized = (value) => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
const candidateDefault = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });

function writeRelative(root, relativePath, bytes) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

export function materializeTestDesignWorkflowPackage({
  root, featureId, planPath, specPath, candidate = candidateDefault,
  createdAt = "2026-09-27T10:00:00.000Z",
  signerPrivateKey = null, signerKeyReference = "design-workflow-test-key",
  // Opt-in (R7-3-T2b, ruling 65): commit the package and the artifacts it digests (package file, Advisor
  // receipt, readiness) in `root`, which must then be a Git work tree. The result gains a `head` key holding
  // the new HEAD. With the default `false` nothing is committed and the result is exactly as before.
  commitPackage = false,
}) {
  const base = dirname(planPath);
  const sourceFiles = {
    input: { path: `${base}/design-input.md`, bytes: Buffer.from(`Original request for ${featureId}.\n`) },
    prd: { path: planPath, bytes: readFileSync(join(root, planPath)) },
    spec: { path: specPath, bytes: readFileSync(join(root, specPath)) },
    design: { path: `${base}/design.md`, bytes: Buffer.from(`Revised design for ${featureId}.\n`) },
    traceability: { path: `${base}/traceability.md`, bytes: Buffer.from(`Requirements for ${featureId} are mapped.\n`) },
  };
  const sources = Object.fromEntries(Object.entries(sourceFiles).map(([name, source]) => [name, {
    path: source.path, sha256: sha256(source.bytes),
  }]));
  for (const name of ["input", "design", "traceability"]) {
    writeRelative(root, sourceFiles[name].path, sourceFiles[name].bytes);
  }
  const advisor = {
    schema: "pipeline.advisory-receipt.v1",
    receiptId: `advisor-${featureId}`,
    dispatch: { dispatchId: `advisor-${featureId}`, queueRevision: 0, candidateCommit: candidate.commit, candidateTree: candidate.tree },
    duty: "advisory", profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-6-sol" }, effort: "high" },
    adapter: "consult",
    observed: { status: "answered", identity: { provider: "openai", modelId: "gpt-6-sol", effort: "high" } },
    questionSha256: designWorkflowAdvisorQuestionSha256(sources),
    answerSha256: "c".repeat(64), fallback: { reason: "none", redactedErrorClass: null }, emittedAtMs: 1,
  };
  const advisorPath = `${base}/evidence/advisor.json`;
  const advisorBytes = serialized(advisor);
  writeRelative(root, advisorPath, advisorBytes);
  const readinessReport = {
    schema: "pipeline.design-readiness-receipt.v1", dispatchId: `readiness-${featureId}`,
    runner: "codex", candidate, sources, outcome: "ready-for-po-review",
    findings: [{ code: "TRACE-OK", severity: "non-blocking", summary: "The source requirements are traced." }],
    unresolvedChoices: [], summary: "The current sources are ready for one final PO review.",
  };
  const readiness = {
    ...readinessReport,
    hostExecution: {
      schema: "pipeline.design-readiness-host-execution.v1", runner: "codex",
      repoFingerprint: "4".repeat(64), selectionId: `css_${"a".repeat(25)}e`,
      selectionSha256: "5".repeat(64), executionReceiptSha256: "6".repeat(64),
      dutyReceiptSha256: designReadinessReportSha256(readinessReport),
      route: { model: "gpt-6-luna", effort: "high", sourceSha256: "8".repeat(64), candidateCommit: candidate.commit },
    },
  };
  const readinessPath = `${base}/evidence/readiness.json`;
  const readinessBytes = serialized(readiness);
  writeRelative(root, readinessPath, readinessBytes);
  const packagePath = `${base}/evidence/design-workflow-package.json`;
  const designPackage = {
    schema: "pipeline.design-workflow-package.v1", featureId,
    authoringDispatchId: `authoring-${featureId}`, candidate, sources,
    advisor: {
      status: "answered", runner: "codex", nativeAvailable: false,
      receipt: { path: advisorPath, sha256: sha256(advisorBytes) },
      attemptTrail: null, disposition: { decision: "accept", rationale: "The advice is reflected in the design." }, exception: null,
    },
    readiness: { path: readinessPath, sha256: sha256(readinessBytes), dispatchId: readiness.dispatchId },
    createdAt,
  };
  writeRelative(root, packagePath, serialized(designPackage));
  let head = null;
  if (commitPackage) {
    const git = (argv) => execFileSync("git", ["-C", root, "-c", "user.name=design-workflow-test", "-c", "user.email=design-workflow-test@example.invalid",
      "-c", "commit.gpgsign=false", ...argv], { encoding: "utf8", timeout: 10000 }).trim();
    git(["add", "--", packagePath, advisorPath, readinessPath]);
    git(["commit", "-q", "-m", `Commit the design workflow package for ${featureId}`]);
    head = git(["rev-parse", "HEAD"]);
  }
  const privateKey = signerPrivateKey ?? generateKeyPairSync("ed25519").privateKey;
  const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  const trustAnchor = { keyReference: signerKeyReference, publicKeySha256: sha256(Buffer.from(publicKey)) };
  return {
    packagePath, candidate,
    ...(commitPackage ? { head } : {}),
    deps: {
      gitCandidate: () => ({ ok: true, ...candidate }),
      verifyDesignReadinessHostExecution: ({ hostExecution, readinessReceipt }) =>
        hostExecution?.runner === "codex" && hostExecution.dutyReceiptSha256 === designReadinessReportSha256(readinessReceipt)
          ? { ok: true } : { ok: false, code: "DWP-TEST-HOST-BINDING" },
      readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchors: [trustAnchor] }),
    },
    signRequest(requestPath) {
      const request = JSON.parse(readFileSync(join(root, requestPath), "utf8"));
      const proof = {
        schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256,
        keyReference: trustAnchor.keyReference, publicKey,
        signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), privateKey).toString("base64"),
      };
      const proofPath = requestPath.replace("request-", "proof-");
      writeRelative(root, proofPath, serialized(proof));
      return proofPath;
    },
  };
}
