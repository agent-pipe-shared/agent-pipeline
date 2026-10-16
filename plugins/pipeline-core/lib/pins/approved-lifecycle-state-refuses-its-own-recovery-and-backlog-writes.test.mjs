// SPDX-License-Identifier: SUL-1.0
// ALF-C-P19-02 / AC-115: pin for backlog item
// pipeline.approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes.
// Acceptance points (the item's Proposal):
//   P1 the ready-gate yields a valid observation for every lifecycle state the writer can produce, `approved` included;
//   P2 the recovery command a denial names is admitted in the state that emits it;
//   P3 backlog/, docs/ and scratch/ writes stay admitted in every lifecycle state.
// Host limitation (PO decision K7): directory symlink/junction escape cases need link creation, which is unavailable
// on this native Windows host; the case is skipped below with owner Coordinator and due date 2026-10-19.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { evaluateLifecycleReadyGuard, isSanctionedLifecycleCommand } from "../../hooks/guard-lifecycle-ready.mjs";
import { ProjectOnboardingReadyError, requireProjectOnboardingReady } from "../project-onboarding-ready-gate.mjs";
import {
  expectedPipelineScriptsRunnerAllowlistEntries,
  PROJECT_ONBOARDING_BASE_RESULT_KEYS,
  PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS,
  PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
} from "../project-onboarding-v3.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const SCRIPTS = fileURLToPath(new URL("../../scripts/", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const SCRATCH = join(REPO, "scratch");
const ONBOARDING_SCRIPT = join(SCRIPTS, "project-onboarding-v3.mjs");
const PIPELINE_STATE_SCRIPT = join(SCRIPTS, "pipeline-state.mjs");
const FIXTURES = [];
process.on("exit", () => { for (const d of FIXTURES) { try { rmSync(d, { recursive: true, force: true }); } catch { /* scratch */ } } });

function scratchDir(prefix) {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = realpathSync(mkdtempSync(join(SCRATCH, prefix)));
  FIXTURES.push(dir);
  return dir;
}

// ---- P1: producer -> gate conformance -------------------------------------------------------------------------
// designToImplementationHandoverAction() is module-private, so its REAL source text is extracted and instantiated with
// stubs only for its data inputs (authority, architecture inspection, verify configuration).
const PRODUCER_SOURCE = readFileSync(join(LIB, "project-onboarding-v3.mjs"), "utf8");
function extractFunction(name) {
  const start = PRODUCER_SOURCE.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `producer function ${name} not found`);
  let i = PRODUCER_SOURCE.indexOf("{", PRODUCER_SOURCE.indexOf(")", start));
  let depth = 0;
  for (let j = i; j < PRODUCER_SOURCE.length; j += 1) {
    if (PRODUCER_SOURCE[j] === "{") depth += 1;
    else if (PRODUCER_SOURCE[j] === "}") { depth -= 1; if (depth === 0) return PRODUCER_SOURCE.slice(start, j + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}
const NAMES = ["commandAction", "verifyCommandInput", "collectImplementationVerifyCommandAction", "designToImplementationHandoverAction"];
const state = { verifyOk: true };
const producer = new Function(
  "persistedPoAuthority", "inspectArchitectureDesign", "checkVerifyContractConfigured", "detectVerifyCommandCandidate",
  "PO_AUTHORITY_REBIND_WRITER", "SCHEMA", "PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER", "VERIFY_COMMAND_MAX_BYTES",
  `${NAMES.map(extractFunction).join("\n")}\nreturn designToImplementationHandoverAction;`,
)(
  (_root, fs) => fs.authority, () => { throw new Error("overridden via fs"); }, () => ({ ok: state.verifyOk }), () => null,
  PIPELINE_STATE_SCRIPT, "pipeline.project-onboarding.v4", PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER, 512,
);

function observation(root, nextAction) {
  const o = {};
  for (const key of PROJECT_ONBOARDING_BASE_RESULT_KEYS) {
    o[key] = ({
      schema: "pipeline.project-onboarding.v4", status: "ready", root: realpathSync(root), runner: "claude", intent: "session",
      repository: {}, runtime: {}, continuity: {}, appServer: {},
      runnerPermissions: { target: ".claude/settings.local.json", status: "current", lanes: ["Bash", "PowerShell"], exactEntries: expectedPipelineScriptsRunnerAllowlistEntries() },
      nextAction, diagnostics: [],
    })[key];
  }
  for (const key of PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS) o[key] = key === "pushApprovalMode" ? "signature" : "present";
  return o;
}

function gate(root, nextAction, gateFn = requireProjectOnboardingReady) {
  return gateFn({ rootDir: root, intent: "session", runner: "claude", inspect: () => observation(root, nextAction) });
}

const SCENARIOS = [
  ["approved: materialization required", "approved", { ok: true, status: "materialization-required" }, true, "materialize-architecture"],
  ["approved: architecture evidence invalid", "approved", { ok: false, code: "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED" }, true, "reopen-design"],
  ["approved: stale approval (drifted)", "approved", { ok: true, status: "current" }, true, "reopen-design", { status: "drifted", nextAction: "reopen-design" }],
  ["approved: ready for set-phase", "approved", { ok: true, status: "current" }, true, "set-phase"],
  ["approved: verify command unconfigured", "approved", { ok: true, status: "current" }, false, "collect-input"],
  ["implementing: materialization required", "implementing", { ok: true, status: "materialization-required" }, true, "materialize-architecture"],
  ["implementing: architecture evidence invalid", "implementing", { ok: false, code: "X" }, true, "reopen-design"],
  ["implementing: nothing to do", "implementing", { ok: true, status: "current" }, true, null],
];

function produce([, lifecycleStatus, architecture, verifyOk, , authorityOverride]) {
  state.verifyOk = verifyOk;
  return producer("/unused", {
    authority: authorityOverride ?? { status: "observed", lifecycleStatus, planPath: "docs/prd.md" },
    inspectArchitectureDesign: () => architecture,
  });
}

test("P1 every nextAction the producer publishes in approved/implementing is admitted by the real ready-gate", () => {
  const root = scratchDir("alf-c-p19-02-p1-");
  for (const scenario of SCENARIOS) {
    const action = produce(scenario);
    const marker = scenario[4];
    assert.ok(marker === null ? action === null : JSON.stringify(action).includes(marker), `${scenario[0]}: producer shape ${JSON.stringify(action)?.slice(0, 80)}`);
    assert.deepEqual(gate(root, action), { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" }, scenario[0]);
  }
});

test("P1-RED a scratch mirror of the gate without the materialize/reopen-design exceptions refuses the same producer shapes", () => {
  const dir = scratchDir("alf-c-p19-02-red-");
  const base = (rel) => pathToFileURL(rel).href;
  let source = readFileSync(join(LIB, "project-onboarding-ready-gate.mjs"), "utf8")
    .replace(/from "\.\//gu, `from "${base(LIB)}`)
    .replace(/from "\.\.\/scripts\//gu, `from "${base(SCRIPTS)}`)
    .replace(/new URL\("\.\.\/scripts\/([^"]+)", import\.meta\.url\)/gu, (_m, f) => `new URL("${base(join(SCRIPTS, f))}")`);
  const before = source;
  source = source.replace("  if (validMaterializeArchitectureCommand(value)) return true;\n", "").replace("  if (validReopenDesignCollectAction(value)) return true;\n", "");
  assert.notEqual(source, before, "mirror mutation must change the source");
  const mirrorPath = join(dir, "gate-mirror.mjs");
  writeFileSync(mirrorPath, source);
  return import(pathToFileURL(mirrorPath).href).then((mirror) => {
    for (const scenario of SCENARIOS.filter((s) => ["materialize-architecture", "reopen-design"].includes(s[4]))) {
      assert.throws(() => gate(dir, produce(scenario), mirror.requireProjectOnboardingReady),
        (e) => e.code === "PORG-INVALID-OBSERVATION", `mirror must refuse ${scenario[0]}`);
      gate(dir, produce(scenario)); // the production gate admits it
    }
  });
});

// ---- P2 / P3: guard behaviour in every lifecycle state -------------------------------------------------------
const FEATURE = { id: "f", planPath: "docs/prd-bound.md", specPath: "specs/f/spec.md", designInputPath: "specs/f/design-input.md" };
const STATES = {
  draft: { schema: "pipeline.state.v0", activeFeature: { ...FEATURE, phase: "design" }, planApproved: false },
  "awaiting-approval": { schema: "pipeline.state.v0", activeFeature: { ...FEATURE, phase: "design" }, planApproved: false, planSubmitted: true },
  approved: { schema: "pipeline.state.v0", activeFeature: { ...FEATURE, phase: "design" }, planApproved: true },
  implementing: { schema: "pipeline.state.v0", activeFeature: { ...FEATURE, phase: "implementation" }, planApproved: true },
};
const MANIFEST = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n";

function guardRoot(stateObject) {
  const root = scratchDir("alf-c-p19-02-guard-");
  const init = spawnSync("git", ["init", "--quiet", "--template="], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, `git init failed: ${init.stderr || init.error}`);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(root, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  writeFileSync(join(root, ".claude", "pipeline.yaml"), MANIFEST);
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(stateObject));
  return root;
}

const invalidObservation = () => { throw new ProjectOnboardingReadyError("PORG-INVALID-OBSERVATION", "raw", { intent: "session" }); };
const run = (root, tool_name, tool_input, fn = invalidObservation) =>
  evaluateLifecycleReadyGuard({ tool_name, tool_input }, { projectDir: root, runner: "claude", requireProjectOnboardingReadyFn: fn });

test("P3 backlog/, docs/ and scratch/ writes are admitted in every lifecycle state (invalid-observation and ready)", () => {
  for (const [name, stateObject] of Object.entries(STATES)) {
    const root = guardRoot(stateObject);
    for (const [label, fn] of [["invalid-observation", invalidObservation], ["ready", () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" })]]) {
      for (const tool of ["Write", "Edit"]) {
        for (const target of ["backlog/items/alf-c-p19-02.md", "docs/alf-c-p19-02.md", "scratch/alf-c-p19-02.txt"]) {
          const r = run(root, tool, { file_path: target }, fn);
          assert.equal(r.exitCode, 0, `${name}/${label}/${tool}/${target}: ${r.stderr}`);
        }
      }
    }
    const control = run(root, "Write", { file_path: "src/app.js" });
    assert.equal(control.exitCode, 2, `${name}: implementation path must stay refused under an invalid observation`);
  }
});

test("P2 the recovery command named by the PORG-INVALID-OBSERVATION denial is admitted in every lifecycle state", () => {
  for (const [name, stateObject] of Object.entries(STATES)) {
    const root = guardRoot(stateObject);
    const denial = run(root, "Write", { file_path: "src/app.js" });
    assert.match(denial.stderr, /PORG-INVALID-OBSERVATION/u, name);
    assert.match(denial.stderr, /project-onboarding-v3 session inspection/u, name);
    const command = `node '${ONBOARDING_SCRIPT}' inspect --root '${root}' --intent session`;
    assert.equal(isSanctionedLifecycleCommand(command, root), true, `${name}: ${command}`);
    const r = run(root, "Bash", { command });
    assert.deepEqual(r, { exitCode: 0, stderr: "" }, `${name}: ${r.stderr}`);
  }
});

test("link-escape under docs/ stays refused (junction/symlink creation)", {
  skip: "host-limitation: directory symlinks/junctions unavailable on this native Windows host; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7); adjacent QW04-5 covers it where links exist",
}, () => {});
