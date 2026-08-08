#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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
  claudeSessionMemoryDirectory,
  evaluateLifecycleReadyGuard,
  isClaudeSessionMemoryWritePath,
  isForbiddenCrossRepositoryMutation,
  isMachinePlaneWritePath,
  isNarrowRepositoryRecoveryCommand,
  isProjectWritePath,
  isReadOnlyDiagnosticCommand,
  isSanctionedLifecycleCommand,
  machinePlaneFilePath,
  main,
  retryActionsForDeniedCommand,
} from "./guard-lifecycle-ready.mjs";
import {
  isBoundedReadOnlyPipeline,
  parseGuardCommand,
} from "./guard-command-grammar.mjs";
// NOVA-LCR-HGO-1 (ADR-0059 Decision 3/4): the same generic HGO Bash class the guard now
// consumes for its three closed-shell-grammar denials. Arming driven through the library
// directly, mirroring guard-testpath-override.test.mjs's `arm()` (chat) and
// lib/human-guard-override.test.mjs's `prepareSignedArming()` (signature) helpers.
import {
  authorizeHumanGuardOverride,
  authorizeHumanGuardOverrideBySignature,
  HGO_SIGNATURE_REASON,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";

const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const ONBOARDING_LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const V3_BOOTSTRAP_AUTHORITY_SCRIPT = fileURLToPath(new URL("../scripts/v3-bootstrap-authority.mjs", import.meta.url));
const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-start-preflight.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const SESSION_CAPABILITY_DIAGNOSE_SCRIPT = fileURLToPath(new URL("../scripts/session-capability-diagnose.mjs", import.meta.url));
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const PO_PROFILE_REPAIR_SCRIPT = fileURLToPath(new URL("../scripts/po-gate-profile-repair.mjs", import.meta.url));
const PROJECT_AUTHORITY_MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/project-authority-migration.mjs", import.meta.url));
const RESUME_HINT_SCRIPT = fileURLToPath(new URL("../scripts/resume-hint.mjs", import.meta.url));
const HUMAN_OVERRIDE_SCRIPT = fileURLToPath(new URL("../scripts/guard-human-override.mjs", import.meta.url));
const PRIVATE_OVERLAY_SCRIPT = fileURLToPath(new URL("../scripts/codex-private-overlay-activation.mjs", import.meta.url));
const PO_HUMAN_APPROVAL_SCRIPT = fileURLToPath(new URL("../scripts/po-human-approval.mjs", import.meta.url));
const PO_APPROVAL_GATE_SCRIPT = fileURLToPath(new URL("../scripts/po-approval-gate.mjs", import.meta.url));

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

// MACHPATH-1: NotebookEdit is the third WRITE_TOOLS member and carries its target under
// `notebook_path`, not `file_path` (lib/tool-write-target.mjs) -- AC-1 requires every
// write-capable tool proven, not only the two `edit`/`write` helpers above already cover.
function notebookEdit(filePath = "src/implementation.ipynb") {
  return { tool_name: "NotebookEdit", tool_input: { notebook_path: filePath } };
}

// MEMPATH-1: real Edit/Write PreToolUse payloads carry `file_path` alongside sibling
// top-level fields the tool itself never sees or sets, `transcript_path` among them. `edit`/
// `write` above stay unmodified (every pre-existing test relies on their exact shape); these
// two add only the one field this feature reads, mirroring the real harness contract rather
// than a synthetic shortcut.
function editWithTranscript(filePath, transcriptPath) {
  return { tool_name: "Edit", tool_input: { file_path: filePath }, transcript_path: transcriptPath };
}

function writeWithTranscript(filePath, transcriptPath) {
  return { tool_name: "Write", tool_input: { file_path: filePath }, transcript_path: transcriptPath };
}

/**
 * A real Claude Code session directory: an absolute transcript file (a UUID `.jsonl`
 * sibling of the memory directory, exactly what `dirname(transcript_path)` yields) plus its
 * already-materialized `memory/` directory -- matching this session's own observed on-disk
 * shape (confirmed live, this dispatch, Linux/WSL2) rather than a guessed layout.
 */
function claudeMemorySessionFixture() {
  const sessionDir = mkdtempSync(join(tmpdir(), "guard-lifecycle-claude-session-"));
  const transcriptPath = join(sessionDir, "9f86d081-884c-4d30-8c19-ffcaa4c07bd1.jsonl");
  const memoryDir = join(sessionDir, "memory");
  mkdirSync(memoryDir, { recursive: true });
  return { sessionDir, transcriptPath, memoryDir };
}

// MACHPATH-1: the repository's own gitignored scratch/ tree, never system tmpdir and never
// the real $HOME (field-4 constraint: this feature IS a home-directory write surface, so its
// own fixtures must stay inside the repository rather than merely stand in for one, unlike the
// pre-existing MEMPATH-1 session fixtures above which model Claude Code's own session dir).
const SCRATCH_ROOT = fileURLToPath(new URL("../../../scratch/", import.meta.url));

/**
 * A fake home directory rooted under SCRATCH_ROOT, standing in for `os.homedir()` via the
 * injected `homedirFn` dependency -- never the real one. Returns the fixture directory plus
 * the exact single file this feature is meant to admit, both already realpathed so the fixture
 * agrees with what machinePlaneFilePath() itself derives.
 */
function machinePlaneHomeFixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const home = mkdtempSync(join(SCRATCH_ROOT, "guard-lifecycle-machine-home-"));
  const realHome = realpathSync(home);
  return { home, target: join(realHome, ".agent-pipeline", "machine.json") };
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

test("exact session readiness allows the governed project write and threads the caller-supplied runner explicitly", () => {
  const path = root();
  const calls = [];
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    assert.deepEqual(evaluateLifecycleReadyGuard(edit(), {
      projectDir: path,
      runner: "codex",
      requireProjectOnboardingReadyFn(options) {
        calls.push(options);
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    }), { exitCode: 0, stderr: "" });
    assert.deepEqual(calls, [{ rootDir: path, intent: "session", runner: "codex" }]);
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

test("agents prepare and verify only public PO artifacts while human signing stays external", () => {
  const path = root();
  const external = mkdtempSync(join(tmpdir(), "guard-lifecycle-po-public-"));
  const readiness = {
    schema: "pipeline.project-onboarding-ready-gate.v1",
    status: "ready",
    intent: "session",
  };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const command of [
      `node ${PO_APPROVAL_GATE_SCRIPT} prepare --repo-root ${path} --directory ${external} --feature-id cyb-4`,
      `node ${PO_APPROVAL_GATE_SCRIPT} prepare-all --repo-root ${path} --directory ${external}`,
      `node ${PO_APPROVAL_GATE_SCRIPT} verify-all --repo-root ${path} --directory ${external}`,
    ]) {
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { return readiness; },
      }), { exitCode: 0, stderr: "" }, command);
    }
    for (const command of [
      `node ${PO_APPROVAL_GATE_SCRIPT} prepare --repo-root ${path} --directory ${external} --feature-id cyb-8`,
      `node ${PO_APPROVAL_GATE_SCRIPT} prepare-all --repo-root ${path} --directory ${external} --feature-id cyb-4`,
      `node ${PO_APPROVAL_GATE_SCRIPT} prepare --repo-root ${path} --directory ${path} --feature-id cyb-4`,
    ]) assert.equal(isForbiddenCrossRepositoryMutation(command, path), true, command);
    for (const command of [
      `node ${PO_HUMAN_APPROVAL_SCRIPT} approve --repo-root ${path} --directory ${external} --feature-id cyb-4`,
      `node ${PO_HUMAN_APPROVAL_SCRIPT} approve-all --repo-root ${path} --directory ${external}`,
      `node ${PO_HUMAN_APPROVAL_SCRIPT} setup --repo-root ${path} --directory ${external}`,
    ]) {
      const result = evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { return readiness; },
      });
      assert.equal(result.exitCode, 2, command);
      assert.match(result.stderr, /human-terminal actions/u, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
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
      "git fetch origin refs/heads/main:refs/remotes/origin/main",
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

test("only bounded rg search pipelines and platform null redirect are read-only", () => {
  const path = root();
  try {
    for (const command of [
      "rg -n -S lifecycle plugins 2>/dev/null | head -n 280",
      "rg --files --hidden --max-depth 3 . | head -n 500",
      "rg -l -S lifecycle plugins -g '*.mjs' -g '*.md' | head -n 180",
      "rg --files plugins/pipeline-core harness | rg 'verify|journal'",
      "rg -n -S lifecycle plugins | rg guard",
    ]) {
      const parsed = parseGuardCommand(command, path);
      assert.equal(isBoundedReadOnlyPipeline(parsed, path), true, command);
      assert.equal(isReadOnlyDiagnosticCommand(command, path), true, command);
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
    }
    const windows = "rg.exe -n lifecycle . 2>NUL | head.exe -n 20";
    const parsedWindows = parseGuardCommand(windows, path, { platform: "win32" });
    assert.equal(isBoundedReadOnlyPipeline(parsedWindows, path), true);
    const windowsSearch = "rg.exe --files . | rg.exe lifecycle";
    const parsedWindowsSearch = parseGuardCommand(windowsSearch, path, { platform: "win32" });
    assert.equal(isBoundedReadOnlyPipeline(parsedWindowsSearch, path), true);
    for (const command of [
      "rg -n lifecycle . | head -n 0",
      "rg -n lifecycle . | head -n 050",
      "rg -n lifecycle . | head -n 501",
      "rg -n lifecycle . 2>diagnostic.log | head -n 20",
      "rg -n lifecycle . | tee output",
      "rg -n lifecycle . | head -n 20 | wc -l",
      "rg --pre worker lifecycle . | rg guard",
      "rg -n lifecycle .. | rg guard",
      "rg -n lifecycle . 2>diagnostic.log | rg guard",
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
      ["rg -n lifecycle . ; head -n 20 output.txt", "GUARD-PARSE-UNSUPPORTED"],
      ["rg -n lifecycle .\nhead -n 20 output.txt", "GUARD-PARSE-UNSUPPORTED"],
    ]) {
      const result = evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
      });
      assert.equal(result.exitCode, 2, command);
      assert.match(result.stderr, new RegExp(code, "u"), command);
      assert.doesNotMatch(result.stderr, /exact V4 ready result/u, command);
      assert.match(result.stderr, /one simple shell command per tool call/u, command);
      assert.match(result.stderr, /separate parallel tool calls/u, command);
      assert.match(result.stderr, /Do not construct a new composed command/u, command);
      assert.match(result.stderr, /If typed retryActions are present/u, command);
      assert.match(result.stderr, /Only bounded rg-to-rg and rg-to-head diagnostic pipelines are admitted as exceptions/u, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("grammar denials return closed typed retries only for independent read diagnostics", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    writeFileSync(join(path, "one.txt"), "one\n");
    writeFileSync(join(path, "two.txt"), "two\n");
    const command = "sed -n '1,10p' one.txt ; sed -n '1,10p' two.txt";
    const actions = retryActionsForDeniedCommand(command, path);
    assert.deepEqual(actions, [
      {
        executable: "sed", argv: ["-n", "1,10p", "one.txt"], mutation: false,
        requiresConfirmation: false, executionBoundary: "separate-tool-call", expected: { exitCodes: [0, 1] },
      },
      {
        executable: "sed", argv: ["-n", "1,10p", "two.txt"], mutation: false,
        requiresConfirmation: false, executionBoundary: "separate-tool-call", expected: { exitCodes: [0, 1] },
      },
    ]);
    const result = evaluateLifecycleReadyGuard(bash(command), { projectDir: path });
    assert.equal(result.exitCode, 2);
    const envelopeLine = result.stderr.split("\n").find((line) => line.startsWith('{"schema":"pipeline.guard-retry-actions.v1"'));
    assert.ok(envelopeLine);
    assert.deepEqual(JSON.parse(envelopeLine).retryActions, actions);
    assert.deepEqual(
      retryActionsForDeniedCommand("sed -n '1,10p' one.txt\nsed -n '1,10p' two.txt", path),
      actions,
    );
    assert.deepEqual(
      retryActionsForDeniedCommand("sed -n '1,10p' one.txt\r\nsed -n '1,10p' two.txt", path),
      actions,
    );
    assert.deepEqual(retryActionsForDeniedCommand("sed -n '1,10p' one.txt ; touch changed.txt", path), []);
    assert.deepEqual(retryActionsForDeniedCommand("rg one . | head -n 10", path), []);
    assert.deepEqual(retryActionsForDeniedCommand("sed -n \"$(id)\" one.txt ; pwd", path), []);
    assert.deepEqual(retryActionsForDeniedCommand("sed -n '1,10p' one.txt\\\nsed -n '1,10p' two.txt", path), []);
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
    const legacyRevocationRecoveryPlan = `node '${PIPELINE_STATE_SCRIPT}' plan-legacy-v2-revocation-recovery --by 'Phoenix PO'`;
    const legacyRevocationRecoveryApply = `node '${PIPELINE_STATE_SCRIPT}' apply-legacy-v2-revocation-recovery --by 'Phoenix PO' --prepared-at 2026-07-29T09:00:00.000Z --preimage-sha256 ${"a".repeat(64)} --postimage-sha256 ${"b".repeat(64)} --plan-sha256 ${"c".repeat(64)} --activate true`;
    const reopenDesign = `node '${PIPELINE_STATE_SCRIPT}' reopen-design --by 'PO recovery'`;
    const submitPlan = `node '${PIPELINE_STATE_SCRIPT}' submit-plan --by 'PO recovery' --profile epic`;
    const approvePlan = `node '${PIPELINE_STATE_SCRIPT}' approve-plan --by 'PO recovery'`;
    const setPhase = `node '${PIPELINE_STATE_SCRIPT}' set-phase --phase implementation`;
    const profileRepairPlan = `node '${PO_PROFILE_REPAIR_SCRIPT}' plan --root '${path}'`;
    const profileRepairApply = `node '${PO_PROFILE_REPAIR_SCRIPT}' apply --root '${path}' --plan-sha256 ${"d".repeat(64)} --activate`;
    const authorityMigrationPlan = `node '${PROJECT_AUTHORITY_MIGRATION_SCRIPT}' plan --root '${path}'`;
    const authorityMigrationApply = `node '${PROJECT_AUTHORITY_MIGRATION_SCRIPT}' apply --root '${path}' --plan-sha256 ${"d".repeat(64)} --activate`;
    const overridePlan = `node '${HUMAN_OVERRIDE_SCRIPT}' plan --repo '${path}' --request-sha256 ${"f".repeat(64)}`;
    const overridePrepare = `node '${HUMAN_OVERRIDE_SCRIPT}' prepare-authorization --repo '${path}' --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --reason 'PO attended exact action'`;
    const overrideAuthorize = `node '${HUMAN_OVERRIDE_SCRIPT}' authorize --repo '${path}' --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --selection-sha256 ${"c".repeat(64)} --reason 'PO attended exact action' --reason-sha256 ${"b".repeat(64)} --activate`;
    const authorRoot = join(path, "plugins", "pipeline-core");
    const overrideAuthorPlan = `${overridePlan} --author-source-root '${authorRoot}'`;
    const overrideAuthorPrepare = `${overridePrepare} --author-source-root '${authorRoot}'`;
    const overrideAuthorAuthorize = `node '${HUMAN_OVERRIDE_SCRIPT}' authorize --repo '${path}' --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --selection-sha256 ${"c".repeat(64)} --reason 'PO attended exact action' --reason-sha256 ${"b".repeat(64)} --author-source-root '${authorRoot}' --activate`;
    for (const command of [inspect, apply, preflight, hostPlan, hostApply, kickoffPlan, kickoffApply, overlayRoute, poRebind, poDecisionPlan, poDecisionSelect, poDecisionApply, legacyRevocationRecoveryPlan, reopenDesign, submitPlan, approvePlan, setPhase, profileRepairPlan, profileRepairApply, authorityMigrationPlan, authorityMigrationApply, overridePlan, overridePrepare, overrideAuthorize, overrideAuthorPlan, overrideAuthorPrepare, overrideAuthorAuthorize]) {
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
      legacyRevocationRecoveryApply,
      `node '${PIPELINE_STATE_SCRIPT}' apply-legacy-v2-revocation-recovery --by 'Phoenix PO' --prepared-at 2026-07-29T09:00:00.000Z --preimage-sha256 ${"a".repeat(64)} --postimage-sha256 ${"b".repeat(64)} --plan-sha256 ${"c".repeat(64)} --activate false`,
      `${legacyRevocationRecoveryApply} --bypass`,
      `node '${PIPELINE_STATE_SCRIPT}' reopen-design --by`,
      `${reopenDesign} --bypass`,
      `node '${PIPELINE_STATE_SCRIPT}' submit-plan --by 'PO recovery' --profile unsafe`,
      `${submitPlan} --bypass`,
      `node '${PIPELINE_STATE_SCRIPT}' approve-plan --by ''`,
      `node '${PIPELINE_STATE_SCRIPT}' set-phase --phase release`,
      `node '${PO_PROFILE_REPAIR_SCRIPT}' apply --root '${path}' --activate`,
      `node '${PROJECT_AUTHORITY_MIGRATION_SCRIPT}' apply --root '${path}' --activate`,
      `${overrideAuthorize} --bypass`,
      `${overridePlan} --author-source-root /tmp/other`,
      `${overrideAuthorAuthorize} --bypass`,
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

/**
 * GUARDARGV-2. The repair script writes `--human-facing <de|en>` into the apply argv it
 * emits itself, and the gate prints "add --human-facing <de|en>" as the operator's next
 * step -- while the guard refused that exact command in the one state it is offered in.
 *
 * Everything asserted here is taken from the script rather than restated: the closed
 * value set from its parser's own `SUPPORTED_LANGUAGES`, the apply argv from what `plan`
 * actually emits. A change on either side therefore breaks this test rather than the
 * operator's repair route. The refusals pin that the admission stayed positional and
 * closed -- out-of-set, reordered, duplicated and padded variants must not ride along.
 */
test("non-ready Bash admits the repair script's own --human-facing argv, positionally and closed", () => {
  const path = realpathSync(root());
  const script = PO_PROFILE_REPAIR_SCRIPT;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "language:\n  human_facing: \"en\"\n");
    writeFileSync(join(path, ".claude", "pipeline.yaml"), "language:\n  human_facing: en\n");
    const declared = readFileSync(script, "utf8").match(/const SUPPORTED_LANGUAGES = (\[[^\]]*\]);/u);
    assert.ok(declared, "the repair script still declares one closed language set");
    const languages = JSON.parse(declared[1].includes("'") ? declared[1].replace(/'/gu, "\"") : declared[1]);
    assert.deepEqual([...languages].sort(), ["de", "en"]);
    const digest = "e".repeat(64);
    const admit = (command) => {
      assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
      }), { exitCode: 0, stderr: "" }, command);
    };
    const refuse = (command) => {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
      }).exitCode, 2, command);
    };
    for (const language of languages) {
      admit(`node '${script}' plan --root '${path}' --human-facing ${language}`);
      admit(`node '${script}' apply --root '${path}' --human-facing ${language} --plan-sha256 ${digest} --activate`);
    }
    // The pre-existing shapes stay admitted unchanged.
    admit(`node '${script}' plan --root '${path}'`);
    admit(`node '${script}' apply --root '${path}' --plan-sha256 ${digest} --activate`);
    // The apply argv the script emits itself, taken from its own plan output.
    const planned = spawnSync(
      process.execPath,
      [script, "plan", "--root", path, "--human-facing", "de"],
      { encoding: "utf8" },
    );
    assert.equal(planned.status, 0, planned.stdout);
    const emitted = JSON.parse(planned.stdout).applyAction.argv;
    assert.deepEqual(emitted.slice(0, 5), [script, "apply", "--root", path, "--human-facing"]);
    const word = (value) => (/^[A-Za-z0-9_.:=-]+$/u.test(value) ? value : `'${value}'`);
    admit(`node ${emitted.map(word).join(" ")}`);
    for (const command of [
      `node '${script}' plan --root '${path}' --human-facing fr`,
      `node '${script}' plan --root '${path}' --human-facing DE`,
      `node '${script}' plan --root '${path}' --human-facing`,
      `node '${script}' plan --root '${path}' --human-facing de --human-facing de`,
      `node '${script}' plan --human-facing de --root '${path}'`,
      `node '${script}' plan --root '${path}' --human-facing de --activate`,
      `node '${script}' plan --root '${path}' --human-facing de --plan-sha256 ${digest} --activate`,
      `node '${script}' apply --root '${path}' --human-facing fr --plan-sha256 ${digest} --activate`,
      `node '${script}' apply --root '${path}' --plan-sha256 ${digest} --human-facing de --activate`,
      `node '${script}' apply --root '${path}' --human-facing de --human-facing en --plan-sha256 ${digest} --activate`,
      `node '${script}' apply --root '${path}' --human-facing de --plan-sha256 ${digest} --activate --bypass`,
      `node '${script}' apply --root '${path}' --human-facing de --plan-sha256 zz --activate`,
      `node '${script}' apply --root '${path}' --human-facing de --plan-sha256 ${digest}`,
      `node '${script}' apply --root /tmp/other --human-facing de --plan-sha256 ${digest} --activate`,
      `node '${script}' plan --root '${path}' --human-facing de && touch bypass`,
      `node '${script}' repair --root '${path}' --human-facing de`,
      `node '${PROJECT_AUTHORITY_MIGRATION_SCRIPT}' plan --root '${path}' --human-facing de`,
    ]) refuse(command);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * ADR-0059 Decision 4, `signature` mode's decisive final step (NOVA-HGOSIG-TRUST-1 D1).
 *
 * The guard prints `authorize-by-signature ...` as the next command whenever
 * gates.push_approval is `signature` (this repository's committed value) -- see the
 * continuation assertion at "signature mode offers authorize-by-signature" further down --
 * and `sanctionedHumanOverrideArgs()` then had to admit it. It did not: its base check
 * matched `args[0] === "authorize"` by strict equality, so the offered route dead-ended at
 * its last step. Positive and negative shapes are asserted in ONE test on purpose: the
 * mutations alone pass against the unfixed code (which refuses everything), so only the
 * admission assertion proves the branch exists, and only the mutations prove it did not
 * arrive as a blanket allowance.
 */
test("signature mode's authorize-by-signature is admitted in exactly its printed shape and refused when mutated", () => {
  const path = root();
  const external = mkdtempSync(join(tmpdir(), "guard-lifecycle-ready-proof-"));
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const request = "f".repeat(64);
    const plan = "a".repeat(64);
    const proof = join(external, "proof.json");
    const authorRoot = join(path, "plugins", "pipeline-core");
    const signature = `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --request-sha256 ${request} --plan-sha256 ${plan} --proof '${proof}'`;
    const signatureAuthor = `${signature} --author-source-root '${authorRoot}'`;
    for (const command of [signature, signatureAuthor]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
      }), { exitCode: 0, stderr: "" }, command);
    }
    for (const command of [
      // wrong flag order
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --plan-sha256 ${plan} --request-sha256 ${request} --proof '${proof}'`,
      // non-hex and short digests
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --request-sha256 ${"g".repeat(64)} --plan-sha256 ${plan} --proof '${proof}'`,
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --request-sha256 ${request} --plan-sha256 ${"a".repeat(63)} --proof '${proof}'`,
      // extra trailing word
      `${signature} --bypass`,
      `${signature} --activate`,
      `${signatureAuthor} --activate`,
      // wrong --repo
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo /tmp/other --request-sha256 ${request} --plan-sha256 ${plan} --proof '${proof}'`,
      // wrong --author-source-root
      `${signature} --author-source-root /tmp/other`,
      // the trust anchor is not caller-supplied: --authority is no shape at all
      `${signature} --authority '${join(external, "authority.json")}'`,
      // --proof is bounded structurally: in-repository, relative, traversing,
      // non-JSON and empty paths are all refused
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --request-sha256 ${request} --plan-sha256 ${plan} --proof '${join(path, "proof.json")}'`,
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --request-sha256 ${request} --plan-sha256 ${plan} --proof proof.json`,
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --request-sha256 ${request} --plan-sha256 ${plan} --proof '${external}/../proof.json'`,
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --request-sha256 ${request} --plan-sha256 ${plan} --proof '${join(external, "proof.txt")}'`,
      `node '${HUMAN_OVERRIDE_SCRIPT}' authorize-by-signature --repo '${path}' --request-sha256 ${request} --plan-sha256 ${plan} --proof ''`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
      }).exitCode, 2, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("plan-runtime family accepts the runner-plus-intent argv lifecycleArgv actually emits for non-default intents", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const command of [
      "plan", "plan-runtime", "plan-reinstall", "plan-repair", "plan-readback",
      "plan-source-recovery", "plan-manifest-repair",
    ]) {
      // Regression pin: this is the exact 7-token argv shape lifecycleArgv(argv, runner, intent)
      // emits at project-onboarding-v3.mjs:1300-1303 whenever intent !== "onboarding" — --runner
      // is appended first, --intent afterward, so --runner sits second-to-last, not trailing.
      for (const intent of ["onboarding", "bootstrap", "session", "dispatch"]) {
        for (const runner of ["claude", "codex"]) {
          const withIntent = `node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --runner ${runner} --intent ${intent}`;
          assert.equal(isSanctionedLifecycleCommand(withIntent, path), true, withIntent);
        }
      }
      // No-regression pin: the pre-existing default-intent shape (trailing --runner, no
      // --intent) must keep working exactly as before the generalization.
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --runner claude`, path), true);
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --runner codex`, path), true);
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${command} --root '${path}'`, path), true);
    }
    for (const command of [
      // invalid intent value
      `node '${ONBOARDING_SCRIPT}' plan-runtime --root '${path}' --runner claude --intent unknown`,
      // invalid runner value
      `node '${ONBOARDING_SCRIPT}' plan-runtime --root '${path}' --runner windows --intent session`,
      // malformed / wrong-length argv
      `node '${ONBOARDING_SCRIPT}' plan-runtime --root '${path}' --intent session --extra flag`,
      `node '${ONBOARDING_SCRIPT}' plan-runtime --root '${path}' --runner claude --intent session --extra flag`,
      `node '${ONBOARDING_SCRIPT}' plan-runtime --root '${path}' --runner claude --intent`,
      `node '${ONBOARDING_SCRIPT}' plan-runtime --root '${path}' --runner claude --goal session`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * GUARDFIX-1 (A). The apply half of the same defect the test above closed for the plan half.
 *
 * `plan-runtime --intent session` returns, verbatim, the argv built at
 * lib/project-onboarding-v3.mjs:3608-3627 through `lifecycleArgv(argv, runner, intent)`
 * (:1315-1318): `initialize-runtime --root <root> --plan-sha256 <hex> --activate --runner
 * <runner> --intent <intent>` -- `--runner` appended first, `--intent` afterward and only
 * when it differs from the "onboarding" default. The allowlist required `args.length === 6`
 * after the runner strip, so the planner emitted a command its own guard refused and the
 * printed recovery instruction pointed the operator back at the refusal.
 *
 * The accepted `--intent` values are written out here on purpose rather than imported or
 * paraphrased: they are the CLI's own closed set (scripts/project-onboarding-v3.mjs:62), and
 * a test that derived them from the guard could not fail when the guard drifts from the CLI.
 *
 * Positive and negative shapes in ONE test deliberately: the mutations alone pass against
 * the unfixed code, which refuses everything, so only the admission proves the branch
 * exists, and only the mutations prove it did not arrive as a blanket allowance.
 */
test("GUARDFIX-1: the apply family admits exactly the runner-plus-intent argv the planner returns and no wider shape", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const sha = "a".repeat(64);
    const applyFamily = [
      "apply-portable-seed", "apply-reinstall", "initialize-runtime", "apply-repair", "apply-readback",
    ];
    for (const command of applyFamily) {
      for (const intent of ["onboarding", "bootstrap", "session", "dispatch"]) {
        for (const runner of ["claude", "codex"]) {
          const returned = `node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --plan-sha256 ${sha} --activate --runner ${runner} --intent ${intent}`;
          assert.equal(isSanctionedLifecycleCommand(returned, path), true, returned);
          assert.deepEqual(evaluateLifecycleReadyGuard(bash(returned), {
            projectDir: path,
            requireProjectOnboardingReadyFn() { deny("runtime-initialization-required"); },
          }), { exitCode: 0, stderr: "" }, returned);
        }
      }
      // No-regression pins: every shape admitted before this fix stays admitted.
      for (const unchanged of [
        `node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --plan-sha256 ${sha} --activate`,
        `node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --plan-sha256 ${sha} --activate --runner claude`,
        `node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --plan-sha256 ${sha} --activate --runner codex`,
      ]) {
        assert.equal(isSanctionedLifecycleCommand(unchanged, path), true, unchanged);
      }
    }
    const base = `node '${ONBOARDING_SCRIPT}' initialize-runtime --root '${path}' --plan-sha256 ${sha} --activate`;
    for (const command of [
      // an --intent value outside the CLI's closed set
      `${base} --runner claude --intent onboarding-v2`,
      `${base} --runner claude --intent implementation`,
      `${base} --runner claude --intent ''`,
      `${base} --intent session --runner windows`,
      // a flag added to the returned argv
      `${base} --runner claude --intent session --extra flag`,
      `${base} --runner claude --intent session --activate`,
      `${base} --runner claude --intent`,
      // the positionally checked flags reordered (the guard compares a fixed sequence and
      // must keep doing so; --runner/--intent pair order is normalized by the pre-existing
      // withoutRunnerFlag scan and is deliberately not asserted here)
      `node '${ONBOARDING_SCRIPT}' initialize-runtime --root '${path}' --plan-sha256 ${sha} --intent session --activate --runner claude`,
      `node '${ONBOARDING_SCRIPT}' initialize-runtime --root '${path}' --activate --plan-sha256 ${sha} --runner claude --intent session`,
      `node '${ONBOARDING_SCRIPT}' initialize-runtime --plan-sha256 ${sha} --root '${path}' --activate --runner claude --intent session`,
      // the digest and the root stay checked under the new length
      `node '${ONBOARDING_SCRIPT}' initialize-runtime --root '${path}' --plan-sha256 ${"a".repeat(63)} --activate --runner claude --intent session`,
      `node '${ONBOARDING_SCRIPT}' initialize-runtime --root /tmp/other --plan-sha256 ${sha} --activate --runner claude --intent session`,
      // the intent pair does not smuggle in a neighbouring subcommand's shape
      `node '${ONBOARDING_SCRIPT}' apply-manifest-repair --root '${path}' --plan-sha256 ${sha} --activate --runner claude --intent session`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("runtime-initialization-required"); },
      }).exitCode, 2, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * GUARDFIX-1 (B). A denial code has to name what actually happened.
 *
 * `hasExternalOutputRedirect()` -- the fallback the cross-repository classifier uses for
 * commands the closed grammar cannot parse -- read every `>` as an output redirect and
 * refused the command as GUARD-CROSS-REPO-MUTATION whenever the target sat outside the
 * project root. `/dev/null` sits outside every project root, so a composed read-only lookup
 * carrying nothing but a stderr suppressor was reported as a mutation of another repository.
 * The accepted-parse branch of the same function had exempted `2>/dev/null` since 2b56304;
 * the two had simply drifted, and both now share isNullDeviceStderrRedirect().
 *
 * What this fix does NOT do is admit anything: every command below is still refused with
 * exit code 2. Only the code changes, from a false one to the one the guard's own grammar
 * rules already assign.
 */
test("GUARDFIX-1: a null-device stderr suppressor is never itself a cross-repository mutation while every real redirect keeps its own code", () => {
  const path = root();
  const deps = {
    projectDir: path,
    requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
  };
  const code = (command) => {
    const result = evaluateLifecycleReadyGuard(bash(command), deps);
    assert.equal(result.exitCode, 2, command);
    return (result.stderr.match(/GUARD-[A-Z-]+/u) ?? ["<none>"])[0];
  };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    // The reported command. Already truthfully typed before this fix (its grammar parses,
    // so it reached the accepted-parse branch that already exempted `2>/dev/null`); pinned
    // so it cannot regress into the mutation code from either direction.
    assert.equal(isForbiddenCrossRepositoryMutation("which a b c 2>/dev/null", path), false);
    assert.equal(code("which a b c 2>/dev/null"), "GUARD-REDIRECT-UNAPPROVED");
    // Changed by this fix: the parse-denied siblings, whose real fault is composition.
    for (const command of [
      "which a b c 2>/dev/null; which d",
      "which a b c 2>/dev/null && which d",
      "which a b c 2>NUL; which d",
    ]) {
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
      assert.equal(code(command), "GUARD-PARSE-UNSUPPORTED", command);
    }
    // A genuine cross-repository write is still refused as exactly that, parsed or not, and
    // a suppressor standing next to one does not launder it: each redirect is judged alone.
    for (const command of [
      "cp /etc/hosts /tmp/elsewhere/hosts",
      "printf implementation 2>/etc/passwd",
      "printf implementation > /tmp/elsewhere/out.txt; printf done",
      "printf implementation 2>/dev/null > /tmp/elsewhere/out.txt; printf done",
      "printf implementation 2>/dev/null > /tmp/elsewhere/out.txt",
    ]) {
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), true, command);
      assert.equal(code(command), "GUARD-CROSS-REPO-MUTATION", command);
    }
    // Narrowness of the exemption, pinned: descriptor 2 only, null device only. `&>` and a
    // bare `>` to the null device are NOT stderr suppression and keep their prior code.
    for (const command of [
      "which a b c &>/dev/null",
      "which a b c >/dev/null 2>&1",
    ]) {
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), true, command);
      assert.equal(code(command), "GUARD-CROSS-REPO-MUTATION", command);
    }
    // A redirect that writes a file is still refused, under whichever code the grammar
    // rules already give it -- "suppress stderr" did not become "redirects are fine".
    assert.equal(code("printf implementation > out.txt"), "GUARD-REDIRECT-UNAPPROVED");
    assert.equal(code("printf implementation >> out.txt"), "GUARD-PARSE-UNSUPPORTED");
    assert.equal(code("printf implementation 2> out.txt"), "GUARD-REDIRECT-UNAPPROVED");
    for (const command of [
      "printf implementation > out.txt",
      "printf implementation >> out.txt",
      "printf implementation 2> out.txt",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("partial PO authority rebind admits only the exact read-only planner", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const planner = `node '${PIPELINE_STATE_SCRIPT}' po-authority-rebind-plan`;
    const plannerWithArgument = `${planner} --unexpected`;
    const partialRebind = {
      schema: "pipeline.project-onboarding.v4",
      status: "partial",
      root: path,
      intent: "session",
      nextAction: null,
      diagnostics: [{ code: "po_authority_rebind_unavailable" }],
    };
    const denied = {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("partial"); },
      inspectProjectOnboardingV3Fn() { return partialRebind; },
    };
    assert.equal(isSanctionedLifecycleCommand(planner, path), false);
    assert.deepEqual(evaluateLifecycleReadyGuard(bash(planner), denied), { exitCode: 0, stderr: "" });
    assert.equal(evaluateLifecycleReadyGuard(bash(plannerWithArgument), denied).exitCode, 2);
    assert.equal(evaluateLifecycleReadyGuard(bash(`node '${PIPELINE_STATE_SCRIPT}' po-authority-rebind-apply --plan-sha256 ${"a".repeat(64)} --updated-at 2026-08-02T00:00:00.000Z --activate`), denied).exitCode, 0);
    assert.equal(evaluateLifecycleReadyGuard(bash(planner), {
      ...denied,
      inspectProjectOnboardingV3Fn() {
        return { ...partialRebind, diagnostics: [{ code: "continuity_damaged" }] };
      },
    }).exitCode, 2);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("non-ready cleanup recovery and privatization admit only exact closed argv", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const digest = "a".repeat(64);
    const commands = [
      `node '${SESSION_CLEANUP_SCRIPT}' start --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' status --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' plan-recovery --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' plan-human-recovery --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' plan-privatization --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' confirm-privatization --repo '${path}' --plan-sha256 ${digest} --accept`,
      `node '${SESSION_CLEANUP_SCRIPT}' release-binding --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-recovery --repo '${path}' --plan-sha256 ${digest} --activate`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-privatization --repo '${path}' --plan-sha256 ${digest} --activate`,
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
      `node '${SESSION_CLEANUP_SCRIPT}' plan-privatization --repo /tmp/other`,
      `node '${SESSION_CLEANUP_SCRIPT}' plan-human-recovery --repo /tmp/other`,
      `node '${SESSION_CLEANUP_SCRIPT}' plan-privatization --repo '${path}' --session-descriptor session-private`,
      `node '${SESSION_CLEANUP_SCRIPT}' plan-privatization --repo '${path}' --expected-descriptor-sha256 ${digest}`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-privatization --repo /tmp/other --plan-sha256 ${digest} --activate`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-privatization --repo '${path}' --plan-sha256 ${digest}`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-privatization --repo '${path}' --activate`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-privatization --repo '${path}' --plan-sha256 ${digest.toUpperCase()} --activate`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-privatization --repo '${path}' --plan-sha256 ${digest} --session-descriptor session-private --activate`,
      `node '${SESSION_CLEANUP_SCRIPT}' apply-privatization --repo '${path}' --plan-sha256 ${digest} --activate --bypass`,
      `node '${SESSION_CLEANUP_SCRIPT}' confirm-privatization --repo '${path}' --plan-sha256 ${digest}`,
      `node '${SESSION_CLEANUP_SCRIPT}' confirm-privatization --repo '${path}' --plan-sha256 ${digest} --activate`,
      `node '${SESSION_CLEANUP_SCRIPT}' confirm-privatization --repo /tmp/other --plan-sha256 ${digest} --accept`,
      `node '/tmp/other/scripts/session-cleanup.mjs' plan-privatization --repo '${path}'`,
      `node '${SESSION_CLEANUP_SCRIPT}' plan-privatization --repo '${path}' && touch bypass`,
      `node '${SESSION_CLEANUP_SCRIPT}' cleanup --repo '${path}' --session-descriptor ../foreign --expected-descriptor-sha256 ${digest}`,
      `node '${SESSION_CLEANUP_SCRIPT}' start --repo /tmp/other`,
      `node '${SESSION_CLEANUP_SCRIPT}' start --repo '${path}' --force`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
      }).exitCode, 2, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("partial lifecycle admits only exact rebase abort plus ordinary readback", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const command of ["git rebase --abort", `git -C '${path}' rebase --abort`]) {
      assert.equal(isNarrowRepositoryRecoveryCommand(command, path), true, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("partial"); },
      }).exitCode, 0, command);
    }
    for (const command of ["git status --short", "git diff --stat"]) {
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("partial"); },
      }).exitCode, 0, command);
    }
    for (const command of [
      "git rebase --continue",
      "git rebase --skip",
      "git rebase --abort --quiet",
      "git -C .. rebase --abort",
      "git rebase --abort && touch bypass",
    ]) {
      assert.equal(isNarrowRepositoryRecoveryCommand(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("partial"); },
      }).exitCode, 2, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("restart-required admits only the consumed bounded resume-hint input and capture", () => {
  const path = root();
  const inputPath = join(path, "project", ".resume-hint-input.json");
  const capture = `node '${RESUME_HINT_SCRIPT}' capture --root '${path}' --card-file '${inputPath}' --consume-card`;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const input of [bash(capture), edit("project/.resume-hint-input.json"), write("project/.resume-hint-input.json")]) {
      assert.equal(evaluateLifecycleReadyGuard(input, {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("restart-required"); },
      }).exitCode, 0, input.tool_name);
    }
    for (const [input, status] of [
      [bash(`${capture} --bypass`), "restart-required"],
      [bash(`node '${RESUME_HINT_SCRIPT}' capture --root '${path}' --card-file '${inputPath}'`), "restart-required"],
      [bash(`node '${RESUME_HINT_SCRIPT}' capture --root '${path}' --card-file '${join(path, "resume-card.json")}' --consume-card`), "restart-required"],
      [edit("project/resume-hint.json"), "restart-required"],
      [write("project/.resume-hint-input.json"), "partial"],
    ]) {
      assert.equal(evaluateLifecycleReadyGuard(input, {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny(status); },
      }).exitCode, 2, `${status}/${input.tool_name}`);
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
    assert.equal(isSanctionedLifecycleCommand(`${base} plan-reinstall --root ${path}`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`${base} apply-reinstall --root ${path} --plan-sha256 ${digest} --activate`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node ${SESSION_CAPABILITY_DIAGNOSE_SCRIPT} --repo ${path}`, path), true);
    for (const hostile of [
      `${base} plan-manifest-repair --root ${path} --activate`,
      `${base} apply-manifest-repair --root ${path} --plan-sha256 ${digest}`,
      `${base} apply-manifest-repair --root ${path}/.. --plan-sha256 ${digest} --activate`,
      `${base} apply-reinstall --root ${path} --plan-sha256 ${digest}`,
      `node ${SESSION_CAPABILITY_DIAGNOSE_SCRIPT} --repo /tmp/other`,
      `${base} plan-manifest-repair --root ${path}; touch ${path}/x`,
      `node ${join(path, "plugins/pipeline-core/scripts/project-onboarding-v3.mjs")} plan-manifest-repair --root ${path}`,
    ]) assert.equal(isSanctionedLifecycleCommand(hostile, path), false, hostile);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("main() reads --runner from its own argv and reaches the gate with codex even when CLAUDECODE=1 is present in its environment (regression pin for ready-gate-env-var-runner-authority)", () => {
  const path = root();
  const had = Object.prototype.hasOwnProperty.call(process.env, "CLAUDECODE");
  const previous = process.env.CLAUDECODE;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    // A Codex session spawned from inside a Claude Code Bash tool inherits
    // CLAUDECODE=1 in its ambient environment; this must not change which
    // runner's exemptions this invocation is admitted under.
    process.env.CLAUDECODE = "1";
    let seenRunner = null;
    const exitCode = main(JSON.stringify(edit()), {
      argv: ["--runner", "codex"],
      projectDir: path,
      requireProjectOnboardingReadyFn(options) {
        seenRunner = options.runner;
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
      writeErrorFn() {},
    });
    assert.equal(seenRunner, "codex");
    assert.equal(exitCode, 0);
  } finally {
    if (had) process.env.CLAUDECODE = previous; else delete process.env.CLAUDECODE;
    rmSync(path, { recursive: true, force: true });
  }
});

test("main() fails closed on an absent or invalid --runner without ever inspecting lifecycle readiness", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const argv of [[], ["--runner"], ["--runner", "claude-code"], ["--runner", ""], ["--runner", "windows"]]) {
      let calls = 0;
      const exitCode = main(JSON.stringify(edit()), {
        argv,
        projectDir: path,
        requireProjectOnboardingReadyFn() { calls += 1; },
        writeErrorFn() {},
      });
      assert.equal(exitCode, 2, JSON.stringify(argv));
      assert.equal(calls, 0, JSON.stringify(argv));
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------
// NOVA-LCR-HGO-1 (ADR-0059 Decision 3/4): the three closed-shell-grammar denials now
// always attempt the SAME generic, exact-command-bound Human-Guard-Override (HGO) route
// the sibling guards already use. These fixtures need a real Git repository (topology()
// requires one), unlike this file's other tests -- mirrors
// guard-testpath-override.test.mjs's `fixture()`/`arm()` and
// lib/human-guard-override.test.mjs's `fixtureSignature()`/`prepareSignedArming()`.

const HGO_PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HGO_OVERRIDE_SCRIPT = join(HGO_PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const hgoSigPair = generateKeyPairSync("ed25519");
const HGO_SIG_KEY_REFERENCE = "guard-lifecycle-ready-hgo-test-key";
const hgoSigPublicKey = hgoSigPair.publicKey.export({ type: "spki", format: "pem" });
const hgoSigPublicKeySha256 = createHash("sha256").update(hgoSigPublicKey).digest("hex");
// The two fixed, content-independent sentinel digests authorizeHumanGuardOverrideBySignature()
// itself names by exact source string -- reproduced independently, never imported, exactly
// as lib/human-guard-override.test.mjs's own copy does.
const HGO_SIGNATURE_INTENT_PLAN_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-plan.v1").digest("hex");
const HGO_SIGNATURE_INTENT_SPEC_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-spec.v1").digest("hex");

/** The exact denial reason text grammarOverrideRoute() builds for each grammar code. */
const HGO_GRAMMAR_REASON = {
  "GUARD-PARSE-UNSUPPORTED": "GUARD-PARSE-UNSUPPORTED: The command is outside the closed Pipeline shell grammar.",
  "GUARD-OPERATOR-UNAPPROVED": "GUARD-OPERATOR-UNAPPROVED: The command contains an unapproved shell operator.",
  "GUARD-REDIRECT-UNAPPROVED": "GUARD-REDIRECT-UNAPPROVED: The command contains an unapproved shell redirection.",
};

// NOVA-LCR-HGO-2: since a consumed grammar capability now falls through to the
// LAUNCH_SCRIPT/readiness tail (evaluateAfterGrammarAdmission()) instead of returning
// verdict(0) immediately, an "admitted all the way through" fixture must make that tail
// admit too. hgoGitFixture() below is a bare git repo with no onboarding scaffolding, so
// the exact V4 ready receipt is supplied directly via dependency injection rather than
// engineering a full onboarding-ready checkout.
const HGO_READY_RECEIPT = Object.freeze({
  schema: "pipeline.project-onboarding-ready-gate.v1",
  status: "ready",
  intent: "session",
});
function hgoReadyDeps() {
  return { requireProjectOnboardingReadyFn: () => ({ ...HGO_READY_RECEIPT }) };
}

/** `pipeline.user.yaml`, committed, decides the mode -- same "committed value wins" fixture shape as the sibling suites. */
function hgoGitFixture(mode) {
  const base = mkdtempSync(join(tmpdir(), "guard-lifecycle-hgo-"));
  spawnSync("git", ["init", "-q", "-b", "main", base], { encoding: "utf8" });
  spawnSync("git", ["-C", base, "config", "user.email", "fixture@example.invalid"], { encoding: "utf8" });
  spawnSync("git", ["-C", base, "config", "user.name", "fixture"], { encoding: "utf8" });
  writeFileSync(join(base, "pipeline.user.yaml"), `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${mode}"\n`);
  mkdirSync(join(base, "project"), { recursive: true });
  writeFileSync(join(base, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: HGO_SIG_KEY_REFERENCE, publicKeySha256: hgoSigPublicKeySha256 },
  }));
  spawnSync("git", ["-C", base, "add", "pipeline.user.yaml", "project/critical-human-proof.json"], { encoding: "utf8" });
  spawnSync("git", ["-C", base, "commit", "-qm", "fixture"], { encoding: "utf8" });
  return base;
}

/** Arms a real one-time capability via the chat-mode in-session path (denial -> plan -> prepare-authorization -> authorize --activate). */
function hgoArmByChat(root, toolInput, denials) {
  const shared = { rootDir: root, pluginRoot: HGO_PLUGIN_ROOT, scriptPath: HGO_OVERRIDE_SCRIPT };
  const recorded = recordHumanGuardDenial({ ...shared, toolName: "Bash", toolInput, denials });
  assert.equal(recorded.status, "planned", `denial not plannable: ${JSON.stringify(recorded)}`);
  const planned = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256 });
  const reason = "NOVA-LCR-HGO-1 fixture arming";
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256: recorded.requestSha256, planSha256: planned.planSha256, reason,
  });
  const armed = authorizeHumanGuardOverride({
    ...shared,
    requestSha256: recorded.requestSha256,
    planSha256: planned.planSha256,
    selectionSha256: prepared.selectionSha256,
    reason,
    reasonSha256: prepared.reasonSha256,
    activate: true,
  });
  assert.equal(armed.status, "armed", `chat arm failed: ${JSON.stringify(armed)}`);
}

/**
 * Arms a real one-time capability via a genuine detached Ed25519 proof (ADR-0059 Decision 1).
 * `toolName` defaults to "Bash" -- every pre-existing caller arms a command -- and is passed
 * explicitly by NOVA-XREPO-HGO-6, which arms an out-of-root Edit (ADR-0059 Decision 6's
 * "cross-repository-target" class is reached through a write target, not a command).
 */
function hgoArmBySignature(root, toolInput, denials, toolName = "Bash") {
  const shared = { rootDir: root, pluginRoot: HGO_PLUGIN_ROOT, scriptPath: HGO_OVERRIDE_SCRIPT };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials });
  assert.equal(recorded.status, "planned", `denial not plannable: ${JSON.stringify(recorded)}`);
  const planned = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256 });
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256: recorded.requestSha256, planSha256: planned.planSha256, reason: HGO_SIGNATURE_REASON,
  });
  const intent = createPoApprovalIntent({
    kind: "guard-override",
    featureId: "human-guard-override",
    planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256,
    specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
    candidate: { commit: planned.repository.head, tree: planned.repository.tree },
    policyRevision: "human-guard-override-signature-v1",
    subjectSha256: prepared.selectionSha256,
    decision: "authorize",
  });
  const proof = {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference: HGO_SIG_KEY_REFERENCE,
    publicKey: hgoSigPublicKey,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), hgoSigPair.privateKey).toString("base64"),
  };
  const armed = authorizeHumanGuardOverrideBySignature({
    rootDir: root,
    pluginRoot: HGO_PLUGIN_ROOT,
    requestSha256: recorded.requestSha256,
    planSha256: planned.planSha256,
    proof,
    scriptPath: HGO_OVERRIDE_SCRIPT,
  });
  assert.equal(armed.status, "armed", `signature arm failed: ${JSON.stringify(armed)}`);
}

test("NOVA-LCR-HGO-1: a chat-armed capability admits the exact denied grammar command, for all three codes", () => {
  const roots = [];
  try {
    const cases = [
      ["rg -n lifecycle . && touch output.txt", "GUARD-PARSE-UNSUPPORTED"],
      ["rg -n lifecycle . | tee output.txt", "GUARD-OPERATOR-UNAPPROVED"],
      ["rg -n lifecycle . > output.txt | head -n 20", "GUARD-REDIRECT-UNAPPROVED"],
    ];
    for (const [command, code] of cases) {
      const chatRoot = hgoGitFixture("chat");
      roots.push(chatRoot);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), { projectDir: chatRoot }).exitCode, 2, `precondition: ${command}`);
      const toolInput = { command };
      const denials = [{ guard: "guard-lifecycle-ready.mjs", reason: HGO_GRAMMAR_REASON[code] }];
      hgoArmByChat(chatRoot, toolInput, denials);
      const result = evaluateLifecycleReadyGuard(bash(command), { projectDir: chatRoot, ...hgoReadyDeps() });
      assert.equal(result.exitCode, 0, `chat-armed did not admit ${command}: ${result.stderr}`);
      assert.match(result.stderr, /\[pipeline-human-override\] guard-lifecycle-ready/u, command);
      assert.match(result.stderr, /capability consumed/u, command);
      // single-use: the same command is refused again
      const second = evaluateLifecycleReadyGuard(bash(command), { projectDir: chatRoot });
      assert.equal(second.exitCode, 2, `capability was reusable for ${command}`);
    }
  } finally { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); }
});

test("NOVA-LCR-HGO-1: a signature-armed capability admits the denied grammar command, regardless of the committed mode", () => {
  const roots = [];
  try {
    const command = "rg -n lifecycle . && touch output.txt";
    const toolInput = { command };
    const denials = [{ guard: "guard-lifecycle-ready.mjs", reason: HGO_GRAMMAR_REASON["GUARD-PARSE-UNSUPPORTED"] }];
    for (const mode of ["signature", "chat"]) {
      const sigRoot = hgoGitFixture(mode);
      roots.push(sigRoot);
      hgoArmBySignature(sigRoot, toolInput, denials);
      const result = evaluateLifecycleReadyGuard(bash(command), { projectDir: sigRoot, ...hgoReadyDeps() });
      assert.equal(result.exitCode, 0, `signature-armed did not admit under mode=${mode}: ${result.stderr}`);
      assert.match(result.stderr, /capability consumed/u, mode);
    }
  } finally { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); }
});

test("NOVA-LCR-HGO-1: with nothing armed, the grammar denial names the mode-appropriate next command (ADR-0059 Decision 4)", () => {
  const roots = [];
  try {
    const command = "rg -n lifecycle . && touch output.txt";

    const chatRoot = hgoGitFixture("chat");
    roots.push(chatRoot);
    const chatResult = evaluateLifecycleReadyGuard(bash(command), { projectDir: chatRoot });
    assert.equal(chatResult.exitCode, 2);
    assert.match(chatResult.stderr, /Human override available for this exact command/u);
    assert.match(chatResult.stderr, /guard-human-override\.mjs/u);
    assert.match(chatResult.stderr, /\bplan --repo\b/u);
    assert.match(chatResult.stderr, /prepare-authorization --repo/u);
    assert.match(chatResult.stderr, /\bauthorize --repo\b[^\n]*--activate/u);
    assert.doesNotMatch(chatResult.stderr, /authorize-by-signature/u);
    assert.doesNotMatch(chatResult.stderr, /capability consumed/u);

    const sigRoot = hgoGitFixture("signature");
    roots.push(sigRoot);
    const sigResult = evaluateLifecycleReadyGuard(bash(command), { projectDir: sigRoot });
    assert.equal(sigResult.exitCode, 2);
    assert.match(sigResult.stderr, /Human override available for this exact command/u);
    assert.match(sigResult.stderr, /\bplan --repo\b/u);
    assert.match(sigResult.stderr, /prepare-authorization --repo/u);
    assert.match(sigResult.stderr, /authorize-by-signature --repo/u);
    assert.doesNotMatch(sigResult.stderr, /--activate/u, "signature mode must not offer the in-session activate step");
  } finally { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); }
});

test("NOVA-LCR-HGO-1: an unusable override store leaves the plain grammar refusal exactly as it was", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n"); // no git repo at all
    const result = evaluateLifecycleReadyGuard(bash("rg -n lifecycle . && touch output.txt"), { projectDir: path });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /GUARD-PARSE-UNSUPPORTED/u);
    assert.doesNotMatch(result.stderr, /Human override available/u);
    assert.doesNotMatch(result.stderr, /guard-human-override\.mjs/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------
// NOVA-XREPO-HGO-1 (ADR-0059 Decision 6, 2026-08-08): the cross-repository half of the
// former NOVA-LCR-HGO-1 pin is INVERTED here, deliberately. That pin asserted
// "GUARD-CROSS-REPO-MUTATION and GUARD-LIFECYCLE-NOT-READY stay outside HGO (regression,
// ADR-0059 Decision 5)". Decision 6 reverses Decision 5 for the cross-repository class
// only -- "That is reversed. A cross-repository mutation is now liftable by a signed human
// override, through exactly the same always-attempt-consume-first mechanism every other
// liftable class uses." The pin was therefore encoding a decision that no longer holds, and
// its cross-repo half is rewritten as a positive assertion of the new contract. This is a
// contract correction under a superseding ADR, not a test bent to fit code: the
// GUARD-LIFECYCLE-NOT-READY half is kept, unchanged in force, in every test below.
//
// Measured boundary, pinned in NOVA-XREPO-HGO-6 rather than left as prose. This boundary
// MOVED in b108b3e, and the pin moved with it. Until then, HGO's own eligibility() refused
// ANY target outside the physical project root as HGO-NONOVERRIDABLE-CROSS-BOUNDARY, so no
// capability could be armed for one; NOVA-XREPO-HGO-6 pinned exactly that, as "refused, and
// told why no route exists". b108b3e closed that residual gap -- Decision 6's reversal is
// pointless if the class it makes liftable cannot be classified -- by adding the
// "cross-repository-target" eligible class. An out-of-root target is therefore now REFUSED
// BUT ROUTABLE, on explicitly narrowed terms: the plan carries a scopeAttestation naming
// what the override does NOT prove (the out-of-root target's identity, existence, git
// status, or freedom from a symlink swap), because HGO's physical-identity model cannot
// reach outside this repository's own root.
//
// What did NOT move, and is what NOVA-XREPO-HGO-6 now pins as the no-route half: a
// candidate that safePath() refuses for a reason OTHER than escaping root -- above all an
// in-root symlink escaping root, and any target matching the sensitive-path pattern -- is
// still HGO-NONOVERRIDABLE-CROSS-BOUNDARY, still unarmable, and still gets the typed
// "no route, and why" line rather than silence. crossBoundaryTarget() rescues a genuine
// cross-repository target, never an attack on the in-root symlink-safety walk.

/** Cross-repository denials whose tool input HGO can classify, so a capability can actually be armed. */
const XREPO_COMMAND = "codex plugin add pipeline-core@agent-pipeline-local";
const XREPO_OTHER_COMMAND = "codex plugin remove pipeline-core";
const XREPO_REASON = "GUARD-CROSS-REPO-MUTATION: A governed consumer session may write only inside its own physical project root.";
const xrepoDenials = () => [{ guard: "guard-lifecycle-ready.mjs", reason: XREPO_REASON }];

test("NOVA-XREPO-HGO-1: with nothing armed a cross-repo denial still refuses, and names the mode-appropriate next command", () => {
  const roots = [];
  try {
    const sigRoot = hgoGitFixture("signature");
    roots.push(sigRoot);
    const sig = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(sig.exitCode, 2, "an unarmed agent gained admission");
    assert.match(sig.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    assert.doesNotMatch(sig.stderr, /capability consumed/u);
    assert.match(sig.stderr, /Human override available for this exact command/u);
    assert.match(sig.stderr, /\bplan --repo\b/u);
    assert.match(sig.stderr, /prepare-authorization --repo/u);
    assert.match(sig.stderr, /authorize-by-signature --repo/u);
    assert.doesNotMatch(sig.stderr, /--activate/u, "signature mode must not offer the in-session activate step");

    const chatRoot = hgoGitFixture("chat");
    roots.push(chatRoot);
    const chat = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), { projectDir: chatRoot, ...hgoReadyDeps() });
    assert.equal(chat.exitCode, 2, "an unarmed agent gained admission");
    assert.match(chat.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    assert.match(chat.stderr, /\bauthorize --repo\b[^\n]*--activate/u);
    assert.doesNotMatch(chat.stderr, /authorize-by-signature/u);
  } finally { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); }
});

test("NOVA-XREPO-HGO-2: a signature-armed capability admits the exact cross-repo command, and only once", () => {
  const sigRoot = hgoGitFixture("signature");
  try {
    hgoArmBySignature(sigRoot, { command: XREPO_COMMAND }, xrepoDenials());
    const first = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(first.exitCode, 0, `signature-armed did not admit: ${first.stderr}`);
    assert.match(
      first.stderr,
      /\[pipeline-human-override\] guard-lifecycle-ready GUARD-CROSS-REPO-MUTATION: exact one-time capability consumed/u,
    );
    const second = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(second.exitCode, 2, "a consumed capability admitted a second run");
    assert.doesNotMatch(second.stderr, /capability consumed/u);
  } finally { rmSync(sigRoot, { recursive: true, force: true }); }
});

test("NOVA-XREPO-HGO-3: a chat-armed capability admits the exact cross-repo command in a chat-mode repository", () => {
  const chatRoot = hgoGitFixture("chat");
  try {
    hgoArmByChat(chatRoot, { command: XREPO_COMMAND }, xrepoDenials());
    const result = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), { projectDir: chatRoot, ...hgoReadyDeps() });
    assert.equal(result.exitCode, 0, `chat-armed did not admit: ${result.stderr}`);
    assert.match(result.stderr, /capability consumed/u);
  } finally { rmSync(chatRoot, { recursive: true, force: true }); }
});

test("NOVA-XREPO-HGO-4: a capability armed for a different command does not admit this one", () => {
  const sigRoot = hgoGitFixture("signature");
  try {
    hgoArmBySignature(sigRoot, { command: XREPO_OTHER_COMMAND }, xrepoDenials());
    const result = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(result.exitCode, 2, "a capability bound to another command admitted this one");
    assert.match(result.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    assert.doesNotMatch(result.stderr, /capability consumed/u);
    // The armed capability is untouched: it still admits exactly the command it was bound to.
    const bound = evaluateLifecycleReadyGuard(bash(XREPO_OTHER_COMMAND), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(bound.exitCode, 0, `the bound command was not admitted: ${bound.stderr}`);
  } finally { rmSync(sigRoot, { recursive: true, force: true }); }
});

test("NOVA-XREPO-HGO-5: GUARD-LIFECYCLE-NOT-READY is never liftable, armed capability or not", () => {
  const sigRoot = hgoGitFixture("signature");
  try {
    // No route is offered for a readiness denial at all.
    const plain = evaluateLifecycleReadyGuard(edit("docs/notes.md"), {
      projectDir: sigRoot,
      requireProjectOnboardingReadyFn() { deny("partial"); },
    });
    assert.equal(plain.exitCode, 2);
    assert.match(plain.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
    assert.doesNotMatch(plain.stderr, /Human override available/u);
    assert.doesNotMatch(plain.stderr, /guard-human-override\.mjs/u);
    assert.doesNotMatch(plain.stderr, /No human override route/u);

    // And a genuine, matching cross-repo capability does not buy past readiness either:
    // it clears the cross-repository objection only, is spent doing so, and says so.
    hgoArmBySignature(sigRoot, { command: XREPO_COMMAND }, xrepoDenials());
    const armed = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), {
      projectDir: sigRoot,
      requireProjectOnboardingReadyFn() { deny("partial"); },
    });
    assert.equal(armed.exitCode, 2, "an armed cross-repo capability bypassed the readiness gate");
    assert.match(armed.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
    assert.match(armed.stderr, /capability consumed/u, "a spent capability vanished silently");
    const second = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(second.exitCode, 2, "a downstream-refused capability was still reusable");
  } finally { rmSync(sigRoot, { recursive: true, force: true }); }
});

test("NOVA-XREPO-HGO-6: an out-of-root target is refused but routable on narrowed terms, while a still-unroutable one reports why instead of falling silent", () => {
  const sigRoot = hgoGitFixture("signature");
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-hgo-outside-"));
  try {
    const target = join(outside, "outside.mjs");

    // (a) Liftable is not the same as allowed: unarmed, the write is still refused.
    const unarmed = evaluateLifecycleReadyGuard(edit(target), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(unarmed.exitCode, 2, "an unarmed agent gained admission to an out-of-root target");
    assert.match(unarmed.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    assert.doesNotMatch(unarmed.stderr, /capability consumed/u);
    // ... and it now NAMES a route, where it previously reported that none existed.
    assert.match(unarmed.stderr, /Human override available for this exact write/u);
    assert.doesNotMatch(unarmed.stderr, /No human override route is offered/u);

    // (b) The route is classified into its own eligible class, and the record a human reads
    //     before signing states what this class cannot prove -- the honesty Decision 6 requires
    //     of it, asserted against the persisted plan rather than trusted as prose.
    const recorded = recordHumanGuardDenial({
      rootDir: sigRoot,
      pluginRoot: HGO_PLUGIN_ROOT,
      toolName: "Edit",
      toolInput: { file_path: target },
      denials: xrepoDenials(),
    });
    assert.equal(recorded.status, "planned", `an out-of-root target was not plannable: ${JSON.stringify(recorded)}`);
    const planned = planHumanGuardOverride({
      rootDir: sigRoot,
      pluginRoot: HGO_PLUGIN_ROOT,
      scriptPath: HGO_OVERRIDE_SCRIPT,
      requestSha256: recorded.requestSha256,
    });
    assert.equal(planned.commandClass, "cross-repository-target");
    const attestation = planned.preview.scopeAttestation;
    assert.equal(attestation.schema, "pipeline.human-guard-override-scope-attestation.v1");
    assert.ok(
      attestation.doesNotProve.some((entry) => /identity, existence, or git status of the out-of-root target/u.test(entry)),
      `the plan did not state that the out-of-root target's identity is unproven: ${JSON.stringify(attestation)}`,
    );
    assert.ok(
      attestation.doesNotProve.some((entry) => /symlink-safety walk/u.test(entry)),
      `the plan did not state that no symlink-safety walk runs out of root: ${JSON.stringify(attestation)}`,
    );

    // (c) A genuine signature-armed capability admits the exact out-of-root write, once.
    hgoArmBySignature(sigRoot, { file_path: target }, xrepoDenials(), "Edit");
    const armed = evaluateLifecycleReadyGuard(edit(target), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(armed.exitCode, 0, `a signature-armed out-of-root write was not admitted: ${armed.stderr}`);
    assert.match(armed.stderr, /GUARD-CROSS-REPO-MUTATION: exact one-time capability consumed/u);
    const replay = evaluateLifecycleReadyGuard(edit(target), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(replay.exitCode, 2, "a consumed capability admitted a second out-of-root write");
    assert.doesNotMatch(replay.stderr, /capability consumed/u);

    // (d) The no-route half, on the boundary that did NOT move: a sensitive out-of-root
    //     target is refused by crossBoundaryTarget()'s own hardBoundaryPath() check, so no
    //     capability can be armed for it -- and that refusal still says WHY, in typed
    //     tokens, rather than printing a bare denial.
    const sensitive = join(outside, "secrets.txt");
    const noRoute = evaluateLifecycleReadyGuard(edit(sensitive), { projectDir: sigRoot, ...hgoReadyDeps() });
    assert.equal(noRoute.exitCode, 2);
    assert.match(noRoute.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    assert.doesNotMatch(noRoute.stderr, /capability consumed/u);
    assert.doesNotMatch(noRoute.stderr, /Human override available/u);
    assert.match(noRoute.stderr, /No human override route is offered for this exact write/u);
    assert.match(
      noRoute.stderr,
      /Reason: the override planner returned status=external-operator-required, code=HGO-EXTERNAL-PROJECT-BOUNDARY \(/u,
    );
    const refused = recordHumanGuardDenial({
      rootDir: sigRoot,
      pluginRoot: HGO_PLUGIN_ROOT,
      toolName: "Edit",
      toolInput: { file_path: sensitive },
      denials: xrepoDenials(),
    });
    assert.equal(refused.status, "external-operator-required");
  } finally {
    rmSync(sigRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("NOVA-XREPO-HGO-7: the guard union's absolute prohibitions gain no admission path here", () => {
  const sigRoot = hgoGitFixture("signature");
  try {
    const prohibited = [
      "git push --force origin main",
      "git push --force-with-lease origin main",
      "git filter-branch --force",
      "git commit --no-verify -m fixture",
      "git branch -D main",
      "git tag -d v1.0.0",
    ];
    for (const command of prohibited) {
      // This guard is not the union's enforcer (plugins/pipeline-core/hooks/git-guard-union
      // is, and is untouched by this change) -- what is asserted here is that the change
      // introduced no override admission for these shapes: nothing is consumed, and nothing
      // offers to arm anything.
      const result = evaluateLifecycleReadyGuard(bash(command), { projectDir: sigRoot, ...hgoReadyDeps() });
      assert.doesNotMatch(result.stderr, /capability consumed/u, command);
      assert.doesNotMatch(result.stderr, /Human override available/u, command);
    }
    // A raw push is not even plannable as an override: HGO refuses to classify it.
    const recorded = recordHumanGuardDenial({
      rootDir: sigRoot,
      pluginRoot: HGO_PLUGIN_ROOT,
      toolName: "Bash",
      toolInput: { command: "git push --force origin main" },
      denials: xrepoDenials(),
    });
    assert.notEqual(recorded.status, "planned");
  } finally { rmSync(sigRoot, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------
// NOVA-LCR-HGO-2 (ADR-0059 Decision 5): a consumed grammar capability clears ONLY the
// shell-grammar objection -- every other check in evaluateLifecycleReadyGuard() still
// applies to the lifted command, in particular the LAUNCH_SCRIPT external-restart
// refusal and the GUARD-LIFECYCLE-NOT-READY onboarding-readiness gate, neither of which
// HGO is authorized to clear. Before this fix the guard returned verdict(0) the instant
// grammarOverrideRoute() reported a consumed capability (:1045/:1056), so
// `<otherwise-unliftable command> && true` turned an unliftable readiness denial into a
// liftable grammar one.
//
// Fixtures below deliberately combine an ABSOLUTE path with a RELATIVE one in the same
// command, carried inside a `--flag=value` token so HGO's own eligibility()
// (lib/human-guard-override.mjs, read-only to this dispatch) never has to resolve it as
// a bare path argument -- that classification is orthogonal to the control-flow fix
// under test here, and a `--flag=<path>` token is skipped by eligibility()'s absolute-
// path/protected-path checks (they only run for tokens not starting with "-").

test("NOVA-LCR-HGO-2: a consumed grammar capability admits the composed command only once the readiness tail also admits it", () => {
  const chatRoot = hgoGitFixture("chat");
  try {
    const absMarker = join(chatRoot, "abs-marker.txt");
    const command = `rg -n lifecycle --marker=${absMarker} relative-notes.txt | tee output.txt`;
    const toolInput = { command };
    const denials = [{ guard: "guard-lifecycle-ready.mjs", reason: HGO_GRAMMAR_REASON["GUARD-OPERATOR-UNAPPROVED"] }];
    hgoArmByChat(chatRoot, toolInput, denials);
    const result = evaluateLifecycleReadyGuard(bash(command), { projectDir: chatRoot, ...hgoReadyDeps() });
    assert.equal(result.exitCode, 0, `armed + ready did not admit: ${result.stderr}`);
    assert.match(
      result.stderr,
      /\[pipeline-human-override\] guard-lifecycle-ready GUARD-OPERATOR-UNAPPROVED: exact one-time capability consumed/u,
    );
  } finally { rmSync(chatRoot, { recursive: true, force: true }); }
});

test("NOVA-LCR-HGO-2: an armed matching capability does not bypass GUARD-LIFECYCLE-NOT-READY", () => {
  const chatRoot = hgoGitFixture("chat");
  try {
    const absMarker = join(chatRoot, "abs-marker-b.txt");
    const command = `rg -n readiness --marker=${absMarker} relative-notes-b.txt | tee output-b.txt`;
    const toolInput = { command };
    const denials = [{ guard: "guard-lifecycle-ready.mjs", reason: HGO_GRAMMAR_REASON["GUARD-OPERATOR-UNAPPROVED"] }];
    hgoArmByChat(chatRoot, toolInput, denials);
    const result = evaluateLifecycleReadyGuard(bash(command), {
      projectDir: chatRoot,
      requireProjectOnboardingReadyFn() { deny("partial"); },
    });
    assert.equal(result.exitCode, 2, `armed + not-ready wrongly admitted: ${result.stderr}`);
    assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
    // Design decision (NOVA-LCR-HGO-2): a capability consumed here and then refused
    // downstream stays spent (consumeHumanGuardOverride() already marked it "consumed"
    // on disk, irreversibly, before this denial was even constructed) -- but its
    // consumption must not vanish silently, so the audit line still surfaces here,
    // alongside the readiness refusal that actually decided the outcome.
    assert.match(
      result.stderr,
      /\[pipeline-human-override\] guard-lifecycle-ready GUARD-OPERATOR-UNAPPROVED: exact one-time capability consumed/u,
    );
    // Single-use: the spent capability is gone even though it was refused downstream --
    // it was never "returned" for being refused.
    const second = evaluateLifecycleReadyGuard(bash(command), { projectDir: chatRoot, ...hgoReadyDeps() });
    assert.equal(second.exitCode, 2, "a downstream-refused capability was still reusable");
    assert.doesNotMatch(second.stderr, /capability consumed/u);
  } finally { rmSync(chatRoot, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------
// NOVA-HGOSIG-ROUTE-1 (ADR-0059 Decision 4): a denial that cannot offer a route must say
// that it could not, and why. grammarOverrideRoute() used to set overrideGuidance only when
// recordHumanGuardDenial() answered `planned`, and wrapped the call in a bare
// `catch { /* no route offered */ }` -- so two paths printed a denial with no next step AND
// no word that a route had even been attempted, indistinguishable from a denial that was
// never eligible for one. That silence is the single outcome Decision 4's "every denial
// reports its next step" does not allow, and it was observed in the field, not theorised
// (a grammar denial against a path outside the repository root).
//
// The two outcomes are reported distinguishably, because they mean different things: a
// non-`planned` status is the route machinery ANSWERING ("not this way"), a throw is the
// route machinery being unable to answer at all.
//
// The originally observed fixture no longer reproduces, and the check was re-pointed rather
// than relaxed. b108b3e (ADR-0059 Decision 6) made a path outside the repository root an
// eligible "cross-repository-target", so the exact field case above now returns `planned`
// and prints a route -- it can no longer stand in for "planning answered, but not with a
// route". It is replaced below by a fixture that still genuinely produces a planner ANSWER,
// and deliberately by the one Decision 6 left untouched on purpose: an IN-ROOT symlink that
// escapes root. crossBoundaryTarget() rescues a genuine cross-repository target, never a
// candidate safePath() refused for failing its in-root symlink-safety walk, so that case is
// still HGO-NONOVERRIDABLE-CROSS-BOUNDARY and still yields exactly the status/code pair this
// check has always pinned. The property under test is unchanged: a refusal that cannot offer
// a route says so, and says why.
//
// What the reason may disclose is bounded by construction, not by care --
// humanGuardRouteUnavailableReason() in lib/human-guard-override.mjs renders a typed status
// and a typed code and nothing else. The tests below assert that bound positively (against
// injected hostile outcomes) rather than by listing forbidden strings.

const ROUTE_REASON_HEADLINE = "No human override route is offered for this exact command;";

/** The added block only: the headline through the end of the denial. */
function routeReasonBlock(stderr) {
  const index = stderr.indexOf(ROUTE_REASON_HEADLINE);
  assert.notEqual(index, -1, `no route-unavailable reason was printed:\n${stderr}`);
  return stderr.slice(index).trim();
}

/**
 * The disclosure bound. Stated positively: the whole added block is exactly two lines and
 * contains no path separator at all, so it cannot spell an absolute host path on either
 * platform, and cannot carry a stack frame (every frame carries one).
 */
function assertReasonDisclosesNothing(stderr, projectDir) {
  const block = routeReasonBlock(stderr);
  assert.equal(block.split("\n").length, 2, `the reason must be exactly two lines:\n${block}`);
  assert.doesNotMatch(block, /[\\/]/u, `the reason leaked a path separator:\n${block}`);
  assert.ok(!block.includes(projectDir), `the reason leaked the repository root:\n${block}`);
  assert.doesNotMatch(
    block,
    /\bat\s+\S+\s+\(|node:internal|\.mjs:\d+|Error:/u,
    `the reason leaked a stack frame or an exception message:\n${block}`,
  );
}

test("NOVA-HGOSIG-ROUTE-1: a grammar denial whose route planning throws prints a typed reason, not silence", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n"); // governed, but no git repository at all
    const result = evaluateLifecycleReadyGuard(bash("rg -n lifecycle . && touch output.txt"), { projectDir: path });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /GUARD-PARSE-UNSUPPORTED/u);
    // Names the observed failure, and says the planner FAILED rather than answered.
    assert.match(result.stderr, /Reason: planning the route failed with code=HGO-GIT\./u);
    assert.doesNotMatch(result.stderr, /the override planner returned status=/u);
    // ... and still offers no route, because there is none to offer.
    assert.doesNotMatch(result.stderr, /Human override available/u);
    assert.doesNotMatch(result.stderr, /guard-human-override\.mjs/u);
    assert.doesNotMatch(result.stderr, /--request-sha256/u);
    assertReasonDisclosesNothing(result.stderr, path);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("NOVA-HGOSIG-ROUTE-1: a grammar denial whose route planning returns a non-planned status reports that status", () => {
  const roots = [];
  try {
    const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-outside-"));
    roots.push(outside);

    // (a) A path that reaches outside the repository root through an IN-ROOT SYMLINK. HGO
    // classifies this as a project-boundary crossing and never plans it: safePath() refuses
    // it on its symlink-safety walk, and crossBoundaryTarget() does not rescue it, because
    // the candidate itself does not escape root -- only what it points at does. (The plain
    // out-of-root path this case used before b108b3e is now a plannable
    // "cross-repository-target"; NOVA-XREPO-HGO-6 pins that new contract.)
    const crossRoot = hgoGitFixture("signature");
    roots.push(crossRoot);
    symlinkSync(outside, join(crossRoot, "escape"), "dir");
    const cross = evaluateLifecycleReadyGuard(
      bash(`rg -n lifecycle ${join(crossRoot, "escape", "notes.txt")} | tee output.txt`),
      { projectDir: crossRoot },
    );
    assert.equal(cross.exitCode, 2);
    assert.match(cross.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
    assert.match(
      cross.stderr,
      /Reason: the override planner returned status=external-operator-required, code=HGO-EXTERNAL-PROJECT-BOUNDARY \(/u,
    );
    assert.doesNotMatch(cross.stderr, /planning the route failed/u,
      "a planner ANSWER must not be reported as a planner FAILURE");
    assert.doesNotMatch(cross.stderr, /Human override available/u);
    assert.doesNotMatch(cross.stderr, /--request-sha256/u);
    assertReasonDisclosesNothing(cross.stderr, crossRoot);

    // (b) A structurally different non-planned code from the same guard, so the assertion
    // above cannot pass merely because one fixture happens to produce one fixed string.
    const grammarRoot = hgoGitFixture("signature");
    roots.push(grammarRoot);
    const ineligible = evaluateLifecycleReadyGuard(
      bash("rg -n lifecycle . && touch sub/output.txt"),
      { projectDir: grammarRoot },
    );
    assert.equal(ineligible.exitCode, 2);
    assert.match(
      ineligible.stderr,
      /Reason: the override planner returned status=external-operator-required, code=HGO-EXTERNAL-ADAPTER-BOUNDARY \(/u,
    );
    assert.doesNotMatch(ineligible.stderr, /Human override available/u);
    assertReasonDisclosesNothing(ineligible.stderr, grammarRoot);

    // (c) A different non-planned STATUS, not merely a different code under the same one --
    // the check claims the guard reports whatever status planning returns, and (a) and (b)
    // both happen to be `external-operator-required`. A sensitive out-of-root target is
    // refused by crossBoundaryTarget()'s hardBoundaryPath() check and routed to a narrower
    // typed recovery instead, so it exercises the other status class end to end.
    const narrowerRoot = hgoGitFixture("signature");
    roots.push(narrowerRoot);
    const narrower = evaluateLifecycleReadyGuard(
      bash(`rg -n lifecycle ${join(outside, "secrets.txt")} | tee output.txt`),
      { projectDir: narrowerRoot },
    );
    assert.equal(narrower.exitCode, 2);
    assert.match(
      narrower.stderr,
      /Reason: the override planner returned status=narrower-recovery-required, code=HGO-NARROWER-WRITER-REQUIRED \(/u,
    );
    assert.doesNotMatch(narrower.stderr, /planning the route failed/u,
      "a planner ANSWER must not be reported as a planner FAILURE");
    assert.doesNotMatch(narrower.stderr, /Human override available/u);
    assertReasonDisclosesNothing(narrower.stderr, narrowerRoot);
  } finally { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); }
});

test("NOVA-HGOSIG-ROUTE-1: the printed reason is bounded to typed tokens, whatever planning returns or throws", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const command = "rg -n lifecycle . && touch output.txt";

    // A returned outcome carrying an untyped status, an untyped code, and the one field of
    // a real non-planned outcome that IS an absolute host path (`candidateSourceRoot`).
    const candidateSourceRoot = join(path, "plugins", "pipeline-core");
    const returned = evaluateLifecycleReadyGuard(bash(command), {
      projectDir: path,
      recordHumanGuardDenialFn: () => ({
        status: "/etc/passwd\nHuman override available for this exact command:",
        code: "HGO-LEAK/../secret",
        candidateSourceRoot,
        requestSha256: "a".repeat(64),
      }),
    });
    assert.equal(returned.exitCode, 2);
    assert.match(returned.stderr, /Reason: the override planner returned status=unrecognized, code=HGO-UNTYPED\./u);
    assert.doesNotMatch(returned.stderr, /etc.passwd/u);
    assert.doesNotMatch(returned.stderr, /Human override available/u);
    assert.doesNotMatch(returned.stderr, /--request-sha256/u);
    assert.ok(!returned.stderr.includes(candidateSourceRoot), "the reason leaked candidateSourceRoot");
    assertReasonDisclosesNothing(returned.stderr, path);

    // A throw whose message and stack carry a host path, and whose `code` is not a token.
    const thrown = evaluateLifecycleReadyGuard(bash(command), {
      projectDir: path,
      recordHumanGuardDenialFn: () => {
        const error = new Error(`ENOENT: no such file or directory, open '${join(path, "audit.key")}'`);
        error.code = "not a typed code";
        throw error;
      },
    });
    assert.equal(thrown.exitCode, 2);
    assert.match(thrown.stderr, /Reason: planning the route failed with code=HGO-UNTYPED\./u);
    assert.doesNotMatch(thrown.stderr, /ENOENT|no such file|audit\.key/u);
    assertReasonDisclosesNothing(thrown.stderr, path);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("NOVA-LCR-HGO-2: an armed matching capability for a command naming LAUNCH_SCRIPT still requires externalRestartOnly()", () => {
  const chatRoot = hgoGitFixture("chat");
  try {
    const command = `rg -n lifecycle --note=${ONBOARDING_LAUNCH_SCRIPT} relative-notes.txt | tee output.txt`;
    const toolInput = { command };
    const denials = [{ guard: "guard-lifecycle-ready.mjs", reason: HGO_GRAMMAR_REASON["GUARD-OPERATOR-UNAPPROVED"] }];
    hgoArmByChat(chatRoot, toolInput, denials);
    const result = evaluateLifecycleReadyGuard(bash(command), { projectDir: chatRoot, ...hgoReadyDeps() });
    assert.equal(result.exitCode, 2, `armed LAUNCH_SCRIPT command was wrongly admitted: ${result.stderr}`);
    assert.match(result.stderr, /EXTERNAL ACTION REQUIRED/u);
    assert.match(result.stderr, /restart-process is external-terminal\/user-copy-only/u);
    assert.match(
      result.stderr,
      /\[pipeline-human-override\] guard-lifecycle-ready GUARD-OPERATOR-UNAPPROVED: exact one-time capability consumed/u,
    );
  } finally { rmSync(chatRoot, { recursive: true, force: true }); }
});

// MEMPATH-1 (PO decision, 2026-08-08 -- backlog/items/2026-07-29-guard-lifecycle-ready-
// blocks-claude-memory-writes.md). Claude Code's own PreToolUse payload carries
// `transcript_path`; `dirname(transcript_path)/memory/` is admitted, and NOTHING else --
// never a `~/.claude/**` prefix, never a path the agent's own tool call or environment
// supplies. The readiness gate below it (evaluateAfterGrammarAdmission) is unaffected: an
// admitted memory write still needs an exact session-ready receipt like any other write.

test("MEMPATH-1: a governed session admits its own derived Claude memory directory, and only that directory", () => {
  const path = root();
  const { sessionDir, transcriptPath, memoryDir } = claudeMemorySessionFixture();
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const memoryFile = join(memoryDir, "learned-preferences.md");
    for (const build of [editWithTranscript, writeWithTranscript]) {
      assert.deepEqual(evaluateLifecycleReadyGuard(build(memoryFile, transcriptPath), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { return readiness; },
      }), { exitCode: 0, stderr: "" }, build.name);
    }
    assert.equal(isClaudeSessionMemoryWritePath(memoryFile, { transcript_path: transcriptPath }), true);
    assert.equal(claudeSessionMemoryDirectory({ transcript_path: transcriptPath }), realpathSync(memoryDir));
    // A relative file_path is never how Edit/Write actually calls this tool -- the CLI
    // always supplies an absolute path -- and the derivation refuses to guess through one.
    assert.equal(isClaudeSessionMemoryWritePath("learned-preferences.md", { transcript_path: transcriptPath }), false);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

test("MEMPATH-1: the derived memory admission still requires session readiness, not a substitute for it", () => {
  const path = root();
  const { sessionDir, transcriptPath, memoryDir } = claudeMemorySessionFixture();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const memoryFile = join(memoryDir, "learned-preferences.md");
    const result = evaluateLifecycleReadyGuard(editWithTranscript(memoryFile, transcriptPath), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("partial"); },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

test("MEMPATH-1: a symlink planted inside the derived memory directory cannot redirect a write outside it", () => {
  const path = root();
  const { sessionDir, transcriptPath, memoryDir } = claudeMemorySessionFixture();
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-memory-escape-"));
  let readinessCalls = 0;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    symlinkSync(outside, join(memoryDir, "escape"));
    const escapedTarget = join(memoryDir, "escape", "evil.md");
    assert.equal(isClaudeSessionMemoryWritePath(escapedTarget, { transcript_path: transcriptPath }), false);
    const result = evaluateLifecycleReadyGuard(editWithTranscript(escapedTarget, transcriptPath), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { readinessCalls += 1; return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" }; },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /only inside its own physical project root/u);
    assert.equal(readinessCalls, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("MEMPATH-1: an absent, empty, relative, or not-yet-materialized transcript_path fails closed rather than guessing", () => {
  const notCreated = mkdtempSync(join(tmpdir(), "guard-lifecycle-claude-session-uncreated-"));
  const arbitraryAbsoluteTarget = join(tmpdir(), "guard-lifecycle-mempath-unrelated-notes.md");
  try {
    const cases = [
      { label: "absent field", input: {} },
      { label: "empty string", input: { transcript_path: "" } },
      { label: "relative path", input: { transcript_path: "relative/session/abc.jsonl" } },
      { label: "session directory exists but memory/ was never created", input: { transcript_path: join(notCreated, "abc.jsonl") } },
      { label: "session directory itself does not exist", input: { transcript_path: join(notCreated, "does-not-exist", "abc.jsonl") } },
      { label: "null byte", input: { transcript_path: `${join(notCreated, "abc")}\0.jsonl` } },
    ];
    for (const { label, input } of cases) {
      assert.equal(claudeSessionMemoryDirectory(input), null, label);
      assert.equal(isClaudeSessionMemoryWritePath(arbitraryAbsoluteTarget, input), false, label);
    }
  } finally { rmSync(notCreated, { recursive: true, force: true }); }
});

test("MEMPATH-1: a not-yet-materialized memory directory is refused end to end by the guard, not just by the helper", () => {
  const path = root();
  const notCreated = mkdtempSync(join(tmpdir(), "guard-lifecycle-claude-session-uncreated-"));
  const transcriptPath = join(notCreated, "abc.jsonl");
  let readinessCalls = 0;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const target = join(notCreated, "memory", "learned-preferences.md");
    const result = evaluateLifecycleReadyGuard(editWithTranscript(target, transcriptPath), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { readinessCalls += 1; return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" }; },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /only inside its own physical project root/u);
    assert.equal(readinessCalls, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(notCreated, { recursive: true, force: true });
  }
});

test("MEMPATH-1: every other standard-Claude-path shape stays refused -- settings, agents, plugins, marketplace, another repository, and a merely-similarly-named directory", () => {
  const path = root();
  // A synthetic home layout standing in for `~/.claude/**` and the marketplace beside it --
  // never the real `$HOME`, and this session's OWN derived memory directory sits inside it
  // too, exactly as it does on a real machine, so the containment check is exercised against
  // realistic siblings rather than an isolated fixture.
  const home = mkdtempSync(join(tmpdir(), "guard-lifecycle-synthetic-home-"));
  const sessionDir = join(home, ".claude", "projects", "-synthetic-project");
  mkdirSync(join(sessionDir, "memory"), { recursive: true });
  const transcriptPath = join(sessionDir, "9f86d081-884c-4d30-8c19-ffcaa4c07bd1.jsonl");
  mkdirSync(join(home, ".claude", "agents"), { recursive: true });
  mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
  mkdirSync(join(home, "agent-pipeline-local-marketplace", "plugins", "pipeline-core"), { recursive: true });
  writeFileSync(join(home, ".claude", "settings.json"), "{}\n");
  const otherRepo = mkdtempSync(join(tmpdir(), "guard-lifecycle-other-repo-"));
  // A second, differently-hashed project directory whose OWN memory dir merely shares the
  // leaf name "memory" with the derived one -- the exact "contains the segment but is not
  // the derived directory" case the DoD names.
  const otherProjectMemory = join(home, ".claude", "projects", "-synthetic-other-project", "memory");
  mkdirSync(otherProjectMemory, { recursive: true });
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const targets = [
      ["settings.json", join(home, ".claude", "settings.json")],
      ["agents/", join(home, ".claude", "agents", "malicious.toml")],
      ["plugins/", join(home, ".claude", "plugins", "malicious.json")],
      ["local marketplace directory", join(home, "agent-pipeline-local-marketplace", "plugins", "pipeline-core", "marketplace.json")],
      ["another repository", join(otherRepo, "src", "file.mjs")],
      ["sibling dir merely named similarly", join(sessionDir, "memory-lookalike", "note.md")],
      ["a different project's own memory directory", join(otherProjectMemory, "note.md")],
    ];
    for (const [label, target] of targets) {
      assert.equal(isClaudeSessionMemoryWritePath(target, { transcript_path: transcriptPath }), false, label);
      let readinessCalls = 0;
      const result = evaluateLifecycleReadyGuard(editWithTranscript(target, transcriptPath), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { readinessCalls += 1; return readiness; },
      });
      assert.equal(result.exitCode, 2, label);
      assert.match(result.stderr, /only inside its own physical project root/u, label);
      assert.equal(readinessCalls, 0, label);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(otherRepo, { recursive: true, force: true });
  }
});

// MACHPATH-1 (specs/sprint-nova-epic/plans/nova-setup-bootstrap.md SS6a, "Where the machine
// plane lives", PO decision 2026-08-08). The second write surface this guard admits outside
// the project root: exactly one file, `<homedir>/.agent-pipeline/machine.json`, derived only
// from an injected `homedirFn` -- never tool_input, never process.env, never repository
// config. Fixtures below stand in for the home directory under the repository's own
// gitignored scratch/ tree (machinePlaneHomeFixture()), never system tmpdir and never the
// real $HOME, per the briefing's field-4 constraint.

test("MACHPATH-1: a governed session admits the exact machine-plane file, for every write-capable tool", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const build of [edit, write, notebookEdit]) {
      assert.deepEqual(evaluateLifecycleReadyGuard(build(target), {
        projectDir: path,
        homedirFn: () => home,
        requireProjectOnboardingReadyFn() { return readiness; },
      }), { exitCode: 0, stderr: "" }, build.name);
    }
    assert.equal(isMachinePlaneWritePath(target, { homedirFn: () => home }), true);
    assert.equal(machinePlaneFilePath({ homedirFn: () => home }), target);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("MACHPATH-1: nothing else under the derived home directory is admitted -- the directory itself, a sibling, a nested file, a similarly-named neighbour, and a bare-home file", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  const agentPipelineDir = dirname(target);
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const targets = [
      ["the .agent-pipeline directory itself", agentPipelineDir],
      ["sibling file", join(agentPipelineDir, "other.json")],
      ["deeper nested file", join(agentPipelineDir, "sub", "machine.json")],
      ["similarly-named neighbour directory", join(home, ".agent-pipeline-backup", "machine.json")],
      ["bare home directory file", join(home, "machine.json")],
    ];
    for (const [label, candidate] of targets) {
      assert.equal(isMachinePlaneWritePath(candidate, { homedirFn: () => home }), false, label);
      let readinessCalls = 0;
      const result = evaluateLifecycleReadyGuard(edit(candidate), {
        projectDir: path,
        homedirFn: () => home,
        requireProjectOnboardingReadyFn() { readinessCalls += 1; return readiness; },
      });
      assert.equal(result.exitCode, 2, label);
      assert.match(result.stderr, /only inside its own physical project root/u, label);
      assert.equal(readinessCalls, 0, label);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("MACHPATH-1: a lexical escape through the derived file path is refused", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  const escapeTarget = `${target}/../../.claude/settings.json`;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    assert.equal(isMachinePlaneWritePath(escapeTarget, { homedirFn: () => home }), false);
    let readinessCalls = 0;
    const result = evaluateLifecycleReadyGuard(edit(escapeTarget), {
      projectDir: path,
      homedirFn: () => home,
      requireProjectOnboardingReadyFn() {
        readinessCalls += 1;
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /only inside its own physical project root/u);
    assert.equal(readinessCalls, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("MACHPATH-1: a symlinked .agent-pipeline ancestor cannot redirect the write outside the derived home directory", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  const outside = mkdtempSync(join(SCRATCH_ROOT, "guard-lifecycle-machine-escape-"));
  let readinessCalls = 0;
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    symlinkSync(outside, dirname(target));
    assert.equal(isMachinePlaneWritePath(target, { homedirFn: () => home }), false);
    const result = evaluateLifecycleReadyGuard(edit(target), {
      projectDir: path,
      homedirFn: () => home,
      requireProjectOnboardingReadyFn() {
        readinessCalls += 1;
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /only inside its own physical project root/u);
    assert.equal(readinessCalls, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("MACHPATH-1: an absent, empty, relative, or unresolvable home directory fails closed rather than guessing", () => {
  const arbitraryAbsoluteTarget = join(SCRATCH_ROOT, "guard-lifecycle-machine-unrelated-notes.md");
  const cases = [
    { label: "homedirFn returns undefined", homedirFn: () => undefined },
    { label: "homedirFn returns empty string", homedirFn: () => "" },
    { label: "homedirFn returns a relative path", homedirFn: () => "relative/home" },
    { label: "homedirFn throws", homedirFn: () => { throw new Error("no home"); } },
    // A value that does not itself exist on disk is equally unusable -- fails closed rather
    // than admitting a guessed, never-realpathed anchor.
    {
      label: "homedirFn names a directory that does not exist",
      homedirFn: () => join(SCRATCH_ROOT, "guard-lifecycle-machine-home-does-not-exist"),
    },
  ];
  for (const { label, homedirFn } of cases) {
    assert.equal(machinePlaneFilePath({ homedirFn }), null, label);
    assert.equal(isMachinePlaneWritePath(arbitraryAbsoluteTarget, { homedirFn }), false, label);
  }
});

test("MACHPATH-1: the machine-plane admission still requires session readiness, not a substitute for it", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const result = evaluateLifecycleReadyGuard(edit(target), {
      projectDir: path,
      homedirFn: () => home,
      requireProjectOnboardingReadyFn() { deny("partial"); },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("MACHPATH-1: the shell lane stays unchanged -- a Bash write to the same machine-plane path is still refused as a cross-repository mutation, with the same code as before this change", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const command = `touch ${target}`;
    assert.equal(isForbiddenCrossRepositoryMutation(command, path), true);
    let readinessCalls = 0;
    const result = evaluateLifecycleReadyGuard(bash(command), {
      projectDir: path,
      homedirFn: () => home,
      requireProjectOnboardingReadyFn() {
        readinessCalls += 1;
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    assert.match(result.stderr, /only inside its own physical project root/u);
    assert.equal(readinessCalls, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
