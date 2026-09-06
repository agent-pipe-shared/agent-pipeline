#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { CriticDispatchPreflightError, EVIDENCE_SWEEP_SCHEMA, enumerateEvidenceArtifacts, preflightCriticDispatch } from "./critic-dispatch-preflight.mjs";

function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }
function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "critic-dispatch-preflight-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "governance", "guidelines"), { recursive: true });
  mkdirSync(join(root, "governance", "policies"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  git(root, ["init", "-q"]);
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance", "policies", "checklist.md"), "- verify\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n");
  const base = commit(root, "base");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n\nchanged\n");
  const candidate = commit(root, "candidate");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
  writeFileSync(join(root, "evidence", "verify-root.json"), `${JSON.stringify({ commit: candidate, tree })}\n`);
  writeFileSync(join(root, "evidence", "verify-canonical.json"), `${JSON.stringify({ commit: candidate, tree, candidate: { start: { status: "clean" }, finish: { status: "clean" }, binding: "exact" } })}\n`);
  writeFileSync(join(root, "evidence", "prior-critic.json"), `${JSON.stringify({ candidate: { commit: base, tree: git(root, ["rev-parse", `${base}^{tree}`]) } })}\n`);
  return { root, base, candidate, tree };
}
function input(fx, overrides = {}) {
  return {
    root: fx.root,
    base: fx.base,
    candidate: fx.candidate,
    specPath: "specs/spec.md",
    guardrailPaths: [],
    evidencePaths: ["evidence/verify.json"],
    priorCriticEvidencePath: "evidence/prior-critic.json",
    ...overrides,
  };
}

test("read-only dispatch preflight binds candidate, candidate-tree governance, and separate evidence", () => {
  const fx = fixture();
  const result = preflightCriticDispatch(input(fx));
  assert.equal(result.status, "packet-ready");
  assert.equal(result.candidate.commit, fx.candidate);
  assert.equal(result.candidate.tree, fx.tree);
  assert.equal(result.spec.path, "specs/spec.md");
  assert.deepEqual(result.guardrails.map(({ path }) => path), [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"]);
  assert.equal(result.evidence[0].candidate.commit, fx.candidate);
  assert.equal(result.priorCriticEvidence.path, "evidence/prior-critic.json");
  assert.equal(result.dispatch.childCreated, false);
  assert.equal(result.dispatch.spawnAuthorized, false);
  assert.equal(result.dispatch.requiredNextGate, "selected-runner-transport");
});

test("rejects missing candidate-bound evidence, missing governance, and prior-evidence aliasing", () => {
  const fx = fixture();
  assert.throws(() => preflightCriticDispatch(input(fx, { evidencePaths: [] })), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-EVIDENCE-REQUIRED");
  writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: fx.base, tree: fx.tree } })}\n`);
  assert.throws(() => preflightCriticDispatch(input(fx)), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-EVIDENCE-BINDING");
  assert.throws(() => preflightCriticDispatch(input(fx, { priorCriticEvidencePath: "evidence/verify.json" })), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-PRIOR-ALIASED");
  assert.throws(() => preflightCriticDispatch(input(fx, { guardrailPaths: ["governance/policies/missing.md"] })), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-CANDIDATE-PATH");
});

test("accepts the root candidate binding used by canonical Verify evidence", () => {
  const fx = fixture();
  const result = preflightCriticDispatch(input(fx, { evidencePaths: ["evidence/verify-root.json"] }));
  assert.equal(result.evidence[0].candidate.tree, fx.tree);
});

test("accepts canonical Verify evidence whose candidate field is only a run-status wrapper", () => {
  const fx = fixture();
  const result = preflightCriticDispatch(input(fx, { evidencePaths: ["evidence/verify-canonical.json"] }));
  assert.equal(result.evidence[0].candidate.commit, fx.candidate);
});

/**
 * A repository whose entire history is one commit -- the normal state of a
 * project that just adopted the Pipeline and produced its first feature
 * (AC-1/AC-2, 2026-08-08-verify-evidence-has-a-schema-consumers-and-no-producer.md).
 * `base` here is the git empty-tree OID: the only well-defined predecessor of
 * a root commit. No parent commit is fabricated anywhere in this fixture.
 */
function singleCommitFixture() {
  const root = mkdtempSync(join(tmpdir(), "critic-dispatch-preflight-root-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "governance", "guidelines"), { recursive: true });
  mkdirSync(join(root, "governance", "policies"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  git(root, ["init", "-q"]);
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance", "policies", "checklist.md"), "- verify\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n");
  const candidate = commit(root, "root commit");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
  const base = execFileSync("git", ["-C", root, "hash-object", "-t", "tree", "--stdin"], { input: "", encoding: "utf8" }).trim();
  return { root, base, candidate, tree };
}

test("a repository with exactly one commit resolves the root commit as an ordinary base, not a refusal", () => {
  const fx = singleCommitFixture();
  try {
    const result = preflightCriticDispatch({
      root: fx.root,
      base: fx.base,
      candidate: fx.candidate,
      specPath: "specs/spec.md",
      guardrailPaths: [],
      evidencePaths: ["evidence/verify.json"],
    });
    assert.equal(result.status, "packet-ready");
    assert.equal(result.base.commit, null, "a root commit's base has no commit -- only the empty tree");
    assert.equal(result.base.tree, fx.base);
    assert.equal(result.candidate.commit, fx.candidate);
    assert.equal(result.candidate.tree, fx.tree);
    // AC-4: no history was invented anywhere -- the fixture's own log proves it.
    const log = git(fx.root, ["log", "--oneline"]).split("\n").filter(Boolean);
    assert.equal(log.length, 1);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("a base ref that fails commit-peeling and is not the empty tree is still refused (unchanged behavior)", () => {
  const fx = fixture();
  const bogus = "0".repeat(40);
  assert.throws(
    () => preflightCriticDispatch(input(fx, { base: bogus })),
    (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-GIT",
  );
});

/**
 * Fixture reproducing the shape of the 2026-09-06 incident: the searched-for
 * task id is `NVA-B-DENIALCODE-1`; the real artifact that was missed is named
 * `2026-09-06-nva-b-denialcode-1-red.txt` -- lower-cased and carrying a date
 * prefix and a role suffix. A second sibling and an unrelated file are added
 * so the sweep is proven to be selective, not merely permissive.
 */
function evidenceSweepFixture() {
  const root = mkdtempSync(join(tmpdir(), "critic-dispatch-preflight-sweep-"));
  mkdirSync(join(root, "evidence"), { recursive: true });
  mkdirSync(join(root, "backlog", "evidence"), { recursive: true });
  mkdirSync(join(root, "specs", "some-feature", "evidence"), { recursive: true });
  writeFileSync(join(root, "evidence", "2026-09-06-nva-b-denialcode-1-red.txt"), "red\n");
  writeFileSync(join(root, "backlog", "evidence", "2026-09-06-nva-b-denialcode-1-green.txt"), "green\n");
  writeFileSync(join(root, "specs", "some-feature", "evidence", "unrelated.txt"), "unrelated\n");
  writeFileSync(join(root, "evidence", "NVA-B-OTHERTASK-1.json"), "{}\n");
  git(root, ["init", "-q"]);
  return { root };
}

test("evidence sweep finds the misplaced regression artifact by case-insensitive substring match, across a date prefix and a role suffix", () => {
  const fx = evidenceSweepFixture();
  try {
    const result = enumerateEvidenceArtifacts({ root: fx.root, taskId: "NVA-B-DENIALCODE-1" });
    assert.equal(result.schema, EVIDENCE_SWEEP_SCHEMA);
    const paths = result.matches.map(({ path }) => path).sort();
    assert.deepEqual(paths, [
      "backlog/evidence/2026-09-06-nva-b-denialcode-1-green.txt",
      "evidence/2026-09-06-nva-b-denialcode-1-red.txt",
    ]);
    assert.equal(result.matches.length, 2, "the unrelated task id and unrelated file must not match");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("evidence sweep names each result's location class, distinguishing the ignored root directory from a tracked one", () => {
  const fx = evidenceSweepFixture();
  try {
    const result = enumerateEvidenceArtifacts({ root: fx.root, taskId: "NVA-B-DENIALCODE-1" });
    const byPath = new Map(result.matches.map((match) => [match.path, match.locationClass]));
    assert.match(byPath.get("evidence/2026-09-06-nva-b-denialcode-1-red.txt"), /ignored/);
    assert.match(byPath.get("backlog/evidence/2026-09-06-nva-b-denialcode-1-green.txt"), /tracked/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("evidence sweep is advisory and non-failing: a task id with no artifacts yields an empty result, never an error", () => {
  const fx = evidenceSweepFixture();
  try {
    const result = enumerateEvidenceArtifacts({ root: fx.root, taskId: "NVA-B-NOTHING-HERE-AT-ALL" });
    assert.equal(result.schema, EVIDENCE_SWEEP_SCHEMA);
    assert.deepEqual(result.matches, []);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("evidence sweep never touches preflightCriticDispatch()'s own binding checks or failure modes", () => {
  const fx = fixture();
  // The full-strictness preflight still fails exactly as before when evidence
  // does not bind the exact candidate -- the sweep is a separate function and
  // does not relax or replace `matchingCandidateEvidence()`.
  writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: fx.base, tree: fx.tree } })}\n`);
  assert.throws(() => preflightCriticDispatch(input(fx)), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-EVIDENCE-BINDING");
  // But the sweep over the same directory still reports what is there.
  const swept = enumerateEvidenceArtifacts({ root: fx.root, taskId: "verify" });
  assert.ok(swept.matches.some(({ path }) => path === "evidence/verify.json"));
});
