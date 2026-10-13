#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Regression pin: pipeline.powershell-bypasses-onboarding-read-boundary (ALF-C-P1-08, AC-228).
//
// Original acceptance (backlog item), one describe-block per point:
//   A1. Bash and PowerShell both refuse unauthorized outside-root reads and non-ready-phase commands.
//   A2. Legitimate returned onboarding actions work on an explicitly supported lane (PowerShell).
//   A3. Read, Grep and Glob are covered with synthetic outside-root / sensitive-looking paths;
//       no real signing material is touched.
//   A4. Hook registration and guard behavior agree on the lanes actually enforced.
//
// The real guard (evaluateLifecycleReadyGuard -> powerShellScopeVerdict) runs unmocked. Only the
// project-readiness probe, a documented dependency seam, is driven to a non-ready lifecycle status.
// Fixtures are synthetic directories under scratch/. Not covered (named, not claimed): the live
// host permission boundary of Read/Grep/Glob outside the guard, and the installed native Windows
// enforcement (matrix: native boundary/recovery consumer open).

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";

import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
} from "../project-onboarding-ready-gate.mjs";

const ONBOARDING_SCRIPT = fileURLToPath(new URL("../../scripts/project-onboarding-v3.mjs", import.meta.url));
// Fixtures live under the repository scratch/ tree: on Windows the OS temp dir sits under AppData,
// itself a protected credential root the read policy refuses, which would mask the cases under test.
const SCRATCH = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const HOOKS_JSON = new URL("../../hooks/hooks.json", import.meta.url);

function deny(status) {
  throw new ProjectOnboardingReadyError("PORG-NOT-READY", "synthetic non-ready lifecycle", {
    intent: "session", lifecycleStatus: status,
  });
}

function fixture({ junction = true } = {}) {
  mkdirSync(SCRATCH, { recursive: true });
  const project = mkdtempSync(join(SCRATCH, "ps-boundary-pin-project-"));
  const outside = mkdtempSync(join(SCRATCH, "ps-boundary-pin-outside-"));
  mkdirSync(join(project, ".claude"), { recursive: true });
  mkdirSync(join(project, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(project, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  writeFileSync(join(project, "pipeline.user.yaml"), "marker\n");
  writeFileSync(join(project, "in-root.md"), "safe\n");
  mkdirSync(join(project, "scratch"));
  // Synthetic stand-in for a signing-key directory: a name only, never real key material.
  mkdirSync(join(outside, "synthetic-signing-keys"));
  writeFileSync(join(outside, "synthetic-signing-keys", "synthetic-key.pem"), "NOT A KEY\n");
  writeFileSync(join(outside, "notes.md"), "fixture\n");
  if (junction) symlinkSync(outside, join(project, "escape"), process.platform === "win32" ? "junction" : "dir");
  return { project, outside, cleanup() {
    rmSync(project, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  } };
}

const depsFor = (project, status) => ({ projectDir: project, requireProjectOnboardingReadyFn() { deny(status); } });
const run = (tool_name, tool_input, deps) => evaluateLifecycleReadyGuard({ tool_name, tool_input }, deps);

test("A1: PowerShell refuses outside-root listings of a synthetic key directory", () => {
  const f = fixture();
  try {
    const deps = depsFor(f.project, "bootstrap-binding-required");
    const keyDir = join(f.outside, "synthetic-signing-keys");
    for (const command of [
      `Get-ChildItem -LiteralPath '${keyDir}'`,
      `Get-ChildItem -Path '${keyDir}'`,
      `Get-ChildItem '${keyDir}'`,
      `Get-ChildItem -LiteralPath '${f.outside}'`,
      `Get-Content -LiteralPath '${join(keyDir, "synthetic-key.pem")}'`,
      `Test-Path -LiteralPath '${keyDir}'`,
      `Get-ChildItem -LiteralPath '${join(f.project, "escape", "synthetic-signing-keys")}'`,
      `Get-Content -LiteralPath '${join(f.project, "escape", "synthetic-signing-keys", "synthetic-key.pem")}'`,
    ]) {
      const result = run("PowerShell", { command }, deps);
      assert.equal(result.exitCode, 2, command);
      assert.match(result.stderr, /GUARD-READ-TARGET/u, command);
    }
    // Control: the same lane still admits an exact in-root literal read.
    assert.equal(run("PowerShell", { command: `Get-Content -LiteralPath '${join(f.project, "in-root.md")}'` }, deps).exitCode, 0);
  } finally { f.cleanup(); }
});

test("A1: Bash and PowerShell agree on refusing outside-root synthetic key reads", () => {
  const f = fixture();
  try {
    const deps = depsFor(f.project, "bootstrap-binding-required");
    const keyDir = join(f.outside, "synthetic-signing-keys");
    // Bash `ls` is a names-only safe-directory listing by design; the content read is the boundary.
    const keyFile = join(keyDir, "synthetic-key.pem");
    assert.equal(run("Bash", { command: `cat '${keyFile}'` }, deps).exitCode, 2, "Bash cat");
    assert.equal(run("PowerShell", { command: `Get-Content -LiteralPath '${keyFile}'` }, deps).exitCode, 2, "PowerShell Get-Content");
    assert.equal(run("PowerShell", { command: `Get-ChildItem -LiteralPath '${keyDir}'` }, deps).exitCode, 2, "PowerShell Get-ChildItem");
  } finally { f.cleanup(); }
});

test("A1: PowerShell refuses unrelated commands in every controlling non-ready status", () => {
  const f = fixture();
  try {
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      const deps = depsFor(f.project, status);
      for (const command of [
        "Get-Date",
        "Write-Output implementation",
        "Remove-Item src -Recurse",
        "Invoke-WebRequest https://example.invalid",
        "New-Item -Path src/escaped.md -ItemType File",
        "Set-Content -LiteralPath src/escaped.md -Value x",
        "Set-Content -LiteralPath escape/escaped.md -Value x",
        "Set-Content -LiteralPath scratch/../outside.md -Value x",
        "Get-Content $env:SECRET",
        "Get-Content in-root.md; Get-Date",
        "Get-Content in-root.md | Out-Null",
        "node -e \"1\"",
      ]) {
        const result = run("PowerShell", { command }, deps);
        assert.equal(result.exitCode, 2, `${status}: ${command}`);
        assert.match(result.stderr, /GUARD-POWERSHELL-GRAMMAR|GUARD-READ-TARGET/u, `${status}: ${command}`);
      }
      assert.equal(run("Bash", { command: "printf implementation" }, deps).exitCode, 2, `${status}: Bash parity`);
    }
  } finally { f.cleanup(); }
});

test("A2: returned onboarding actions and contained scratch recovery work on the PowerShell lane", () => {
  const f = fixture();
  try {
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      const deps = depsFor(f.project, status);
      const ps = (command) => run("PowerShell", { command }, deps);
      assert.equal(ps(`node '${ONBOARDING_SCRIPT}' inspect --root '${f.project}' --runner claude --intent session`).exitCode, 0, `${status}: inspect`);
      assert.equal(ps(`node '${ONBOARDING_SCRIPT}' bootstrap-acknowledge-plan --root '${f.project}' --activate --runner claude --intent session`).exitCode, 0, `${status}: acknowledge-plan`);
      assert.equal(ps("New-Item -Path scratch/nested -ItemType Directory -Force").exitCode, 0, `${status}: scratch mkdir`);
      assert.equal(ps("Set-Content -LiteralPath scratch/nested/report.md -Value report").exitCode, 0, `${status}: scratch write`);
      assert.equal(ps(`Get-Content -LiteralPath '${join(f.project, "in-root.md")}'`).exitCode, 0, `${status}: in-root read`);
    }
    // The allowance is narrow: a tampered returned action is still refused.
    const deps = depsFor(f.project, "bootstrap-binding-required");
    const tampered = run("PowerShell", { command: `node '${ONBOARDING_SCRIPT}' inspect --root '${f.project}' --runner claude --intent session; Get-Date` }, deps);
    assert.equal(tampered.exitCode, 2);
  } finally { f.cleanup(); }
});

test("A3: Read, Grep and Glob admit in-root targets and refuse synthetic outside-root/sensitive paths", () => {
  // In-root admission, each tool separately, on a fixture without an escaping junction.
  const p = fixture({ junction: false });
  try {
    const pd = depsFor(p.project, "bootstrap-binding-required");
    assert.equal(run("Read", { file_path: join(p.project, "in-root.md") }, pd).exitCode, 0, "Read in-root");
    assert.equal(run("Grep", { pattern: "safe", path: join(p.project, "in-root.md") }, pd).exitCode, 0, "Grep in-root");
    assert.equal(run("Glob", { pattern: "*.md", path: p.project }, pd).exitCode, 0, "Glob in-root");
  } finally { p.cleanup(); }
  const f = fixture();
  try {
    const deps = depsFor(f.project, "bootstrap-binding-required");
    const keyDir = join(f.outside, "synthetic-signing-keys");
    for (const [tool, input] of [
      ["Grep", { pattern: "NOT", path: keyDir }],
      ["Grep", { pattern: "fixture", path: f.outside }],
      ["Glob", { pattern: "**/*", path: keyDir }],
      ["Glob", { pattern: "**/*", path: join(f.project, "escape") }],
      ["Glob", { pattern: "../**/*", path: f.project }],
      ["Glob", { pattern: join(keyDir, "*"), path: f.project }],
      ["Read", { file_path: join(keyDir, "synthetic-key.pem") }],
      ["Grep", { pattern: "NOT", path: join(keyDir, "synthetic-key.pem") }],
      ["Read", { file_path: join(f.project, "escape", "synthetic-signing-keys", "synthetic-key.pem") }],
    ]) {
      const result = run(tool, input, deps);
      assert.equal(result.exitCode, 2, `${tool} ${JSON.stringify(input)}`);
    }
  } finally { f.cleanup(); }
});

test("A4: hook registration covers the same tools the guard enforces", () => {
  const manifest = JSON.parse(readFileSync(HOOKS_JSON, "utf8"));
  const entries = manifest.hooks.PreToolUse.filter((entry) =>
    entry.hooks?.some((hook) => hook.command?.includes("guard-lifecycle-ready.mjs")));
  assert.ok(entries.length > 0, "guard-lifecycle-ready is registered for PreToolUse");
  const registered = (tool) => entries.some((entry) => new RegExp(`(^|\\|)${tool}(\\||$)`, "u").test(entry.matcher ?? ""));
  for (const tool of ["Bash", "PowerShell", "Read", "Grep", "Glob"]) {
    assert.ok(registered(tool), `${tool} is routed to the guard`);
  }
  // Agreement: each registered tool is actually decided (not silently allowed) by the guard.
  const f = fixture();
  try {
    const deps = depsFor(f.project, "bootstrap-binding-required");
    const outsideInputs = {
      Bash: { command: `cat '${join(f.outside, "synthetic-signing-keys", "synthetic-key.pem")}'` },
      PowerShell: { command: `Get-ChildItem -LiteralPath '${f.outside}'` },
      Read: { file_path: join(f.outside, "synthetic-signing-keys", "synthetic-key.pem") },
      Grep: { pattern: "fixture", path: f.outside },
      Glob: { pattern: "**/*", path: f.outside },
    };
    assert.equal(run("PowerShell", outsideInputs.PowerShell, deps).exitCode, 2);
    assert.equal(run("Bash", outsideInputs.Bash, deps).exitCode, 2);
    assert.equal(run("Read", outsideInputs.Read, deps).exitCode, 2);
    assert.equal(run("Grep", outsideInputs.Grep, deps).exitCode, 2);
    assert.equal(run("Glob", outsideInputs.Glob, deps).exitCode, 2);
  } finally { f.cleanup(); }
});
