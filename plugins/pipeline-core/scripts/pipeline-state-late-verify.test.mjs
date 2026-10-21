// SPDX-License-Identifier: SUL-1.0
// Regression coverage for pipeline.baseline-only-verify-needs-an-actionable-release-recovery.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";
import { checkVerifyContractConfigured } from "./push-gate-satisfiability.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "../lib/test-item-approved-course-fixture.mjs";

const NOW = "2026-09-18T12:00:00.000Z";
const SEEDED_VERIFY = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";

function rootFor(name) {
  const root = mkdtempSync(join(tmpdir(), `pipeline-late-verify-${name}-`));
  execFileSync("git", ["init", "-q"], { cwd: root, windowsHide: true });
  return root;
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
  // QG-04 (E14, specs/sprint-alfred-epic/plans/elephant-decisions-2026-10-19.md; AC-150): configure-verify now
  // requires a VERIFIED approval record and reads the COMMITTED calibration layout; the former hand-seeded
  // planApproval and uncommitted twins can supply neither. Only this examiner's setup predated the stricter,
  // intended gate (the same repair as the NVA-GF-LATEVERIFY-1 examiner in pipeline-state.test.mjs). The setup
  // reaches the approved, implementing state through the production writers (prepareApprovedItemCourseFixture),
  // then commits the baseline-only twins; the configured twins are committed before the replay. The root lives
  // under the checkout's scratch/ directory because the fixture refuses an OS-temp ancestor. Every assertion
  // below is unchanged; the removed set-phase assertion is replaced by the approved fixture itself.
  const root = mkdtempSync(join(nativeContractFixtureParent(), "late-verify-happy-"));
  prepareApprovedItemCourseFixture({ root });
  const seeded = `${JSON.stringify({ project: "late-verify-fixture", verify: SEEDED_VERIFY, handover: "docs/state.md" }, null, 2)}\n`;
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.json"), seeded);
  writeFileSync(join(root, ".claude", "pipeline.json"), seeded);
  const gitIn = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { windowsHide: true });
  gitIn("add", "--", "project/pipeline.json", ".claude/pipeline.json");
  gitIn("commit", "-q", "--no-verify", "-m", "seed unconfigured verify");
  const deps = { dir: root, architectureEntryReadiness: () => ({ status: "ready" }) };

  const inspection = quietConsole(() => run(["inspect"], deps));
  assert.equal(inspection.result, 0);
  const action = JSON.parse(inspection.logs.join("\n")).nextAction;
  assert.deepEqual(action.inputs.map((input) => input.name), ["verify-command"]);
  assert.equal(action.requiresConfirmation, false,
    "collecting the project-specific command remains read-only");
  assert.equal(action.applyAction.requiresConfirmation, true,
    "the protected calibration mutation requires a fresh attended confirmation");
  assert.deepEqual(action.applyAction.argv.slice(1, 3), ["configure-verify", "--verify-command"],
    "the ordinary driver receives a typed recovery rather than discovering it at push time");

  const neutralPath = join(root, "project", "pipeline.json");
  const legacyPath = join(root, ".claude", "pipeline.json");
  const before = [readFileSync(neutralPath, "utf8"), readFileSync(legacyPath, "utf8")];
  assert.equal(quietConsole(() => run(["configure-verify", "--verify-command", " "], deps)).result, 2);
  assert.deepEqual([readFileSync(neutralPath, "utf8"), readFileSync(legacyPath, "utf8")], before,
    "a blank input fails before either calibration twin changes");

  const command = `${process.execPath} --test harness/scripts/check-consumer-safe-paths.test.mjs`;
  const applied = quietConsole(() => run(["configure-verify", "--verify-command", command], deps));
  assert.equal(applied.result, 0);
  assert.equal(applied.logs.some((line) => /signature|override/u.test(line)), false,
    "the confirmed apply action reaches the direct writer without inventing a second signature or override ceremony");
  assert.equal(JSON.parse(readFileSync(neutralPath, "utf8")).verify, command);
  assert.equal(JSON.parse(readFileSync(legacyPath, "utf8")).verify, command,
    "both calibration twins receive the same command through the canonical writer");
  assert.equal(checkVerifyContractConfigured(root).ok, true,
    "the push-readiness verify-contract check is now unblocked without an override or scratch workaround");

  // QG-04 (E14): the replay and the already-configured refusal read the committed layout, so the two configured
  // twins are committed with the add/commit pair the printed route names. No assertion below changes.
  gitIn("add", "--", "project/pipeline.json", ".claude/pipeline.json");
  gitIn("commit", "-q", "--no-verify", "-m", "chore: configure project verification");
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
