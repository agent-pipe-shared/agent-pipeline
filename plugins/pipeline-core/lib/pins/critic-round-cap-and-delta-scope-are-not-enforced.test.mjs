// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.critic-round-cap-and-delta-scope-are-not-enforced (AC-142).
// Exercises the real review-economy / critic-course-admission functions; no mocks.
import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preflightCriticDispatch } from "../../scripts/critic-dispatch-preflight.mjs";
import { run as runState } from "../../scripts/pipeline-state.mjs";
import { produceCriticDiagnostic } from "../critic-diagnostic-producer.mjs";
import { validateFeaturePackage } from "../feature-package-topology.mjs";
import { admitReviewAttempt, CRITIC_DISPATCH_LIMITS, sha256Canonical } from "../review-economy.mjs";
import { deriveCriticCourseAdmission, CriticCourseAdmissionError } from "../critic-course-admission.mjs";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(pluginRoot, rel), "utf8");
const O = (c) => c.repeat(40);
const H = (c) => c.repeat(64);
const p = "src/example.mjs";
const map = { [p]: ["INV-1"] };
const delta = (over = {}) => ({
  round: 2, correctionCommits: 1, requestedMode: "delta",
  base: O("1"), head: O("2"), tree: O("3"),
  changedPaths: [p], changedBehaviorClaims: ["behavior-one"],
  priorReceipt: { id: "receipt-1", sha256: H("4") },
  pathInvariantMap: map, pathInvariantMapSha256: sha256Canonical(map),
  coordinatorImpactConfirmed: true, trustBoundaryChanged: false, impactAmbiguous: false,
  ...over,
});

// Scratch mirror of the production cap check, used only to prove the pin can fail (RED).
const mirrorNoCap = (input) => (input.round === 1
  ? { ok: true, code: "RE-FIRST-FULL" } : { ok: true, code: "RE-DELTA-ADMITTED" });

test("AC1 round counter: round beyond the cap is refused with a typed course-gate code", () => {
  const max = CRITIC_DISPATCH_LIMITS.criticRounds;
  assert.equal(max, 4);
  assert.equal(admitReviewAttempt(delta({ round: max })).ok, true);
  const refused = admitReviewAttempt(delta({ round: max + 1 }));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "RE-CRITIC-ROUND-LIMIT");
  assert.equal(refused.courseGateRequired, true);
  const corr = admitReviewAttempt(delta({ correctionCommits: 4 }));
  assert.equal(corr.code, "RE-CORRECTION-LIMIT");
  assert.equal(corr.courseGateRequired, true);
});

test("AC1 RED: a mirror without the cap admits the over-cap round, so the pin is meaningful", () => {
  assert.equal(mirrorNoCap(delta({ round: 5 })).ok, true);
  assert.notEqual(admitReviewAttempt(delta({ round: 5 })).ok, mirrorNoCap(delta({ round: 5 })).ok);
});

test("AC1 course derivation computes round from history, never from invented counters", () => {
  const genesis = { history: [], candidate: { base: O("1"), commit: O("2"), tree: O("3") }, correctionCommitsInRange: 0, requestedMode: "full", delta: {} };
  const out = deriveCriticCourseAdmission(genesis);
  assert.equal(out.attempt.round, 1);
  assert.throws(() => deriveCriticCourseAdmission({ ...genesis, round: 3 }),
    (e) => e instanceof CriticCourseAdmissionError && e.code === "CCA-SHAPE");
  assert.throws(() => deriveCriticCourseAdmission({ ...genesis, requestedMode: "delta" }),
    (e) => e instanceof CriticCourseAdmissionError && e.code === "CCA-GENESIS");
});

test("AC2 follow-up must be delta mode with bound base/head/tree range", () => {
  assert.equal(admitReviewAttempt(delta()).code, "RE-DELTA-ADMITTED");
  assert.equal(admitReviewAttempt(delta({ requestedMode: "full" })).code, "RE-FOLLOWUP-DELTA-REQUIRED");
  for (const key of ["base", "head", "tree"]) {
    const r = admitReviewAttempt(delta({ [key]: undefined }));
    assert.equal(r.ok, false, key);
    assert.equal(r.code, "RE-DELTA-BINDINGS-INVALID", key);
  }
  assert.equal(admitReviewAttempt(delta({ base: "not-a-sha" })).code, "RE-DELTA-BINDINGS-INVALID");
});

test("AC2 follow-up wider than the delta is refused (unmapped path, boundary change, ambiguity)", () => {
  const wide = delta({ changedPaths: [p, "src/other.mjs"] });
  assert.equal(admitReviewAttempt(wide).code, "RE-DELTA-UNKNOWN-PATH");
  assert.equal(admitReviewAttempt(delta({ trustBoundaryChanged: true })).code, "RE-DELTA-BINDINGS-INVALID");
  assert.equal(admitReviewAttempt(delta({ impactAmbiguous: true })).code, "RE-DELTA-BINDINGS-INVALID");
  assert.equal(admitReviewAttempt(delta({ pathInvariantMapSha256: H("9") })).code, "RE-DELTA-BINDINGS-INVALID");
});

test("AC2 dispatch preflight carries the typed course-budget refusal", () => {
  const src = read("scripts/critic-dispatch-preflight.mjs");
  assert.match(src, /CDP-COURSE-BUDGET/u);
  assert.match(src, /one full review and at most three correction-DIFF reviews/u);
});

test("AC3 guardrail and Elephant role contract state the delta-only, bounded follow-up rule", () => {
  const qg = read("guardrails/quality-gates.md");
  assert.match(qg, /Four Critic calls total is the maximum/u);
  assert.match(qg, /Correction-only scope/u);
  assert.match(qg, /examines only that immediate correction diff/u);
  assert.match(qg, /Self-verification[^.]*cannot become PASS/u);
  const el = read("roles/elephant.md");
  assert.match(el, /maximum of three correction-diff reviews/u);
});

test("AC1 typed budget refusal names Elephant self-verification or an explicit PO decision as the next step (E3: one number, four calls)", () => {
  const src = read("scripts/critic-dispatch-preflight.mjs");
  assert.match(src, /CDP-COURSE-BUDGET/u);
  assert.match(src, /nextStep: BUDGET_NEXT_STEP/u);
  assert.match(src, /do not dispatch another Critic/u);
  assert.match(src, /Elephant self-verification, which cannot become PASS, or an explicit PO decision/u);
  assert.doesNotMatch(src, /at most one (?:re-review|follow-up)/iu);
});

test("AC3 coordinator next-action text offers the Critic dispatch only with the delta-only batch rule", () => {
  const src = read("scripts/close-coordinator.mjs");
  assert.match(src, /CLOSE-CRITIC-EVIDENCE-MISSING/u);
  assert.match(src, /follow-up = correction-diff Critic only, over the previously reviewed commit to the new candidate/u);
  assert.match(src, /one full review plus at most three correction-diff reviews per declared batch/u);
  assert.match(src, /Elephant self-verification or an explicit PO decision/u);
});

// AC-142 chain: the refusal and the sanctioned route are tested apart elsewhere; this drives one valid pre-rule feature through both.
test("AC4 a valid pre-rule feature goes from CCA-REVIEW-UNIT-REQUIRED through --add-review-unit to an admitted Critic dispatch", () => {
  const root = mkdtempSync(join(tmpdir(), "critic-route-chain-"));
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return String(r.stdout).trim();
  };
  const commit = (message) => {
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message);
    return git("rev-parse", "HEAD");
  };
  const sha = (rel) => createHash("sha256").update(readFileSync(join(root, rel))).digest("hex");
  try {
    const featureId = "pre-rule-feature";
    const dir = `specs/${featureId}`;
    const [prd, spec, acceptance, result, ev1, ev2] = ["prd.md", "spec.md", "acceptance.md", "result.md", "evidence/seed-one.txt", "evidence/seed-two.txt"].map((n) => `${dir}/${n}`);
    const manifestPath = `${dir}/lifecycle.json`;
    const unitPath = `${dir}/design/critic-review-unit.json`;
    mkdirSync(join(root, dir, "evidence"), { recursive: true });
    mkdirSync(join(root, ".claude"), { recursive: true });
    mkdirSync(join(root, "governance", "guidelines"), { recursive: true });
    mkdirSync(join(root, "governance", "policies"), { recursive: true });
    git("init", "-q");
    // The pipeline State the route reads is local authority, never part of the committed package.
    appendFileSync(join(root, ".git", "info", "exclude"), "project/\n.claude/pipeline-state.json\n");
    const guardrails = [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"];
    writeFileSync(join(root, guardrails[0]), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
    writeFileSync(join(root, guardrails[1]), "Review changed code.\n");
    writeFileSync(join(root, guardrails[2]), "- verify\n");
    const bodies = { [prd]: "# PRD\n", [spec]: "# Pre-rule feature\nAC-1: behavior boundary\n", [acceptance]: "Acceptance points at the Spec.\n", [result]: "Status record.\n", [ev1]: "seed one\n", [ev2]: "seed two\n" };
    for (const [path, body] of Object.entries(bodies)) writeFileSync(join(root, path), body);
    const entry = (cls, path, authority, mutability, retention) => ({ class: cls, path, sha256: sha(path), authority, mutability, retention });
    const manifest = {
      schema: "pipeline.feature-package.v1", feature: { id: featureId, rigor: 2 }, state: "implementing", candidate: null, supersedes: null,
      artifacts: [entry("prd", prd, true, "mutable", "active"), entry("spec", spec, true, "mutable", "active"), entry("acceptance", acceptance, false, "immutable", "active"), entry("result", result, false, "immutable", "active"), entry("candidate-evidence", ev1, false, "immutable", "retain"), entry("candidate-evidence", ev2, false, "immutable", "retain")],
    };
    writeFileSync(join(root, manifestPath), `${JSON.stringify(manifest)}\n`);
    assert.equal(validateFeaturePackage(root, manifestPath).ok, true, "SETUP the genesis manifest is a valid feature package");
    const genesis = commit("pre-rule genesis manifest without a review unit");
    const cycle = (tag, body) => {
      writeFileSync(join(root, spec), `${bodies[spec]}${body}\n`);
      const current = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
      current.artifacts.find((a) => a.path === spec).sha256 = sha(spec);
      writeFileSync(join(root, manifestPath), `${JSON.stringify(current)}\n`);
      const candidate = commit(`${tag} candidate`);
      const diagnosticPath = `${dir}/evidence/${tag}-diagnostic.json`, logPath = `${dir}/evidence/${tag}-targeted.log`;
      mkdirSync(join(root, "evidence"));
      const diagnostic = produceCriticDiagnostic({ root, candidate, specPath: spec, guardrailPaths: guardrails, command: [process.execPath, "-e", "process.exit(0)"], logPath: `evidence/${tag}-targeted.log` });
      writeFileSync(join(root, logPath), readFileSync(join(root, `evidence/${tag}-targeted.log`)));
      diagnostic.targeted.log.path = logPath;
      rmSync(join(root, "evidence"), { recursive: true, force: true });
      writeFileSync(join(root, diagnosticPath), JSON.stringify(diagnostic));
      const next = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
      for (const path of [diagnosticPath, logPath]) next.artifacts.push(entry("candidate-evidence", path, false, "immutable", "retain"));
      writeFileSync(join(root, manifestPath), `${JSON.stringify(next)}\n`);
      return { candidate, diagnosticPath, registrationCommit: commit(`${tag} register candidate-bound diagnostics`) };
    };
    const request = (base, round) => ({ root, base, candidate: round.candidate, specPath: spec, guardrailPaths: [], evidencePaths: [round.diagnosticPath], priorCriticEvidencePath: null, courseContext: { featureId, registrationCommit: round.registrationCommit, acceptedReference: null, criterionLocator: null, deltaRequestPath: null } });

    const refused = preflightCriticDispatch(request(genesis, cycle("first", "changed once")));
    assert.equal(refused.status, "refused", JSON.stringify(refused));
    assert.equal(refused.code, "CCA-REVIEW-UNIT-REQUIRED");
    assert.equal(refused.dispatch.packetCreated, false);

    // The sanctioned route the refusal names, run through the shipped scripts.
    assert.equal(runState(["set-feature", "--id", featureId, "--plan-path", spec], { dir: root, now: () => "2026-10-21T10:00:00.000Z" }), 0, "SETUP set-feature through the public State verb");
    const registrar = fileURLToPath(new URL("../../scripts/register-feature-package.mjs", import.meta.url));
    const routed = spawnSync(process.execPath, [registrar, "--root", root, "--add-review-unit"], { cwd: root, encoding: "utf8", timeout: 50000 });
    assert.equal(routed.status, 0, `${routed.stdout}${routed.stderr}`);
    const added = JSON.parse(String(routed.stdout).trim().split(/\r?\n/u).at(-1));
    assert.equal(added.status, "review-unit-added", routed.stdout);
    assert.deepEqual(added.commitPaths, [manifestPath, unitPath]);
    const unitBase = commit("add the Critic review unit");
    assert.equal(git("status", "--porcelain", "--untracked-files=all", "--", manifestPath, unitPath), "", "both printed paths are committed");

    // The unit commit is the earliest usable base; the next candidate is admitted from it.
    const admitted = preflightCriticDispatch(request(unitBase, cycle("second", "changed twice")));
    assert.equal(admitted.status, "packet-ready", JSON.stringify(admitted));
    assert.equal(admitted.coordinatorOnly.courseAdmission.featureId, featureId);
    assert.equal(admitted.coordinatorOnly.courseAdmission.round, 1);
    assert.equal(admitted.dispatch.childCreated, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
