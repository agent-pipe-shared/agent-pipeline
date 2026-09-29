#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { chmodSync, closeSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { loadProtectedTestPathRules, protectedTestPathRuleFor } from "../lib/protected-test-paths.mjs";
import { recordConsentGiven } from "../lib/onboarding-consent-marker.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { applyOnboardingIntakeConsent, classifyOnboardingContinuity } from "../lib/onboarding-continuity.mjs";
import { requireProjectOnboardingReady } from "../lib/project-onboarding-ready-gate.mjs";
import { applyProjectOnboardingKickoffV4, expectedPipelineScriptsRunnerAllowlistEntries, planProjectOnboardingKickoffV4 } from "../lib/project-onboarding-v3.mjs";

import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";
import { consumeRuntimeReadback, issueLaunchTicket, readRestartBarrier, sha256 } from "../lib/codex-onboarding-runtime.mjs";

const guard = join(dirname(fileURLToPath(import.meta.url)), "guard-apply-patch.mjs");
const hookDir = dirname(fileURLToPath(import.meta.url));
const codexPretoolGuard = join(hookDir, "codex-pretool-guard.mjs");
const onboardingScript = join(hookDir, "..", "scripts", "project-onboarding-v3.mjs");
let passed = 0;

// The production lifecycle resolves and binds the physical Codex executable
// from PATH. CI deliberately exposes only its five core tools, so this suite
// publishes the Node test process as an explicit, executable Codex fixture
// instead of weakening runtime discovery or depending on a developer install.
const testRuntimeBin = mkdtempSync(join(tmpdir(), "guard-apply-patch-runtime-"));
const testRuntimeExecutable = join(testRuntimeBin, process.platform === "win32" ? "codex.exe" : "codex");
const testRuntimeDaemon = {
  status: "running", backend: "fixture", managedCodexPath: testRuntimeExecutable, managedCodexVersion: "0.0.0-test",
  socketPath: join(testRuntimeBin, "app-server.sock"), cliVersion: "0.0.0-test", appServerVersion: "0.0.0-test",
};
writeFileSync(testRuntimeExecutable, `#!${process.execPath}\nconst a=process.argv.slice(2);if(a.length===1&&a[0]==="--version")console.log("codex-cli 0.0.0-test");else if(JSON.stringify(a)===JSON.stringify(["app-server","daemon","version"]))console.log(${JSON.stringify(JSON.stringify(testRuntimeDaemon))});else process.exitCode=2;\n`);
chmodSync(testRuntimeExecutable, 0o755);
process.env.PATH = `${testRuntimeBin}${delimiter}${process.env.PATH ?? ""}`;
process.once("exit", () => rmSync(testRuntimeBin, { recursive: true, force: true }));

function fixture(protectedPattern = null) {
  const root = mkdtempSync(join(tmpdir(), "guard-apply-patch-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  recordConsentGiven({ rootDir: root });
  assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true);
  if (protectedPattern) {
    writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({
      protectedTestPaths: [{ id: "PATCH-LOCK", pattern: protectedPattern, reason: "locked by test" }],
    }));
  }
  return root;
}

function run(command, { root = fixture(), raw = false } = {}) {
  const input = raw ? command : JSON.stringify({ tool_name: "apply_patch", tool_input: { command } });
  return spawnSync(process.execPath, [guard], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
    input,
  });
}

function runOnboarding(root, args) {
  const result = spawnSync(process.execPath, [onboardingScript, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

function followOnboardingAction(root, result, command) {
  const action = result.nextAction;
  assert.equal(action?.kind, "command", JSON.stringify(result));
  assert.equal(action.argv?.[1], command, JSON.stringify(action));
  return runOnboarding(root, action.argv.slice(1));
}

function applyCollectedOnboardingAction(root, result, replacements, material = null) {
  const action = result.nextAction;
  assert.equal(action?.kind, "collect-input", JSON.stringify(result));
  const argv = action.applyAction?.argv?.map((value) => replacements[value] ?? value);
  assert.equal(Array.isArray(argv), true, JSON.stringify(action));
  assert.equal(argv.some((value) => /^<PO_[A-Z_]+>$/u.test(value)), false, JSON.stringify(argv));
  const textFileIndex = argv.indexOf("--text-file");
  if (material !== null) {
    assert.notEqual(textFileIndex, -1, JSON.stringify(argv));
    const textPath = join(root, argv[textFileIndex + 1]);
    const scratchRelative = relative(join(root, "scratch"), textPath);
    assert.equal(
      scratchRelative !== "" && scratchRelative !== ".." && !scratchRelative.startsWith(`..${sep}`) && !isAbsolute(scratchRelative),
      true,
      textPath,
    );
    mkdirSync(dirname(textPath), { recursive: true });
    writeFileSync(textPath, material);
  }
  return runOnboarding(root, argv.slice(1));
}

function simulateHostRuntimeReadback(root) {
  // This is the existing runtime observation seam, not a checkpoint fixture:
  // the real CLI created the barrier and the real consume function verifies
  // its ticket/fingerprint/digests before it clears the barrier. A native
  // Codex app-server/provider call is intentionally not made in this test.
  const barrier = readRestartBarrier({ rootDir: root });
  assert.equal(barrier.status, "present", JSON.stringify(barrier));
  const issued = issueLaunchTicket({ rootDir: root, barrierSha256: barrier.rawSha256 });
  consumeRuntimeReadback({
    rootDir: root,
    ticketId: issued.ticketId,
    token: issued.token,
    receipt: {
      schema: "pipeline.codex-project-runtime-readback.v1",
      barrierSha256: barrier.rawSha256,
      repositoryFingerprint: barrier.barrier.repositoryFingerprint,
      sourceSha256: barrier.barrier.sourceSha256,
      runtimeTargetsSha256: barrier.barrier.runtimeTargetsSha256,
      readerGenerationSha256: sha256("greenfield-host-observation-v1"),
      effectiveConfigSha256: sha256("greenfield-effective-config"),
      validatedAgentsSha256: sha256("greenfield-validated-agents"),
      ticketId: issued.ticketId,
      observedAtEpochMs: Date.now(),
    },
  });
}

function runNativeCodexPatchGuard(root, command) {
  const inputPath = join(root, ".native-pretool-input.json");
  writeFileSync(inputPath, JSON.stringify({
    cwd: root,
    tool_name: "apply_patch",
    tool_input: { command },
  }));
  const inputFd = openSync(inputPath, "r");
  try {
    return spawnSync(process.execPath, [codexPretoolGuard], {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: "utf8",
      stdio: [inputFd, "pipe", "pipe"],
      timeout: 45_000,
    });
  } finally {
    closeSync(inputFd);
    unlinkSync(inputPath);
  }
}

function runLifecycleWithObservedCaller(root, command, originalInput) {
  const parsed = parseEofPatch(command);
  const job = parsed.jobs.find(job => job.path.endsWith("guard-lifecycle-ready.mjs"));
  assert.ok(job);
  const translated = JSON.parse(job.input);
  translated.session_id = JSON.parse(originalInput).session_id;
  job.input = JSON.stringify(translated);
  const source = readFileSync(guard, "utf8");
  const start = source.indexOf("function killGuardProcess(child)");
  const end = source.indexOf("\nasync function runGuardsInParallel", start);
  assert.ok(start >= 0 && end > start);
  const lifecycle = readFileSync(join(hookDir, "guard-lifecycle-ready.mjs"), "utf8");
  const runnerStart = lifecycle.indexOf("function runnerFromArgv(argv)");
  const runnerEnd = lifecycle.indexOf("\nfunction pathInside", runnerStart);
  assert.ok(runnerStart >= 0 && runnerEnd > runnerStart);
  const script = `const childProcess = require("node:child_process");
let observed = null;
const spawn = (executable, argv, options) => {
  observed = {executable, argv, ambientClaudeCode: options.env.CLAUDECODE};
  return childProcess.spawn(executable, argv, options);
};
const CHILD_TIMEOUT_MS = 4000;
${source.slice(start, end)}
${lifecycle.slice(runnerStart, runnerEnd)}
(async () => {
  const result = await runGuard(${JSON.stringify(job)});
  console.log(JSON.stringify({...result,observed,parsedRunner:runnerFromArgv(observed.argv.slice(1))}));
})().catch(error => {console.error(error.stack);process.exitCode = 1;});`;
  const result = spawnSync(process.execPath, ["--eval", script], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDECODE: "1" },
    encoding: "utf8", timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

let idleGuardFixtureRoot = null;
function readyIdleGuardFixture() {
  if (idleGuardFixtureRoot !== null) return idleGuardFixtureRoot;
  const root = mkdtempSync(join(tmpdir(), "guard-apply-patch-ready-idle-"));
  try {
    const portablePlan = runOnboarding(root, ["plan", "--root", root, "--runner", "codex"]);
    followOnboardingAction(root, portablePlan, "apply-portable-seed");
    // These are explicit synthetic fixture inputs, recorded through the
    // canonical intake owner before the first runtime restart.
    applyOnboardingIntakeConsent({
      rootDir: root, granted: true, gitAuthor: { name: "Idle Guard Fixture", email: "idle@example.invalid" },
      language: "en", profile: "mini", text: "Exercise native patch guards in an onboarded idle project.\n", activate: true,
    });
    const runtimePlan = runOnboarding(root, ["plan-runtime", "--root", root, "--runner", "codex"]);
    const runtime = followOnboardingAction(root, runtimePlan, "initialize-runtime");
    assert.equal(runtime.status, "restart-required", JSON.stringify(runtime));
    simulateHostRuntimeReadback(root);
    // Mirror the existing Source readiness fixture's ignored host artifact.
    // Values come from the producer; no admission or project authority is
    // manufactured, and the real inspection/gate below must accept them.
    writeFileSync(join(root, ".claude", "settings.local.json"), `${JSON.stringify({
      permissions: { allow: expectedPipelineScriptsRunnerAllowlistEntries() },
    }, null, 2)}\n`);
    // Synthetic preparation uses the public library seam already used by the
    // Source readiness fixtures; it does not claim an attended PO CLI action.
    const kickoffInput = { rootDir: root, goal: "Exercise native patch guards", language: "en", runner: "codex" };
    const kickoff = planProjectOnboardingKickoffV4(kickoffInput);
    const kicked = applyProjectOnboardingKickoffV4({ ...kickoffInput, planSha256: kickoff.planSha256, activate: true });
    assert.equal(kicked.status, "ready", JSON.stringify(kicked));
    const writer = join(hookDir, "..", "scripts", "pipeline-state.mjs");
    const discarded = spawnSync(process.execPath, [writer, "discard-feature", "--by", "Idle Guard Fixture", "--reason", "Fixture kickoff completed; test an idle onboarded project"], {
      cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8",
    });
    assert.equal(discarded.status, 0, discarded.stderr);
    const state = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
    assert.equal(state.activeFeature, undefined);
    assert.equal(state.discardedFeatures.length, 1);
    assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "valid");
    assert.equal(observeGovernanceScope({ rootDir: root }).state, "active");
    const inspected = runOnboarding(root, ["inspect", "--root", root, "--intent", "session", "--runner", "codex"]);
    assert.equal(inspected.status, "ready", JSON.stringify(inspected));
    assert.equal(requireProjectOnboardingReady({ rootDir: root, intent: "session", runner: "codex" }).status, "ready");
    idleGuardFixtureRoot = root;
    process.once("exit", () => rmSync(root, { recursive: true, force: true }));
    return root;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function freshGeneratedConsumerFixture() {
  // Fresh onboarding is intentionally stricter than a generic hook fixture:
  // even an empty `.claude/` directory is an unrelated entry, so it is not a
  // fresh root. The portable producer owns its first Git initialization.
  const root = mkdtempSync(join(tmpdir(), "greenfield-native-guard-"));
  try {
    const portablePlan = runOnboarding(root, ["plan", "--root", root, "--runner", "codex"]);
    const portable = followOnboardingAction(root, portablePlan, "apply-portable-seed");
    const originalMaterial = "Document the original fixture material only.\n";
    // The public route captures original material before its first restart;
    // follow the producer's returned action rather than assuming runtime first.
    const consented = applyCollectedOnboardingAction(root, portable, {
      "<PO_INTAKE_GIT_AUTHOR_NAME>": "Greenfield Fixture",
      "<PO_INTAKE_GIT_AUTHOR_EMAIL>": "greenfield@example.invalid",
      "<PO_INTAKE_LANGUAGE>": "en",
      "<PO_INTAKE_PROFILE>": "feature",
    }, originalMaterial);
    const runtimePlan = runOnboarding(root, ["plan-runtime", "--root", root, "--runner", "codex"]);
    const runtime = followOnboardingAction(root, runtimePlan, "initialize-runtime");
    assert.equal(runtime.status, "restart-required", JSON.stringify(runtime));
    simulateHostRuntimeReadback(root);
    const designState = runOnboarding(root, ["inspect", "--root", root, "--runner", "codex"]);
    const answered = applyCollectedOnboardingAction(root, designState, {
      "<PO_INTAKE_DESIGN_ANSWERS_JSON>": JSON.stringify([{ question: "Scope?", answer: "Guard fixture." }]),
    });
    const generateState = runOnboarding(root, ["inspect", "--root", root, "--runner", "codex"]);
    const generatedPlan = followOnboardingAction(root, generateState, "intake-generate-plan");
    const generated = runOnboarding(root, ["intake-generate-apply", "--root", root, "--plan-sha256", generatedPlan.planSha256, "--activate", "--runner", "codex"]);
    assert.equal(generated.checkpoint.transactionState, "generated");
    assert.equal(consented.checkpoint.transactionState, "design-questions-pending");
    assert.equal(consented.capture.evidence.sha256, sha256(originalMaterial));
    assert.equal(consented.checkpoint.materialInput[0].sha256, sha256(originalMaterial));
    assert.equal(answered.checkpoint.transactionState, "ready-to-generate");
    return { root, generatedPlan, originalMaterial };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function blocked(result, pattern) {
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, pattern);
}

check("valid Add/Update/Delete/Move paths are extracted and checked", () => {
  const patch = [
    "*** Begin Patch",
    "*** Add File: docs/new.md",
    "+new",
    "*** Update File: src/old.mjs",
    "*** Move to: src/new.mjs",
    "@@",
    "-old",
    "+new",
    "*** Delete File: docs/obsolete.md",
    "*** End Patch",
  ].join("\n");
  const result = run(patch, { root: readyIdleGuardFixture() });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

check("every extracted path is subjected to the configured write guard", () => {
  const root = fixture("locked\\.test\\.mjs$");
  const patch = "*** Begin Patch\n*** Update File: src/safe.mjs\n@@\n-a\n+b\n*** Update File: locked.test.mjs\n@@\n-a\n+b\n*** End Patch";
  blocked(run(patch, { root }), /PATCH-LOCK/);
});

check("multi-file patches use bounded parallel guard fan-out", () => {
  const source = readFileSync(guard, "utf8");
  assert.match(source, /const MAX_PARALLEL_GUARDS = 12/u);
  assert.match(source, /async function runGuardsInParallel\(jobs\)/u);
  assert.match(source, /Promise\.all\(Array\.from\(\{ length: Math\.min\(MAX_PARALLEL_GUARDS/u);
  // Parallel completion order is intentionally not input order.  HGO binds the
  // rendered denial bytes, so each worker must publish into its reserved input
  // index rather than append when its subprocess happens to finish.
  assert.match(source, /const results = new Array\(jobs\.length\);/u);
  assert.match(source, /const index = next\+\+;\s*const job = jobs\[index\];\s*results\[index\] = \{ job, result: await runGuard\(job\) \};/su);
  assert.match(source, /guard-lifecycle-ready\.mjs.*lane:\s*"repository-serial"/su);
  assert.match(source, /const indexedJobs = jobs\.map\(\(job, inputIndex\) => \(\{ \.\.\.job, inputIndex \}\)\)/u);
  assert.match(source, /results\[entry\.job\.inputIndex\] = entry/u);
  assert.match(source, /for \(const job of serialJobs\) results\[job\.inputIndex\] = \{ job, result: await runGuard\(job\) \}/u);
  assert.match(source, /const results = await runGuardJobs\(jobs\)/u);
  const patch = [
    "*** Begin Patch",
    ...Array.from({ length: 16 }, (_, index) => [
      `*** Update File: docs/parallel-${index}.md`,
      "@@",
      "-old",
      "+new",
    ]).flat(),
    "*** End Patch",
  ].join("\n");
  const result = run(patch, { root: readyIdleGuardFixture() });
  assert.equal(result.status, 0, result.stderr);
});

check("mixed parallel and repository-serial denials retain patch-input order", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({ protectedTestPaths: [
    { id: "PATCH-FIRST", pattern: "first\\.test\\.mjs$", reason: "first path" },
    { id: "PATCH-SECOND", pattern: "second\\.test\\.mjs$", reason: "second path" },
  ] }));
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const patch = "*** Begin Patch\n*** Update File: first.test.mjs\n@@\n-a\n+b\n*** Update File: second.test.mjs\n@@\n-a\n+b\n*** End Patch";
  const result = run(patch, { root });
  assert.equal(result.status, 2, result.stderr);
  const first = result.stderr.indexOf("PATCH-FIRST");
  const second = result.stderr.indexOf("PATCH-SECOND");
  const lifecycle = result.stderr.indexOf("BLOCKED (guard-lifecycle-ready");
  assert.ok(first >= 0 && second >= 0 && lifecycle >= 0, result.stderr);
  assert.ok(first < lifecycle && lifecycle < second, result.stderr);
});

check("every governed patch target requires dispatch-ready lifecycle without path exemptions", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  for (const path of [
    "src/implementation.mjs",
    "docs/state.md",
    "DOCS/state.md",
    "specs/feature/spec.md",
    "Specs/feature/spec.md",
    ".claude/pipeline.json",
    ".CLAUDE/pipeline.json",
    "backlog/item.md",
    "BackLog/item.md",
    join(tmpdir(), "outside-lifecycle-guard.txt"),
  ]) {
    const patch = `*** Begin Patch\n*** Update File: ${path}\n@@\n-a\n+b\n*** End Patch`;
    blocked(run(patch, { root }), /guard-lifecycle-ready/);
  }
});

check("invalid JSON, missing command and ambiguous envelopes block", () => {
  blocked(run("not-json", { raw: true }), /not valid JSON/);
  const missing = spawnSync(process.execPath, [guard], { encoding: "utf8", input: JSON.stringify({ tool_name: "apply_patch", tool_input: {} }) });
  blocked(missing, /missing or malformed/);
  for (const patch of [
    "*** Update File: src/a.mjs\n*** End Patch",
    "*** Begin Patch\n*** Update File: src/a.mjs",
    "*** Begin Patch\n*** End Patch",
    "*** Begin Patch\n*** Begin Patch\n*** Update File: src/a.mjs\n*** End Patch",
  ]) blocked(run(patch), /envelope|Begin Patch|no unambiguous file paths/);
});

check("content before the first operation and unknown patch headers block", () => {
  blocked(run("*** Begin Patch\nstray content\n*** Update File: src/a.mjs\n*** End Patch"), /before the first file operation/);
  blocked(run("*** Begin Patch\n*** Rename File: src/a.mjs\n*** End Patch"), /unknown or ambiguous patch header/);
});

check("empty, traversal, doubled-separator and whitespace paths block", () => {
  for (const path of ["", "../outside", "src/../outside", "src//a.mjs", "src/a.mjs ", "src/"]) {
    const patch = `*** Begin Patch\n*** Update File: ${path}\n*** End Patch`;
    blocked(run(patch), /ambiguous Update File path|empty, traversal, or ambiguous Update File path/);
  }
});

check("Move to is accepted only after Update File", () => {
  blocked(run("*** Begin Patch\n*** Move to: src/new.mjs\n*** End Patch"), /without a preceding Update File/);
  blocked(run("*** Begin Patch\n*** Add File: src/a.mjs\n*** Move to: src/b.mjs\n*** End Patch"), /without a preceding Update File/);
  blocked(run("*** Begin Patch\n*** Update File: src/a.mjs\n*** Move to: src/b.mjs\n*** Move to: src/c.mjs\n*** End Patch"), /without a preceding Update File/);
});

check("only guard-lifecycle-ready.mjs receives an explicit --runner codex argument; guard-testpath.mjs and guard-devplan.mjs keep their bare argv", () => {
  const source = readFileSync(guard, "utf8");
  const guardsBlock = source.slice(source.indexOf("const GUARDS ="), source.indexOf("function block("));
  assert.match(guardsBlock, /guard-testpath\.mjs.*args:\s*\[\]/su);
  assert.match(guardsBlock, /guard-devplan\.mjs.*args:\s*\[\]/su);
  assert.match(guardsBlock, /guard-lifecycle-ready\.mjs.*args:\s*\["--runner",\s*"codex"\]/su);
});

check("the lifecycle guard is invoked per patched path with an explicit codex runner even when CLAUDECODE=1 is present in its environment (regression pin for ready-gate-env-var-runner-authority, second production caller)", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const patch = "*** Begin Patch\n*** Update File: src/a.mjs\n*** End Patch";
  const input = JSON.stringify({ tool_name: "apply_patch", session_id: "apply-patch-session", tool_input: { command: patch } });
  const observed = runLifecycleWithObservedCaller(root, patch, input);
  const result = { status: observed.status, stderr: observed.stderr };
  // Identity is observed at the actual Source spawn boundary. Generic denial
  // wording also describes a valid runner inspecting a non-ready fixture.
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /guard-lifecycle-ready/);
  assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
  assert.equal(observed.observed.executable, process.execPath);
  assert.deepEqual(observed.observed.argv, [join(hookDir, "guard-lifecycle-ready.mjs"), "--runner", "codex"]);
  assert.equal(observed.observed.ambientClaudeCode, "1");
  assert.equal(observed.parsedRunner, "codex");
});

check("architectural invariant: evaluateLifecycleReadyGuard's own outer tool-name gate still does not recognize apply_patch -- a raw, untranslated call reaching it directly is admitted unconditionally even against a governed path that the identical path in translated Edit shape blocks (regression pin for backlog: raw-apply_patch-is-unconditionally-admitted-by-the-outer-lifecycle-gate; if this ever stops holding, guard-apply-patch.mjs's translate-first comment needs re-reading before anyone relies on the outer gate alone)", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const filePath = "src/governed.mjs";
  const patch = `*** Begin Patch\n*** Update File: ${filePath}\n@@\n-a\n+b\n*** End Patch`;
  const raw = evaluateLifecycleReadyGuard(
    { tool_name: "apply_patch", tool_input: { command: patch } },
    { runner: "codex", projectDir: root },
  );
  assert.equal(raw.exitCode, 0, `expected the raw, untranslated apply_patch call to be silently admitted by the outer gate; got ${JSON.stringify(raw)}`);
  const translated = evaluateLifecycleReadyGuard(
    { tool_name: "Edit", tool_input: { file_path: filePath } },
    { runner: "codex", projectDir: root },
  );
  assert.notEqual(translated.exitCode, 0, "the translated Edit shape for the identical governed path is expected to be gated -- if this also returns 0, the contrast this test relies on to prove translation matters is gone.");
});

check("architectural invariant: guard-apply-patch.mjs's spawn loop synthesizes a bare Edit shape for guard-lifecycle-ready.mjs, never the original apply_patch tool_name or command envelope (regression pin: this is the only translation boundary before evaluateLifecycleReadyGuard, which does not itself recognize apply_patch)", () => {
  const source = readFileSync(guard, "utf8");
  const loopStart = source.indexOf("const jobs = paths.flatMap");
  assert.ok(loopStart >= 0, "expected to find the per-path translation jobs in guard-apply-patch.mjs");
  const loopBlock = source.slice(loopStart);
  assert.match(loopBlock, /tool_name:\s*"Edit"/u);
  assert.match(loopBlock, /session_id:\s*input\.session_id\s*\?\?\s*input\.sessionId/u);
  assert.match(loopBlock, /tool_input:\s*\{\s*file_path:\s*filePath,\s*patchContainsAcknowledgementMarker\s*\}/u);
  assert.doesNotMatch(loopBlock, /tool_name:\s*toolName/u);
  assert.doesNotMatch(loopBlock, /tool_name:\s*"apply_patch"/u);
  assert.match(loopBlock, /session_id:\s*input\.session_id\s*\?\?\s*input\.sessionId/u);
});

check("a genuinely empty V3 onboarding root reaches the native Codex apply-patch chain and admits generated staging authoring before plan approval", () => {
  let created;
  try {
    created = freshGeneratedConsumerFixture();
    const prd = created.generatedPlan.targets.prd.path;
    const spec = created.generatedPlan.targets.spec.path;
    const patch = [
      "*** Begin Patch",
      `*** Update File: ${join(created.root, prd)}`,
      "@@",
      "+Reviewed fixture wording.",
      `*** Update File: ${spec}`,
      "@@",
      "+Reviewed fixture specification.",
      "*** Add File: scratch/nested/greenfield-boundary.md",
      "+bounded scratch evidence",
      "*** End Patch",
    ].join("\n");
    const result = runNativeCodexPatchGuard(created.root, patch);
    assert.equal(result.status, 0, result.stderr);
    // Native Codex PreToolUse emits a JSON payload only for a denial. An empty
    // successful response is the adapter's actual allow contract.
    assert.equal(result.stdout, "", result.stdout);
    // The native pre-tool guard intentionally observes a proposed patch; the
    // harness therefore persists the exact admitted fixture bytes separately.
    // This demonstrates the sanctioned staging-authoring window reaches the
    // real generated checkpoint, without manufacturing a PO acknowledgement.
    const prdPath = join(created.root, prd);
    const specPath = join(created.root, spec);
    const scratchPath = join(created.root, "scratch", "nested", "greenfield-boundary.md");
    const prdBytes = `${readFileSync(prdPath, "utf8")}\nReviewed fixture wording.\n`;
    const specBytes = `${readFileSync(specPath, "utf8")}\nReviewed fixture specification.\n`;
    const scratchBytes = "bounded scratch evidence\n";
    writeFileSync(prdPath, prdBytes, "utf8");
    writeFileSync(specPath, specBytes, "utf8");
    mkdirSync(dirname(scratchPath), { recursive: true });
    writeFileSync(scratchPath, scratchBytes, "utf8");
    assert.equal(readFileSync(prdPath, "utf8"), prdBytes);
    assert.equal(readFileSync(specPath, "utf8"), specBytes);
    assert.equal(readFileSync(scratchPath, "utf8"), scratchBytes);
    const markerPending = runOnboarding(created.root, ["inspect", "--root", created.root, "--runner", "codex"]);
    assert.equal(markerPending.status, "bootstrap-binding-required", JSON.stringify(markerPending));
    assert.equal(markerPending.nextAction?.kind, "command", JSON.stringify(markerPending));
    assert.equal(markerPending.nextAction.argv[1], "intake-spec-marker-apply", JSON.stringify(markerPending));
    assert.equal(markerPending.nextAction.requiresConfirmation, false);
    const markerDigestIndex = markerPending.nextAction.argv.indexOf("--plan-sha256");
    assert.notEqual(markerDigestIndex, -1);
    assert.match(markerPending.nextAction.argv[markerDigestIndex + 1], /^[a-f0-9]{64}$/u);
    const markerRepaired = followOnboardingAction(created.root, markerPending, "intake-spec-marker-apply");
    assert.equal(markerRepaired.schema, "pipeline.onboarding-intake-spec-marker-apply.v1");
    assert.equal(markerRepaired.status, "applied", JSON.stringify(markerRepaired));
    const postAuthoring = runOnboarding(created.root, ["inspect", "--root", created.root, "--runner", "codex"]);
    assert.equal(postAuthoring.status, "bootstrap-binding-required", JSON.stringify(postAuthoring));
    assert.equal(postAuthoring.nextAction?.kind, "architecture-design-required", JSON.stringify(postAuthoring));
    assert.equal(postAuthoring.nextAction.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED", JSON.stringify(postAuthoring));
    assert.equal(postAuthoring.nextAction.prdPath, prd, JSON.stringify(postAuthoring));
    assert.equal(postAuthoring.nextAction.specPath, spec, JSON.stringify(postAuthoring));
    // Staging authoring is deliberately earlier than architecture design,
    // acknowledgement, binding and plan approval. This native path must keep
    // admitting the bounded draft writes while returning the current explicit
    // design stop; it never fabricates a design package or PO acknowledgement.
    assert.notEqual(postAuthoring.status, "ready");
    const markerDenial = nativeDenial(
      runNativeCodexPatchGuard(
        created.root,
        [
          "*** Begin Patch",
          `*** Update File: ${join(created.root, prd)}`,
          "@@",
          "+<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->",
          "*** End Patch",
        ].join("\n"),
      ),
      "generated checkpoint acknowledgement-marker patch",
      "GUARD-BOOTSTRAP-ACKNOWLEDGEMENT-WRITER-ONLY",
    );
    assert.doesNotMatch(
      markerDenial.hookSpecificOutput?.permissionDecisionReason ?? "",
      /Human override available/u,
      JSON.stringify(markerDenial),
    );
    nativeDenial(
      runNativeCodexPatchGuard(
        created.root,
        "*** Begin Patch\n*** Add File: src/not-yet-authorized.mjs\n+export default \\\"product authoring\\\";\n*** End Patch",
      ),
      "generated checkpoint product authoring",
      "GUARD-LIFECYCLE-NOT-READY",
    );
  } finally {
    if (created) rmSync(created.root, { recursive: true, force: true });
  }
});

function nativeDenial(result, label, expectedCode) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
  assert.notEqual(result.stdout, "", `${label}: native adapter unexpectedly allowed the patch`);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.hookSpecificOutput?.permissionDecision, "deny", `${label}: ${result.stdout}`);
  assert.match(decision.hookSpecificOutput?.permissionDecisionReason ?? "", new RegExp(expectedCode, "u"), `${label}: ${result.stdout}`);
  return decision;
}

check("a generated checkpoint native patch cannot use a scratch alias to author product code before plan approval", () => {
  let created;
  try {
    created = freshGeneratedConsumerFixture();
    mkdirSync(join(created.root, "src"));
    symlinkSync(join(created.root, "src"), join(created.root, "scratch", "to-product"), "dir");
    symlinkSync(join(created.root, "src", "not-yet-created.mjs"), join(created.root, "scratch", "dangling-product.mjs"), "file");
    nativeDenial(
      runNativeCodexPatchGuard(
        created.root,
        `*** Begin Patch\n*** Add File: ${join(created.root, "scratch", "to-product", "escaped.mjs")}\n+export default "escaped";\n*** End Patch`,
      ),
      "scratch alias to product",
      "GUARD-LIFECYCLE-NOT-READY",
    );
    nativeDenial(
      runNativeCodexPatchGuard(
        created.root,
        "*** Begin Patch\n*** Add File: scratch/dangling-product.mjs\n+export default \"escaped\";\n*** End Patch",
      ),
      "dangling scratch leaf alias to product",
      "GUARD-LIFECYCLE-NOT-READY",
    );
  } finally {
    if (created) rmSync(created.root, { recursive: true, force: true });
  }
});

check("a generated checkpoint native patch cannot use a scratch alias to mutate authority before plan approval", () => {
  let created;
  try {
    created = freshGeneratedConsumerFixture();
    symlinkSync(join(created.root, ".claude"), join(created.root, "scratch", "to-authority"), "dir");
    nativeDenial(
      runNativeCodexPatchGuard(
        created.root,
        "*** Begin Patch\n*** Add File: scratch/to-authority/escaped.json\n+{}\n*** End Patch",
      ),
      "scratch alias to authority",
      "GUARD-LIFECYCLE-NOT-READY",
    );
  } finally {
    if (created) rmSync(created.root, { recursive: true, force: true });
  }
});

check("a generated checkpoint native patch rejects both symlinked scratch root and external scratch aliases", () => {
  let created;
  let external;
  try {
    created = freshGeneratedConsumerFixture();
    mkdirSync(join(created.root, "src"));
    rmSync(join(created.root, "scratch"), { recursive: true, force: true });
    symlinkSync(join(created.root, "src"), join(created.root, "scratch"), "dir");
    nativeDenial(
      runNativeCodexPatchGuard(created.root, "*** Begin Patch\n*** Add File: scratch/root-escape.mjs\n+export {};\n*** End Patch"),
      "symlinked scratch root",
      "GUARD-LIFECYCLE-NOT-READY",
    );
    rmSync(join(created.root, "scratch"));
    mkdirSync(join(created.root, "scratch"));
    external = mkdtempSync(join(tmpdir(), "greenfield-scratch-external-"));
    symlinkSync(external, join(created.root, "scratch", "to-external"), "dir");
    nativeDenial(
      runNativeCodexPatchGuard(created.root, "*** Begin Patch\n*** Add File: scratch/to-external/escape.md\n+outside\n*** End Patch"),
      "scratch alias to external sibling root",
      "GUARD-CROSS-REPO-MUTATION",
    );
  } finally {
    if (created) rmSync(created.root, { recursive: true, force: true });
    if (external) rmSync(external, { recursive: true, force: true });
  }
});

// Exercise the canonical parser/translation without an inactive-governance exit.
function parseEofPatch(command) {
  const source = readFileSync(guard, "utf8");
  const start = source.indexOf("const lines = command.replace");
  const end = source.indexOf("let exitCode = 0;", start);
  const guardsStart = source.indexOf("const GUARDS =");
  const guardsEnd = source.indexOf("const MAX_PARALLEL_GUARDS", guardsStart);
  assert.ok(start >= 0 && end > start && guardsStart >= 0 && guardsEnd > guardsStart);
  const guards = source.slice(guardsStart, guardsEnd).replaceAll("import.meta.url", JSON.stringify(new URL("./guard-apply-patch.mjs", import.meta.url).href));
  return vm.runInNewContext(`${guards}\n${source.slice(start, end)}\n({ paths, jobs })`, {
    command, input: { session_id: "eof-parser-fixture" }, URL, fileURLToPath,
    block(reason) { throw new Error(reason); },
  });
}

check("EOF01 canonical Update and renamed Update terminate at exact End of File", () => {
  for (const move of [[], ["*** Move to: src/new.mjs"]]) {
    const parsed = parseEofPatch(["*** Begin Patch", "*** Update File: src/old.mjs", ...move, "@@", "-old", "+new", "*** End of File", "*** End Patch"].join("\n"));
    assert.deepEqual(Array.from(parsed.paths, p => p.filePath), move.length ? ["src/old.mjs", "src/new.mjs"] : ["src/old.mjs"]);
    assert.equal(parsed.jobs.length, parsed.paths.length * 4);
  }
});

check("EOF02 orphan Add Delete and empty Update EOF markers fail closed", () => {
  for (const operation of [[], ["*** Add File: src/a.mjs", "+new"], ["*** Delete File: src/a.mjs"], ["*** Update File: src/a.mjs"], ["*** Update File: src/a.mjs", "@@"], ["*** Update File: src/a.mjs", "+new"]]) {
    assert.throws(() => parseEofPatch(["*** Begin Patch", ...operation, "*** End of File", "*** End Patch"].join("\n")), /orphan, misplaced, or duplicate End of File/);
  }
});

check("EOF03 duplicate and nonterminal EOF markers fail closed", () => {
  const prefix = ["*** Begin Patch", "*** Update File: src/a.mjs", "@@", "-old", "+new", "*** End of File"];
  for (const tail of [["*** End of File"], ["+later"], ["@@", "+later"], ["*** Move to: src/new.mjs"], [""], ["stray"]]) {
    assert.throws(() => parseEofPatch([...prefix, ...tail, "*** End Patch"].join("\n")), /duplicate End of File|nonterminal End of File/);
  }
});

check("EOF04 unknown headers and all original path checks remain closed", () => {
  for (const marker of ["*** End of File extra", "*** End of File:", "***  End of File", "*** Rename File: src/b.mjs"]) {
    assert.throws(() => parseEofPatch(["*** Begin Patch", "*** Update File: src/a.mjs", "@@", "+new", marker, "*** End Patch"].join("\n")), /unknown or ambiguous patch header/);
  }
  for (const path of ["../outside", "src/../outside", "src//a.mjs", "src/a.mjs ", "src/"]) {
    assert.throws(() => parseEofPatch(["*** Begin Patch", `*** Update File: ${path}`, "@@", "+new", "*** End of File", "*** End Patch"].join("\n")), /traversal, or ambiguous Update File path/);
  }
});

check("EOF05 terminal marker resets only at a new file operation", () => {
  const parsed = parseEofPatch(["*** Begin Patch", "*** Update File: src/a.mjs", "@@ first", "+first", "*** End of File", "*** Update File: src/b.mjs", "@@", "+second", "*** End of File", "*** Add File: docs/new.md", "+new", "*** End Patch"].join("\n"));
  assert.deepEqual(Array.from(parsed.paths, p => p.filePath), ["src/a.mjs", "src/b.mjs", "docs/new.md"]);
  assert.equal(parsed.jobs.length, 12);
  assert.throws(() => parseEofPatch("*** Begin Patch\n*** Update File: src/a.mjs\n@@\n+first\n@@\n*** End of File\n*** End Patch"), /misplaced/);
});

check("EOF06 terminal EOF preserves plain Update acknowledgement facts and protected rename destinations", () => {
  const root = fixture("locked\\.test\\.mjs$");
  try {
    const literal = readFileSync(guard, "utf8").match(/line\.includes\(("[^\n]+?")\)/u)?.[1];
    assert.equal(typeof literal, "string");
    const marker = JSON.parse(literal);
    const parsed = parseEofPatch(["*** Begin Patch", "*** Update File: docs/staging.md", "@@", `+${marker}`, "*** End of File", "*** Update File: src/old.mjs", "*** Move to: locked.test.mjs", "@@", "+new", "*** End of File", "*** End Patch"].join("\n"));
    const { rules } = loadProtectedTestPathRules({ rootDir: root });
    assert.equal(protectedTestPathRuleFor(rules, parsed.paths[2].filePath, { rootDir: root })?.id, "PATCH-LOCK");
    assert.equal(parsed.paths[0].patchContainsAcknowledgementMarker, true);
    for (const path of parsed.paths) {
      const jobs = parsed.jobs.filter(job => job.filePath === path.filePath);
      assert.equal(jobs.length, 4);
      for (const job of jobs) {
        const input = JSON.parse(job.input);
        assert.equal(input.tool_name, "Edit");
        assert.equal(input.session_id, "eof-parser-fixture");
        assert.equal(input.tool_input.file_path, path.filePath);
        assert.equal(input.tool_input.patchContainsAcknowledgementMarker, path.patchContainsAcknowledgementMarker);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("EOF07 inactive governance remains an unconditional hook no-op", () => {
  const root = mkdtempSync(join(tmpdir(), "guard-apply-patch-inactive-"));
  try {
    const observation = observeGovernanceScope({ rootDir: root });
    assert.equal(observation.state, "inactive");
    assert.equal(observation.requiresEnforcement, false);
    const result = run("*** Begin Patch\n*** End of File\n*** End Patch", { root });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("RCM01 renamed acknowledgement content reaches the writer-only denial with and without EOF", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
    const marker = JSON.parse(readFileSync(guard, "utf8").match(/line\.includes\(("[^\n]+?")\)/u)[1]);
    for (const eof of [false, true]) {
      const parsed = parseEofPatch(["*** Begin Patch", "*** Update File: specs/plan.md", "*** Move to: specs/renamed-plan.md", "@@", `+${marker}`, ...(eof ? ["*** End of File"] : []), "*** End Patch"].join("\n"));
      assert.deepEqual(Array.from(parsed.paths, path => path.filePath), ["specs/plan.md", "specs/renamed-plan.md"]);
      assert.equal(parsed.paths.every(path => path.patchContainsAcknowledgementMarker === true), true);
      const jobs = parsed.jobs.filter(job => job.path.endsWith("guard-lifecycle-ready.mjs"));
      assert.equal(jobs.length, 2);
      for (const job of jobs) {
        const input = JSON.parse(job.input);
        assert.equal(input.tool_input.patchContainsAcknowledgementMarker, true);
        const result = evaluateLifecycleReadyGuard(input, { projectDir: root, runner: "codex" });
        assert.equal(result.exitCode, 2, JSON.stringify(result));
        assert.match(result.stderr, /GUARD-BOOTSTRAP-ACKNOWLEDGEMENT-WRITER-ONLY/u);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("RCM02 innocuous renamed content never claims an acknowledgement fact", () => {
  for (const eof of [false, true]) {
    const parsed = parseEofPatch(["*** Begin Patch", "*** Update File: specs/plan.md", "*** Move to: specs/renamed-plan.md", "@@", "+ordinary staging prose", ...(eof ? ["*** End of File"] : []), "*** End Patch"].join("\n"));
    assert.equal(parsed.paths.every(path => path.patchContainsAcknowledgementMarker === false), true);
    assert.equal(parsed.jobs.every(job => JSON.parse(job.input).tool_input.patchContainsAcknowledgementMarker === false), true);
  }
});

check("RCM03 a fact observed before Move to also protects its destination", () => {
  const marker = JSON.parse(readFileSync(guard, "utf8").match(/line\.includes\(("[^\n]+?")\)/u)[1]);
  const parsed = parseEofPatch(["*** Begin Patch", "*** Update File: specs/plan.md", "@@", `+${marker}`, "*** Move to: specs/renamed-plan.md", "*** End Patch"].join("\n"));
  assert.equal(parsed.paths.every(path => path.patchContainsAcknowledgementMarker === true), true);
});

check("RCM04 rename facts stay within their own file operation", () => {
  const marker = JSON.parse(readFileSync(guard, "utf8").match(/line\.includes\(("[^\n]+?")\)/u)[1]);
  const parsed = parseEofPatch(["*** Begin Patch", "*** Update File: specs/plan.md", "*** Move to: specs/renamed-plan.md", "@@", `+${marker}`, "*** End of File", "*** Update File: docs/ordinary.md", "*** Move to: docs/renamed.md", "@@", "+ordinary", "*** End of File", "*** End Patch"].join("\n"));
  assert.deepEqual(Array.from(parsed.paths, path => path.patchContainsAcknowledgementMarker), [true, true, false, false]);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`1..${passed}\n`);
