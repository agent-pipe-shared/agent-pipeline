// SPDX-License-Identifier: SUL-1.0
// Greenfield-walk RED pins F3 (argv half only) and F4 (E2E-ONB-B, 24a27a1c9; ONB-T3-20261009, Ruling 163).
// New file by ruling: the neighbouring first-restart intake file carries a case-count guard that this slice must not bump.
// Fixtures are IMPORTED from ./project-onboarding-v3.test.mjs exactly like onboarding-first-restart-intake.test.mjs
// does (that module exports root, dispose, fakeDeps, fakeGit, clearRuntimeBarrier and registers zero cases on import).
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { devNull } from "node:os";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "GFW" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from "node:assert/strict";
import { root, dispose, fakeDeps, fakeGit, clearRuntimeBarrier } from "./project-onboarding-v3.test.mjs";
import {
  inspectProjectOnboardingV3, planProjectOnboardingV3, applyProjectOnboardingV3,
  planProjectOnboardingLifecycleV4, applyProjectOnboardingLifecycleV4,
} from "./project-onboarding-v3.mjs";
import { readRestartBarrier } from "./codex-onboarding-runtime.mjs";
import { planOnboardingIntakeGenerate } from "./onboarding-continuity.mjs";
import { main as onboardingCli } from "../scripts/project-onboarding-v3.mjs";

// F3 (argv half ONLY; the language half is ruled out). Owner: intakeConsentAction in
// plugins/pipeline-core/lib/project-onboarding-v3.mjs: `argv.indexOf("--text-file")` is -1 for runner claude (--text-file is
// only pushed for non-claude runners), so `argv.slice(0, -1)` drops the RUNNER VALUE and the tail appends a second
// `--activate --runner claude`. Ruling (Elephant, ONB-T3): for claude the action carries no --text-file and no
// --text-file-sha256, exactly one --runner followed by `claude`, exactly one --activate.
// Expected RED today: "--runner" count 2 (and its first occurrence is followed by another flag), "--activate" count 2.
test("greenfield walk F3: the claude consent existingFileApplyAction has one --runner with its value, one --activate and no --text-file", () => {
  const path = root();
  try {
    const portable = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "claude" });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", runner: "claude" });
    const runtimeSha = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", runner: "claude", planSha256: runtimeSha, activate: true }).status, "intake-required");
    const observed = inspectProjectOnboardingV3({ rootDir: path, runner: "claude", deps: fakeDeps });
    assert.equal(observed.status, "intake-required");
    const argv = observed.nextAction.existingFileApplyAction.argv;
    const count = (flag) => argv.filter((value) => value === flag).length;
    const shown = JSON.stringify(argv);
    assert.equal(argv[1], "intake-consent-apply", shown);
    assert.equal(count("--runner"), 1, `doubled --runner: ${shown}`);
    assert.equal(argv[argv.indexOf("--runner") + 1], "claude", `--runner lost its value: ${shown}`);
    assert.equal(count("--activate"), 1, `doubled --activate: ${shown}`);
    assert.equal(count("--text-file"), 0, `claude must not carry --text-file: ${shown}`);
    assert.equal(count("--text-file-sha256"), 0, `claude must not carry --text-file-sha256: ${shown}`);
    assert.equal(argv.includes("--text"), false, shown);
  } finally { dispose(path); }
});

// F4. Owners: the CLI result assembly in plugins/pipeline-core/scripts/project-onboarding-v3.mjs (the intake-consent-apply,
// intake-capture-apply, intake-design-questions-apply and intake-generate-apply branches): none attaches `nextAction`.
// The `inspect` nextAction is the value each apply must return. Plus: the nextAction of the intake-generate-plan summary
// (planOnboardingIntakeGenerate in lib/onboarding-continuity.mjs) must carry `--runner <runner>` like its neighbours.
// Expected RED today: `mismatches` lists the applies that return no (or a different) nextAction; the generate-plan
// nextAction lacks --runner. Ruling (Elephant, ONB-T3): the --runner assertions sit BELOW the final deepEqual on
// `mismatches`; so that a single run still reports both reds, the runner finding is collected first (no assertion) and
// quoted in the deepEqual message.
test("greenfield walk F4: every intake apply returns the nextAction a following inspect returns, and generate-plan carries --runner", () => {
  const path = root();
  const deps = { ...fakeDeps, spawn: fakeGit, prepareBoundDesignLineEndings: () => ({ ok: true, code: "FIXTURE-LINE-ENDINGS-READY" }) };
  const invoke = (args) => {
    let out = ""; let err = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { out += chunk; }, writeError: (chunk) => { err += chunk; } });
    assert.equal(code, 0, err);
    return JSON.parse(out);
  };
  const inspect = () => inspectProjectOnboardingV3({ rootDir: path, runner: "codex", deps: fakeDeps });
  const mismatches = [];
  const compare = (step, applied) => {
    const returned = JSON.stringify(applied.nextAction ?? null);
    const following = JSON.stringify(inspect().nextAction ?? null);
    if (returned !== following) mismatches.push(step);
  };
  try {
    const portable = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "codex" });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    compare("intake-consent-apply", invoke(["intake-consent-apply", "--root", path, "--granted", "--language", "en", "--profile", "feature", "--activate", "--runner", "codex"]));
    compare("intake-capture-apply", invoke(["intake-capture-apply", "--root", path, "--text", "Ship a safe project.", "--activate", "--runner", "codex"]));
    // Same runtime barrier crossing as the v3 test that walks codex to the design questions.
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", runner: "codex" });
    const runtimeSha = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", runner: "codex", planSha256: runtimeSha, activate: true }).status, "restart-required");
    clearRuntimeBarrier(path, readRestartBarrier({ rootDir: path, spawn: fakeGit }));
    const answers = JSON.stringify([{ question: "What is the primary goal?", answer: "Ship safely." }]);
    compare("intake-design-questions-apply", invoke(["intake-design-questions-apply", "--root", path, "--answers-json", answers, "--activate", "--runner", "codex"]));
    const generatePlan = invoke(["intake-generate-plan", "--root", path, "--summary", "--runner", "codex"]);
    const planArgv = generatePlan.nextAction.argv;
    const runnerIndex = planArgv.indexOf("--runner");
    const runnerFinding = runnerIndex === -1 || planArgv[runnerIndex + 1] !== "codex"
      ? `; ALSO RED: the intake-generate-plan nextAction does not carry --runner codex: ${JSON.stringify(planArgv)}`
      : "";
    const fullPlan = planOnboardingIntakeGenerate({ rootDir: path, repositoryCapability: "local", spawn: fakeGit });
    compare("intake-generate-apply", invoke(["intake-generate-apply", "--root", path, "--plan-sha256", fullPlan.planSha256, "--activate", "--runner", "codex"]));
    assert.deepEqual(mismatches, [], `these applies return a nextAction that differs from the following inspect${runnerFinding}`);
    assert.notEqual(runnerIndex, -1, `intake-generate-plan nextAction has no --runner: ${JSON.stringify(planArgv)}`);
    assert.equal(planArgv[runnerIndex + 1], "codex", `intake-generate-plan nextAction --runner lost its value: ${JSON.stringify(planArgv)}`);
  } finally { dispose(path); }
});

if (completionCases.length !== 2) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
