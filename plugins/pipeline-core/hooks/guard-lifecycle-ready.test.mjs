#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  isSanctionedLifecycleCommand,
} from "./guard-lifecycle-ready.mjs";

const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-start-preflight.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));

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

function bash(command = "printf implementation > src/output.txt") {
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

test("confirmed host-init admission is the only fallback for exact repository cross-view failures", () => {
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
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("host-init admission never masks App Server, runtime, continuity, or malformed readiness failures", () => {
  const path = root();
  let admissionReads = 0;
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
      }).exitCode, 2);
    }
    assert.equal(admissionReads, 0);
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
    for (const command of [inspect, apply, preflight, hostPlan, hostApply, kickoffPlan, kickoffApply]) {
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

test("every Edit or Write target in a governed session requires session readiness without path exemptions", () => {
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
    assert.equal(calls, filePaths.length * 2);
  } finally { rmSync(path, { recursive: true, force: true }); }
});
