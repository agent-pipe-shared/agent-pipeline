#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
// NVA-INTAKEARGV-1: the guidance renderer comes from the lib module that now owns the shape
// table; the table and argv emitter keep arriving through the CLI seam below, unchanged.
import { mutatingApplyCommandHint } from "../lib/onboarding-argv-shapes.mjs";
import {
  ADMITTED_GRAMMAR_SHAPES,
  BASE_GOVERNANCE_MARKERS,
  claudeSessionMemoryDirectory,
  evaluateLifecycleReadyGuard,
  gateStrengthShellNeedleFor,
  governanceMarkers,
  isClaudeSessionMemoryWritePath,
  isForbiddenCrossRepositoryMutation,
  isMachinePlaneWritePath,
  isMeaningfulGateStrengthShellNeedle,
  isNarrowRepositoryRecoveryCommand,
  isProjectWritePath,
  isReadOnlyDiagnosticCommand,
  isRestartResumeHintInputWrite,
  isSanctionedGhReadOnlyDiagnostic,
  isSanctionedLifecycleCommand,
  isSanctionedStartPreflightInvocation,
  machinePlaneFilePath,
  main,
  MANIFEST_FAILURE_WARNING,
  retryActionsForDeniedCommand,
} from "./guard-lifecycle-ready.mjs";
// NVA-STARNEEDLE-1 AC-3: imported straight from the module the shell lane itself imports
// (GATE_STRENGTH_PATHS), never restated here as a copy or a fixed count -- the same
// single-source discipline TPSHELL-5 pins for its own protected-test-path table.
import { GATE_STRENGTH_PATHS } from "./guard-gate-strength.mjs";
// AC-10: imported straight from the library module the guard now defers to, never
// through the guard's own re-export, so this test cannot pass merely because both
// names happen to reference the identical function object.
import { MACHINE_PLANE_SCHEMA, machinePlaneFilePath as libMachinePlaneFilePath, writeMachinePlane } from "../lib/machine-plane.mjs";
// NVA-GF-COPYSAFE: imported straight from the shared renderer module the guard now defers
// to (never through the guard's own re-export), so the byte-identity test below cannot pass
// merely because both names happen to reference the identical function object.
import { boundedOpaqueCopyCommand } from "../lib/copy-safe-command.mjs";
import {
  isBoundedReadOnlyPipeline,
  parseGuardCommand,
} from "./guard-command-grammar.mjs";
// GUARDDERIVE-1: imported straight from the onboarding CLI the guard defers to, never
// restated here -- the whole point of the change is that one table is the single source.
import {
  automatedLifecycleArgvCommands,
  automatedMutatingApplyArgv,
  MUTATING_ONBOARDING_ARGV_SHAPES,
  ONBOARDING_SUBCOMMANDS,
} from "../scripts/project-onboarding-v3.mjs";
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
// TPSHELL-*: the shell lane of the test-path authority gate. Imported from the library the
// guard defers to, for the same reason AC-10 states above -- and because the write lane
// (guard-testpath.mjs) reads the identical exports, which is the property TPSHELL-5 pins.
import {
  loadProtectedTestPathRules,
  protectedTestPathBasenameNeedles,
  protectedTestPathShellHit,
  resolveGuardConfigPath,
  TESTPATH_SHELL_DENIAL_CODE,
} from "../lib/protected-test-paths.mjs";
// DEVPLANSHELL-*: the shell lane of the Dev-Plan lifecycle gate. Imported from the library
// the guard defers to, for the same reason AC-10/TPSHELL-* state above -- and because the
// write lane (guard-devplan.mjs) reads the identical `devPlanGateVerdict()`, so the two
// lanes can never independently decide a path's dev-plan-gate fate differently from
// each other.
import { DEFAULT_EXEMPT_PREFIXES, DEVPLAN_SHELL_DENIAL_CODE } from "../lib/guard-devplan-policy.mjs";

const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const ONBOARDING_LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const V3_BOOTSTRAP_AUTHORITY_SCRIPT = fileURLToPath(new URL("../scripts/v3-bootstrap-authority.mjs", import.meta.url));
const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-start-preflight.mjs", import.meta.url));
const REPAIR_MAP_SCRIPT = fileURLToPath(new URL("../scripts/repair-map.mjs", import.meta.url));
const SCRIPTS_DIR = fileURLToPath(new URL("../scripts/", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const SESSION_CAPABILITY_DIAGNOSE_SCRIPT = fileURLToPath(new URL("../scripts/session-capability-diagnose.mjs", import.meta.url));
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const PO_PROFILE_REPAIR_SCRIPT = fileURLToPath(new URL("../scripts/po-gate-profile-repair.mjs", import.meta.url));
const PROJECT_AUTHORITY_MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/project-authority-migration.mjs", import.meta.url));
// NVA-VERIFYGREEN-1: sanctionedMigrationArgs()'s own script -- distinct from
// PROJECT_AUTHORITY_MIGRATION_SCRIPT just above, which is project-authority-migration.mjs and is
// gated by a different guard function (sanctionedProjectAuthorityMigrationArgs()). This is the
// runner-profile-migration-v3.mjs the MIGRATION_SCRIPT constant in guard-lifecycle-ready.mjs
// resolves to; the test file previously had zero coverage of this script's admission branch.
const RUNNER_PROFILE_MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
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

test("ungoverned write tools require one session consent record, while Bash and missing sessions fail open", () => {
  for (const toolName of ["Edit", "Write", "NotebookEdit"]) {
    const path = root();
    try {
      const input = toolName === "NotebookEdit"
        ? { tool_name: toolName, session_id: "session-positive", tool_input: { notebook_path: "src/game.ipynb" } }
        : { tool_name: toolName, session_id: "session-positive", tool_input: { file_path: "src/game.js" } };
      const blocked = evaluateLifecycleReadyGuard(input, { projectDir: path });
      assert.equal(blocked.exitCode, 2, toolName);
      assert.match(blocked.stderr, /GUARD-ONBOARDING-CONSENT-REQUIRED/u, toolName);
      assert.match(blocked.stderr, /onboarding-consent-mark\.mjs.*record/u, toolName);
      assert.match(blocked.stderr, /retry the identical/u, toolName);

      writeFileSync(join(path, ".claude", ".pipeline-install-consent-session-positive.json"), "{}\n");
      assert.deepEqual(evaluateLifecycleReadyGuard(input, { projectDir: path }), { exitCode: 0, stderr: "" });
    } finally { rmSync(path, { recursive: true, force: true }); }
  }

  const noSessionPath = root();
  const bashPath = root();
  try {
    assert.deepEqual(evaluateLifecycleReadyGuard(edit(), { projectDir: noSessionPath }), { exitCode: 0, stderr: "" });
    assert.deepEqual(evaluateLifecycleReadyGuard(bash("printf unchanged"), { projectDir: bashPath }), { exitCode: 0, stderr: "" });
  } finally {
    rmSync(noSessionPath, { recursive: true, force: true });
    rmSync(bashPath, { recursive: true, force: true });
  }
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

// NOVA-GOVMARKERS-WIRING: governanceMarkers() itself -- the direct unit-level fail-open
// contract, independent of whichever call site consumes it. Regression pin for the wiring
// bug where evaluateLifecycleReadyGuard's sole runtime call site read the pre-rename
// `GOVERNANCE_MARKERS` identifier, which governanceMarkers()'s introduction had removed --
// a ReferenceError on every invocation, silently caught by the surrounding try/catch and
// turned into blocked() (GUARD-LIFECYCLE-NOT-READY): the OPPOSITE of the fail-open contract
// asserted here (backlog/items/2026-08-07-module-scope-manifest-read-rearms-the-disarm-by-
// config-fault.md).
test("governanceMarkers() fails open to the fixed base markers, with an explicit warning, when the runtime-projection loader throws", () => {
  const result = governanceMarkers({
    loadRuntimeProjectionV3OwnedKeysFn() {
      throw new Error("config/runtime-projection-v3-owned-keys.json unreadable");
    },
  });
  assert.deepEqual(result, { markers: BASE_GOVERNANCE_MARKERS, warning: MANIFEST_FAILURE_WARNING });
});

test("governanceMarkers() returns the real runtime-projection-derived markers, with no warning, when the loader succeeds", () => {
  const result = governanceMarkers({
    loadRuntimeProjectionV3OwnedKeysFn() {
      return { targets: [{ path: ".codex/config.toml" }, { path: "pipeline.user.yaml" }] };
    },
  });
  assert.equal(result.warning, null);
  // Fixed base markers are always present, deduplicated against any runtime-projection overlap.
  for (const marker of BASE_GOVERNANCE_MARKERS) assert.ok(result.markers.includes(marker), marker);
  assert.ok(result.markers.includes(".codex/config.toml"));
  assert.equal(result.markers.filter((marker) => marker === "pipeline.user.yaml").length, 1);
});

test("evaluateLifecycleReadyGuard threads its own dependencies into governanceMarkers() and stays fail-open, not fail-closed, on a throwing loader", () => {
  const path = root();
  let calls = 0;
  try {
    // A BASE_GOVERNANCE_MARKERS marker is present, so `governed` must resolve true purely
    // from the fixed base list even though the injected runtime-projection loader throws.
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const result = evaluateLifecycleReadyGuard(edit(), {
      projectDir: path,
      loadRuntimeProjectionV3OwnedKeysFn() {
        throw new Error("config/runtime-projection-v3-owned-keys.json unreadable");
      },
      requireProjectOnboardingReadyFn() {
        calls += 1;
        deny();
      },
    });
    // The pre-fix bug never reached this call: the stale `GOVERNANCE_MARKERS` identifier
    // threw a ReferenceError caught by the outer try/catch, returning blocked() immediately.
    assert.equal(calls, 1);
    assert.equal(result.exitCode, 2);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("evaluateLifecycleReadyGuard stays admit-open on a throwing loader when no governance marker at all is present", () => {
  const path = root();
  let calls = 0;
  try {
    const result = evaluateLifecycleReadyGuard(edit(), {
      projectDir: path,
      loadRuntimeProjectionV3OwnedKeysFn() {
        throw new Error("config/runtime-projection-v3-owned-keys.json unreadable");
      },
      requireProjectOnboardingReadyFn() { calls += 1; },
    });
    assert.deepEqual(result, { exitCode: 0, stderr: "" });
    assert.equal(calls, 0);
  } finally { rmSync(path, { recursive: true, force: true }); }
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

// backlog: permitted-edit-drops-session-into-unrecoverable-readiness. Writes the exact
// live-binding shape `boundAuthorityDocumentPath()` reads: `continuity.authority.prd/.spec`
// on Pipeline State, mirroring what `establishedContinuity`/`normalizedContinuity`
// (onboarding-continuity.mjs) actually set -- the same live binding that module's own
// 2026-08-09 resolution note names as authoritative over the private promotion history.
function withContinuityAuthority(path, {
  prdPath = "specs/2026-08-18-demo/prd_demo.md",
  specPath = "specs/2026-08-18-demo/spec.md",
  planInvalidation,
} = {}) {
  const state = {
    schema: "pipeline.state.v0",
    continuity: {
      authority: {
        prd: { path: prdPath },
        spec: { path: specPath },
      },
    },
  };
  if (planInvalidation !== undefined) state.planInvalidation = planInvalidation;
  writeFileSync(join(path, ".claude", "pipeline-state.json"), JSON.stringify(state));
  return { prdPath, specPath, designInputPath: join(dirname(specPath), "design-input.md") };
}

function readyStub() {
  return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
}

test("writes to the currently bound PRD, Spec, or design input are blocked even when session readiness is exact, and name the rebind route", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const { prdPath, specPath, designInputPath } = withContinuityAuthority(path);
    for (const filePath of [prdPath, specPath, designInputPath]) {
      const result = evaluateLifecycleReadyGuard(edit(filePath), {
        projectDir: path,
        requireProjectOnboardingReadyFn: readyStub,
      });
      assert.equal(result.exitCode, 2, filePath);
      assert.match(result.stderr, /BLOCKED \(guard-lifecycle-ready/u, filePath);
      assert.match(result.stderr, /GUARD-LIFECYCLE-AUTHORITY-BOUND/u, filePath);
      assert.match(result.stderr, /currently bound authority/u, filePath);
      assert.match(result.stderr, new RegExp(`File: ${filePath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"), filePath);
      assert.match(result.stderr, /reopen-design --by <name>/u, filePath);
      assert.match(result.stderr, /submit-plan --by <name>/u, filePath);
      assert.match(result.stderr, /approve-plan --by <name>/u, filePath);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("Write and NotebookEdit are refused for a bound authority document exactly like Edit", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const { specPath } = withContinuityAuthority(path);
    for (const call of [write(specPath), notebookEdit(specPath)]) {
      const result = evaluateLifecycleReadyGuard(call, {
        projectDir: path,
        requireProjectOnboardingReadyFn: readyStub,
      });
      assert.equal(result.exitCode, 2, call.tool_name);
      assert.match(result.stderr, /GUARD-LIFECYCLE-AUTHORITY-BOUND/u, call.tool_name);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("a reopened design (planInvalidation recorded) releases the authority-document write refusal", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const { specPath, prdPath, designInputPath } = withContinuityAuthority(path, {
      planInvalidation: { invalidatedAt: "2026-08-18T00:00:00.000Z", invalidatedBy: "PO" },
    });
    let readinessCalls = 0;
    for (const filePath of [prdPath, specPath, designInputPath]) {
      const result = evaluateLifecycleReadyGuard(edit(filePath), {
        projectDir: path,
        requireProjectOnboardingReadyFn() {
          readinessCalls += 1;
          return readyStub();
        },
      });
      assert.equal(result.exitCode, 0, filePath);
    }
    assert.equal(readinessCalls, 3);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("a file beside the bound documents is not blocked by the authority-document refusal", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    withContinuityAuthority(path);
    const result = evaluateLifecycleReadyGuard(edit("specs/2026-08-18-demo/README.md"), {
      projectDir: path,
      requireProjectOnboardingReadyFn: readyStub,
    });
    assert.equal(result.exitCode, 0);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("an absent, malformed, or authority-less Pipeline State is not treated as a bound authority document", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const target = edit("specs/2026-08-18-demo/prd_demo.md");

    // No .claude/pipeline-state.json at all yet.
    let result = evaluateLifecycleReadyGuard(target, {
      projectDir: path,
      requireProjectOnboardingReadyFn: readyStub,
    });
    assert.equal(result.exitCode, 0, "absent state");

    // Present but unparseable.
    writeFileSync(join(path, ".claude", "pipeline-state.json"), "not json");
    result = evaluateLifecycleReadyGuard(target, {
      projectDir: path,
      requireProjectOnboardingReadyFn: readyStub,
    });
    assert.equal(result.exitCode, 0, "malformed state");

    // Present, valid, but carrying no continuity.authority (pre-kickoff/pristine).
    writeFileSync(join(path, ".claude", "pipeline-state.json"), JSON.stringify({ schema: "pipeline.state.v0" }));
    result = evaluateLifecycleReadyGuard(target, {
      projectDir: path,
      requireProjectOnboardingReadyFn: readyStub,
    });
    assert.equal(result.exitCode, 0, "no continuity.authority");
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

test("a host-temp-style scratchpad path is refused exactly like any other cross-repo target, and ADR-0059 documents that consequence", () => {
  // Regression for backlog/items/2026-08-07-session-scratchpad-is-unwritable-under-the-cross-repo-guard.md:
  // the guard was already refusing a host-temp session scratchpad (proven below via tmpdir()),
  // but ADR-0059 (the ADR that governs this guard's liftability) never said so anywhere -- an
  // agent reading the ADR alone would not learn that "cross-repository" also covers its own
  // assigned host-temp scratchpad. This pins both halves so neither can silently regress.
  const path = root();
  const hostTempScratch = mkdtempSync(join(tmpdir(), "guard-lifecycle-host-scratch-"));
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    assert.equal(isProjectWritePath(join(hostTempScratch, "note.txt"), path), false);
    const result = evaluateLifecycleReadyGuard(edit(join(hostTempScratch, "note.txt")), {
      projectDir: path,
      requireProjectOnboardingReadyFn() {
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /GUARD-CROSS-REPO-MUTATION/u);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(hostTempScratch, { recursive: true, force: true });
  }

  const adrPath = fileURLToPath(new URL("../../../docs/adr/0059-signed-human-guard-override.md", import.meta.url));
  const adrText = readFileSync(adrPath, "utf8");
  assert.match(
    adrText,
    /host-temp session scratchpad/u,
    "ADR-0059 must document that GUARD-CROSS-REPO-MUTATION also blocks the host-temp session scratchpad, not merely another repository (Proposal point 4 of the session-scratchpad backlog item)",
  );
  assert.match(
    adrText,
    /session-scratchpad-is-unwritable-under-the-cross-repo-guard/u,
    "ADR-0059's clarification must cross-reference the backlog item it was recorded for",
  );
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

// 2026-08-07-lifecycle-guard-does-not-know-the-human-signing-commands.md: the guard's
// isHumanPoSigningCommand() list named only three of the six human-terminal signing
// subcommands (setup, approve, approve-all), missing approve-critical, authorize-critical and
// sign-intent -- the three added after the list was first written. This regression test proves
// those three newly-recognized commands are now classified as external-signing-only, matching
// the already-covered setup/approve/approve-all behaviour.
test("newly-recognized human-signing commands (approve-critical, authorize-critical, sign-intent) stay external", () => {
  const path = root();
  const external = mkdtempSync(join(tmpdir(), "guard-lifecycle-po-signing-"));
  const readiness = {
    schema: "pipeline.project-onboarding-ready-gate.v1",
    status: "ready",
    intent: "session",
  };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const command of [
      `node ${PO_HUMAN_APPROVAL_SCRIPT} approve-critical --repo-root ${path} --directory ${external} --kind push`,
      `node ${PO_HUMAN_APPROVAL_SCRIPT} authorize-critical --repo-root ${path} --directory ${external} --feature-id cyb-4 --plan plan.md --spec spec.md --kind push --subject-sha256 ${"a".repeat(64)} --expires-at 2026-08-21T00:00:00Z`,
      `node ${PO_HUMAN_APPROVAL_SCRIPT} sign-intent --repo-root ${path} --directory ${external} --intent-sha256 ${"b".repeat(64)}`,
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

// GF-078 bug 3: isForbiddenCrossRepositoryMutation()'s blanket `poApprovalArgs(...) !== null`
// branch fired for ANY po-approval-gate.mjs invocation outside the narrow
// isAgentPoPublicCommand shapes -- including a bare, argument-free --help/--version, which
// cannot mutate anything, in this repository or any other. Only that one exact, argument-free
// shape is admitted; every other subcommand or argument combination (including --help
// alongside something else) still hits the same blanket refusal as before, unchanged.
test("po-approval-gate --help and --version are read-only, never a forbidden cross-repository mutation", () => {
  const path = root();
  const readiness = {
    schema: "pipeline.project-onboarding-ready-gate.v1",
    status: "ready",
    intent: "session",
  };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const command of [
      `node ${PO_APPROVAL_GATE_SCRIPT} --help`,
      `node ${PO_APPROVAL_GATE_SCRIPT} --version`,
    ]) {
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { return readiness; },
      }), { exitCode: 0, stderr: "" }, command);
    }
    for (const command of [
      `node ${PO_APPROVAL_GATE_SCRIPT} --help extra`,
      `node ${PO_APPROVAL_GATE_SCRIPT} prepare --help`,
      `node ${PO_APPROVAL_GATE_SCRIPT} --help --version`,
    ]) {
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), true, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
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
      // C3 (AC-1): several read-only path arguments, each subject to the
      // identical containment check the single-path form already applies.
      "sha256sum specs/hotfix.md pipeline.user.yaml",
      "sha256sum -- specs/hotfix.md pipeline.user.yaml harness/scripts/verify.mjs",
      "shasum -a 256 specs/hotfix.md",
      "shasum --algorithm 256 specs/hotfix.md",
      "shasum -a 256 specs/hotfix.md pipeline.user.yaml",
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
      "sha256sum -c specs/hotfix.md",
      "shasum -a 1 specs/hotfix.md",
      // C3 (AC-3): a flag-looking argument, a path escaping the project root,
      // and a mixed list where only one entry escapes are each still refused
      // -- a widened form must not admit a list because most of it is fine.
      "sha256sum specs/hotfix.md --check",
      "sha256sum specs/hotfix.md ../../outside.md",
      "sha256sum -- specs/hotfix.md ../../outside.md",
      "shasum -a 256 specs/hotfix.md ../../outside.md",
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

// backlog: 2026-08-17-command-grammar-guesses-shell-dialect-from-host-os-not-the-actual-
// tool-shell.md. Claude's Bash tool always runs through Git-Bash/POSIX, never natively
// through cmd.exe/PowerShell, even on a Windows host -- so guard-lifecycle-ready.mjs's own
// un-optioned parseGuardCommand() call sites must select the POSIX dialect (and therefore
// expand `$PWD`/`${PWD}`) regardless of what `process.platform` reports. `process.platform`
// is forced to "win32" for the duration of each assertion below (restored in `finally`,
// mirroring lib/po-gate-profile-publisher.test.mjs) precisely to prove that: this is the
// actual reported regression (a real Windows-host session), not merely a hypothetical.
test("Claude/Bash-path command parsing ignores a win32 host: $PWD expands and POSIX grammar governs", () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  const path = root();
  try {
    // retryActionsForDeniedCommand() (guard-lifecycle-ready.mjs) exposes the parsed argv
    // directly: a bare `$PWD` token must resolve to the guard's own root, not survive as the
    // literal 4-character string "$PWD" -- the exact silent-failure shape the backlog item
    // reports (docs' own `--root "$PWD"` recovery commands).
    assert.deepEqual(retryActionsForDeniedCommand(`pwd -P; sha256sum "$PWD"`, path), [
      {
        executable: "pwd",
        argv: ["-P"],
        mutation: false,
        requiresConfirmation: false,
        executionBoundary: "separate-tool-call",
        expected: { exitCodes: [0, 1] },
      },
      {
        executable: "sha256sum",
        argv: [path],
        mutation: false,
        requiresConfirmation: false,
        executionBoundary: "separate-tool-call",
        expected: { exitCodes: [0, 1] },
      },
    ]);

    // The main Bash grammar gate (evaluateLifecycleReadyGuard) must keep applying POSIX
    // expansion rules too: a non-`$PWD` variable reference is refused with
    // GUARD-PARSE-UNSUPPORTED under the POSIX dialect (parseGuardCommand()'s own closed
    // grammar only ever substitutes the literal `$PWD`/`${PWD}` token, denying every other
    // `$`-expansion). Under the windows-direct dialect this bug selects from a bare win32
    // host, `$` is never treated as an expansion trigger at all, so the same command would
    // parse as an ordinary (wrong) literal argument instead of being denied -- this
    // assertion would not hold without the fix.
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const result = evaluateLifecycleReadyGuard(bash('echo "$FOO"'), { projectDir: path });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /GUARD-PARSE-UNSUPPORTED/u);

    // Named follow-on effect 1 (Proposal): the bounded rg/head diagnostic pipeline's
    // `.exe`-naming exception is untouched by this fix -- it is selected by dialectFor()'s
    // own CONTENT-based heuristic (a literal `.exe`-suffixed executable in the command
    // text), not by the platform argument this fix hardcodes, so it still fires correctly
    // through this same patched call site (isReadOnlyDiagnosticCommand) even though the
    // platform value it now passes is never "win32".
    assert.equal(
      isReadOnlyDiagnosticCommand("rg.exe -n lifecycle . 2>NUL | head.exe -n 20", path),
      true,
    );
    // Named follow-on effect 2 (Proposal): `2>/dev/null` on the ordinary (non-`.exe`) POSIX
    // shape -- the shape Claude's actual Git-Bash-run commands use -- keeps working
    // identically through the same patched call site.
    assert.equal(
      isReadOnlyDiagnosticCommand("rg -n lifecycle . 2>/dev/null | head -n 20", path),
      true,
    );
  } finally {
    Object.defineProperty(process, "platform", originalPlatform);
    rmSync(path, { recursive: true, force: true });
  }
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
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), false, command);
    }
    // NVA-I-GRAMMAR: `rg -n lifecycle . && head -n 20` used to be refused here -- not because
    // either side was unsafe, but because the OLD &&-chain admission only ever recognized a
    // small named allowlist, not the general read-only-diagnostic classifier. Both segments
    // are independently admitted simple commands (bare `head -n N` with no path argument is
    // already unconditionally admitted, isReadOnlySimpleWords above), so under the union rule
    // (isBoundedReadOnlyAndChain, DoD 3) this is now correctly admitted -- no new authority,
    // since each side is already independently callable as its own tool call.
    assert.equal(isReadOnlyDiagnosticCommand("rg -n lifecycle . && head -n 20", path), true);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// GF-078 bug 2 (root scope). Every single, non-piped read-only command
// isReadOnlyDiagnosticCommand admits elsewhere in this file (rg, grep, cat, head, tail, wc,
// stat, file) carries NO path restriction at all -- a single `rg pattern <plugin-install-path>`
// self-inspection read was already unconditionally admitted before this fix. Only the
// IDENTICAL read piped through a second rg or head was refused, purely for being a pipeline,
// because isBoundedReadOnlyPipeline only ever knew the project root. This pins that the
// plugin's own installed root (this file's own resolved location) is now a second approved
// root for exactly that bounded pipeline shape -- narrower than the single-command allowance
// above, never wider -- while the underlying grammar function's own two-argument, project-
// root-only default stays byte-identical (asserted directly against guard-command-grammar.mjs).
test("bounded rg pipeline admits self-inspection reads of the plugin's own installed root", () => {
  const path = root();
  const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
  const hooksDir = join(pluginRoot, "hooks");
  const grammarFile = join(hooksDir, "guard-command-grammar.mjs");
  try {
    for (const command of [
      `rg --files ${hooksDir} | rg 'guard-lifecycle-ready'`,
      `rg -n "isBoundedReadOnlyPipeline" ${grammarFile} | head -n 5`,
    ]) {
      const parsed = parseGuardCommand(command, path);
      assert.equal(isBoundedReadOnlyPipeline(parsed, path), false, `${command} (grammar default stays project-root-only)`);
      assert.equal(isReadOnlyDiagnosticCommand(command, path), true, command);
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
      }).exitCode, 0, command);
    }
    const foreign = mkdtempSync(join(tmpdir(), "guard-lifecycle-foreign-"));
    try {
      const command = `rg --files ${foreign} | rg 'x'`;
      assert.equal(isReadOnlyDiagnosticCommand(command, path), false, command);
    } finally { rmSync(foreign, { recursive: true, force: true }); }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// GF-078 bug 2 (head -N sub-finding). Only the two-token `head -n 40` form was accepted;
// the combined single-flag `head -40` form an agent naturally reaches for was refused for
// no bound-related reason. Same canonical numeric range, both forms.
test("bounded rg-to-head pipeline accepts both head -n N and combined head -N", () => {
  const path = root();
  try {
    for (const command of ["rg -n lifecycle . | head -40", "rg -n lifecycle . | head -500"]) {
      const parsed = parseGuardCommand(command, path);
      assert.equal(isBoundedReadOnlyPipeline(parsed, path), true, command);
    }
    for (const command of [
      "rg -n lifecycle . | head -0",
      "rg -n lifecycle . | head -501",
      "rg -n lifecycle . | head -0500",
    ]) {
      const parsed = parseGuardCommand(command, path);
      assert.equal(isBoundedReadOnlyPipeline(parsed, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-CATPIPE-1. Measured 2026-08-27: `cat <repo-file> | grep -c open` was refused
// GUARD-OPERATOR-UNAPPROVED in this repository while the identical grep-sourced pipeline
// (`grep -c open <repo-file> | head -n 1`) was admitted -- the only difference was `cat`
// versus `grep` as the pipeline's first segment. Pins the exact live shape admitted.
test("NVA-CATPIPE-1: cat-sourced bounded pipeline -- single-path grep and head sinks are admitted, the exact live GUARD-OPERATOR-UNAPPROVED refusal", () => {
  const path = root();
  try {
    writeFileSync(join(path, "notes.txt"), "keep this open line\nother line\n");
    for (const command of ["cat notes.txt | grep open", "cat notes.txt | head -n 20"]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), true, command);
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
      }), { exitCode: 0, stderr: "" });
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-CATPIPE-1. The multi-path form the live Antigravity refusal actually used:
// `cat .claude/pipeline.yaml .claude/pipeline.json .claude/settings.json | grep -E '...'`.
test("NVA-CATPIPE-1: a multi-path cat source piped into grep -E is admitted -- the exact live multi-file refusal shape", () => {
  const path = root();
  try {
    writeFileSync(join(path, "a.txt"), "alpha\n");
    writeFileSync(join(path, "b.txt"), "bravo\n");
    writeFileSync(join(path, "c.txt"), "charlie\n");
    const command = "cat a.txt b.txt c.txt | grep -E 'alpha|bravo'";
    assert.equal(isReadOnlyDiagnosticCommand(command, path), true, command);
    assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
    assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
    }), { exitCode: 0, stderr: "" });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-CATPIPE-1. Measured 2026-08-27 in a different governed repository: an Antigravity
// session was refused twice with GUARD-GATE-STRENGTH-SHELL for a `cat ... | grep -E ...`
// pipeline naming .claude/pipeline.yaml/.claude/pipeline.json/.claude/settings.json, and
// separately for one naming pipeline.user.yaml -- even though that refusal's own text
// claims cat reads are admitted (true only for the single-command form until now). Both
// directions, matching GSSHELL-STAGE-1's own discipline: a genuine WRITE shape naming these
// same paths must stay refused, proving the fixture is live rather than the assertions
// passing vacuously.
test("NVA-CATPIPE-1: a cat pipeline naming a gate-strength file is classified as a read, never GUARD-GATE-STRENGTH-SHELL", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
    writeFileSync(join(path, ".claude", "pipeline.yaml"), "schema: pipeline.yaml.v1\n");
    const run = (command) => evaluateLifecycleReadyGuard(bash(command), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
    });
    assert.match(run("sed -i s/a/b/ pipeline.user.yaml").stderr, /GUARD-GATE-STRENGTH-SHELL/u,
      "fixture check: the rule must actually be active here");
    for (const command of [
      "cat pipeline.user.yaml | grep push_approval",
      "cat pipeline.user.yaml | head -n 5",
      "cat .claude/pipeline.yaml pipeline.user.yaml | grep -E 'push_approval|routing'",
    ]) {
      const result = run(command);
      assert.doesNotMatch(result.stderr, /GUARD-GATE-STRENGTH-SHELL/u, command);
      assert.deepEqual(result, { exitCode: 0, stderr: "" }, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-CATPIPE-1. Exactness: the same closed bounds isBoundedGrepPipeline already enforces
// (project-root-only read, exactly two segments, sink is grep or head only, canonical
// 1..500 head count, only the 2>/dev/null redirect) all apply identically to the cat source.
test("NVA-CATPIPE-1: exactness -- outside-root path, a third segment, a non-grep/head sink, an out-of-range head count, and a non-null-device redirect all stay refused", () => {
  const path = root();
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-catpipe-outside-"));
  try {
    writeFileSync(join(path, "notes.txt"), "keep this open line\n");
    writeFileSync(join(outside, "secret.txt"), "outside\n");
    for (const command of [
      `cat ${join(outside, "secret.txt")} | grep open`,
      "cat notes.txt | grep open | wc -l",
      "cat notes.txt | wc -l",
      "cat notes.txt | head -n 0",
      "cat notes.txt | head -n 501",
      "cat notes.txt > output.txt | head -n 5",
      "cat notes.txt 2>diagnostic.log | head -n 5",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), false, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// NVA-CATPIPE-1. CAT_PIPELINE_DISPLAY_FLAGS is a deliberate allowlist, not a denylist (unlike
// grep's argv rule): a recognised display-only flag is admitted, an unrecognised one fails
// closed rather than being silently ignored.
test("NVA-CATPIPE-1: a recognised display-only cat flag is admitted, an unrecognised flag fails closed", () => {
  const path = root();
  try {
    writeFileSync(join(path, "notes.txt"), "keep this open line\n");
    for (const command of [
      "cat -n notes.txt | grep open",
      "cat -A notes.txt | head -n 5",
      "cat --number notes.txt | grep open",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), true, command);
    }
    for (const command of [
      "cat -w notes.txt | grep open",
      "cat --unsafe-flag notes.txt | grep open",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// backlog/items/2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md
test("the &&-chain union (read-only classifier plus the small always-safe-write allowlist) and trailing 2>/dev/null admit exactly the backlog's triggering shapes, widened per NVA-I-GRAMMAR, and nothing more", () => {
  const path = root();
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-and-chain-outside-"));
  try {
    for (const command of [
      'git rev-parse HEAD && git log --oneline -5 && echo "---status---" && git status --porcelain',
      "mkdir -p scratch/probe && ls -la scratch/probe",
      'grep -rl "pattern" backlog/items/ 2>/dev/null',
      "git status && git log -n 10 --oneline",
      "git rev-parse HEAD && git log --max-count=3",
      'git rev-parse HEAD && grep -rl "pattern" backlog/items/ | head -n 5',
      'git status && grep -n "pattern" plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs | grep -v "test"',
      // NVA-I-GRAMMAR (DoD 3): position no longer matters -- a bounded pipeline segment that
      // is independently admitted as a standalone command is now admitted in ANY chain
      // position, not only trailing, per the "no new authority" argument (each side is
      // already separately callable). Previously refused as "non-trailing pipe fails closed".
      'grep -rl "pattern" backlog/items/ | head -n 5 && git status',
      // NVA-I-GRAMMAR (DoD 3): `git log --all` is unconditionally admitted as a STANDALONE
      // command (isReadOnlySimpleWords's git branch admits `log` with any args -- it is
      // already read-only regardless of flags), so under the union rule it is also admitted
      // as a chain segment. The OLD chain-only GIT_LOG_CHAIN_ALLOWED_FLAGS restriction was
      // stricter than the single-command rule for no reason the union principle preserves;
      // this widening grants no new authority, since `git log --all` was always independently
      // reachable as its own tool call. Previously refused as a "disclosed exclusion".
      "git log --all && git status",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), true, command);
      assert.equal(isForbiddenCrossRepositoryMutation(command, path), false, command);
    }
    assert.deepEqual(evaluateLifecycleReadyGuard(
      bash('git rev-parse HEAD && git log --oneline -5 && echo "---status---" && git status --porcelain'),
      { projectDir: path, requireProjectOnboardingReadyFn() { deny("repository-control-path-invalid"); } },
    ), { exitCode: 0, stderr: "" });

    for (const command of [
      // (a) an allowlisted command name chained with a mutating/cross-reaching one.
      "git log && rm -rf /tmp/x",
      "git status && git push",
      // (b) mkdir -p targeting a path outside the permitted-write predicate.
      `mkdir -p ${outside} && ls -la ${outside}`,
      // (c) a trailing 2>/dev/null on a command that is not independently read-only.
      "rm -rf /tmp/x 2>/dev/null",
      // (d) a chain longer than the chosen bound, or an operator this design never admits.
      "echo 1 && echo 2 && echo 3 && echo 4 && echo 5 && echo 6 && echo 7",
      "git status ; git log",
      "git status || git log",
      // Trailing pipe where source is not grep (git log | head -n 5) fails closed
      "git rev-parse HEAD && git log --oneline -5 | head -n 5",
      // Trailing pipe where sink is neither grep nor head fails closed
      'git rev-parse HEAD && grep -rl "pattern" backlog/items/ | cat',
      // Disclosed exclusion: a git global -c flag is never a subcommand match, so the
      // segment fails the read-only classifier and the chain fails closed by construction.
      "git -c core.pager=evil log && git status",
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(command, path), false, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// backlog/items/2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md
// Critic finding F2 (rework round against commit b3153385): the test above uses an
// UNGOVERNED root (root() writes no BASE_GOVERNANCE_MARKERS file), so
// evaluateLifecycleReadyGuard's own `if (!governed) return verdict(0);` short-circuits
// before ever reaching the mkdir-chain admission logic the test above claims to prove --
// the requireProjectOnboardingReadyFn mock it injects at line ~699 is dead code, and F1's
// bug (isChainEligibleSegment admitting ANY in-repo mkdir -p target) shipped underneath a
// passing suite. This test uses a genuinely GOVERNED root (a real marker file on disk) with
// requireProjectOnboardingReadyFn mocked not-ready, and proves both directions of the
// narrowed mkdir predicate (F1): the scratch/ target stays admitted; an arbitrary in-repo
// path outside scratch/ or .claude/worktrees/ (guardrails/, the Critic's own live-proved
// bypass target) is now refused.
//
// Neither direction ever calls requireProjectOnboardingReadyFn, and both assert that
// explicitly rather than leaving it unobserved: the admitted scratch/ chain is classified
// read-only-diagnostic and short-circuits to verdict(0) BEFORE evaluateAfterGrammarAdmission
// (the onboarding-readiness check) is reached -- the same early-exit shape the "non-ready
// governed roots retain a narrow simple-command read-only diagnostic lane" test above
// already establishes for other read-only shapes. The refused guardrails/ chain is refused
// at the closed-grammar layer itself: guard-command-grammar.mjs's tokenizer unconditionally
// rejects any top-level `&&` as a CONTROL operator (parseStatus "denied"), so a chain that
// isReadOnlyDiagnosticCommand no longer admits is refused as GUARD-PARSE-UNSUPPORTED before
// onboarding-readiness is ever consulted either -- refused unconditionally, which is at
// least as strong a guarantee as "refused only while not yet onboarding-ready" would have
// been. Documented here rather than assumed: this is a stronger, not weaker, proof than a
// literal onboarding-readiness-mock-invocation would have given.
test("the narrowed mkdir chain predicate (F1) still admits scratch/ and refuses an arbitrary in-repo path on a genuinely governed, not-yet-ready root", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");

    const admitted = "mkdir -p scratch/probe && ls -la scratch/probe";
    assert.equal(isReadOnlyDiagnosticCommand(admitted, path), true, admitted);
    let admittedCalls = 0;
    assert.deepEqual(evaluateLifecycleReadyGuard(bash(admitted), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { admittedCalls += 1; deny("partial"); },
    }), { exitCode: 0, stderr: "" });
    assert.equal(admittedCalls, 0,
      "scratch/ chain must short-circuit before onboarding-readiness is ever consulted");

    const worktree = "mkdir -p .claude/worktrees/probe && ls -la .claude/worktrees/probe";
    assert.equal(isReadOnlyDiagnosticCommand(worktree, path), true, worktree);

    const refused = "mkdir -p guardrails/critic-probe && ls -la guardrails/critic-probe";
    assert.equal(isReadOnlyDiagnosticCommand(refused, path), false, refused);
    let refusedCalls = 0;
    const result = evaluateLifecycleReadyGuard(bash(refused), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { refusedCalls += 1; deny("partial"); },
    });
    assert.equal(result.exitCode, 2, refused);
    assert.match(result.stderr, /GUARD-PARSE-UNSUPPORTED/u, refused);
    assert.equal(refusedCalls, 0,
      "the arbitrary in-repo path must be refused at the closed-grammar layer, "
        + "never reaching onboarding-readiness");

    // The Critic's own live reproduction shape, DoD check 1: refused end to end.
    const reproduction = "git rev-parse HEAD && mkdir -p guardrails/critic-probe";
    assert.equal(isReadOnlyDiagnosticCommand(reproduction, path), false, reproduction);
    const reproductionResult = evaluateLifecycleReadyGuard(bash(reproduction), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("partial"); },
    });
    assert.equal(reproductionResult.exitCode, 2, reproduction);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
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
      // NVA-I-GRAMMAR DoD 5: the refusal states the COMPLETE admitted grammar with bounds and
      // exact spellings, not just the shape names -- pinned property-style, against the
      // guard's own ADMITTED_GRAMMAR_SHAPES table, in the dedicated test below.
      assert.match(result.stderr, /The complete admitted grammar, with bounds and exact spellings:/u, command);
      assert.match(result.stderr, /N in 1\.\.500/u, command);
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

test("GRAMMARHINT-1 AC-1: the rejected element is named from what the parser already determined", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");

    // Operator: parsed.operators[0] already carries the exact token -- pure read, no re-derivation.
    const operator = evaluateLifecycleReadyGuard(bash("rg -n lifecycle . | tee output.txt"), { projectDir: path });
    assert.equal(operator.exitCode, 2);
    assert.match(operator.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
    assert.match(operator.stderr, /Rejected element: the operator "\|"\./u);

    // Redirect: parsed.redirects[0] carries the token; the target path itself must never appear (AC-5).
    const redirect = evaluateLifecycleReadyGuard(
      bash("rg -n lifecycle . > output.txt | head -n 20"), { projectDir: path },
    );
    assert.equal(redirect.exitCode, 2);
    assert.match(redirect.stderr, /GUARD-REDIRECT-UNAPPROVED/u);
    assert.match(redirect.stderr, /Rejected element: the redirect operator ">"\./u);
    assert.doesNotMatch(redirect.stderr, /Rejected element:[^\n]*output\.txt/u);

    // Newline: the one control-character case mirrored from parseGuardCommand()'s own
    // unconditional first-line gate -- the exact GRAMMARHINT-1 regression.
    const newline = evaluateLifecycleReadyGuard(bash('git commit -m "line one\n\nline two"'), { projectDir: path });
    assert.equal(newline.exitCode, 2);
    assert.match(newline.stderr, /GUARD-PARSE-UNSUPPORTED/u);
    assert.match(newline.stderr, /Rejected element: a newline character inside the command text\./u);

    // Composed with && (also GUARD-PARSE-UNSUPPORTED, no raw control character): denied()
    // itself does not preserve which of its several rejection paths fired, but NVA-I-GRAMMAR
    // DoD 4 closes this specific gap WITHOUT touching guard-command-grammar.mjs --
    // rejectedAndChainSegment() independently re-splits the well-formed &&-chain (this file's
    // own quote-aware splitTopLevelAndChain) and names the FIRST segment that fails the exact
    // union isBoundedReadOnlyAndChain itself applies: "touch output.txt" is not read-only and
    // not on the always-safe-write allowlist, so it is named as segment 2 of 2.
    const composed = evaluateLifecycleReadyGuard(bash("rg -n lifecycle . && touch output.txt"), { projectDir: path });
    assert.equal(composed.exitCode, 2);
    assert.match(composed.stderr, /GUARD-PARSE-UNSUPPORTED/u);
    assert.match(
      composed.stderr,
      /Rejected element: "&&"-chain segment 2 of 2 \("touch output\.txt"\) is not independently admitted/u,
    );
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("GRAMMARHINT-1 AC-2 / AC-047-140: a git commit -m value with an embedded newline yields no typed action", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const command = 'git commit -m "line one\n\nline two"';
    // GUARDFIX-2: this test used to require a `git commit -F` action carrying mutation:true.
    // The expectation was itself the defect -- AC-047-140 admits only independently admitted
    // read-only diagnostics into the envelope. The remediation did not disappear; it moved to
    // the message text, pinned by the GUARDFIX-2 test below. What AC-2 still pins here is that
    // a quoted newline is normalized into nothing runnable at all.
    assert.deepEqual(retryActionsForDeniedCommand(command, path), []);
    const result = evaluateLifecycleReadyGuard(bash(command), { projectDir: path });
    assert.equal(result.exitCode, 2);
    const envelopeLine = result.stderr.split("\n").find((line) => line.startsWith('{"schema":"pipeline.guard-retry-actions.v1"'));
    assert.ok(envelopeLine);
    assert.deepEqual(JSON.parse(envelopeLine).retryActions, []);

    // The --message spelling reaches the same remediation (the AC-2 coverage that used to
    // ride on the action's shape now rides on the text, where it can still fail).
    const spelling = evaluateLifecycleReadyGuard(bash('git commit --message "one\ntwo"'), { projectDir: path });
    assert.equal(spelling.exitCode, 2);
    assert.match(spelling.stderr, /git commit -F <msgfile> -- <paths>/u);
    assert.deepEqual(retryActionsForDeniedCommand('git commit --message "one\ntwo"', path), []);

    // An ordinary single-line -m commit carries no control character, so it is neither denied
    // for this reason nor given the remediation, and an ordinary multi-part denied command
    // keeps returning [] exactly as before this change.
    const singleLine = evaluateLifecycleReadyGuard(bash("git commit -m fixture -- a.md"), { projectDir: path });
    assert.doesNotMatch(String(singleLine.stderr ?? ""), /Remediation:/u);
    assert.deepEqual(retryActionsForDeniedCommand("git commit -m fixture", path), []);
    assert.deepEqual(
      retryActionsForDeniedCommand("sed -n '1,10p' one.txt ; touch changed.txt", path),
      [],
    );
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * GUARDFIX-2: AC-047-140 admits a `pipeline.guard-retry-actions.v1` envelope "only when every
 * returned action is a separate-tool-call, independently admitted read-only diagnostic", and
 * sprint-nova-epic repeats it -- normalized retries "only when every resulting line is
 * independently an admitted, read-only, single command". `git commit -F` is a mutation and is
 * not admitted by the closed grammar, so it can never be an action in that envelope; it is not
 * a borderline case but the exact thing the sentence excludes. The envelope's only in-repo
 * consumer agrees: denialRetryActions() (lib/human-guard-override.mjs) drops every action whose
 * `mutation` is not `false`, so the action could never have been executed through that path
 * either -- it could only mislead a reader of the raw denial text.
 *
 * The help itself is not the problem and is not withdrawn: it moves into the human-readable
 * message, where a mutating remediation belongs and where no schema promises it is read-only.
 */
test("GUARDFIX-2: the newline-in--m refusal carries no mutating action, and states the -F shape as text", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const command = 'git commit -m "line one\n\nline two"';
    const result = evaluateLifecycleReadyGuard(bash(command), { projectDir: path });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /GUARD-PARSE-UNSUPPORTED/u);

    // The envelope is emitted (the schema line is unconditional for grammar denials) and
    // carries nothing that declares mutation, under any spelling other than exactly false.
    const envelopeLine = result.stderr.split("\n").find((line) => line.startsWith('{"schema":"pipeline.guard-retry-actions.v1"'));
    assert.ok(envelopeLine, "a grammar denial still prints the typed envelope");
    const actions = JSON.parse(envelopeLine).retryActions;
    assert.deepEqual(actions.filter((action) => action?.mutation !== false), []);
    assert.deepEqual(retryActionsForDeniedCommand(command, path), []);
    assert.deepEqual(retryActionsForDeniedCommand('git commit --message "one\ntwo"', path), []);

    // Every surviving action would also pass the consumer's own filter -- the producer and the
    // only consumer of this schema now agree instead of one silently discarding the other's work.
    for (const action of actions) {
      assert.equal(action.mutation, false);
      assert.equal(action.requiresConfirmation, false);
    }

    // The remediation survives as message text, in the exact shape agent-obligations.md SS6
    // requires: pathspec on both calls, the same paths in each, never a bare commit.
    assert.match(result.stderr, /git add -- <paths>/u);
    assert.match(result.stderr, /git commit -F <msgfile> -- <paths>/u);

    // ...and the printed guarantee about the envelope is true again (guardrails/git.md: a gate
    // states what it actually enforces). "typed" was the weakening that let a mutation in.
    assert.match(result.stderr, /run only those exact read-only actions as separate tool calls/u);
    assert.doesNotMatch(result.stderr, /exact typed actions/u);

    // A grammar denial with no commit-message cause must not acquire the commit remediation.
    const composed = evaluateLifecycleReadyGuard(bash("rg -n lifecycle . && touch output.txt"), { projectDir: path });
    assert.equal(composed.exitCode, 2);
    assert.doesNotMatch(composed.stderr, /git commit -F/u);
    assert.match(composed.stderr, /run only those exact read-only actions as separate tool calls/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("GRAMMARHINT-1 AC-4: GUARD-OPERATOR-UNAPPROVED and GUARD-PARSE-UNSUPPORTED stay distinct, own codes never conflated", () => {
  const path = hgoGitFixture("chat");
  try {
    const operator = evaluateLifecycleReadyGuard(bash("rg -n lifecycle . | tee output.txt"), { projectDir: path });
    assert.match(operator.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
    assert.doesNotMatch(operator.stderr, /GUARD-PARSE-UNSUPPORTED/u);
    // Unaffected by this dispatch: the operator/redirect codes already route through
    // humanOverrideRoute() the same way GUARD-PARSE-UNSUPPORTED does (guard-lifecycle-ready.mjs,
    // unchanged by this dispatch) -- a plain "nothing armed" fixture offers the route for both;
    // pinned here as the CURRENT, unchanged behaviour, not narrowed or widened by this change.
    assert.match(operator.stderr, /Human override available for this exact command/u);

    const parseUnsupported = evaluateLifecycleReadyGuard(
      bash('git commit -m "line one\n\nline two"'), { projectDir: path },
    );
    assert.match(parseUnsupported.stderr, /GUARD-PARSE-UNSUPPORTED/u);
    assert.doesNotMatch(parseUnsupported.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
    assert.match(parseUnsupported.stderr, /Human override available for this exact command/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("non-ready Bash permits only exact plugin-local lifecycle remediation argv", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const inspect = `node '${ONBOARDING_SCRIPT}' inspect --root '${path}' --intent bootstrap`;
    const apply = `node '${ONBOARDING_SCRIPT}' apply-readback --root '${path}' --plan-sha256 ${"a".repeat(64)} --activate`;
    const preflight = `node '${START_PREFLIGHT_SCRIPT}'`;
    // OBLIGROUTE-1: the second zero-argument member of this list. Enumerated here with the
    // rest so the admitted set stays one list rather than two, and refuted below in the
    // argument-bearing spellings, which are not part of the map's interface at all.
    const repairMap = `node '${REPAIR_MAP_SCRIPT}'`;
    const hostPlan = `node '${HOST_REPOSITORY_INIT_SCRIPT}' plan --root '${path}'`;
    const hostApply = `node '${HOST_REPOSITORY_INIT_SCRIPT}' apply --root '${path}' --plan-sha256 ${"b".repeat(64)} --activate`;
    const kickoffPlan = `node '${ONBOARDING_SCRIPT}' kickoff plan --root '${path}' --goal 'Build one HTML game' --language de`;
    const kickoffApply = `node '${ONBOARDING_SCRIPT}' kickoff apply --root '${path}' --goal 'Build one HTML game' --language de --plan-sha256 ${"c".repeat(64)} --activate`;
    // GF-093: a bare --help/-h must reach the CLI's own usage text even while non-ready, the
    // same reasoning as the preflight and repair-map bare no-arg admissions above -- main()
    // returns immediately on options.help with zero filesystem access (project-onboarding-v3.mjs
    // main()/parse()), before --root is even required.
    const onboardingHelp = `node '${ONBOARDING_SCRIPT}' --help`;
    const onboardingHelpShort = `node '${ONBOARDING_SCRIPT}' -h`;
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
    // sanctionedProjectAuthorityMigrationArgs() gained "vendor-sync" alongside "plan"/"apply" --
    // the CLI's own vendor-sync subcommand (project-authority-migration.mjs) uses the identical
    // two-shape (bare read-only plan vs. --plan-sha256/--activate mutation) pattern.
    const authorityMigrationVendorSyncPlan = `node '${PROJECT_AUTHORITY_MIGRATION_SCRIPT}' vendor-sync --root '${path}'`;
    const authorityMigrationVendorSyncApply = `node '${PROJECT_AUTHORITY_MIGRATION_SCRIPT}' vendor-sync --root '${path}' --plan-sha256 ${"d".repeat(64)} --activate`;
    const overridePlan = `node '${HUMAN_OVERRIDE_SCRIPT}' plan --repo '${path}' --request-sha256 ${"f".repeat(64)}`;
    const overridePrepare = `node '${HUMAN_OVERRIDE_SCRIPT}' prepare-authorization --repo '${path}' --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --reason 'PO attended exact action'`;
    const overrideAuthorize = `node '${HUMAN_OVERRIDE_SCRIPT}' authorize --repo '${path}' --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --selection-sha256 ${"c".repeat(64)} --reason 'PO attended exact action' --reason-sha256 ${"b".repeat(64)} --activate`;
    const authorRoot = join(path, "plugins", "pipeline-core");
    const overrideAuthorPlan = `${overridePlan} --author-source-root '${authorRoot}'`;
    const overrideAuthorPrepare = `${overridePrepare} --author-source-root '${authorRoot}'`;
    const overrideAuthorAuthorize = `node '${HUMAN_OVERRIDE_SCRIPT}' authorize --repo '${path}' --request-sha256 ${"f".repeat(64)} --plan-sha256 ${"a".repeat(64)} --selection-sha256 ${"c".repeat(64)} --reason 'PO attended exact action' --reason-sha256 ${"b".repeat(64)} --author-source-root '${authorRoot}' --activate`;
    for (const command of [inspect, apply, preflight, repairMap, hostPlan, hostApply, kickoffPlan, kickoffApply, onboardingHelp, onboardingHelpShort, overlayRoute, poRebind, poDecisionPlan, poDecisionSelect, poDecisionApply, legacyRevocationRecoveryPlan, reopenDesign, submitPlan, approvePlan, setPhase, profileRepairPlan, profileRepairApply, authorityMigrationPlan, authorityMigrationApply, authorityMigrationVendorSyncPlan, authorityMigrationVendorSyncApply, overridePlan, overridePrepare, overrideAuthorize, overrideAuthorPlan, overrideAuthorPrepare, overrideAuthorAuthorize]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
      }), { exitCode: 0, stderr: "" });
    }
    // NVA-BOOTADMIT-2: flag order carries no behavioural meaning to the target CLI --
    // project-onboarding-v3.mjs parse() (lines 195-250) walks a flat, order-insensitive
    // flag set for every subcommand, so --language before --goal parses identically to the
    // canonical order above. The guard's old positional strictness excluded a shape its own
    // target already accepted unchanged; this pair is pre-authorized to flip to admitted.
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' kickoff plan --root '${path}' --language de --goal 'Build one HTML game'`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' kickoff apply --root '${path}' --language de --goal 'Build one HTML game' --plan-sha256 ${"c".repeat(64)} --activate`, path), true);
    for (const command of [
      `${inspect}; printf bypass > src/output.txt`,
      `node '${ONBOARDING_SCRIPT}' apply-readback --root /tmp/other --plan-sha256 ${"a".repeat(64)} --activate`,
      `node '${ONBOARDING_SCRIPT}' apply-readback --root '${path}' --plan-sha256 ${"a".repeat(64)} --activate && touch bypass`,
      `${preflight}; touch bypass`,
      // OBLIGROUTE-1, the closing half: an argument-bearing map invocation is not a narrower
      // version of an admitted command, it is a different command, and none of these is part
      // of the map's interface -- it parses no flag and no subcommand.
      `${repairMap} --json`,
      `${repairMap} --root '${path}'`,
      `${repairMap}; touch bypass`,
      `${repairMap} && touch bypass`,
      `${hostApply} && touch bypass`,
      `node '${ONBOARDING_SCRIPT}' kickoff-plan --root '${path}' --goal 'Build one HTML game'`,
      `node '${ONBOARDING_SCRIPT}' plan-kickoff --root '${path}' --goal 'Build one HTML game'`,
      `node '${ONBOARDING_SCRIPT}' plan --root '${path}' --goal 'Build one HTML game'`,
      `node '${ONBOARDING_SCRIPT}' kickoff --root '${path}' --goal 'Build one HTML game'`,
      // GF-074: --language <de|en> is mandatory since the CLI's GF-066 addition. The
      // pre-fix shape (no --language at all) is now a negative case -- proves the fix
      // closes the gap rather than just widening the allowlist.
      `node '${ONBOARDING_SCRIPT}' kickoff plan --root '${path}' --goal 'Build one HTML game'`,
      `node '${ONBOARDING_SCRIPT}' kickoff apply --root '${path}' --goal 'Build one HTML game' --plan-sha256 ${"c".repeat(64)} --activate`,
      // Invalid --language value (not de|en).
      `node '${ONBOARDING_SCRIPT}' kickoff plan --root '${path}' --goal 'Build one HTML game' --language fr`,
      `node '${ONBOARDING_SCRIPT}' kickoff apply --root '${path}' --goal 'Build one HTML game' --language fr --plan-sha256 ${"c".repeat(64)} --activate`,
      // GF-093: --help is a bare, argument-free admission only -- never an escape hatch
      // bolted onto a real command. Combined with anything else it still falls through to
      // exact refusal, same as every other malformed onboarding shape.
      `node '${ONBOARDING_SCRIPT}' --root '${path}' --help`,
      `node '${ONBOARDING_SCRIPT}' kickoff plan --help`,
      `node '${ONBOARDING_SCRIPT}' --help --root '${path}'`,
      `node '${ONBOARDING_SCRIPT}' -h --root '${path}'`,
      `node '${ONBOARDING_SCRIPT}' --help --help`,
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
      `node '${PROJECT_AUTHORITY_MIGRATION_SCRIPT}' vendor-sync --root '${path}' --activate`,
      `node '${PROJECT_AUTHORITY_MIGRATION_SCRIPT}' vendor-sync --root /tmp/other`,
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
 * GF-097. `gh --version` and `gh auth status`, bare, are GitHub CLI's own documented
 * read-only diagnostics and must reach the operator even while lifecycle is not-ready --
 * the same class of gap GF-093 closed for the onboarding CLI's `--help`, but for a
 * third-party binary rather than a bundled script (guard-lifecycle-ready.mjs,
 * isSanctionedGhReadOnlyDiagnostic()). This is a narrow, exact-shape admission for two
 * specific invocations, never a blanket `gh` carve-out -- the negative list below proves
 * near-miss `gh` shapes (extra flags, a different subcommand, no args at all) stay refused.
 */
test("GF-097: bare `gh --version` and `gh auth status` are admitted while lifecycle is not-ready, and no other `gh` shape is", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const nonReady = {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
    };
    for (const command of ["gh --version", "gh auth status"]) {
      assert.equal(isSanctionedGhReadOnlyDiagnostic(command, path), true, command);
      assert.deepEqual(evaluateLifecycleReadyGuard(bash(command), nonReady), { exitCode: 0, stderr: "" });
    }
    for (const command of [
      "gh pr create",
      "gh auth login",
      "gh repo clone owner/repo",
      "gh --version --help",
      "gh auth status --hostname example.com",
      "gh",
      "gh auth",
    ]) {
      assert.equal(isSanctionedGhReadOnlyDiagnostic(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), nonReady).exitCode, 2, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * OBLIGROUTE-1. templates/prompts/agent-obligations.md SS5 instructs every dispatched agent to
 * ASK which refusals can be lifted -- `node <plugin-root>/scripts/repair-map.mjs` -- and SS1a
 * calls the non-ready lane "the state you are in precisely when you most need to look around".
 * The map's `GUARD-LIFECYCLE-NOT-READY` row is the row that state needs, and until this
 * admission existed the question was refused in exactly the state that asks it.
 *
 * Both directions are pinned, because an admission test alone cannot fail for the reason that
 * matters here. This is the file that stops an agent weakening the gate authorizing it, so the
 * proof that nothing else rode along is a SWEEP, not an example: every other script this plugin
 * ships, invoked with the identical zero-argument shape, must still be refused in the same
 * fixture. The two known zero-argument admissions are named and justified; a third one appearing
 * turns this test red instead of passing quietly.
 */
test("OBLIGROUTE-1: the non-ready lane admits the repair map by exact argv, and nothing beside it", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const nonReady = {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("runtime-attestation-required"); },
    };

    // Direction 1 -- the instruction SS5 gives is now executable in the state SS1a describes.
    const map = `node '${REPAIR_MAP_SCRIPT}'`;
    assert.equal(isSanctionedLifecycleCommand(map, path), true, map);
    assert.deepEqual(evaluateLifecycleReadyGuard(bash(map), nonReady), { exitCode: 0, stderr: "" });

    // Direction 2a -- the named neighbour. critic-dispatch-preflight.mjs is the sharpest case:
    // agent-obligations SS4 already lists it as a read-only script exempt from the gate-strength
    // shell lane, so "read-only and already named in that document" is demonstrably NOT what
    // this admission keys on. Its existence is asserted so a rename fails here loudly rather
    // than silently degrading this into an assertion about a path that no longer exists.
    const neighbour = join(SCRIPTS_DIR, "critic-dispatch-preflight.mjs");
    assert.ok(existsSync(neighbour), "the named neighbour script still exists");
    const neighbourCommand = `node '${neighbour}'`;
    assert.equal(isSanctionedLifecycleCommand(neighbourCommand, path), false, neighbourCommand);
    const refused = evaluateLifecycleReadyGuard(bash(neighbourCommand), nonReady);
    assert.equal(refused.exitCode, 2, neighbourCommand);
    assert.match(refused.stderr, /GUARD-LIFECYCLE-NOT-READY/u);

    // Direction 2b -- the sweep. Zero arguments is exactly the shape just admitted, so any
    // sibling that answers the same way would be a widening this dispatch did not intend.
    const zeroArgumentAdmissions = new Set(["repair-map.mjs", "pipeline-start-preflight.mjs"]);
    const siblings = readdirSync(SCRIPTS_DIR)
      .filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"))
      .filter((name) => !zeroArgumentAdmissions.has(name));
    assert.ok(siblings.length > 10, "the sweep still covers this plugin's script directory");
    for (const name of siblings) {
      const command = `node '${join(SCRIPTS_DIR, name)}'`;
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
      assert.equal(evaluateLifecycleReadyGuard(bash(command), nonReady).exitCode, 2, command);
    }
    // ...and the one sibling deliberately left out of the sweep is the pre-existing zero-argument
    // admission, restated here so the exclusion above is a justified fact, not a hidden hole.
    assert.equal(isSanctionedLifecycleCommand(`node '${START_PREFLIGHT_SCRIPT}'`, path), true);

    // Direction 2c -- the admission is the exact resolved path of THIS plugin's map, not a
    // basename, a suffix or anything under some `scripts/` directory. A same-named script in a
    // foreign root is a different program entirely and stays refused.
    const foreign = `node '${join(path, "plugins", "pipeline-core", "scripts", "repair-map.mjs")}'`;
    assert.equal(isSanctionedLifecycleCommand(foreign, path), false, foreign);
    assert.equal(evaluateLifecycleReadyGuard(bash(foreign), nonReady).exitCode, 2, foreign);
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
 * GUARDALLOW-1 (backlog: 2026-08-16-lifecycle-guard-omits-the-partial-authority-repair-it-prescribes.md).
 * `plan-partial-authority` is a real, read-only onboarding subcommand (scripts/
 * project-onboarding-v3.mjs: absent from APPLY_SHAPED_COMMANDS) that a partial-authority
 * inspection prescribes verbatim as its `nextAction` (lib/project-onboarding-v3.mjs:3436,
 * 3717, via the same lifecycleArgv(argv, runner, intent) helper as its plan* siblings) --
 * yet the allowlist refused it because it was absent from the plan* array, blocking every
 * consumer project stuck in `partial` state from ever completing bootstrap. This mirrors
 * the "plan-runtime family" test above, scoped to the one added subcommand, plus a negative
 * case proving an unlisted, made-up plan-shaped subcommand is still refused (fail-closed
 * default preserved).
 */
test("GUARDALLOW-1: plan-partial-authority is admitted with the same shape as its plan* siblings", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const intent of ["onboarding", "bootstrap", "session", "dispatch"]) {
      for (const runner of ["claude", "codex"]) {
        const withIntent = `node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --runner ${runner} --intent ${intent}`;
        assert.equal(isSanctionedLifecycleCommand(withIntent, path), true, withIntent);
      }
    }
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --runner claude`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --runner codex`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}'`, path), true);
    for (const command of [
      // invalid intent value
      `node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --runner claude --intent unknown`,
      // invalid runner value
      `node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --runner windows --intent session`,
      // malformed / wrong-length argv
      `node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --intent session --extra flag`,
      `node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --runner claude --intent session --extra flag`,
      `node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --runner claude --intent`,
      // --profile/--source are valid CLI-level flags for this command (usage text), but the
      // guard admits only the exact nextAction shape the inspection actually emits -- never
      // the wider human-invoked shape -- so these still fall through to refusal.
      `node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --runner claude --profile epic --source canonical-fresh-v3`,
      // apply-partial-authority is a separate, mutating, apply-shaped command and is
      // deliberately out of scope for this fix -- it must stay refused.
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --runner claude --plan-sha256 ${"a".repeat(64)} --activate`,
      // an unlisted, made-up plan-shaped subcommand must stay refused (fail-closed default).
      `node '${ONBOARDING_SCRIPT}' plan-partial-recovery --root '${path}'`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * GUARDDERIVE-1 (backlog:
 * 2026-08-16-guard-lifecycle-allowlist-should-derive-from-the-onboarding-cli-table.md).
 * The guard's admitted plan* NAME set is now derived from ONBOARDING_SUBCOMMANDS -- the
 * onboarding CLI's own registered subcommand table -- instead of the hand-maintained array
 * that had gone stale three separate times against that CLI (backlog items 2026-08-08,
 * 2026-08-09, 2026-08-16). These three tests pin the three things that fix depends on:
 * the derived set is exactly what the guard admits, the derivation keys on the DECLARED
 * properties rather than the `plan` name prefix, and the table itself stays well-formed
 * so a newly registered subcommand cannot arrive without an explicit decision.
 */
test("GUARDDERIVE-1: the guard's admitted plan* set is the CLI table's derivation, and admits exactly that set", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const derived = automatedLifecycleArgvCommands();
    // Regression pin against a silent widening OR narrowing: this is the exact set the
    // hand-maintained array carried at the moment it was replaced. A future entry may
    // legitimately extend it, but never by accident -- this assertion has to be edited
    // deliberately alongside the table.
    assert.deepEqual([...derived].sort(), [
      "bootstrap-bind-plan", "intake-generate-plan", "plan", "plan-manifest-repair", "plan-partial-authority",
      "plan-readback", "plan-reinstall", "plan-repair", "plan-runtime", "plan-source-recovery",
    ]);
    // Every derived name really is admitted by the real guard in the bare lifecycleArgv
    // shape -- the derivation is load-bearing, not decoration.
    for (const command of derived) {
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${command} --root '${path}'`, path), true, command);
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --runner codex --intent session`, path), true, command);
      // ...and the SHAPE stays as narrow as before: only the exact automated nextAction
      // argv, never the wider human-invoked CLI surface these same commands accept.
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --profile epic --source canonical-fresh-v3`, path), false, command);
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${command} --root '${path}' --activate`, path), false, command);
    }
    // Conversely: a registered subcommand the derivation does NOT select gets no bare
    // lifecycleArgv admission from this branch. `inspect` is excluded from the sweep
    // because it has its own separate, older admission branch of the same shape, which
    // this change deliberately leaves byte-identical rather than folding in.
    for (const entry of ONBOARDING_SUBCOMMANDS) {
      if (derived.includes(entry.name) || entry.name === "inspect") continue;
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${entry.name} --root '${path}'`, path), false, entry.name);
      assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${entry.name} --root '${path}' --runner claude --intent session`, path), false, entry.name);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("GUARDDERIVE-1: the derivation keys on the declared properties, never on the plan name prefix", () => {
  // The correctness hazard the backlog item names explicitly: a future WRITING subcommand
  // that happens to share the `plan` prefix must not be admitted just for matching the
  // naming convention -- and a read-only command whose automated invocation is not the
  // bare lifecycle argv must not be admitted either. Driven through a synthetic table so
  // the real registration is untouched.
  const synthetic = [
    { name: "plan-writes-things", flat: true, mutates: true, automatedArgvShape: "lifecycle" },
    { name: "plan-no-automated-shape", flat: true, mutates: false, automatedArgvShape: null },
    { name: "plan-legitimate", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
    // No `plan` prefix at all: selection follows the declared properties, so this IS chosen.
    { name: "diagnose-legitimate", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  ];
  assert.deepEqual(automatedLifecycleArgvCommands(synthetic), ["plan-legitimate", "diagnose-legitimate"]);
  // Both declared properties are required, and neither is inferred from the other.
  assert.deepEqual(automatedLifecycleArgvCommands([{ name: "plan-x", flat: true, mutates: true, automatedArgvShape: null }]), []);
  assert.deepEqual(automatedLifecycleArgvCommands([]), []);
});

test("GUARDDERIVE-1: every registered onboarding subcommand declares both properties explicitly", () => {
  // A subcommand added to the CLI table without deciding these two fields must fail loudly
  // here rather than defaulting into (or silently out of) the guard's admitted set. This is
  // the mechanism that replaces "remember to also edit the guard".
  const names = new Set();
  for (const entry of ONBOARDING_SUBCOMMANDS) {
    assert.equal(typeof entry.name, "string", JSON.stringify(entry));
    assert.equal(names.has(entry.name), false, entry.name);
    names.add(entry.name);
    assert.equal(typeof entry.flat, "boolean", entry.name);
    assert.equal(typeof entry.mutates, "boolean", entry.name);
    assert.equal([null, "lifecycle"].includes(entry.automatedArgvShape), true, entry.name);
    // A command that may write can never also declare the automated read-only shape the
    // guard admits -- the two declarations would contradict each other.
    assert.equal(entry.mutates === true && entry.automatedArgvShape === "lifecycle", false, entry.name);
  }
  assert.equal(names.size > 0, true);
});

/**
 * NVA-LCGUARD-1 (backlog:
 * 2026-08-17-lifecycle-guard-allowlist-still-misses-apply-partial-authority-and-adopt-remote.md).
 * `apply-partial-authority` is the mutating apply half of `plan-partial-authority`,
 * constructed verbatim as the plan's own `applyAction` (lib/project-onboarding-v3.mjs:470):
 * `--root <root> --profile <epic|feature|mini> --source <value> --plan-sha256 <hex>
 * --activate`. The allowlist had no branch for it at all, so it was 100% unreachable -- the
 * very next step after a successful plan-partial-authority refused by its own guard.
 *
 * NVA-LCGUARD-2: `--source` is now pinned to the exact literal `canonical-fresh-v3` --
 * the one value `planProjectPartialAuthorityAdoption` (lib/project-onboarding-v3.mjs:439)
 * ever lets reach this `applyAction` construction -- not merely checked loosely.
 */
test("NVA-LCGUARD-1: apply-partial-authority admits exactly the applyAction shape and no wider one", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const sha = "a".repeat(64);
    for (const profile of ["epic", "feature", "mini"]) {
      const command = `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile ${profile} --source canonical-fresh-v3 --plan-sha256 ${sha} --activate`;
      assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
    }
    // NVA-BOOTADMIT-2: project-onboarding-v3.mjs parse() (lines 195-250) is a flat,
    // order-insensitive flag walk, so --source before --profile parses identically to the
    // canonical order above -- pre-authorized to flip from refused to admitted.
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --source canonical-fresh-v3 --profile epic --plan-sha256 ${sha} --activate`, path), true);
    for (const command of [
      // invalid --profile enum value
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile bogus --source canonical-fresh-v3 --plan-sha256 ${sha} --activate`,
      // malformed / short / non-hex --plan-sha256
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile epic --source canonical-fresh-v3 --plan-sha256 ${"a".repeat(63)} --activate`,
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile epic --source canonical-fresh-v3 --plan-sha256 ${"g".repeat(64)} --activate`,
      // missing --activate (shorter argv)
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile epic --source canonical-fresh-v3 --plan-sha256 ${sha}`,
      // extra trailing arg / wrong length
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile epic --source canonical-fresh-v3 --plan-sha256 ${sha} --activate --extra flag`,
      // missing --source pair entirely
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile epic --plan-sha256 ${sha} --activate`,
      // empty --source value
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile epic --source '' --plan-sha256 ${sha} --activate`,
      // flag-shaped --source value (smuggled flag instead of a value)
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile epic --source --bogus --plan-sha256 ${sha} --activate`,
      // NVA-LCGUARD-2: non-empty, non-flag-shaped --source value that is NOT the one
      // value planProjectPartialAuthorityAdoption ever lets reach applyAction -- was
      // previously wrongly admitted by the old loose (non-empty, not flag-shaped) check.
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root '${path}' --profile epic --source some-other-source --plan-sha256 ${sha} --activate`,
      // wrong --root
      `node '${ONBOARDING_SCRIPT}' apply-partial-authority --root /tmp/other --profile epic --source canonical-fresh-v3 --plan-sha256 ${sha} --activate`,
      // plan-partial-authority stays refused for this wider shape too (regression pin)
      `node '${ONBOARDING_SCRIPT}' plan-partial-authority --root '${path}' --profile epic --source canonical-fresh-v3 --plan-sha256 ${sha} --activate`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * NVA-LCGUARD-1 (same backlog item). `adopt-remote plan`/`adopt-remote apply` are
 * constructed verbatim by lib/project-onboarding-v3.mjs:4198 and :4111 as the documented
 * onboarding-recovery.md path for portable-seed-required when an existing remote+branch is
 * supplied. The allowlist had no adopt-remote handling at all, so the entire recovery path
 * was 100% unreachable for any not-ready project.
 *
 * NVA-LCGUARD-2: --remote stays checked loosely (non-empty, not flag-shaped) -- genuinely
 * caller-chosen at both construction sites. --ref is now pinned to the exact
 * refs/heads/<branch> format lib/project-onboarding-v3.mjs:3988's REMOTE_REF_RE already
 * enforces before either command is ever constructed, not merely checked loosely.
 */
test("NVA-LCGUARD-1: adopt-remote admits exactly the plan and apply shapes and no third subcommand", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const sha = "a".repeat(64);
    const planCommand = `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref refs/heads/main`;
    assert.equal(isSanctionedLifecycleCommand(planCommand, path), true, planCommand);
    const applyCommand = `node '${ONBOARDING_SCRIPT}' adopt-remote apply --root '${path}' --remote origin --ref refs/heads/main --plan-sha256 ${sha} --activate`;
    assert.equal(isSanctionedLifecycleCommand(applyCommand, path), true, applyCommand);
    // NVA-BOOTADMIT-2: project-onboarding-v3.mjs parse() (lines 195-250) is a flat,
    // order-insensitive flag walk, so --ref before --remote parses identically to the
    // canonical order above -- pre-authorized to flip from refused to admitted.
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --ref refs/heads/main --remote origin`, path), true);
    for (const command of [
      // wrong length: extra trailing arg on plan
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref refs/heads/main --extra flag`,
      // wrong length: missing --activate on apply (shorter argv)
      `node '${ONBOARDING_SCRIPT}' adopt-remote apply --root '${path}' --remote origin --ref refs/heads/main --plan-sha256 ${sha}`,
      // missing --activate, wrong trailing word instead (same length as apply)
      `node '${ONBOARDING_SCRIPT}' adopt-remote apply --root '${path}' --remote origin --ref refs/heads/main --plan-sha256 ${sha} --bypass`,
      // malformed / non-hex --plan-sha256 on apply
      `node '${ONBOARDING_SCRIPT}' adopt-remote apply --root '${path}' --remote origin --ref refs/heads/main --plan-sha256 ${"a".repeat(63)} --activate`,
      `node '${ONBOARDING_SCRIPT}' adopt-remote apply --root '${path}' --remote origin --ref refs/heads/main --plan-sha256 ${"g".repeat(64)} --activate`,
      // empty --remote / --ref value
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote '' --ref refs/heads/main`,
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref ''`,
      // flag-shaped --remote value (smuggled flag instead of a value)
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote --ref --ref refs/heads/main`,
      // an unlisted third adopt-remote subcommand
      `node '${ONBOARDING_SCRIPT}' adopt-remote status --root '${path}' --remote origin --ref refs/heads/main`,
      // wrong --root
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root /tmp/other --remote origin --ref refs/heads/main`,
      // the plan subcommand does not smuggle in the apply tail
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref refs/heads/main --plan-sha256 ${sha} --activate`,
      // NVA-LCGUARD-2: non-empty, non-flag-shaped --ref value that is NOT refs/heads/-
      // prefixed -- was previously wrongly admitted by the old loose (non-empty, not
      // flag-shaped) check. The bare form these positive fixtures used to pass.
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref main`,
      // NVA-LCGUARD-2: non-empty, non-flag-shaped --ref value with a refs/ prefix that is
      // NOT refs/heads/ -- also previously wrongly admitted.
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref refs/tags/v1`,
      // NVA-LCGUARD-2 round 2 (Critic F-B): --ref shapes that match REMOTE_REF_RE but that
      // validRemoteAdoptionRequest (lib/project-onboarding-v3.mjs:3988-3990) still refuses --
      // ".." traversal, a doubled slash, a trailing slash, and a ".lock" suffix.
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref refs/heads/a..b`,
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref refs/heads/a//b`,
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref refs/heads/a/`,
      `node '${ONBOARDING_SCRIPT}' adopt-remote plan --root '${path}' --remote origin --ref refs/heads/main.lock`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * NVA-W5-GUARDADMIT-1 (backlog:
 * 2026-08-19-guard-lifecycle-ready-has-no-admission-branch-for-the-intake-checkpoint-subcommands.md).
 * `intake-consent-apply`, `intake-capture-apply`, and `intake-design-questions-apply` are
 * `mutates: true, automatedArgvShape: null` entries in ONBOARDING_SUBCOMMANDS (Wave 4 onboarding
 * coordinator, NVA-W4-COORD-1) -- GUARDDERIVE-1's derived admission never covers them, so a
 * Bash-invoked automated call to any of the three was refused with GUARD-LIFECYCLE-NOT-READY
 * despite being a registered, mutating onboarding subcommand exactly like every sibling that
 * already has its own hand-written admission branch. Each admits exactly ONE narrow, positional
 * shape (see the guard's own comment beside these branches for why the shape was chosen).
 */
test("NVA-W5-GUARDADMIT-1: intake-consent-apply admits exactly the full-bundle shape and no wider one", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const language of ["de", "en"]) {
      for (const profile of ["epic", "feature", "mini"]) {
        const command = `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-name 'PO Name' --git-author-email 'po@example.com' --language ${language} --profile ${profile} --activate`;
        assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
      }
    }
    // NVA-BOOTADMIT-2: applyOnboardingIntakeConsent (onboarding-continuity.mjs:5276-5300)
    // requires only --granted/--activate unconditionally; gitAuthor/language/profile each
    // default null and merge as base.values.X ?? X, so a caller may omit any subset of the
    // four value flags, including none -- pre-authorized to flip from refused to admitted.
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --language en --profile epic --activate`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-name 'PO Name' --git-author-email 'po@example.com' --activate`, path), true);
    // NVA-BOOTADMIT-2: and, independently, project-onboarding-v3.mjs parse() (lines 195-250)
    // is a flat, order-insensitive flag walk, so --git-author-email before --git-author-name
    // parses identically to the canonical order -- pre-authorized to flip too.
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-email 'po@example.com' --git-author-name 'PO Name' --language en --profile epic --activate`, path), true);
    for (const command of [
      // missing --granted entirely
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --git-author-name 'PO Name' --git-author-email 'po@example.com' --language en --profile epic --activate`,
      // missing --activate
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-name 'PO Name' --git-author-email 'po@example.com' --language en --profile epic`,
      // invalid --language enum value
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-name 'PO Name' --git-author-email 'po@example.com' --language fr --profile epic --activate`,
      // invalid --profile enum value
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-name 'PO Name' --git-author-email 'po@example.com' --language en --profile bogus --activate`,
      // empty --git-author-name value
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-name '' --git-author-email 'po@example.com' --language en --profile epic --activate`,
      // flag-shaped --git-author-email value (smuggled flag instead of a value)
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-name 'PO Name' --git-author-email --bogus --language en --profile epic --activate`,
      // extra trailing arg / wrong length
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --git-author-name 'PO Name' --git-author-email 'po@example.com' --language en --profile epic --activate --extra flag`,
      // wrong --root
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root /tmp/other --granted --git-author-name 'PO Name' --git-author-email 'po@example.com' --language en --profile epic --activate`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * NVA-VERIFYGREEN-1: regression test for an observed autonomous-onboarding failure. A live
 * Antigravity run supplied consent alone -- --granted/--activate only, none of the four
 * individually-optional value flags (--git-author-name/--git-author-email/--language/
 * --profile) -- and was refused, even though applyOnboardingIntakeConsent
 * (onboarding-continuity.mjs) never requires any of the four (NVA-BOOTADMIT-2 above already
 * widened the branch to admit this shape; this pins it against regression). The test above
 * ("intake-consent-apply admits exactly the full-bundle shape...") only ever omits a SUBSET
 * of the four together with the other two present -- never all four omitted at once, which is
 * the exact shape the live run sent.
 */
test("NVA-VERIFYGREEN-1: intake-consent-apply admits consent alone (--granted/--activate, no optional value flags) and refuses a duplicated flag", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const consentAlone = `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --activate`;
    assert.equal(isSanctionedLifecycleCommand(consentAlone, path), true, consentAlone);
    // Flag order is insensitive here too (NVA-BOOTADMIT-2), so the two bare flags in either
    // order both admit -- proving the admission is not an accidental side effect of position.
    const consentAloneReordered = `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --activate --granted`;
    assert.equal(isSanctionedLifecycleCommand(consentAloneReordered, path), true, consentAloneReordered);
    // NVA-VERIFYGREEN-1: the exactness invariant matchFlagSpec() upholds beyond the target
    // parsers it gates -- both project-onboarding-v3.mjs's parse() and
    // runner-profile-migration-v3.mjs's parseArgs() below let a duplicated flag silently win
    // last (last-write-wins on the parsed value/boolean); matchFlagSpec() refuses a duplicate
    // outright instead of matching either target's leniency here. The undeclared-flag, wrong
    // --root, and out-of-set --language/--profile negatives for this branch are already pinned
    // by the "full-bundle shape" test directly above (the "extra trailing arg" case there is an
    // undeclared-flag negative; "wrong --root" and the invalid --language/--profile enum cases
    // are pinned by name) -- not duplicated here.
    for (const command of [
      // duplicated --granted
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --granted --activate`,
      // duplicated --activate
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --activate --activate`,
      // duplicated --root
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --root '${path}' --granted --activate`,
      // duplicated optional value flag (--language), even though it validates the same value twice
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --granted --activate --language en --language en`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * NVA-VERIFYGREEN-1: regression test for an observed autonomous-onboarding failure. A live
 * Antigravity run invoked runner-profile-migration-v3.mjs's `apply` with `--activate` before
 * `--root <root>` (flags transposed relative to `apply --root <root> --activate`) and was
 * refused, even though runner-profile-migration-v3.mjs's own parseArgs() (a flat,
 * order-insensitive flag walk) accepts either order identically. sanctionedMigrationArgs()
 * (guard-lifecycle-ready.mjs) had never had a single test in this file before this dispatch --
 * RUNNER_PROFILE_MIGRATION_SCRIPT above is the first reference to it.
 */
test("NVA-VERIFYGREEN-1: runner-profile-migration apply admits --activate before --root, and stays exact everywhere else", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const canonical = `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --root '${path}' --activate`;
    assert.equal(isSanctionedLifecycleCommand(canonical, path), true, canonical);
    // The regression shape itself: --activate before --root.
    const transposed = `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --activate --root '${path}'`;
    assert.equal(isSanctionedLifecycleCommand(transposed, path), true, transposed);
    // The optional --initialize-missing-runtime flag, in either position relative to the rest.
    const withInit = `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --root '${path}' --initialize-missing-runtime --activate`;
    assert.equal(isSanctionedLifecycleCommand(withInit, path), true, withInit);
    const withInitTransposed = `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --activate --initialize-missing-runtime --root '${path}'`;
    assert.equal(isSanctionedLifecycleCommand(withInitTransposed, path), true, withInitTransposed);
    // The bare read-only inspect/plan shapes are unaffected by this dispatch; pinned here since
    // this is this file's first-ever coverage of sanctionedMigrationArgs() at all.
    assert.equal(isSanctionedLifecycleCommand(`node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' inspect --root '${path}'`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' plan --root '${path}'`, path), true);
    // NVA-VERIFYGREEN-1: the exactness invariant -- runner-profile-migration-v3.mjs's own
    // parseArgs() lets a duplicated flag silently win last (each recognized token just
    // overwrites `parsed.root`/sets `parsed.activate = true` again); matchFlagSpec() refuses a
    // duplicate outright instead. The apply branch declares no --language/--profile flags at
    // all (only --root/--activate/--initialize-missing-runtime), so that half of the exactness
    // sweep briefed for this piece does not apply to this branch structurally -- there is no
    // such flag here to test.
    for (const command of [
      // duplicated --root
      `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --root '${path}' --root '${path}' --activate`,
      // duplicated --activate
      `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --root '${path}' --activate --activate`,
      // duplicated --initialize-missing-runtime
      `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --root '${path}' --initialize-missing-runtime --initialize-missing-runtime --activate`,
      // undeclared flag
      `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --root '${path}' --activate --bogus`,
      // wrong --root value
      `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --root /tmp/other --activate`,
      // missing --activate (apply requires it)
      `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' apply --root '${path}'`,
      // vendor-sync is not a recognized subcommand for this script (unlike project-authority-migration.mjs)
      `node '${RUNNER_PROFILE_MIGRATION_SCRIPT}' vendor-sync --root '${path}' --activate`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("NVA-W5-GUARDADMIT-1: intake-capture-apply admits exactly the --text/--activate shape and no wider one", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const command = `node '${ONBOARDING_SCRIPT}' intake-capture-apply --root '${path}' --text 'the PO said something material' --activate`;
    assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
    for (const bad of [
      // missing --text entirely
      `node '${ONBOARDING_SCRIPT}' intake-capture-apply --root '${path}' --activate`,
      // missing --activate
      `node '${ONBOARDING_SCRIPT}' intake-capture-apply --root '${path}' --text 'material'`,
      // empty --text value
      `node '${ONBOARDING_SCRIPT}' intake-capture-apply --root '${path}' --text '' --activate`,
      // whitespace-only --text value
      `node '${ONBOARDING_SCRIPT}' intake-capture-apply --root '${path}' --text '   ' --activate`,
      // extra trailing arg / wrong length
      `node '${ONBOARDING_SCRIPT}' intake-capture-apply --root '${path}' --text 'material' --activate --extra flag`,
      // wrong --root
      `node '${ONBOARDING_SCRIPT}' intake-capture-apply --root /tmp/other --text 'material' --activate`,
      // an unrelated onboarding subcommand does not smuggle in this shape
      `node '${ONBOARDING_SCRIPT}' intake-consent-apply --root '${path}' --text 'material' --activate`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(bad, path), false, bad);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("NVA-W5-GUARDADMIT-1: intake-design-questions-apply admits exactly the --answers-json/--activate shape and no wider one", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const answersJson = JSON.stringify([{ question: "Q1?", answer: "A1" }]);
    const command = `node '${ONBOARDING_SCRIPT}' intake-design-questions-apply --root '${path}' --answers-json '${answersJson}' --activate`;
    assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
    for (const bad of [
      // missing --answers-json entirely
      `node '${ONBOARDING_SCRIPT}' intake-design-questions-apply --root '${path}' --activate`,
      // missing --activate
      `node '${ONBOARDING_SCRIPT}' intake-design-questions-apply --root '${path}' --answers-json '${answersJson}'`,
      // empty --answers-json value
      `node '${ONBOARDING_SCRIPT}' intake-design-questions-apply --root '${path}' --answers-json '' --activate`,
      // flag-shaped --answers-json value (smuggled flag instead of a value)
      `node '${ONBOARDING_SCRIPT}' intake-design-questions-apply --root '${path}' --answers-json --bogus --activate`,
      // extra trailing arg / wrong length
      `node '${ONBOARDING_SCRIPT}' intake-design-questions-apply --root '${path}' --answers-json '${answersJson}' --activate --extra flag`,
      // wrong --root
      `node '${ONBOARDING_SCRIPT}' intake-design-questions-apply --root /tmp/other --answers-json '${answersJson}' --activate`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(bad, path), false, bad);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("NVA-W5-GUARDADMIT-1: intake-generate-apply admits exactly the --plan-sha256/--activate shape and no wider one", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const sha = "a".repeat(64);
    const command = `node '${ONBOARDING_SCRIPT}' intake-generate-apply --root '${path}' --plan-sha256 ${sha} --activate`;
    assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
    for (const bad of [
      // missing --plan-sha256 entirely
      `node '${ONBOARDING_SCRIPT}' intake-generate-apply --root '${path}' --activate`,
      // missing --activate
      `node '${ONBOARDING_SCRIPT}' intake-generate-apply --root '${path}' --plan-sha256 ${sha}`,
      // malformed / short / non-hex --plan-sha256
      `node '${ONBOARDING_SCRIPT}' intake-generate-apply --root '${path}' --plan-sha256 ${"a".repeat(63)} --activate`,
      `node '${ONBOARDING_SCRIPT}' intake-generate-apply --root '${path}' --plan-sha256 ${"g".repeat(64)} --activate`,
      // extra trailing arg / wrong length
      `node '${ONBOARDING_SCRIPT}' intake-generate-apply --root '${path}' --plan-sha256 ${sha} --activate --extra flag`,
      // wrong --root
      `node '${ONBOARDING_SCRIPT}' intake-generate-apply --root /tmp/other --plan-sha256 ${sha} --activate`,
      // intake-generate-plan (read-only, GUARDDERIVE-1-covered) does not smuggle in the apply shape
      `node '${ONBOARDING_SCRIPT}' intake-generate-plan --root '${path}' --plan-sha256 ${sha} --activate`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(bad, path), false, bad);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("NVA-W5-COORD-STEP5-2: bootstrap-bind-apply admits exactly the --plan-sha256/--activate shape and no wider one, under exact session readiness", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const sha = "a".repeat(64);
    // The live nextAction promotionApplyAction() constructs for the coordinator-sourced branch
    // (planBoundApplyAction(), onboarding-continuity.mjs) always carries a trailing
    // `--runner <runner>` pair too; withoutRunnerFlag() strips the first matching pair before any
    // branch runs, so both the runner-bearing and runner-less shapes below are admitted identically.
    const command = `node '${ONBOARDING_SCRIPT}' bootstrap-bind-apply --root '${path}' --plan-sha256 ${sha} --activate`;
    assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
    const withRunner = `node '${ONBOARDING_SCRIPT}' bootstrap-bind-apply --root '${path}' --runner codex --plan-sha256 ${sha} --activate`;
    assert.equal(isSanctionedLifecycleCommand(withRunner, path), true, withRunner);
    for (const bad of [
      // missing --plan-sha256 entirely
      `node '${ONBOARDING_SCRIPT}' bootstrap-bind-apply --root '${path}' --activate`,
      // missing --activate
      `node '${ONBOARDING_SCRIPT}' bootstrap-bind-apply --root '${path}' --plan-sha256 ${sha}`,
      // malformed / short / non-hex --plan-sha256
      `node '${ONBOARDING_SCRIPT}' bootstrap-bind-apply --root '${path}' --plan-sha256 ${"a".repeat(63)} --activate`,
      `node '${ONBOARDING_SCRIPT}' bootstrap-bind-apply --root '${path}' --plan-sha256 ${"g".repeat(64)} --activate`,
      // extra trailing arg / wrong length
      `node '${ONBOARDING_SCRIPT}' bootstrap-bind-apply --root '${path}' --plan-sha256 ${sha} --activate --extra flag`,
      // wrong --root
      `node '${ONBOARDING_SCRIPT}' bootstrap-bind-apply --root /tmp/other --plan-sha256 ${sha} --activate`,
      // bootstrap-bind-plan (read-only, GUARDDERIVE-1-covered) does not smuggle in the apply shape
      `node '${ONBOARDING_SCRIPT}' bootstrap-bind-plan --root '${path}' --plan-sha256 ${sha} --activate`,
      // an unrelated onboarding subcommand does not smuggle in this shape
      `node '${ONBOARDING_SCRIPT}' intake-generate-apply --root '${path}' --plan-sha256 ${sha} --activate --extra bootstrap-bind-apply`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(bad, path), false, bad);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("NVA-W5-COORD-STEP5-2: bootstrap-bind-plan admits the bare lifecycle argv via GUARDDERIVE-1's derived admission", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const command = `node '${ONBOARDING_SCRIPT}' bootstrap-bind-plan --root '${path}'`;
    assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
    const withRunner = `node '${ONBOARDING_SCRIPT}' bootstrap-bind-plan --root '${path}' --runner codex`;
    assert.equal(isSanctionedLifecycleCommand(withRunner, path), true, withRunner);
    // an --activate-shaped call is never admitted for the plan half (mutates: false)
    assert.equal(isSanctionedLifecycleCommand(
      `node '${ONBOARDING_SCRIPT}' bootstrap-bind-plan --root '${path}' --plan-sha256 ${"a".repeat(64)} --activate`,
      path,
    ), false);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-CODEXARGV-1 (AC-3): the closure proof for MUTATING_ONBOARDING_ARGV_SHAPES -- the CLI's
// OWN real argv-emission function (automatedMutatingApplyArgv(), scripts/project-onboarding-v3.mjs),
// fed straight into the guard's OWN real admission function (isSanctionedLifecycleCommand()).
// Never a hand-typed string on either side, so the two sides genuinely cannot silently drift
// again: a shape change to MUTATING_ONBOARDING_ARGV_SHAPES that the emission side and the
// admission side disagreed about would fail THIS test, not merely two independent hand-written
// literal assertions that happen to agree today.
test("NVA-CODEXARGV-1 (AC-3): automatedMutatingApplyArgv's own emitted argv is admitted by the guard's real admission function, for every declared mutating subcommand", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const sampleValues = {
      "intake-consent-apply": {
        "--git-author-name": "PO Name", "--git-author-email": "po@example.com",
        "--language": "en", "--profile": "feature",
      },
      "intake-capture-apply": { "--text": "requirement material" },
      "intake-design-questions-apply": {
        "--answers-json": JSON.stringify([{ question: "What is the goal?", answer: "Ship it." }]),
      },
      "intake-generate-apply": { "--plan-sha256": "a".repeat(64) },
      "bootstrap-bind-apply": { "--plan-sha256": "b".repeat(64) },
    };
    assert.deepEqual(
      Object.keys(sampleValues).sort(),
      Object.keys(MUTATING_ONBOARDING_ARGV_SHAPES).sort(),
      "this test must cover every declared mutating subcommand, not a stale subset",
    );
    for (const name of Object.keys(MUTATING_ONBOARDING_ARGV_SHAPES)) {
      const argv = automatedMutatingApplyArgv(name, path, sampleValues[name]);
      const command = `node '${ONBOARDING_SCRIPT}' ${argv.map((token) => `'${token}'`).join(" ")}`;
      assert.equal(isSanctionedLifecycleCommand(command, path), true, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-CODEXARGV-1 (AC-4): regression pin for the specific Antigravity failure the dispatch
// briefing named -- the same emitted command, minus --activate, must stay refused. Built from
// automatedMutatingApplyArgv() (the shared emission this dispatch adds) with "--activate"
// filtered out, so this exercises the SAME generic admission loop the AC-3 test above exercises
// -- proving the loop's own `required` handling for --activate, not a separate hand-typed shape.
test("NVA-CODEXARGV-1 (AC-4): the same emitted mutating-apply argv, with --activate removed, stays refused for every declared subcommand", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const sampleValues = {
      "intake-consent-apply": { "--language": "en", "--profile": "feature" },
      "intake-capture-apply": { "--text": "requirement material" },
      "intake-design-questions-apply": {
        "--answers-json": JSON.stringify([{ question: "What is the goal?", answer: "Ship it." }]),
      },
      "intake-generate-apply": { "--plan-sha256": "a".repeat(64) },
      "bootstrap-bind-apply": { "--plan-sha256": "b".repeat(64) },
    };
    for (const name of Object.keys(MUTATING_ONBOARDING_ARGV_SHAPES)) {
      const argv = automatedMutatingApplyArgv(name, path, sampleValues[name]).filter((token) => token !== "--activate");
      const command = `node '${ONBOARDING_SCRIPT}' ${argv.map((token) => `'${token}'`).join(" ")}`;
      assert.equal(isSanctionedLifecycleCommand(command, path), false, command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * NVA-LCGUARD-3 (backlog: 2026-08-17-lifecycle-guard-omits-the-operator-authority-repair-
 * shape.md). collectOperatorContinuityAuthorityAction() (lib/project-onboarding-v3.mjs)
 * tells a session that gets `operator-authority-required` back from plan-repair to rerun
 * plan-repair/apply-repair with --id --plan-path --prd-path --spec-path --language set to
 * the PO's answers -- the exact five-field, all-or-none operator-confirmed continuity claim
 * the CLI's own usage string documents. The allowlist had no branch admitting either shape,
 * so a session that collected the operator's answers had no route forward at all.
 */
test("NVA-LCGUARD-3: plan-repair and apply-repair admit exactly the operator-authority shape", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const sha = "a".repeat(64);
    const operatorTail = "--id feat-1 --plan-path specs/plan.md --prd-path specs/plan.md --spec-path specs/spec.md --language en";
    const planCommand = `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' ${operatorTail}`;
    assert.equal(isSanctionedLifecycleCommand(planCommand, path), true, planCommand);
    const applyCommand = `node '${ONBOARDING_SCRIPT}' apply-repair --root '${path}' ${operatorTail} --plan-sha256 ${sha} --activate`;
    assert.equal(isSanctionedLifecycleCommand(applyCommand, path), true, applyCommand);
    for (const intent of ["onboarding", "bootstrap", "session", "dispatch"]) {
      const withIntentPlan = `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' ${operatorTail} --intent ${intent}`;
      assert.equal(isSanctionedLifecycleCommand(withIntentPlan, path), true, withIntentPlan);
      const withIntentApply = `node '${ONBOARDING_SCRIPT}' apply-repair --root '${path}' ${operatorTail} --plan-sha256 ${sha} --activate --intent ${intent}`;
      assert.equal(isSanctionedLifecycleCommand(withIntentApply, path), true, withIntentApply);
    }
    // No-regression pins: the pre-existing bare-form plan-repair and digest-form
    // apply-repair, with and without --intent, keep working exactly as before.
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}'`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --intent session`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' apply-repair --root '${path}' --plan-sha256 ${sha} --activate`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' apply-repair --root '${path}' --plan-sha256 ${sha} --activate --intent session`, path), true);
    // NVA-BOOTADMIT-2: project-onboarding-v3.mjs parse() (lines 195-250) is a flat,
    // order-insensitive flag walk, so reordering any of the five operator fields parses
    // identically to the canonical order -- both pre-authorized to flip to admitted.
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --plan-path specs/plan.md --id feat-1 --prd-path specs/plan.md --spec-path specs/spec.md --language en`, path), true);
    assert.equal(isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --plan-path specs/plan.md --prd-path specs/plan.md --language en --spec-path specs/spec.md`, path), true);
    for (const command of [
      // each of the five operator fields missing entirely (positions shift, so no branch matches)
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --plan-path specs/plan.md --prd-path specs/plan.md --spec-path specs/spec.md --language en`,
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --prd-path specs/plan.md --spec-path specs/spec.md --language en`,
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --plan-path specs/plan.md --spec-path specs/spec.md --language en`,
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --plan-path specs/plan.md --prd-path specs/plan.md --language en`,
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --plan-path specs/plan.md --prd-path specs/plan.md --spec-path specs/spec.md`,
      // flag-shaped values (e.g. --id --plan-path with no value)
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id --plan-path specs/plan.md --prd-path specs/plan.md --spec-path specs/spec.md --language en`,
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --plan-path --prd-path specs/plan.md --spec-path specs/spec.md --language en`,
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --plan-path specs/plan.md --prd-path --spec-path specs/spec.md --language en`,
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --plan-path specs/plan.md --prd-path specs/plan.md --spec-path --language en`,
      // empty operator field values
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id '' --plan-path specs/plan.md --prd-path specs/plan.md --spec-path specs/spec.md --language en`,
      // invalid --language enum value
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' --id feat-1 --plan-path specs/plan.md --prd-path specs/plan.md --spec-path specs/spec.md --language fr`,
      // apply-repair is a separate, mutating command and does not admit the plan-repair
      // operator shape without --plan-sha256/--activate
      `node '${ONBOARDING_SCRIPT}' apply-repair --root '${path}' ${operatorTail}`,
      // incomplete apply-repair: operator fields present but --plan-sha256 missing
      `node '${ONBOARDING_SCRIPT}' apply-repair --root '${path}' ${operatorTail} --activate`,
      // incomplete apply-repair: operator fields and digest present but --activate missing
      `node '${ONBOARDING_SCRIPT}' apply-repair --root '${path}' ${operatorTail} --plan-sha256 ${sha}`,
      // incomplete apply-repair: malformed digest
      `node '${ONBOARDING_SCRIPT}' apply-repair --root '${path}' ${operatorTail} --plan-sha256 ${"a".repeat(63)} --activate`,
      // plan-repair does not admit the apply-repair operator tail (--plan-sha256/--activate smuggled in)
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' ${operatorTail} --plan-sha256 ${sha} --activate`,
      // wrong --root
      `node '${ONBOARDING_SCRIPT}' plan-repair --root /tmp/other ${operatorTail}`,
      // extra trailing argument
      `node '${ONBOARDING_SCRIPT}' plan-repair --root '${path}' ${operatorTail} --extra flag`,
      // no other plan-repair sibling admits the operator-authority shape
      `node '${ONBOARDING_SCRIPT}' plan --root '${path}' ${operatorTail}`,
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
    // NVA-BOOTADMIT-2: project-onboarding-v3.mjs parse() (lines 195-250) is a flat,
    // order-insensitive flag walk, so any reordering of --root/--plan-sha256/--activate/
    // --intent parses identically to the canonical order (--runner is stripped before this
    // shape is even checked, by the pre-existing withoutRunnerFlag scan) -- pre-authorized
    // to flip from refused to admitted.
    for (const reordered of [
      `node '${ONBOARDING_SCRIPT}' initialize-runtime --root '${path}' --plan-sha256 ${sha} --intent session --activate --runner claude`,
      `node '${ONBOARDING_SCRIPT}' initialize-runtime --root '${path}' --activate --plan-sha256 ${sha} --runner claude --intent session`,
      `node '${ONBOARDING_SCRIPT}' initialize-runtime --plan-sha256 ${sha} --root '${path}' --activate --runner claude --intent session`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(reordered, path), true, reordered);
    }
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

// GF-060 (backlog: 2026-08-09-guard-lifecycle-ready-runner-allowlist-incomplete.md).
// session-cleanup.mjs's own USAGE text and arg-parsing table document and accept an
// optional `--runner claude|codex` flag on every subcommand this allowlist covers, but
// the allowlist demanded an exact closed argv with no room for it. Investigation for
// this dispatch found the allowlist admitted it for NONE of these subcommands on this
// branch's HEAD (an earlier attempt at the six-subcommand subset, GF-059, was never
// merged -- abandoned worktree branch f3bbf275/20d562bf); this is therefore the first
// landed coverage of the full documented surface, not an extension of an already-merged
// subset. One comprehensive test rather than one per subcommand group, since the fix is
// the same optional-tail predicate applied identically across all four branches.
test("non-ready session-cleanup admits the documented optional --runner tail on every subcommand this allowlist covers", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const digest = "a".repeat(64);
    const admitted = [
      "start --repo '${path}'",
      "status --repo '${path}'",
      "release-binding --repo '${path}'",
      "plan-recovery --repo '${path}'",
      "plan-human-recovery --repo '${path}'",
      "plan-privatization --repo '${path}'",
      `confirm-privatization --repo '\${path}' --plan-sha256 ${digest} --accept`,
      `apply-recovery --repo '\${path}' --plan-sha256 ${digest} --activate`,
      `apply-privatization --repo '\${path}' --plan-sha256 ${digest} --activate`,
      `cleanup --repo '\${path}' --session-descriptor session-01 --expected-descriptor-sha256 ${digest}`,
    ];
    for (const template of admitted) {
      // eslint-disable-next-line no-template-curly-in-string -- intentional: `${path}` is
      // substituted per-iteration below, after the fixture's own `path` is in scope.
      const base = template.replaceAll("${path}", path);
      for (const runner of ["claude", "codex"]) {
        const invocation = `node '${SESSION_CLEANUP_SCRIPT}' ${base} --runner ${runner}`;
        assert.equal(isSanctionedLifecycleCommand(invocation, path), true, invocation);
        assert.equal(evaluateLifecycleReadyGuard(bash(invocation), {
          projectDir: path,
          requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
        }).exitCode, 0, invocation);
      }
      for (const rejected of [
        `node '${SESSION_CLEANUP_SCRIPT}' ${base} --runner cursor`,
        `node '${SESSION_CLEANUP_SCRIPT}' ${base} --runner`,
        `node '${SESSION_CLEANUP_SCRIPT}' ${base} --runner claude --extra`,
        `node '${SESSION_CLEANUP_SCRIPT}' ${base} --runner claude --runner codex`,
        `node '${SESSION_CLEANUP_SCRIPT}' --runner claude ${base}`,
      ]) {
        assert.equal(isSanctionedLifecycleCommand(rejected, path), false, rejected);
        assert.equal(evaluateLifecycleReadyGuard(bash(rejected), {
          projectDir: path,
          requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
        }).exitCode, 2, rejected);
      }
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

// NVA-LCREADONLY-1 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-and-
// tmp-fallback.md): the write-side twin of isReadOnlyDiagnosticCommand()'s narrow read-only
// lane -- a session stuck at `partial` today has no route at all to persist a report of its
// own stuck state, not inside the project root (GUARD-LIFECYCLE-NOT-READY) and not outside
// it (GUARD-CROSS-REPO-MUTATION). This proves the admission is exact by construction (no
// other mkdir target, no other filename, no directory write) and scoped to
// `lifecycleStatus === "partial"` only -- every other PORG-NOT-READY status, restart-required
// among them (already fixtured immediately above), keeps refusing both operations unchanged.
test("NVA-LCREADONLY-1: partial lifecycle admits exactly mkdir scratch and the fixed incident-report write, nothing wider", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const partialDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny("partial"); } };

    // AC-1/AC-2: both admitted mkdir shapes.
    for (const command of ["mkdir scratch", "mkdir -p scratch"]) {
      assert.equal(evaluateLifecycleReadyGuard(bash(command), partialDeps).exitCode, 0, command);
    }

    // AC-3: exact, not substring/prefix-based -- a different target or any extra/reordered
    // flag still refuses.
    for (const command of [
      "mkdir somethingelse",
      "mkdir -p scratch/nested",
      "mkdir scratch extra",
      "mkdir -p -v scratch",
      "mkdir scratch -p",
      "mkdir -pv scratch",
    ]) {
      const result = evaluateLifecycleReadyGuard(bash(command), partialDeps);
      assert.equal(result.exitCode, 2, command);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u, command);
    }

    // AC-4: the one fixed incident-report write, admitted for both Write and Edit.
    for (const input of [write("scratch/incident-report.md"), edit("scratch/incident-report.md")]) {
      assert.equal(evaluateLifecycleReadyGuard(input, partialDeps).exitCode, 0, input.tool_name);
    }

    // AC-5: exact, not a directory or a glob -- any other filename or path still refuses.
    for (const input of [
      write("scratch/other-file.md"),
      write("incident-report.md"),
      edit("incident-report.md"),
      write("scratch/nested/incident-report.md"),
      write("scratch"),
    ]) {
      const result = evaluateLifecycleReadyGuard(input, partialDeps);
      assert.equal(result.exitCode, 2, `${input.tool_name}:${input.tool_input.file_path}`);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u, input.tool_input.file_path);
    }

    // AC-6: the lane is `partial`-only, not a general readiness bypass -- the identical
    // admitted shapes stay refused under a different PORG-NOT-READY status this file already
    // fixtures (restart-required, proven immediately above).
    const restartDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny("restart-required"); } };
    for (const input of [
      bash("mkdir scratch"),
      bash("mkdir -p scratch"),
      write("scratch/incident-report.md"),
      edit("scratch/incident-report.md"),
    ]) {
      const result = evaluateLifecycleReadyGuard(input, restartDeps);
      assert.equal(result.exitCode, 2, `restart-required/${input.tool_name}`);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u, `restart-required/${input.tool_name}`);
    }

    // AC-7: an exactly-ready session's behaviour for both operations is unchanged -- the new
    // branch lives inside evaluateAfterGrammarAdmission()'s catch block, unreachable unless
    // requireProjectOnboardingReadyFn() throws, so a ready session never enters it.
    const readyDeps = {
      projectDir: path,
      requireProjectOnboardingReadyFn() {
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    };
    for (const input of [bash("mkdir scratch"), write("scratch/incident-report.md")]) {
      assert.equal(evaluateLifecycleReadyGuard(input, readyDeps).exitCode, 0, input.tool_name ?? "Bash");
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-LCREADONLY-2 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-and-
// tmp-fallback.md): the Critic-found major from NVA-LCREADONLY-1 -- the narrow diagnosis
// lane above existed but was undiscoverable, because the denial a `partial` session actually
// reads never named it. This proves the denial message itself now names both admitted
// actions when, and only when, typedLifecycleStatus is exactly "partial" -- every other
// status (restart-required and the untyped/null case) keeps the prior two-line message,
// byte-for-byte, with no leaked mention of the diagnosis lane.
test("NVA-LCREADONLY-2: partial denial names the diagnosis lane; other statuses stay unchanged", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");

    // A denied write that does NOT match the admitted lane still refuses, but its own denial
    // message must now also disclose the lane a stuck session could otherwise never find.
    const partialResult = evaluateLifecycleReadyGuard(edit("src/other-file.mjs"), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("partial"); },
    });
    assert.equal(partialResult.exitCode, 2);
    assert.match(partialResult.stderr, /Pipeline session readiness is partial\./u);
    assert.match(
      partialResult.stderr,
      /Re-run the typed project-onboarding-v3 inspection with intent session/u,
    );
    assert.match(partialResult.stderr, /creating the repository's own scratch directory/u);
    assert.match(partialResult.stderr, /writing exactly scratch\/incident-report\.md via Write or Edit/u);

    // restart-required must keep exactly the prior two-line message -- no new text leaked in.
    const restartResult = evaluateLifecycleReadyGuard(edit("src/other-file.mjs"), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("restart-required"); },
    });
    assert.equal(restartResult.exitCode, 2);
    assert.match(restartResult.stderr, /Pipeline session readiness is restart-required\./u);
    assert.doesNotMatch(restartResult.stderr, /scratch/u);
    assert.doesNotMatch(restartResult.stderr, /incident-report/u);
    assert.doesNotMatch(restartResult.stderr, /diagnosis lane/u);

    // The untyped/null case (an unrecognized status, not in CONTROLLING_NON_READY_STATUSES)
    // must also keep its own prior message unchanged, with no leaked mention either.
    const nullResult = evaluateLifecycleReadyGuard(edit("src/other-file.mjs"), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("some-status-outside-the-registry"); },
    });
    assert.equal(nullResult.exitCode, 2);
    assert.match(nullResult.stderr, /Pipeline-governed project writes require an exact V4 ready result for session intent\./u);
    assert.doesNotMatch(nullResult.stderr, /scratch/u);
    assert.doesNotMatch(nullResult.stderr, /incident-report/u);
    assert.doesNotMatch(nullResult.stderr, /diagnosis lane/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-GF-SCRATCH (backlog: 2026-08-28-a-scratch-write-is-refused-during-intake-against-the-
// documented-exemption.md): a fresh, not-yet-onboarded session sitting at `intake-required` or
// `intake-design-questions-required` could write nothing at all, including its own scratch/
// throwaway notes -- contradicting the pipeline-start skill's own claim that scratch/ is always
// safe. Unlike the `partial` lane's single fixed file, this admits ANY path resolving inside
// scratch/ (matching guard-devplan.mjs's own scratch/ prefix exemption). Proves the admission is
// exact by construction (resolve + pathInside, never a substring/prefix-string match) and scoped
// to the two intake statuses only.
test("NVA-GF-SCRATCH: intake statuses admit any resolved scratch/ write and matching mkdir, nothing wider", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");

    for (const status of ["intake-required", "intake-design-questions-required"]) {
      const intakeDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny(status); } };

      // AC-1: any Edit/Write/NotebookEdit write whose resolved path is inside scratch/,
      // including nested paths -- unlike the `partial` lane, this is not one fixed filename.
      for (const input of [
        write("scratch/design.md"),
        edit("scratch/design.md"),
        write("scratch/nested/deep/notes.md"),
        notebookEdit("scratch/analysis.ipynb"),
      ]) {
        assert.equal(evaluateLifecycleReadyGuard(input, intakeDeps).exitCode, 0, `${status}/${input.tool_name}`);
      }

      // AC-2: both admitted mkdir shapes, including a nested target (unlike the `partial`
      // lane's mkdir admission, which refuses a nested target).
      for (const command of ["mkdir scratch", "mkdir -p scratch", "mkdir -p scratch/nested"]) {
        assert.equal(evaluateLifecycleReadyGuard(bash(command), intakeDeps).exitCode, 0, `${status}/${command}`);
      }

      // AC-3: exact by construction -- resolve + pathInside, never a substring/prefix-string
      // match. A sibling directory merely starting with "scratch", a lexical escape back out of
      // scratch/, the bare scratch/ directory itself as a write target, and any other path all
      // still refuse.
      for (const input of [
        write("scratch-evil/file.md"),
        write("scratch/../secret.md"),
        write("scratch"),
        write("src/other-file.mjs"),
        edit("docs/other-file.md"),
      ]) {
        const result = evaluateLifecycleReadyGuard(input, intakeDeps);
        assert.equal(result.exitCode, 2, `${status}/${input.tool_input.file_path}`);
        assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u, `${status}/${input.tool_input.file_path}`);
      }
      for (const command of ["mkdir somethingelse", "mkdir -p /etc/scratch"]) {
        const result = evaluateLifecycleReadyGuard(bash(command), intakeDeps);
        assert.equal(result.exitCode, 2, `${status}/${command}`);
      }

      // AC-4: the refusal for a non-scratch write names the sanctioned scratch/ alternative.
      const refused = evaluateLifecycleReadyGuard(edit("src/other-file.mjs"), intakeDeps);
      assert.match(refused.stderr, new RegExp(`Pipeline session readiness is ${status}\\.`, "u"));
      assert.match(refused.stderr, /A scratch write stays admitted during intake/u);
    }

    // AC-5: the lane is intake-only, not a general readiness bypass -- the identical admitted
    // nested-scratch shape stays refused under a different PORG-NOT-READY status this file
    // already fixtures (restart-required, and partial's own narrower lane).
    const restartDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny("restart-required"); } };
    for (const input of [write("scratch/design.md"), write("scratch/nested/deep/notes.md")]) {
      const result = evaluateLifecycleReadyGuard(input, restartDeps);
      assert.equal(result.exitCode, 2, `restart-required/${input.tool_input.file_path}`);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
    }
    const partialDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny("partial"); } };
    const partialNested = evaluateLifecycleReadyGuard(write("scratch/nested/deep/notes.md"), partialDeps);
    assert.equal(partialNested.exitCode, 2, "partial/scratch/nested/deep/notes.md");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-BL-INTAKEBIND-1 (backlog: 2026-08-19-material-intake-bootstrap-bind-has-no-sanctioned-
// path-to-a-passing-plan-gate.md): the narrow bootstrap-binding-required staging-authoring
// admission -- proves it admits EXACTLY the two staging targets meant for hand-authored
// review (prd_<featureId>.md, spec.md), never design-input.md (an immutable verbatim
// capture), never a different path/tool/lifecycleStatus, and never widens any other lane.
test("NVA-BL-INTAKEBIND-1: bootstrap-binding-required admits exactly the staging PRD/spec authoring writes, nothing wider", () => {
  const path = root();
  const featureId = "onboarding-0123456789ab";
  const prdPath = `project/.onboarding-staging/prd_${featureId}.md`;
  const specPath = "project/.onboarding-staging/spec.md";
  const designInputPath = "project/.onboarding-staging/design-input.md";
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const bindingDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny("bootstrap-binding-required"); } };

    // AC-1: both admitted staging targets, for both Edit and Write.
    for (const input of [write(prdPath), edit(prdPath), write(specPath), edit(specPath)]) {
      assert.equal(evaluateLifecycleReadyGuard(input, bindingDeps).exitCode, 0, `${input.tool_name}:${input.tool_input.file_path}`);
    }

    // AC-2: design-input.md is NEVER admitted -- it must stay an immutable verbatim capture.
    for (const input of [write(designInputPath), edit(designInputPath)]) {
      const result = evaluateLifecycleReadyGuard(input, bindingDeps);
      assert.equal(result.exitCode, 2, `${input.tool_name}:${input.tool_input.file_path}`);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
    }

    // AC-3: no other path, no glob, no directory-wide admission -- a malformed featureId
    // shape, a nested path, and an unrelated staging-adjacent file all still refuse.
    for (const filePath of [
      "project/.onboarding-staging/prd_not-a-real-feature-id.md",
      "project/.onboarding-staging/prd_onboarding-0123456789ab.md.bak",
      "project/.onboarding-staging/nested/prd_onboarding-0123456789ab.md",
      "project/.onboarding-staging/other.md",
      "project/other-file.md",
    ]) {
      const result = evaluateLifecycleReadyGuard(edit(filePath), bindingDeps);
      assert.equal(result.exitCode, 2, filePath);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u, filePath);
    }

    // AC-4: never a tool other than Edit/Write -- NotebookEdit (a write tool, gated by the
    // ordinary readiness lane exactly like Edit/Write for every non-admitted path) still
    // refuses under GUARD-LIFECYCLE-NOT-READY.
    const notebookResult = evaluateLifecycleReadyGuard(notebookEdit(prdPath), bindingDeps);
    assert.equal(notebookResult.exitCode, 2, "NotebookEdit");
    assert.match(notebookResult.stderr, /GUARD-LIFECYCLE-NOT-READY/u, "NotebookEdit");
    // Bash (a write-shaped, non-read-only-diagnostic command, so it does not accidentally
    // hit the unrelated read-only lane) also stays refused -- but, since NVA-STARNEEDLE-1,
    // by the gate-strength SHELL lane itself, before readiness is ever evaluated, exactly
    // like every OTHER GATE_STRENGTH_PATHS entry already refuses a matching shell command
    // (GSSHELL-STAGE-1 pins the identical shape for GS-1). Before that fix, GS-15's shell
    // needle was the bare wildcard character and never actually matched a real path under
    // this directory, so this exact command fell all the way through to the generic
    // readiness fallback instead -- a weaker, later refusal than every sibling entry gets,
    // which was the surface of the bug this test file's own NVA-STARNEEDLE-1 tests fix.
    const bashResult = evaluateLifecycleReadyGuard(bash(`rm ${prdPath}`), bindingDeps);
    assert.equal(bashResult.exitCode, 2, "Bash");
    assert.match(bashResult.stderr, /GUARD-GATE-STRENGTH-SHELL/u, "Bash");

    // AC-5: never a lifecycleStatus other than bootstrap-binding-required -- the identical
    // admitted shapes stay refused under a different PORG-NOT-READY status.
    const restartDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny("restart-required"); } };
    for (const input of [write(prdPath), write(specPath)]) {
      const result = evaluateLifecycleReadyGuard(input, restartDeps);
      assert.equal(result.exitCode, 2, input.tool_input.file_path);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u, input.tool_input.file_path);
    }

    // AC-6: an exactly-ready session's behaviour is unchanged -- the new branch lives inside
    // evaluateAfterGrammarAdmission()'s catch block, unreachable unless
    // requireProjectOnboardingReadyFn() throws.
    const readyDeps = {
      projectDir: path,
      requireProjectOnboardingReadyFn() {
        return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
      },
    };
    assert.equal(evaluateLifecycleReadyGuard(write(prdPath), readyDeps).exitCode, 0);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-MICRO-1 (backlog: 2026-08-09-restart-resume-hint-write-misses-the-project-prefix.md):
// a resume-hint-input write missing exactly the `project/` prefix (same basename, wrong
// directory) is a narrow, diagnosable margin -- the denial must name the one correct path
// directly, before falling through to the generic restart-required message, and must NOT
// escalate to the external-operator ceremony (GUARD-LIFECYCLE-NOT-READY never routes there,
// unlike the closed-shell-grammar/cross-repo-mutation codes this file's HGO wiring covers).
// A near miss that is NOT diagnosable this way (a wholly different basename) still falls
// through to the unchanged generic behaviour.
test("NVA-MICRO-1: a near-miss resume-hint-input write names the correct path and does not escalate", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const restartDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny("restart-required"); } };

    // AC-1: missing exactly the `project/` prefix -- same basename, wrong directory.
    for (const input of [write(".resume-hint-input.json"), edit(".resume-hint-input.json")]) {
      const result = evaluateLifecycleReadyGuard(input, restartDeps);
      assert.equal(result.exitCode, 2, input.tool_name);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u, input.tool_name);
      assert.match(
        result.stderr,
        /The only path admitted is exactly project\/\.resume-hint-input\.json/u,
        input.tool_name,
      );
      // No route to the external-operator ceremony leaks into this denial.
      assert.doesNotMatch(result.stderr, /HGO-/u, input.tool_name);
      assert.doesNotMatch(result.stderr, /attended-host-terminal/u, input.tool_name);
    }

    // AC-2: same basename, a different wrong directory -- still diagnosable, still named.
    const nestedResult = evaluateLifecycleReadyGuard(write("scratch/.resume-hint-input.json"), restartDeps);
    assert.equal(nestedResult.exitCode, 2);
    assert.match(nestedResult.stderr, /The only path admitted is exactly project\/\.resume-hint-input\.json/u);

    // AC-3: a wholly different basename is NOT diagnosable this way -- unchanged generic
    // two-line message, no leaked mention of the near-miss hint (already exercised by this
    // file's own restart-required fixture at "restart-required admits only the consumed
    // bounded resume-hint input and capture", repeated here for the message-content contract).
    const unrelatedResult = evaluateLifecycleReadyGuard(edit("project/resume-hint.json"), restartDeps);
    assert.equal(unrelatedResult.exitCode, 2);
    assert.match(unrelatedResult.stderr, /Pipeline session readiness is restart-required\./u);
    assert.doesNotMatch(unrelatedResult.stderr, /The only path admitted is exactly/u);

    // AC-4: the exact admitted path itself is unaffected -- still verdict(0), not routed
    // through the near-miss hint at all.
    assert.equal(
      evaluateLifecycleReadyGuard(write("project/.resume-hint-input.json"), restartDeps).exitCode,
      0,
    );

    // AC-5: the near-miss hint is restart-required-specific -- a `partial` denial for the
    // identical near-miss path keeps its own existing message contract, no leaked hint text.
    const partialResult = evaluateLifecycleReadyGuard(write(".resume-hint-input.json"), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("partial"); },
    });
    assert.equal(partialResult.exitCode, 2);
    assert.doesNotMatch(partialResult.stderr, /The only path admitted is exactly/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// GF-078 bug 1: Codex's own write-capable tool is `apply_patch`, whose tool_input carries
// the whole patch envelope under `command`, never a Claude-shaped `file_path`. Before the
// fix, isRestartResumeHintInputWrite() gated on WRITE_TOOLS (Edit/Write/NotebookEdit only)
// and returned false unconditionally for this tool name -- this is a direct, exported unit
// regression on that function's own decision, independent of whichever caller's own
// tool-name allowlist a given wiring happens to apply further up the chain.
test("isRestartResumeHintInputWrite recognizes an apply_patch write to the resume-hint input file", () => {
  const path = root();
  try {
    const addPatch = "*** Begin Patch\n*** Add File: project/.resume-hint-input.json\n"
      + "+{\"schema\":\"pipeline.resume-hint.v1\"}\n*** End Patch";
    const updatePatch = "*** Begin Patch\n*** Update File: project/.resume-hint-input.json\n"
      + "@@\n-{}\n+{\"schema\":\"pipeline.resume-hint.v1\"}\n*** End Patch";
    for (const command of [addPatch, updatePatch]) {
      assert.equal(
        isRestartResumeHintInputWrite({ tool_name: "apply_patch", tool_input: { command } }, path),
        true,
        command,
      );
    }
    for (const command of [
      "*** Begin Patch\n*** Add File: project/other-file.json\n+{}\n*** End Patch",
      "*** Begin Patch\n*** Delete File: project/.resume-hint-input.json\n*** End Patch",
      "not a patch at all",
    ]) {
      assert.equal(
        isRestartResumeHintInputWrite({ tool_name: "apply_patch", tool_input: { command } }, path),
        false,
        command,
      );
    }
    // Unaffected: no other tool name gains a new admission, and a malformed tool_input
    // still resolves to the same false a missing case already returned.
    assert.equal(isRestartResumeHintInputWrite({ tool_name: "apply_patch", tool_input: {} }, path), false);
    assert.equal(isRestartResumeHintInputWrite({ tool_name: "Bash", tool_input: { command: "printf x" } }, path), false);
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
    dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
    assert.doesNotMatch(chatResult.stderr, /emit-signature-digest/u, "chat mode has no signing step; nothing to emit a digest for");
    assert.doesNotMatch(chatResult.stderr, /capability consumed/u);

    const sigRoot = hgoGitFixture("signature");
    roots.push(sigRoot);
    const sigResult = evaluateLifecycleReadyGuard(bash(command), { projectDir: sigRoot });
    assert.equal(sigResult.exitCode, 2);
    assert.match(sigResult.stderr, /Human override available for this exact command/u);
    assert.match(sigResult.stderr, /\bplan --repo\b/u);
    assert.match(sigResult.stderr, /prepare-authorization --repo/u);
    // NVA-SIGENTRY-2 F2: the digest-emission step must appear before the human is expected
    // to sign anything out-of-band -- i.e. between prepare-authorization and
    // authorize-by-signature, not merely somewhere in the guidance text.
    assert.match(sigResult.stderr, /emit-signature-digest --repo/u);
    // PO decision 2026-08-18 #12: prepare-authorization/emit-signature-digest are now
    // labelled "in this session" and authorize-by-signature "outside this session" (ADR-0059
    // Decision 1 -- neither of the first two touches the external key). The inserted mode-
    // change label line between emit-signature-digest and authorize-by-signature is allowed
    // for by the optional group below; order and the in-session/outside-this-session split
    // are still pinned.
    assert.match(
      sigResult.stderr,
      /prepare-authorization --repo[^\n]*\n[^\n]*emit-signature-digest --repo[^\n]*\n(?:[^\n]*\n)?[^\n]*authorize-by-signature --repo/u,
      "emit-signature-digest must sit between prepare-authorization and authorize-by-signature",
    );
    assert.match(
      sigResult.stderr,
      /Then, in this session[^\n]*\n[^\n]*prepare-authorization --repo/u,
      "prepare-authorization must be labelled as running in this session",
    );
    assert.match(
      sigResult.stderr,
      /Then, outside this session[^\n]*\n[^\n]*authorize-by-signature --repo/u,
      "authorize-by-signature must be labelled as running outside this session",
    );
    assert.doesNotMatch(sigResult.stderr, /--activate/u, "signature mode must not offer the in-session activate step");
  } finally { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); }
});

// NVA-W4-01B: the flat per-command chain above stays exactly as pinned by the assertions in
// the previous test -- the bounded, copy-safe rendering is appended AFTER it, never in place
// of it, so a terminal that wrapped a line mid-path or mid-digest still has a copy-safe
// alternative to fall back to.
test("NVA-W4-01B: the denial also carries a bounded copy-safe rendering of the ceremony steps, appended after the flat chain", () => {
  const roots = [];
  try {
    const command = "rg -n lifecycle . && touch output.txt";

    const sigRoot = hgoGitFixture("signature");
    roots.push(sigRoot);
    const sigResult = evaluateLifecycleReadyGuard(bash(command), { projectDir: sigRoot });
    assert.equal(sigResult.exitCode, 2);
    assert.match(sigResult.stderr, /Bounded copy-safe rendering of the plan step/u);
    assert.match(sigResult.stderr, /Bounded copy-safe rendering of the prepare-authorization step/u);
    assert.match(sigResult.stderr, /Bounded copy-safe rendering of the emit-signature-digest step/u);
    assert.match(sigResult.stderr, /Bounded copy-safe rendering of the authorize-by-signature step/u);
    assert.doesNotMatch(sigResult.stderr, /Bounded copy-safe rendering of the authorize step/u,
      "signature mode has no in-session activate step; nothing to bound-render for it");
    assert.match(sigResult.stderr, /eval "\$CMD"/u);
    // The bounded block sits strictly after the flat chain, not interleaved with it: the
    // last flat-chain command (authorize-by-signature's full argv) still appears before the
    // first "Bounded copy-safe rendering" headline.
    const flatIndex = sigResult.stderr.indexOf("authorize-by-signature --repo");
    const boundedIndex = sigResult.stderr.indexOf("Bounded copy-safe rendering");
    assert.ok(flatIndex !== -1 && boundedIndex !== -1 && flatIndex < boundedIndex,
      `expected the flat chain before the bounded block:\n${sigResult.stderr}`);

    const chatRoot = hgoGitFixture("chat");
    roots.push(chatRoot);
    const chatResult = evaluateLifecycleReadyGuard(bash(command), { projectDir: chatRoot });
    assert.equal(chatResult.exitCode, 2);
    assert.match(chatResult.stderr, /Bounded copy-safe rendering of the plan step/u);
    assert.match(chatResult.stderr, /Bounded copy-safe rendering of the prepare-authorization step/u);
    assert.match(chatResult.stderr, /Bounded copy-safe rendering of the authorize step/u);
    assert.doesNotMatch(chatResult.stderr, /Bounded copy-safe rendering of the authorize-by-signature step/u,
      "chat mode has no signing step; nothing to bound-render for it");
    assert.doesNotMatch(chatResult.stderr, /Bounded copy-safe rendering of the emit-signature-digest step/u);
  } finally { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); }
});

// NVA-GF-COPYSAFE: guard-lifecycle-ready.mjs's bounded rendering is the known-good reference
// this backlog item cites (2026-08-28-po-facing-commands-are-not-uniformly-rendered-break-
// safe.md) -- boundedOpaqueCopyCommand() moved to no new implementation here, only its import
// path changed (from lib/project-onboarding-v3.mjs to the new lib/copy-safe-command.mjs), so
// this is a wiring regression test: the actual denial's bounded "plan" block must be exactly
// what independently recomputing it from the SAME shared function, on the SAME flat command
// line the denial itself prints, produces -- proving the extraction changed nothing.
test("NVA-GF-COPYSAFE: the bounded 'plan' rendering is byte-identical to recomputing it via the shared copy-safe-command.mjs function from the same flat command line", () => {
  const sigRoot = hgoGitFixture("signature");
  try {
    const command = "rg -n lifecycle . && touch output.txt";
    const sigResult = evaluateLifecycleReadyGuard(bash(command), { projectDir: sigRoot });
    assert.equal(sigResult.exitCode, 2);
    const lines = sigResult.stderr.split("\n");
    const headerIndex = lines.findIndex((line) => /^Human override available for this exact/u.test(line));
    assert.ok(headerIndex !== -1, "expected the human override header line");
    const flatPlanLine = lines[headerIndex + 1];
    assert.match(flatPlanLine, /\bplan --repo\b/u, flatPlanLine);
    const recomputed = boundedOpaqueCopyCommand(flatPlanLine);
    assert.equal(recomputed.maxColumns, 72);
    assert.ok(recomputed.posix, "posix rendering must succeed for a real plan command");
    assert.ok(
      sigResult.stderr.includes(`  posix:\n${recomputed.posix}`),
      "the actual posix bounded block must byte-match the shared function's independent recomputation",
    );
    if (recomputed.powershell) {
      assert.ok(
        sigResult.stderr.includes(`  powershell:\n${recomputed.powershell}`),
        "the actual powershell bounded block must byte-match the shared function's independent recomputation",
      );
    }
  } finally { rmSync(sigRoot, { recursive: true, force: true }); }
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
    assert.match(sig.stderr, /emit-signature-digest --repo/u);
    assert.match(sig.stderr, /authorize-by-signature --repo/u);
    assert.doesNotMatch(sig.stderr, /--activate/u, "signature mode must not offer the in-session activate step");

    const chatRoot = hgoGitFixture("chat");
    roots.push(chatRoot);
    const chat = evaluateLifecycleReadyGuard(bash(XREPO_COMMAND), { projectDir: chatRoot, ...hgoReadyDeps() });
    assert.equal(chat.exitCode, 2, "an unarmed agent gained admission");
    assert.match(chat.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    assert.match(chat.stderr, /\bauthorize --repo\b[^\n]*--activate/u);
    assert.doesNotMatch(chat.stderr, /authorize-by-signature/u);
    assert.doesNotMatch(chat.stderr, /emit-signature-digest/u, "chat mode has no signing step; nothing to emit a digest for");
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
// NVA-BL-75 (backlog: guard-reclassification-changed-what-a-signature-can-lift): override
// REACHABILITY as its own measured axis.
//
// GUARDFIX-1 above measures exitCode and denial code. That is the right instrument for
// "this change admits nothing" and completely silent on "this change moved a command
// between override classes" -- which is what 88d316d actually did, and why it took a Critic
// round rather than a test to notice. A denial code is also an override class: whether a
// human with a private key may subsequently authorize the exact command, and under which
// eligible class. A reclassification can leave every verdict untouched and still move that.
//
// So this corpus pins the PAIR (denial code, override reachability) per command, derived
// from the planner itself -- recordHumanGuardDenial()'s status/code and, where it plans, the
// persisted plan's own commandClass -- and cross-checked against what the refusal TELLS the
// operator. Prose in a plan is not the measurement; the plan's typed fields are.
//
// A red here is the signal, not the problem. It means some change altered who may authorize
// a command, and the answer is a decision (and a note in the record) -- not re-pinning the
// expected value until it matches. The expectations below are measured at HEAD, and record
// the state of the boundary; they are not an endorsement of any single row.

/** The exact denial reason text each refusal prints; the capability binds to it verbatim. */
/**
 * NVA-BL-76: the exact denial reason text the read-scope refusal binds into its HGO request.
 * Kept out of HGO_GRAMMAR_REASON on purpose -- GUARD-READ-SCOPE-OUTSIDE-ROOT is not a grammar
 * code, and the grammar remedy text is precisely what it must not print.
 */
const HGO_READ_SCOPE_REASON =
  "GUARD-READ-SCOPE-OUTSIDE-ROOT: The bounded read-only diagnostic pipeline reads a path outside the project root.";

const REACHABILITY_REASONS = {
  ...HGO_GRAMMAR_REASON,
  "GUARD-CROSS-REPO-MUTATION": XREPO_REASON,
  "GUARD-READ-SCOPE-OUTSIDE-ROOT": HGO_READ_SCOPE_REASON,
};

/**
 * One command on the reachability axis: not "was it admitted", but "who, if anyone, could
 * subsequently admit it". Returns a flat, comparable pair so a diff names the axis that moved.
 */
function overrideReachability(command, projectDir) {
  const result = evaluateLifecycleReadyGuard(bash(command), { projectDir, ...hgoReadyDeps() });
  if (result.exitCode === 0) return { code: "<admitted>", reach: "admitted" };
  const code = (result.stderr.match(/GUARD-[A-Z-]+/u) ?? ["<none>"])[0];
  const reason = REACHABILITY_REASONS[code];
  if (reason === undefined) {
    // A code that never calls the planner at all (GUARD-LIFECYCLE-NOT-READY).
    assert.doesNotMatch(result.stderr, /Human override available/u, command);
    return { code, reach: "never-liftable:not-routed" };
  }
  const recorded = recordHumanGuardDenial({
    rootDir: projectDir,
    pluginRoot: HGO_PLUGIN_ROOT,
    toolName: "Bash",
    toolInput: { command },
    denials: [{ guard: "guard-lifecycle-ready.mjs", reason }],
  });
  if (recorded.status !== "planned") {
    // The operator must be told exactly what the planner concluded -- a class that cannot be
    // armed and a refusal that implies one can be are two different failures.
    assert.doesNotMatch(result.stderr, /Human override available/u, command);
    assert.match(result.stderr, /No human override route is offered/u, command);
    return { code, reach: `never-liftable:${recorded.status}:${recorded.code ?? "<none>"}` };
  }
  assert.match(result.stderr, /Human override available for this exact command/u, command);
  assert.match(result.stderr, /emit-signature-digest --repo/u, command);
  assert.match(result.stderr, /authorize-by-signature --repo/u, command);
  const planned = planHumanGuardOverride({
    rootDir: projectDir,
    pluginRoot: HGO_PLUGIN_ROOT,
    scriptPath: HGO_OVERRIDE_SCRIPT,
    requestSha256: recorded.requestSha256,
  });
  return { code, reach: `liftable-by-signature:${planned.commandClass}` };
}

test("NVA-BL-75: the guard-classification corpus measures override reachability, not only the verdict", () => {
  const sigRoot = hgoGitFixture("signature");
  try {
    for (const [command, code, reach] of [
      // Admitted outright: no denial, so no override class to reach for.
      ["which a b c", "<admitted>", "admitted"],
      // The shape 88d316d is about, in its parseable form: refused by the grammar, and
      // liftable -- the exemption's whole point is that the reason it is refused is truthful.
      ["which a b c 2>/dev/null", "GUARD-REDIRECT-UNAPPROVED", "liftable-by-signature:closed-shell-exact"],
      // The three shapes the reclassification actually moved (cross-repo -> parse). Their
      // reachability did NOT move with them: an unparseable command carrying `>` is refused
      // by HGO's own eligibility before any class is assigned, under either denial code.
      ["which a b c 2>/dev/null; which d", "GUARD-PARSE-UNSUPPORTED", "never-liftable:external-operator-required:HGO-EXTERNAL-ADAPTER-BOUNDARY"],
      ["which a b c 2>/dev/null && which d", "GUARD-PARSE-UNSUPPORTED", "never-liftable:external-operator-required:HGO-EXTERNAL-ADAPTER-BOUNDARY"],
      ["which a b c 2>NUL; which d", "GUARD-PARSE-UNSUPPORTED", "never-liftable:external-operator-required:HGO-EXTERNAL-ADAPTER-BOUNDARY"],
      // Narrowness controls: neither is stderr suppression, so both stay cross-repository.
      ["which a b c &>/dev/null", "GUARD-CROSS-REPO-MUTATION", "never-liftable:external-operator-required:HGO-EXTERNAL-ADAPTER-BOUNDARY"],
      ["which a b c >/dev/null 2>&1", "GUARD-CROSS-REPO-MUTATION", "never-liftable:external-operator-required:HGO-EXTERNAL-ADAPTER-BOUNDARY"],
      // Genuine writes outside the root via a non-redirect argument (cp): still
      // cross-repository, and (ADR-0059 Decision 6) routable through the narrowed class
      // whose plan states what it cannot prove.
      ["cp /etc/hosts /tmp/elsewhere/hosts", "GUARD-CROSS-REPO-MUTATION", "liftable-by-signature:cross-repository-target"],
      // PO decision 2026-08-18 #7 (backlog/items/2026-08-12-cross-repository-redirect-
      // eligibility-does-not-consult-the-sensitive-path-boundary.md): a Bash REDIRECT
      // target is not a permitted target type for the cross-repository-target liftable
      // class at all (tool-based allowlist, not a broader path-content heuristic) -- so
      // BOTH rows below moved from liftable to never-liftable, regardless of whether the
      // specific target happens to match hardBoundaryPath()'s sensitive-pattern regex.
      ["printf implementation 2>/etc/passwd", "GUARD-CROSS-REPO-MUTATION", "never-liftable:external-operator-required:HGO-EXTERNAL-PROJECT-BOUNDARY"],
      ["printf implementation 2>/dev/null > /tmp/elsewhere/out.txt", "GUARD-CROSS-REPO-MUTATION", "never-liftable:external-operator-required:HGO-EXTERNAL-PROJECT-BOUNDARY"],
      // A suppressor standing next to a real external write launders neither the code nor the
      // class: composition removes the route the same command would otherwise have had.
      ["printf implementation 2>/dev/null > /tmp/elsewhere/out.txt; printf done", "GUARD-CROSS-REPO-MUTATION", "never-liftable:external-operator-required:HGO-EXTERNAL-ADAPTER-BOUNDARY"],
      ["codex plugin add pipeline-core@agent-pipeline-local", "GUARD-CROSS-REPO-MUTATION", "liftable-by-signature:exact-command"],
    ]) {
      const measured = overrideReachability(command, sigRoot);
      assert.deepEqual(
        measured,
        { code, reach },
        `override reachability changed for ${JSON.stringify(command)}: expected ${code} / ${reach}, `
          + `measured ${measured.code} / ${measured.reach}. Who may authorize this command moved. `
          + "Record the decision (ADR-0059 Decision 3/4/5/6) before touching this expectation.",
      );
    }
  } finally { rmSync(sigRoot, { recursive: true, force: true }); }
});

test("NVA-BL-75: the reachability labels are proven against a real capability, not read off the message", () => {
  const liftable = hgoGitFixture("signature");
  const unliftable = hgoGitFixture("signature");
  try {
    // "liftable-by-signature" means a real signed capability reaches this denial. Whether the
    // lifted command then survives the checks HGO may not clear is NOVA-LCR-HGO-2's subject,
    // deliberately not re-asserted here: the axis under test is reach, not the tail.
    const grammarDenials = [{ guard: "guard-lifecycle-ready.mjs", reason: HGO_GRAMMAR_REASON["GUARD-REDIRECT-UNAPPROVED"] }];
    hgoArmBySignature(liftable, { command: "which a b c 2>/dev/null" }, grammarDenials);
    const admitted = evaluateLifecycleReadyGuard(bash("which a b c 2>/dev/null"), { projectDir: liftable, ...hgoReadyDeps() });
    assert.match(
      admitted.stderr,
      /\[pipeline-human-override\] guard-lifecycle-ready GUARD-REDIRECT-UNAPPROVED: exact one-time capability consumed/u,
      "a class measured as liftable-by-signature did not consume a genuine signed capability",
    );

    // "never-liftable" means no capability can be armed at all -- proven by the planner
    // refusing to classify the command, not by the absence of a line in the message.
    const composed = "which a b c 2>/dev/null; which d";
    for (const reason of [HGO_GRAMMAR_REASON["GUARD-PARSE-UNSUPPORTED"], XREPO_REASON]) {
      const recorded = recordHumanGuardDenial({
        rootDir: unliftable,
        pluginRoot: HGO_PLUGIN_ROOT,
        toolName: "Bash",
        toolInput: { command: composed },
        denials: [{ guard: "guard-lifecycle-ready.mjs", reason }],
      });
      assert.equal(recorded.status, "external-operator-required", `a capability became armable for ${composed}`);
    }
    const refused = evaluateLifecycleReadyGuard(bash(composed), { projectDir: unliftable, ...hgoReadyDeps() });
    assert.equal(refused.exitCode, 2, composed);
    assert.doesNotMatch(refused.stderr, /capability consumed/u, composed);
  } finally {
    rmSync(liftable, { recursive: true, force: true });
    rmSync(unliftable, { recursive: true, force: true });
  }
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

// Pinned, not aspirational: unlike the escape-outside-home case just above, a symlinked
// `.agent-pipeline` that redirects to another location still INSIDE the same realpathed home
// directory is accepted by the walk rooted there, exactly as isMachinePlaneWritePath()'s own
// doctrine comment now states plainly rather than implies. The redirected write still lands at
// a leaf literally named `machine.json`, since only `.agent-pipeline` can be a symlink here.
test("MACHPATH-1: a symlinked .agent-pipeline that redirects INSIDE the same home directory is a pinned, accepted limit -- the write is admitted, not refused", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  const insideElsewhere = mkdtempSync(join(home, "guard-lifecycle-machine-inside-"));
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    symlinkSync(insideElsewhere, dirname(target));
    assert.equal(isMachinePlaneWritePath(target, { homedirFn: () => home }), true);
    assert.deepEqual(evaluateLifecycleReadyGuard(edit(target), {
      projectDir: path,
      homedirFn: () => home,
      requireProjectOnboardingReadyFn() { return readiness; },
    }), { exitCode: 0, stderr: "" });
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

// Closed, not pinned: unlike the directory-redirect case just above, `machine.json` ITSELF
// already existing as a symlink is refused unconditionally, whatever it points at -- the
// shared containment walk alone cannot catch this (it only climbs when the candidate does not
// yet exist), so isMachinePlaneWritePath() checks the leaf explicitly before that walk runs.
test("MACHPATH-1: machine.json planted as a symlink to another existing file inside the same home directory is refused -- closed, not pinned", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  mkdirSync(dirname(target), { recursive: true });
  const otherExistingFile = join(home, "settings.json");
  writeFileSync(otherExistingFile, "{}\n");
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    symlinkSync(otherExistingFile, target);
    assert.equal(isMachinePlaneWritePath(target, { homedirFn: () => home }), false);
    let readinessCalls = 0;
    const result = evaluateLifecycleReadyGuard(edit(target), {
      projectDir: path,
      homedirFn: () => home,
      requireProjectOnboardingReadyFn() { readinessCalls += 1; return readiness; },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /only inside its own physical project root/u);
    assert.equal(readinessCalls, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("MACHPATH-1: machine.json planted as a symlink to a path outside the home directory is refused -- closed, not pinned", () => {
  const path = root();
  const { home, target } = machinePlaneHomeFixture();
  mkdirSync(dirname(target), { recursive: true });
  const outsideDir = mkdtempSync(join(SCRATCH_ROOT, "guard-lifecycle-machine-leaf-escape-"));
  const outsideFile = join(outsideDir, "settings.json");
  writeFileSync(outsideFile, "{}\n");
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    symlinkSync(outsideFile, target);
    assert.equal(isMachinePlaneWritePath(target, { homedirFn: () => home }), false);
    let readinessCalls = 0;
    const result = evaluateLifecycleReadyGuard(edit(target), {
      projectDir: path,
      homedirFn: () => home,
      requireProjectOnboardingReadyFn() { readinessCalls += 1; return readiness; },
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /only inside its own physical project root/u);
    assert.equal(readinessCalls, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
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

// AC-10: the wiring, not the mechanism. A test that only exercised each side
// separately (the guard's own admission function in isolation, the library's own
// resolver in isolation) would not catch the two drifting apart if a future edit gave
// the guard a second, independent derivation. This test instead writes a real plane
// through the LIBRARY's own writer, resolves the path independently through the
// LIBRARY's own resolver (never the guard's re-export), and then asserts the GUARD
// admits a write at exactly that path -- so the guard's admission and the writer's
// destination are proven to be the same file, not merely the same function reference.
test("MACHPATH-1/AC-10: the path the guard admits is exactly the path the machine-plane writer writes to -- proven via the library's own writer and resolver, not the guard's re-export", () => {
  const path = root();
  const { home } = machinePlaneHomeFixture();
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const dependencies = { homedirFn: () => home };
    const libPath = libMachinePlaneFilePath(dependencies);
    const plane = {
      schema: MACHINE_PLANE_SCHEMA,
      poKeyDirectory: null,
      pushApprovalDefault: "chat",
      routing: null,
      language: null,
      session: null,
      usage: null,
      updatedAt: new Date().toISOString(),
    };
    writeMachinePlane(plane, dependencies);
    assert.equal(existsSync(libPath), true, "the library writer must have created its own resolved path");
    assert.equal(isMachinePlaneWritePath(libPath, dependencies), true);
    assert.deepEqual(evaluateLifecycleReadyGuard(edit(libPath), {
      projectDir: path,
      homedirFn: () => home,
      requireProjectOnboardingReadyFn() { return readiness; },
    }), { exitCode: 0, stderr: "" });
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

/**
 * GSSHELL-STAGE-1. Staging is not a content change, so the gate-strength shell rule
 * has no business refusing it.
 *
 * Measured on 2026-08-09: `git add … pipeline.user.yaml` was refused in the PO's
 * greenfield Codex run, the agent shrank the publication scope around the refusal,
 * and the pushed branch silently lost every Pipeline artifact. Neither greenfield
 * repository has a commit at all. The refusal even told the reader to "use the Edit
 * or Write tool instead", which answers a different question -- those change the
 * bytes, `git add` cannot.
 *
 * Both directions, because an admission test alone would pass just as happily on a
 * rule that had stopped refusing the writes too. Every verb that CAN put different
 * bytes in the working tree stays refused, and the content path is untouched:
 * writing this file still goes through guard-gate-strength.mjs and its ceremony.
 */
test("GSSHELL-STAGE-1: staging and committing a gate-strength file is admitted, while every verb that can rewrite it stays refused", () => {
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  const path = mkdtempSync(join(SCRATCH_ROOT, "guard-lifecycle-gsstage-"));
  // The rule only defends a repository the Pipeline governs, so the fixture must
  // carry the marker -- without it every assertion below passes vacuously, which is
  // how the first version of this test was green while proving nothing.
  writeFileSync(join(path, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const run = (command) => evaluateLifecycleReadyGuard(bash(command), {
    projectDir: path,
    requireProjectOnboardingReadyFn() { return readiness; },
  });
  try {
    assert.match(run("sed -i s/a/b/ pipeline.user.yaml").stderr, /GUARD-GATE-STRENGTH-SHELL/u,
      "fixture check: the rule must actually be active here");
    for (const command of [
      "git add pipeline.user.yaml",
      "git add README.md game.js pipeline.user.yaml specs",
      `git -C ${path} add pipeline.user.yaml`,
      "git commit -m 'chore: record pipeline.user.yaml'",
      "git rm --cached pipeline.user.yaml",
      "git status --short pipeline.user.yaml",
      "git add project/guard-config.json",
    ]) {
      assert.doesNotMatch(run(command).stderr, /GUARD-GATE-STRENGTH-SHELL/u, command);
    }
    for (const command of [
      "git checkout HEAD -- pipeline.user.yaml",
      "git restore pipeline.user.yaml",
      "git restore --source=HEAD pipeline.user.yaml",
      "git stash pop pipeline.user.yaml",
      // NVA-LCGUARD-4 gap 1: was "git apply pipeline.user.yaml.patch" -- a DIFFERENT,
      // unrelated file that merely had the protected name as a prefix of its own longer
      // name. The gate-strength shell rule now requires an exact/path-boundary match
      // (see the dedicated NVA-LCGUARD-4 gap 1 test below), so that derivative filename
      // is correctly no longer swept in here; this line keeps testing the same thing the
      // test intends -- `git apply` naming the real protected file stays refused.
      "git apply pipeline.user.yaml",
      "git reset --hard -- pipeline.user.yaml",
      "git clean -fd pipeline.user.yaml",
      "git rm pipeline.user.yaml",
      "sed -i s/a/b/ pipeline.user.yaml",
      "cp other.yaml pipeline.user.yaml",
      "printf x > pipeline.user.yaml",
    ]) {
      assert.match(run(command).stderr, /GUARD-GATE-STRENGTH-SHELL|GUARD-/u, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

/**
 * NVA-LCGUARD-4 gap 1 (backlog: 2026-08-17-two-guards-block-an-unrelated-file-via-substring-
 * name-matching.md, part A). `gateStrengthShellRefusal()` matched a protected basename as a
 * raw substring anywhere in the command text, so a file that only shares the protected name
 * as a PREFIX of its own longer, unrelated name -- a backup copy such as
 * `pipeline.user.yaml.bak` -- was refused as if it were the real protected file. Fixed to
 * require the needle to appear as a whole filename/path segment (bounded on both sides by
 * anything that could not itself continue the same filename token), not a raw `.includes()`.
 *
 * Both directions, for the same reason GSSHELL-STAGE-1 above checks both: an admission-only
 * test would pass just as happily on a rule that had stopped refusing the real file too.
 */
test("NVA-LCGUARD-4 gap 1: a backup-style filename sharing a protected name as a substring is admitted, while the real protected file stays refused", () => {
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const path = mkdtempSync(join(SCRATCH_ROOT, "guard-lifecycle-gsshell-bak-"));
  // The rule only defends a repository the Pipeline governs, so the fixture must carry the
  // marker -- see GSSHELL-STAGE-1 above for why an unmarked fixture would pass vacuously.
  writeFileSync(join(path, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const run = (command) => evaluateLifecycleReadyGuard(bash(command), {
    projectDir: path,
    requireProjectOnboardingReadyFn() { return readiness; },
  });
  try {
    assert.match(run("sed -i s/a/b/ pipeline.user.yaml").stderr, /GUARD-GATE-STRENGTH-SHELL/u,
      "fixture check: the rule must actually be active here");
    for (const command of [
      "rm project/pipeline.user.yaml.bak",
      "rm project\\pipeline.user.yaml.bak",
      "sed -i s/a/b/ pipeline.user.yaml.bak",
      "cp pipeline.user.yaml.bak restored.yaml",
    ]) {
      assert.doesNotMatch(run(command).stderr, /GUARD-GATE-STRENGTH-SHELL/u, command);
    }
    for (const command of [
      // the real protected file itself, by its bare name and by an absolute-looking path --
      // this positive case must stay refused; the fix narrows the match, it does not remove it.
      "sed -i s/a/b/ pipeline.user.yaml",
      "rm project/pipeline.user.yaml",
      "rm project\\pipeline.user.yaml",
      "cp other.yaml pipeline.user.yaml",
    ]) {
      assert.match(run(command).stderr, /GUARD-GATE-STRENGTH-SHELL/u, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// NVA-STARNEEDLE-1 (backlog: 2026-08-27-gate-strength-shell-lane-refuses-any-command-
// containing-a-quoted-wildcard.md). GS-15's path is `project/.onboarding-staging/*`, whose
// basename() is the bare wildcard character "*" -- a needle that then matched ANY quoted
// "*" anywhere in a command's text, whatever the command actually targeted. Fixed to derive
// the needle from the DIRECTORY a glob-suffixed entry describes, mirroring
// guard-gate-strength.mjs's own write-lane gateStrengthRuleFor() (which already strips the
// trailing "/*" and matches the directory prefix), plus a general, entry-agnostic filter
// that a needle carrying no alphanumeric character can never be produced at all.
// ---------------------------------------------------------------------------------

/**
 * NVA-STARNEEDLE-1 AC-2. Both measured reproductions from the defect record: a scratch-note
 * append whose text documents a hook-matcher literal "*", and an rg diagnostic searching for
 * the literal character, piped to a non-bounded sink (`wc -l`) so it is not already
 * exempted by the read-only classifier above. Neither command names a gate-strength path.
 */
test("NVA-STARNEEDLE-1: a command whose text merely quotes an asterisk is never refused by this lane", () => {
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const path = mkdtempSync(join(SCRATCH_ROOT, "guard-lifecycle-starneedle-fp-"));
  // The rule only defends a repository the Pipeline governs, so the fixture must carry the
  // marker -- see GSSHELL-STAGE-1 above for why an unmarked fixture would pass vacuously.
  writeFileSync(join(path, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const run = (command) => evaluateLifecycleReadyGuard(bash(command), {
    projectDir: path,
    requireProjectOnboardingReadyFn() { return readiness; },
  });
  try {
    assert.match(run("sed -i s/a/b/ pipeline.user.yaml").stderr, /GUARD-GATE-STRENGTH-SHELL/u,
      "fixture check: the rule must actually be active here");
    for (const command of [
      // Append to a gitignored scratch note whose text quotes an asterisk as a documented
      // hook-matcher literal.
      "printf '%s\\n' 'matcher: \"*\"' >> scratch/hook-notes.md",
      // An rg diagnostic searching for a literal "*" character, piped to a sink this
      // guard's own bounded-pipeline classifier does not admit -- so it is not already
      // exempted as read-only before ever reaching the needle match this test pins.
      "rg -n \"a literal * character\" backlog/items | wc -l",
    ]) {
      assert.doesNotMatch(run(command).stderr, /GUARD-GATE-STRENGTH-SHELL/u, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

/**
 * NVA-STARNEEDLE-1 AC-1. The glob-suffixed GS-15 entry now contributes a needle that
 * matches its DIRECTORY (".onboarding-staging"), never the bare wildcard -- and a shell
 * command naming a REAL file under that directory stays refused exactly as before the fix,
 * both by its bare relative path and by an absolute-looking one.
 */
test("NVA-STARNEEDLE-1: a shell command naming a real file under the GS-15 staging directory stays refused", () => {
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const path = mkdtempSync(join(SCRATCH_ROOT, "guard-lifecycle-starneedle-gs15-"));
  writeFileSync(join(path, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  mkdirSync(join(path, "project", ".onboarding-staging"), { recursive: true });
  const run = (command) => evaluateLifecycleReadyGuard(bash(command), {
    projectDir: path,
    requireProjectOnboardingReadyFn() { return readiness; },
  });
  try {
    for (const command of [
      "sed -i s/a/b/ project/.onboarding-staging/prd_test.md",
      "rm project/.onboarding-staging/prd_test.md",
      `rm ${join(path, "project", ".onboarding-staging", "prd_test.md")}`,
    ]) {
      assert.match(run(command).stderr, /GUARD-GATE-STRENGTH-SHELL/u, command);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

/**
 * NVA-STARNEEDLE-1 AC-3. Every entry of GATE_STRENGTH_PATHS (imported straight from
 * guard-gate-strength.mjs, the single shared definition -- TPSHELL-5's own discipline)
 * still refuses a shell command naming a real instance of it. Iterates the live table
 * rather than spot-checking one entry, so a future entry cannot silently drop out of this
 * lane's coverage the way GS-15 did.
 */
test("NVA-STARNEEDLE-1 AC-3: every configured gate-strength path still refuses a shell command naming a real instance of it", () => {
  const readiness = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const path = mkdtempSync(join(SCRATCH_ROOT, "guard-lifecycle-starneedle-ac3-"));
  writeFileSync(join(path, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const run = (command) => evaluateLifecycleReadyGuard(bash(command), {
    projectDir: path,
    requireProjectOnboardingReadyFn() { return readiness; },
  });
  try {
    assert.ok(GATE_STRENGTH_PATHS.length > 0, "fixture check: the shared table must not be empty");
    for (const rule of GATE_STRENGTH_PATHS) {
      const instancePath = rule.path.endsWith("/*") ? `${rule.path.slice(0, -2)}/example.md` : rule.path;
      assert.match(run(`rm ${instancePath}`).stderr, /GUARD-GATE-STRENGTH-SHELL/u, `${rule.id}: ${instancePath}`);
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

/**
 * NVA-STARNEEDLE-1 AC-4. The derivation rule pinned directly, independent of today's
 * specific GATE_STRENGTH_PATHS table: a glob-suffixed path's needle is its directory's own
 * basename, never the wildcard segment; a non-glob path's needle is unchanged (basename of
 * the path itself); and the general filter excludes any needle carrying no alphanumeric
 * character at all -- so a future glob-suffixed entry gets the same treatment automatically
 * and can never silently reintroduce a punctuation-only needle.
 */
test("NVA-STARNEEDLE-1 AC-4: the needle-derivation rule and its defensive filter, pinned directly", () => {
  assert.equal(gateStrengthShellNeedleFor("project/.onboarding-staging/*"), ".onboarding-staging");
  assert.equal(gateStrengthShellNeedleFor("pipeline.user.yaml"), "pipeline.user.yaml");
  assert.equal(gateStrengthShellNeedleFor(".claude/policy-lock.json"), "policy-lock.json");
  // A hypothetical future glob-suffixed entry with a longer directory name gets the
  // identical treatment, automatically, by shape -- never by naming a specific rule id.
  assert.equal(gateStrengthShellNeedleFor("project/.future-staging-dir/*"), ".future-staging-dir");
  // The defensive filter: only a needle carrying at least one alphanumeric character is
  // ever admitted into the match set. A bare wildcard, a lone punctuation character, or an
  // empty string can never pass -- this is the rule that makes this whole class
  // unreintroducible, independent of which entry produced the degenerate needle.
  assert.equal(isMeaningfulGateStrengthShellNeedle("*"), false);
  assert.equal(isMeaningfulGateStrengthShellNeedle("."), false);
  assert.equal(isMeaningfulGateStrengthShellNeedle(""), false);
  assert.equal(isMeaningfulGateStrengthShellNeedle(".onboarding-staging"), true);
  assert.equal(isMeaningfulGateStrengthShellNeedle("pipeline.user.yaml"), true);
  // Every needle GATE_STRENGTH_PATHS actually derives today passes the filter -- the live
  // table has nothing degenerate in it once the derivation rule above is applied.
  for (const rule of GATE_STRENGTH_PATHS) {
    const needle = gateStrengthShellNeedleFor(rule.path);
    assert.ok(isMeaningfulGateStrengthShellNeedle(needle), `${rule.id} produced a non-meaningful needle: ${JSON.stringify(needle)}`);
  }
});

// ---------------------------------------------------------------------------------
// NVA-BL-76 (backlog: 2026-08-08-a-bounded-diagnostic-outside-the-repo-is-refused-under-
// the-wrong-reason.md). The bounded rg-to-head / rg-to-rg pipeline reading a path OUTSIDE
// the project root was refused as GUARD-OPERATOR-UNAPPROVED -- a reason that is false (the
// identical operator is admitted one directory over) under a remedy that cannot work (the
// pipeline was never the objection), in a message whose closing line names the very shape
// it is refusing as admitted. It now has its own code, its own true remedy, and -- because
// reading is not the mutation risk the cross-repository family exists to stop -- an override
// route a human signature can actually reach.
// ---------------------------------------------------------------------------------

/** The reproduction fixture: a governed repo plus a real file outside it. */
function readScopeFixture() {
  const projectDir = hgoGitFixture("signature");
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-read-scope-outside-"));
  const outsideFile = join(outside, "verify-latest.json");
  writeFileSync(outsideFile, '{"Overall":"pass"}\n');
  writeFileSync(join(projectDir, "verify-latest.json"), '{"Overall":"pass"}\n');
  return { projectDir, outside, outsideFile };
}

function readScopeRun(command, projectDir) {
  return evaluateLifecycleReadyGuard(bash(command), { projectDir, ...hgoReadyDeps() });
}

test("NVA-BL-76: the exact reproduction is refused under its own read-scope code, never as an unapproved operator", () => {
  const { projectDir, outside, outsideFile } = readScopeFixture();
  try {
    const refused = readScopeRun(`rg -n 'Overall' ${outsideFile} | head -n 5`, projectDir);
    assert.equal(refused.exitCode, 2);
    assert.match(refused.stderr, /GUARD-READ-SCOPE-OUTSIDE-ROOT: The bounded read-only diagnostic pipeline reads a path outside the project root\./u);
    // The false reason, and every trace of it, is gone.
    assert.doesNotMatch(refused.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
    assert.doesNotMatch(refused.stderr, /unapproved shell operator/u);
    assert.doesNotMatch(refused.stderr, /Rejected element/u,
      "there is no rejected grammar element -- the grammar accepted this command");
    // The self-contradiction: a refusal must not close by listing the shape it just refused.
    assert.doesNotMatch(refused.stderr, /Only bounded rg-to-rg and rg-to-head diagnostic pipelines are admitted as exceptions/u);
    // The advice that cannot work.
    assert.doesNotMatch(refused.stderr, /Do not construct a new composed command/u);
    assert.doesNotMatch(refused.stderr, /Use one simple shell command per tool call/u);
    // AC-5 hygiene: an absolute, machine-specific path never appears in the message.
    assert.ok(!refused.stderr.includes(outside), "the message disclosed the outside-root path");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("NVA-BL-76: the new remedy is true -- each line is executed, not merely matched", () => {
  const { projectDir, outside, outsideFile } = readScopeFixture();
  try {
    const refused = readScopeRun(`rg -n 'Overall' ${outsideFile} | head -n 5`, projectDir);

    // Line 1 claims the identical pipeline is admitted with an in-root target. Run it.
    assert.match(refused.stderr, /The pipeline is not the objection: the identical bounded rg-to-rg \/ rg-to-head pipeline is admitted when every read target resolves inside the project root\./u);
    assert.equal(readScopeRun("rg -n 'Overall' verify-latest.json | head -n 5", projectDir).exitCode, 0,
      "the remedy claims the in-root pipeline is admitted; it was not");

    // Line 3 claims one simple, un-piped read is admitted for any path. Run it, on the very
    // path just refused -- this is the operator's real way out, and the old text never said it.
    assert.match(refused.stderr, /issue it as ONE simple, un-piped read command \(rg, grep, cat, head, tail, wc, stat, file\), a shape this guard admits without a path-location restriction\./u);
    for (const command of [`rg -n 'Overall' ${outsideFile}`, `cat ${outsideFile}`, `head -n 5 ${outsideFile}`]) {
      assert.equal(readScopeRun(command, projectDir).exitCode, 0,
        `the remedy claims this un-piped read is admitted; it was not: ${command}`);
    }

    // Line 2 warns that recomposition cannot help -- pinned as stated, and as measured:
    // splitting the pipeline into a second piped stage still refuses.
    assert.match(refused.stderr, /Recomposing the same read -- splitting it, adding operators, redirects or line continuation -- cannot lift this refusal\./u);
    assert.equal(readScopeRun(`rg -n 'Overall' ${outsideFile} | rg -n Overall`, projectDir).exitCode, 2);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("NVA-BL-76 audit: rg-to-rg carries the identical outside-root asymmetry, in either segment", () => {
  const { projectDir, outside, outsideFile } = readScopeFixture();
  try {
    // The item's third direction: the rg-to-rg exemption was never tested against an outside
    // target. It has the same asymmetry by construction -- that branch calls validateRg() on
    // BOTH segments through the same approvedReadPath() -- so both directions are pinned.
    for (const command of [
      `rg --files ${outside} | rg -n Overall`,
      `rg --files . | rg -n Overall ${outsideFile}`,
      `rg -n 'Overall' ${outsideFile} | rg -n pass`,
    ]) {
      const refused = readScopeRun(command, projectDir);
      assert.equal(refused.exitCode, 2, command);
      assert.match(refused.stderr, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u, command);
      assert.doesNotMatch(refused.stderr, /GUARD-OPERATOR-UNAPPROVED/u, command);
    }
    // The in-root control of the same exemption is still admitted, unchanged.
    assert.equal(readScopeRun("rg --files . | rg -n verify", projectDir).exitCode, 0);

    // The admitted stderr suppressor is part of the bounded shape, so the outside-root
    // variant is the same read-scope refusal -- previously mislabelled GUARD-REDIRECT-UNAPPROVED.
    const suppressed = readScopeRun(`rg -n 'Overall' ${outsideFile} 2>/dev/null | head -n 5`, projectDir);
    assert.equal(suppressed.exitCode, 2);
    assert.match(suppressed.stderr, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
    assert.doesNotMatch(suppressed.stderr, /GUARD-REDIRECT-UNAPPROVED/u);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("NVA-BL-76: nothing but the bounded diagnostic shape is reclassified", () => {
  const { projectDir, outside, outsideFile } = readScopeFixture();
  try {
    // Every other bound must still hold before the new code is reachable: an out-of-range
    // head count, a non-rg producer, a writing consumer and a second real redirect all keep
    // the code they had. A genuinely unbounded or writing outside-root command is untouched.
    for (const [command, code] of [
      [`rg -n 'Overall' ${outsideFile} | head -n 9999`, "GUARD-OPERATOR-UNAPPROVED"],
      [`rg -n 'Overall' ${outsideFile} | tee out.txt`, "GUARD-OPERATOR-UNAPPROVED"],
      [`cat ${outsideFile} | head -n 5`, "GUARD-OPERATOR-UNAPPROVED"],
      [`rg -n 'Overall' ${outsideFile} | xargs rm`, "GUARD-OPERATOR-UNAPPROVED"],
      [`rg -n 'Overall' ${outsideFile} > out.txt | head -n 5`, "GUARD-REDIRECT-UNAPPROVED"],
      [`rg -n 'Overall' ${outsideFile} | head -n 5 > ${join(outside, "captured.txt")}`, "GUARD-CROSS-REPO-MUTATION"],
      [`cp ${outsideFile} ${join(outside, "copy.json")}`, "GUARD-CROSS-REPO-MUTATION"],
    ]) {
      const refused = readScopeRun(command, projectDir);
      assert.equal(refused.exitCode, 2, command);
      assert.match(refused.stderr, new RegExp(code, "u"), command);
      assert.doesNotMatch(refused.stderr, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u,
        `a shape that is not the bounded read-only diagnostic was reclassified as one: ${command}`);
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("NVA-BL-76: the read-scope refusal is override-REACHABLE, and is not the cross-repository-mutation class", () => {
  const { projectDir, outside, outsideFile } = readScopeFixture();
  try {
    // Same instrument as the NVA-BL-75 corpus: not "was it admitted" but "who, if anyone,
    // could subsequently admit it". The PO's classification decision for this item is that a
    // human signature CAN authorize an outside-root READ -- unlike a never-liftable
    // cross-repository mutation, which is what the old code implied by association.
    for (const command of [
      `rg -n 'Overall' ${outsideFile} | head -n 5`,
      `rg --files ${outside} | rg -n Overall`,
      `rg -n 'Overall' ${outsideFile} 2>/dev/null | head -n 5`,
    ]) {
      assert.deepEqual(
        overrideReachability(command, projectDir),
        { code: "GUARD-READ-SCOPE-OUTSIDE-ROOT", reach: "liftable-by-signature:cross-repository-target" },
        "who may authorize an outside-root bounded read moved. This is the boundary NVA-BL-76 set "
          + "deliberately (reading is not the mutation risk the cross-repository family exists to "
          + "stop); record the decision before touching this expectation.",
      );
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("NVA-BL-76: a real signed capability reaches the read-scope denial end to end", () => {
  const { projectDir, outside, outsideFile } = readScopeFixture();
  try {
    // overrideReachability() above only PLANS. This arms and consumes a genuine detached
    // Ed25519 proof, which is also the only check that proves the reason string the denial
    // prints is byte-identical to the one the capability is bound to -- a drift between them
    // would leave the measured route unusable while every plan-level assertion stayed green.
    const command = `rg -n 'Overall' ${outsideFile} | head -n 5`;
    hgoArmBySignature(projectDir, { command }, [{ guard: "guard-lifecycle-ready.mjs", reason: HGO_READ_SCOPE_REASON }]);
    const admitted = evaluateLifecycleReadyGuard(bash(command), { projectDir, ...hgoReadyDeps() });
    assert.match(
      admitted.stderr,
      /\[pipeline-human-override\] guard-lifecycle-ready GUARD-READ-SCOPE-OUTSIDE-ROOT: exact one-time capability consumed/u,
      "the read-scope denial measured as liftable-by-signature did not consume a genuine signed capability",
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// TPSHELL-* (backlog: 2026-08-08-an-authority-gate-is-bypassable-by-choosing-a-different-
// write-tool.md). guard-testpath.mjs is wired for Edit|Write|NotebookEdit only, so a Bash
// or PowerShell write to a TP-protected path passed unclaimed -- measured, not inferred: a
// briefed dispatch hit TP-5, could not clear it, wrote the same bytes through Bash/Node
// `fs`, and reported it as a deviation. guardrails/global.md GL-09 calls this gate
// authority-bearing, so its coverage must not depend on tool choice. The rule now travels
// the shell lane out of the same definition, here, beside GUARD-GATE-STRENGTH-SHELL.
// ---------------------------------------------------------------------------------
const TPSHELL_TARGET = "plugins/pipeline-core/hooks/guard-push.test.mjs";
const TPSHELL_RULES = [
  {
    id: "TP-1",
    pattern: "plugins/pipeline-core/hooks/guard-git\\.test\\.mjs$",
    reason: "guard-git test suite gates the git-guard union.",
  },
  {
    id: "TP-5",
    pattern: "(?:plugins/pipeline-core/hooks/guard-push(?:-v2)?|harness/scripts/pipeline-state)\\.test\\.mjs$",
    reason: "guard-push test suite gates the release/deploy push-enforcement hook.",
  },
];

/** A governed, READY fixture whose guard-config sits wherever the resolver actually looks. */
function tpShellFixture(protectedTestPaths = TPSHELL_RULES, { base = null } = {}) {
  const path = base ?? mkdtempSync(join(tmpdir(), "guard-lifecycle-tpshell-"));
  if (base === null) writeFileSync(join(path, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const configPath = resolveGuardConfigPath(path);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ protectedTestPaths }, null, 2));
  return path;
}

const TPSHELL_READY = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
function tpShellRun(path, command, toolName = "Bash") {
  return evaluateLifecycleReadyGuard(
    { tool_name: toolName, tool_input: { command } },
    { projectDir: path, requireProjectOnboardingReadyFn() { return TPSHELL_READY; } },
  );
}

/**
 * TPSHELL-1. Both directions in one test, for the reason GSSHELL-STAGE-1 states one
 * function up: a refusal-only test would pass just as happily on a rule that had started
 * refusing `node --test <suite>` too -- and unlike the gate-strength paths, these files
 * EXIST to be run, so an over-refusal here would break the very verification the guard's
 * own header prescribes. The fixture is READY, so every admission below is a real exit 0
 * rather than a different guard's refusal standing in for one.
 */
test("TPSHELL-1: a shell write to a protected test path is refused, while reading and running it stay admitted", () => {
  const path = tpShellFixture();
  try {
    for (const command of [
      // the exact shape the reported bypass used
      `node -e "require('fs').writeFileSync('${TPSHELL_TARGET}','x')"`,
      // …and the same idea with the path assembled from a literal basename
      `node -e "writeFileSync(join(dir,'guard-push.test.mjs'),'x')"`,
      `python3 -c "open('${TPSHELL_TARGET}','w').write('x')"`,
      `printf x > ${TPSHELL_TARGET}`,
      `printf x >> ${TPSHELL_TARGET}`,
      `cp scratch/fake.mjs ${TPSHELL_TARGET}`,
      `mv scratch/fake.mjs ${TPSHELL_TARGET}`,
      `rm ${TPSHELL_TARGET}`,
      `truncate -s 0 ${TPSHELL_TARGET}`,
      `tee ${TPSHELL_TARGET}`,
      `sed -i s/a/b/ ${TPSHELL_TARGET}`,
      `git checkout HEAD -- ${TPSHELL_TARGET}`,
      `git apply ${TPSHELL_TARGET}`,
      // a second configured rule, and its non-plugin sibling path
      "rm plugins/pipeline-core/hooks/guard-git.test.mjs",
      "rm harness/scripts/pipeline-state.test.mjs",
    ]) {
      const result = tpShellRun(path, command);
      assert.equal(result.exitCode, 2, `admitted a shell write: ${command}`);
      assert.match(result.stderr, new RegExp(TESTPATH_SHELL_DENIAL_CODE, "u"), command);
    }
    for (const command of [
      `node --test ${TPSHELL_TARGET}`,
      `node ${TPSHELL_TARGET}`,
      `cat ${TPSHELL_TARGET}`,
      `rg -n describe ${TPSHELL_TARGET}`,
      `git add ${TPSHELL_TARGET}`,
      `git diff ${TPSHELL_TARGET}`,
      `git log ${TPSHELL_TARGET}`,
      // a differently-named neighbour that merely carries the protected name as a prefix
      `rm ${TPSHELL_TARGET}.bak`,
      // an unprotected suite, written freely
      "cp a.mjs src/other.test.mjs",
    ]) {
      const result = tpShellRun(path, command);
      assert.equal(result.exitCode, 0, `refused a read/run/unrelated command: ${command} -- ${result.stderr}`);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * TPSHELL-2. The lane is config-driven exactly like the write lane: a project that
 * protects nothing gets nothing new refused. Without this, TPSHELL-1 could be green on a
 * rule that refused those commands unconditionally.
 */
test("TPSHELL-2: with no protectedTestPaths configured the shell lane claims nothing", () => {
  const path = tpShellFixture([]);
  try {
    for (const command of [
      `node -e "require('fs').writeFileSync('${TPSHELL_TARGET}','x')"`,
      `cp scratch/fake.mjs ${TPSHELL_TARGET}`,
      `rm ${TPSHELL_TARGET}`,
    ]) {
      assert.doesNotMatch(tpShellRun(path, command).stderr, new RegExp(TESTPATH_SHELL_DENIAL_CODE, "u"), command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * TPSHELL-3. PowerShell is wired into the SAME PreToolUse matcher as Bash and returns
 * early from every POSIX check below the gate-strength lane -- the exact asymmetry that
 * left `Set-Content project/guard-config.json` unclaimed for the sibling gate. The
 * test-path lane runs before that early return, so it covers both shells.
 */
test("TPSHELL-3: a PowerShell write cmdlet naming a protected test path is refused, Get-Content is not", () => {
  const path = tpShellFixture();
  try {
    for (const command of [
      `Set-Content ${TPSHELL_TARGET} "x"`,
      `Add-Content ${TPSHELL_TARGET} "x"`,
      `Remove-Item ${TPSHELL_TARGET}`,
      `Copy-Item other.mjs ${TPSHELL_TARGET}`,
    ]) {
      const result = tpShellRun(path, command, "PowerShell");
      assert.equal(result.exitCode, 2, `admitted a PowerShell write: ${command}`);
      assert.match(result.stderr, new RegExp(TESTPATH_SHELL_DENIAL_CODE, "u"), command);
    }
    assert.equal(tpShellRun(path, `Get-Content ${TPSHELL_TARGET}`, "PowerShell").exitCode, 0);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * TPSHELL-4. The half that decides whether this closes the gap or relocates it. The
 * reported bypass happened because the SANCTIONED route was closed before the unsanctioned
 * one was taken, so a refusal with no lift would reproduce the same outcome one layer over.
 * Per the item's own triage (PO, 2026-08-11: "human override muss möglich sein per Signatur
 * oder Chat je Config") this refusal carries the same audited chat-or-signature ceremony the
 * write lane already offers -- not a new mechanism. Both modes are armed for real here, and
 * the capability's single use is checked, because an override that stayed armed would be a
 * standing hole rather than one audited action.
 */
test("TPSHELL-4: the shell-lane refusal is liftable by a real chat- and signature-armed capability, once", () => {
  for (const mode of ["chat", "signature"]) {
    const path = tpShellFixture(TPSHELL_RULES, { base: hgoGitFixture(mode) });
    try {
      const command = `cp scratch/fake.mjs ${TPSHELL_TARGET}`;
      const first = tpShellRun(path, command);
      assert.equal(first.exitCode, 2, `precondition (${mode}): the shell lane must refuse first`);
      assert.match(first.stderr, new RegExp(TESTPATH_SHELL_DENIAL_CODE, "u"), mode);
      // ADR-0059 Decision 4: the denial names the CURRENTLY CONFIGURED mode's next command.
      if (mode === "chat") {
        assert.match(first.stderr, /guard-human-override\.mjs" authorize --repo/u, "chat denial must name its own activate step");
        assert.doesNotMatch(first.stderr, /authorize-by-signature/u, "chat denial must not name signature's step");
      } else {
        assert.match(first.stderr, /authorize-by-signature/u, "signature denial must name the signed step");
        assert.doesNotMatch(first.stderr, /--activate/u, "signature denial must not offer in-session activation");
      }

      const denials = [{
        guard: "guard-lifecycle-ready.mjs",
        reason: `${TESTPATH_SHELL_DENIAL_CODE}: TP-5: ${TPSHELL_RULES[1].reason}`,
      }];
      if (mode === "chat") hgoArmByChat(path, { command }, denials);
      else hgoArmBySignature(path, { command }, denials);

      const admitted = evaluateLifecycleReadyGuard(bash(command), {
        projectDir: path,
        requireProjectOnboardingReadyFn() { return TPSHELL_READY; },
      });
      assert.equal(admitted.exitCode, 0, `${mode}-armed capability did not admit the exact command: ${admitted.stderr}`);
      assert.match(
        admitted.stderr,
        new RegExp(`\\[pipeline-human-override\\] guard-lifecycle-ready ${TESTPATH_SHELL_DENIAL_CODE}: exact one-time capability consumed`, "u"),
        mode,
      );
      assert.equal(tpShellRun(path, command).exitCode, 2, `the ${mode} capability was reusable`);
    } finally { rmSync(path, { recursive: true, force: true }); }
  }
});

/**
 * TPSHELL-5. One definition, two lanes. If the shell lane ever grew its own copy of the
 * rule list, the two lanes could silently disagree about which paths are protected -- the
 * failure this whole item is about, rebuilt inside the fix. Asserted against THIS
 * repository's real committed guard-config rather than a fixture, so a rule added there and
 * not reachable from the shell lane fails here.
 */
test("TPSHELL-5: the shell lane and the write lane resolve the same rules from the same committed config", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const { rules } = loadProtectedTestPathRules({ rootDir: repoRoot });
  assert.ok(rules.length > 0, "this repository must have protectedTestPaths configured for this test to mean anything");
  for (const rule of rules) {
    assert.ok(typeof rule.id === "string" && rule.id !== "", "every rule carries an id the denial can name");
  }
  // Every configured rule is reachable from the shell lane through at least one write shape.
  const guardGit = rules.find((rule) => rule.re.test("plugins/pipeline-core/hooks/guard-git.test.mjs"));
  assert.ok(guardGit, "TP-1 must be resolvable from the shared loader");
  const hit = protectedTestPathShellHit({
    command: "rm plugins/pipeline-core/hooks/guard-git.test.mjs",
    rules,
    root: repoRoot,
  });
  assert.equal(hit?.rule.id, guardGit.id);
});

/**
 * TPSHELL-6. The narrower literal-basename lane exists so opaque interpreter code that
 * assembles a path (`join(dir, "guard-push.test.mjs")`) is still caught. It derives its
 * needles FROM the configured patterns, so it cannot drift -- but a derivation that
 * silently produced nothing would leave that lane inert while every other assertion above
 * stayed green, which is exactly how the first version of it behaved.
 */
test("TPSHELL-6: literal basenames are derived from the configured patterns, alternation included", () => {
  const { rules } = loadProtectedTestPathRules({
    rootDir: fileURLToPath(new URL("../../../", import.meta.url)),
  });
  const needles = protectedTestPathBasenameNeedles(rules).map((entry) => entry.needle);
  assert.ok(needles.includes("guard-git.test.mjs"), `plain pattern yielded no needle: ${needles.join(", ")}`);
  // TP-5 is an alternation with a nested optional group -- and it guards the very file the
  // reported bypass wrote to, so "too clever to reduce" is not an acceptable outcome here.
  for (const needle of ["guard-push.test.mjs", "guard-push-v2.test.mjs", "pipeline-state.test.mjs"]) {
    assert.ok(needles.includes(needle), `alternation pattern yielded no needle for ${needle}: ${needles.join(", ")}`);
  }
});

/**
 * TPSHELL-7 (Critic finding, backlog: 2026-08-08-an-authority-gate-is-bypassable-by-choosing-
 * a-different-write-tool.md). GL-09's own verification clause: "Each authority-bearing gate
 * carries a fault-injection test that raises inside the blocking path and asserts the block
 * exit code -- not merely that a catch is present." The pre-fix code caught any classifier
 * exception and returned null (fail OPEN, admitting the command unseen); this asserts the
 * fixed behavior fails CLOSED instead, and that a command the classifier genuinely could not
 * evaluate is never silently admitted alongside a command it could.
 */
test("TPSHELL-7: a classifier fault fails closed (GL-09), never silently admits the command", () => {
  const path = tpShellFixture();
  try {
    const command = `cp scratch/fake.mjs ${TPSHELL_TARGET}`;
    const faulting = () => { throw new Error("synthetic classifier fault"); };
    const result = evaluateLifecycleReadyGuard(
      { tool_name: "Bash", tool_input: { command } },
      {
        projectDir: path,
        requireProjectOnboardingReadyFn() { return TPSHELL_READY; },
        protectedTestPathShellHitFn: faulting,
      },
    );
    assert.equal(result.exitCode, 2, "a classifier fault must block, not admit");
    assert.match(result.stderr, new RegExp(`${TESTPATH_SHELL_DENIAL_CODE}-FAULT`, "u"));
    assert.match(result.stderr, /synthetic classifier fault/u, "the fault reason is surfaced, not swallowed silently");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------
// DEVPLANSHELL-* : the shell lane of the Dev-Plan lifecycle gate (GUARD-DEVPLAN-SHELL),
// mirroring TPSHELL-* immediately above -- see that block's own header for the shared
// rationale (GL-09 authority-bearing coverage must not depend on tool choice). This gate
// has no separate rules-config file of its own to load -- `devPlanGateVerdict()` reads the
// manifest/State directly -- so there is no TPSHELL-5/TPSHELL-6-style "shared config
// source" / "literal-basename derivation" pair to mirror here; both were specific to the
// protected-test-path gate's own rules loader.
// ---------------------------------------------------------------------------------
const DEVPLANSHELL_TARGET = "src/app.js";
const DEVPLANSHELL_MANIFEST_BLOCKING =
  "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n";
const DEVPLANSHELL_UNAPPROVED_STATE = {
  schema: "pipeline.state.v0",
  activeFeature: { id: "devplanshell-feature", planPath: ".claude/plans/devplanshell.md", phase: "design" },
  planApproved: false,
};

/** A governed, READY fixture with the dev-plan gate blocking and an unapproved feature -- the
 * same DP07 shape guard-devplan.test.mjs uses for its own "block" case, at the LEGACY_STATE /
 * LEGACY_MANIFEST paths (`.claude/pipeline.yaml`, `.claude/pipeline-state.json`) devPlanGateVerdict()
 * actually reads. `.claude/pipeline.yaml` is itself a GOVERNANCE_MARKERS entry, so no separate
 * `pipeline.user.yaml` marker (as tpShellFixture() writes) is needed to make the fixture governed.
 */
function devPlanShellFixture() {
  const path = mkdtempSync(join(tmpdir(), "guard-lifecycle-devplanshell-"));
  mkdirSync(join(path, ".claude"), { recursive: true });
  writeFileSync(join(path, ".claude", "pipeline.yaml"), DEVPLANSHELL_MANIFEST_BLOCKING);
  writeFileSync(join(path, ".claude", "pipeline-state.json"), JSON.stringify(DEVPLANSHELL_UNAPPROVED_STATE));
  return path;
}

function devPlanShellRun(path, command, toolName = "Bash") {
  return evaluateLifecycleReadyGuard(
    { tool_name: toolName, tool_input: { command } },
    { projectDir: path, requireProjectOnboardingReadyFn() { return TPSHELL_READY; } },
  );
}

/**
 * DEVPLANSHELL-1. Both directions in one test, for the same reason TPSHELL-1 states: a
 * refusal-only test would pass just as happily on a rule that had started refusing reads too.
 */
test("DEVPLANSHELL-1: a shell write to a dev-plan-gated path is refused, while reading stays admitted", () => {
  const path = devPlanShellFixture();
  try {
    for (const command of [
      `printf x > ${DEVPLANSHELL_TARGET}`,
      `printf x >> ${DEVPLANSHELL_TARGET}`,
      `cp scratch/fake.js ${DEVPLANSHELL_TARGET}`,
      `mv scratch/fake.js ${DEVPLANSHELL_TARGET}`,
      `rm ${DEVPLANSHELL_TARGET}`,
      `tee ${DEVPLANSHELL_TARGET}`,
      `sed -i s/a/b/ ${DEVPLANSHELL_TARGET}`,
      `node -e "require('fs').writeFileSync('${DEVPLANSHELL_TARGET}','x')"`,
    ]) {
      const result = devPlanShellRun(path, command);
      assert.equal(result.exitCode, 2, `admitted a shell write: ${command}`);
      assert.match(result.stderr, new RegExp(DEVPLAN_SHELL_DENIAL_CODE, "u"), command);
    }
    for (const command of [
      `cat ${DEVPLANSHELL_TARGET}`,
      `rg -n foo ${DEVPLANSHELL_TARGET}`,
      `git add ${DEVPLANSHELL_TARGET}`,
      `git diff ${DEVPLANSHELL_TARGET}`,
      `git log ${DEVPLANSHELL_TARGET}`,
    ]) {
      const result = devPlanShellRun(path, command);
      assert.equal(result.exitCode, 0, `refused a read/unrelated command: ${command} -- ${result.stderr}`);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * DEVPLANSHELL-2. `DEFAULT_EXEMPT_PREFIXES` iterated straight from the module the gate itself
 * exports, not retyped here -- the same single-source discipline TPSHELL-5 pins for the
 * test-path gate's rules loader, applied to this gate's exempt-prefix list instead.
 */
test("DEVPLANSHELL-2: a target under an exempt prefix is not blocked by this lane", () => {
  const path = devPlanShellFixture();
  try {
    for (const prefix of DEFAULT_EXEMPT_PREFIXES) {
      const target = `${prefix}devplanshell-probe.js`;
      // A non-redirect write shape (as TPSHELL-2 itself uses) -- a `>` redirect is subject
      // to its own, unrelated grammar-approval check further down the guard, which would
      // otherwise contaminate this lane's own "not blocked" signal with a different denial.
      const command = `cp scratch/fake.js ${target}`;
      const result = devPlanShellRun(path, command);
      assert.equal(result.exitCode, 0, `blocked an exempt-prefix target: ${command} -- ${result.stderr}`);
      assert.doesNotMatch(result.stderr, new RegExp(DEVPLAN_SHELL_DENIAL_CODE, "u"), command);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * DEVPLANSHELL-3. PowerShell is wired into the SAME PreToolUse matcher as Bash, exactly per
 * TPSHELL-3's own header for its sibling gate: both the test-path AND dev-plan shell lanes
 * sit inside the same `SHELL_TOOLS.includes(toolName)` block above the POSIX-only early
 * return, so both cover PowerShell too.
 */
test("DEVPLANSHELL-3: a PowerShell write cmdlet naming a dev-plan-gated path is refused, Get-Content is not", () => {
  const path = devPlanShellFixture();
  try {
    for (const command of [
      `Set-Content ${DEVPLANSHELL_TARGET} "x"`,
      `Add-Content ${DEVPLANSHELL_TARGET} "x"`,
      `Remove-Item ${DEVPLANSHELL_TARGET}`,
      `Copy-Item other.js ${DEVPLANSHELL_TARGET}`,
    ]) {
      const result = devPlanShellRun(path, command, "PowerShell");
      assert.equal(result.exitCode, 2, `admitted a PowerShell write: ${command}`);
      assert.match(result.stderr, new RegExp(DEVPLAN_SHELL_DENIAL_CODE, "u"), command);
    }
    assert.equal(devPlanShellRun(path, `Get-Content ${DEVPLANSHELL_TARGET}`, "PowerShell").exitCode, 0);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

/**
 * DEVPLANSHELL-4 (mirrors TPSHELL-7). GL-09's own verification clause: a fault-injection test
 * that raises inside the blocking path and asserts the block exit code, never merely that a
 * catch is present. The pre-existing shell-lane pattern already fails CLOSED (see
 * devPlanShellRefusalHit()'s own doc comment); this pins that a command the classifier
 * genuinely could not evaluate is never silently admitted alongside one it could.
 */
test("DEVPLANSHELL-4: a classifier fault fails closed (GL-09), never silently admits the command", () => {
  const path = devPlanShellFixture();
  try {
    const command = `cp scratch/fake.js ${DEVPLANSHELL_TARGET}`;
    const faulting = () => { throw new Error("synthetic devplan classifier fault"); };
    const result = evaluateLifecycleReadyGuard(
      { tool_name: "Bash", tool_input: { command } },
      {
        projectDir: path,
        requireProjectOnboardingReadyFn() { return TPSHELL_READY; },
        devPlanGateVerdictFn: faulting,
      },
    );
    assert.equal(result.exitCode, 2, "a classifier fault must block, not admit");
    assert.match(result.stderr, new RegExp(`${DEVPLAN_SHELL_DENIAL_CODE}-FAULT`, "u"));
    assert.match(result.stderr, /synthetic devplan classifier fault/u, "the fault reason is surfaced, not swallowed silently");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------
// NVA-BOOTRECEIPT-1: makes a dispatched subagent's preflight obligation mechanically
// checkable. Fixtures below build REAL directories (never an in-memory fake store) so the
// governance-marker check (`existsSyncFn` at the project root) and the bootstrap-receipt
// gate (the same dependency key, at the fake `<git-common-dir>`) both resolve against real
// disk without a fixture collision.
// ---------------------------------------------------------------------------------------

/**
 * A real dispatched-subagent transcript: parent directory literally named `subagents`,
 * with the sibling `<stem>.meta.json` `subagentIdentity()` (guard-dispatch-budget.mjs)
 * requires -- matching that module's own empirically observed on-disk shape, never a
 * guessed layout. `agentType: null` omits the meta.json sibling entirely, for the
 * unresolved-identity fixtures below.
 */
function subagentTranscript(agentId = "abc123", agentType = "pipeline-core:goldfish-deep", spawnDepth = 1) {
  const sessionDir = mkdtempSync(join(tmpdir(), "guard-lifecycle-subagent-session-"));
  const subagentsDir = join(sessionDir, "subagents");
  mkdirSync(subagentsDir, { recursive: true });
  const transcriptPath = join(subagentsDir, `agent-${agentId}.jsonl`);
  writeFileSync(transcriptPath, "");
  if (agentType !== null) {
    writeFileSync(join(subagentsDir, `agent-${agentId}.meta.json`), JSON.stringify({
      agentType, description: "test", toolUseId: "t1", spawnDepth,
    }));
  }
  return transcriptPath;
}

/** A real, throwaway directory standing in for `<git-common-dir>` -- never a real `.git`. */
function bootstrapCommonDirFixture() {
  return mkdtempSync(join(tmpdir(), "guard-lifecycle-bootstrap-common-"));
}

function bootstrapReceiptPathFixture(commonDir, agentId) {
  return join(commonDir, "agent-pipeline", "bootstrap-receipt", `${agentId}.json`);
}

function bootstrapObservationsPathFixture(commonDir) {
  return join(commonDir, "agent-pipeline", "bootstrap-receipt", "observations.jsonl");
}

function subagentInput(toolName, transcriptPath, toolInput) {
  return { tool_name: toolName, tool_input: toolInput, transcript_path: transcriptPath };
}

function bootstrapGovernedRoot() {
  const path = root();
  writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
  return path;
}

test("isSanctionedStartPreflightInvocation: matches only the exact zero-argument preflight invocation, never a looser shape", () => {
  const path = root();
  try {
    assert.equal(isSanctionedStartPreflightInvocation(`node '${START_PREFLIGHT_SCRIPT}'`, path), true);
    // Near misses: this is the case NVA-BOOTRECEIPT-1's whole design turns on.
    assert.equal(isSanctionedStartPreflightInvocation("pwd", path), false);
    assert.equal(isSanctionedStartPreflightInvocation(`node '${START_PREFLIGHT_SCRIPT}' --extra`, path), false);
    assert.equal(isSanctionedStartPreflightInvocation(`node '${ONBOARDING_SCRIPT}'`, path), false);
    assert.equal(isSanctionedStartPreflightInvocation("echo not-node", path), false);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("NVA-BOOTRECEIPT-1: a subagent's sanctioned preflight Bash call writes a receipt, and a subsequent Edit then passes", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const transcriptPath = subagentTranscript();
  try {
    const bashResult = evaluateLifecycleReadyGuard(
      subagentInput("Bash", transcriptPath, { command: `node "${START_PREFLIGHT_SCRIPT}"` }),
      { projectDir: path, resolveGitCommonDirFn: () => commonDir, requireProjectOnboardingReadyFn: () => deny() },
    );
    assert.equal(bashResult.exitCode, 0, "the sanctioned preflight command itself must still be admitted");

    const receiptPath = bootstrapReceiptPathFixture(commonDir, "abc123");
    assert.ok(existsSync(receiptPath), "a receipt file must exist after the sanctioned preflight ran");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(receipt.agentId, "abc123");
    assert.equal(receipt.agentType, "pipeline-core:goldfish-deep");

    const editResult = evaluateLifecycleReadyGuard(
      subagentInput("Edit", transcriptPath, { file_path: join(path, "src", "implementation.mjs") }),
      { projectDir: path, resolveGitCommonDirFn: () => commonDir, requireProjectOnboardingReadyFn: () => readyStub() },
    );
    assert.equal(editResult.exitCode, 0, "an Edit from the same subagent must pass once its receipt exists");
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(dirname(transcriptPath)), { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: near-miss Bash commands do not write a receipt", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const transcriptPath = subagentTranscript("nearmiss1");
  try {
    for (const command of ["pwd", `node "${START_PREFLIGHT_SCRIPT}" --extra`]) {
      evaluateLifecycleReadyGuard(
        subagentInput("Bash", transcriptPath, { command }),
        { projectDir: path, resolveGitCommonDirFn: () => commonDir, requireProjectOnboardingReadyFn: () => deny() },
      );
    }
    assert.equal(existsSync(bootstrapReceiptPathFixture(commonDir, "nearmiss1")), false, "a near-miss command must never write a receipt");
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(dirname(transcriptPath)), { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: a subagent's first Edit/Write/NotebookEdit with no receipt is denied, naming the exact preflight command", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  try {
    for (const [toolName, toolInput] of [
      ["Edit", { file_path: "src/implementation.mjs" }],
      ["Write", { file_path: join(path, "src", "implementation.mjs") }], // absolute path fixture
      ["NotebookEdit", { notebook_path: "src/implementation.ipynb" }],
    ]) {
      const transcriptPath = subagentTranscript(`deny-${toolName}`);
      try {
        const result = evaluateLifecycleReadyGuard(
          subagentInput(toolName, transcriptPath, toolInput),
          { projectDir: path, resolveGitCommonDirFn: () => commonDir },
        );
        assert.equal(result.exitCode, 2, toolName);
        assert.match(result.stderr, /GUARD-BOOTSTRAP-RECEIPT-MISSING/u, toolName);
        assert.match(result.stderr, new RegExp(`node "${START_PREFLIGHT_SCRIPT.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}"`, "u"), toolName);
      } finally { rmSync(dirname(dirname(transcriptPath)), { recursive: true, force: true }); }
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: a subagent's Edit WITH a receipt is allowed", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const transcriptPath = subagentTranscript("hasreceipt1");
  try {
    const receiptPath = bootstrapReceiptPathFixture(commonDir, "hasreceipt1");
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, JSON.stringify({ schema: "pipeline.bootstrap-receipt.v1", agentId: "hasreceipt1" }));
    const result = evaluateLifecycleReadyGuard(
      subagentInput("Edit", transcriptPath, { file_path: "src/implementation.mjs" }),
      { projectDir: path, resolveGitCommonDirFn: () => commonDir, requireProjectOnboardingReadyFn: () => readyStub() },
    );
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(dirname(transcriptPath)), { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: the orchestrating session is never gated, whatever the receipt state", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const { transcriptPath } = claudeMemorySessionFixture(); // parent dir NOT named `subagents`
  try {
    const result = evaluateLifecycleReadyGuard(
      subagentInput("Edit", transcriptPath, { file_path: "src/implementation.mjs" }),
      { projectDir: path, resolveGitCommonDirFn: () => commonDir, requireProjectOnboardingReadyFn: () => readyStub() },
    );
    assert.equal(result.exitCode, 0);
    assert.equal(existsSync(bootstrapObservationsPathFixture(commonDir)), false, "the orchestrator must never be logged by this gate either");
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(transcriptPath), { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: Read, Grep and Glob are never gated for a subagent with no receipt", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const transcriptPath = subagentTranscript("readonly1");
  try {
    for (const toolName of ["Read", "Grep", "Glob"]) {
      const result = evaluateLifecycleReadyGuard(
        subagentInput(toolName, transcriptPath, { file_path: "src/implementation.mjs" }),
        { projectDir: path, resolveGitCommonDirFn: () => commonDir },
      );
      assert.deepEqual(result, { exitCode: 0, stderr: "" }, toolName);
    }
    assert.equal(existsSync(bootstrapObservationsPathFixture(commonDir)), false, "a non-write, non-shell tool must never reach this gate at all");
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(dirname(transcriptPath)), { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: an unresolved subagent identity (missing meta.json) allows the call and appends an observation line", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const transcriptPath = subagentTranscript("unresolved1", null); // no meta.json sibling written
  try {
    const result = evaluateLifecycleReadyGuard(
      subagentInput("Edit", transcriptPath, { file_path: "src/implementation.mjs" }),
      { projectDir: path, resolveGitCommonDirFn: () => commonDir, requireProjectOnboardingReadyFn: () => readyStub() },
    );
    assert.equal(result.exitCode, 0, "an unresolvable identity must fail open, never closed");
    const lines = readFileSync(bootstrapObservationsPathFixture(commonDir), "utf8").trim().split("\n");
    const records = lines.map((line) => JSON.parse(line));
    assert.ok(records.some((record) => record.decision === "fail-open-unresolved-identity" && record.reason === "meta-file-missing"));
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(dirname(transcriptPath)), { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: an unreadable/corrupt receipt file allows the call and appends an observation line", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const transcriptPath = subagentTranscript("corrupt1");
  try {
    const receiptPath = bootstrapReceiptPathFixture(commonDir, "corrupt1");
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, "not valid json {{{");
    const result = evaluateLifecycleReadyGuard(
      subagentInput("Edit", transcriptPath, { file_path: "src/implementation.mjs" }),
      { projectDir: path, resolveGitCommonDirFn: () => commonDir, requireProjectOnboardingReadyFn: () => readyStub() },
    );
    assert.equal(result.exitCode, 0, "an unreadable receipt must fail open, never closed");
    const lines = readFileSync(bootstrapObservationsPathFixture(commonDir), "utf8").trim().split("\n");
    const records = lines.map((line) => JSON.parse(line));
    assert.ok(records.some((record) => record.decision === "fail-open-unreadable-receipt" && record.agentId === "corrupt1"));
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(dirname(transcriptPath)), { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: a thrown filesystem error while checking the receipt allows the call and appends an observation line", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const transcriptPath = subagentTranscript("faulterr1");
  try {
    const result = evaluateLifecycleReadyGuard(
      subagentInput("Edit", transcriptPath, { file_path: "src/implementation.mjs" }),
      {
        projectDir: path,
        resolveGitCommonDirFn: () => commonDir,
        requireProjectOnboardingReadyFn: () => readyStub(),
        existsSyncFn(target) {
          if (target === bootstrapReceiptPathFixture(commonDir, "faulterr1")) throw new Error("synthetic disk fault");
          return existsSync(target);
        },
      },
    );
    assert.equal(result.exitCode, 0, "a thrown error while resolving the receipt must fail open, never closed");
    const lines = readFileSync(bootstrapObservationsPathFixture(commonDir), "utf8").trim().split("\n");
    const records = lines.map((line) => JSON.parse(line));
    assert.ok(records.some((record) => record.decision === "fail-open-error" && record.agentId === "faulterr1"));
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(dirname(transcriptPath)), { recursive: true, force: true });
  }
});

test("NVA-BOOTRECEIPT-1: every gate decision is observed, and the guard writes nothing outside bootstrap-receipt/", () => {
  const path = bootstrapGovernedRoot();
  const commonDir = bootstrapCommonDirFixture();
  const denyTranscript = subagentTranscript("obs-deny");
  const allowTranscript = subagentTranscript("obs-allow");
  try {
    const receiptPath = bootstrapReceiptPathFixture(commonDir, "obs-allow");
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, JSON.stringify({ schema: "pipeline.bootstrap-receipt.v1", agentId: "obs-allow" }));

    evaluateLifecycleReadyGuard(
      subagentInput("Edit", denyTranscript, { file_path: "src/implementation.mjs" }),
      { projectDir: path, resolveGitCommonDirFn: () => commonDir },
    );
    evaluateLifecycleReadyGuard(
      subagentInput("Edit", allowTranscript, { file_path: "src/implementation.mjs" }),
      { projectDir: path, resolveGitCommonDirFn: () => commonDir },
    );

    const lines = readFileSync(bootstrapObservationsPathFixture(commonDir), "utf8").trim().split("\n");
    const records = lines.map((line) => JSON.parse(line));
    assert.ok(records.some((record) => record.decision === "deny-no-receipt" && record.agentId === "obs-deny"));
    assert.ok(records.some((record) => record.decision === "allow-receipt-present" && record.agentId === "obs-allow"));

    // Every entry written under commonDir must live under agent-pipeline/bootstrap-receipt/.
    const pipelineDirEntries = readdirSync(join(commonDir, "agent-pipeline"));
    assert.deepEqual(pipelineDirEntries, ["bootstrap-receipt"]);
    const receiptDirEntries = readdirSync(join(commonDir, "agent-pipeline", "bootstrap-receipt")).sort();
    assert.deepEqual(receiptDirEntries, ["obs-allow.json", "observations.jsonl"]);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
    rmSync(dirname(dirname(denyTranscript)), { recursive: true, force: true });
    rmSync(dirname(dirname(allowTranscript)), { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// NVA-INTAKEARGV-1. The loop that was never closed.
//
// NVA-CODEXARGV-1 pinned the CLI's emitted argv against this guard's admission -- two
// machine components -- and the suite was green. The third consumer was the
// `nextAction.guidance` string, the ONLY one an agent actually reads, and it was
// hand-written prose that named no `--activate` while every shape here requires it.
// Measured 2026-08-27 on a live Codex greenfield run: the agent followed the guidance
// exactly, this guard refused the result as GUARD-LIFECYCLE-NOT-READY, and the refusal's
// own recovery pointed back at the inspection that re-emitted the same guidance. Onboarding
// could not be completed at all. A suite that proves two of three consumers agree does not
// prove the flow works; these two cases close guidance->guard directly.
// ---------------------------------------------------------------------------------

test("NVA-INTAKEARGV-1: the agent-facing command hint names every flag its own shape requires", () => {
  // The direct regression on the outage: `--activate` (and every other mandatory flag)
  // must appear in the text handed to the agent, for every mutating subcommand -- derived
  // from the shape, never asserted against a hand-copied expected string.
  for (const [name, shape] of Object.entries(MUTATING_ONBOARDING_ARGV_SHAPES)) {
    const hint = mutatingApplyCommandHint(name);
    assert.ok(hint.startsWith(`${name} `), `${name}: hint does not name its own subcommand`);
    for (const flag of shape.required) {
      assert.ok(hint.includes(flag), `${name}: mandatory ${flag} missing from the agent-facing hint`);
    }
    for (const flag of shape.requiredValue) {
      assert.ok(hint.includes(flag), `${name}: mandatory ${flag} missing from the agent-facing hint`);
    }
    for (const flag of shape.requiredValueOneOf ?? []) {
      assert.ok(hint.includes(flag), `${name}: one-of alternative ${flag} missing from the agent-facing hint`);
    }
  }
});

test("NVA-INTAKEARGV-1: the one-of text routes admit exactly one alternative, and every mandatory flag is load-bearing", () => {
  // Same admission seam as NVA-CODEXARGV-1 AC-3/AC-4 above (isSanctionedLifecycleCommand,
  // each token quoted) -- deliberately not the whole guard, because a command missing
  // --activate is not write-shaped at all and would be admitted for an unrelated reason,
  // which says nothing about the admission being tested here.
  //
  // What this adds beyond AC-3/AC-4: the `--text` / `--text-file` one-of group, and EVERY
  // mandatory flag rather than only --activate. Without the "exactly one" half, a second
  // text route could silently decay into an alias accepted alongside the first.
  const path = root();
  const values = {
    "--text": "one captured PO message",
    "--text-file": "scratch/design-input.md",
    "--answers-json": JSON.stringify([{ question: "What is the goal?", answer: "Ship it." }]),
    "--plan-sha256": "a".repeat(64),
    "--git-author-name": "PO Name",
    "--git-author-email": "po@example.com",
    "--language": "en",
    "--profile": "feature",
  };
  const admits = (argv) =>
    isSanctionedLifecycleCommand(`node '${ONBOARDING_SCRIPT}' ${argv.map((token) => `'${token}'`).join(" ")}`, path);
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    for (const [name, shape] of Object.entries(MUTATING_ONBOARDING_ARGV_SHAPES)) {
      const oneOf = shape.requiredValueOneOf ?? [];
      for (const alternative of oneOf.length > 0 ? oneOf : [null]) {
        const supplied = { ...values };
        if (alternative !== null) for (const other of oneOf) if (other !== alternative) delete supplied[other];
        assert.equal(admits(automatedMutatingApplyArgv(name, path, supplied)), true,
          `${name}${alternative === null ? "" : ` via ${alternative}`} was refused`);
      }
      if (oneOf.length > 1) {
        // Both alternatives at once, and neither -- each must fail the "exactly one" check.
        const single = { ...values };
        for (const other of oneOf) if (other !== oneOf[0]) delete single[other];
        const both = [...automatedMutatingApplyArgv(name, path, single), oneOf[1], values[oneOf[1]]];
        assert.equal(admits(both), false, `${name}: two one-of alternatives were admitted together`);
        const neither = automatedMutatingApplyArgv(name, path, single)
          .filter((token, index, argv) => token !== oneOf[0] && argv[index - 1] !== oneOf[0]);
        assert.equal(admits(neither), false, `${name}: admitted with no one-of alternative at all`);
      }
      // Every mandatory bare flag is load-bearing, not just --activate.
      const complete = { ...values };
      for (const other of oneOf.slice(1)) delete complete[other];
      for (const flag of shape.required) {
        assert.equal(admits(automatedMutatingApplyArgv(name, path, complete).filter((token) => token !== flag)), false,
          `${name}: admitted without its mandatory ${flag}`);
      }
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

/**
 * NVA-INTAKESPECS-1. The design package is generated straight into `specs/<featureId>/`
 * (ADR-0045's own location) instead of a `project/.onboarding-staging/` holding area. The
 * holding area created a second, parallel notion of "the design documents", which is what let
 * the plan-approval route bind a document whose own banner said it must not be bound, and what
 * forced GS-15 to protect that directory from the very agent whose job was to author it.
 *
 * The admission got NARROWER in the move: the containing directory must itself be a generated
 * feature id, and a `prd_<id>.md` is admitted only when that id matches its own directory -- a
 * property the flat staging directory could not express at all.
 */
test("NVA-INTAKESPECS-1: the bootstrap-binding authoring admission covers specs/<featureId>/, and a PRD in a foreign feature's directory is refused", () => {
  const path = root();
  const featureId = "onboarding-0123456789ab";
  const otherId = "onboarding-ba9876543210";
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    const bindingDeps = { projectDir: path, requireProjectOnboardingReadyFn() { deny("bootstrap-binding-required"); } };
    const admits = (input) => evaluateLifecycleReadyGuard(input, bindingDeps).exitCode === 0;

    // Admitted: exactly the two hand-authored targets of THIS feature, for both write tools.
    for (const filePath of [`specs/${featureId}/prd_${featureId}.md`, `specs/${featureId}/spec.md`]) {
      for (const input of [edit(filePath), write(filePath)]) {
        assert.equal(admits(input), true, `${input.tool_name}:${filePath}`);
      }
    }

    // Refused, in the same repository state. design-input.md stays an immutable verbatim
    // capture; a PRD naming a DIFFERENT feature id than its own directory is the case the old
    // flat layout could not distinguish; a nested path is not the package directory; and
    // NotebookEdit is never an authoring tool for these.
    for (const filePath of [
      `specs/${featureId}/design-input.md`,
      `specs/${featureId}/prd_${otherId}.md`,
      `specs/${featureId}/other.md`,
      `specs/${featureId}/nested/spec.md`,
      "specs/not-a-generated-feature-id/spec.md",
      "specs/spec.md",
    ]) {
      const result = evaluateLifecycleReadyGuard(edit(filePath), bindingDeps);
      assert.equal(result.exitCode, 2, filePath);
      assert.match(result.stderr, /GUARD-LIFECYCLE-NOT-READY/u, filePath);
    }
    const notebook = evaluateLifecycleReadyGuard(notebookEdit(`specs/${featureId}/spec.md`), bindingDeps);
    assert.equal(notebook.exitCode, 2, "NotebookEdit");
    assert.match(notebook.stderr, /GUARD-LIFECYCLE-NOT-READY/u, "NotebookEdit");
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

// NVA-I-GRAMMAR DoD 1: the three live reproductions from backlog/items/2026-08-27-shell-
// grammar-reads-quoted-content-as-shell-syntax.md, each paired with a genuinely-composed
// control that must stay refused. The quote-aware tokenizer itself (guard-command-grammar.mjs,
// out of this dispatch's scope) already read all three correctly by the time this dispatch
// started -- this pins that fact as a regression test rather than leaving it undiscovered.
// Only repro 3 (head -N for the grep/cat sinks) needed a real fix in this file.
test("NVA-I-GRAMMAR DoD 1: quoted operator-looking characters are read as data, never as shell syntax, for all three backlog reproductions", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    // Repro 1: a ternary inside a quoted `node -e` script.
    const ternary = `node -e 'const x = 1; console.log(x ? "yes" : "no")'`;
    const ternaryParsed = parseGuardCommand(ternary, path);
    assert.equal(ternaryParsed.parseStatus, "accepted", ternary);
    assert.equal(ternaryParsed.operators.length, 0, ternary);
    assert.equal(ternaryParsed.redirects.length, 0, ternary);
    // Genuinely-composed control: a REAL, unquoted pipe between two `node -e` calls.
    const ternaryControl = "node -e 'console.log(1)' | node -e 'process.exit(0)'";
    assert.equal(isReadOnlyDiagnosticCommand(ternaryControl, path), false, ternaryControl);
    const ternaryControlResult = evaluateLifecycleReadyGuard(bash(ternaryControl), { projectDir: path });
    assert.equal(ternaryControlResult.exitCode, 2, ternaryControl);
    assert.match(ternaryControlResult.stderr, /GUARD-OPERATOR-UNAPPROVED/u, ternaryControl);

    // Repro 2: `\|` alternation inside a quoted grep pattern.
    const alternation = `grep -n "^const X\\|^export function Y" some/file.mjs`;
    const alternationParsed = parseGuardCommand(alternation, path);
    assert.equal(alternationParsed.parseStatus, "accepted", alternation);
    assert.equal(alternationParsed.operators.length, 0, alternation);
    assert.equal(isReadOnlyDiagnosticCommand(alternation, path), true, alternation);
    // Genuinely-composed control: a REAL, unquoted `||`.
    const alternationControl = "grep -n X some/file.mjs || rm some/file.mjs";
    assert.equal(isReadOnlyDiagnosticCommand(alternationControl, path), false, alternationControl);
    const alternationControlResult = evaluateLifecycleReadyGuard(bash(alternationControl), { projectDir: path });
    assert.equal(alternationControlResult.exitCode, 2, alternationControl);
    assert.match(alternationControlResult.stderr, /GUARD-PARSE-UNSUPPORTED/u, alternationControl);

    // Repro 3: `head -40` refused where `head -n 40` is admitted, for the grep sink (the rg
    // sink already accepted both forms before this dispatch, per GF-078 bug 2).
    const headCombined = "grep -n needle probe.txt | head -40";
    assert.equal(isReadOnlyDiagnosticCommand(headCombined, path), true, headCombined);
    assert.deepEqual(evaluateLifecycleReadyGuard(bash(headCombined), {
      projectDir: path,
      requireProjectOnboardingReadyFn() { deny("continuity-damaged"); },
    }), { exitCode: 0, stderr: "" });
    // Genuinely-composed control: a THIRD pipeline stage, outside the bounded two-segment
    // shape -- must stay refused regardless of the head -N fix.
    const headControl = "grep -n needle probe.txt | head -40 | wc -l";
    assert.equal(isReadOnlyDiagnosticCommand(headControl, path), false, headControl);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-I-GRAMMAR DoD 2: the identical bounded read, refused only because of which command
// sourced it, now accepts `head -N` for every sink family, not only rg-to-head.
test("NVA-I-GRAMMAR DoD 2: head -N is admitted wherever head -n N is, for grep-to-head and cat-to-head, with the same 1..500 bound", () => {
  const path = root();
  try {
    writeFileSync(join(path, "probe.txt"), "alpha\nbeta\n");
    for (const [combined, twoToken] of [
      ["grep -n alpha probe.txt | head -40", "grep -n alpha probe.txt | head -n 40"],
      ["cat probe.txt | head -40", "cat probe.txt | head -n 40"],
      ["grep -n alpha probe.txt | head -500", "grep -n alpha probe.txt | head -n 500"],
    ]) {
      assert.equal(isReadOnlyDiagnosticCommand(combined, path), isReadOnlyDiagnosticCommand(twoToken, path), combined);
      assert.equal(isReadOnlyDiagnosticCommand(combined, path), true, combined);
    }
    // The bound is unchanged, both spellings: 0 and 501 stay refused either way.
    for (const outOfBound of ["grep -n alpha probe.txt | head -0", "grep -n alpha probe.txt | head -501"]) {
      assert.equal(isReadOnlyDiagnosticCommand(outOfBound, path), false, outOfBound);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-I-GRAMMAR DoD 5: the refusal text can never drift from the grammar it describes, because
// this test runs what it prints -- every ADMITTED_GRAMMAR_SHAPES example is both (a) present
// verbatim in a real refusal's remedy text and (b) independently admitted when submitted.
test("NVA-I-GRAMMAR DoD 5: every admitted-grammar-shape example is printed in the refusal AND independently admitted when submitted", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    writeFileSync(join(path, "probe.txt"), "alpha\nbeta\n");
    const refusal = evaluateLifecycleReadyGuard(bash("git status ; git log"), { projectDir: path });
    assert.equal(refusal.exitCode, 2);
    assert.match(refusal.stderr, /GUARD-PARSE-UNSUPPORTED/u);
    assert.ok(ADMITTED_GRAMMAR_SHAPES.length > 0);
    for (const shape of ADMITTED_GRAMMAR_SHAPES) {
      assert.ok(shape.example, `table entry missing a runnable example: ${shape.spelling}`);
      assert.ok(refusal.stderr.includes(shape.example), `refusal text missing example: ${shape.example}`);
      assert.equal(isReadOnlyDiagnosticCommand(shape.example, path), true, shape.example);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-I-GRAMMAR DoD 6 -- THE DELIVERABLE (per this dispatch's own briefing, the && support is
// not): drives every admitted-operator shape (the bounded rg/grep/cat pipelines and the
// &&-chain union) and asserts that no mutating, protected-path, or cross-repo-mutating segment
// ever becomes admitted merely by riding along BEFORE or AFTER a segment that IS independently
// admitted -- the union rule (isChainSegmentAdmitted) must never let one admitted segment's
// verdict leak onto its neighbour.
test("NVA-I-GRAMMAR DoD 6: negative regression -- no mutating, protected-path, or cross-repo-mutating segment is admitted by composition with an admitted one", () => {
  const path = root();
  const outside = mkdtempSync(join(tmpdir(), "guard-lifecycle-negative-"));
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
    writeFileSync(join(path, "probe.txt"), "alpha\n");
    const admittedSegments = [
      "git status",
      "rg -n alpha probe.txt",
      "grep -n alpha probe.txt | head -5",
      "cat probe.txt | grep -n alpha",
    ];
    const forbiddenSegments = [
      "rm -rf probe.txt", // mutating
      "git commit -m x", // mutating
      "touch new-file.txt", // mutating
      "sed -i s/x/y/ probe.txt", // mutating (write flag)
      `mkdir -p ${outside}`, // cross-repo-mutating (outside project root)
      "mkdir -p guardrails/critic-probe", // in-repo write outside the chain-eligible prefixes
    ];
    for (const admitted of admittedSegments) {
      assert.equal(isReadOnlyDiagnosticCommand(admitted, path), true, admitted);
      for (const forbidden of forbiddenSegments) {
        assert.equal(isReadOnlyDiagnosticCommand(forbidden, path), false, forbidden);
        for (const chain of [`${admitted} && ${forbidden}`, `${forbidden} && ${admitted}`]) {
          assert.equal(isReadOnlyDiagnosticCommand(chain, path), false, chain);
          const result = evaluateLifecycleReadyGuard(bash(chain), { projectDir: path });
          assert.equal(result.exitCode, 2, chain);
          assert.match(result.stderr, /GUARD-PARSE-UNSUPPORTED/u, chain);
        }
      }
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
