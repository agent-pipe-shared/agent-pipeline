#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkCloseSecurityCompleteness } from "./check-close-security-completeness.mjs";

const roots = [];
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
}
function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}
function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return result.stdout.trim();
}

/** A committed git repo with an optional `.claude/pipeline.yaml` security gate. Returns { root, headSha, headTree }. */
function fixture({ security } = {}) {
  const root = mkdtempSync(join(tmpdir(), "close-security-completeness-"));
  roots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture Author");
  git(root, "config", "user.email", "fixture@example.invalid");
  write(root, "change.txt", "base\n");
  if (security) {
    write(root, ".claude/pipeline.yaml", `schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: ${security}\n    type: automated\n`);
  }
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "base");
  const headSha = git(root, "rev-parse", "HEAD");
  const headTree = git(root, "rev-parse", "HEAD^{tree}");
  return { root, headSha, headTree };
}

/** Schema-shaped v2 envelope+verdict pair, mirrors security-completeness-gate.test.mjs's writePair. */
function writeEvidence(root, { commit, tree, status = "PASS", classification = "clean", outcome = "pass", blocking = false, offendingCapabilities = [] }) {
  const capabilityId = "cap.secrets";
  write(root, "evidence/security-latest.v2.json", JSON.stringify({
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: "e".repeat(64) },
    input: { commit, tree, inputSha256: "f".repeat(64) },
    environment: { platform: process.platform, nodeVersion: process.version },
    capabilities: [{
      capabilityId,
      tool: { name: "gitleaks", version: null },
      rulePack: { ref: "gitleaks-default", digest: null },
      status,
      classification,
      findings: [],
      coverage: {
        subject: "candidate-tree",
        exclusions: [],
        ignored: [],
        unsupportedScope: [],
        truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null },
        dataAge: { ageSeconds: 0, snapshotAt: null },
      },
      reason: null,
    }],
  }));
  write(root, "evidence/security-latest.v2.verdict.json", JSON.stringify({
    schema: "pipeline.security-verdict.v2",
    producedFrom: "pipeline.security-evidence.v2",
    exitAuthority: "v1-blocking-logic",
    note: "fixture",
    v1ExitCode: 0,
    plan: { required: [capabilityId], optional: [], planDigest: "g".repeat(64), source: "fixture", resolvedPolicyDigest: "h".repeat(64) },
    capabilityOutcomes: { [capabilityId]: outcome },
    verdict: { blocking, offendingCapabilities },
    controls: [],
  }));
}

{
  const { root } = fixture({}); // no .claude/pipeline.yaml at all
  const result = checkCloseSecurityCompleteness(root);
  check("manifest absent -> skipped, gate never consulted", result.skipped === true);
}
{
  const { root } = fixture({ security: undefined }); // manifest present, no gates.security at all
  const result = checkCloseSecurityCompleteness(root);
  check("security gate absent from an otherwise-present manifest -> skipped", result.skipped === true);
}
{
  const { root } = fixture({ security: "off" });
  const result = checkCloseSecurityCompleteness(root);
  check("security gate mode:off -> skipped", result.skipped === true);
}
{
  const { root } = fixture({ security: "blocking" });
  // no evidence/ files written -> the shared gate fails closed with two "missing" reasons.
  const result = checkCloseSecurityCompleteness(root);
  check("gate active, HEAD evidence absent -> not skipped, fails closed", result.skipped === false && result.failures.length === 2, JSON.stringify(result));
}
{
  const { root, headSha, headTree } = fixture({ security: "blocking" });
  writeEvidence(root, { commit: headSha, tree: headTree });
  const result = checkCloseSecurityCompleteness(root);
  check("gate active, HEAD evidence fresh/bound/non-blocking -> not skipped, zero failures", result.skipped === false && result.failures.length === 0, JSON.stringify(result));
}
{
  const { root, headSha, headTree } = fixture({ security: "blocking" });
  writeEvidence(root, {
    commit: headSha,
    tree: headTree,
    status: "SKIPPED",
    classification: "binary_missing",
    outcome: "required-capability-missing",
    blocking: true,
    offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "required-capability-missing" }],
  });
  const result = checkCloseSecurityCompleteness(root);
  check(
    "gate active, HEAD evidence fresh/bound/BLOCKING -> not skipped, one failure reason",
    result.skipped === false
      && result.failures.length === 1
      && result.failures[0] === "evidence/security-latest.v2.verdict.json: required capability cap.secrets did not reach an accepted state (outcome=required-capability-missing)",
    JSON.stringify(result),
  );
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`1..${passed + failed}`);
console.log(`# pass ${passed}`);
if (failed) { console.log(`# fail ${failed}`); process.exitCode = 1; }
