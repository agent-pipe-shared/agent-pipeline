#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Coverage for the `inspect` subcommand (NVA-W4-07): the ONE consolidated
 * read-only readback, distinct in shape from the ~14 terse mutating writer
 * subcommands (`set-feature`, `close-feature`, etc. -- untouched, and NOT
 * re-tested here; their own suites already cover them). `inspect` reuses the
 * `continuity-result-rebind`/`continuity-result-bootstrap` family's richer
 * structured-JSON pattern (a `schema` field plus nested detail) and performs
 * ZERO writes: no lock, no state mutation, no `docs/state.md` touch.
 *
 * NVA-I-ONEROUTE: `nextAction` is now the STRUCTURAL protocol action
 * (`{kind, executable, argv}` or `{kind: "collect-input", ...}`); the
 * rendered prose moved to `nextActionText`, asserted against
 * `nextActionSection()` directly (the same pure renderer `syncStateMdNextAction`
 * calls before writing `docs/state.md`'s "## Next action" section) rather than
 * against a hardcoded body string, so this test tracks that renderer's real
 * contract instead of duplicating its prose.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, SCHEMA_ID, statePath as resolveStatePath } from "./pipeline-state.mjs";
import { applyOnboardingIntakeConsent, nextActionSection } from "../lib/onboarding-continuity.mjs";
import { mkdtempTestScratch } from "../lib/test-tmpdir.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";

const roots = [];
const NOW = "2026-08-18T12:00:00.000Z";
const PIPELINE_STATE_SCRIPT_PATH = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

// NVA-R34-BLINDPUSHPATH: `buildInspectNextAction`'s `draft` branch now checks
// the PO profile receipt (`validatePoGateProfileForRepository`) before
// deriving submit-plan's own argv -- unrelated machinery this suite's
// fixtures were never built to satisfy (none of them are real, registered
// Git worktree topologies with a published receipt). Stub it `ok: true` by
// default so every existing assertion here keeps exercising exactly what it
// always tested; the receipt check itself is covered separately.
function invoke(root, argv, deps = {}) {
  const out = []; const err = []; const log = console.log; const error = console.error;
  console.log = (...value) => out.push(value.join(" ")); console.error = (...value) => err.push(value.join(" "));
  try { return { status: run(argv, { dir: root, now: () => NOW, poGateProfile: () => ({ ok: true }), ...deps }), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}

function freshRoot(name) {
  const root = mkdtempTestScratch(`pipeline-state-inspect-${name}-`);
  roots.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  return root;
}

/** NVA-Q2-DRAFTDERIVE fixtures: a real, isolated Git repository so the
 * derivation under test can read (or fail to read) `user.name` from ITS OWN
 * local config, never this suite's own enclosing repository. */
function gitInitRoot(root) {
  const result = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function setLocalGitUserName(root, name) {
  const result = spawnSync("git", ["config", "user.name", name], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("inspect on a project with no active feature reports an inactive lifecycle and zero mutation", () => {
  const root = freshRoot("inactive");
  const before = invoke(root, ["inspect"]);
  assert.equal(before.status, 0, before.err);
  const payload = JSON.parse(before.out);
  assert.equal(payload.schema, "pipeline.inspect.v1");
  assert.equal(payload.activeFeature, null);
  assert.equal(payload.phase, null);
  assert.equal(payload.planApproved, false);
  assert.equal(payload.lifecycle.code, "PLAN-LIFECYCLE-INACTIVE");
  assert.equal(payload.lifecycle.status, null);
  assert.equal(payload.status, null);
  assert.equal(payload.nextAction, null);
  assert.equal(payload.nextActionText, nextActionSection({ schema: SCHEMA_ID }));

  // Zero mutation: `inspect` on a project with no state file yet must not
  // create one -- it is read-only, unlike every writer subcommand above it.
  let stateExistsAfter = true;
  try { readFileSync(resolveStatePath(root), "utf8"); } catch { stateExistsAfter = false; }
  assert.equal(stateExistsAfter, false, "inspect must not create a state file as a side effect");
});

test("inspect after set-feature surfaces phase, draft lifecycle, and the live Next-action text", () => {
  const root = freshRoot("draft");
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);

  const statePathValue = resolveStatePath(root);
  const beforeBytes = readFileSync(statePathValue, "utf8");

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.schema, "pipeline.inspect.v1");
  assert.deepEqual(payload.activeFeature, { id: "widget", planPath: "specs/widget/prd.md", phase: "design" });
  assert.equal(payload.phase, "design");
  assert.equal(payload.planApproved, false);
  assert.equal(payload.lifecycle.ok, true);
  assert.equal(payload.lifecycle.status, "draft");
  assert.equal(payload.status, "draft");
  assert.equal(payload.closedFeaturesCount, 0);

  // Structural nextAction: no plan has been submitted yet, and this command
  // cannot derive who is submitting it or which delivery profile applies --
  // a collect-input, never an invented/placeholder-laden command.
  assert.equal(payload.nextAction.kind, "collect-input");
  assert.deepEqual(payload.nextAction.inputs.map((input) => input.name), ["by", "profile"]);
  assert.equal(payload.nextAction.input, undefined);

  const persistedState = JSON.parse(readFileSync(statePathValue, "utf8"));
  assert.equal(payload.nextActionText, nextActionSection(persistedState),
    "nextActionText must be byte-identical to the same pure renderer syncStateMdNextAction uses");

  // Zero mutation: the state file bytes must be unchanged by `inspect`.
  const afterBytes = readFileSync(statePathValue, "utf8");
  assert.equal(afterBytes, beforeBytes, "inspect must not mutate the state file");
});

// NVA-CF-PRESENTPLANDRIVER: a submission with no bound `planPresentation`
// record yet must surface `present-plan` first -- `approve-plan` itself
// refuses unseen content (case "approve-plan", ~line 8364), so the OLD
// version of this fixture (no planPresentation at all) exercised the WRONG
// lifecycle stage: it would now receive the new present-plan command, not
// the approve-plan collect-input. Shared by the fixture-builder below.
function awaitingApprovalSubmission(featureId, planPath) {
  return {
    schema: "pipeline.plan-submission.v1",
    featureId, planPath,
    planSha256: sha256Hex(`plan:${planPath}`),
    specPath: "specs/widget/spec.md",
    specSha256: sha256Hex("spec:specs/widget/spec.md"),
    profile: "feature",
    profileSha256: sha256Hex("profile"),
    submittedBy: "coordinator",
    submittedAt: NOW,
  };
}

function awaitingApprovalFixture(name) {
  const root = freshRoot(name);
  gitInitRoot(root);
  const featureId = "widget";
  const planPath = "specs/widget/prd.md";
  assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], { dir: root, now: () => NOW }), 0);

  const statePathValue = resolveStatePath(root);
  const state = JSON.parse(readFileSync(statePathValue, "utf8"));
  state.planSubmission = awaitingApprovalSubmission(featureId, planPath);
  writeFileSync(statePathValue, JSON.stringify(state, null, 2) + "\n");
  return { root, statePathValue, state };
}

// NVA-Q2-DRAFTDERIVE -- written FIRST, per the task's own DoD ordering: the
// property that keeps a machine from approving the PO's plan on their behalf
// must never regress while the sibling `draft` gate is made more capable.
// NVA-CF-PRESENTPLANDRIVER: this fixture now ALSO carries a `planPresentation`
// record bound to the exact current submission's sha256, so it correctly
// exercises the approve-plan stage rather than the present-plan stage that
// now precedes it (see the two present-plan tests directly below).
test("awaiting-approval stays collect-input with no executable/argv -- a machine must never approve a plan", () => {
  const { root, statePathValue, state } = awaitingApprovalFixture("awaiting-approval");
  const submissionSha256 = sha256CanonicalJson(state.planSubmission);
  state.planPresentation = {
    schema: "pipeline.plan-presentation.v1",
    submissionSha256,
    presentedBy: "coordinator",
    presentedAt: NOW,
  };
  writeFileSync(statePathValue, JSON.stringify(state, null, 2) + "\n");

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.nextAction.kind, "collect-input");
  assert.equal(payload.nextAction.executable, undefined,
    "the awaiting-approval gate must never carry an executable -- that would let a machine approve the PO's plan");
  assert.equal(payload.nextAction.argv, undefined,
    "the awaiting-approval gate must never carry an argv -- that would let a machine approve the PO's plan");
  assert.ok(payload.nextAction.guidance.includes("approve-plan"),
    "guidance must still point the PO at approve-plan themselves");
});

// NVA-CF-PRESENTPLANDRIVER: no planPresentation record exists yet -- the
// mechanical, session-safe present-plan step must surface as a runnable
// command (derivable --by), never straight to the approve-plan collect-input
// a session would otherwise walk into and be refused by.
test("awaiting-approval surfaces present-plan as a runnable command when no presentation record exists yet, with --by derived from local Git config", () => {
  const { root } = awaitingApprovalFixture("awaiting-approval-no-presentation");
  setLocalGitUserName(root, "Jordan Example");

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.nextAction.kind, "command");
  assert.equal(payload.nextAction.executable, process.execPath);
  assert.deepEqual(payload.nextAction.argv, [
    PIPELINE_STATE_SCRIPT_PATH, "present-plan", "--by", "Jordan Example",
  ]);
  assert.equal(payload.nextAction.mutation, true);
  assert.equal(payload.nextAction.requiresConfirmation, true);
});

// Same gap, but --by is not derivable: the branch must fall back to
// collect-input naming the missing value and rendering the exact command
// string, mirroring the `draft` branch's own undeliverable-value fallback --
// never a silent omission or an invented value.
test("awaiting-approval asks for present-plan's --by when local Git config carries none", () => {
  const { root } = awaitingApprovalFixture("awaiting-approval-no-presentation-no-by");
  // Deliberately no setLocalGitUserName call: the local Git config carries no user.name.

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.nextAction.kind, "collect-input");
  assert.equal(payload.nextAction.executable, undefined);
  assert.equal(payload.nextAction.argv, undefined);
  assert.deepEqual(payload.nextAction.inputs.map((input) => input.name), ["by"]);
  assert.ok(payload.nextAction.guidance.includes("present-plan"),
    `guidance must name present-plan: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes(PIPELINE_STATE_SCRIPT_PATH),
    `guidance must name the resolved absolute script path: ${payload.nextAction.guidance}`);
});

// A STALE presentation (bound to a prior submission's sha256, not the
// current one) is the exact edge approve-plan's own check already guards
// against (case "approve-plan", ~line 8364-8365): the driver must treat it
// exactly like "no presentation" and re-surface present-plan, not fall
// through to the approve-plan collect-input.
test("awaiting-approval re-surfaces present-plan when the existing presentation record is bound to a stale submission", () => {
  const { root, statePathValue, state } = awaitingApprovalFixture("awaiting-approval-stale-presentation");
  setLocalGitUserName(root, "Jordan Example");
  state.planPresentation = {
    schema: "pipeline.plan-presentation.v1",
    submissionSha256: sha256Hex("a-different-earlier-submission"),
    presentedBy: "coordinator",
    presentedAt: NOW,
  };
  writeFileSync(statePathValue, JSON.stringify(state, null, 2) + "\n");

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.nextAction.kind, "command");
  assert.deepEqual(payload.nextAction.argv, [
    PIPELINE_STATE_SCRIPT_PATH, "present-plan", "--by", "Jordan Example",
  ]);
});

// NVA-CF-PUSHDRIVERFINISH: the `implementing` branch (once the push
// threat-model artifact exists) now surfaces push-init.mjs discoverably --
// before this fix `grep -c "push-init" pipeline-state.mjs` was 0 (backlog:
// 2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md,
// "Re-verification, 2026-08-29"). `planApproval` here is the minimal LEGACY
// shape (`{approvedBy, approvedAt}`) -- the cheapest fixture that makes
// derivePlanLifecycle() (lib/plan-spec-state-v2.mjs) report a non-null
// current approval with no planSubmission present, which is exactly what
// turns `phase: "implementation"` into status `implementing` rather than
// `draft` (both submission and approval null would fall to `draft` instead).
function implementingFixture(name) {
  const root = freshRoot(name);
  gitInitRoot(root);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "push-threat-model.md"), "# Push threat model\nReviewed.\n");
  writeFileSync(resolveStatePath(root), JSON.stringify({
    schema: SCHEMA_ID,
    activeFeature: { id: "widget", planPath: "specs/widget/prd.md", phase: "implementation" },
    planApproved: true,
    planApproval: { approvedBy: "PO", approvedAt: "2026-08-18T12:00:00.000Z" },
  }, null, 2) + "\n");
  return root;
}

test("implementing next-action surfaces push-init.mjs discoverably, with the submitter derived from local Git config", () => {
  const root = implementingFixture("implementing-push-init-derivable");
  setLocalGitUserName(root, "Jordan Example");

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "implementing");
  assert.equal(payload.nextAction.kind, "collect-input");
  assert.equal(payload.nextAction.executable, undefined,
    "the implementing gate must never carry an executable -- the signature stays irreducibly human");
  assert.equal(payload.nextAction.argv, undefined,
    "the implementing gate must never carry an argv -- the signature stays irreducibly human");
  assert.ok(payload.nextAction.guidance.includes("push-init.mjs"),
    `guidance must name push-init.mjs so a blind session can discover it: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes("Jordan Example"),
    `guidance must fill in the submitter it DID resolve rather than placeholder it too: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes("<remote>"),
    `guidance must ask for the remote it cannot derive: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes("refs/heads/<branch>"),
    `guidance must ask for the destination it cannot derive: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes("docs/push-release-flow.md"),
    "the signature ceremony itself must still be named -- push-init.mjs never produces the signature");
  assert.ok(!/<[^>]+>/.test(payload.nextAction.guidance.replace(/<remote>|<submitter's name>|<project-root>|refs\/heads\/<branch>/g, "")),
    `no OTHER unfilled placeholder shape may leak into the guidance text: ${payload.nextAction.guidance}`);
});

test("implementing next-action also asks for the submitter when local Git config carries none", () => {
  const root = implementingFixture("implementing-push-init-no-by");
  // Deliberately no setLocalGitUserName call: the local Git config carries no user.name.

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "implementing");
  assert.ok(payload.nextAction.guidance.includes("push-init.mjs"));
  assert.ok(payload.nextAction.guidance.includes("<submitter's name>"),
    `guidance must ask for the submitter it cannot derive: ${payload.nextAction.guidance}`);
});

test("draft next-action becomes a runnable submit-plan command once submitter and profile are both derivable", () => {
  const root = freshRoot("both-derivable");
  gitInitRoot(root);
  setLocalGitUserName(root, "Jordan Example");
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, profile: "feature", activate: true });
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "draft");
  assert.equal(payload.nextAction.kind, "command");
  assert.equal(payload.nextAction.executable, process.execPath);
  assert.deepEqual(payload.nextAction.argv, [
    PIPELINE_STATE_SCRIPT_PATH, "submit-plan", "--by", "Jordan Example", "--profile", "feature",
  ]);
  assert.equal(payload.nextAction.mutation, true);
  assert.equal(payload.nextAction.requiresConfirmation, true);

  // Runnable in the sense the guided driver requires (onboarding-init.mjs
  // execs any `kind: "command"` action verbatim): `submit-plan` accepts
  // exactly this flag shape (`--by <name> --profile <epic|feature|mini>`),
  // proven directly against the CLI parser this argv would actually hit --
  // NOT proven by exercising submit-plan's own separate PO-authority/profile-
  // receipt ceremony gate, which is unrelated machinery outside this task's
  // scope (governs whether a submission is authorized, not whether the
  // derived --by/--profile values themselves are well-formed).
  assert.equal(payload.nextAction.argv[1], "submit-plan");
  assert.deepEqual(payload.nextAction.argv.slice(2), ["--by", "Jordan Example", "--profile", "feature"]);
});

test("draft next-action stays collect-input asking only for the missing profile when the submitter is derivable", () => {
  const root = freshRoot("profile-missing");
  gitInitRoot(root);
  setLocalGitUserName(root, "Jordan Example");
  // Deliberately no applyOnboardingIntakeConsent call: no intake checkpoint exists.
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.nextAction.kind, "collect-input");
  assert.deepEqual(payload.nextAction.inputs.map((input) => input.name), ["profile"]);
  assert.ok(payload.nextAction.guidance.includes(PIPELINE_STATE_SCRIPT_PATH),
    `guidance must name the resolved absolute script path: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes(process.execPath),
    `guidance must name the resolved interpreter: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes("submit-plan"));
  assert.ok(payload.nextAction.guidance.includes("Jordan Example"),
    `guidance must fill in the value it DID resolve rather than placeholder it too: ${payload.nextAction.guidance}`);
});

test("draft next-action stays collect-input asking only for the missing submitter when the profile is derivable", () => {
  const root = freshRoot("submitter-missing");
  gitInitRoot(root);
  // Deliberately no setLocalGitUserName call: the local Git config carries no user.name.
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, profile: "mini", activate: true });
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.nextAction.kind, "collect-input");
  assert.deepEqual(payload.nextAction.inputs.map((input) => input.name), ["by"]);
  assert.ok(payload.nextAction.guidance.includes(PIPELINE_STATE_SCRIPT_PATH),
    `guidance must name the resolved absolute script path: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes("mini"),
    `guidance must fill in the value it DID resolve rather than placeholder it too: ${payload.nextAction.guidance}`);
});

// NVA-R34-BLINDPUSHPATH: the `PO-PROFILE-RECEIPT-INVALID` precondition
// (backlog/items/2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md,
// "Progress and the next wall") is now checked BEFORE submit-plan's argv is
// derived, and named honestly rather than left for submit-plan itself to
// fail on undiscoverably. Both outcomes are asserted with a controlled
// `deps.spawn` stub -- real Git worktree/receipt topology is exercised by
// po-gate-authority.test.mjs, not duplicated here.
test("draft next-action offers the profile-receipt repair as a real command when the receipt is not ready and the repair plans cleanly", () => {
  const root = freshRoot("profile-repair-plans");
  gitInitRoot(root);
  setLocalGitUserName(root, "Jordan Example");
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, profile: "feature", activate: true });
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);

  const repairApplyAction = {
    executable: process.execPath,
    argv: ["/repair/po-gate-profile-repair.mjs", "apply", "--root", root, "--plan-sha256", "a".repeat(64), "--activate"],
    mutation: true, requiresConfirmation: true, requiresHostBoundary: true,
  };
  const result = invoke(root, ["inspect"], {
    poGateProfile: () => ({ ok: false, code: "PO-PROFILE-RECEIPT-INVALID", reason: "missing", repair: "run the repair" }),
    spawn: () => ({ status: 0, error: null, stdout: JSON.stringify({ applyAction: repairApplyAction }) }),
  });
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "draft");
  // The precondition wins over an otherwise-derivable submit-plan: the
  // published command is the repair, never a submit-plan argv the caller
  // has not been told will fail.
  assert.equal(payload.nextAction.kind, "command");
  assert.deepEqual(payload.nextAction, { kind: "command", ...repairApplyAction });
  assert.ok(!payload.nextAction.argv.some((element) => /^<.*>$/.test(element)),
    "no published argv element may be an unfilled placeholder");
});

test("draft next-action names the profile-receipt precondition explicitly when the repair itself cannot be planned", () => {
  const root = freshRoot("profile-repair-unplannable");
  gitInitRoot(root);
  setLocalGitUserName(root, "Jordan Example");
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, profile: "feature", activate: true });
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);

  const result = invoke(root, ["inspect"], {
    poGateProfile: () => ({ ok: false, code: "PO-PROFILE-RECEIPT-INVALID", reason: "the receipt is missing", repair: "Run node .../po-gate-profile-repair.mjs plan --root <root>, then retry." }),
    spawn: () => ({ status: 2, error: null, stdout: "" }),
  });
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.nextAction.kind, "collect-input",
    "an unplannable repair is a genuine stop, never a guessed command");
  assert.equal(payload.nextAction.executable, undefined);
  assert.equal(payload.nextAction.argv, undefined);
  assert.ok(payload.nextAction.guidance.includes("PO-PROFILE-RECEIPT-INVALID"),
    "the precondition's own code must be named, not left for submit-plan to fail on undiscoverably");
  assert.ok(payload.nextAction.guidance.includes("the receipt is missing"));
});

// NVA-CF-MINORPUSH-RETRY: when `poGateProfile()` itself supplies no `repair`
// text at all (its own repair advice unavailable), resolveDraftProfileReceiptAction()
// used to fall back to a hand-assembled template string that echoed the
// resolved absolute project root straight into this machine-consumed JSON --
// describeFailedPostimagePredicates()'s own "never absolute host paths"
// contract, violated. This asserts the fallback now renders through
// copy-safe-command.mjs and never leaks `root` (this test's own absolute
// fixture path) into the guidance text, using an unresolved
// `<project-root>` template slot instead -- exactly the shape `check.repair`
// itself already uses elsewhere (PROFILE_REPAIR in lib/po-gate-authority.mjs).
test("draft next-action's unplannable-repair fallback never leaks the absolute project root, even when the precondition itself supplies no repair text", () => {
  const root = freshRoot("profile-repair-unplannable-no-repair-text");
  gitInitRoot(root);
  setLocalGitUserName(root, "Jordan Example");
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, profile: "feature", activate: true });
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);

  const result = invoke(root, ["inspect"], {
    poGateProfile: () => ({ ok: false, code: "PO-PROFILE-AUTHORITY-UNAVAILABLE", reason: "topology is unavailable" }),
    spawn: () => ({ status: 2, error: null, stdout: "" }),
  });
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.nextAction.kind, "collect-input");
  assert.equal(payload.nextAction.executable, undefined);
  assert.equal(payload.nextAction.argv, undefined);
  assert.ok(payload.nextAction.guidance.includes("PO-PROFILE-AUTHORITY-UNAVAILABLE"));
  assert.ok(!payload.nextAction.guidance.includes(root),
    `guidance must never echo the absolute project root: ${payload.nextAction.guidance}`);
  assert.ok(payload.nextAction.guidance.includes("<project-root>"),
    "the rendered fallback command must carry an unresolved template slot, never the real path");
  assert.ok(payload.nextAction.guidance.includes("po-gate-profile-repair.mjs"),
    "the fallback must still name the real repair script, just without the leaked root");
});

test("inspect reports phoenixEpicHistory as null when the field is absent", () => {
  const root = freshRoot("no-phoenix");
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);
  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.phoenixEpicHistory, null);
});

test("inspect surfaces a compact phoenixEpicHistory summary when the field is present (RW2-STATEKEY)", () => {
  const root = freshRoot("phoenix");
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);
  const statePathValue = resolveStatePath(root);
  const state = JSON.parse(readFileSync(statePathValue, "utf8"));
  state.phoenixEpicHistory = {
    note: "preserved verbatim, historical record only",
    activeFeature: { id: "sprint-phoenix-epic", planPath: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", phase: "implementation" },
    continuity: { schema: "pipeline.continuity.v0", featureId: "sprint-phoenix-epic", revision: 8 },
  };
  writeFileSync(statePathValue, JSON.stringify(state, null, 2) + "\n");
  const beforeBytes = readFileSync(statePathValue, "utf8");

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.deepEqual(payload.phoenixEpicHistory, {
    present: true,
    featureId: "sprint-phoenix-epic",
    continuityRevision: 8,
    note: "preserved verbatim, historical record only",
  });

  // Zero mutation: inspect must not touch the state file even when this field is present.
  const afterBytes = readFileSync(statePathValue, "utf8");
  assert.equal(afterBytes, beforeBytes, "inspect must not mutate the state file");
});

test("--help lists inspect among the accepted commands", () => {
  const root = freshRoot("help");
  const result = invoke(root, ["--help"]);
  assert.equal(result.status, 0, result.err);
  assert.ok(result.out.includes("inspect"), "help output must name the inspect subcommand");
});
