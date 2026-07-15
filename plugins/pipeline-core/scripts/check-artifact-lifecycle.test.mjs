#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkArtifactLifecycle } from "./check-artifact-lifecycle.mjs";

const OWNERSHIP = {
  prd: "product-intent",
  spec: "implementation-contract",
  result: "execution-evidence",
  pipelineState: "active-queue-gate-blocker-resume-only",
  humanState: "bounded-operational-projection",
  backlog: "unresolved-future-work-not-active-status",
  changelog: "released-user-visible-delta-not-work-in-progress",
};
const roots = [];
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}
function digest(root, path) {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "artifact-lifecycle-"));
  roots.push(root);
  write(root, "specs/prd.md", "# PRD\n");
  write(root, "specs/spec.md", "# Spec\n");
  write(root, "docs/state.md", "Feature feature-x is in implementation.\n");
  write(root, "backlog/README.md", "Backlog owns unresolved future work, not active task status.\n");
  write(root, "CHANGELOG.md", "Changelog owns released user-visible delta, not work-in-progress completion.\n");
  const result = {
    schema: "pipeline.phase2.6-result.v0",
    status: "implementation-active",
    authorities: { prd: "specs/prd.md", spec: "specs/spec.md", result: "specs/result.md" },
    artifactLifecycle: {
      schema: "pipeline.artifact-lifecycle.v1",
      featureId: "feature-x",
      artifacts: [
        { kind: "prd", path: "specs/prd.md", state: "active", authority: true },
        { kind: "spec", path: "specs/spec.md", state: "active", authority: true },
        { kind: "result", path: "specs/result.md", state: "active", authority: true },
        { kind: "receipt", path: "specs/receipt.md", state: "historical", authority: false },
      ],
      ownership: structuredClone(OWNERSHIP),
      status: {
        machineStatePath: ".claude/pipeline-state.json",
        humanStatePath: "docs/state.md",
        phase: "implementation",
        resultStatus: "implementation-active",
        humanRequiredText: ["feature-x", "implementation"],
        backlogPath: "backlog/README.md",
        changelogPath: "CHANGELOG.md",
      },
    },
  };
  write(root, "specs/receipt.md", "receipt evidence\n");
  const writeResult = () => write(root, "specs/result.md", `# Result\n\n\`\`\`pipeline-result\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`);
  writeResult();
  write(root, ".claude/pipeline-state.json", JSON.stringify({
    activeFeature: { id: "feature-x", planPath: "specs/prd.md", phase: "implementation" },
    continuity: {
      authority: {
        prd: { path: "specs/prd.md", sha256: digest(root, "specs/prd.md") },
        spec: { path: "specs/spec.md", sha256: digest(root, "specs/spec.md") },
        result: { path: "specs/result.md", sha256: digest(root, "specs/result.md") },
      },
    },
  }));
  return { root, result, writeResult };
}

{
  const { root } = fixture();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL01 accepts one active PRD, Spec, and Result with a bounded status projection", outcome.ok, outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, "specs/result.md", "```pipeline-result\n{}\n```\n\n```pipeline-result\n{}\n```\n");
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL02 rejects a Result with more than one pipeline-result block", !outcome.ok && outcome.findings.some((f) => f.includes("exactly one pipeline-result")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.push({ kind: "prd", path: "specs/other-prd.md", state: "active", authority: true });
  write(root, "specs/other-prd.md", "# competing\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL03 rejects competing active PRDs", !outcome.ok && outcome.findings.some((f) => f.includes("exactly one active PRD")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.push({ kind: "amendment", path: "specs/amendment.md", state: "active", authority: true });
  write(root, "specs/amendment.md", "# amendment\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL04 rejects an active standalone amendment", !outcome.ok && outcome.findings.some((f) => f.includes("active standalone amendment")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.push({ kind: "amendment", path: "specs/amendment.md", state: "historical", authority: false });
  write(root, "specs/amendment.md", "# amendment\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL05 rejects a historical amendment without its supersession binding", !outcome.ok && outcome.findings.some((f) => f.includes("must bind supersededBy")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.find((entry) => entry.kind === "receipt").authority = true;
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL06 rejects a receipt that claims authority", !outcome.ok && outcome.findings.some((f) => f.includes("evidence/history")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.find((entry) => entry.kind === "result").path = "specs/other-result.md";
  write(root, "specs/other-result.md", "# competing Result\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL07 binds lifecycle metadata to its own active Result", !outcome.ok && outcome.findings.some((f) => f.includes("carries artifactLifecycle")), outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, ".claude/pipeline-state.json", JSON.stringify({ activeFeature: { id: "feature-x", phase: "design" } }));
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL08 detects machine-state phase drift", !outcome.ok && outcome.findings.some((f) => f.includes("phase does not match")), outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, "docs/state.md", "Feature feature-x is paused.\n");
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL09 detects a stale human-state projection", !outcome.ok && outcome.findings.some((f) => f.includes("human state does not contain")), outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, "backlog/README.md", "Active task status lives here.\n");
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL10 rejects backlog status-authority drift", !outcome.ok && outcome.findings.some((f) => f.includes("Backlog does not declare")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.find((entry) => entry.kind === "prd").authority = false;
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL11 requires every active PRD/Spec/Result to explicitly claim authority", !outcome.ok && outcome.findings.some((f) => f.includes("active and must explicitly set authority=true")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.push({ kind: "spec", path: "specs/old-spec.md", state: "historical", authority: true });
  write(root, "specs/old-spec.md", "# superseded\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL12 rejects historical PRD/Spec/Result authority claims", !outcome.ok && outcome.findings.some((f) => f.includes("historical/folded and must explicitly set authority=false")), outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, ".claude/pipeline-state.json", JSON.stringify({ activeFeature: { id: "feature-x", planPath: "specs/prd.md", phase: "implementation" } }));
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL13 requires canonical machine-state authority bindings", !outcome.ok && outcome.findings.some((f) => f.includes("continuity.authority is required")), outcome.findings.join("; "));
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
