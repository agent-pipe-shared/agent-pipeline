// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.critic-round-cap-and-delta-scope-are-not-enforced (AC-142).
// Exercises the real review-economy / critic-course-admission functions; no mocks.
import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  // D190: the cap gates a FULL request only; a diff round past it is admitted.
  assert.equal(admitReviewAttempt(delta({ round: max + 1 })).ok, true);
  const refused = admitReviewAttempt(delta({ round: max + 1, requestedMode: "full" }));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "RE-CRITIC-ROUND-LIMIT");
  assert.equal(refused.courseGateRequired, true);
  assert.equal(admitReviewAttempt(delta({ correctionCommits: 4 })).ok, true);
  const corr = admitReviewAttempt(delta({ correctionCommits: 4, requestedMode: "full" }));
  assert.equal(corr.code, "RE-CORRECTION-LIMIT");
  assert.equal(corr.courseGateRequired, true);
});

test("AC1 RED: a mirror without the cap admits the over-cap round, so the pin is meaningful", () => {
  assert.equal(mirrorNoCap(delta({ round: 5 })).ok, true);
  assert.notEqual(admitReviewAttempt(delta({ round: 5, requestedMode: "full" })).ok, mirrorNoCap(delta({ round: 5 })).ok);
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
  // QG-04 restatement (D204): the intent (never a DIFF round for a moved boundary or ambiguous impact) stays; the outcome is an effective FULL round.
  for (const flag of ["trustBoundaryChanged", "impactAmbiguous"]) {
    const r = admitReviewAttempt(delta({ [flag]: true }));
    assert.equal(r.code, "RE-DELTA-FALLBACK-FULL", flag);
    assert.equal(r.mode, "full", flag);
  }
  assert.equal(admitReviewAttempt(delta({ pathInvariantMapSha256: H("9") })).code, "RE-DELTA-BINDINGS-INVALID");
  assert.equal(admitReviewAttempt(delta({ trustBoundaryChanged: true, priorReceipt: { id: "x", sha256: "bad" } })).code, "RE-DELTA-BINDINGS-INVALID");
});

// Restated for N33c (D190, 2026-10-31): intent unchanged -- the dispatch preflight keeps its typed CDP-COURSE-BUDGET refusal and the
// canon keeps the delta-only, correction-only follow-up rule. What is dropped is the claim that a COUNT limits the diff rounds (one
// full review plus at most three correction-diff reviews, "four calls total", "Critic budget spent"): D190 decided one full review,
// then correction-diff reviews until genuine PASS or an explicit PO decision, and the code (review-economy.mjs, critic-course-admission.mjs)
// no longer refuses a diff round by count. The refusal fires only on a requested-mode/round mismatch, and says so.
test("AC2 dispatch preflight carries the typed course-mode refusal and states its real cause (restated N33c/D190)", () => {
  const src = read("scripts/critic-dispatch-preflight.mjs");
  assert.match(src, /CDP-COURSE-BUDGET/u);
  assert.match(src, /requested review mode does not match the round/u);
  assert.match(src, /every later round is a correction-DIFF review/u);
  assert.doesNotMatch(src, /at most three correction-DIFF reviews/u);
  assert.doesNotMatch(src, /Critic budget spent/u);
});

test("AC3 guardrail and Elephant role contract state the delta-only follow-up rule with no round count (restated N33c/D190)", () => {
  const qg = read("guardrails/quality-gates.md");
  assert.match(qg, /correction-diff reviews until genuine PASS or an explicit PO decision/u);
  assert.doesNotMatch(qg, /Four Critic calls total is the maximum/u);
  assert.doesNotMatch(qg, /after the third correction-diff review/u);
  assert.match(qg, /Correction-only scope/u);
  assert.match(qg, /examines only that immediate correction diff/u);
  assert.match(qg, /Self-verification[^.]*cannot become PASS/u);
  const el = read("roles/elephant.md");
  assert.match(el, /correction-diff[^.]*until genuine PASS or an explicit PO decision/u);
  assert.doesNotMatch(el, /maximum of three correction-diff reviews/u);
});

test("AC1 typed mode-mismatch refusal names the real cause and the real next step, never a spent budget (restated N33c/D190; was: E3 one number, four calls)", () => {
  const src = read("scripts/critic-dispatch-preflight.mjs");
  assert.match(src, /CDP-COURSE-BUDGET/u);
  assert.match(src, /nextStep: MODE_MISMATCH_NEXT_STEP/u);
  assert.match(src, /round 1 is a full review/u);
  assert.match(src, /immediately previous reviewed candidate/u);
  assert.match(src, /no review count refuses a correction-DIFF round/iu);
  assert.doesNotMatch(src, /do not dispatch another Critic/u);
  assert.doesNotMatch(src, /Elephant self-verification, which cannot become PASS, or an explicit PO decision/u);
  assert.doesNotMatch(src, /at most one (?:re-review|follow-up)/iu);
});

// New (N33c): the sweep the briefing names as its acceptance -- no current canon text states the retired count.
test("AC3 N33c sweep: no current canon, prompt or agent text states a count that limits the correction-diff rounds", () => {
  const stale = /three correction-diff|three fresh correction|three correction rounds|Four Critic calls total|Four calls total|four reviews total|No fifth review|no fifth-round exception|three-diff limit|full-plus-three-diff|third correction-diff|at most three correction-DIFF|plus at most three correction/iu;
  const files = [
    "roles/elephant.md", "roles/critic.md", "templates/prompts/critic-review.md", "templates/prompts/goldfish-task.md",
    "templates/prompts/elephant-kickoff.md", "guardrails/quality-gates.md", "docs/operating-model.md",
    "agents/critic.md", "skills/critic-review/SKILL.md", "skills/pipeline-start/references/workflow-dispatch.md",
    "scripts/critic-dispatch-preflight.mjs", "lib/review-economy.mjs",
  ];
  // Repo-root-only sources (not vendored into the installed plugin) are checked when the source checkout is present.
  const rootOnly = ["policies/model-policy.md", "harness/checklists/critic-review.md"]
    .filter((rel) => existsSync(join(pluginRoot, "..", "..", rel))).map((rel) => `../../${rel}`);
  const english = (text) => text.split("<!-- DE-REFERENCE-BELOW")[0]; // the German reference half is a separate reader aid
  for (const rel of [...files, ...rootOnly]) assert.doesNotMatch(english(read(rel)), stale, rel);
  // The Reader keeps its own two-plus-one budget; the sweep must not touch it.
  assert.match(read("skills/reader-review/SKILL.md"), /three correction batches/u);
  // Behavioural twin of the wording: a diff round past every old count is admitted, only a FULL request past the cap is refused.
  assert.equal(admitReviewAttempt(delta({ round: 9, correctionCommits: 8 })).ok, true);
  assert.equal(admitReviewAttempt(delta({ round: 9, correctionCommits: 8, requestedMode: "full" })).code, "RE-CRITIC-ROUND-LIMIT");
});

// Restated for D212 (N33, 2026-10-30): intent unchanged -- the close refusal offers the Critic dispatch only with the delta-only
// follow-up rule. The round-cap wording ("one full review plus at most three correction-diff reviews", "Elephant self-verification
// or an explicit PO decision") is dropped because D190/D199 removed the cap; a stale cap in the refusal sent an operator holding a
// passed course receipt to a dead end. The cap-free rule and the addendum route replace it (pinned behaviourally by the close
// coordinator pin, case (h)).
test("AC3 coordinator next-action text offers the Critic dispatch only with the delta-only follow-up rule (restated D212)", () => {
  const src = read("scripts/close-coordinator.mjs");
  assert.match(src, /CLOSE-CRITIC-EVIDENCE-MISSING/u);
  assert.match(src, /follow-up = correction-diff Critic only, over the previously reviewed commit to the new candidate/u);
  assert.match(src, /no round cap since D190\/D199; a further correction-diff Critic round is always allowed/u);
  assert.match(src, /--critic-addendum <request\.json>/u);
  assert.doesNotMatch(src, /one full review plus at most three correction-diff reviews per declared batch/u);
  assert.doesNotMatch(src, /never another Critic/u);
});

// D217 (N35): added to the AC3 text pin above, which stays as it is. A failed receipt never binds without a PO residual acceptance, and a
// course closed through one covers the records of all its registered rounds; the close refusal, the early-detection advisory and the
// close-feature skill state the same rule and name the accept route.
test("AC3b the close refusal, the advisory and the close-feature skill state the residual-acceptance and course-chain rule (D217)", () => {
  const src = read("scripts/close-coordinator.mjs");
  assert.match(src, /a failed receipt never binds without a PO residual acceptance of its minor findings/u);
  assert.match(src, /pipeline-state\.mjs approve-residual-acceptance --by <name> --critic-packet <packet-id>/u);
  assert.match(src, /a course closed by a residual acceptance covers the records of all its registered rounds/u);
  assert.match(read("scripts/dispatch-record-write.mjs"), /a failed receipt never binds without a PO residual acceptance/u);
  const skill = read("skills/close-feature/SKILL.md");
  assert.match(skill, /A failed receipt \(`reviewPass` false\) never binds\s+without a PO residual acceptance/u);
  assert.match(skill, /A course closed by a residual acceptance covers the records of\s+all its registered rounds/u);
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
