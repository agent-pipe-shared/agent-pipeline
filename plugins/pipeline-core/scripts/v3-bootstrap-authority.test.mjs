#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Net-new coverage for the read-only V3 bootstrap authority.
 *
 * No test protected this script before CLAUDE-RUNNER-01b, so this file is both
 * the proof for the new runner-conditional native-readback branch (AC-5) and
 * the regression net for the Codex path it must leave byte-identical (AC-4/9).
 * Every fixture is a real project root: the "no restart-barrier artifact on
 * disk" condition is genuine absence, never a stubbed-out bypass.
 */
import assert from "node:assert/strict";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { main as authorityCli, validateV3BootstrapAuthority } from "./v3-bootstrap-authority.mjs";
import {
  applyRunnerProfileMigrationV3,
  planRunnerProfileMigrationV3,
} from "../lib/runner-profile-migration-v3.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import { buildDefaultAnswers, renderPipelineYaml, renderUserYaml } from "../../../setup.mjs";

const runtimePaths = loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path);
const BASELINES = {
  ".claude/settings.json": "{\n  \"settings-unowned-sentinel\": true\n}\n",
  ".claude/pipeline.json": "{\n  \"project\": \"fixture\",\n  \"calibration-unowned-sentinel\": true\n}\n",
  ".claude/pipeline.yaml": "# pipeline-prefix-sentinel\nlanguage:\n  human_facing: en\n",
};

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function snapshot(root) {
  const entries = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        entries.push(`${relative(root, path)}:${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
      }
    }
  };
  walk(root);
  return entries;
}

/** One real local root; `migrate: false` keeps its legacy (non-V3) source. */
function fixture({ migrate = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "v3-bootstrap-authority-test-"));
  for (const path of runtimePaths) {
    if (!path.startsWith(".codex/")) write(root, path, BASELINES[path] ?? "");
  }
  write(root, "pipeline.user.yaml", renderUserYaml(buildDefaultAnswers()));
  write(root, ".claude/pipeline.yaml", renderPipelineYaml(buildDefaultAnswers(), "v3-bootstrap-authority-fixture"));
  mkdirSync(join(root, ".git"));
  if (migrate) {
    const plan = planRunnerProfileMigrationV3({ rootDir: root, initializeMissingRuntimeForSlimV3: true });
    assert.equal(plan.status, "ready", JSON.stringify(plan.diagnostics ?? []));
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true }).status, "applied");
  }
  return root;
}

/** Records every Git control-path probe, so "was the readback authority even reached" is observable. */
function gitDeps(root, { reachable = true } = {}) {
  const probes = [];
  return {
    probes,
    deps: {
      spawnSync(command, args) {
        if (command === "git" && args?.[0] === "rev-parse") {
          probes.push(args.join(" "));
          return reachable
            ? { status: 0, stdout: `${join(root, ".git")}\n`, stderr: "" }
            : { status: 1, stdout: "", stderr: "no git control path" };
        }
        return { status: 1, stdout: "", stderr: "unexpected probe" };
      },
    },
  };
}

function withFixture(options, run) {
  const root = fixture(options);
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function barrierPath(root) {
  return join(root, ".git", "agent-pipeline", "onboarding", "restart-barrier.json");
}

// ---------------------------------------------------------------------------
// AC-5: the Claude path reaches ready without a Codex restart barrier existing.
// ---------------------------------------------------------------------------

check("AC-5 a claude runner reaches ready with no restart-barrier artifact on disk", () => {
  withFixture({}, (root) => {
    const { deps, probes } = gitDeps(root);
    assert.equal(existsSync(barrierPath(root)), false, "the fixture must genuinely have no restart barrier");
    const before = snapshot(root);
    const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner: "claude" });
    assert.equal(authority.status, "ready", JSON.stringify(authority));
    assert.equal(authority.runtimeReadback, "not-applicable");
    assert.equal(authority.runtimeProjection, "noop");
    assert.equal(authority.sourceKind, "v3");
    assert.deepEqual(authority.diagnostics, []);
    assert.equal(existsSync(barrierPath(root)), false, "no barrier may be fabricated");
    assert.deepEqual(snapshot(root), before, "the authority stays read-only");
    assert.deepEqual(probes, [], "the private Codex runtime authority is never reached for this runner");
  });
});

check("AC-5 the claude path stays ready even when the Codex readback authority is unreachable", () => {
  withFixture({}, (root) => {
    const { deps } = gitDeps(root, { reachable: false });
    const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner: "claude" });
    assert.equal(authority.status, "ready", JSON.stringify(authority));
    assert.equal(authority.runtimeReadback, "not-applicable");
  });
});

check("the claude path never claims a native readback it did not produce", () => {
  withFixture({}, (root) => {
    const { deps } = gitDeps(root);
    const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner: "claude" });
    assert.notEqual(authority.runtimeReadback, "current");
    assert.notEqual(authority.runtimeReadback, "plugin-provided");
  });
});

// ---------------------------------------------------------------------------
// AC-4/AC-9: the Codex path keeps its exact pre-change behavior.
// ---------------------------------------------------------------------------

check("codex still requires the native readback on the identical fixture", () => {
  withFixture({}, (root) => {
    const { deps, probes } = gitDeps(root);
    const before = snapshot(root);
    const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner: "codex" });
    assert.equal(authority.status, "projection-current", JSON.stringify(authority));
    assert.equal(authority.runtimeReadback, "absent");
    assert.equal(authority.runtimeProjection, "noop");
    assert.notEqual(authority.status, "ready", "an absent barrier can never be a ready claim for Codex");
    assert.ok(probes.length > 0, "Codex still reaches the private runtime authority");
    assert.deepEqual(snapshot(root), before, "the authority stays read-only");
  });
});

check("an omitted runner keeps the Codex requirement (no silent widening)", () => {
  withFixture({}, (root) => {
    const { deps } = gitDeps(root);
    const defaulted = validateV3BootstrapAuthority({ rootDir: root, deps });
    const explicit = validateV3BootstrapAuthority({ rootDir: root, deps, runner: "codex" });
    assert.deepEqual(defaulted, explicit);
    assert.equal(defaulted.status, "projection-current");
  });
});

check("an unknown or null runner stays on the fail-closed Codex path", () => {
  withFixture({}, (root) => {
    const { deps } = gitDeps(root);
    for (const runner of [null, undefined, "gpt", ""]) {
      const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner });
      assert.equal(authority.status, "projection-current", String(runner));
      assert.equal(authority.runtimeReadback, "absent", String(runner));
    }
  });
});

check("codex fails closed when the private runtime authority cannot be observed", () => {
  withFixture({}, (root) => {
    const { deps } = gitDeps(root, { reachable: false });
    const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner: "codex" });
    assert.equal(authority.status, "rejected");
    assert.deepEqual(authority.diagnostics.map((entry) => entry.code), ["v3_runtime_readback_unavailable"]);
    assert.equal(authority.sourceKind, "v3");
    assert.equal(authority.runtimeProjection, "noop");
  });
});

// ---------------------------------------------------------------------------
// Every gate before the readback branch stays runner-independent.
// ---------------------------------------------------------------------------

check("runtime drift is rejected for every runner", () => {
  withFixture({}, (root) => {
    const drifted = join(root, ".codex", "agents", "implementor.toml");
    const before = readFileSync(drifted, "utf8");
    writeFileSync(drifted, before.replace(/^model = .*$/mu, 'model = "drift"'));
    assert.notEqual(readFileSync(drifted, "utf8"), before, "the drift fixture must change one owned key");
    for (const runner of ["claude", "codex"]) {
      const { deps } = gitDeps(root);
      const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner });
      assert.equal(authority.status, "rejected", runner);
      assert.equal(authority.diagnostics[0].code, "v3_runtime_drift", runner);
    }
  });
});

check("an absent manifest is rejected for every runner", () => {
  withFixture({}, (root) => {
    rmSync(join(root, ".claude", "pipeline.yaml"));
    for (const runner of ["claude", "codex"]) {
      const { deps } = gitDeps(root);
      const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner });
      assert.equal(authority.status, "rejected", runner);
      assert.equal(authority.diagnostics[0].code, "manifest_invalid", runner);
    }
  });
});

check("a root without one readable V3 source is rejected for every runner", () => {
  const root = mkdtempSync(join(tmpdir(), "v3-bootstrap-authority-empty-"));
  try {
    for (const runner of ["claude", "codex"]) {
      const { deps } = gitDeps(root);
      const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner });
      assert.equal(authority.status, "rejected", runner);
      assert.equal(authority.diagnostics[0].code, "v3_inspection_not_ready", runner);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("a legacy non-V3 source is rejected for every runner", () => {
  withFixture({ migrate: false }, (root) => {
    for (const runner of ["claude", "codex"]) {
      const { deps } = gitDeps(root);
      const authority = validateV3BootstrapAuthority({ rootDir: root, deps, runner });
      assert.equal(authority.status, "rejected", runner);
      assert.equal(authority.diagnostics[0].code, "v3_source_not_current", runner);
      assert.notEqual(authority.sourceKind, "v3", runner);
    }
  });
});

// ---------------------------------------------------------------------------
// CLI contract: --help/argument errors, and the new --runner parsing (AC-6a).
// ---------------------------------------------------------------------------

check("the CLI keeps its exact usage/argument contract and validates --runner", () => {
  withFixture({}, (root) => {
    const { deps } = gitDeps(root);
    let output = "";
    const write_ = (chunk) => { output += String(chunk); };
    assert.equal(authorityCli(["--help"], { write: write_, deps }), 0);
    assert.match(output, /Usage: node plugins\/pipeline-core\/scripts\/v3-bootstrap-authority\.mjs --root/u);
    assert.match(output, /--runner claude\|codex/u);

    output = "";
    assert.equal(authorityCli([], { write: write_, deps }), 2);
    assert.match(output, /--root is required/u);

    output = "";
    assert.equal(authorityCli(["--boom"], { write: write_, deps }), 2);
    assert.match(output, /unknown argument: --boom/u);

    output = "";
    assert.equal(authorityCli(["--root", root, "--runner", "bogus"], { write: write_, deps }), 2);
    assert.match(output, /--runner requires "claude" or "codex"/u);

    output = "";
    assert.equal(authorityCli(["--root", root, "--runner"], { write: write_, deps }), 2);
    assert.match(output, /--runner requires "claude" or "codex"/u);
  });
});

// ---------------------------------------------------------------------------
// CLAUDE-RUNNER-01c: the CLI derives the runner from the project's own V3
// source when --runner is absent (the fix this file's `main()` was missing).
// ---------------------------------------------------------------------------

/** Flips the migrated fixture's one `runners.default` occurrence to `value`. */
function setRunnersDefault(root, value) {
  const path = join(root, "pipeline.user.yaml");
  const before = readFileSync(path, "utf8");
  const needle = 'runners:\n  default: "claude"';
  assert.ok(before.includes(needle), "fixture must contain the expected migrated runners.default line to flip");
  writeFileSync(path, before.replace(needle, `runners:\n  default: "${value}"`));
}

check("CLI derivation: a claude-default source reaches ready with no --runner flag", () => {
  withFixture({}, (root) => {
    const { deps, probes } = gitDeps(root);
    let output = "";
    const exit = authorityCli(["--root", root], { write: (chunk) => { output += String(chunk); }, deps });
    const authority = JSON.parse(output);
    assert.equal(exit, 0);
    assert.equal(authority.status, "ready");
    assert.equal(authority.runtimeReadback, "not-applicable");
    assert.equal(authority.sourceKind, "v3");
    assert.deepEqual(authority.diagnostics, []);
    assert.deepEqual(probes, [], "the derived claude runner never reaches the private Codex runtime authority");
  });
});

check("CLI derivation: a codex-default source stays on the Codex native-readback path with no --runner flag", () => {
  withFixture({}, (root) => {
    setRunnersDefault(root, "codex");
    const { deps, probes } = gitDeps(root);
    let output = "";
    const exit = authorityCli(["--root", root], { write: (chunk) => { output += String(chunk); }, deps });
    const authority = JSON.parse(output);
    assert.equal(exit, 1);
    assert.equal(authority.status, "projection-current");
    assert.equal(authority.runtimeReadback, "absent");
    assert.ok(probes.length > 0, "the derived codex runner still reaches the private Codex runtime authority");
  });
});

check("CLI derivation: an explicit --runner always overrides the project's own declared default", () => {
  withFixture({}, (root) => {
    const { deps: depsA, probes: probesA } = gitDeps(root);
    let output = "";
    let exit = authorityCli(["--root", root, "--runner", "codex"], { write: (chunk) => { output += String(chunk); }, deps: depsA });
    assert.equal(exit, 1, "an explicit --runner codex overrides the fixture's own claude default");
    assert.equal(JSON.parse(output).status, "projection-current");
    assert.ok(probesA.length > 0);

    setRunnersDefault(root, "codex");
    const { deps: depsB, probes: probesB } = gitDeps(root);
    output = "";
    exit = authorityCli(["--root", root, "--runner", "claude"], { write: (chunk) => { output += String(chunk); }, deps: depsB });
    assert.equal(exit, 0, "an explicit --runner claude overrides a codex-default source");
    assert.equal(JSON.parse(output).status, "ready");
    assert.deepEqual(probesB, []);
  });
});

check("CLI derivation fails closed for a legacy source with no runners declaration at all", () => {
  // A legacy (non-V3) source has no `runners` block -- deriveCliRunner reads
  // no usable value and returns null (the Codex fail-closed default). The
  // overall pipeline also rejects the source for being non-V3
  // (v3_source_not_current) before the runtime-readback branch is ever
  // reached; both gates independently agree the CLI must never claim ready.
  withFixture({ migrate: false }, (root) => {
    const { deps } = gitDeps(root);
    let output = "";
    const exit = authorityCli(["--root", root], { write: (chunk) => { output += String(chunk); }, deps });
    const authority = JSON.parse(output);
    assert.notEqual(exit, 0);
    assert.notEqual(authority.status, "ready");
  });
});

check("CLI derivation fails closed for a root with no readable pipeline.user.yaml at all", () => {
  const root = mkdtempSync(join(tmpdir(), "v3-bootstrap-authority-runner-empty-"));
  try {
    let output = "";
    const exit = authorityCli(["--root", root], { write: (chunk) => { output += String(chunk); } });
    const authority = JSON.parse(output);
    assert.notEqual(exit, 0);
    assert.notEqual(authority.status, "ready");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("CLI derivation fails closed for an ambiguous runners declaration (default not in enabled)", () => {
  // This exact malformation also fails the full pipeline.user.v3 schema
  // contract (runner-profiles-v3.mjs's default-must-be-enabled rule), so the
  // CLI is rejected before the runtime-readback branch is ever reached --
  // defense in depth, not a distinct branch this test can isolate further.
  // The property that matters, and that this proves, is that the CLI never
  // silently claims ready/claude for it.
  withFixture({}, (root) => {
    const path = join(root, "pipeline.user.yaml");
    const before = readFileSync(path, "utf8");
    const needle = 'runners:\n  default: "claude"\n  enabled:\n    - "claude"\n    - "codex"';
    assert.ok(before.includes(needle), "fixture must contain the expected migrated runners block to make ambiguous");
    writeFileSync(path, before.replace(needle, 'runners:\n  default: "codex"\n  enabled:\n    - "claude"'));
    const { deps } = gitDeps(root);
    let output = "";
    const exit = authorityCli(["--root", root], { write: (chunk) => { output += String(chunk); }, deps });
    const authority = JSON.parse(output);
    assert.notEqual(exit, 0);
    assert.notEqual(authority.status, "ready");
  });
});

console.log(`${passed} V3 bootstrap authority checks passed.`);
