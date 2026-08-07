#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VERIFY_TOPOLOGY_SCHEMA,
  declaredEvidenceBaselines,
  parseVerifyTopologyArgs,
  preflightVerifyTopology,
} from "./verify-topology-preflight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const candidate = "1".repeat(40);
const candidateTree = "2".repeat(40);
const parent = "3".repeat(40);
const parentTree = "4".repeat(40);
const baseline = "5".repeat(40);
const baselineTree = "6".repeat(40);
const inventory = {
  schema: "pipeline.product-capability-inventory.v2",
  sourceBaseline: { commit: baseline, tree: baselineTree },
};

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  process.stdout.write(`PASS ${name}\n`);
}

function gitFixture(overrides = {}) {
  const responses = new Map([
    ["rev-parse --verify HEAD^{commit}", { status: 0, stdout: candidate }],
    [`rev-parse --verify ${candidate}^{tree}`, { status: 0, stdout: candidateTree }],
    [`rev-parse --verify ${candidate}^^{commit}`, { status: 0, stdout: parent }],
    [`rev-parse --verify ${parent}^{tree}`, { status: 0, stdout: parentTree }],
    [`rev-parse --verify ${baseline}^{commit}`, { status: 0, stdout: baseline }],
    [`rev-parse --verify ${baseline}^{tree}`, { status: 0, stdout: baselineTree }],
    [`merge-base --is-ancestor ${baseline} ${candidate}`, { status: 0, stdout: "" }],
  ]);
  for (const [command, response] of Object.entries(overrides)) responses.set(command, response);
  const calls = [];
  return {
    calls,
    runGit(args) {
      const command = args.join(" ");
      calls.push(command);
      return responses.get(command) ?? { status: 128, stdout: "" };
    },
  };
}

check("declared evidence baseline is closed and digest-bound", () => {
  assert.deepEqual(declaredEvidenceBaselines(inventory), [{
    label: "product-capability-inventory.sourceBaseline",
    commit: baseline,
    tree: baselineTree,
  }]);
  assert.throws(() => declaredEvidenceBaselines({ ...inventory, sourceBaseline: { commit: "short", tree: baselineTree } }));
});

check("typed preflight resolves candidate, exact parent and every baseline before Verify", () => {
  const git = gitFixture();
  const result = preflightVerifyTopology({ inventory, runGit: git.runGit });
  assert.deepEqual(result, {
    schema: VERIFY_TOPOLOGY_SCHEMA,
    status: "ready",
    code: "VTP-READY",
    subject: null,
    candidate: { commit: candidate, tree: candidateTree },
    parent: { commit: parent, tree: parentTree },
    baselines: [{
      label: "product-capability-inventory.sourceBaseline",
      commit: baseline,
      tree: baselineTree,
    }],
    hardening: {
      schema: "pipeline.ai-assisted-hardening-gate.v1",
      allowed: true,
      code: "AIH-CANDIDATE-ADMITTED",
      changedPaths: [],
      checks: {
        input: { schema: "pipeline.ai-assisted-hardening.v1", source: "repository", trust: "untrusted", contentSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", authority: "none" },
        authority: { schema: "pipeline.ai-assisted-hardening.v1", allowed: true, code: "AIH-AUTHORITY-BOUND", manifestSha256: "c7585c5416a413139d3dcf3585b82837e50cc180748998be537c7b5c3498a422" },
        integrity: { schema: "pipeline.ai-assisted-hardening.v1", changed: [], missing: [], allowed: true, code: "AIH-INTEGRITY-CHECKED" },
        review: { schema: "pipeline.ai-assisted-hardening.v1", required: false, allowed: true, code: "AIH-REVIEW-ROUTED" },
        ci: { schema: "pipeline.ai-assisted-hardening.v1", allowed: true, code: "AIH-CI-AUTHORITY-BOUND" },
        hygiene: { schema: "pipeline.ai-assisted-hardening.v1", allowed: true, forbidden: [], code: "AIH-EVIDENCE-HYGIENE-PASSED" },
      },
    },
  });
  assert.deepEqual(git.calls, [
    "rev-parse --verify HEAD^{commit}",
    `rev-parse --verify ${candidate}^{tree}`,
    `rev-parse --verify ${candidate}^^{commit}`,
    `rev-parse --verify ${parent}^{tree}`,
    `rev-parse --verify ${baseline}^{commit}`,
    `rev-parse --verify ${baseline}^{tree}`,
    `merge-base --is-ancestor ${baseline} ${candidate}`,
  ]);
});

check("insufficient history and baseline drift produce typed topology failures", () => {
  const parentMissing = gitFixture({ [`rev-parse --verify ${candidate}^^{commit}`]: { status: 128, stdout: "" } });
  assert.equal(preflightVerifyTopology({ inventory, runGit: parentMissing.runGit }).code, "VTP-PARENT-UNRESOLVABLE");

  const baselineMissing = gitFixture({ [`rev-parse --verify ${baseline}^{commit}`]: { status: 128, stdout: "" } });
  assert.equal(preflightVerifyTopology({ inventory, runGit: baselineMissing.runGit }).code, "VTP-BASELINE-UNRESOLVABLE");

  const wrongTree = gitFixture({ [`rev-parse --verify ${baseline}^{tree}`]: { status: 0, stdout: "7".repeat(40) } });
  assert.equal(preflightVerifyTopology({ inventory, runGit: wrongTree.runGit }).code, "VTP-BASELINE-TREE-MISMATCH");

  const notAncestor = gitFixture({ [`merge-base --is-ancestor ${baseline} ${candidate}`]: { status: 1, stdout: "" } });
  assert.equal(preflightVerifyTopology({ inventory, runGit: notAncestor.runGit }).code, "VTP-BASELINE-NOT-ANCESTOR");
});

check("invalid declarations and CLI traversal fail closed without private coordinates", () => {
  const result = preflightVerifyTopology({ inventory: {}, runGit: () => ({ status: 0, stdout: candidate }) });
  assert.deepEqual(result, {
    schema: VERIFY_TOPOLOGY_SCHEMA,
    status: "failed",
    code: "VTP-DECLARATION-INVALID",
    subject: null,
    candidate: null,
    parent: null,
    baselines: [],
  });
  assert.throws(() => parseVerifyTopologyArgs(["--inventory", "../private.json"]));
});

check("GitHub Verify uses full credential-free history and runs topology before runner-free Core", () => {
  const workflow = readFileSync(path.join(root, ".github", "workflows", "verify.yml"), "utf8");
  assert.match(workflow, /permissions:\s*\n\s+contents: read/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.match(workflow, /persist-credentials: false/u);
  const topology = workflow.indexOf("node plugins/pipeline-core/scripts/verify-topology-preflight.mjs");
  const verify = workflow.indexOf("harness/scripts/verify.mjs");
  assert.equal(topology >= 0 && verify > topology, true);
  assert.match(workflow, /Runner-free offline Core Verify/u);
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && inputs\.live_certification/u);
  assert.match(workflow, /environment: live-runner-certification/u);
  assert.match(workflow, /live-runner-certification\.mjs/u);
});

check("generic topology implementation contains no productive runner resolution", () => {
  const source = readFileSync(path.join(root, "plugins", "pipeline-core", "scripts", "verify-topology-preflight.mjs"), "utf8");
  assert.doesNotMatch(source, /resolveCodexBinary|process\.env\.PATH|command -v (?:codex|claude)/u);
});

process.stdout.write(`verify-topology-preflight: ${checks} checks passed\n`);
