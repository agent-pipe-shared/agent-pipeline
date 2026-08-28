#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VERIFY_TOPOLOGY_SCHEMA,
  declaredEvidenceBaselines,
  parseVerifyTopologyArgs,
  preflightVerifyTopology,
  resolveCandidateChangeWindow,
  resolveDeliveryBase,
  runVerifyTopologyCli,
} from "./verify-topology-preflight.mjs";
import { definitionInventoryRecord } from "../lib/ai-definition-inventory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const candidate = "1".repeat(40);
const candidateTree = "2".repeat(40);
const parent = "3".repeat(40);
const parentTree = "4".repeat(40);
const baseline = "5".repeat(40);
const baselineTree = "6".repeat(40);
const inventory = {
  schema: "pipeline.product-capability-inventory.v3",
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

const deliveryBaseCommit = "8".repeat(40);

function changeWindowGit(overrides = {}) {
  const responses = new Map([
    [`rev-parse --verify ${deliveryBaseCommit}^{commit}`, { status: 0, stdout: deliveryBaseCommit }],
    [`merge-base --is-ancestor ${deliveryBaseCommit} ${candidate}`, { status: 0, stdout: "" }],
    [`diff --name-only --diff-filter=ACMR ${deliveryBaseCommit} ${candidate}`, { status: 0, stdout: "plugins/pipeline-core/lib/x.mjs\n" }],
  ]);
  for (const [command, response] of Object.entries(overrides)) responses.set(command, response);
  return { runGit(args) { return responses.get(args.join(" ")) ?? { status: 128, stdout: "" }; } };
}

check("resolveDeliveryBase resolves in strict tier order and treats a blank candidate as absent", () => {
  assert.deepEqual(resolveDeliveryBase({ explicitBase: "e", ciEventBase: "c", sourceBaselineCommit: "s" }), { commit: "e", source: "explicit" });
  assert.deepEqual(resolveDeliveryBase({ explicitBase: "  ", ciEventBase: "c", sourceBaselineCommit: "s" }), { commit: "c", source: "ci-event" });
  assert.deepEqual(resolveDeliveryBase({ explicitBase: null, ciEventBase: null, sourceBaselineCommit: "s" }), { commit: "s", source: "source-baseline" });
  assert.equal(resolveDeliveryBase({ explicitBase: "", ciEventBase: "   ", sourceBaselineCommit: null }), null);
});

check("an unresolvable delivery window fails closed instead of admitting an empty candidate diff (F1)", () => {
  const noTierResolved = changeWindowGit();
  assert.deepEqual(
    resolveCandidateChangeWindow({ runGit: noTierResolved.runGit, candidateCommit: candidate }),
    { ok: false, code: "VTP-BASE-UNRESOLVABLE", subject: "delivery-base" },
  );

  // Reproduces the GitHub `event.before` all-zeros case: the base string is
  // non-empty, so resolveDeliveryBase's blank check passes it through, but it
  // never resolves to a real commit.
  const allZeros = "0".repeat(40);
  const allZerosBase = changeWindowGit({ [`rev-parse --verify ${allZeros}^{commit}`]: { status: 128, stdout: "" } });
  assert.equal(
    resolveCandidateChangeWindow({ runGit: allZerosBase.runGit, candidateCommit: candidate, ciEventBase: allZeros }).code,
    "VTP-BASE-UNRESOLVABLE",
  );
});

check("a non-ancestor or self-identical base fails closed instead of measuring the wrong window (F2)", () => {
  const selfIdentical = changeWindowGit();
  assert.equal(
    resolveCandidateChangeWindow({ runGit: selfIdentical.runGit, candidateCommit: deliveryBaseCommit, ciEventBase: deliveryBaseCommit }).code,
    "VTP-BASE-NOT-ANCESTOR",
  );

  const notAncestor = changeWindowGit({ [`merge-base --is-ancestor ${deliveryBaseCommit} ${candidate}`]: { status: 1, stdout: "" } });
  assert.equal(
    resolveCandidateChangeWindow({ runGit: notAncestor.runGit, candidateCommit: candidate, ciEventBase: deliveryBaseCommit }).code,
    "VTP-BASE-NOT-ANCESTOR",
  );
});

check("an unresolvable diff or an empty changed-path set both fail closed (F1)", () => {
  const diffFails = changeWindowGit({ [`diff --name-only --diff-filter=ACMR ${deliveryBaseCommit} ${candidate}`]: { status: 128, stdout: "" } });
  assert.equal(
    resolveCandidateChangeWindow({ runGit: diffFails.runGit, candidateCommit: candidate, ciEventBase: deliveryBaseCommit }).code,
    "VTP-DIFF-UNRESOLVABLE",
  );

  const emptyDiff = changeWindowGit({ [`diff --name-only --diff-filter=ACMR ${deliveryBaseCommit} ${candidate}`]: { status: 0, stdout: "" } });
  assert.equal(
    resolveCandidateChangeWindow({ runGit: emptyDiff.runGit, candidateCommit: candidate, ciEventBase: deliveryBaseCommit }).code,
    "VTP-CANDIDATE-DIFF-EMPTY",
  );
});

check("a resolvable, ancestor-bound, non-empty window is recorded with its resolution tier", () => {
  const ready = changeWindowGit();
  assert.deepEqual(
    resolveCandidateChangeWindow({ runGit: ready.runGit, candidateCommit: candidate, ciEventBase: deliveryBaseCommit }),
    {
      ok: true,
      changedPaths: ["plugins/pipeline-core/lib/x.mjs"],
      deliveryBase: { commit: deliveryBaseCommit, source: "ci-event" },
    },
  );
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

// --- F3 (Re-Critic vtpgate2-368458af) + round 2 (NVA-VTPGATE-3): no test
// previously named `runVerifyTopologyCli`, so its reviewer-identity
// resolution and recording were unverified. This exercises it against a
// real, tiny temporary git-repository fixture pointed at via the ALREADY
// EXISTING `--root` flag (never a new flag or export added only for tests --
// Forbidden), never the real repository. The fixture's own tiny definition
// roots (empty of matching files) are self-consistent with a definitions
// file generated from the SAME `definitionInventoryRecord` call this script
// itself uses, so `VTP-DEFINITION-REQUALIFICATION-REQUIRED` never fires here.
function reviewerIdentityFixtureRoot() {
  const dir = mkdtempSync(path.join(tmpdir(), "vtp-cli-fixture-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "fixture", GIT_AUTHOR_EMAIL: "author@example.test", GIT_COMMITTER_NAME: "fixture", GIT_COMMITTER_EMAIL: "author@example.test" };
  const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
  for (const sub of ["skills", "agents", "hooks", "scripts"]) mkdirSync(path.join(dir, "plugins", "pipeline-core", sub), { recursive: true });
  writeFileSync(path.join(dir, "README.md"), "before\n");
  run(["init", "--quiet", "--initial-branch=main"]);
  run(["add", "-A"]);
  run(["commit", "--quiet", "-m", "base"]);
  const baseCommit = run(["rev-parse", "HEAD"]).stdout.trim();
  const baseTree = run(["rev-parse", "HEAD^{tree}"]).stdout.trim();
  writeFileSync(path.join(dir, "README.md"), "after\n");
  run(["add", "-A"]);
  run(["commit", "--quiet", "-m", "candidate"]);
  mkdirSync(path.join(dir, "docs"), { recursive: true });
  writeFileSync(path.join(dir, "docs", "product-capability-inventory.json"), JSON.stringify({
    schema: "pipeline.product-capability-inventory.v3",
    sourceBaseline: { commit: baseCommit, tree: baseTree },
  }));
  mkdirSync(path.join(dir, "plugins", "pipeline-core", "config"), { recursive: true });
  writeFileSync(
    path.join(dir, "plugins", "pipeline-core", "config", "ai-assisted-definition-inventory.json"),
    JSON.stringify(definitionInventoryRecord(dir)),
  );
  return dir;
}

check("runVerifyTopologyCli resolves the reviewer identity from the repository variable and records it in the emitted result", () => {
  const repoRoot = reviewerIdentityFixtureRoot();
  const saved = process.env.PIPELINE_SECURITY_REVIEWER_ID;
  try {
    process.env.PIPELINE_SECURITY_REVIEWER_ID = "trusted-reviewer";
    const result = runVerifyTopologyCli(["--root", repoRoot]);
    assert.equal(result.status, "ready");
    assert.deepEqual(result.reviewerIdentity, { schema: "pipeline.ai-assisted-hardening.v1", id: "trusted-reviewer", source: "repository-variable" });
    assert.equal(result.deliveryBase.source, "source-baseline");
  } finally {
    if (saved === undefined) delete process.env.PIPELINE_SECURITY_REVIEWER_ID; else process.env.PIPELINE_SECURITY_REVIEWER_ID = saved;
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

check("runVerifyTopologyCli records a null reviewer identity when no repository variable is present", () => {
  const repoRoot = reviewerIdentityFixtureRoot();
  const saved = process.env.PIPELINE_SECURITY_REVIEWER_ID;
  try {
    delete process.env.PIPELINE_SECURITY_REVIEWER_ID;
    const result = runVerifyTopologyCli(["--root", repoRoot]);
    assert.equal(result.status, "ready");
    assert.deepEqual(result.reviewerIdentity, { schema: "pipeline.ai-assisted-hardening.v1", id: null, source: null });
  } finally {
    if (saved === undefined) delete process.env.PIPELINE_SECURITY_REVIEWER_ID; else process.env.PIPELINE_SECURITY_REVIEWER_ID = saved;
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

process.stdout.write(`verify-topology-preflight: ${checks} checks passed\n`);
