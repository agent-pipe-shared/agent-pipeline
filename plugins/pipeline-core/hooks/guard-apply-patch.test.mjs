#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { closeSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";
import { consumeRuntimeReadback, issueLaunchTicket, readRestartBarrier, sha256 } from "../lib/codex-onboarding-runtime.mjs";

const guard = join(dirname(fileURLToPath(import.meta.url)), "guard-apply-patch.mjs");
const hookDir = dirname(fileURLToPath(import.meta.url));
const codexPretoolGuard = join(hookDir, "codex-pretool-guard.mjs");
const onboardingScript = join(hookDir, "..", "scripts", "project-onboarding-v3.mjs");
let passed = 0;

function fixture(protectedPattern = null) {
  const root = mkdtempSync(join(tmpdir(), "guard-apply-patch-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
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

function freshGeneratedConsumerFixture() {
  // Fresh onboarding is intentionally stricter than a generic hook fixture:
  // even an empty `.claude/` directory is an unrelated entry, so it is not a
  // fresh root. The portable producer owns its first Git initialization.
  const root = mkdtempSync(join(tmpdir(), "greenfield-native-guard-"));
  try {
    const portablePlan = runOnboarding(root, ["plan", "--root", root, "--runner", "codex"]);
    const portable = followOnboardingAction(root, portablePlan, "apply-portable-seed");
    const runtimePlan = followOnboardingAction(root, portable, "plan-runtime");
    const runtime = followOnboardingAction(root, runtimePlan, "initialize-runtime");
    assert.equal(runtime.status, "restart-required", JSON.stringify(runtime));
    simulateHostRuntimeReadback(root);
    const intake = runOnboarding(root, ["inspect", "--root", root, "--runner", "codex"]);
    const originalMaterial = "Document the original fixture material only.\n";
    const consented = applyCollectedOnboardingAction(root, intake, {
      "<PO_INTAKE_GIT_AUTHOR_NAME>": "Greenfield Fixture",
      "<PO_INTAKE_GIT_AUTHOR_EMAIL>": "greenfield@example.invalid",
      "<PO_INTAKE_LANGUAGE>": "en",
      "<PO_INTAKE_PROFILE>": "feature",
    }, originalMaterial);
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
  const result = run(patch);
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
  const result = run(patch);
  assert.equal(result.status, 0, result.stderr);
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
  const result = spawnSync(process.execPath, [guard], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDECODE: "1" },
    encoding: "utf8",
    input,
  });
  // A malformed/absent --runner makes guard-lifecycle-ready.mjs's own main()
  // fail closed before ever reaching the gate, which surfaces only the
  // generic "exact V4 ready result" message with no typed lifecycle status.
  // Reaching the specific "session readiness is <status>" message proves an
  // explicit, valid runner was threaded through and the gate was actually
  // consulted -- despite CLAUDECODE=1 being present in the environment.
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /guard-lifecycle-ready/);
  assert.match(result.stderr, /Pipeline session readiness is/u);
  assert.doesNotMatch(result.stderr, /exact V4 ready result for session intent/u);
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
  assert.match(loopBlock, /tool_input:\s*\{\s*file_path:\s*filePath\s*\}/u);
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
    const postAuthoring = runOnboarding(created.root, ["inspect", "--root", created.root, "--runner", "codex"]);
    assert.equal(postAuthoring.status, "bootstrap-binding-required", JSON.stringify(postAuthoring));
    assert.equal(postAuthoring.nextAction?.kind, "collect-input", JSON.stringify(postAuthoring));
    assert.ok(postAuthoring.nextAction.guidance.includes(prd), JSON.stringify(postAuthoring));
    assert.ok(postAuthoring.nextAction.guidance.includes(sha256(prdBytes)), JSON.stringify(postAuthoring));
    assert.ok(postAuthoring.nextAction.guidance.includes(spec), JSON.stringify(postAuthoring));
    assert.ok(postAuthoring.nextAction.guidance.includes(sha256(specBytes)), JSON.stringify(postAuthoring));
    // Bootstrap binding is deliberately earlier than plan approval. This test
    // proves its bounded authoring window and returns the real PO-only ask;
    // it never fabricates the acknowledgement marker or a binding approval.
    assert.notEqual(postAuthoring.status, "ready");
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

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`1..${passed}\n`);
