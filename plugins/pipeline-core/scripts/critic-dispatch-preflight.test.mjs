#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { CriticDispatchPreflightError, preflightCriticDispatch } from "./critic-dispatch-preflight.mjs";

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
