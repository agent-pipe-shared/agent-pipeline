#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
const completionCases = [];
function test(name, run) { completionCases.push({id: "CDPF" + String(completionCases.length + 1).padStart(3, "0"), name, run}); }

import { CriticDispatchPreflightError, EVIDENCE_SWEEP_SCHEMA, enumerateEvidenceArtifacts, preflightCriticDispatch, parseCriticDispatchPreflightArgs } from "./critic-dispatch-preflight.mjs";
import * as preflightModule from "./critic-dispatch-preflight.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { planVerifySelection, verifyEvidenceSatisfiesBoundary } from "../lib/verify-selection.mjs";
import { produceCriticDiagnostic } from "../lib/critic-diagnostic-producer.mjs";
import { compileCriticReviewLineage } from "../lib/critic-review-lineage.mjs";
import { admitSessionCriticReview } from "./session-critic-finalizer.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { CRITIC_CORRECTION_INPUT_BINDINGS_SCHEMA, CriticCorrectionInputBindingsError, FINDING_RECORDS_FIELD, bindingsRoleCounts, deriveCriticCorrectionInputBindings } from "../lib/critic-correction-input-bindings.mjs";

function verifyValue(commit, tree, exitCode = 0) {
  return { schema: "pipeline.verify-evidence.v0", commit, tree, exitCode, steps: [{ name: "fixture-check", exitCode }], selection: planVerifySelection({ mode: "critic", candidateCommit: commit, registeredSuiteIds: ["fixture-check"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["fixture-check"], areas: [{ id: "all", paths: ["**"], suites: ["fixture-check"] }] } }) };
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(isSuccessfulSpawn(result), true, `git ${args.join(" ")}: ${String(result.stderr)}`);
  return String(result.stdout).trim();
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
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
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify(verifyValue(candidate, tree))}\n`);
  writeFileSync(join(root, "evidence", "verify-root.json"), `${JSON.stringify(verifyValue(candidate, tree))}\n`);
  writeFileSync(join(root, "evidence", "verify-canonical.json"), `${JSON.stringify({ ...verifyValue(candidate, tree), candidate: { start: { status: "clean" }, finish: { status: "clean" }, binding: "exact" } })}\n`);
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

function registeredFourRoundFixture(roundCount = 4) {
  const fx = fixture();
  const featureId = "course-feature";
  const specPath = `specs/${featureId}/spec.md`;
  const manifestPath = `specs/${featureId}/lifecycle.json`;
  mkdirSync(join(fx.root, "specs", featureId, "evidence"), { recursive: true });
  const manifest = (artifacts) => ({ schema: "pipeline.feature-package.v1", feature: { id: featureId, rigor: 2 }, state: "approved", artifacts });
  writeFileSync(join(fx.root, specPath), "# Course feature\nround one\n");
  writeFileSync(join(fx.root, manifestPath), `${JSON.stringify(manifest([]))}\n`);
  const courseBase = commit(fx.root, "course genesis manifest");
  writeFileSync(join(fx.root, specPath), "# Course feature\nround one source\n");
  const commits = [commit(fx.root, "course round one candidate")];
  for (let round = 2; round <= roundCount; round += 1) {
    writeFileSync(join(fx.root, specPath), `# Course feature\nround ${round}\n`);
    commits.push(commit(fx.root, `course round ${round} candidate`));
  }
  const lineage = [];
  const invariantMap = { [specPath]: ["INV-1"] };
  for (let index = 0; index < commits.length; index += 1) {
    const base = index === 0 ? courseBase : commits[index - 1];
    const candidate = commits[index];
    const diffSha256 = sha256(`course-diff-${index}`);
    const packet = {
      packetId: String(index + 1).repeat(32),
      request: { projectId: "pipeline", taskId: "course-review", trigger: "T1" },
      candidate: { base, commit: candidate, tree: git(fx.root, ["rev-parse", `${candidate}^{tree}`]) },
      diff: { base, commit: candidate, path: ".git/review.diff", bytes: 1, sha256: diffSha256 },
      diffPaths: [specPath],
      bindings: { requestSha256: "a".repeat(64), diffPathsSha256: "b".repeat(64), governanceSha256: "c".repeat(64) },
    };
    const parent = lineage.at(-1) ?? null;
    lineage.push(compileCriticReviewLineage({
      packet, reviewId: `course-review-${index + 1}`, parent,
      packages: [{ id: featureId, subjectSha256: "d".repeat(64), changedPaths: [specPath], integrationEdges: ["course-edge"] }],
      coverage: { changedPaths: [specPath], acceptanceIds: ["NVA-A54-5"], integrationEdges: ["course-edge"], complete: true, receiptSha256: "e".repeat(64) },
      lane: { laneId: `independent-${index + 1}`, contextSha256: String(index + 1).repeat(64), evidenceSha256: "1".repeat(64) },
      verdict: { status: "findings", schemaValid: true, resultSha256: "2".repeat(64), failure: null },
      findings: [{ id: "finding-1", priorFindingId: index === 0 ? null : "finding-1", severity: "high", status: "open", evidenceSha256: "3".repeat(64) }],
      correction: index === 0 ? null : { commit: candidate, deltaSha256: diffSha256, impactSha256: sha256Canonical(["course-edge"]) },
      invalidation: { kind: "none", reason: null, evidenceSha256: null },
      reviewAttempt: index === 0 ? { round: 1, correctionCommits: 0, requestedMode: "full" } : {
        round: index + 1, correctionCommits: index, requestedMode: "delta",
        base, head: candidate, tree: packet.candidate.tree,
        changedPaths: [specPath], changedBehaviorClaims: ["behavior-one"],
        priorReceipt: { id: "receipt-1", sha256: "4".repeat(64) },
        pathInvariantMap: invariantMap, pathInvariantMapSha256: sha256Canonical(invariantMap),
        coordinatorImpactConfirmed: true, trustBoundaryChanged: false, impactAmbiguous: false,
      },
    }));
  }
  const artifacts = lineage.map((record, index) => {
    const path = `specs/${featureId}/evidence/critic-review-${index + 1}.json`;
    const bytes = `${JSON.stringify(record)}\n`;
    writeFileSync(join(fx.root, path), bytes);
    return { class: "candidate-evidence", path, sha256: sha256(bytes), authority: false, mutability: "immutable", retention: "retain" };
  });
  writeFileSync(join(fx.root, manifestPath), `${JSON.stringify(manifest(artifacts))}\n`);
  commit(fx.root, `register ${roundCount} immutable course rounds`);
  writeFileSync(join(fx.root, specPath), "# Course feature\nround five candidate\n");
  const fifth = commit(fx.root, "fifth candidate");
  const tree = git(fx.root, ["rev-parse", `${fifth}^{tree}`]);
  writeFileSync(join(fx.root, "evidence", "verify-course.json"), `${JSON.stringify(verifyValue(fifth, tree))}\n`);
  return { ...fx, specPath, priorPath: artifacts.at(-1).path, reviewedCommit: commits.at(-1), fifth };
}

test("retained four-round history remains readable but cannot authorize dispatch without consumed journals", () => {
  const fx = registeredFourRoundFixture();
  try {
    const result = preflightCriticDispatch(input(fx, { base: fx.reviewedCommit, candidate: fx.fifth, specPath: fx.specPath, evidencePaths: ["evidence/verify-course.json"], priorCriticEvidencePath: fx.priorPath }));
    assert.equal(result.status, "unavailable", JSON.stringify(result));
    assert.equal(result.code, "CVL-COURSE-JOURNAL-UNAVAILABLE");
    assert.equal(result.dispatch.packetCreated, false);
    assert.equal(result.dispatch.childCreated, false);
  } finally { rmSync(fx.root, {recursive: true, force: true}); }
});

test("a fourth retained review cannot gain admission from finding prose alone", () => {
  const fx = registeredFourRoundFixture(3);
  try {
    const result = preflightCriticDispatch(input(fx, { base: fx.reviewedCommit, candidate: fx.fifth, specPath: fx.specPath, evidencePaths: ["evidence/verify-course.json"], priorCriticEvidencePath: fx.priorPath }));
    assert.equal(result.status, "unavailable", JSON.stringify(result));
    assert.equal(result.code, "CVL-COURSE-JOURNAL-UNAVAILABLE");
    assert.equal(result.dispatch.spawnAuthorized, false);
  } finally { rmSync(fx.root, {recursive: true, force: true}); }
});

for (const declared of [false, true, "unit-drift", "singleton", "wrong-main", "foreign-spec", "empty-range"]) test(`feature genesis ${declared === true ? "admits a fixed integrated review unit" : `refuses ${declared || "missing review-unit"}`}`, () => {
  const fx = fixture();
  try {
    rmSync(join(fx.root, "evidence"), {recursive: true, force: true});
    const featureId = "fresh-feature";
    const directory = join(fx.root, "specs", featureId);
    const specPath = `specs/${featureId}/spec.md`;
    const reviewSpecPath = declared === "foreign-spec" ? `specs/${featureId}/other-spec.md` : specPath;
    const manifestPath = `specs/${featureId}/lifecycle.json`;
    const diagnosticPath = `specs/${featureId}/evidence/diagnostic.json`;
    const logPath = `specs/${featureId}/evidence/targeted.log`;
    mkdirSync(join(directory, "evidence"), { recursive: true });
    const manifest = {schema: "pipeline.feature-package.v1", feature: {id: featureId, rigor: 2}, state: "approved", artifacts: []};
    writeFileSync(join(fx.root, manifestPath), JSON.stringify(manifest));
    writeFileSync(join(fx.root, specPath), "# Fresh feature\nAC-1: behavior boundary\n");
    manifest.artifacts.push({class: "spec", path: specPath, sha256: sha256(readFileSync(join(fx.root, specPath))), authority: true, mutability: "mutable", retention: "active"});
    if (declared) {
      const path = `specs/${featureId}/design/critic-review-unit.json`;
      mkdirSync(join(directory, "design"), {recursive: true});
      const logicalWorkIds = declared === "singleton" ? ["work-one"] : ["work-one", "work-two"];
      const unit = {schema: "pipeline.critic-review-unit.v1", kind: "feature-section", purpose: "Deliver one complete behavior boundary", specPath, logicalWorkIds, criterionIds: ["AC-1"], deliveryBoundary: {mainRef: declared === "wrong-main" ? "refs/heads/foreign-main" : git(fx.root, ["symbolic-ref", "HEAD"])}, singletonRationale: null};
      writeFileSync(join(fx.root, path), JSON.stringify(unit));
      manifest.artifacts.push({class: "design", path, sha256: sha256(readFileSync(join(fx.root, path))), authority: false, mutability: "immutable", retention: "retain"});
    }
    writeFileSync(join(fx.root, manifestPath), JSON.stringify(manifest));
    if (declared === "foreign-spec") writeFileSync(join(fx.root, reviewSpecPath), "# Different source scope\n");
    const base = commit(fx.root, "feature genesis manifest");
    if (declared === "unit-drift") {
      const path = join(directory, "design", "critic-review-unit.json");
      const unit = JSON.parse(readFileSync(path));
      unit.purpose = "New scope after declaring genesis";
      writeFileSync(path, JSON.stringify(unit));
    }
    writeFileSync(join(fx.root, specPath), "# Fresh feature\nchanged\n");
    const candidate = commit(fx.root, "fresh feature candidate");
    mkdirSync(join(fx.root, "evidence"));
    const diagnostic = produceCriticDiagnostic({root: fx.root, candidate, specPath: reviewSpecPath, guardrailPaths: [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"], command: [process.execPath, "-e", "process.exit(0)"], logPath: "evidence/fresh-targeted.log"});
    writeFileSync(join(fx.root, logPath), readFileSync(join(fx.root, "evidence/fresh-targeted.log")));
    diagnostic.targeted.log.path = logPath;
    rmSync(join(fx.root, "evidence"), {recursive: true, force: true});
    writeFileSync(join(fx.root, diagnosticPath), JSON.stringify(diagnostic));
    for (const path of [diagnosticPath, logPath]) manifest.artifacts.push({class: "candidate-evidence", path, sha256: sha256(readFileSync(join(fx.root, path))), authority: false, mutability: "immutable", retention: "retain"});
    writeFileSync(join(fx.root, manifestPath), JSON.stringify(manifest));
    const registrationCommit = commit(fx.root, "register candidate-bound diagnostics");
    const request = input(fx, { base: declared === "empty-range" ? candidate : base, candidate, specPath: reviewSpecPath, evidencePaths: [diagnosticPath], priorCriticEvidencePath: null, courseContext: {featureId, registrationCommit, acceptedReference: null, criterionLocator: null, deltaRequestPath: null} });
    if (declared === "empty-range") {
      assert.throws(() => preflightCriticDispatch(request), error => error instanceof CriticDispatchPreflightError && error.code === "CDP-RANGE");
      return;
    }
    if (declared === "foreign-spec") {
      assert.throws(() => preflightCriticDispatch(request), error => error instanceof CriticDispatchPreflightError && error.code === "CDP-COURSE-CONTEXT");
      return;
    }
    const result = preflightCriticDispatch(request);
    if (!declared) {
      assert.equal(result.status, "refused", JSON.stringify(result));
      assert.equal(result.code, "CCA-REVIEW-UNIT-REQUIRED");
      assert.equal(result.dispatch.packetCreated, false);
      // PF-34: the refusal names the sanctioned route to the missing unit, not only the missing artifact.
      assert.equal(typeof result.repair, "string", JSON.stringify(result));
      assert.match(result.repair, /register-feature-package\.mjs --root <root> --add-review-unit/u);
      assert.match(result.repair, /commit both printed paths in one commit/u);
      assert.match(result.repair, /any base on the candidate history that already lists the feature manifest/u);
      assert.match(result.repair, /retained review keeps its first base/u);
      return;
    }
    if (typeof declared === "string") {
      assert.equal(result.status, "refused", JSON.stringify(result));
      assert.equal(result.code, {"unit-drift": "CGB-REVIEW-UNIT-BINDING", singleton: "CGB-SINGLETON-RATIONALE", "wrong-main": "CGB-MAIN-INTEGRATION", "foreign-spec": "CDP-COURSE-CONTEXT", "empty-range": "CCA-GENESIS-RANGE"}[declared]);
      assert.equal(result.dispatch.packetCreated, false);
      // The add-review-unit route repairs only the missing unit; every other refusal stays unannotated.
      assert.equal(Object.hasOwn(result, "repair"), false, JSON.stringify(result));
      return;
    }
    assert.equal(result.status, "packet-ready", JSON.stringify(result));
    assert.equal(result.coordinatorOnly.courseAdmission.featureId, featureId);
    assert.equal(result.coordinatorOnly.courseAdmission.round, 1);
    assert.equal(result.coordinatorOnly.courseAdmission.correctionCommits, 0);
    assert.equal(result.dispatch.childCreated, false);
  } finally { rmSync(fx.root, {recursive: true, force: true}); }
});

test("read-only dispatch preflight binds candidate, candidate-tree governance, and separate evidence", () => {
  const fx = fixture();
  const result = preflightCriticDispatch(input(fx));
  assert.equal(result.status, "packet-ready", JSON.stringify(result));
  assert.equal(result.candidate.commit, fx.candidate);
  assert.equal(result.candidate.tree, fx.tree);
  assert.equal(result.spec.path, "specs/spec.md");
  assert.deepEqual(result.guardrails.map(({ path }) => path), [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"]);
  assert.equal(result.evidence[0].candidate.commit, fx.candidate);
  assert.equal(result.coordinatorOnly.priorCriticEvidence.path, "evidence/prior-critic.json");
  assert.equal(Object.hasOwn(result, "priorCriticEvidence"), false);
  assert.deepEqual(result.dispatch.reviewerInput, {
    baseCommit: fx.base,
    candidateCommit: fx.candidate,
    candidateTree: fx.tree,
    rulesetSha: fx.candidate,
    specPath: "specs/spec.md",
    governanceConstraintPaths: ["governance/guidelines", "governance/policies"],
    guardrailPaths: [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"],
    evidencePaths: ["evidence/verify.json"],
  });
  assert.equal(JSON.stringify(result.dispatch.reviewerInput).includes("prior-critic"), false);
  assert.equal(result.dispatch.childCreated, false);
  assert.equal(result.dispatch.spawnAuthorized, false);
  assert.equal(result.dispatch.requiredNextGate, "session-critic-dispatch");
});

// N13 (Toolbox, 2026-10-29): the preflight asks the dispatch record admission when it is given the task id.
test("N13 preflight with --task-id refuses a task id no delivered record admits and says why; without it nothing changes", () => {
  const fx = fixture();
  const refusal = cdpRefusal(() => preflightCriticDispatch({ ...input(fx), taskId: "FRESH-critic-r2" }), "CDP-REVIEW-ADMISSION");
  assert.match(refusal.message, /Critic review admission would refuse task id FRESH-critic-r2/u);
  assert.match(refusal.message, /later Critic round carries the task id of its first delivery/u);
  const plain = preflightCriticDispatch(input(fx));
  assert.equal(plain.status, "packet-ready");
  assert.equal(Object.hasOwn(plain, "reviewAdmission"), false);
});

test("N13 the argument parser takes one safe --task-id and refuses a repeated or unsafe one", () => {
  const base = ["--root", ".", "--base", "a".repeat(40), "--candidate", "b".repeat(40), "--spec", "specs/spec.md"];
  assert.equal(parseCriticDispatchPreflightArgs([...base, "--task-id", "FIRST-1"]).taskId, "FIRST-1");
  assert.equal(Object.hasOwn(parseCriticDispatchPreflightArgs(base), "taskId"), false);
  cdpRefusal(() => parseCriticDispatchPreflightArgs([...base, "--task-id", "A", "--task-id", "B"]), "CDP-ARGUMENT");
  cdpRefusal(() => parseCriticDispatchPreflightArgs([...base, "--task-id", "../x"]), "CDP-ARGUMENT");
  cdpRefusal(() => parseCriticDispatchPreflightArgs([...base, "--task-id"]), "CDP-ARGUMENT");
});

test("reviewer input uses an empty governance-directory list when the manifest declares no governance block", () => {
  const fx = fixture();
  writeFileSync(join(fx.root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  const candidate = commit(fx.root, "remove optional governance block");
  const tree = git(fx.root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify(verifyValue(candidate, tree))}\n`);
  const result = preflightCriticDispatch(input(fx, { base: fx.candidate, candidate }));
  assert.equal(result.dispatch.reviewerInput.rulesetSha, candidate);
  assert.deepEqual(result.dispatch.reviewerInput.governanceConstraintPaths, []);
});

function traceabilityCandidate(fx, { soundToggle = true, mapOverride = null } = {}) {
  mkdirSync(join(fx.root, "src"), { recursive: true });
  writeFileSync(join(fx.root, "src", "game.js"), "window.addEventListener('keydown', onKey);\n");
  writeFileSync(join(fx.root, "index.html"), soundToggle
    ? "<button data-action=\"sound-toggle\">Sound</button>\n"
    : "<button>Play</button>\n");
  const map = mapOverride ?? {
    schema: "pipeline.requirement-traceability.v1",
    specPath: "specs/spec.md",
    specSha256: sha256(readFileSync(join(fx.root, "specs", "spec.md"))),
    criteria: [
      { id: "AC-KEYBOARD", predicate: "file-contains-literal", path: "src/game.js", literal: "keydown" },
      { id: "AC-SOUND-TOGGLE", predicate: "file-contains-literal", path: "index.html", literal: "data-action=\"sound-toggle\"" },
    ],
  };
  writeFileSync(join(fx.root, "specs", "spec.requirements.json"), `${JSON.stringify(map)}\n`);
  const candidate = commit(fx.root, "traceable candidate");
  const tree = git(fx.root, ["rev-parse", `${candidate}^{tree}`]);
  writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify(verifyValue(candidate, tree))}\n`);
  return { candidate, tree };
}

test("opt-in requirement map is candidate-bound, evaluated, and passed to the Critic as a constraint", () => {
  const fx = fixture();
  const traced = traceabilityCandidate(fx);
  const result = preflightCriticDispatch(input(fx, { base: fx.candidate, candidate: traced.candidate }));
  assert.equal(result.status, "packet-ready", JSON.stringify(result));
  assert.equal(result.requirementTraceability.mode, "declared");
  assert.deepEqual(result.requirementTraceability.criteria.map(({ id, status }) => ({ id, status })), [
    { id: "AC-KEYBOARD", status: "present" },
    { id: "AC-SOUND-TOGGLE", status: "present" },
  ]);
  assert.deepEqual(result.requirementTraceability.candidate, { commit: traced.candidate, tree: traced.tree });
  assert.ok(result.guardrails.some(({ path }) => path === "specs/spec.requirements.json"));
  assert.ok(result.dispatch.reviewerInput.guardrailPaths.includes("specs/spec.requirements.json"));
});

test("preflight rejects a specifically named absent requirement before packet-ready", () => {
  const fx = fixture();
  const traced = traceabilityCandidate(fx, { soundToggle: false });
  assert.throws(
    () => preflightCriticDispatch(input(fx, { base: fx.candidate, candidate: traced.candidate })),
    (error) => error instanceof CriticDispatchPreflightError
      && error.code === "CDP-REQUIREMENT-ABSENT"
      && error.message.includes("AC-SOUND-TOGGLE")
      && !error.message.includes("AC-KEYBOARD"),
  );
});

test("preflight rejects prose/command predicates instead of executing or inferring them", () => {
  const fx = fixture();
  const traced = traceabilityCandidate(fx, { mapOverride: {
    schema: "pipeline.requirement-traceability.v1",
    specPath: "specs/spec.md",
    specSha256: sha256(readFileSync(join(fx.root, "specs", "spec.md"))),
    criteria: [{ id: "AC-PLAYABILITY", predicate: "run-command", path: "src/game.js", command: "node game.js" }],
  } });
  assert.throws(
    () => preflightCriticDispatch(input(fx, { base: fx.candidate, candidate: traced.candidate })),
    (error) => error instanceof CriticDispatchPreflightError
      && error.code === "CDP-REQUIREMENT-MAP"
      && error.message.includes("RT-PREDICATE"),
  );
});

test("preflight rejects a stale requirement map after the candidate Spec changes", () => {
  const fx = fixture();
  const staleDigest = sha256(readFileSync(join(fx.root, "specs", "spec.md")));
  writeFileSync(join(fx.root, "specs", "spec.md"), "# Spec\n\nA newly named sound requirement.\n");
  const traced = traceabilityCandidate(fx, { mapOverride: {
    schema: "pipeline.requirement-traceability.v1",
    specPath: "specs/spec.md",
    specSha256: staleDigest,
    criteria: [{ id: "AC-KEYBOARD", predicate: "file-contains-literal", path: "src/game.js", literal: "keydown" }],
  } });
  assert.throws(
    () => preflightCriticDispatch(input(fx, { base: fx.candidate, candidate: traced.candidate })),
    (error) => error instanceof CriticDispatchPreflightError
      && error.code === "CDP-REQUIREMENT-MAP"
      && error.message.includes("RT-MAP-SPEC-DIGEST"),
  );
});

test("current-artifact preflight binds an unchanged artifact to the later candidate without inventing a range", () => {
  const fx = fixture();
  writeFileSync(join(fx.root, "governance", "policies", "checklist.md"), "- verify\n- later correction\n");
  const candidate = commit(fx.root, "later unrelated correction");
  const tree = git(fx.root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify(verifyValue(candidate, tree))}\n`);
  const result = preflightCriticDispatch({
    root: fx.root, candidate, reviewScope: { kind: "current-artifacts", paths: ["specs/spec.md"] },
    specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: ["evidence/verify.json"],
  });
  assert.equal(Object.hasOwn(result, "base"), false);
  assert.deepEqual(result.reviewScope, { kind: "current-artifacts", paths: ["specs/spec.md"] });
  assert.deepEqual(result.sourceCoverage.map(({ path, mode }) => ({ path, mode })), [{ path: "specs/spec.md", mode: "100644" }]);
  assert.equal(result.candidate.commit, candidate);
  assert.throws(() => preflightCriticDispatch({
    root: fx.root, base: fx.base, candidate, reviewScope: { kind: "current-artifacts", paths: ["specs/spec.md"] },
    specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: ["evidence/verify.json"],
  }), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-SCOPE-MIXED");
  for (const paths of [["specs\\spec.md"], ["specs/spec.md", "specs/spec.md"], ["specs/spec.md", "governance/policies/checklist.md"]]) {
    assert.throws(() => preflightCriticDispatch({
      root: fx.root, candidate, reviewScope: { kind: "current-artifacts", paths },
      specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: ["evidence/verify.json"],
    }), (error) => error instanceof CriticDispatchPreflightError);
  }
});

test("current-artifact preflight keeps evidence small while admitting bounded large candidate sources", () => {
  const fx = fixture();
  writeFileSync(join(fx.root, "specs", "large.md"), "x".repeat((1024 * 1024) + 1));
  const candidate = commit(fx.root, "large candidate source");
  const tree = git(fx.root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify(verifyValue(candidate, tree))}\n`);
  const result = preflightCriticDispatch({
    root: fx.root, candidate, reviewScope: { kind: "current-artifacts", paths: ["specs/large.md"] },
    specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: ["evidence/verify.json"],
  });
  assert.equal(result.sourceCoverage[0].path, "specs/large.md");
  writeFileSync(join(fx.root, "evidence", "oversized.json"), "x".repeat((1024 * 1024) + 1));
  assert.throws(() => preflightCriticDispatch({
    root: fx.root, candidate, reviewScope: { kind: "current-artifacts", paths: ["specs/large.md"] },
    specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: ["evidence/oversized.json"],
  }), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-EVIDENCE-FILE");
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

test("first Critic admits actual failed targeted diagnostics with full Verify not-run; arbitrary JSON and tampering fail", () => {
  const fx = fixture();
  try {
    const value = produceCriticDiagnostic({ root: fx.root, specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"], command: [process.execPath, "-e", "console.log('targeted failure detail'); process.exit(1)"], logPath: "evidence/targeted.log" });
    const evidencePath = join(fx.root, "evidence/diagnostics.json");
    writeFileSync(evidencePath, JSON.stringify(value));
    const call = () => preflightCriticDispatch(input(fx, { evidencePaths: ["evidence/diagnostics.json"] }));
    const result = call();
    assert.equal(result.status, "packet-ready", JSON.stringify(result));
    assert.equal(result.evidence[0].diagnostic.fullVerify, "not-run");
    assert.equal(result.evidence[0].diagnostic.targeted.status, "failed");
    for (const mutate of [v => { v.candidate.tree = "f".repeat(40); }, v => { v.spec.sha256 = "f".repeat(64); }, v => { v.targeted.log.sha256 = "f".repeat(64); }, v => { v.guardrails = []; }]) {
      const altered = structuredClone(value); mutate(altered); writeFileSync(evidencePath, JSON.stringify(altered));
      assert.throws(call);
    }
    writeFileSync(evidencePath, JSON.stringify({ candidate: value.candidate }));
    assert.throws(call, error => error.code === "CDP-EVIDENCE-SCHEMA");
    writeFileSync(evidencePath, JSON.stringify(value));
    rmSync(join(fx.root, value.targeted.log.path));
    assert.throws(call);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("failed canonical Verify admits review without satisfying final qualification", () => {
  const fx = fixture();
  try {
    const failed = verifyValue(fx.candidate, fx.tree, 1);
    writeFileSync(join(fx.root, "evidence/verify.json"), JSON.stringify(failed));
    assert.equal(preflightCriticDispatch(input(fx)).evidence[0].diagnostic.status, "failed");
    for (const boundary of ["candidate", "push", "release"]) assert.equal(verifyEvidenceSatisfiesBoundary(failed, boundary), false);
    failed.selection = { ...failed.selection, selectionSha256: "f".repeat(64) };
    writeFileSync(join(fx.root, "evidence/verify.json"), JSON.stringify(failed));
    assert.throws(() => preflightCriticDispatch(input(fx)), error => error.code === "CDP-EVIDENCE-MODE");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
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
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify(verifyValue(candidate, tree))}\n`);
  const emptyTree = spawnSync("git", ["-C", root, "hash-object", "-t", "tree", "--stdin"], { input: "", encoding: "utf8" });
  assert.equal(isSuccessfulSpawn(emptyTree), true, `git hash-object: ${String(emptyTree.stderr)}`);
  const base = String(emptyTree.stdout).trim();
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
    assert.equal(result.status, "packet-ready", JSON.stringify(result));
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

// These new fixtures are owned by each test and never run a preflight against
// the working checkout. Existing six producer expectations above stay intact.
function captureFixture(t) {
  const fx = fixture();
  t.after(() => rmSync(fx.root, { recursive: true, force: true }));
  return fx;
}
function expectedSource(fx, patch = {}) {
  return { schema: "pipeline.critic-preflight-observation.v1", producer: "critic-dispatch-preflight",
    observationRevision: 1, stage: "complete", outcome: "packet-ready", code: null,
    candidate: { commit: fx.candidate, tree: fx.tree },
    specSha256: createHash("sha256").update("# Spec\n\nchanged\n").digest("hex"), ...patch };
}
function captureRejection(value, expected) {
  const observations = [];
  assert.throws(() => preflightCriticDispatch(value, (source) => { observations.push(source); }),
    (error) => error instanceof CriticDispatchPreflightError && error.code === expected.code);
  assert.deepEqual(observations, [expected]);
}
function producerArgv(value) {
  return ["--root", value.root, "--base", value.base, "--candidate", value.candidate, "--spec", value.specPath,
    ...value.guardrailPaths.flatMap((path) => ["--guardrail", path]),
    ...value.evidencePaths.flatMap((path) => ["--evidence", path]),
    ...(value.priorCriticEvidencePath === null ? [] : ["--prior-critic", value.priorCriticEvidencePath])];
}
function directCli(fx, argv) {
  const result = childProcess.spawnSync(process.execPath,
    [fileURLToPath(new URL("./critic-dispatch-preflight.mjs", import.meta.url)), ...argv],
    { cwd: fx.root, encoding: "utf8", timeout: 15000 });
  assert.equal(result.error, undefined);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function withBuiltinMocks(t, patches, action) {
  try {
    for (const [object, key, replacement] of patches) t.mock.method(object, key, replacement);
    syncBuiltinESMExports();
    return action();
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
}

test("source callback emits exactly one closed detached packet-ready observation", (t) => {
  const fx = captureFixture(t), value = input(fx), expected = preflightCriticDispatch(value);
  const seen = [];
  const result = preflightCriticDispatch(value, (source) => { seen.push(source); return { ok: true, code: null }; });
  assert.deepEqual(result, expected);
  assert.deepEqual(seen, [expectedSource(fx)]);
  assert.notEqual(seen[0].candidate, result.candidate);
  assert.deepEqual(Object.keys(result), ["schema", "status", "base", "candidate", "spec", "guardrails", "governance", "requirementTraceability", "evidence", "coordinatorOnly", "dispatch"]);
  assert.equal(result.dispatch.requiredNextGate, "session-critic-dispatch");
  assert.equal(result.dispatch.spawnAuthorized, false);
  seen[0].candidate.commit = "0".repeat(40); seen[0].specSha256 = null; seen[0].extra = "synthetic";
  assert.deepEqual(result, expected);
  result.candidate.tree = "f".repeat(40); assert.equal(seen[0].candidate.tree, fx.tree);
  assert.equal(fs.existsSync(join(fx.root, "evidence", "interruption-receipts")), false);
  assert.equal(fs.existsSync(join(fx.root, "evidence", "interruption-collection")), false);
});

test("actual direct CLI preserves complete packet-ready and representative rejection protocols", (t) => {
  const fx = captureFixture(t), value = input(fx);
  const before = git(fx.root, ["status", "--porcelain", "--untracked-files=all"]);
  const expected = preflightCriticDispatch(value);
  assert.deepEqual(directCli(fx, producerArgv(value)), { status: 0, stdout: JSON.stringify(expected) + "\n", stderr: "" });
  for (const [patch, code] of [
    [{ evidencePaths: [] }, "CDP-EVIDENCE-REQUIRED"],
    [{ evidencePaths: ["evidence/prior-critic.json"], priorCriticEvidencePath: null }, "CDP-EVIDENCE-BINDING"],
    [{ priorCriticEvidencePath: "evidence/verify.json" }, "CDP-PRIOR-ALIASED"],
    [{ specPath: "specs/absent.md" }, "CDP-CANDIDATE-PATH"],
    [{ specPath: "../spec.md" }, "CDP-PATH"],
    [{ candidate: "absent-candidate" }, "CDP-GIT"],
  ]) assert.deepEqual(directCli(fx, producerArgv(input(fx, patch))), { status: 1, stdout: "",
    stderr: JSON.stringify({ schema: "pipeline.critic-dispatch-preflight.v1", status: "rejected", code }) + "\n" });
  assert.deepEqual(directCli(fx, ["--unknown"]), { status: 1, stdout: "",
    stderr: '{"schema":"pipeline.critic-dispatch-preflight.v1","status":"rejected","code":"CDP-ARGUMENT"}\n' });
  assert.equal(git(fx.root, ["status", "--porcelain", "--untracked-files=all"]), before);
  assert.equal(fs.existsSync(join(fx.root, "telemetry")), false);
});

test("shared argument parser preserves defaults scalar overwrites arrays and exact flag errors", () => {
  const defaults = { guardrailPaths: [], evidencePaths: [], priorCriticEvidencePath: null, sweepEvidenceTaskId: null };
  assert.deepEqual(parseCriticDispatchPreflightArgs([]), defaults);
  const argv = ["--root", "first", "--root", "second", "--base", "base", "--candidate", "candidate", "--spec", "spec",
    "--guardrail", "z", "--guardrail", "z", "--evidence", "e", "--evidence", "e", "--prior-critic", "old", "--prior-critic", "new"];
  const before = [...argv];
  assert.deepEqual(parseCriticDispatchPreflightArgs(argv), { guardrailPaths: ["z", "z"], evidencePaths: ["e", "e"],
    priorCriticEvidencePath: "new", sweepEvidenceTaskId: null, root: "second", base: "base", candidate: "candidate", specPath: "spec" });
  assert.deepEqual(argv, before);
  // A flag-looking value remains a value exactly as in the original parser.
  assert.deepEqual(parseCriticDispatchPreflightArgs(["--root", "--base"]), { ...defaults, root: "--base" });
  for (const flag of ["--root", "--base", "--candidate", "--spec", "--guardrail", "--evidence", "--prior-critic", "--sweep-evidence"])
    assert.throws(() => parseCriticDispatchPreflightArgs([flag]), { name: "CriticDispatchPreflightError", code: "CDP-ARGUMENT", message: flag + " requires a value." });
  assert.throws(() => parseCriticDispatchPreflightArgs(["--other", "value"]),
    { name: "CriticDispatchPreflightError", code: "CDP-ARGUMENT", message: "Unknown argument: --other" });
});

test("request destructuring retains original getter order and exceptions before body entry", () => {
  const fields = ["root", "base", "candidate", "specPath", "guardrailPaths", "evidencePaths", "priorCriticEvidencePath"];
  const order = [], request = {};
  for (const key of fields) Object.defineProperty(request, key, { get() { order.push(key); return undefined; } });
  const seen = [];
  assert.throws(() => preflightCriticDispatch(request, (source) => { seen.push(source); }), { code: "CDP-INPUT" });
  assert.deepEqual(order, fields);
  assert.deepEqual(seen, [expectedSource({}, { stage: "request", outcome: "rejected", code: "CDP-INPUT", candidate: null, specSha256: null })]);
  const thrown = new Error("synthetic parameter-binding failure"), bindingOrder = [], throwing = {};
  for (const key of fields) Object.defineProperty(throwing, key, { get() { bindingOrder.push(key); if (key === "guardrailPaths") throw thrown; return undefined; } });
  let observed = 0;
  assert.throws(() => preflightCriticDispatch(throwing, () => { observed++; }), (error) => error === thrown);
  assert.deepEqual(bindingOrder, fields.slice(0, 5)); assert.equal(observed, 0);
  for (const value of [null, undefined]) assert.throws(() => preflightCriticDispatch(value, () => { observed++; }), TypeError);
  assert.equal(observed, 0);
});

test("early request and base failures have no captured candidate or spec", (t) => {
  const fx = captureFixture(t);
  captureRejection(input(fx, { root: "" }), expectedSource(fx, { stage: "request", outcome: "rejected", code: "CDP-INPUT", candidate: null, specSha256: null }));
  for (const patch of [{ base: "absent-base" }, { candidate: "absent-candidate" }])
    captureRejection(input(fx, patch), expectedSource(fx, { stage: "candidate", outcome: "rejected", code: "CDP-GIT", candidate: null, specSha256: null }));
  const seen = [];
  assert.throws(() => preflightCriticDispatch(input(fx, { root: join(fx.root, "absent-root") }), (source) => { seen.push(source); }),
    (error) => error.code === "ENOENT");
  assert.deepEqual(seen, [expectedSource(fx, { stage: "request", outcome: "rejected", code: "CDP-UNEXPECTED", candidate: null, specSha256: null })]);
});

test("range and path rejections retain the validated candidate before any spec readback", (t) => {
  const fx = captureFixture(t);
  for (const [patch, stage, code] of [
    [{ base: fx.candidate }, "candidate", "CDP-RANGE"],
    [{ specPath: "../unsafe" }, "paths", "CDP-PATH"],
    [{ guardrailPaths: null }, "paths", "CDP-PATHS"],
    [{ guardrailPaths: ["duplicate.md", "duplicate.md"] }, "paths", "CDP-DUPLICATE-PATH"],
    [{ evidencePaths: [] }, "paths", "CDP-EVIDENCE-REQUIRED"],
    [{ priorCriticEvidencePath: "evidence/verify.json" }, "paths", "CDP-PRIOR-ALIASED"],
  ]) captureRejection(input(fx, patch), expectedSource(fx, { stage, outcome: "rejected", code, specSha256: null }));
});

test("spec binding becomes visible only after successful actual spec readback", (t) => {
  const fx = captureFixture(t);
  captureRejection(input(fx, { specPath: "specs/missing.md" }),
    expectedSource(fx, { stage: "candidate-files", outcome: "rejected", code: "CDP-CANDIDATE-PATH", specSha256: null }));
  captureRejection(input(fx, { guardrailPaths: ["governance/policies/missing.md"] }),
    expectedSource(fx, { stage: "candidate-files", outcome: "rejected", code: "CDP-CANDIDATE-PATH" }));
});

test("actual evidence and prior-evidence failures retain their owning stages and spec binding", (t) => {
  const fx = captureFixture(t);
  writeFileSync(join(fx.root, "evidence", "malformed.json"), "synthetic non-JSON");
  for (const [patch, stage, code] of [
    [{ evidencePaths: ["evidence"] }, "evidence", "CDP-EVIDENCE-FILE"],
    [{ evidencePaths: ["evidence/malformed.json"] }, "evidence", "CDP-EVIDENCE-JSON"],
    [{ evidencePaths: ["evidence/prior-critic.json"], priorCriticEvidencePath: null }, "evidence", "CDP-EVIDENCE-BINDING"],
    [{ priorCriticEvidencePath: "evidence" }, "prior-evidence", "CDP-EVIDENCE-FILE"],
  ]) captureRejection(input(fx, patch), expectedSource(fx, { stage, outcome: "rejected", code }));
  for (const [patch, stage] of [
    [{ evidencePaths: ["evidence/missing.json"] }, "evidence"],
    [{ priorCriticEvidencePath: "evidence/missing.json" }, "prior-evidence"],
  ]) {
    const seen = [];
    assert.throws(() => preflightCriticDispatch(input(fx, patch), (source) => { seen.push(source); }), (error) => error.code === "ENOENT");
    assert.deepEqual(seen, [expectedSource(fx, { stage, outcome: "rejected", code: "CDP-UNEXPECTED" })]);
  }
  const seen = [];
  const result = preflightCriticDispatch(input(fx, { priorCriticEvidencePath: "evidence/malformed.json" }), (source) => { seen.push(source); });
  assert.equal(result.status, "packet-ready", JSON.stringify(result)); assert.deepEqual(seen, [expectedSource(fx)]);
});

test("an actual missing candidate manifest is observed before governance or spec reads", (t) => {
  const fx = captureFixture(t);
  rmSync(join(fx.root, ".claude", "pipeline.yaml"));
  const candidate = commit(fx.root, "fixture missing manifest"), tree = git(fx.root, ["rev-parse", candidate + "^{tree}"]);
  captureRejection(input(fx, { candidate }), expectedSource({ ...fx, candidate, tree },
    { stage: "manifest", outcome: "rejected", code: "CDP-MANIFEST", specSha256: null }));
});

test("injected Git failures cover partial candidate inventory manifest governance and candidate-read branches", (t) => {
  const fx = captureFixture(t), originalSpawn = childProcess.spawnSync;
  for (const [match, response, stage, code, candidate] of [
    [(args) => args[2] === "rev-parse" && args[3] === fx.candidate + "^{tree}", { status: 0, stdout: "not-an-oid" }, "candidate", "CDP-REF", null],
    [(args) => args[2] === "ls-tree", { status: 1, stdout: "" }, "inventory", "CDP-GIT", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "ls-tree", { status: 0, stdout: "malformed inventory" }, "inventory", "CDP-TREE", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "ls-tree", { status: 0, stdout: "100644 blob " + "a".repeat(40) + "\t../unsafe\0" }, "inventory", "CDP-PATH", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "show" && args[3].endsWith(":.claude/pipeline.yaml"), { status: 1, stdout: "" }, "manifest", "CDP-MANIFEST", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "diff", { status: 1, stdout: "" }, "governance", "CDP-GIT", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "diff", { status: 0, stdout: "../unsafe\0" }, "governance", "CDP-PATH", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "show" && args[3].endsWith(":specs/spec.md"), { status: 1, stdout: "" }, "candidate-files", "CDP-CANDIDATE-READ", { commit: fx.candidate, tree: fx.tree }],
  ]) {
    let injected = 0;
    withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
      if (match(args)) { injected++; return response; }
      return originalSpawn(command, args, options);
    }]], () => captureRejection(input(fx), expectedSource(fx, { stage, outcome: "rejected", code, candidate, specSha256: null })));
    assert.equal(injected, 1, "one explicitly injected owner operation");
  }
});

test("a successful Git exit remains admissible when a contained host adds an EPERM diagnostic", (t) => {
  const fx = captureFixture(t), originalSpawn = childProcess.spawnSync;
  let injected = 0;
  withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
    const result = originalSpawn(command, args, options);
    if ((args[2] === "rev-parse" && args[3] === `${fx.base}^{commit}`) || args[2] === "show") {
      injected += 1;
      return { ...result, error: Object.assign(new Error("spawnSync git EPERM"), { code: "EPERM" }) };
    }
    return result;
  }]], () => {
    const result = preflightCriticDispatch(input(fx));
    assert.equal(result.status, "packet-ready", JSON.stringify(result));
  });
  assert.ok(injected > 1);
});

test("a successful EPERM Git observation remains admissible for the empty-tree read", (t) => {
  const fx = captureFixture(t), originalSpawn = childProcess.spawnSync;
  const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
  let emptyTreeInjected = false;
  withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
    if (args[2] === "rev-parse" && args[4] === `${fx.base}^{commit}`) return { status: 1, stdout: "" };
    if (args[2] === "rev-parse" && args[4] === `${fx.base}^{tree}`) return { status: 0, stdout: `${emptyTree}\n` };
    const result = originalSpawn(command, args, options);
    if (args[2] === "hash-object" && args[3] === "-t") {
      emptyTreeInjected = true;
      return { ...result, error: Object.assign(new Error("spawnSync git EPERM"), { code: "EPERM" }) };
    }
    return result;
  }]], () => {
    const result = preflightCriticDispatch(input(fx));
    assert.equal(result.status, "packet-ready", JSON.stringify(result));
  });
  assert.equal(emptyTreeInjected, true);
});

test("a successful EPERM Git observation remains admissible for a byte candidate read", (t) => {
  const fx = captureFixture(t), originalSpawn = childProcess.spawnSync;
  let byteReadInjected = false;
  withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
    const result = originalSpawn(command, args, options);
    if (args[2] === "show" && args[3].endsWith(":specs/spec.md") && options.encoding === null) {
      byteReadInjected = true;
      return { ...result, error: Object.assign(new Error("spawnSync git EPERM"), { code: "EPERM" }) };
    }
    return result;
  }]], () => {
    const result = preflightCriticDispatch(input(fx, {
      base: null,
      reviewScope: { kind: "current-artifacts", paths: ["specs/spec.md"] },
    }));
    assert.equal(result.status, "packet-ready", JSON.stringify(result));
  });
  assert.equal(byteReadInjected, true);
});

test("injected evidence containment refusal is captured without rerunning any guard", (t) => {
  const fx = captureFixture(t);
  withBuiltinMocks(t, [[path, "relative", () => ".."]], () => {
    captureRejection(input(fx), expectedSource(fx, { stage: "evidence", outcome: "rejected", code: "CDP-EVIDENCE-PATH" }));
  });
});

test("foreign thrown objects are rethrown identically without reading hostile properties", (t) => {
  const fx = captureFixture(t), originalRead = fs.readFileSync;
  let getters = 0;
  const foreign = Object.defineProperties(new Error("synthetic foreign exception"), {
    code: { get() { getters++; throw new Error("must not inspect code"); } },
    message: { get() { getters++; throw new Error("must not inspect message"); } },
  });
  for (const thrown of [foreign, null, "synthetic", new Proxy({}, { getPrototypeOf() { getters++; throw null; } })]) {
    const seen = [];
    withBuiltinMocks(t, [[fs, "readFileSync", (file, ...args) => {
      if (file === join(fx.root, "evidence", "verify.json")) throw thrown;
      return originalRead(file, ...args);
    }]], () => {
      let caught = false;
      try { preflightCriticDispatch(input(fx), (source) => { seen.push(source); throw new Error("observer failure"); }); }
      catch (error) { caught = true; assert.equal(error, thrown); }
      assert.equal(caught, true);
    });
    assert.deepEqual(seen, [expectedSource(fx, { stage: "evidence", outcome: "rejected", code: "CDP-UNEXPECTED" })]);
  }
  assert.equal(getters, 0);
});

test("invalid synchronous observer returns and exceptions cannot change admission or read return getters", (t) => {
  const fx = captureFixture(t), value = input(fx), expected = preflightCriticDispatch(value);
  let inspected = 0, calls = 0;
  const hostileReturn = Object.defineProperties({}, {
    then: { get() { inspected++; throw null; } }, ok: { get() { inspected++; throw null; } },
  });
  // Fulfilled Promise returns are invalid but ignored synchronously. This does
  // not claim containment of independently scheduled async rejections/side effects.
  for (const callback of [
    () => { calls++; throw new Error("synthetic observer failure"); },
    (source) => { calls++; source.candidate.commit = "0".repeat(40); source.code = "changed"; return false; },
    () => { calls++; return hostileReturn; },
    () => { calls++; return Promise.resolve({ ok: true, code: null }); },
  ]) {
    const before = calls;
    assert.deepEqual(preflightCriticDispatch(value, callback), expected); assert.equal(calls, before + 1);
    assert.throws(() => preflightCriticDispatch(input(fx, { evidencePaths: [] }), callback), { code: "CDP-EVIDENCE-REQUIRED" });
    assert.equal(calls, before + 2);
  }
  for (const callback of [null, undefined, false, 1, hostileReturn])
    assert.deepEqual(preflightCriticDispatch(value, callback), expected);
  assert.equal(inspected, 0);
});

test("callback capture adds no Git operations and candidate never follows later ref or HEAD changes", (t) => {
  const fx = captureFixture(t), originalSpawn = childProcess.spawnSync;
  const traces = [[], []];
  for (let index = 0; index < 2; index++) withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
    traces[index].push([command, [...args]]);
    return originalSpawn(command, args, options);
  }]], () => preflightCriticDispatch(input(fx), index === 0 ? null : () => ({ ok: true, code: null })));
  assert.deepEqual(traces[0], traces[1]);
  git(fx.root, ["branch", "capture-ref", fx.candidate]);
  const seen = []; let resolved = false, moved = false;
  withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
    if (resolved && !moved && args[2] === "rev-parse" && args[3] === fx.candidate + "^{tree}") {
      git(fx.root, ["update-ref", "refs/heads/capture-ref", fx.base]); git(fx.root, ["update-ref", "HEAD", fx.base]); moved = true;
    }
    const result = originalSpawn(command, args, options);
    if (args[2] === "rev-parse" && args[4] === "capture-ref^{commit}") resolved = true;
    return result;
  }]], () => {
    const result = preflightCriticDispatch(input(fx, { candidate: "capture-ref" }), (source) => { seen.push(source); });
    assert.deepEqual(result.candidate, { commit: fx.candidate, tree: fx.tree });
  });
  assert.equal(moved, true); assert.deepEqual(seen, [expectedSource(fx)]);
});

function prepareIndexedFeature(root, featureId, logicalWorkIds, taskId) {
  const prefix = `specs/${featureId}`;
  const specPath = `${prefix}/spec.md`, manifestPath = `${prefix}/lifecycle.json`, unitPath = `${prefix}/design/critic-review-unit.json`;
  mkdirSync(join(root, prefix, "design"), {recursive:true});
  mkdirSync(join(root, prefix, "evidence"), {recursive:true});
  writeFileSync(join(root, specPath), "# Complete behavior\nAC-1: deliver complete behavior\n");
  const unit = {schema:"pipeline.critic-review-unit.v1", kind:"feature-section", purpose:"Deliver one complete behavior", specPath, logicalWorkIds, criterionIds:["AC-1"], deliveryBoundary:{mainRef:git(root,["symbolic-ref","HEAD"])}, singletonRationale:null};
  writeFileSync(join(root,unitPath),JSON.stringify(unit));
  const manifest = {schema:"pipeline.feature-package.v1",feature:{id:featureId,rigor:2},state:"approved",artifacts:[{class:"spec",path:specPath,sha256:sha256(readFileSync(join(root,specPath))),authority:true,mutability:"mutable",retention:"active"},{class:"design",path:unitPath,sha256:sha256(readFileSync(join(root,unitPath))),authority:false,mutability:"immutable",retention:"retain"}]};
  writeFileSync(join(root,manifestPath),JSON.stringify(manifest));
  const base = commit(root,"declare feature review unit");
  writeFileSync(join(root,specPath),"# Complete behavior\nAC-1: deliver complete behavior\nImplemented behavior.\n");
  manifest.artifacts[0].sha256=sha256(readFileSync(join(root,specPath)));
  writeFileSync(join(root,manifestPath),JSON.stringify(manifest));
  const candidate=commit(root,"integrate feature behavior");
  const record={schema:"pipeline.dispatch-record.v3",taskId,agentType:"default",model:"gpt-5.6-luna",effort:"medium",rulesetSha:"b7797309cf6abe175fd52b0a8749d82b43714ea0",dispatcher:"elephant",outcome:"completed",commits:[candidate],candidateCommit:candidate,resultSha256:"a".repeat(64),log:[{phase:"implement",toolUseCount:1}],report:{text:"done",changedFiles:[specPath]},criticRequired:{schema:"pipeline.critic-required-decision.v1",trigger:{schema:"pipeline.critic-trigger-input.v1",rigorLevel:2,riskClass:"high",riskFlag:true,diff:{mechanical:false,architecture:false,guardrails:true,security:false}},appliedRow:"T1"}};
  writeFileSync(join(root,`evidence/dispatch-record-${taskId}.json`),JSON.stringify(record));
  const logPath=`${prefix}/evidence/targeted.log`,diagnosticPath=`${prefix}/evidence/diagnostic.json`,capturedPath=`evidence/${featureId}-targeted.log`;
  const diagnostic=produceCriticDiagnostic({root,candidate,specPath,guardrailPaths:[".claude/pipeline.yaml","governance/guidelines/review.md","governance/policies/checklist.md"],command:[process.execPath,"-e","process.exit(0)"],logPath:capturedPath});
  writeFileSync(join(root,logPath),readFileSync(join(root,capturedPath)));
  diagnostic.targeted.log.path=logPath;
  writeFileSync(join(root,diagnosticPath),JSON.stringify(diagnostic));
  for(const path of [logPath,diagnosticPath])manifest.artifacts.push({class:"candidate-evidence",path,sha256:sha256(readFileSync(join(root,path))),authority:false,mutability:"immutable",retention:"retain"});
  writeFileSync(join(root,manifestPath),JSON.stringify(manifest));
  const registrationCommit=commit(root,"register captured feature diagnostics");
  return {root,base,candidate,specPath,guardrailPaths:[],evidencePaths:[diagnosticPath],priorCriticEvidencePath:null,courseContext:{featureId,registrationCommit,acceptedReference:null,criterionLocator:null,deltaRequestPath:null}};
}

test("a new feature ID cannot reset logical work after an actual feature packet claim; unrelated work remains admissible", () => {
  const fx=fixture();
  try {
    rmSync(join(fx.root,"evidence"),{recursive:true,force:true});
    mkdirSync(join(fx.root,"evidence"));
    writeFileSync(join(fx.root,".gitignore"),"/evidence/\n");
    const manifestPath=join(fx.root,".claude","pipeline.yaml");
    writeFileSync(manifestPath,"schema: pipeline.manifest.v0\n"+readFileSync(manifestPath,"utf8"));
    commit(fx.root,"ignore private diagnostic input");
    const first=prepareIndexedFeature(fx.root,"original-feature",["scope-one","scope-two"],"feature-original-task");
    const firstRequest={preflightInput:first,taskId:"feature-original-task",projectId:"pipeline",sessionId:"feature-original-review",packetId:"7".repeat(32),route:{routeId:"session-critic",runner:"codex",adapter:"session-functional-equivalent",provider:"openai",modelTier:"higher-capability",effortTier:"xhigh"}};
    const admitted=admitSessionCriticReview(firstRequest);
    assert.equal(admitted.status,"admitted");
    assert.equal(admitSessionCriticReview(firstRequest).status,"already-admitted");
    assert.throws(() => admitSessionCriticReview({...firstRequest,sessionId:"new-feature-review-session",packetId:"8".repeat(32)}),error=>error.code==="CGB-BUDGET");
    const renamed=prepareIndexedFeature(fx.root,"renamed-without-supersedes",["scope-one","scope-two"],"feature-renamed-task");
    const denied=preflightCriticDispatch(renamed);
    assert.equal(denied.status,"refused",JSON.stringify(denied));
    assert.equal(denied.code,"CGB-CONFLICT");
    assert.equal(denied.dispatch.packetCreated,false);
    const mixed=prepareIndexedFeature(fx.root,"mixed-renamed-scope",["scope-one","new-scope"],"feature-mixed-task");
    assert.equal(preflightCriticDispatch(mixed).code,"CGB-CONFLICT");
    const unrelated=prepareIndexedFeature(fx.root,"unrelated-feature",["other-one","other-two"],"feature-unrelated-task");
    assert.equal(preflightCriticDispatch(unrelated).status,"packet-ready");
  } finally {rmSync(fx.root,{recursive:true,force:true});}
});

test("the shared guardrail derivation lists a changed JSON manifest as required with reason changed-manifest", async () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.root, ".claude", "pipeline.json"), "{}\n");
    const candidate = commit(fx.root, "change the JSON manifest");
    const { deriveRequiredCriticGuardrails } = await import("../lib/critic-required-guardrails.mjs");
    const result = deriveRequiredCriticGuardrails({ root: fx.root, candidate, base: fx.candidate, explicitGuardrails: [] });
    const manifest = result.required.find(({ path }) => path === ".claude/pipeline.json");
    assert.ok(manifest, JSON.stringify(result.required));
    assert.deepEqual(manifest.reasons, ["changed-manifest"]);
    assert.deepEqual(result.paths, result.required.map(({ path }) => path));
    assert.deepEqual([...result.paths].sort(), result.paths);
    assert.deepEqual(result.paths, [".claude/pipeline.json", ".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"]);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("a diagnostic lacking required guardrails fails CDI-GUARDRAILS and the failure lists exactly the required paths", () => {
  const fx = fixture();
  try {
    const value = produceCriticDiagnostic({ root: fx.root, specPath: "specs/spec.md", guardrailPaths: [], command: [process.execPath, "-e", "process.exit(0)"], logPath: "evidence/lacking.log" });
    writeFileSync(join(fx.root, "evidence/lacking.json"), JSON.stringify(value));
    const required = [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"];
    assert.throws(() => preflightCriticDispatch(input(fx, { evidencePaths: ["evidence/lacking.json"] })), (error) => {
      assert.ok(error instanceof CriticDispatchPreflightError);
      assert.equal(error.code, "CDP-EVIDENCE-MODE");
      assert.equal(error.details.diagnosticCode, "CDI-GUARDRAILS");
      assert.deepEqual(error.details.requiredGuardrailPaths, required);
      for (const path of required) assert.ok(error.message.includes(path), error.message);
      return true;
    });
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

// ---- CCI: correction-input bindings of a Critic range (AC-160; recon CRITIC-RANGE-BINDINGS-RECON-2026-10-28) ----
const CCI_SCRIPT = join(path.dirname(fileURLToPath(import.meta.url)), "critic-correction-input-bindings.mjs");
const CCI_MARKER = "MARKER-7d41c9e2-excluded-body-bytes";
function cciFixture() {
  const root = mkdtempSync(join(tmpdir(), "cci-bindings-"));
  git(root, ["init", "-q"]);
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify({ project: "fixture", handover: "docs/state.md" })}\n`);
  writeFileSync(join(root, "docs", "state.md"), "state v0\n");
  writeFileSync(join(root, "src", "a.txt"), "alpha content that is long enough for rename detection\nsecond line\nthird line\n");
  return { root, base: commit(root, "base") };
}
function cciWrite(root, rel, content) {
  mkdirSync(join(root, ...rel.split("/").slice(0, -1)), { recursive: true });
  writeFileSync(join(root, ...rel.split("/")), content);
}
function cciRefusal(run, code) {
  assert.throws(run, (error) => { assert.ok(error instanceof CriticCorrectionInputBindingsError); assert.equal(error.code, code); return true; });
}
function cciCli(root, base, head, out) {
  return spawnSync(process.execPath, [CCI_SCRIPT, "derive", "--root", root, "--base", base, "--head", head, "--out", out], { encoding: "utf8" });
}

test("CCI (1) a source-only range has no exclusions and lists every changed path as a source path", () => {
  const fx = cciFixture();
  try {
    cciWrite(fx.root, "src/a.txt", "changed\n");
    cciWrite(fx.root, "src/b.txt", "new\n");
    const head = commit(fx.root, "source only");
    const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
    assert.equal(doc.schema, CRITIC_CORRECTION_INPUT_BINDINGS_SCHEMA);
    assert.equal(CRITIC_CORRECTION_INPUT_BINDINGS_SCHEMA, "pipeline.critic-correction-input-bindings.v1");
    assert.deepEqual(doc.exclusions, []);
    assert.deepEqual(doc.sourcePaths, ["src/a.txt", "src/b.txt"]);
    assert.equal(doc.base.commit, fx.base);
    assert.equal(doc.head.commit, head);
    assert.equal(doc.head.tree, git(fx.root, ["rev-parse", `${head}^{tree}`]));
    assert.deepEqual(doc.commits.map((c) => c.commit), [head]);
    assert.deepEqual(doc.commits[0].parents, [fx.base]);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (2) a retained prior result under the evidence/critic layout is excluded by exact path with its version list", () => {
  const fx = cciFixture();
  try {
    cciWrite(fx.root, "specs/feat-x/evidence/critic/p1/report.md", "report one\n");
    cciWrite(fx.root, "evidence/critic/p2/report.md", "report two\n");
    cciWrite(fx.root, "evidence/other/notes.md", "not a critic result\n");
    cciWrite(fx.root, "src/a.txt", "changed\n");
    const head = commit(fx.root, "with retained results");
    const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
    assert.deepEqual(doc.exclusions.map((e) => e.path), ["evidence/critic/p2/report.md", "specs/feat-x/evidence/critic/p1/report.md"]);
    for (const entry of doc.exclusions) {
      assert.equal(entry.role, "retained prior result");
      assert.equal(entry.versions.length, 1);
      assert.equal(entry.versions[0].commit, head);
      assert.equal(entry.versions[0].change, "added");
      assert.equal(entry.versions[0].blobBefore, "absent");
      assert.equal(entry.versions[0].modeBefore, "absent");
      assert.equal(entry.versions[0].modeAfter, "100644");
    }
    assert.equal(doc.exclusions[0].versions[0].blobAfter, git(fx.root, ["rev-parse", `${head}:evidence/critic/p2/report.md`]));
    assert.equal(doc.exclusions[0].versions[0].sha256After, sha256("report two\n"));
    assert.deepEqual(doc.sourcePaths, ["evidence/other/notes.md", "src/a.txt"]);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (2b) the lineage and delta-request files the course registration writes beside the evidence directory are retained prior results (PF-98)", () => {
  const fx = cciFixture();
  const digest = "a".repeat(64);
  const lineage = `specs/feat-x/evidence/critic-lineage-${digest}.json`;
  const delta = `specs/feat-x/evidence/critic-delta-request-${digest}.json`;
  const lookalikes = [
    `specs/feat-x/evidence/critic-lineage-${"a".repeat(63)}.json`,
    `specs/feat-x/evidence/critic-lineage-${digest}.json.bak`,
    `specs/feat-x/notes/critic-delta-request-${digest}.json`,
    `specs/feat-x/evidence/sub/critic-lineage-${digest}.json`,
  ];
  try {
    cciWrite(fx.root, lineage, '{"verdict":"FAIL","findings":[]}\n');
    cciWrite(fx.root, delta, '{"schema":"pipeline.critic-delta-request.v1"}\n');
    for (const path of lookalikes) cciWrite(fx.root, path, "not a registration artifact\n");
    cciWrite(fx.root, "src/a.txt", "changed\n");
    const head = commit(fx.root, "course registration evidence");
    const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
    assert.deepEqual(doc.exclusions.map((e) => e.path), [delta, lineage]);
    for (const entry of doc.exclusions) assert.equal(entry.role, "retained prior result");
    assert.deepEqual(doc.sourcePaths, [...lookalikes, "src/a.txt"].sort());
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

// D213: the calibration names, positively, the files that quote earlier Critic findings (the finding-disposition record role).
const cciCalibration = (root, extra) => cciWrite(root, "project/pipeline.json", `${JSON.stringify({ project: "fixture", handover: "docs/state.md", ...extra })}\n`);
test("CCI (2c) files named by the calibration finding-record list are finding-disposition records; a file never declares itself and look-alikes stay source (D213)", () => {
  const fx = cciFixture();
  try {
    cciCalibration(fx.root, { [FINDING_RECORDS_FIELD]: ["backlog/items/", "docs/pipeline-feedback-06.md"] });
    cciWrite(fx.root, "backlog/items/2026-10-30-deviation.md", `source: "Critic-Befund F-1 ${CCI_MARKER}"\n`);
    cciWrite(fx.root, "docs/pipeline-feedback-06.md", `Critic-Befund F3 ${CCI_MARKER}\n`);
    cciWrite(fx.root, "backlog/other/x.md", "not listed\n");
    cciWrite(fx.root, "docs/pipeline-feedback-07.md", "not listed\n");
    cciWrite(fx.root, "src/a.txt", "---\nrole: finding-disposition record\n---\nchanged\n");
    const head = commit(fx.root, "finding records");
    const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
    assert.deepEqual(doc.exclusions.map((e) => [e.path, e.role]), [["backlog/items/2026-10-30-deviation.md", "finding-disposition record"], ["docs/pipeline-feedback-06.md", "finding-disposition record"]]);
    assert.deepEqual(doc.sourcePaths, ["backlog/other/x.md", "docs/pipeline-feedback-07.md", "project/pipeline.json", "src/a.txt"]);
    assert.equal(JSON.stringify(doc).includes(CCI_MARKER), false);
    assert.deepEqual(bindingsRoleCounts(doc), { "retained prior result": 0, "project-state record": 0, "finding-disposition record": 2, source: 4 });
    // Without the list in the calibration at the head the same files are source: only the committed list excludes.
    cciCalibration(fx.root, {});
    const unlisted = commit(fx.root, "drop the finding-record list");
    const without = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head: unlisted });
    assert.deepEqual(without.exclusions, []);
    assert.ok(without.sourcePaths.includes("backlog/items/2026-10-30-deviation.md") && without.sourcePaths.includes("docs/pipeline-feedback-06.md"));
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (2d) a malformed finding-record list is refused CCI-FINDING-RECORDS, also with projectStateOptional, and an absent list means none (D213)", () => {
  const fx = cciFixture();
  try {
    cciWrite(fx.root, "src/a.txt", "changed\n");
    const absent = commit(fx.root, "no list");
    assert.equal(deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head: absent }).exclusions.length, 0);
    const bad = [
      "backlog/items/", { path: "backlog/items/" },
      ["backlog/items/*.md"], ["/abs/path.md"], ["../up.md"], ["a/./b.md"], ["a\\b.md"], [""], [7], ["a//b.md"],
      Array.from({ length: 65 }, (_, i) => `backlog/items/${i}.md`),
    ];
    for (const value of bad) {
      cciCalibration(fx.root, { [FINDING_RECORDS_FIELD]: value });
      const head = commit(fx.root, `bad list ${JSON.stringify(value).slice(0, 30)}`);
      cciRefusal(() => deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head }), "CCI-FINDING-RECORDS");
      cciRefusal(() => deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head, projectStateOptional: true }), "CCI-FINDING-RECORDS");
    }
    cciCalibration(fx.root, { [FINDING_RECORDS_FIELD]: [] });
    assert.equal(deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head: commit(fx.root, "empty list") }).exclusions.length, 0);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (2e) a rename between a finding-record path and a source path crosses classes and is refused CCI-MIXED (D213)", () => {
  const fx = cciFixture();
  try {
    cciCalibration(fx.root, { [FINDING_RECORDS_FIELD]: ["backlog/items/"] });
    const calibrated = commit(fx.root, "calibrate finding records");
    mkdirSync(join(fx.root, "backlog", "items"), { recursive: true });
    git(fx.root, ["mv", "src/a.txt", "backlog/items/a.txt"]);
    const head = commit(fx.root, "rename into the finding records");
    cciRefusal(() => deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: calibrated, head }), "CCI-MIXED");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (3) a state file changed in three commits gives three versions with chained blob and mode transitions", () => {
  const fx = cciFixture();
  try {
    const blob0 = git(fx.root, ["rev-parse", `${fx.base}:docs/state.md`]);
    cciWrite(fx.root, "docs/state.md", "state v1\n");
    const c1 = commit(fx.root, "state 1");
    cciWrite(fx.root, "docs/state.md", "state v2\n");
    cciWrite(fx.root, "src/a.txt", "touched\n");
    const c2 = commit(fx.root, "state 2");
    cciWrite(fx.root, "docs/state.md", "state v3\n");
    fs.chmodSync(join(fx.root, "docs", "state.md"), 0o755);
    const c3 = commit(fx.root, "state 3");
    const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head: c3 });
    assert.equal(doc.exclusions.length, 1);
    const entry = doc.exclusions[0];
    assert.equal(entry.path, "docs/state.md");
    assert.equal(entry.role, "project-state record");
    assert.deepEqual(entry.versions.map((v) => v.commit), [c1, c2, c3]);
    assert.equal(entry.versions[0].blobBefore, blob0);
    assert.equal(entry.versions[1].blobBefore, entry.versions[0].blobAfter);
    assert.equal(entry.versions[2].blobBefore, entry.versions[1].blobAfter);
    assert.equal(entry.versions[2].blobAfter, git(fx.root, ["rev-parse", `${c3}:docs/state.md`]));
    assert.deepEqual(entry.versions.map((v) => [v.modeBefore, v.modeAfter]), [["100644", "100644"], ["100644", "100644"], ["100644", "100755"]]);
    assert.deepEqual(entry.versions.map((v) => v.sha256After), [sha256("state v1\n"), sha256("state v2\n"), sha256("state v3\n")]);
    assert.deepEqual(doc.commits.map((c) => c.commit), [c1, c2, c3]);
    assert.deepEqual(doc.sourcePaths, ["src/a.txt"]);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (4) a deleted state file records explicit absence on the after side", () => {
  const fx = cciFixture();
  try {
    git(fx.root, ["rm", "-q", "docs/state.md"]);
    const head = commit(fx.root, "delete state");
    const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
    assert.equal(doc.exclusions.length, 1);
    const version = doc.exclusions[0].versions[0];
    assert.equal(version.change, "deleted");
    assert.equal(version.blobAfter, "absent");
    assert.equal(version.modeAfter, "absent");
    assert.equal(version.sha256After, "absent");
    assert.equal(version.blobBefore, git(fx.root, ["rev-parse", `${fx.base}:docs/state.md`]));
    assert.equal(version.modeBefore, "100644");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (5) a rename across classes is refused CCI-MIXED", () => {
  const fx = cciFixture();
  try {
    mkdirSync(join(fx.root, "evidence", "critic", "p1"), { recursive: true });
    git(fx.root, ["mv", "src/a.txt", "evidence/critic/p1/a.txt"]);
    const head = commit(fx.root, "rename across classes");
    cciRefusal(() => deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head }), "CCI-MIXED");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (6) the document, the written file and the CLI stdout carry no byte of an excluded file", () => {
  const fx = cciFixture();
  try {
    cciWrite(fx.root, "evidence/critic/p1/report.md", `${CCI_MARKER}\n`);
    cciWrite(fx.root, "docs/state.md", `state with ${CCI_MARKER}\n`);
    cciWrite(fx.root, "src/a.txt", "changed\n");
    const head = commit(fx.root, "excluded bodies");
    const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
    assert.equal(doc.exclusions.length, 2);
    assert.equal(JSON.stringify(doc).includes(CCI_MARKER), false);
    const result = cciCli(fx.root, fx.base, head, "scratch/bindings.json");
    assert.equal(result.status, 0, String(result.stderr));
    assert.equal(result.stdout.includes(CCI_MARKER), false);
    const line = JSON.parse(result.stdout.trim());
    assert.equal(line.schema, CRITIC_CORRECTION_INPUT_BINDINGS_SCHEMA);
    assert.equal(line.digestSha256, doc.digestSha256);
    const written = readFileSync(join(fx.root, "scratch", "bindings.json"), "utf8");
    assert.equal(written.includes(CCI_MARKER), false);
    assert.equal(JSON.parse(written).digestSha256, doc.digestSha256);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (7) the same range twice gives the same digest, and the digest covers the document without its own field", () => {
  const fx = cciFixture();
  try {
    cciWrite(fx.root, "docs/state.md", "state v1\n");
    cciWrite(fx.root, "src/a.txt", "changed\n");
    const head = commit(fx.root, "change");
    const one = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
    const two = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
    assert.equal(one.digestSha256, two.digestSha256);
    assert.deepEqual(one, two);
    const { digestSha256, ...rest } = one;
    assert.equal(digestSha256, sha256Canonical(rest));
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI (8) an unreadable calibration is refused CCI-CALIBRATION, and the CLI writes only under scratch/ and never overwrites", () => {
  const fx = cciFixture();
  try {
    cciWrite(fx.root, "src/a.txt", "changed\n");
    const head = commit(fx.root, "source");
    const okOut = cciCli(fx.root, fx.base, head, "scratch/out.json");
    assert.equal(okOut.status, 0, String(okOut.stderr));
    const again = cciCli(fx.root, fx.base, head, "scratch/out.json");
    assert.equal(again.status, 2);
    assert.equal(JSON.parse(again.stdout.trim()).code, "CCI-OUT");
    const outside = cciCli(fx.root, fx.base, head, "evidence/out.json");
    assert.equal(outside.status, 2);
    assert.equal(JSON.parse(outside.stdout.trim()).code, "CCI-OUT");
    assert.equal(spawnSync("test", ["-e", join(fx.root, "evidence", "out.json")]).status, 1);
    writeFileSync(join(fx.root, "project", "pipeline.json"), "{ not json");
    const broken = commit(fx.root, "break calibration");
    cciRefusal(() => deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head: broken }), "CCI-CALIBRATION");
    git(fx.root, ["rm", "-q", "project/pipeline.json"]);
    const missing = commit(fx.root, "remove calibration");
    cciRefusal(() => deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head: missing }), "CCI-CALIBRATION");
    const cli = cciCli(fx.root, fx.base, missing, "scratch/other.json");
    assert.equal(cli.status, 2);
    assert.equal(JSON.parse(cli.stdout.trim()).code, "CCI-CALIBRATION");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

// ---- CCI preflight: a range with project-state or retained-result paths needs the bindings file (AC-160; slice C3) ----
function cciPreflightFixture(candidateFiles, { calibration = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "cci-preflight-"));
  git(root, ["init", "-q"]);
  cciWrite(root, ".claude/pipeline.yaml", "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  cciWrite(root, "governance/guidelines/review.md", "Review changed code.\n");
  cciWrite(root, "governance/policies/checklist.md", "- verify\n");
  cciWrite(root, "specs/spec.md", "# Spec\n");
  cciWrite(root, "docs/state.md", "state v0\n");
  cciWrite(root, "src/a.txt", "alpha content that is long enough for rename detection\nsecond line\nthird line\n");
  if (calibration) cciWrite(root, "project/pipeline.json", `${JSON.stringify({ project: "fixture", handover: "docs/state.md" })}\n`);
  const base = commit(root, "base");
  cciWrite(root, "specs/spec.md", "# Spec\n\nchanged\n");
  for (const [rel, content] of Object.entries(candidateFiles)) cciWrite(root, rel, content);
  const candidate = commit(root, "candidate");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  cciWrite(root, "evidence/verify.json", `${JSON.stringify(verifyValue(candidate, tree))}\n`);
  cciWrite(root, "evidence/prior-critic.json", `${JSON.stringify({ candidate: { commit: base, tree: git(root, ["rev-parse", `${base}^{tree}`]) } })}\n`);
  return { root, base, candidate, tree };
}
function cdpRefusal(run, code) {
  let caught = null;
  assert.throws(run, (error) => { caught = error; return error instanceof CriticDispatchPreflightError && error.code === code; });
  return caught;
}
function cciWriteBindings(fx, head, rel = "scratch/bindings.json") {
  const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head });
  cciWrite(fx.root, rel, `${JSON.stringify(doc)}\n`);
  return doc;
}

test("CCI preflight (1) a range without state or retained-result paths admits as before and echoes no bindings", () => {
  const fx = cciPreflightFixture({ "src/a.txt": "changed\n" });
  try {
    const result = preflightCriticDispatch(input(fx));
    assert.equal(result.status, "packet-ready");
    assert.equal(Object.hasOwn(result, "correctionInputBindings"), false);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI preflight (2) a range with the handover file changed and no bindings field is refused CDP-CORRECTION-INPUT-REQUIRED with a verb-first message", () => {
  const fx = cciPreflightFixture({ "docs/state.md": "state v1\n" });
  try {
    const error = cdpRefusal(() => preflightCriticDispatch(input(fx)), "CDP-CORRECTION-INPUT-REQUIRED");
    assert.ok(error.message.startsWith("Run "));
    assert.ok(error.message.includes("critic-correction-input-bindings.mjs derive"));
    assert.equal(error.message.includes("\n"), false);
    assert.ok(error.message.length <= 220);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI preflight (3) the same range with a correct bindings file admits and echoes its path and digest", () => {
  const fx = cciPreflightFixture({ "docs/state.md": "state v1\n", "src/a.txt": "changed\n" });
  try {
    const doc = cciWriteBindings(fx, fx.candidate);
    const result = preflightCriticDispatch(input(fx, { correctionInputBindings: "scratch/bindings.json" }));
    assert.equal(result.status, "packet-ready");
    assert.deepEqual(result.correctionInputBindings, { path: "scratch/bindings.json", digestSha256: doc.digestSha256 });
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI preflight (4) a bindings file written for another head, or an unreadable one, is CDP-CORRECTION-INPUT-STALE", () => {
  const fx = cciPreflightFixture({ "docs/state.md": "state v1\n" });
  try {
    cciWrite(fx.root, "docs/state.md", "state v2\n");
    const later = commit(fx.root, "later head");
    cciWriteBindings(fx, later);
    const error = cdpRefusal(() => preflightCriticDispatch(input(fx, { correctionInputBindings: "scratch/bindings.json" })), "CDP-CORRECTION-INPUT-STALE");
    assert.ok(error.message.startsWith("Run "));
    assert.ok(error.message.includes("critic-correction-input-bindings.mjs derive"));
    assert.ok(error.message.length <= 220 && !error.message.includes("\n"));
    cdpRefusal(() => preflightCriticDispatch(input(fx, { correctionInputBindings: "scratch/absent.json" })), "CDP-CORRECTION-INPUT-STALE");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI preflight (5) a retained prior result under the Critic results location triggers the requirement", () => {
  const fx = cciPreflightFixture({ "specs/feat-x/evidence/critic/p1/result.md": "retained\n" });
  try {
    cdpRefusal(() => preflightCriticDispatch(input(fx)), "CDP-CORRECTION-INPUT-REQUIRED");
    cciWriteBindings(fx, fx.candidate);
    assert.equal(preflightCriticDispatch(input(fx, { correctionInputBindings: "scratch/bindings.json" })).status, "packet-ready");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI preflight (6) a rename across classes is CDP-CORRECTION-INPUT-REFUSED carrying the CCI code", () => {
  const fx = cciPreflightFixture({});
  try {
    mkdirSync(join(fx.root, "evidence", "critic", "p1"), { recursive: true });
    git(fx.root, ["mv", "src/a.txt", "evidence/critic/p1/a.txt"]);
    const candidate = commit(fx.root, "rename across classes");
    const tree = git(fx.root, ["rev-parse", "HEAD^{tree}"]);
    writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify(verifyValue(candidate, tree))}\n`);
    const error = cdpRefusal(() => preflightCriticDispatch(input({ ...fx, candidate })), "CDP-CORRECTION-INPUT-REFUSED");
    assert.ok(error.message.includes("CCI-MIXED"));
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("CCI preflight (7) projectStateOptional lets an unreadable calibration mean no project-state paths, while the default still refuses", () => {
  const fx = cciPreflightFixture({ "docs/state.md": "state v1\n", "evidence/critic/p1/r.md": "retained\n" }, { calibration: false });
  try {
    cciRefusal(() => deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head: fx.candidate }), "CCI-CALIBRATION");
    const doc = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.base, head: fx.candidate, projectStateOptional: true });
    assert.deepEqual(doc.exclusions.map((entry) => entry.path), ["evidence/critic/p1/r.md"]);
    assert.ok(doc.sourcePaths.includes("docs/state.md"));
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

// ===== CCA-PARENT push-review route (backlog 2026-10-30): consumer lineage shape, followed repair, base derivation, refusal texts =====
import { admitSessionCriticReview as parentAdmit, finalizeSessionCriticReview as parentFinalize, runSessionCriticFinalizerCli as parentFinalizerCli } from "./session-critic-finalizer.mjs";
import { addCriticReviewLineage as parentAddLineage, addCriticDeltaRequest as parentAddDelta } from "../lib/feature-package-registration.mjs";
import * as parentAdmissionLib from "../lib/critic-course-admission.mjs";
import * as parentPushPrepare from "./push-prepare.mjs";
const PARENT_GUARDRAILS = [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"];
const PARENT_PASS = { findings: [], deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent", trajectory_evidence: "candidate evidence inspected", briefing_violations: [], pass: true };
const PARENT_FAIL = { ...PARENT_PASS, pass: false, findings: [{ gap: "behavior missing", risk: "consumer breaks", severity: "major", evidence: "specs/held-feature/spec.md:1", spec_ref: "AC-1" }] };
const parentOrigin = (q) => ({ schema: "pipeline.session-critic-source-return.v1", issuer: "source", packetId: q.packetId, packetDigest: q.packetDigest, claimant: q.claimant, sessionId: q.sessionId, verdictSha256: q.verdictSha256, issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 });
const parentCommitPaths = (root, paths, message) => { git(root, ["add", "--", ...paths]); git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]); return git(root, ["rev-parse", "HEAD"]); };
function parentBindings(root, base, head) {
  const path = `scratch/correction-input-bindings-${head.slice(0, 12)}.json`;
  mkdirSync(join(root, "scratch"), { recursive: true });
  writeFileSync(join(root, path), `${JSON.stringify(deriveCriticCorrectionInputBindings({ repoRoot: root, base, head, projectStateOptional: true }), null, 2)}\n`);
  return path;
}
function parentRegisterDiagnostic(root, featureId, candidate, tag) {
  const specPath = `specs/${featureId}/spec.md`, manifestPath = `specs/${featureId}/lifecycle.json`;
  const logPath = `specs/${featureId}/evidence/targeted-${tag}.log`, diagnosticPath = `specs/${featureId}/evidence/diagnostic-${tag}.json`, capturedPath = `evidence/${featureId}-targeted-${tag}.log`;
  const produced = produceCriticDiagnostic({ root, candidate, specPath, guardrailPaths: PARENT_GUARDRAILS, command: [process.execPath, "-e", "process.exit(0)"], logPath: capturedPath });
  writeFileSync(join(root, logPath), readFileSync(join(root, capturedPath)));
  produced.targeted.log.path = logPath;
  writeFileSync(join(root, diagnosticPath), JSON.stringify(produced));
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
  for (const path of [logPath, diagnosticPath]) manifest.artifacts.push({ class: "candidate-evidence", path, sha256: sha256(readFileSync(join(root, path))), authority: false, mutability: "immutable", retention: "retain" });
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  const registration = parentCommitPaths(root, [manifestPath, logPath, diagnosticPath], `register the ${tag} diagnostic`);
  return { diagnosticPath, registration };
}
function parentDeltaRequest(root, changedBehaviorClaims = ["fix-one"], flags = {}) {
  const base = { changedBehaviorClaims, coordinatorImpactConfirmed: true, trustBoundaryChanged: false, impactAmbiguous: false, ...flags };
  writeFileSync(join(root, "delta-input.json"), JSON.stringify({ ...base, pathInvariantMap: { "placeholder.mjs": ["inv-one"] } }));
  const first = parentAddDelta({ root, inputPath: "delta-input.json" });
  assert.equal(first.code, "FPR-DELTA-MAP", JSON.stringify(first));
  writeFileSync(join(root, "delta-input.json"), JSON.stringify({ ...base, pathInvariantMap: Object.fromEntries(first.changedPaths.map((path) => [path, ["inv-one"]])) }));
  const added = parentAddDelta({ root, inputPath: "delta-input.json" });
  assert.equal(added.status, "delta-request-added", JSON.stringify(added));
  return { added, registration: parentCommitPaths(root, added.commitPaths, "register the delta request") };
}
function parentRound(root, { featureId, taskId, packetId, base, candidate, registrationCommit, deltaRequestPath, diagnosticPath, verdict }) {
  const specPath = `specs/${featureId}/spec.md`;
  const record = { schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [candidate], candidateCommit: candidate, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: [specPath] }, criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" } };
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), JSON.stringify(record));
  const preflightInput = { root, base, candidate, specPath, guardrailPaths: [], evidencePaths: [diagnosticPath], priorCriticEvidencePath: null, courseContext: { featureId, registrationCommit, acceptedReference: null, criterionLocator: null, deltaRequestPath },
    ...(deltaRequestPath === null ? {} : { correctionInputBindings: parentBindings(root, base, candidate) }) };
  const request = { preflightInput, taskId, projectId: "pipeline", sessionId: `session-${packetId.slice(0, 4)}`, packetId, route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" }, verdict };
  parentAdmit(request, {});
  const finalized = parentFinalize(request, { readOriginalSourceReturnFn: parentOrigin });
  assert.equal(finalized.status, "completed", JSON.stringify(finalized));
}
/** The consumer's shape: rounds 1 and 2 registered as lineage, round 3 passed but not registered, correction commits after it. */
function parentLineageFixture({ afterRound = null } = {}) {
  const featureId = "held-feature", prefix = `specs/${featureId}`, specPath = `${prefix}/spec.md`, manifestPath = `${prefix}/lifecycle.json`, unitPath = `${prefix}/design/critic-review-unit.json`;
  const root = mkdtempSync(join(tmpdir(), "cdp-parent-"));
  git(root, ["init", "-q", "-b", "main"]);
  mkdirSync(join(root, ".claude"), { recursive: true }); mkdirSync(join(root, "governance", "guidelines"), { recursive: true }); mkdirSync(join(root, "governance", "policies"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngovernance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance", "policies", "checklist.md"), "- verify\n");
  writeFileSync(join(root, ".gitignore"), "/evidence/\n/scratch/\n");
  commit(root, "base");
  mkdirSync(join(root, prefix, "design"), { recursive: true }); mkdirSync(join(root, prefix, "evidence"), { recursive: true });
  writeFileSync(join(root, specPath), "# Complete behavior\nAC-1: deliver complete behavior\n");
  const unit = { schema: "pipeline.critic-review-unit.v1", kind: "feature-section", purpose: "Deliver one complete behavior", specPath, logicalWorkIds: ["scope-one", "scope-two"], criterionIds: ["AC-1"], deliveryBoundary: { mainRef: git(root, ["symbolic-ref", "HEAD"]) }, singletonRationale: null };
  writeFileSync(join(root, unitPath), JSON.stringify(unit));
  const topo = [["prd", "prd.md", true, "mutable", "active"], ["acceptance", "acceptance.md", false, "mutable", "active"], ["result", "result.md", false, "mutable", "active"], ["candidate-evidence", "evidence/seed.json", false, "immutable", "retain"]].map(([klass, rel, authority, mutability, retention]) => {
    const path = `${prefix}/${rel}`; writeFileSync(join(root, path), `${klass}\n`);
    return { class: klass, path, sha256: sha256(readFileSync(join(root, path))), authority, mutability, retention };
  });
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: featureId, rigor: 2 }, state: "approved", candidate: null, supersedes: null, artifacts: [
    { class: "spec", path: specPath, sha256: sha256(readFileSync(join(root, specPath))), authority: true, mutability: "mutable", retention: "active" },
    { class: "design", path: unitPath, sha256: sha256(readFileSync(join(root, unitPath))), authority: false, mutability: "immutable", retention: "retain" }, ...topo] };
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  const genesis = commit(root, "declare feature review unit");
  writeFileSync(join(root, specPath), "# Complete behavior\nAC-1: deliver complete behavior\nImplemented behavior.\n");
  manifest.artifacts[0].sha256 = sha256(readFileSync(join(root, specPath)));
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  const c1 = commit(root, "integrate feature behavior");
  const d1 = parentRegisterDiagnostic(root, featureId, c1, "r1");
  parentRound(root, { featureId, taskId: "parent-task-1", packetId: "9a".repeat(16), base: genesis, candidate: c1, registrationCommit: d1.registration, deltaRequestPath: null, diagnosticPath: d1.diagnosticPath, verdict: PARENT_FAIL });
  const l1 = parentAddLineage({ root, packetId: "9a".repeat(16) });
  assert.equal(l1.status, "lineage-added", JSON.stringify(l1)); parentCommitPaths(root, l1.commitPaths, "register lineage of round 1");
  const correct = (name) => { mkdirSync(join(root, "src"), { recursive: true }); writeFileSync(join(root, `src/${name}.mjs`), `export const ${name} = 1;\n`); return commit(root, `correction ${name}`); };
  const c2 = correct("fix2"); const d2 = parentRegisterDiagnostic(root, featureId, c2, "r2"); const q2 = parentDeltaRequest(root);
  parentRound(root, { featureId, taskId: "parent-task-2", packetId: "9b".repeat(16), base: c1, candidate: c2, registrationCommit: q2.registration, deltaRequestPath: q2.added.deltaRequestPath, diagnosticPath: d2.diagnosticPath, verdict: PARENT_FAIL });
  const l2 = parentAddLineage({ root, packetId: "9b".repeat(16) });
  assert.equal(l2.status, "lineage-added", JSON.stringify(l2)); parentCommitPaths(root, l2.commitPaths, "register lineage of round 2");
  if (afterRound === 2) return { root, featureId, specPath, genesis, c1, c2, correct };
  const c3 = correct("fix3"); const d3 = parentRegisterDiagnostic(root, featureId, c3, "r3"); const q3 = parentDeltaRequest(root);
  parentRound(root, { featureId, taskId: "parent-task-3", packetId: "9c".repeat(16), base: c2, candidate: c3, registrationCommit: q3.registration, deltaRequestPath: q3.added.deltaRequestPath, diagnosticPath: d3.diagnosticPath, verdict: PARENT_PASS });
  // Round 3 passed but its lineage is never registered; correction commits follow it.
  const c4 = correct("fix4"); const d4 = parentRegisterDiagnostic(root, featureId, c4, "r4");
  return { root, featureId, specPath, genesis, c1, c2, c3, c4, evidence4: d4.diagnosticPath, head: d4.registration };
}
test("CCA-PARENT a push review of a feature with course history names the last registered round and a repair that is followed to an admitted dispatch", () => {
  const fx = parentLineageFixture();
  try {
    const base = { root: fx.root, base: fx.genesis, candidate: fx.c4, specPath: fx.specPath, guardrailPaths: [], evidencePaths: [fx.evidence4], priorCriticEvidencePath: null, correctionInputBindings: parentBindings(fx.root, fx.genesis, fx.c4) };
    const refused = preflightCriticDispatch(base);
    assert.equal(refused.status, "refused", JSON.stringify(refused));
    assert.equal(refused.code, "CCA-PARENT");
    assert.deepEqual(refused.detail, { lastRegisteredRound: 2, lastRegisteredCandidate: fx.c2, expectedBase: fx.c2, givenBase: fx.genesis });
    assert.notEqual(refused.repair.route, "none", JSON.stringify(refused.repair));
    const steps = refused.repair.steps;
    assert.ok(steps.every((step) => step.command.includes("${PIPELINE_PLUGIN_ROOT}/scripts/")), JSON.stringify(steps));
    assert.match(steps[0].command, /session-critic-finalizer\.mjs inspect-course-takeover --root <root> --request scratch\/takeover-inspect\.json/u);
    assert.match(steps[1].command, /session-critic-finalizer\.mjs supersede-course-takeover/u);
    assert.match(steps[2].command, /register-feature-package\.mjs --root <root> --add-delta-request <input\.json>/u);
    assert.match(steps[3].command, new RegExp(`critic-dispatch-preflight\\.mjs --root <root> --base ${fx.c2} --candidate ${fx.c4} --spec ${fx.specPath}`, "u"));
    assert.match(steps[3].command, /--delta-request <delta request path printed by step 3>/u);
    // Follow it: step 1 inspect, step 2 supersede (retires only the unregistered round 3), step 3 delta request, step 4 preflight.
    mkdirSync(join(fx.root, "scratch"), { recursive: true });
    writeFileSync(join(fx.root, "scratch/takeover-inspect.json"), JSON.stringify({ schema: "pipeline.session-critic-course-takeover-inspect-request.v1", featureId: fx.featureId }));
    const inspected = parentFinalizerCli(["inspect-course-takeover", "--root", fx.root, "--request", "scratch/takeover-inspect.json"]);
    assert.equal(inspected.exitCode, 0, JSON.stringify(inspected));
    assert.equal(inspected.output.refusalCode, null, JSON.stringify(inspected.output));
    writeFileSync(join(fx.root, "scratch/takeover-supersede.json"), JSON.stringify({ schema: "pipeline.session-critic-course-takeover-supersede-request.v1", featureId: fx.featureId, digestSha256: inspected.output.digestSha256, reason: "retire the unregistered round 3" }));
    const superseded = parentFinalizerCli(["supersede-course-takeover", "--root", fx.root, "--request", "scratch/takeover-supersede.json"]);
    assert.equal(superseded.exitCode, 0, JSON.stringify(superseded));
    const delta = parentDeltaRequest(fx.root, ["fix-three-and-four"]);
    assert.equal(delta.added.preflight.baseCommit, fx.c2);
    const argv = steps[3].command.replace(/^node \S+ /u, "").replace("<root>", fx.root).replace("<delta request path printed by step 3>", delta.added.deltaRequestPath)
      .replace("<evidence>", fx.evidence4).replace("<registration commit of step 3>", delta.registration).replace("<bindings file>", parentBindings(fx.root, fx.c2, fx.c4)).split(" ");
    const parsed = parseCriticDispatchPreflightArgs(argv);
    const admitted = preflightCriticDispatch(parsed);
    assert.equal(admitted.status, "packet-ready", JSON.stringify(admitted));
    assert.equal(admitted.base.commit, fx.c2);
    assert.equal(admitted.coordinatorOnly.courseAdmission.round, 3);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});
test("D204 an effective FULL round judges the correction-input bindings over the course genesis range; an ordinary delta still judges them over the correction range", () => {
  const fx = parentLineageFixture({ afterRound: 2 });
  try {
    const c3 = fx.correct("fix3");
    const d3 = parentRegisterDiagnostic(fx.root, fx.featureId, c3, "r3");
    const fallback = parentDeltaRequest(fx.root, ["fix-three"], { trustBoundaryChanged: true });
    const request = (delta, bindingsBase) => ({ root: fx.root, base: fx.c2, candidate: c3, specPath: fx.specPath, guardrailPaths: [], evidencePaths: [d3.diagnosticPath], priorCriticEvidencePath: null,
      courseContext: { featureId: fx.featureId, registrationCommit: delta.registration, acceptedReference: null, criterionLocator: null, deltaRequestPath: delta.added.deltaRequestPath },
      correctionInputBindings: parentBindings(fx.root, bindingsBase, c3) });
    // The consumer's trap: the bindings over the correction range were accepted and the Critic then reviewed the genesis range.
    const stale = cdpRefusal(() => preflightCriticDispatch(request(fallback, fx.c2)), "CDP-CORRECTION-INPUT-STALE");
    assert.ok(stale.message.includes(fx.genesis) && /effective FULL round/u.test(stale.message), stale.message);
    const admitted = preflightCriticDispatch(request(fallback, fx.genesis));
    assert.equal(admitted.status, "packet-ready", JSON.stringify(admitted));
    assert.equal(admitted.base.commit, fx.genesis, "the effective full round reviews from the course genesis base");
    assert.equal(admitted.coordinatorOnly.courseAdmission.fallbackFull, true);
    const derived = deriveCriticCorrectionInputBindings({ repoRoot: fx.root, base: fx.genesis, head: c3, projectStateOptional: true });
    assert.equal(admitted.correctionInputBindings.digestSha256, derived.digestSha256, "the echoed bindings are the genesis-range ones");
    // Control: an ordinary delta (no trust-boundary change, no ambiguity) keeps the correction-range rule.
    const ordinary = parentDeltaRequest(fx.root, ["fix-three-ordinary"]);
    const ordinaryStale = cdpRefusal(() => preflightCriticDispatch(request(ordinary, fx.genesis)), "CDP-CORRECTION-INPUT-STALE");
    assert.ok(!/effective FULL round/u.test(ordinaryStale.message), ordinaryStale.message);
    const ordinaryAdmitted = preflightCriticDispatch(request(ordinary, fx.c2));
    assert.equal(ordinaryAdmitted.status, "packet-ready", JSON.stringify(ordinaryAdmitted));
    assert.equal(ordinaryAdmitted.base.commit, fx.c2);
    assert.equal(Object.hasOwn(ordinaryAdmitted.coordinatorOnly.courseAdmission, "fallbackFull"), false);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});
test("CCA-PARENT push-init names the base the preflight accepts for a feature with registered course history, and says the Verify evidence is of mode critic", () => {
  const fx = parentLineageFixture();
  try {
    const bases = parentAdmissionLib.deriveRegisteredCourseBases({ repoRoot: fx.root, candidateCommit: fx.head });
    assert.deepEqual(bases, [{ featureId: fx.featureId, lastRegisteredRound: 2, lastRegisteredCandidate: fx.c2 }]);
    const remedy = parentPushPrepare.criticBoundVerifyRemedy(fx.root, fx.head);
    assert.ok(remedy.includes(`--base ${fx.c2}`), remedy);
    assert.ok(remedy.includes(fx.featureId), remedy);
    assert.match(remedy, /Verify evidence must be of mode critic/u);
    assert.match(remedy, /verify-evidence-producer\.mjs/u);
    const plain = fixture();
    try { assert.match(parentPushPrepare.criticBoundVerifyRemedy(plain.root, plain.candidate), /<merge base of HEAD with the publication target>/u); } finally { rmSync(plain.root, { recursive: true, force: true }); }
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});
test("CDP-INPUT names the missing flag; CDP-EVIDENCE-SCHEMA names the admitted schemas; CDP-EVIDENCE-MODE says a Verify evidence of mode critic is required and how to produce it", () => {
  assert.throws(() => preflightCriticDispatch({ candidate: "HEAD", base: "HEAD", specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: [] }), (error) => error.code === "CDP-INPUT" && error.message === "--root is required" && error.details.reason === "--root is required");
  assert.throws(() => preflightCriticDispatch({ root: "/", base: "HEAD", specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: [] }), (error) => error.code === "CDP-INPUT" && error.message === "--candidate is required");
  const fx = fixture();
  try {
    writeFileSync(join(fx.root, "evidence/security.json"), JSON.stringify({ schema: "pipeline.security-evidence.v0", candidate: { commit: fx.candidate, tree: fx.tree } }));
    assert.throws(() => preflightCriticDispatch(input(fx, { evidencePaths: ["evidence/security.json"] })), (error) => error.code === "CDP-EVIDENCE-SCHEMA"
      && /security evidence is not admitted/u.test(error.details.reason) && error.details.reason.includes("pipeline.verify-evidence.v0") && error.details.reason.includes("pipeline.critic-diagnostic-evidence.v1"));
    const failed = verifyValue(fx.candidate, fx.tree); failed.selection = { ...failed.selection, selectionSha256: "f".repeat(64) };
    writeFileSync(join(fx.root, "evidence/verify.json"), JSON.stringify(failed));
    assert.throws(() => preflightCriticDispatch(input(fx)), (error) => error.code === "CDP-EVIDENCE-MODE"
      && /Verify evidence of mode critic is required/u.test(error.details.reason) && /verify-evidence-producer\.mjs --root <root> --mode critic/u.test(error.details.reason));
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});
test("session-critic-finalizer inspect-course-takeover --help prints the --request file shape with keys and one example", () => {
  for (const verb of ["inspect-course-takeover", "supersede-course-takeover"]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./session-critic-finalizer.mjs", import.meta.url)), verb, "--help"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--request/u);
    assert.match(result.stdout, verb === "inspect-course-takeover" ? /keys: schema, featureId\b/u : /keys: schema, featureId, digestSha256, reason/u);
    assert.match(result.stdout, /example: \{"schema":"pipeline\.session-critic-course-takeover-(inspect|supersede)-request\.v1","featureId":"<feature>"/u);
  }
});

// N25 / D208: the guard-push architecture currency check, asked before a Critic packet is prepared.
test("N25 a stale architecture map is refused CDP-ARCHITECTURE-MAP-STALE naming contract, concept map and the sanctioned step; a map commit then admits packet-ready; no relief for a comment-only change", () => {
  const fx = fixture();
  try {
    mkdirSync(join(fx.root, "src"), { recursive: true });
    mkdirSync(join(fx.root, "architecture", "map"), { recursive: true });
    writeFileSync(join(fx.root, "src", "contract.mjs"), "export const value = 1;\n");
    writeFileSync(join(fx.root, "architecture", "map", "index.md"), "# Map\n");
    writeFileSync(join(fx.root, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core\n");
    // Targeted commits: `commit()` stages everything, which would pull the untracked evidence files into the range.
    const commitMap = (message) => { git(fx.root, ["add", "--", "src", "architecture"]); git(fx.root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]); return git(fx.root, ["rev-parse", "HEAD"]); };
    commitMap("adopt map");
    writeFileSync(join(fx.root, "src", "contract.mjs"), "// comment only\nexport const value = 1;\n");
    const stale = commitMap("comment-only contract change");
    const refusal = cdpRefusal(() => preflightCriticDispatch(input(fx, { candidate: stale })), "CDP-ARCHITECTURE-MAP-STALE");
    assert.ok(refusal.details.reason.includes("src/contract.mjs") && refusal.details.reason.includes("architecture/map/core.md"), refusal.details.reason);
    assert.deepEqual(refusal.details.staleContracts.map(({ contract, target }) => ({ contract, target })), [{ contract: "src/contract.mjs", target: "architecture/map/core.md" }]);
    assert.match(refusal.details.repair, /update the concept map in architecture\/map\/core\.md/u);
    assert.match(refusal.details.repair, /rebuild the candidate before Critic\/Verify/u);
    writeFileSync(join(fx.root, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core, covers the change\n");
    const current = commitMap("refresh map");
    writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify(verifyValue(current, git(fx.root, ["rev-parse", `${current}^{tree}`])))}\n`);
    const admitted = preflightCriticDispatch(input(fx, { candidate: current }));
    assert.equal(admitted.status, "packet-ready", JSON.stringify(admitted));
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

// N33 D (D212): early detection. The ready result a person or script reads lists the Critic-required records of the reviewed range that no
// Critic evidence covers yet, so the Critic dispatch can include them. Additive and advisory: no refusal, and the library result the
// session finalizer binds by digest is left byte-identical.
const N33B_COMMAND = "node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <repo-root> --critic-addendum <request.json>";
function n33bRequiredRecord(root, taskId, commitSha) {
  const record = { schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [commitSha], candidateCommit: commitSha, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: ["specs/spec.md"] }, criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" } };
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), `${JSON.stringify(record)}\n`);
}
test("N33B the ready result lists the Critic-required records of the reviewed range without covering evidence, with the next command; a record outside the range is not listed; the library result is unchanged", () => {
  const fx = fixture();
  try {
    n33bRequiredRecord(fx.root, "N33B-INSIDE", fx.candidate);
    n33bRequiredRecord(fx.root, "N33B-AT-BASE", fx.base);
    const library = preflightCriticDispatch(input(fx));
    assert.equal(library.status, "packet-ready");
    assert.equal(Object.hasOwn(library, "criticCoverageAdvisory"), false, "the library result is digest-bound by the session finalizer and must not vary with evidence written during a review");
    const ready = preflightModule.preflightCriticDispatchWithCoverage(input(fx));
    assert.equal(ready.status, "packet-ready", "early detection must never refuse");
    const advisory = ready.criticCoverageAdvisory;
    assert.equal(advisory.schema, "pipeline.critic-coverage-advisory.v1");
    assert.equal(advisory.code, "CRITIC-COVERAGE-PENDING");
    assert.deepEqual(advisory.records.map((entry) => entry.taskId), ["N33B-INSIDE"]);
    assert.equal(advisory.records[0].recordPath, "evidence/dispatch-record-N33B-INSIDE.json");
    assert.equal(advisory.records[0].candidateCommit, fx.candidate);
    assert.equal(advisory.command, N33B_COMMAND);
    assert.ok(advisory.line.includes("N33B-INSIDE") && advisory.line.includes(N33B_COMMAND) && !advisory.line.includes("N33B-AT-BASE"), advisory.line);
    const { criticCoverageAdvisory: _advisory, ...rest } = ready;
    assert.deepEqual(rest, library, "the advisory is the only difference from the library result");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("N33B with no uncovered Critic-required record in the range the ready result is silent and identical to the library result", () => {
  const fx = fixture();
  try {
    const none = preflightModule.preflightCriticDispatchWithCoverage(input(fx));
    assert.equal(Object.hasOwn(none, "criticCoverageAdvisory"), false);
    assert.deepEqual(none, preflightCriticDispatch(input(fx)));
    n33bRequiredRecord(fx.root, "N33B-AT-BASE", fx.base);
    assert.equal(Object.hasOwn(preflightModule.preflightCriticDispatchWithCoverage(input(fx)), "criticCoverageAdvisory"), false, "a record at the review base lies outside (base, candidate]");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("N33B the command line prints the advisory in the ready result and still exits 0", () => {
  const fx = fixture();
  try {
    n33bRequiredRecord(fx.root, "N33B-INSIDE", fx.candidate);
    const run = spawnSync(process.execPath, [fileURLToPath(new URL("./critic-dispatch-preflight.mjs", import.meta.url)), "--root", fx.root, "--base", fx.base, "--candidate", fx.candidate,
      "--spec", "specs/spec.md", "--evidence", "evidence/verify.json", "--prior-critic", "evidence/prior-critic.json"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const printed = JSON.parse(run.stdout);
    assert.equal(printed.status, "packet-ready");
    assert.deepEqual(printed.criticCoverageAdvisory.records.map((entry) => entry.taskId), ["N33B-INSIDE"]);
    assert.equal(printed.criticCoverageAdvisory.command, N33B_COMMAND);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

registerTestCaseCompletion({cases: completionCases, fd: 3, maxBytes: 32768});
