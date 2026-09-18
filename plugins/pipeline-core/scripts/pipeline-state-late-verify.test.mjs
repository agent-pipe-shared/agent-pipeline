// SPDX-License-Identifier: SUL-1.0
// Regression coverage for pipeline.baseline-only-verify-needs-an-actionable-release-recovery.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";
import { checkVerifyContractConfigured } from "./push-gate-satisfiability.mjs";

const NOW = "2026-09-18T12:00:00.000Z";
const SEEDED_VERIFY = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";

function rootFor(name) {
  return mkdtempSync(join(tmpdir(), `pipeline-late-verify-${name}-`));
}

function writeFixture(root, { phase = "design", legacy = "baseline", command = SEEDED_VERIFY } = {}) {
  const calibration = { project: "late-verify-fixture", verify: command, handover: "docs/state.md" };
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(root, ".claude", "pipeline.json"), legacy === "malformed"
    ? "{ malformed\n"
    : `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "late-verify", planPath: "specs/late-verify/prd.md", phase },
    planApproved: true,
    planApproval: { approvedBy: "PO", approvedAt: NOW },
  }, null, 2));
}

function quietConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  console.log = (...args) => { logs.push(args.join(" ")); };
  console.error = () => {};
  try { return { result: fn(), logs }; } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("baseline-only implementation exposes and completes the typed late verify recovery", () => {
  const root = rootFor("happy-path");
  writeFixture(root);
  const deps = { dir: root, now: () => NOW };

  assert.equal(quietConsole(() => run(["set-phase", "--phase", "implementation"], deps)).result, 0,
    "the deliberately baseline-only approved project enters implementation first");
  const inspection = quietConsole(() => run(["inspect"], deps));
  assert.equal(inspection.result, 0);
  const action = JSON.parse(inspection.logs.join("\n")).nextAction;
  assert.deepEqual(action.inputs.map((input) => input.name), ["verify-command"]);
  assert.deepEqual(action.applyAction.argv.slice(1, 3), ["configure-verify", "--verify-command"],
    "the ordinary driver receives a typed recovery rather than discovering it at push time");

  const neutralPath = join(root, "project", "pipeline.json");
  const legacyPath = join(root, ".claude", "pipeline.json");
  const before = [readFileSync(neutralPath, "utf8"), readFileSync(legacyPath, "utf8")];
  assert.equal(quietConsole(() => run(["configure-verify", "--verify-command", " "], deps)).result, 2);
  assert.deepEqual([readFileSync(neutralPath, "utf8"), readFileSync(legacyPath, "utf8")], before,
    "a blank input fails before either calibration twin changes");

  const command = `${process.execPath} --test harness/scripts/check-consumer-safe-paths.test.mjs`;
  assert.equal(quietConsole(() => run(["configure-verify", "--verify-command", command], deps)).result, 0);
  assert.equal(JSON.parse(readFileSync(neutralPath, "utf8")).verify, command);
  assert.equal(JSON.parse(readFileSync(legacyPath, "utf8")).verify, command,
    "both calibration twins receive the same command through the canonical writer");
  assert.equal(checkVerifyContractConfigured(root).ok, true,
    "the push-readiness verify-contract check is now unblocked without an override or scratch workaround");

  const configured = [readFileSync(neutralPath, "utf8"), readFileSync(legacyPath, "utf8")];
  assert.equal(quietConsole(() => run(["configure-verify", "--verify-command", command], deps)).result, 0,
    "the exact command is an idempotent zero-write replay");
  assert.deepEqual([readFileSync(neutralPath, "utf8"), readFileSync(legacyPath, "utf8")], configured);
  assert.equal(quietConsole(() => run(["configure-verify", "--verify-command", "node --test other.mjs"], deps)).result, 2,
    "an already configured command only admits its exact replay");
  assert.deepEqual([readFileSync(neutralPath, "utf8"), readFileSync(legacyPath, "utf8")], configured);
});

test("late verify recovery fails closed for malformed twins and non-implementing lifecycle", () => {
  const malformed = rootFor("malformed");
  writeFixture(malformed, { phase: "implementation", legacy: "malformed" });
  const neutralPath = join(malformed, "project", "pipeline.json");
  const beforeMalformed = readFileSync(neutralPath, "utf8");
  assert.equal(quietConsole(() => run(["configure-verify", "--verify-command", "node --test"], { dir: malformed, now: () => NOW })).result, 2);
  assert.equal(readFileSync(neutralPath, "utf8"), beforeMalformed,
    "a malformed sibling causes no write to the healthy calibration");

  const nonImplementing = rootFor("non-implementing");
  writeFixture(nonImplementing);
  const nonImplementingNeutral = join(nonImplementing, "project", "pipeline.json");
  const beforeNonImplementing = readFileSync(nonImplementingNeutral, "utf8");
  assert.equal(quietConsole(() => run(["configure-verify", "--verify-command", "node --test"], { dir: nonImplementing, now: () => NOW })).result, 2);
  assert.equal(readFileSync(nonImplementingNeutral, "utf8"), beforeNonImplementing,
    "the route cannot configure a design-phase project");

  const staleAuthority = rootFor("stale-authority");
  writeFixture(staleAuthority, { phase: "implementation" });
  const staleStatePath = join(staleAuthority, "project", "pipeline-state.json");
  const staleState = JSON.parse(readFileSync(staleStatePath, "utf8"));
  staleState.planApproval = { submissionSha256: "stale" };
  writeFileSync(staleStatePath, JSON.stringify(staleState, null, 2));
  const staleNeutral = join(staleAuthority, "project", "pipeline.json");
  const beforeStale = readFileSync(staleNeutral, "utf8");
  assert.equal(quietConsole(() => run(["configure-verify", "--verify-command", "node --test"], { dir: staleAuthority, now: () => NOW })).result, 2);
  assert.equal(readFileSync(staleNeutral, "utf8"), beforeStale,
    "a stale or malformed plan approval cannot authorize the late calibration write");
});
