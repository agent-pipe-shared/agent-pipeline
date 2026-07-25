#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyProjectOnboardingV3,
  inspectProjectOnboardingV3,
  planProjectOnboardingV3,
} from "./project-onboarding-v3.mjs";
import { planRunnerProfileMigrationV3 } from "./runner-profile-migration-v3.mjs";
import { validateV3BootstrapAuthority } from "../scripts/v3-bootstrap-authority.mjs";
import { parseYaml } from "./yaml-lite.mjs";
import { validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { main as onboardingCli } from "../scripts/project-onboarding-v3.mjs";

let passed = 0; const failures = [];
function test(name, run) { try { run(); passed += 1; console.log(`PASS  ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.log(`FAIL  ${name} -- ${error.message}`); } }
function root() { return mkdtempSync(join(tmpdir(), "project-onboarding-v3-")); }
function dispose(path) { rmSync(path, { recursive: true, force: true }); }
function fakeGit(command, args, options = {}) {
  if (command !== "git") return { status: 1, stderr: "unexpected program" };
  if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
  if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n", stderr: "" };
  if (args[0] === "init" && args[1] === "--initial-branch=main") { mkdirSync(join(options.cwd, ".git")); return { status: 0, stdout: "", stderr: "" }; }
  return { status: 1, stderr: "unexpected git arguments" };
}
const fakeDeps = { spawnSync: fakeGit };
function names(path) { return readdirSync(path).sort(); }
function yaml(value, indent = "") {
  return Object.entries(value).map(([key, child]) => {
    if (child && typeof child === "object") return `${indent}${key}:\n${yaml(child, `${indent}  `)}`;
    return `${indent}${key}: ${typeof child === "string" ? child : String(child)}\n`;
  }).join("");
}
function v0Source() {
  const route = (model, effort) => ({ model, effort });
  return {
    language: { human_facing: "en", agent_facing: "en" }, agent_runtime: "other",
    worktypes: {
      design: { design_phase: route("opus-4.8", "high"), execution_phase: route("opus-4.8", "high"), advisor: "off" },
      feature: { design_phase: route("opus-4.8", "high"), execution_phase: route("sonnet-5", "high"), advisor: "opus-4.8" },
      mini: { design_phase: route("sonnet-5", "high"), execution_phase: route("sonnet-5", "high"), advisor: "opus-4.8" },
    },
    models: { implement: route("sonnet-5", "medium"), mechanic: route("sonnet-5", "low"), deep: route("sonnet-5", "xhigh"), review: route("sonnet-5", "max") },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 200 },
  };
}

test("blank real root inspect and plan are read-only", () => {
  const path = root();
  try {
    assert.equal(inspectProjectOnboardingV3({ rootDir: path }).status, "fresh");
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.deepEqual(names(path), []);
    assert.deepEqual(plan.targets.map((target) => target.path), [
      ".claude/pipeline.json", ".claude/pipeline.yaml", ".claude/settings.json",
      ".codex/agents/consult-advisor.toml", ".codex/agents/critic.toml", ".codex/agents/implementor.toml",
      ".codex/config.toml", "pipeline.user.yaml",
    ]);
  } finally { dispose(path); }
});

test("public CLI emits typed inspect, plan, and explicit-apply results", () => {
  const path = root();
  const invoke = (args) => {
    let output = "";
    const code = onboardingCli(args, { deps: fakeDeps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  try {
    const inspected = invoke(["inspect", "--root", path]);
    assert.equal(inspected.code, 0); assert.equal(inspected.result.status, "fresh");
    const planned = invoke(["plan", "--root", path]);
    assert.equal(planned.code, 0); assert.equal(planned.result.status, "ready");
    assert.deepEqual(names(path), []);
    const inactive = invoke(["apply", "--root", path]);
    assert.equal(inactive.code, 1); assert.equal(inactive.result.status, "activation-required");
    const applied = invoke(["apply", "--root", path, "--activate"]);
    assert.equal(applied.code, 0); assert.equal(applied.result.status, "applied");
  } finally { dispose(path); }
});

test("explicit apply initializes a complete Codex-ready V3 project without a commit", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: false, deps: fakeDeps }).status, "activation-required");
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(existsSync(join(path, ".git")), true);
    assert.equal(existsSync(join(path, ".codex/agents/implementor.toml")), true);
    assert.equal(existsSync(join(path, ".codex/agents/critic.toml")), true);
    assert.equal(existsSync(join(path, ".codex/agents/consult-advisor.toml")), true);
    assert.match(readFileSync(join(path, ".codex/agents/implementor.toml"), "utf8"), /developer_instructions\s*=/u);
    assert.match(readFileSync(join(path, ".codex/agents/critic.toml"), "utf8"), /developer_instructions\s*=/u);
    assert.equal(existsSync(join(path, "setup.mjs")), false);
    assert.equal(existsSync(join(path, ".agent-pipeline/core.lock.json")), false);
    assert.equal(validatePipelineUserV3(parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"))).ok, true);
    assert.equal(validateV3BootstrapAuthority({ rootDir: path }).status, "ready");
    assert.equal(planRunnerProfileMigrationV3({ rootDir: path }).status, "noop");
    const source = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.deepEqual(source.runners, { enabled: ["claude", "codex"], default: "codex" });
    assert.equal(source.advisor_export.consent, "declined");
    assert.equal(source.autonomy.push_policy, "gated");
    assert.equal(source.autonomy.branch_model, "feature-branch");
    assert.equal(source.gates.security, "warn");
    const calibration = JSON.parse(readFileSync(join(path, ".claude/pipeline.json"), "utf8"));
    assert.equal(calibration.verify, "git diff --check");
    assert.equal(calibration.repositoryMode, "local-only");
    assert.equal(existsSync(join(path, "docs/state.md")), false, "handover stays a project decision; normal bootstrap deliberately remains F4 until it exists");
  } finally { dispose(path); }
});

test("existing unmanaged projects plan read-only while partial and symlink roots fail closed", () => {
  const unrelated = root(); const partial = root(); const linkedParent = root(); const unsafe = root(); const unsafeClaude = root();
  try {
    writeFileSync(join(unrelated, "README.md"), "existing\n");
    assert.equal(inspectProjectOnboardingV3({ rootDir: unrelated }).status, "existing-unmanaged");
    assert.equal(planProjectOnboardingV3({ rootDir: unrelated, deps: fakeDeps }).status, "ready");
    assert.deepEqual(names(unrelated), ["README.md"]);
    mkdirSync(join(partial, ".codex")); writeFileSync(join(partial, ".codex/config.toml"), "existing\n");
    assert.equal(inspectProjectOnboardingV3({ rootDir: partial }).status, "partial");
    symlinkSync(linkedParent, join(unsafe, "linked"));
    assert.equal(inspectProjectOnboardingV3({ rootDir: unsafe }).status, "unsafe");
    assert.deepEqual(names(unsafe), ["linked"]);
    symlinkSync(linkedParent, join(unsafeClaude, ".claude"));
    assert.equal(inspectProjectOnboardingV3({ rootDir: unsafeClaude }).status, "unsafe");
    assert.equal(planProjectOnboardingV3({ rootDir: unsafeClaude, deps: fakeDeps }).status, "unsafe");
    assert.deepEqual(names(unsafeClaude), [".claude"]);
  } finally { dispose(unrelated); dispose(partial); dispose(linkedParent); dispose(unsafe); dispose(unsafeClaude); }
});

test("a recognized read-only host control layout receives portable onboarding without an overwrite attempt", () => {
  const path = root();
  try {
    for (const name of [".codex", ".git"]) {
      const target = join(path, name);
      mkdirSync(target);
      chmodSync(target, 0o555);
    }
    const inspected = inspectProjectOnboardingV3({ rootDir: path });
    assert.equal(inspected.status, "fresh-host-managed");
    assert.equal(inspected.diagnostics[0].code, "host_managed_fresh_root");
    const planned = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(planned.status, "ready");
    assert.equal(planned.state, "fresh-host-managed");
    assert.equal(planned.git.mode, "host-managed");
    assert.equal(planned.git.initializesGit, false);
    assert.deepEqual(planned.targets.map((target) => target.path), [
      ".claude/pipeline.json", ".claude/pipeline.yaml", ".claude/settings.json", "pipeline.user.yaml",
    ]);
    const applied = applyProjectOnboardingV3(planned, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(applied.git.mode, "host-managed");
    assert.equal(applied.authority.runtimeProjection, "host-managed-codex");
    assert.equal(inspectProjectOnboardingV3({ rootDir: path }).status, "ready");
    assert.deepEqual(names(join(path, ".codex")), []);
    assert.deepEqual(names(join(path, ".git")), []);
    const calibrationPath = join(path, ".claude/pipeline.json");
    const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
    calibration.repositoryMode = "local-only";
    writeFileSync(calibrationPath, `${JSON.stringify(calibration, null, 2)}\n`);
    assert.equal(validateV3BootstrapAuthority({ rootDir: path }).status, "rejected", "the host projection is accepted only with its explicit calibration marker");
  } finally { dispose(path); }
});

test("an existing unmanaged project receives an additive adoption plan", () => {
  const path = root();
  try {
    writeFileSync(join(path, "README.md"), "existing project\n");
    const inspected = inspectProjectOnboardingV3({ rootDir: path });
    assert.equal(inspected.status, "existing-unmanaged");
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.equal(plan.state, "existing-unmanaged");
    assert.equal(plan.git.initializesGit, true);
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(readFileSync(join(path, "README.md"), "utf8"), "existing project\n");
    assert.equal(existsSync(join(path, "pipeline.user.yaml")), true);
    assert.equal(existsSync(join(path, ".git")), true);
  } finally { dispose(path); }
});

test("adoption preserves directory and linked-worktree Git metadata and blocks user-owned reserved paths", () => {
  const adopted = root(); const linked = root(); const reserved = root();
  try {
    writeFileSync(join(adopted, "README.md"), "existing project\n");
    mkdirSync(join(adopted, ".git", "objects"), { recursive: true });
    writeFileSync(join(adopted, ".git", "HEAD"), "ref: refs/heads/main\n");
    const plan = planProjectOnboardingV3({ rootDir: adopted, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.equal(plan.git.initializesGit, false);
    const applied = applyProjectOnboardingV3(plan, { rootDir: adopted, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(readFileSync(join(adopted, ".git", "HEAD"), "utf8"), "ref: refs/heads/main\n");

    writeFileSync(join(linked, "README.md"), "linked worktree project\n");
    writeFileSync(join(linked, ".git"), "gitdir: /outside/managed-worktree\n");
    const linkedPlan = planProjectOnboardingV3({ rootDir: linked, deps: fakeDeps });
    assert.equal(inspectProjectOnboardingV3({ rootDir: linked, deps: fakeDeps }).status, "existing-unmanaged");
    assert.equal(linkedPlan.status, "ready");
    assert.equal(linkedPlan.git.initializesGit, false);
    const linkedApplied = applyProjectOnboardingV3(linkedPlan, { rootDir: linked, activate: true, deps: fakeDeps });
    assert.equal(linkedApplied.status, "applied");
    assert.equal(readFileSync(join(linked, ".git"), "utf8"), "gitdir: /outside/managed-worktree\n");

    writeFileSync(join(reserved, "README.md"), "existing project\n");
    mkdirSync(join(reserved, ".codex"));
    assert.equal(inspectProjectOnboardingV3({ rootDir: reserved }).status, "partial");
  } finally { dispose(adopted); dispose(linked); dispose(reserved); }
});

test("legacy V0 is migration-required and never receives a fresh fallback", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), yaml(v0Source()));
    assert.equal(inspectProjectOnboardingV3({ rootDir: path }).status, "migration-required");
    assert.equal(planProjectOnboardingV3({ rootDir: path, deps: fakeDeps }).status, "migration-required");
    assert.deepEqual(names(path), ["pipeline.user.yaml"]);
  } finally { dispose(path); }
});

test("post-git failure rolls every generated preimage back", () => {
  const path = root(); let writes = 0;
  const failing = {
    ...fakeDeps,
    writeFileSync(target, bytes, options) {
      writes += 1;
      if (writes === 2) throw new Error("synthetic write failure");
      writeFileSync(target, bytes, options);
    },
  };
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, deps: failing });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: failing });
    assert.equal(applied.status, "rolled-back");
    assert.deepEqual(names(path), []);
  } finally { dispose(path); }
});

console.log(`\nproject-onboarding-v3: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
