#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.plan-submission-must-not-require-separate-po-approval
 * (AC-227). Agent-authored plan submission needs no human acknowledgement or
 * signature; the single final PO decision is the only thing that grants
 * implementation authority.
 *
 * Every case drives the real `pipeline-state.mjs` `run()` entry point (the
 * sanctioned writer) with its documented injection seams (`poGateAuthority`,
 * `poGateProfile`, `now`, `readHumanApprovalMode`). No behaviour under test is
 * mocked. Fixtures live under the repository's scratch/ directory.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, statePath } from "../../scripts/pipeline-state.mjs";
import { applyOnboardingIntakeConsent } from "../onboarding-continuity.mjs";
import { initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";

const SCRATCH = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../../scripts/pipeline-state.mjs", import.meta.url));
const NOW = "2026-10-12T12:00:00.000Z";
const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

function capture(argv, deps) {
  const out = []; const err = [];
  const log = console.log; const error = console.error;
  console.log = (...v) => out.push(v.join(" "));
  console.error = (...v) => err.push(v.join(" "));
  try { return { status: run(argv, deps), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}

function git(root, ...args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function readState(root) { return JSON.parse(readFileSync(statePath(root), "utf8")); }

/** A draft mini-profile feature: real plan/spec bytes, real State, injected authority seams. */
function fixture(featureId, { intake = false } = {}) {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "plan-submission-pin-"));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Jordan Example");
  // A born HEAD is required: the State authority route fails on an unborn HEAD (WT-GIT-FAILED).
  git(root, "-c", "user.name=x", "-c", "user.email=x@example.invalid", "commit", "-q", "--allow-empty", "-m", "init");
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  const planPath = `specs/${featureId}/prd.md`;
  const specPath = `specs/${featureId}/spec.md`;
  mkdirSync(join(root, "specs", featureId), { recursive: true });
  const specBytes = Buffer.from("# Technical Spec\nOrdinary fixture authority.\n", "utf8");
  const specSha256 = sha256Hex(specBytes);
  const planBytes = Buffer.from(`<!-- po-language: en -->\n<!-- technical-spec-sha256: ${specSha256} -->\n# PRD\n${featureId}\n`, "utf8");
  const planSha256 = sha256Hex(planBytes);
  writeFileSync(join(root, specPath), specBytes);
  writeFileSync(join(root, planPath), planBytes);
  if (intake) applyOnboardingIntakeConsent({ rootDir: root, granted: true, profile: "mini", activate: true });
  assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], { dir: root, now: () => NOW }), 0);
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: "1".repeat(64), runtimeSha256: "2".repeat(64),
    receiptSha256: "3".repeat(64), repositoryFingerprint: "4".repeat(64),
  };
  const authorityValue = { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256, specPath, specSha256 };
  const deps = {
    dir: root, now: () => NOW,
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: () => ({ ok: true, value: authorityValue }),
  };
  return { root, deps, planPath, specPath, planSha256, specSha256, profile, authorityValue };
}

const submitArgs = (profile = "mini") => ["submit-plan", "--by", "coordinator", "--profile", profile];

test("AC1: agent submission succeeds with no human acknowledgement input, prompt, or signature (real writer)", () => {
  const f = fixture("pin-submit");
  const before = readState(f.root);
  assert.equal(before.planSubmission, undefined);
  // No isattyFn/readLineFn/proof/receipt/ack flag of any kind is supplied.
  const result = capture(submitArgs(), f.deps);
  assert.equal(result.status, 0, result.err);
  assert.match(result.out, /lifecycle="awaiting-approval"/);
  const state = readState(f.root);
  assert.equal(state.planSubmission.submittedBy, "coordinator");
  assert.equal(state.planSubmission.planSha256, f.planSha256);
  assert.equal(state.planSubmission.specSha256, f.specSha256);
  // The submission writes no human-decision record of any kind.
  for (const key of ["poGateAcknowledgement", "planApproval", "planApprovalAttribution", "planApprovalProof"]) {
    assert.ok(state[key] === undefined || state[key] === null, `submit-plan must not create ${key}`);
  }
  assert.notEqual(result.out.includes("acknowledg"), true, "submit-plan output must not ask for an acknowledgement");
});

test("AC1: submit-plan never emits a content-acknowledgement stop on a clean plan, and the stop schema is absent from success", () => {
  const f = fixture("pin-no-stop");
  const result = capture(submitArgs(), f.deps);
  assert.equal(result.status, 0, result.err);
  assert.equal(result.err, "");
  assert.ok(!result.out.includes("pipeline.submit-plan-stop.v1"));
  assert.ok(!result.out.includes("PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING"));
});

test("AC1: the returned draft next-action is a runnable submit-plan command that states no confirmation is required", () => {
  const f = fixture("pin-draft-action", { intake: true });
  const result = capture(["inspect"], f.deps);
  assert.equal(result.status, 0, result.err);
  const action = JSON.parse(result.out).nextAction;
  assert.equal(action.kind, "command");
  assert.deepEqual(action.argv, [SCRIPT, "submit-plan", "--by", "Jordan Example", "--profile", "mini"]);
  assert.equal(action.mutation, true);
  assert.equal(action.requiresConfirmation, false);
  assert.equal(action.inputs, undefined);
  assert.equal(action.input, undefined);
  // The returned action is itself executable against the real writer.
  const submitted = capture(action.argv.slice(1), f.deps);
  assert.equal(submitted.status, 0, submitted.err);
});

test("AC1/AC4: the post-submission next-action is the mechanical present-plan command with no confirmation", () => {
  const f = fixture("pin-present-action");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  const result = capture(["inspect"], f.deps);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.nextAction.kind, "command");
  assert.deepEqual(payload.nextAction.argv.slice(1, 2), ["present-plan"]);
  assert.equal(payload.nextAction.requiresConfirmation, false);
});

test("AC4: submission and presentation grant no implementation authority; approval is a separate final step", () => {
  const f = fixture("pin-no-authority");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  let state = readState(f.root);
  assert.equal(state.planApproved, false);
  assert.equal(state.activeFeature.phase, "design");
  assert.equal(capture(["present-plan", "--by", "coordinator"], f.deps).status, 0);
  state = readState(f.root);
  assert.equal(state.planApproved, false, "presenting the package must not approve it");
  assert.equal(state.activeFeature.phase, "design", "presenting must not enter implementation");
  assert.ok(state.planApproval === undefined || state.planApproval === null);
  const inspected = JSON.parse(capture(["inspect"], f.deps).out);
  assert.equal(inspected.planApproved, false);
  assert.equal(inspected.phase, "design");
});

test("AC4/AC6: both approval modes - the one final decision stays human-gated and no machine-runnable approve exists", () => {
  for (const mode of ["chat", "signature"]) {
    const f = fixture(`pin-mode-${mode}`);
    assert.equal(capture(submitArgs(), f.deps).status, 0);
    assert.equal(capture(["present-plan", "--by", "coordinator"], f.deps).status, 0);
    const deps = { ...f.deps, readHumanApprovalMode: () => ({ mode, source: "pipeline.user.yaml", key: "human_approval", scope: "global" }) };
    const payload = JSON.parse(capture(["inspect"], deps).out);
    assert.equal(payload.status, "awaiting-approval");
    const action = payload.nextAction;
    // Never a bare machine-executable approve-plan argv (that would let an agent approve for the PO).
    assert.ok(!(action.kind === "command" && action.requiresConfirmation === false
      && Array.isArray(action.argv) && action.argv.includes("approve-plan")),
    `mode ${mode}: no unconfirmed approve-plan command may be offered`);
    // Implementation stays refused until the final decision: submission + presentation alone
    // cannot start implementation.
    const attempt = capture(["set-phase", "--phase", "implementation"], deps);
    assert.notEqual(attempt.status, 0, `mode ${mode}: ${attempt.out} ${attempt.err}`);
    const state = readState(f.root);
    assert.equal(state.planApproved, false);
    assert.equal(state.activeFeature.phase, "design");
  }
});

test("AC4: approve-plan before present-plan is refused naming present-plan; submission alone leaves it unapproved", () => {
  const f = fixture("pin-approve-before-present");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  const attempt = capture(["approve-plan", "--by", "po-test"], f.deps);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /present-plan/);
  assert.equal(readState(f.root).planApproved, false);
});

test("AC2: forged or stale profile authority - submit-plan refuses and records nothing", () => {
  const f = fixture("pin-stale-profile");
  const stale = { ...f.deps, poGateProfile: () => ({ ok: false, code: "PO-PROFILE-RECEIPT-INVALID" }) };
  const attempt = capture(submitArgs(), stale);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /PO-PROFILE-RECEIPT-INVALID/);
  assert.equal(readState(f.root).planSubmission, undefined);
  const forged = { ...f.deps, poGateAuthority: () => ({ ok: false, code: "PO-GATE-AUTHORITY-INVALID" }) };
  const second = capture(submitArgs(), forged);
  assert.equal(second.status, 2);
  assert.match(second.err, /PO-GATE-AUTHORITY-INVALID/);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC2: authority bound to a different plan path than the active feature is refused", () => {
  const f = fixture("pin-wrong-plan-path");
  const wrong = { ...f.deps, poGateAuthority: () => ({ ok: true, value: { ...f.authorityValue, planPath: "specs/other/prd.md" } }) };
  const attempt = capture(submitArgs(), wrong);
  assert.equal(attempt.status, 2);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC2: source drift between observation and commit is refused and fabricates no submission", () => {
  const f = fixture("pin-drift");
  let calls = 0;
  const drifting = {
    ...f.deps,
    poGateAuthority: () => {
      calls += 1;
      return { ok: true, value: calls === 1 ? f.authorityValue : { ...f.authorityValue, planSha256: "9".repeat(64) } };
    },
  };
  const attempt = capture(submitArgs(), drifting);
  assert.equal(attempt.status, 2, attempt.out);
  assert.match(attempt.err, /failed before commit/);
  const state = readState(f.root);
  assert.equal(state.planSubmission, undefined);
  assert.equal(state.planApproved, false);
});

test("AC2: a profile change at submission time requires PO authority, not the submitter", () => {
  const f = fixture("pin-profile-change", { intake: true });
  const attempt = capture(submitArgs("epic"), f.deps);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /PROFILE-CHANGE-REQUIRES-PO/);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC2: incomplete feature package - submit-plan under the feature profile refuses without a design package", () => {
  const f = fixture("pin-incomplete-package");
  // The draft-design precondition applies to a repository carrying the greenfield map scaffold.
  for (const target of initialGreenfieldMapTargets("fresh")) {
    mkdirSync(dirname(join(f.root, target.path)), { recursive: true });
    writeFileSync(join(f.root, target.path), target.bytes);
  }
  const attempt = capture(submitArgs("feature"), f.deps);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /ARCHITECTURE-DESIGN|complete the exact draft architecture design/);
  assert.match(attempt.err, /No submission or signature request was recorded/);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC2: a plan still carrying framing placeholder text cannot be submitted", () => {
  const f = fixture("pin-framing");
  writeFileSync(join(f.root, f.planPath), "# PRD\n\n## Why\n<Problem/benefit/trigger; how success is measured.>\n");
  const attempt = capture(submitArgs(), f.deps);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /framing/i);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC6: replayed approval - a second approve-plan never changes the recorded approval", () => {
  const f = fixture("pin-replay");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  assert.equal(capture(["present-plan", "--by", "coordinator"], f.deps).status, 0);
  const first = capture(["approve-plan", "--by", "coordinator"], f.deps);
  assert.equal(first.status, 0, first.err);
  const approved = readState(f.root);
  assert.equal(approved.planApproved, true);
  const second = capture(["approve-plan", "--by", "someone-else"], f.deps);
  const after = readState(f.root);
  assert.equal(after.planApproved, true);
  assert.deepEqual(after.planApproval, approved.planApproval, `replay must not rewrite the approval (status ${second.status})`);
  assert.equal(after.activeFeature.phase, approved.activeFeature.phase, "replay must not advance the phase");
});

test("pin hygiene: fixtures live under the repository scratch directory and are cleaned up", () => {
  const f = fixture("pin-hygiene");
  assert.ok(f.root.startsWith(SCRATCH.replace(/[\\/]$/, "")));
  assert.ok(existsSync(statePath(f.root)));
});
