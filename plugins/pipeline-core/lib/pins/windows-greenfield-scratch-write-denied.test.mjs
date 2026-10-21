#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Regression pin: pipeline.windows-greenfield-scratch-write-denied (ALF-C-P1-09, AC-269).
//
// Original acceptance (backlog item), one numbered point per describe-block:
//   W1. Native absolute and relative paths, drive-letter spelling and physical root aliases are
//       normalized before containment is tested.
//   W2. Symlink, hardlink and active-plugin exclusions are kept.
//   W3. The actual guard admits Claude Write and PowerShell New-Item / Set-Content for scratch,
//       and rejects escapes.
//   W4. The same tests run on macOS and Linux (native-Windows spellings are asserted per host).
//   W5. A fresh Windows intake completes -- NOT covered here (needs a live fresh host; named, not claimed).
//
// The real modules run unmocked (physical-scratch-boundary.mjs, write-scope.mjs, the PowerShell
// dialect through evaluateLifecycleReadyGuard). Only the project-readiness probe, a documented
// dependency seam, is driven to a non-ready lifecycle status. Fixtures live under the repository
// scratch/ tree (the OS temp root is a protected read root on Windows). Host limits: a directory
// alias needs a junction on win32 (symlink needs a privilege); a case that cannot create its
// alias is skipped as a typed host-limitation subtest, never silently passed.

import assert from "node:assert/strict";
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { isPhysicalScratchTarget } from "../physical-scratch-boundary.mjs";
import { isIntakeLifecycleScratchWrite, isPhysicalIntakeScratchPath } from "../guard/write-scope.mjs";
import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
} from "../project-onboarding-ready-gate.mjs";

// Two representative controlling statuses keep the suite fast; each guard call is slow on Windows.
const STATUSES = PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.filter(
  (status) => ["portable-seed-required", "bootstrap-binding-required"].includes(status));
const SCRATCH = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const WIN = process.platform === "win32";

function deny(status) {
  throw new ProjectOnboardingReadyError("PORG-NOT-READY", "synthetic non-ready lifecycle", {
    intent: "session", lifecycleStatus: status,
  });
}

function fixture() {
  mkdirSync(SCRATCH, { recursive: true });
  const base = mkdtempSync(join(SCRATCH, "greenfield-scratch-pin-"));
  const project = join(base, "project");
  const outside = join(base, "outside");
  mkdirSync(join(project, "scratch", "nested"), { recursive: true });
  mkdirSync(join(project, "src"));
  mkdirSync(outside);
  writeFileSync(join(outside, "target.md"), "outside\n");
  return { base, project, outside, cleanup() { rmSync(base, { recursive: true, force: true }); } };
}

// A directory alias; null when the host cannot create one (typed host limitation).
function tryAlias(target, path) {
  try { symlinkSync(target, path, WIN ? "junction" : "dir"); return true; } catch { return false; }
}

const depsFor = (project, status) => ({ projectDir: project, requireProjectOnboardingReadyFn() { deny(status); } });
const ps = (command, deps) => evaluateLifecycleReadyGuard({ tool_name: "PowerShell", tool_input: { command } }, deps);
const GRAMMAR = /GUARD-POWERSHELL-GRAMMAR/u;
const flip = (value) => value.replaceAll("\\", "/");

test("W1: relative and absolute spellings of the same scratch file are normalized to one decision", () => {
  const f = fixture();
  try {
    const abs = join(f.project, "scratch", "nested", "report.md");
    for (const spelling of ["scratch/nested/report.md", "./scratch/nested/report.md", abs, resolve(abs)]) {
      assert.equal(isPhysicalIntakeScratchPath(spelling, f.project), true, spelling);
    }
    // Directory-creation of the scratch root itself is allowed only where documented (allowScratchRoot).
    assert.equal(isPhysicalIntakeScratchPath("scratch", f.project), false, "scratch root as a file target");
    assert.equal(isPhysicalIntakeScratchPath("scratch", f.project, {}, { allowScratchRoot: true }), true, "scratch root as a directory target");
  } finally { f.cleanup(); }
});

test("W1: native Windows spellings (separators, drive-letter case) admit the same file", { skip: !WIN && "host limitation: native Windows spellings exist only on a win32 host" }, () => {
  const f = fixture();
  try {
    const abs = join(f.project, "scratch", "nested", "report.md");
    const upper = abs[0].toUpperCase() + abs.slice(1);
    const lower = abs[0].toLowerCase() + abs.slice(1);
    for (const spelling of [abs, flip(abs), upper, lower, abs.toUpperCase().replace("SCRATCH", "scratch")]) {
      assert.equal(isPhysicalIntakeScratchPath(spelling, f.project), true, spelling);
    }
    // Drive-relative spelling ("C:foo") is refused, never reinterpreted.
    assert.equal(isPhysicalIntakeScratchPath(`${abs[0]}:scratch/x.md`, f.project), false, "drive-relative");
    // A different drive-letter root is a different location, not a spelling.
    const otherDrive = String.fromCharCode(abs[0].toUpperCase() === "Z" ? 89 : 90) + abs.slice(1);
    assert.equal(isPhysicalIntakeScratchPath(otherDrive, f.project), false, "other drive");
  } finally { f.cleanup(); }
});

test("W1/W4: on a non-Windows host native-Windows spellings are refused, not reinterpreted", { skip: WIN && "host limitation: asserted only on a non-win32 host" }, () => {
  const f = fixture();
  try {
    assert.equal(isPhysicalIntakeScratchPath("scratch\\nested\\x.md", f.project), false, "backslash");
    assert.equal(isPhysicalIntakeScratchPath("C:\\scratch\\x.md", f.project), false, "drive letter");
  } finally { f.cleanup(); }
});

test("W1: a physical root alias is resolved before containment (alias root and real root agree)", { skip: false }, (t) => {
  const f = fixture();
  try {
    const alias = join(f.base, "project-alias");
    if (!tryAlias(f.project, alias)) { t.skip("host limitation: directory alias (junction/symlink) cannot be created"); return; }
    // The guard realpaths its project root before any containment test (evaluate.mjs), so a
    // session started through an alias spelling decides exactly like the physical root.
    const deps = depsFor(alias, "bootstrap-binding-required");
    assert.equal(ps("Set-Content -LiteralPath scratch/nested/a.md -Value x", deps).exitCode, 0, "alias project dir, relative target");
    // powershell-dialect.mjs powerShellScratchPath: off win32 an absolute (win32-rooted) PowerShell target is refused outright,
    // so the alias-spelled absolute target is admitted only on a native Windows host and fails closed everywhere else.
    const aliasAbs = ps(`Set-Content -LiteralPath '${join(alias, "scratch", "nested", "a.md")}' -Value x`, deps);
    if (WIN) assert.equal(aliasAbs.exitCode, 0, "alias project dir, alias-spelled target");
    else assert.match(aliasAbs.stderr, GRAMMAR, "alias project dir, alias-spelled absolute target is refused off win32");
    assert.match(ps("Set-Content -LiteralPath src/a.md -Value x", deps).stderr, GRAMMAR, "alias project dir, non-scratch target");
    // The bare predicate stays fail-closed on an unresolved alias root: it never widens scope.
    assert.equal(isPhysicalIntakeScratchPath("scratch/nested/a.md", alias), false, "unresolved alias root is refused by the predicate itself");
    assert.equal(isPhysicalIntakeScratchPath("scratch/nested/a.md", f.project), true, "physical root control");
  } finally { f.cleanup(); }
});

test("W2: a scratch descendant that is a directory alias into product or outside paths is refused", (t) => {
  const f = fixture();
  try {
    if (!tryAlias(f.outside, join(f.project, "scratch", "link-out"))
      || !tryAlias(join(f.project, "src"), join(f.project, "scratch", "link-src"))) {
      t.skip("host limitation: directory alias (junction/symlink) cannot be created"); return;
    }
    assert.equal(isPhysicalIntakeScratchPath("scratch/link-out/x.md", f.project), false, "alias to outside");
    assert.equal(isPhysicalIntakeScratchPath("scratch/link-src/x.md", f.project), false, "alias to product dir");
    assert.equal(isPhysicalIntakeScratchPath("scratch/link-out", f.project, {}, { allowScratchRoot: true }), false, "the alias itself");
    for (const status of STATUSES) {
      const deps = depsFor(f.project, status);
      assert.match(ps("Set-Content -LiteralPath scratch/link-src/x.md -Value x", deps).stderr, GRAMMAR, `${status}: Set-Content through alias`);
      assert.match(ps("New-Item -Path scratch/link-out/x.md -ItemType File", deps).stderr, GRAMMAR, `${status}: New-Item through alias`);
    }
  } finally { f.cleanup(); }
});

test("W2: a scratch root that is itself an alias out of the project is refused", (t) => {
  const f = fixture();
  try {
    rmSync(join(f.project, "scratch"), { recursive: true, force: true });
    if (!tryAlias(f.outside, join(f.project, "scratch"))) {
      t.skip("host limitation: directory alias (junction/symlink) cannot be created"); return;
    }
    assert.equal(isPhysicalIntakeScratchPath("scratch/x.md", f.project), false);
    assert.equal(isPhysicalIntakeScratchPath("scratch", f.project, {}, { allowScratchRoot: true }), false);
  } finally { f.cleanup(); }
});

test("W2: a hardlinked scratch file (nlink > 1) is refused, a plain file is admitted", () => {
  const f = fixture();
  try {
    const plain = join(f.project, "scratch", "plain.md");
    writeFileSync(plain, "x\n");
    assert.equal(isPhysicalIntakeScratchPath("scratch/plain.md", f.project), true, "plain existing file");
    const hard = join(f.project, "scratch", "hard.md");
    linkSync(join(f.outside, "target.md"), hard);
    assert.equal(isPhysicalIntakeScratchPath("scratch/hard.md", f.project), false, "hardlink to an outside file");
    linkSync(plain, join(f.project, "scratch", "plain-twin.md"));
    assert.equal(isPhysicalIntakeScratchPath("scratch/plain.md", f.project), false, "file with a second link");
    for (const status of STATUSES) {
      assert.match(ps("Set-Content -LiteralPath scratch/hard.md -Value x", depsFor(f.project, status)).stderr, GRAMMAR, status);
    }
  } finally { f.cleanup(); }
});

test("W2: an active plugin root beneath scratch stays excluded (declared live-root seam)", async () => {
  const f = fixture();
  try {
    const plugin = join(f.project, "scratch", "active-plugin");
    mkdirSync(join(plugin, "hooks"), { recursive: true });
    const opts = { rootDir: f.project, liveRoots: [plugin] };
    assert.equal(isPhysicalScratchTarget("scratch/active-plugin/hooks/h.mjs", opts), false, "inside live plugin root");
    assert.equal(isPhysicalScratchTarget("scratch/active-plugin", { ...opts, allowScratchRoot: true }), false, "the live plugin root itself");
    assert.equal(isPhysicalScratchTarget("scratch/nested/ok.md", opts), true, "sibling scratch path stays admitted");
    // The executing module's own plugin install is always a live root (no seam needed). To place
    // that install beneath the project's scratch, run a byte-identical copy of the real module from
    // <project>/scratch/own-plugin/lib/: its default own root is then <project>/scratch/own-plugin.
    // The module imports only node builtins, so the copy behaves exactly like the original.
    const own = join(f.project, "scratch", "own-plugin");
    mkdirSync(join(own, "lib"), { recursive: true });
    mkdirSync(join(own, "hooks"), { recursive: true });
    const copy = join(own, "lib", "physical-scratch-boundary.mjs");
    copyFileSync(fileURLToPath(new URL("../physical-scratch-boundary.mjs", import.meta.url)), copy);
    const mod = await import(pathToFileURL(copy).href);
    const target = "scratch/own-plugin/hooks/x.mjs";
    // Default exclusion only (no liveRoots passed): refused.
    assert.equal(mod.isPhysicalScratchTarget(target, { rootDir: f.project }), false, "own plugin install beneath scratch");
    assert.equal(mod.isPhysicalScratchTarget("scratch/own-plugin", { rootDir: f.project, allowScratchRoot: true }), false, "own plugin root itself");
    // Flip: with the own-plugin exclusion removed (empty liveRoots), the same path is plain
    // scratch and is admitted -- so the refusal above is caused by that exclusion alone.
    assert.equal(mod.isPhysicalScratchTarget(target, { rootDir: f.project, liveRoots: [] }), true, "same path without the exclusion");
    assert.equal(mod.isPhysicalScratchTarget("scratch/nested/ok.md", { rootDir: f.project }), true, "sibling stays admitted under the default");
  } finally { f.cleanup(); }
});

test("W3: the guard admits PowerShell New-Item and Set-Content/Add-Content for scratch in every non-ready status", () => {
  const f = fixture();
  try {
    for (const status of STATUSES) {
      const deps = depsFor(f.project, status);
      const abs = (...p) => join(f.project, "scratch", ...p);
      for (const command of [
        "New-Item -Path scratch/made -ItemType Directory -Force",
        "New-Item -Path scratch/nested/new.md -ItemType File",
        "Set-Content -LiteralPath scratch/nested/report.md -Value report",
        "Set-Content -Path scratch/nested/report.md -Value report -Encoding utf8",
        "Add-Content -LiteralPath scratch/nested/report.md -Value more",
      ]) assert.equal(ps(command, deps).exitCode, 0, `${status}: ${command}`);
      // Absolute spellings: powerShellScratchPath admits them only on a native Windows host (off win32 any win32-rooted
      // target, which includes every POSIX absolute path, is refused -- fail closed).
      for (const command of [
        `New-Item -Path '${abs("nested", "abs.md")}' -ItemType File`,
        `Set-Content -LiteralPath '${abs("nested", "abs.md")}' -Value x`,
      ]) {
        const result = ps(command, deps);
        if (WIN) assert.equal(result.exitCode, 0, `${status}: ${command}`);
        else { assert.equal(result.exitCode, 2, `${status}: ${command}`); assert.match(result.stderr, GRAMMAR, `${status}: ${command}`); }
      }
      if (WIN) {
        const native = abs("nested", "native.md");
        const lowerDrive = native[0].toLowerCase() + native.slice(1);
        for (const command of [
          `New-Item -Path '${flip(native)}' -ItemType File`,
          `Set-Content -LiteralPath '${lowerDrive}' -Value x`,
          `Set-Content -LiteralPath '${native[0].toUpperCase() + native.slice(1)}' -Value x`,
        ]) assert.equal(ps(command, deps).exitCode, 0, `${status}: native ${command}`);
      }
    }
  } finally { f.cleanup(); }
});

test("W3: the guard rejects PowerShell scratch escapes and unsafe spellings", () => {
  const f = fixture();
  try {
    const outsideFile = join(f.outside, "x.md");
    for (const status of STATUSES) {
      const deps = depsFor(f.project, status);
      for (const command of [
        "New-Item -Path src/not-scratch.md -ItemType File",
        "New-Item -Path scratch/../src/escape.md -ItemType File",
        "New-Item -Path scratch/* -ItemType File",
        "Set-Content -LiteralPath src/app.js -Value x",
        "Set-Content -LiteralPath scratch/../outside.md -Value x",
        "Set-Content -LiteralPath ~/scratch/x.md -Value x",
        "Set-Content -LiteralPath scratch/$x.md -Value x",
        "Set-Content -LiteralPath scratch/nested/a.md -Value x -Force",
        "Set-Content -LiteralPath scratch/nested/a.md -Path scratch/nested/b.md -Value x",
        "Set-Content -LiteralPath scratch/nested/a.md -Value x -Encoding unicode",
        "Set-Content -LiteralPath scratch/nested/a.md",
        "New-Item -Path scratch/nested/a.md -ItemType SymbolicLink",
        "New-Item -Path scratch/nested/a.md",
        `New-Item -Path '${outsideFile}' -ItemType File`,
        `Set-Content -LiteralPath '${outsideFile}' -Value x`,
        `Add-Content -LiteralPath '${outsideFile}' -Value x`,
        "Set-Content -LiteralPath scratch/nested/a.md -Value x; Get-Date",
      ]) {
        const result = ps(command, deps);
        assert.equal(result.exitCode, 2, `${status}: ${command}`);
        assert.match(result.stderr, GRAMMAR, `${status}: ${command}`);
      }
    }
  } finally { f.cleanup(); }
});

test("W3: Claude Write/Edit targets under scratch are recognized as intake scratch; escapes are not", () => {
  const f = fixture();
  try {
    const write = (tool_name, file_path) => isIntakeLifecycleScratchWrite({ tool_name, tool_input: { file_path } }, f.project);
    const abs = join(f.project, "scratch", "nested", "note.md");
    for (const tool of ["Write", "Edit"]) {
      assert.equal(write(tool, "scratch/nested/note.md"), true, `${tool} relative`);
      assert.equal(write(tool, abs), true, `${tool} absolute`);
      assert.equal(write(tool, "scratch/../src/x.md"), false, `${tool} traversal`);
      assert.equal(write(tool, "src/x.md"), false, `${tool} product path`);
      assert.equal(write(tool, join(f.outside, "x.md")), false, `${tool} outside root`);
    }
    assert.equal(write("Read", abs), false, "non-write tool");
    if (WIN) {
      assert.equal(write("Write", abs[0].toLowerCase() + abs.slice(1)), true, "lower-case drive letter");
      assert.equal(write("Write", flip(abs)), true, "forward-slash native path");
    }
  } finally { f.cleanup(); }
});

test("W3: the live guard decision for a Claude Write is not made by the scratch predicate alone (control)", () => {
  // Control for the case above: a Write outside scratch must stay refused by the actual guard in
  // every non-ready status, so the predicate cannot be the only barrier a reviewer relies on.
  const f = fixture();
  try {
    for (const status of STATUSES) {
      const r = evaluateLifecycleReadyGuard(
        { tool_name: "Write", tool_input: { file_path: join(f.project, "src", "x.md"), content: "x" } },
        depsFor(f.project, status));
      assert.equal(r.exitCode, 2, status);
    }
  } finally { f.cleanup(); }
});
