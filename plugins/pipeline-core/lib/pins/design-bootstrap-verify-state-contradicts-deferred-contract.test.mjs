// SPDX-License-Identifier: SUL-1.0
// Regression pin for pipeline.design-bootstrap-verify-state-contradicts-deferred-contract (ALF-C-P1-23, AC-150).
//
// Original acceptance (backlog item):
//   A1. A fresh test-less project with `verify: null` receives an unambiguous
//       design-stage state, distinct from a passing Verify result.
//   A2. Implementation authority and release Verify reject the deferred state.
//   A3. A real command can be supplied once and yields an exact readback
//       without repeating unrelated onboarding questions.
//
// Measured source behaviour on this candidate for A2: the DESIGN->IMPLEMENTATION
// transition ADMITS the typed baseline-only state without a command (explicit newer
// baseline-implementation policy, pinned by pipeline-state.test.mjs NVA-CF-VERIFYDEADLOCK),
// while an explicit placeholder/blank --verify-command is refused and release stays
// blocked ("release remains blocked" in checkVerifyContractConfigured). Case A2-literal
// below pins that measured behaviour; it is the point whose wording the newer policy
// supersedes and is named as an open PO question in the dispatch report.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { classifyVerifyCommand, run } from "../../scripts/pipeline-state.mjs";
import { checkVerifyContractConfigured } from "../../scripts/push-gate-satisfiability.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const FIXTURES = mkdtempSync(join(SCRATCH, "design-bootstrap-verify-"));
after(() => rmSync(FIXTURES, { recursive: true, force: true }));

const NOW = "2026-10-12T12:00:00.000Z";
const PLACEHOLDER = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";
const REAL = `${process.execPath} -e "process.exit(0)"`;
let counter = 0;

function fixture({ verify, withCalibration = true }) {
  const root = join(FIXTURES, `f${counter += 1}`);
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  if (withCalibration) {
    const calibration = { project: "fresh-testless", verify, handover: "docs/state.md" };
    for (const path of [join(root, "project", "pipeline.json"), join(root, ".claude", "pipeline.json")]) {
      writeFileSync(path, `${JSON.stringify(calibration, null, 2)}\n`);
    }
  }
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "design-bootstrap", planPath: "specs/design-bootstrap/prd.md", phase: "design" },
    planApproved: true,
    planApproval: { approvedBy: "PO", approvedAt: NOW },
  }, null, 2));
  return { root, deps: { dir: root, now: () => NOW, architectureEntryReadiness: () => ({ status: "ready" }) } };
}

function quiet(fn) {
  const log = console.log;
  const error = console.error;
  const lines = [];
  console.log = (...args) => { lines.push(args.join(" ")); };
  console.error = () => {};
  try { return { result: fn(), lines }; } finally { console.log = log; console.error = error; }
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const phaseOf = (root) => readJson(join(root, "project", "pipeline-state.json")).activeFeature.phase;

test("A1: verify null / blank / placeholder classify as typed baseline-only, never configured", () => {
  for (const value of [null, undefined, "", "   ", PLACEHOLDER, 7]) {
    assert.equal(classifyVerifyCommand(value), "baseline-only", `value ${String(value)}`);
  }
  assert.equal(classifyVerifyCommand(REAL), "configured");
});

test("A1: the release-contract check reports baseline-only distinctly from configured and states release stays blocked", () => {
  const check = (verify) => checkVerifyContractConfigured(FIXTURES, {
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "project/pipeline.json" }),
    readFile: () => JSON.stringify({ verify }),
  });
  for (const verify of [null, "   ", PLACEHOLDER]) {
    const result = check(verify);
    assert.equal(result.status, "baseline-only");
    assert.notEqual(result.status, "configured", "a deferred contract must not read as a passing/configured Verify");
    assert.match(result.message, /release remains blocked/u);
  }
  const configured = check("npm test");
  assert.equal(configured.status, "configured");
  assert.doesNotMatch(configured.message, /release remains blocked/u);
  const missing = checkVerifyContractConfigured(FIXTURES, { resolveAuthorityArtifactPath: () => ({ exists: false }) });
  assert.equal(missing.status, "missing");
  assert.equal(missing.ok, false);
});

test("A1/A3: a fresh verify:null project's design state is not rewritten into a command when entering implementation",() => {
  const { root, deps } = fixture({ verify: null });
  const neutral = join(root, "project", "pipeline.json");
  const before = readFileSync(neutral, "utf8");
  assert.equal(quiet(() => run(["set-phase", "--phase", "implementation"], deps)).result, 0);
  assert.equal(phaseOf(root), "implementation");
  assert.equal(readFileSync(neutral, "utf8"), before, "entering on the deferred contract must not relabel or invent a command");
  assert.equal(readJson(neutral).verify, null);
  // The typed late-recovery action (configure-verify, one verify-command input) needs committed
  // twins in a real git work tree; it is pinned by pipeline-state-late-verify.test.mjs and is not
  // re-exercised here (host limitation: no git fixture under this pin's write scope).
  assert.equal(quiet(() => run(["inspect"], deps)).result, 0, "inspect still reads the implementing project");
});

test("A2: a placeholder, blank or whitespace --verify-command is refused at the implementation transition with zero mutation", () => {
  const { root, deps } = fixture({ verify: null });
  const files = [join(root, "project", "pipeline.json"), join(root, ".claude", "pipeline.json"), join(root, "project", "pipeline-state.json")];
  const before = files.map((path) => readFileSync(path, "utf8"));
  for (const value of [PLACEHOLDER, "   ", ""]) {
    assert.equal(quiet(() => run(["set-phase", "--phase", "implementation", "--verify-command", value], deps)).result, 2, `value ${JSON.stringify(value)}`);
  }
  assert.deepEqual(files.map((path) => readFileSync(path, "utf8")), before);
  assert.equal(phaseOf(root), "design");
});

test("A2: a missing calibration is refused (not silently treated as deferred) at the implementation transition", () => {
  const { root, deps } = fixture({ verify: null, withCalibration: false });
  assert.equal(quiet(() => run(["set-phase", "--phase", "implementation"], deps)).result, 2);
  assert.equal(phaseOf(root), "design");
});

test("A2-literal (measured policy): without --verify-command the transition ADMITS baseline-only; release is the blocked side", () => {
  // Pins current behaviour so a change in either direction is a visible, deliberate decision.
  for (const verify of [null, PLACEHOLDER]) {
    const { root, deps } = fixture({ verify });
    assert.equal(quiet(() => run(["set-phase", "--phase", "implementation"], deps)).result, 0);
    assert.equal(phaseOf(root), "implementation");
    assert.equal(checkVerifyContractConfigured(root).status, "baseline-only");
    assert.match(checkVerifyContractConfigured(root).message, /release remains blocked/u);
  }
});

test("A3: a real command is supplied once, written to both calibration twins, and replays without it", () => {
  const { root, deps } = fixture({ verify: null });
  assert.equal(quiet(() => run(["set-phase", "--phase", "implementation", "--verify-command", REAL], deps)).result, 0);
  const neutral = readJson(join(root, "project", "pipeline.json"));
  const legacy = readJson(join(root, ".claude", "pipeline.json"));
  assert.equal(neutral.verify, REAL);
  assert.equal(legacy.verify, REAL, "legacy twin must carry the identical command");
  assert.equal(neutral.project, "fresh-testless", "unrelated calibration fields survive");
  assert.equal(neutral.handover, "docs/state.md");
  assert.equal(classifyVerifyCommand(neutral.verify), "configured");
  assert.equal(checkVerifyContractConfigured(root).status, "configured");
  // Replay (reopen to design, re-enter): the command is already configured, no flag needed, no rewrite.
  const state = readJson(join(root, "project", "pipeline-state.json"));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({ ...state, activeFeature: { ...state.activeFeature, phase: "design" } }, null, 2));
  const bytes = readFileSync(join(root, "project", "pipeline.json"), "utf8");
  assert.equal(quiet(() => run(["set-phase", "--phase", "implementation"], deps)).result, 0);
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), bytes);
  assert.equal(phaseOf(root), "implementation");
});
