// SPDX-License-Identifier: SUL-1.0
// R7-5-T-20261008: RED pins for specs/sprint-alfred-epic/spec.md section 22.5 (R7-5),
// acceptance cases R7-5a, R7-5b and R7-5c plus the inspect route. TEST-ONLY: no
// production code exists yet for the `rebind-approval` verb, so every case here
// is RED by design. The fixture, however, is fully real up to the verb call:
// each case first asserts its preconditions (which hold today), so a failure
// can only mean the rebind route itself is missing or wrong.
//
// RATIFIED by Ruling 58 (specs/sprint-alfred-epic/plans/0.7-execution-order.md, 2026-10-08
// late): R75_VERB (verb `rebind-approval` through pipeline-state.mjs run()), R75_RESULT
// (schema pipeline.rebind-approval.v1; status verified | digest-set-changed | refused; the lost
// artifact is status "refused" + code DWP-REBIND-ARTIFACT-LOST + an attendedPrerequisite
// object: retrieve from the origin device, or re-approve), R75_RECEIPT (device-local receipt
// under the clone's .git/agent-pipeline/), R75_INSPECT (onboarding `inspect` offers
// `rebind-approval` beside `reopen-design` at designToImplementationHandoverAction in
// lib/project-onboarding-v3.mjs). NOT covered by Ruling 58, hence still test-chosen: "takes no
// flags" (R75_VERB), R75_EXIT, the exact receipt sub-path and schema, the prerequisite option
// spellings, R75_SEAM.
// R7-5-T2-20261008 (fixture finished): the approval flow's scratch/ request is staged inside the
// throwaway repo, and the bound set is committed before present-plan because R7-3 refuses an
// untracked bound path (DWP-BOUND-PATH-UNTRACKED). The three verb cases are RED only on the
// unknown `rebind-approval` verb. The inspect case is `todo`: the throwaway clone is not an
// onboarded project, so onboarding `inspect` returns status "partial" (diagnostic
// partial_authority, nextAction null) and never reaches the ready branch that calls
// designToImplementationHandoverAction; "reopen-design is offered today" cannot be established
// on this fixture. Reaching it needs a fully onboarded (ready) clone, left to the fix wave.
// The assumption list (the spec names the three outcomes but not the entry point):
//  R75_VERB    The verb is `rebind-approval`, a new case in the verb table of
//              plugins/pipeline-core/scripts/pipeline-state.mjs, reached through
//              the existing `run(argv, deps)` export (the same entry point the
//              `reopen-design` verb uses). It takes no flags, so the sanctioned
//              action is a copy-safe command with argv[1] === "rebind-approval".
//  R75_RESULT  The verb prints ONE JSON object on stdout with
//              schema "pipeline.rebind-approval.v1" and `status`:
//                "verified"            (section 22.5 `verified`)
//                "digest-set-changed"  (section 22.5 `digest-set-changed`)
//                "refused"             with code "DWP-REBIND-ARTIFACT-LOST"
//              (the third outcome is the typed code of section 22.5, carried by
//              a `refused` status because it is a failure with an attended
//              prerequisite, not a third success shape).
//  R75_EXIT    exit 0 for `verified`; non-zero for the two refusals.
//  R75_RECEIPT The device-local verification receipt is a NEW file under the
//              clone's private state root `<git-dir>/agent-pipeline/` whose raw
//              JSON text contains the approval's design-workflow package digest.
//              Its exact sub-path and schema are NOT pinned.
//  R75_PREREQ  The lost-artifact refusal carries
//              `attendedPrerequisite: { kind: "attended-prerequisite", ... }`
//              whose serialized text names the lost bound path and offers both
//              routes of section 22.5: retrieving the bound bytes from the origin
//              device, and re-approving. Option spellings are NOT pinned.
//  R75_INSPECT The onboarding `inspect` result keeps its `reopen-design` action
//              and additionally contains a command action whose argv[1] is
//              "rebind-approval". WHERE in nextAction the second action sits
//              (sibling field, list entry, nested) is deliberately NOT pinned:
//              the pin walks the whole nextAction tree. requiresConfirmation and
//              mutation flags of the new action are NOT pinned either.
//  R75_SEAM    Production host-observation checks (readiness host execution)
//              cannot be reproduced in a throwaway repo; the clone run reuses the
//              same test seams as the origin run (`verifyDesignReadinessHostExecution`
//              from lib/test-design-workflow-fixture.mjs) and uses the REAL git
//              ancestry (no `gitCandidate` stub), so the candidate-ancestry leg of
//              section 22.5 is exercised against real commits.
// NOT pinned here (left to the fix wave and its own Critic): the signing request
// after `digest-set-changed` (21.0), the per-path BOUND-PATH codes of R7-3, and
// the signature-mode (Ed25519) approval variant; the approval fixture uses the
// chat-mode human approval of the existing runner suite.
// Registration: this file needs a harness/verify-suites.json entry (protected
// path TP-13); it is intentionally NOT registered by this dispatch.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { materializeTestDesignWorkflowPackage } from "../lib/test-design-workflow-fixture.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
import { run, SCHEMA_ID, statePath } from "./pipeline-state.mjs";

const ONBOARDING = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));
const REBIND_SCHEMA = "pipeline.rebind-approval.v1";
const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 3 }); });

const h = (value) => value.repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const ENV = { CODEX_SESSION_ID: "rebind-approval-fixture" };
let nonce = 0;

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}
function configureRepo(dir) {
  for (const [k, v] of [["user.name", "Rebind Fixture"], ["user.email", "fixture@example.invalid"], ["core.autocrlf", "false"],
    ["core.hooksPath", ".fixture-no-hooks"], ["commit.gpgsign", "false"]]) git(dir, ["config", k, v]);
}
function invoke(argv, deps) {
  const out = []; const err = []; const log = console.log; const error = console.error;
  console.log = (...v) => out.push(v.join(" ")); console.error = (...v) => err.push(v.join(" "));
  try { return { status: run(argv, deps), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}
function listFiles(base, skip = () => false) {
  const found = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (skip(full)) continue;
      if (statSync(full).isDirectory()) walk(full); else found.set(full.slice(base.length), hash(readFileSync(full)));
    }
  };
  walk(base);
  return found;
}
const worktreeSnapshot = (dir) => listFiles(dir, (full) => full === join(dir, ".git"));
const privateSnapshot = (dir) => listFiles(join(dir, ".git", "agent-pipeline"));

function enrollFixtureGovernance(root) {
  git(root, ["init", "-q"]);
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const inactive = controller.observe({ rootDir: root });
  if (inactive.state !== "inactive" || inactive.requiresEnforcement) throw new Error("fixture scope was not initially inactive");
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-rebind-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || !active.requiresEnforcement) throw new Error("fixture enrollment did not activate enforcement");
}

/**
 * Origin device: a real git repo whose final plan approval (chat mode) binds
 * PRD, Spec and the design-workflow bound set against a REAL candidate commit.
 * `hideReadiness` models the 2026-10-06 incident: one bound artifact exists in
 * the origin working tree but is git-ignored, so it never reaches a clone.
 */
function approvedOrigin(name, { hideReadiness = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `rebind-approval-${name}-`)); roots.push(dir);
  enrollFixtureGovernance(dir); configureRepo(dir);
  const featureId = `rebind-${name}`;
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `specs/${featureId}/spec.md`;
  mkdirSync(join(dir, `specs/${featureId}`), { recursive: true });
  mkdirSync(dirname(statePath(dir)), { recursive: true });
  writeFileSync(join(dir, specPath), "# Rebind specification\n");
  const specSha256 = hash(readFileSync(join(dir, specPath)));
  writeFileSync(join(dir, planPath), `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${specSha256} -->\n# Rebind plan\n`);
  const planSha256 = hash(readFileSync(join(dir, planPath)));
  const profile = { schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: h("1"), runtimeSha256: h("2"), receiptSha256: h("3"), repositoryFingerprint: h("4") };
  const authority = { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256, specPath, specSha256 };
  const continuity = {
    schema: "pipeline.continuity.v0", featureId, revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: planPath, sha256: planSha256 }, spec: { path: specPath, sha256: specSha256 }, result: null },
    queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  writeFileSync(statePath(dir), JSON.stringify({ schema: SCHEMA_ID, activeFeature: { id: featureId, planPath, phase: "design" },
    planApproved: false, continuity, updatedAt: "2026-10-08T10:00:00.000Z" }, null, 2) + "\n");
  git(dir, ["add", "--", "specs", "project"]); git(dir, ["commit", "-q", "-m", "fixture: candidate"]);
  const candidate = { commit: git(dir, ["rev-parse", "HEAD"]), tree: git(dir, ["rev-parse", "HEAD^{tree}"]) };
  const pkg = materializeTestDesignWorkflowPackage({ root: dir, featureId, planPath, specPath, candidate });
  const readinessPath = `specs/${featureId}/evidence/readiness.json`;
  // present-plan refuses an untracked bound path (DWP-BOUND-PATH-UNTRACKED, R7-3), so the bound
  // set is committed on top of the candidate before presenting. Staging everything is scoped to
  // this throwaway fixture repo, not a wildcard add in the real repository.
  git(dir, ["add", "-A"]); git(dir, ["commit", "-q", "-m", "fixture: bound set"]);
  const deps = { dir, now: () => "2026-10-08T10:01:00.000Z", ownerNonce: () => `rebind-fixture-${String(++nonce).padStart(8, "0")}`,
    env: ENV, readHumanApprovalMode: () => null, poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: (request) => request.expectedPlanSha256 === undefined ? { ok: true, value: authority }
      : { ok: false, code: "PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING", reason: "marker missing", repair: "PO acknowledgement required" },
    observeBootstrapBindAcknowledgement: () => ({ acknowledged: false, exempt: true, prd: { path: planPath, sha256: planSha256 }, spec: { path: specPath, sha256: specSha256 } }),
    designAdvisoryAdmission: () => ({ ok: true, id: h("e"), mode: "admitted" }), ...pkg.deps };
  const fixtureStep = (label, result) => assert.equal(result.status, 0, `fixture ${label}: ${result.err}\n${result.out}`.slice(0, 1500));
  fixtureStep("submit-plan", invoke(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  fixtureStep("present-plan", invoke(["present-plan", "--by", "coordinator", "--design-workflow-package", pkg.packagePath], deps));
  const presented = JSON.parse(readFileSync(statePath(dir), "utf8")).planPresentation;
  const approve = invoke(["approve-plan", "--by", "Fixture PO", "--design-workflow-approval-request", presented.designWorkflowApprovalRequestPath],
    { ...deps, isattyFn: () => true, readLineFn: () => "approve-" + presented.designWorkflowPackageSha256.slice(0, 12) });
  assert.equal(approve.status, 0, "fixture chat-mode approve-plan: " + approve.err);
  // The bound artifact is tracked while the plan is presented and approved (R7-3 demands it), then
  // untracked and git-ignored: its bytes survive only on the origin device, which is exactly the
  // state a clone cannot reproduce (section 22.5, DWP-REBIND-ARTIFACT-LOST).
  if (hideReadiness) {
    git(dir, ["rm", "-q", "--cached", "--", readinessPath]);
    mkdirSync(join(dir, ".git", "info"), { recursive: true }); writeFileSync(join(dir, ".git", "info", "exclude"), readinessPath + "\n");
  }
  // The approval flow also writes the approval request under scratch/ (untracked here). Staging
  // everything is scoped to this throwaway fixture repo; it is not a wildcard add in the real
  // repository. Ignored paths (the hideReadiness exclude above) stay out of the commit.
  git(dir, ["add", "-A"]); git(dir, ["commit", "-q", "-m", "fixture: approved"]);
  const state = JSON.parse(readFileSync(statePath(dir), "utf8"));
  assert.equal(state.planApproved, true, "fixture precondition: approved");
  const porcelain = git(dir, ["status", "--porcelain", "--untracked-files=all"]);
  assert.equal(porcelain, "", "fixture precondition: origin working tree is clean; git status --porcelain:\n" + porcelain);
  assert.equal(existsSync(join(dir, readinessPath)), true, "fixture precondition: readiness exists on the origin device");
  assert.equal(git(dir, ["ls-files", "--", readinessPath]) !== "", !hideReadiness, "fixture precondition: bound set tracking");
  return { dir, planPath, specPath, readinessPath, packageDeps: pkg.deps, state };
}

/** A second device: a real `git clone` of the origin; only committed bytes arrive. */
function cloneOf(origin, name) {
  const dir = mkdtempSync(join(tmpdir(), `rebind-approval-clone-${name}-`)); roots.push(dir);
  rmSync(dir, { recursive: true, force: true });
  git(tmpdir(), ["clone", "-q", "-c", "core.autocrlf=false", origin.dir, dir]); configureRepo(dir);
  const { gitCandidate, ...packageDeps } = origin.packageDeps; // real git ancestry, see R75_SEAM
  void gitCandidate;
  return { dir, deps: { dir, now: () => "2026-10-08T12:00:00.000Z", ownerNonce: () => `rebind-clone-${String(++nonce).padStart(8, "0")}`,
    env: ENV, readHumanApprovalMode: () => null, ...packageDeps } };
}

function rebindPayload(result) {
  assert.ok(result.out.trim().startsWith("{"), `rebind-approval must print one JSON object (exit ${result.status}; stderr: ${result.err.slice(0, 160)})`);
  const payload = JSON.parse(result.out);
  assert.equal(payload.schema, REBIND_SCHEMA);
  return payload;
}
const stateBytes = (dir) => readFileSync(statePath(dir));
const stateDigest = (dir) => sha256CanonicalJson(JSON.parse(stateBytes(dir).toString("utf8")));
function commandActions(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => commandActions(n, out));
  else if (node && typeof node === "object") {
    if (Array.isArray(node.argv)) out.push(node);
    Object.values(node).forEach((v) => commandActions(v, out));
  }
  return out;
}

test("R7-5a: a clone of an approved, committed fixture reaches verified with zero signatures and no State change", () => {
  const origin = approvedOrigin("a");
  const clone = cloneOf(origin, "a");
  assert.equal(git(clone.dir, ["status", "--porcelain"]), "", "precondition: clone is clean");
  assert.equal(JSON.parse(stateBytes(clone.dir)).planApproved, true, "precondition: approval record arrived by clone");
  const stateBefore = stateBytes(clone.dir); const digestBefore = stateDigest(clone.dir);
  const treeBefore = worktreeSnapshot(clone.dir); const privateBefore = privateSnapshot(clone.dir);

  const result = invoke(["rebind-approval"], clone.deps);
  const payload = rebindPayload(result);
  assert.equal(result.status, 0, result.err);
  assert.equal(payload.status, "verified");

  assert.deepEqual(stateBytes(clone.dir), stateBefore, "the approval record bytes stay identical");
  assert.equal(stateDigest(clone.dir), digestBefore, "the State digest is unchanged");
  assert.deepEqual([...worktreeSnapshot(clone.dir)], [...treeBefore], "zero tracked or untracked working-tree change (zero signature artifacts)");
  assert.equal(git(clone.dir, ["status", "--porcelain"]), "");
  assert.doesNotMatch(result.out, /signIntentCommand|authorizeBySignatureCommand/u, "no signature is requested");
  const created = [...privateSnapshot(clone.dir).keys()].filter((p) => !privateBefore.has(p));
  assert.ok(created.length >= 1, "a device-local receipt is written in private state");
  const packageSha = origin.state.planApproval.designWorkflowPackageSha256;
  assert.ok(created.some((p) => readFileSync(join(clone.dir, ".git", "agent-pipeline") + p, "utf8").includes(packageSha)), "the receipt names the approved package digest");
  assert.equal([...privateSnapshot(clone.dir).keys()].filter((p) => !privateBefore.has(p) && /proof|signature/iu.test(p)).length, 0, "no signature material in private state");
});

test("R7-5b: a changed PRD or Spec byte yields digest-set-changed and no rebind", () => {
  for (const which of ["prd", "spec"]) {
    const origin = approvedOrigin(`b-${which}`);
    const clone = cloneOf(origin, `b-${which}`);
    const changed = which === "prd" ? origin.planPath : origin.specPath;
    writeFileSync(join(clone.dir, changed), readFileSync(join(clone.dir, changed), "utf8") + "One changed line.\n");
    git(clone.dir, ["add", "--", changed]); git(clone.dir, ["commit", "-q", "-m", "fixture: change " + which]);
    assert.equal(git(clone.dir, ["status", "--porcelain"]), "", "precondition: the changed bytes are committed, so tracked bytes differ");
    const stateBefore = stateBytes(clone.dir); const treeBefore = worktreeSnapshot(clone.dir); const privateBefore = privateSnapshot(clone.dir);

    const result = invoke(["rebind-approval"], clone.deps);
    const payload = rebindPayload(result);
    assert.notEqual(result.status, 0, `${which}: the route refuses`);
    assert.equal(payload.status, "digest-set-changed", which);
    assert.ok(result.out.includes(changed), `${which}: the changed bound path is named`);

    assert.deepEqual(stateBytes(clone.dir), stateBefore, `${which}: no State change`);
    assert.deepEqual([...worktreeSnapshot(clone.dir)], [...treeBefore], `${which}: nothing written to the working tree`);
    assert.deepEqual([...privateSnapshot(clone.dir)], [...privateBefore], `${which}: no receipt, so no rebind`);
  }
});

test("R7-5c: a bound artifact absent from the clone yields DWP-REBIND-ARTIFACT-LOST with the attended prerequisite and reuses nothing", () => {
  const origin = approvedOrigin("c", { hideReadiness: true });
  const clone = cloneOf(origin, "c");
  assert.equal(existsSync(join(clone.dir, origin.readinessPath)), false, "precondition: the bound artifact never reached the clone");
  assert.equal(git(clone.dir, ["status", "--porcelain"]), "", "precondition: clone is clean");
  assert.equal(readFileSync(join(clone.dir, origin.planPath), "utf8"), readFileSync(join(origin.dir, origin.planPath), "utf8"), "precondition: PRD unchanged");
  assert.equal(readFileSync(join(clone.dir, origin.specPath), "utf8"), readFileSync(join(origin.dir, origin.specPath), "utf8"), "precondition: Spec unchanged");
  const stateBefore = stateBytes(clone.dir); const treeBefore = worktreeSnapshot(clone.dir); const privateBefore = privateSnapshot(clone.dir);

  const result = invoke(["rebind-approval"], clone.deps);
  const payload = rebindPayload(result);
  assert.notEqual(result.status, 0);
  assert.equal(payload.status, "refused");
  assert.equal(payload.code, "DWP-REBIND-ARTIFACT-LOST");
  assert.equal(payload.attendedPrerequisite?.kind, "attended-prerequisite");
  const prerequisite = JSON.stringify(payload.attendedPrerequisite);
  assert.ok(prerequisite.includes(origin.readinessPath), "the prerequisite names the lost bound path");
  assert.match(prerequisite, /origin/iu, "route 1: retrieve the bound bytes from the origin device");
  assert.match(prerequisite, /re-?approv/iu, "route 2: re-approve");

  assert.equal(existsSync(join(clone.dir, origin.readinessPath)), false, "the artifact is never regenerated");
  assert.deepEqual([...worktreeSnapshot(clone.dir)], [...treeBefore], "no artifact of any kind is written, nothing is reused or recreated");
  assert.deepEqual(stateBytes(clone.dir), stateBefore, "no State change");
  assert.deepEqual([...privateSnapshot(clone.dir)], [...privateBefore], "no receipt and no prior evidence promoted into private state");
});

const INSPECT_TODO = "onboarding inspect on the throwaway clone returns status partial (partial_authority, nextAction null) because the clone is not an onboarded project; the ready branch that calls designToImplementationHandoverAction is never reached, so the reopen-design precondition cannot be established on this fixture";
test("inspect of an approval that cannot be verified on this checkout lists rebind-approval alongside reopen-design", { todo: INSPECT_TODO }, () => {
  const origin = approvedOrigin("inspect", { hideReadiness: true });
  const clone = cloneOf(origin, "inspect");
  const before = worktreeSnapshot(clone.dir);
  const inspected = spawnSync(process.execPath, [ONBOARDING, "inspect", "--root", clone.dir, "--intent", "bootstrap", "--runner", "claude"],
    { encoding: "utf8", cwd: clone.dir, env: { ...process.env, ...ENV } });
  assert.ok(inspected.stdout.trim().startsWith("{"), `inspect must print JSON (exit ${inspected.status}; stderr: ${inspected.stderr.slice(0, 160)})`);
  const payload = JSON.parse(inspected.stdout);
  const verbs = commandActions(payload.nextAction).map((action) => action.argv[1]);
  assert.ok(verbs.includes("reopen-design"), `precondition: reopen-design is offered today (offered: ${verbs.join(",") || "none"}; status ${payload.status}; keys ${Object.keys(payload).join(",")}; nextAction ${JSON.stringify(payload.nextAction)?.slice(0, 900)}; diagnostics ${JSON.stringify(payload.diagnostics)?.slice(0, 1400)})`);
  assert.ok(verbs.includes("rebind-approval"), "rebind-approval is offered next to reopen-design, not only reopen-design");
  assert.deepEqual([...worktreeSnapshot(clone.dir)], [...before], "inspect remains read-only");
});
