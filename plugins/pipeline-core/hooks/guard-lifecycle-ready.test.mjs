#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
} from "../lib/project-onboarding-ready-gate.mjs";
import {
  evaluateLifecycleReadyGuard,
  isForbiddenCrossRepositoryMutation,
  isProjectWritePath,
  isReadOnlyDiagnosticCommand,
  isSanctionedLifecycleCommand,
} from "./guard-lifecycle-ready.mjs";
import {
  isBoundedReadOnlyPipeline,
  parseGuardCommand,
} from "./guard-command-grammar.mjs";

const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const ONBOARDING_LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-start-preflight.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const HUMAN_OVERRIDE_SCRIPT = fileURLToPath(new URL("../scripts/guard-human-override.mjs", import.meta.url));
const PRIVATE_OVERLAY_SCRIPT = fileURLToPath(new URL("../scripts/codex-private-overlay-activation.mjs", import.meta.url));

function root() {
  const path = mkdtempSync(join(tmpdir(), "guard-lifecycle-ready-"));
  mkdirSync(join(path, ".claude"), { recursive: true });
  return path;
}

function edit(filePath = "src/implementation.mjs") {
  return { tool_name: "Edit", tool_input: { file_path: filePath } };
}

function write(filePath = "src/implementation.mjs") {
  return { tool_name: "Write", tool_input: { file_path: filePath } };
}

function bash(command = "printf implementation") {
  return { tool_name: "Bash", tool_input: { command } };
}

function deny(status = "partial") {
  throw new ProjectOnboardingReadyError(
    "PORG-NOT-READY",
    "raw lifecycle message containing /private/root",
    { intent: "session", lifecycleStatus: status },
  );
}

test("ordinary non-governed repositories remain untouched and never inspect lifecycle", () => {
  const path = root();
  let calls = 0;
  try {
    assert.deepEqual(evaluateLifecycleReadyGuard(edit(), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { calls += 1; },
    }), { exitCode: 0, stderr: "" });
    assert.equal(calls, 0);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("source, calibration, lock, and runtime-only markers activate exact session readiness", () => {
  const markers = [
    ".agent-pipeline/core.lock.json",
    "pipeline.user.yaml",
    ".claude/pipeline.json",
    ".claude/pipeline.yaml",
    ".claude/settings.json",
    ".codex/config.toml",
    ".codex/agents/critic.toml",
  ];
  for (const marker of markers) {
    const path = root();
    let calls = 0;
    try {
      mkdirSync(dirname(join(path, marker)), { recursive: true });
      writeFileSync(join(path, marker), "marker\n");
      const result = evaluateLifecycleReadyGuard(edit(), {
        projectDir: path,
        requireProjectOnboardingReadyFn({ rootDir, intent }) {
          calls += 1;
          assert.equal(rootDir, path);
          assert.equal(intent, "session");
          deny();
        },
      });
      assert.equal(result.exitCode, 2, marker);
      assert.match(result.stderr, /BLOCKED \(guard-lifecycle-ready/u, marker);
      assert.equal(result.stderr.includes("/private/root"), false, marker);
      assert.equal(result.stderr.includes(path), false, marker);
      assert.equal(calls, 1, marker);
    } finally { rmSync(path, { recursive: true, force: true }); }
  }
});

test("exact session readiness allows the governed project write", () => {
  const path = root();
  const calls = [];
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    assert.deepEqual(evaluateLifecycleReadyGuard(edit(), {
      projectDir: path,
      requireProjectOnboardingReadyFn(options) {
        calls.push(options);
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    }), { exitCode: 0, stderr: "" });
    assert.deepEqual(calls, [{ rootDir: path, intent: "session" }]);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("direct State edits remain blocked even when session readiness is exact", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const filePath of [
      ".claude/pipeline-state.json",
      join(path, ".claude", "pipeline-state.json"),
      ".claude/../.claude/pipeline-state.json",
    ]) {
      const result = evaluateLifecycleReadyGuard(edit(filePath), {
        projectDir: path,
        requireProjectOnboardingReadyFn() {
          return {
            schema: "pipeline.project-onboarding-ready-gate.v1",
            status: "ready",
            intent: "session",
          };
        },
      });
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /writer-owned/u);
      assert.match(result.stderr, /must not be edited directly/u);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("governed consumer edits cannot escape their physical project root", () => {
  const path = root();
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-outside-"));
  let readinessCalls = 0;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    symlinkSync(outside, join(path, "linked-outside"));
    assert.equal(isProjectWritePath("src/local.mjs", path), true);
    for (const filePath of [
      join(outside, "pipeline-source.mjs"),
      "../foreign-repository/file.mjs",
      "linked-outside/escaped.mjs",
    ]) {
      const result = evaluateLifecycleReadyGuard(edit(filePath), {
        projectDir: path,
        requireProjectOnboardingReadyFn() {
          readinessCalls += 1;
          return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
        },
      });
      assert.equal(result.exitCode, 2, filePath);
      assert.match(result.stderr, /only inside its own physical project root/u);
      assert.match(result.stderr, /separate session rooted at the exact target/u);
    }
    assert.equal(readinessCalls, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("consumer sessions cannot mutate Pipeline sources, cachebusters or plugin installations", () => {
  const path = root();
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-plugin-source-"));
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const commands = [
      `python3 /tools/update_plugin_cachebuster.py ${outside}/plugins/pipeline-core`,
      "codex plugin add pipeline-core@agent-pipeline-local",
      "/home/operator/.codex/packages/current/codex plugin remove pipeline-core@agent-pipeline-local",
      "codex plugin marketplace update agent-pipeline-local",
      `git -C ${outside} commit -m drift`,
      `sed -i s/old/new/ ${outside}/plugins/pipeline-core/.codex-plugin/plugin.json`,
      `rm ${outside}/plugins/pipeline-core/.codex-plugin/plugin.json`,
      `printf x > ${outside}/plugins/pipeline-core/.codex-plugin/plugin.json`,
      "printf x > ./../foreign/plugin.json",
      "printf x 2>&1 > ./../foreign/plugin.json",
      "printf x>./../foreign/plugin.json",
      "printf x 2>&1>./../foreign/plugin.json",
    ];
    for (const command of commands) {
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), true, command);
      const result = evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() {
          return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
        },
      });
      assert.equal(result.exitCode, 2, command);
      assert.match(result.stderr, /marketplace metadata/u, command);
    }
    assert.equal(isForbiddenCrossRepositoryMutation(`git -C ${outside} status --short`, path), false);
    assert.equal(evaluateLifecycleReadyGuard(bash(`git -C ${outside} status --short`), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { throw new Error("read-only command must not inspect readiness"); },
    }).exitCode, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("cachebuster is source-root scoped while plugin installation remains operator-only", () => {
  const path = root();
  try {
    mkdirSync(join(path, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
    mkdirSync(join(path, "harness", "scripts"), { recursive: true });
    writeFileSync(join(path, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"), "{}\n");
    writeFileSync(join(path, "harness", "scripts", "verify.mjs"), "\n");
    assert.equal(isForbiddenCrossRepositoryMutation(
      `python3 /tools/update_plugin_cachebuster.py ${path}/plugins/pipeline-core`,
      path,
    ), false);
    assert.equal(isForbiddenCrossRepositoryMutation(
      "codex plugin add pipeline-core@agent-pipeline-local",
      path,
    ), true);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test("confirmed host-init admission or exact existing protected Git mount handles only repository cross-view failures", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const status of ["repository-mount-read-only", "repository-control-path-invalid"]) {
      for (const input of [bash(), edit(), write()]) {
        assert.deepEqual(evaluateLifecycleReadyGuard(input, {
          projectDir: path,
          requireProjectOnboardingReadyFn() { deny(status); },
          readCodexHostRepositoryInitAdmissionFn(rootDir) {
            assert.equal(rootDir, path);
            return { gitVersion: "2.53.0" };
          },
        }), { exitCode: 0, stderr: "" });
      }
    }
    for (const readCodexHostRepositoryInitAdmissionFn of [
      () => null,
      () => ({}),
      () => { throw new Error("private admission detail"); },
    ]) {
      const result = evaluateLifecycleReadyGuard(edit(), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("repository-mount-read-only"); },
        readCodexHostRepositoryInitAdmissionFn,
      });
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /guard-lifecycle-ready/u);
      assert.equal(result.stderr.includes("private admission detail"), false);
    }
    for (const status of ["repository-mount-read-only", "repository-control-path-invalid"]) {
      assert.deepEqual(evaluateLifecycleReadyGuard(edit(), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny(status); },
        readCodexHostRepositoryInitAdmissionFn: () => null,
        hasCodexExistingGitControlMountFn(rootDir) {
          assert.equal(rootDir, path);
          return true;
        },
      }), { exitCode: 0, stderr: "" });
    }
    const malformedExistingMount = evaluateLifecycleReadyGuard(edit(), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("repository-control-path-invalid"); },
      readCodexHostRepositoryInitAdmissionFn: () => null,
      hasCodexExistingGitControlMountFn: () => false,
    });
    assert.equal(malformedExistingMount.exitCode, 2);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("host-init admission never masks App Server, runtime, continuity, or malformed readiness failures", () => {
  const path = root();
  let admissionReads = 0;
  let existingMountReads = 0;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const nonRepositoryStatuses = [
      "app-server-not-running",
      "runtime-attestation-required",
      "continuity-damaged",
      "repository-observation-unavailable",
    ];
    for (const status of nonRepositoryStatuses) {
      for (const input of [bash(), edit(), write()]) {
        const result = evaluateLifecycleReadyGuard(input, {
          projectDir: path,
          requireProjectOnboardingReadyFn() { deny(status); },
          readCodexHostRepositoryInitAdmissionFn() {
            admissionReads += 1;
            return { gitVersion: "2.53.0" };
          },
          hasCodexExistingGitControlMountFn() {
            existingMountReads += 1;
            return true;
          },
        });
        assert.equal(result.exitCode, 2, `${status}/${input.tool_name}`);
        assert.match(result.stderr, /guard-lifecycle-ready/u, `${status}/${input.tool_name}`);
      }
    }
    for (const failure of [
      () => { throw new Error("unknown lifecycle exception"); },
      () => { throw new ProjectOnboardingReadyError(
        "PORG-INVALID-OBSERVATION",
        "invalid lifecycle observation",
        { intent: "session" },
      ); },
      () => { throw new ProjectOnboardingReadyError(
        "PORG-NOT-READY",
        "wrong intent",
        { intent: "bootstrap", lifecycleStatus: "repository-control-path-invalid" },
      ); },
    ]) {
      assert.equal(evaluateLifecycleReadyGuard(edit(), {
        projectDir: path,
        requireProjectOnboardingReadyFn: failure,
        readCodexHostRepositoryInitAdmissionFn() {
          admissionReads += 1;
          return { gitVersion: "2.53.0" };
        },
        hasCodexExistingGitControlMountFn() {
          existingMountReads += 1;
          return true;
        },
      }).exitCode, 2);
    }
    assert.equal(admissionReads, 0);
    assert.equal(existingMountReads, 0);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("exact session readiness allows an arbitrary Bash command while non-ready Bash writes are denied", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    assert.deepEqual(evaluateLifecycleReadyGuard(bash(), {
      projectDir: path,
      requireProjectOnboardingReadyFn() {
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    }), { exitCode: 0, stderr: "" });
    const denied = evaluateLifecycleReadyGuard(bash(), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
    });
    assert.equal(denied.exitCode, 2);
    assert.match(denied.stderr, /guard-lifecycle-ready/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("non-ready governed roots retain a narrow simple-command read-only diagnostic lane", () => {
  const path = root();
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-node-check-outside-"));
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    mkdirSync(join(path, "harness", "scripts"), { recursive: true });
    writeFileSync(join(path, "harness", "scripts", "verify.mjs"), "\n");
    mkdirSync(join(path, "specs"), { recursive: true });
    writeFileSync(join(path, "specs", "hotfix.md"), "hotfix\n");
    symlinkSync(outside, join(path, "linked-outside"));
    for (const command of [
      "pwd -P",
      "ls -la",
      "rg -n repository-control-path-invalid plugins",
      "sed -n '1,80p' pipeline.user.yaml",
      "node --check harness/scripts/verify.mjs",
      "node.exe --check harness/scripts/verify.mjs",
      "sha256sum specs/hotfix.md",
      "sha256sum -- specs/hotfix.md",
      "shasum -a 256 specs/hotfix.md",
      "shasum --algorithm 256 specs/hotfix.md",
      "certutil -hashfile specs/hotfix.md SHA256",
      "certutil.exe -hashfile specs/hotfix.md sha256",
      "git status --short --branch",
      "git diff --check",
      "git rev-parse HEAD",
      "git config --get branch.main.remote",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), true, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("repository-control-path-invalid"); },
      }), { exitCode: 0, stderr: "" });
    }
    for (const command of [
      "printf implementation > src/output.txt",
      "sed -i 's/a/b/' pipeline.user.yaml",
      "find . -delete",
      "git branch new-branch",
      "git config user.name changed",
      "git status && touch bypass",
      "node --check ../../outside.mjs",
      "node --check linked-outside/verify.mjs",
      "node --check harness/scripts/verify.mjs --eval bypass",
      "node -e 'process.exit(0)'",
      "sha256sum ../../outside.md",
      "sha256sum linked-outside/outside.md",
      "sha256sum specs/hotfix.md pipeline.user.yaml",
      "sha256sum -c specs/hotfix.md",
      "shasum -a 1 specs/hotfix.md",
      "shasum -a 256 specs/hotfix.md pipeline.user.yaml",
      "certutil -urlcache specs/hotfix.md SHA256",
      "certutil -hashfile ../../outside.md SHA256",
      "certutil -hashfile specs/hotfix.md SHA1",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("repository-control-path-invalid"); },
        readCodexHostRepositoryInitAdmissionFn: () => null,
        hasCodexExistingGitControlMountFn: () => false,
      }).exitCode, 2, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("non-ready write denials surface only the typed lifecycle status and recovery route", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      const result = evaluateLifecycleReadyGuard(edit(), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny(status); },
      });
      assert.equal(result.exitCode, 2, status);
      assert.match(result.stderr, new RegExp(`session readiness is ${status}`, "u"), status);
      assert.match(result.stderr, /project-onboarding-v3 inspection with intent session/u, status);
      assert.equal(result.stderr.includes("/private/root"), false, status);
      assert.equal(result.stderr.includes(path), false, status);
    }

    const unknown = evaluateLifecycleReadyGuard(edit(), {
      projectDir: path,
      requireProjectOnboardingReadyFn() {
        throw new Error("private unknown failure /private/root");
      },
    });
    assert.equal(unknown.exitCode, 2);
    assert.doesNotMatch(unknown.stderr, /private unknown|\/private\/root/u);
    assert.doesNotMatch(unknown.stderr, /session readiness is/u);
    assert.match(unknown.stderr, /project-onboarding-v3 session inspection/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("closed command grammar preserves native Windows paths and direct node.exe identity", () => {
  const windowsRoot = "C:\\Users\\Pipeline User\\consumer";
  const script = "C:\\Pipeline Plugin\\scripts\\project-onboarding-v3.mjs";
  const parsed = parseGuardCommand(
    `node.exe "${script}" inspect --root "${windowsRoot}" --intent bootstrap`,
    windowsRoot,
    { platform: "win32" },
  );
  assert.equal(parsed.parseStatus, "accepted");
  assert.equal(parsed.dialect, "windows-direct");
  assert.deepEqual(parsed.segments[0], {
    executable: "node.exe",
    argv: [script, "inspect", "--root", windowsRoot, "--intent", "bootstrap"],
  });
  assert.equal(isSanctionedLifecycleCommand(
    `node.exe "${ONBOARDING_SCRIPT}" inspect --root "${windowsRoot}" --intent bootstrap`,
    windowsRoot,
    { platform: "win32", processExecPath: "C:\\Program Files\\nodejs\\node.exe" },
  ), true);
});

test("only the bounded rg-to-head pipeline and platform null redirect are read-only", () => {
  const path = root();
  try {
    for (const command of [
      "rg -n -S lifecycle plugins 2>/dev/null | head -n 280",
      "rg --files --hidden --max-depth 3 . | head -n 500",
    ]) {
      const parsed = parseGuardCommand(command, path);
      assert.equal(isBoundedReadOnlyPipeline(parsed, path), true, command);
      assert.equal(isReadOnlyDiagnosticCommand(command, path), true, command);
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
    }
    const windows = "rg.exe -n lifecycle . 2>NUL | head.exe -n 20";
    const parsedWindows = parseGuardCommand(windows, path, { platform: "win32" });
    assert.equal(isBoundedReadOnlyPipeline(parsedWindows, path), true);
    for (const command of [
      "rg -n lifecycle . | head -n 0",
      "rg -n lifecycle . | head -n 050",
      "rg -n lifecycle . | head -n 501",
      "rg -n lifecycle . 2>diagnostic.log | head -n 20",
      "rg -n lifecycle . | tee output",
      "rg -n lifecycle . | head -n 20 | wc -l",
      "rg --pre worker lifecycle . | head -n 20",
      "rg -n lifecycle .. | head -n 20",
      "rg -n lifecycle . && head -n 20",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("redirect-looking quoted data stays argv while hostile composition is typed and denied", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const quoted = parseGuardCommand("node -e 'console.log(\"a>b\")'", path);
    assert.equal(quoted.parseStatus, "accepted");
    assert.equal(quoted.redirects.length, 0);
    for (const [command, code] of [
      ["rg -n lifecycle . > output.txt | head -n 20", "GUARD-REDIRECT-UNAPPROVED"],
      ["rg -n lifecycle . | tee output.txt", "GUARD-OPERATOR-UNAPPROVED"],
      ["rg -n lifecycle . && touch output.txt", "GUARD-PARSE-UNSUPPORTED"],
    ]) {
      const result = evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
      });
      assert.equal(result.exitCode, 2, command);
      assert.match(result.stderr, new RegExp(code, "u"), command);
      assert.doesNotMatch(result.stderr, /exact V4 ready result/u, command);
      assert.match(result.stderr, /separate simple read-only commands|Retry without redirection/u, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("non-ready Bash permits only exact plugin-local lifecycle remediation argv", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const inspect = `node '${ONBOARDING_SCRIPT}' inspect --root '${path}' --intent bootstrap`;
    const apply = `node '${ONBOARDING_SCRIPT}' apply-readback --root '${path}' --plan-sha256 ${"a".repeat(64)} --activate`;
    const preflight = `node '${START_PREFLIGHT_SCRIPT}'`;
    const hostPlan = `node '${HOST_REPOSITORY_INIT_SCRIPT}' plan --root '${path}'`;
    const hostApply = `node '${HOST_REPOSITORY_INIT_SCRIPT}' apply --root '${path}' --plan-sha256 ${"b".repeat(64)} --activate`;
    const kickoffPlan = `node '${ONBOARDING_SCRIPT}' kickoff plan --root '${path}' --goal 'Build one HTML game'`;
    const kickoffApply = `node '${ONBOARDING_SCRIPT}' kickoff apply --root '${path}' --goal 'Build one HTML game' --plan-sha256 ${"c".repeat(64)} --activate`;
    const overlayRoute = `node '${PRIVATE_OVERLAY_SCRIPT}' route --project-root '${path}'`;
    const poRebind = `node '${PIPELINE_STATE_SCRIPT}' po-authority-rebind-apply --plan-sha256 ${"d".repeat(64)} --updated-at 2026-07-29T09:00:00.000Z --activate`;
    const poDecisionPlan = `node '${PIPELINE_STATE_SCRIPT}' po-authority-decision-plan`;
    const poDecisionSelect = `node '${PIPELINE_STATE_SCRIPT}' po-authority-decision-select --plan-sha256 ${"d".repeat(64)} --planned-at 2026-07-29T09:00:00.000Z --selection spec`;
    const poDecisionApply = `node '${PIPELINE_STATE_SCRIPT}' po-authority-decision-apply --plan-sha256 ${"d".repeat(64)} --selection-digest ${"e".repeat(64)} --planned-at 2026-07-29T09:00:00.000Z --selection spec --activate`;
    const overridePlan = `node '${HUMAN_OVERRIDE_SCRIPT}' plan --repo '${path}' --request-sha256 ${"f".repeat(64)}`;
    const overridePrepare = `node '${HUMAN_OVERRIDE_SCRIPT}' prepare-authorization --repo '${path}' --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --reason 'PO attended exact action'`;
    const overrideAuthorize = `node '${HUMAN_OVERRIDE_SCRIPT}' authorize --repo '${path}' --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --selection-sha256 ${"c".repeat(64)} --reason 'PO attended exact action' --reason-sha256 ${"b".repeat(64)} --activate`;
    for (const command of [inspect, apply, preflight, hostPlan, hostApply, kickoffPlan, kickoffApply, overlayRoute, poRebind, poDecisionPlan, poDecisionSelect, poDecisionApply, overridePlan, overridePrepare, overrideAuthorize]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
      }), { exitCode: 0, stderr: "" });
    }
    for (const command of [
      `${inspect}; printf bypass > src/output.txt`,
      `node '${ONBOARDING_SCRIPT}' apply-readback --root /tmp/other --plan-sha256 ${"a".repeat(64)} --activate`,
      `node '${ONBOARDING_SCRIPT}' apply-readback --root '${path}' --plan-sha256 ${"a".repeat(64)} --activate && touch bypass`,
      `${preflight}; touch bypass`,
      `${hostApply} && touch bypass`,
      `node '${ONBOARDING_SCRIPT}' kickoff-plan --root '${path}' --goal 'Build one HTML game'`,
      `node '${ONBOARDING_SCRIPT}' plan-kickoff --root '${path}' --goal 'Build one HTML game'`,
      `node '${ONBOARDING_SCRIPT}' plan --root '${path}' --goal 'Build one HTML game'`,
      `node '${ONBOARDING_SCRIPT}' kickoff --root '${path}' --goal 'Build one HTML game'`,
      `node '${PRIVATE_OVERLAY_SCRIPT}' route --project-root /tmp/other`,
      `node '${PRIVATE_OVERLAY_SCRIPT}' status --project-root '${path}'`,
      `node '${PIPELINE_STATE_SCRIPT}' po-authority-rebind-apply --plan-sha256 ${"d".repeat(64)} --updated-at invalid --activate`,
      `node '/tmp/other/harness/scripts/pipeline-state.mjs' po-authority-rebind-apply --plan-sha256 ${"d".repeat(64)} --updated-at 2026-07-29T09:00:00.000Z --activate`,
      `${poRebind} --bypass`,
      `${poDecisionPlan} --selection spec`,
      `${poDecisionApply} --bypass`,
      `${overrideAuthorize} --bypass`,
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize --repo /tmp/other --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --selection-sha256 ${"c".repeat(64)} --reason x --reason-sha256 ${"b".repeat(64)} --activate`,
      `node -e 'require("node:fs").writeFileSync("bypass","x")'`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
      }).exitCode, 2, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("non-ready cleanup recovery admits only exact root, descriptor and digest bindings", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const digest = "a".repeat(64);
    const commands = [
      `node '${SESSION_CLEANUP_SCRIPT}' status --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' plan-recovery --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' release-binding --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-recovery --repo '${path}' --plan-sha256 ${digest} --activate`,
      `node '${SESSION_CLEANUP_SCRIPT}' cleanup --repo '${path}' --session-descriptor session-01 --expected-descriptor-sha256 ${digest}`,
    ];
    for (const command of commands) {
      assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
      }).exitCode, 0, command);
    }
    for (const command of [
      `node '${SESSION_CLEANUP_SCRIPT}' apply-recovery --repo /tmp/other --plan-sha256 ${digest} --activate`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-recovery --repo '${path}' --plan-sha256 ${digest}`,
      `node '${SESSION_CLEANUP_SCRIPT}' cleanup --repo '${path}' --session-descriptor ../foreign --expected-descriptor-sha256 ${digest}`,
      `node '${SESSION_CLEANUP_SCRIPT}' start --repo '${path}'`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("restart-process launcher is always rejected as an external user-copy-only action", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const command = `node '${ONBOARDING_LAUNCH_SCRIPT}' --root '${path}' --barrier-sha256 ${"d".repeat(64)} --activate`;
    const result = evaluateLifecycleReadyGuard(bash(command), {
      projectDir: path,
      requireProjectOnboardingReadyFn() {
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /EXTERNAL ACTION REQUIRED/u);
    assert.match(result.stderr, /external-terminal\/user-copy-only/u);
    assert.match(result.stderr, /must never be executed through a Codex tool call/u);
    assert.match(result.stderr, /launch\.copyCommand/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("every controlling non-ready status denies before the governed implementation write", () => {
  const path = root();
  let sideEffects = 0;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      for (const input of [edit(), bash()]) {
        const result = evaluateLifecycleReadyGuard(input, {
          projectDir: path,
          requireProjectOnboardingReadyFn({ intent }) {
            assert.equal(intent, "session");
            deny(status);
          },
          implementationWriteFn() { sideEffects += 1; },
        });
        assert.equal(result.exitCode, 2, `${status}/${input.tool_name}`);
        assert.match(result.stderr, /guard-lifecycle-ready/u, `${status}/${input.tool_name}`);
      }
    }
    assert.equal(sideEffects, 0);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("guard exceptions and malformed ready receipts fail closed with sanitized output", () => {
  const path = root();
  try {
    writeFileSync(join(path, ".claude", "pipeline.json"), "{}\n");
    for (const requireProjectOnboardingReadyFn of [
      () => { throw new Error("secret /private/root"); },
      () => null,
      () => ({ status: "ready", intent: "session" }),
    ]) {
      const result = evaluateLifecycleReadyGuard(edit(), { projectDir: path, requireProjectOnboardingReadyFn });
      assert.equal(result.exitCode, 2);
      assert.equal(result.stderr.includes("secret"), false);
      assert.equal(result.stderr.includes("/private/root"), false);
      assert.equal(result.stderr.includes(path), false);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("every in-root Edit or Write requires readiness while outside targets stop before readiness", () => {
  const path = root();
  let calls = 0;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const filePaths = [
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
    ];
    for (const toolInput of [edit, write]) {
      for (const filePath of filePaths) {
        const result = evaluateLifecycleReadyGuard(toolInput(filePath), {
          projectDir: path,
          requireProjectOnboardingReadyFn() {
            calls += 1;
            deny();
          },
        });
        assert.equal(result.exitCode, 2, `${toolInput().tool_name}: ${filePath}`);
        assert.match(result.stderr, /guard-lifecycle-ready/u, `${toolInput().tool_name}: ${filePath}`);
      }
    }
    assert.equal(calls, (filePaths.length - 1) * 2);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("H3 recovery commands admit only exact plugin-local argv and reject lookalikes", () => {
  const path = root();
  const digest = "a".repeat(64);
  try {
    const base = `node ${ONBOARDING_SCRIPT}`;
    assert.equal(isSanctionedLifecycleCommand(`${base} plan-source-recovery --root ${path}`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`${base} plan-manifest-repair --root ${path}`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`${base} apply-manifest-repair --root ${path} --plan-sha256 ${digest} --activate`, path), true);
    for (const hostile of [
      `${base} plan-manifest-repair --root ${path} --activate`,
      `${base} apply-manifest-repair --root ${path} --plan-sha256 ${digest}`,
      `${base} apply-manifest-repair --root ${path}/.. --plan-sha256 ${digest} --activate`,
      `${base} plan-manifest-repair --root ${path}; touch ${path}/x`,
      `node ${join(path, "plugins/pipeline-core/scripts/project-onboarding-v3.mjs")} plan-manifest-repair --root ${path}`,
    ]) assert.equal(isSanctionedLifecycleCommand(hostile, path), false, hostile);
  } finally { rmSync(path, { recursive: true, force: true }); }
});
