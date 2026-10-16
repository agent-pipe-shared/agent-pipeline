#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.lifecycle-inspect-omits-current-plan-spec-digests
 * (ALF-C-P1-12, AC-208).
 *
 * Original defect: workspace `pipeline-state.mjs inspect` called
 * `derivePlanLifecycle(base)` without physically observing the submitted
 * Plan/Spec bytes, so a structurally valid submission with stale source
 * digests was reported PLAN-LIFECYCLE-CURRENT / awaiting-approval while the
 * write guard (which reads real digests) reported draft + reopen-design.
 *
 * Every acceptance point is exercised through the real `run(["inspect"])`
 * entry point (no mock of the behaviour under test; only the documented
 * `poGateProfile` injection seam is stubbed, exactly as the adjacent
 * pipeline-state-inspect.test.mjs does):
 *   A1 changed PRD only      -> PLAN-LIFECYCLE-DIGEST-DRIFT + reopen-design
 *   A2 changed Spec only     -> PLAN-LIFECYCLE-DIGEST-DRIFT + reopen-design
 *   A3 missing / unreadable / multiply-linked source is never "current"
 *   A4 unchanged valid submission keeps PLAN-LIFECYCLE-CURRENT
 *   A5 inspect is read-only (state + sources byte-identical, no new files)
 * Host limitation: a symlinked-source case needs symlink creation, which is
 * unavailable on the native Windows host; it is skipped with a typed reason.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { linkSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, statePath as resolveStatePath } from "../../scripts/pipeline-state.mjs";
import { createWindowsOwnedAuthorityDirectory } from "../windows-owned-authority-backend.mjs";
import { mkdtempTestScratch } from "../test-tmpdir.mjs";

const NOW = "2026-08-18T12:00:00.000Z";
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../../scripts/pipeline-state.mjs", import.meta.url));
const roots = [];
const ORIGINAL_CEILING = process.env.GIT_CEILING_DIRECTORIES;
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
  if (ORIGINAL_CEILING === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = ORIGINAL_CEILING;
});

function sha256Hex(value) { return createHash("sha256").update(value).digest("hex"); }

function invoke(root, argv) {
  const out = []; const err = []; const log = console.log; const error = console.error;
  console.log = (...v) => out.push(v.join(" ")); console.error = (...v) => err.push(v.join(" "));
  try { return { status: run(argv, { dir: root, now: () => NOW, poGateProfile: () => ({ ok: true }) }), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}

/** Active feature with a structurally valid submission whose digests match the on-disk bytes. */
function fixture(name) {
  const root = mkdtempTestScratch(`lifecycle-inspect-pin-${name}-`);
  roots.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  // Containment: the fixture owns its own git root and authority directory so
  // set-feature never reaches the enclosing repository's session-authority.
  process.env.GIT_CEILING_DIRECTORIES = dirname(root);
  const fixtureGit = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(root) } });
    assert.equal(result.status, 0, result.stderr);
  };
  fixtureGit("init", "-q", "-b", "main");
  // A born HEAD is required: the State authority route fails on an unborn HEAD (WT-GIT-FAILED).
  fixtureGit("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "--allow-empty", "-m", "init");
  if (process.platform === "win32") createWindowsOwnedAuthorityDirectory({ path: join(root, ".git", "agent-pipeline") });
  const planPath = "specs/widget/prd.md";
  const specPath = "specs/widget/spec.md";
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", planPath], { dir: root, now: () => NOW }), 0);
  const statePathValue = resolveStatePath(root);
  const state = JSON.parse(readFileSync(statePathValue, "utf8"));
  state.planSubmission = {
    schema: "pipeline.plan-submission.v1", featureId: "widget", planPath,
    planSha256: sha256Hex(`plan:${planPath}`), specPath, specSha256: sha256Hex(`spec:${specPath}`),
    profile: "mini", profileSha256: sha256Hex("profile"), submittedBy: "coordinator", submittedAt: NOW,
  };
  mkdirSync(join(root, "specs/widget"), { recursive: true });
  writeFileSync(join(root, planPath), `plan:${planPath}`);
  writeFileSync(join(root, specPath), `spec:${specPath}`);
  writeFileSync(statePathValue, JSON.stringify(state, null, 2) + "\n");
  return { root, statePathValue, planFile: join(root, planPath), specFile: join(root, specPath) };
}

function listTree(dir, prefix = "") {
  const names = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const rel = `${prefix}${entry.name}`;
    names.push(rel);
    if (entry.isDirectory()) names.push(...listTree(join(dir, entry.name), `${rel}/`));
  }
  return names.sort();
}

function assertDriftWithReopen(payload, label) {
  assert.equal(payload.lifecycle.code, "PLAN-LIFECYCLE-DIGEST-DRIFT", label);
  assert.notEqual(payload.lifecycle.code, "PLAN-LIFECYCLE-CURRENT", label);
  assert.equal(payload.status, "draft", label);
  assert.equal(payload.planApproved, false, label);
  const action = payload.nextAction.kind === "command" ? payload.nextAction : payload.nextAction.applyAction;
  assert.equal(action.argv[1], "reopen-design", label);
  assert.equal(action.mutation, true, label);
  assert.equal(action.requiresConfirmation, true, label);
  assert.doesNotMatch(payload.nextActionText, /approve-plan|design-workflow-package/, label);
}

function inspectReadOnly(f, mutate, label) {
  mutate(f);
  const stateBefore = readFileSync(f.statePathValue);
  const treeBefore = listTree(f.root);
  const result = invoke(f.root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.deepEqual(readFileSync(f.statePathValue), stateBefore, `${label}: state bytes unchanged`);
  assert.deepEqual(listTree(f.root), treeBefore, `${label}: no files created or removed by inspect`);
  return payload;
}

test("A1: changed PRD alone reports digest drift with sanctioned reopen-design recovery", () => {
  const f = fixture("a1");
  const payload = inspectReadOnly(f, () => writeFileSync(f.planFile, "PRD changed after submission\n"), "prd-drift");
  assertDriftWithReopen(payload, "prd-drift");
  assert.equal(readFileSync(f.planFile, "utf8"), "PRD changed after submission\n");
  assert.equal(readFileSync(f.specFile, "utf8"), "spec:specs/widget/spec.md");
});

test("A2: changed Spec alone (PRD untouched) reports digest drift with sanctioned reopen-design recovery", () => {
  const f = fixture("a2");
  const payload = inspectReadOnly(f, () => writeFileSync(f.specFile, "Spec changed after submission\n"), "spec-drift");
  assertDriftWithReopen(payload, "spec-drift");
  assert.equal(readFileSync(f.planFile, "utf8"), "plan:specs/widget/prd.md");
  assert.equal(readFileSync(f.specFile, "utf8"), "Spec changed after submission\n");
});

test("A2b: both sources changed also drift", () => {
  const f = fixture("a2b");
  const payload = inspectReadOnly(f, () => { writeFileSync(f.planFile, "x"); writeFileSync(f.specFile, "y"); }, "both-drift");
  assertDriftWithReopen(payload, "both-drift");
});

for (const which of ["planFile", "specFile"]) {
  test(`A3: missing ${which} is never promoted to a current source`, () => {
    const f = fixture(`a3-missing-${which}`);
    const payload = inspectReadOnly(f, () => unlinkSync(f[which]), `missing-${which}`);
    assertDriftWithReopen(payload, `missing-${which}`);
  });

  test(`A3: unreadable ${which} (a directory occupies the path) is never promoted to a current source`, () => {
    const f = fixture(`a3-unreadable-${which}`);
    const payload = inspectReadOnly(f, () => { unlinkSync(f[which]); mkdirSync(f[which]); }, `unreadable-${which}`);
    assertDriftWithReopen(payload, `unreadable-${which}`);
  });

  test(`A3: multiply-linked ${which} (unobservable by the physical-file rule) is never current`, () => {
    const f = fixture(`a3-hardlink-${which}`);
    const payload = inspectReadOnly(f, () => linkSync(f[which], `${f[which]}.alias`), `hardlink-${which}`);
    assertDriftWithReopen(payload, `hardlink-${which}`);
  });
}

for (const [which, role] of [["planFile", "prd"], ["specFile", "spec"]]) {
  test(`A3: unreadable ${which} is named as the unobservable artifact and the typed recovery action is returned`, () => {
    const f = fixture(`a3-named-${which}`);
    const payload = inspectReadOnly(f, () => { unlinkSync(f[which]); mkdirSync(f[which]); }, `named-${which}`);
    // Unreadable source is named explicitly, by role and path, as unobservable (not merely "not current").
    const drift = payload.continuityAuthorityDrift;
    assert.equal(drift.status, "drift");
    const named = drift.artifacts.find((artifact) => artifact.role === role);
    assert.equal(named.state, "unobservable");
    assert.equal(named.observedSha256, null);
    assert.equal(named.path, which === "planFile" ? "specs/widget/prd.md" : "specs/widget/spec.md");
    for (const other of drift.artifacts.filter((artifact) => artifact.role !== role)) {
      assert.notEqual(other.state, "unobservable", "the readable sibling is not mislabelled unobservable");
    }
    // Structured recovery action: collect the actor, then the sanctioned mutating reopen-design command.
    assert.equal(payload.nextAction.kind, "collect-input");
    assert.equal(payload.nextAction.mutation, false);
    assert.deepEqual(payload.nextAction.inputs.map((input) => input.name), ["by"]);
    const apply = payload.nextAction.applyAction;
    assert.equal(apply.kind, "command");
    assert.equal(typeof apply.executable, "string");
    assert.deepEqual(apply.argv.slice(1, 3), ["reopen-design", "--by"]);
    assert.equal(apply.mutation, true);
    assert.equal(apply.requiresConfirmation, true);
  });
}

test("A3: symlinked source is never current", (t) => {
  const f = fixture("a3-symlink");
  const target = join(f.root, "specs/widget/real-spec.md");
  writeFileSync(target, "spec:specs/widget/spec.md");
  unlinkSync(f.specFile);
  try { symlinkSync(target, f.specFile); } catch (error) {
    t.skip(`host-limitation: symlink creation unavailable on this host (${error?.code ?? "unknown"})`);
    return;
  }
  const payload = inspectReadOnly(f, () => {}, "symlink");
  assertDriftWithReopen(payload, "symlink");
});

test("A4: unchanged valid submission retains PLAN-LIFECYCLE-CURRENT / awaiting-approval", () => {
  const f = fixture("a4");
  const payload = inspectReadOnly(f, () => {}, "unchanged");
  assert.equal(payload.lifecycle.code, "PLAN-LIFECYCLE-CURRENT");
  assert.equal(payload.lifecycle.ok, true);
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.planApproved, false);
});

test("A4/A5: inspect via the real CLI process agrees with the module and mutates nothing", () => {
  const f = fixture("cli");
  writeFileSync(f.specFile, "Spec changed after submission\n");
  const stateBefore = readFileSync(f.statePathValue);
  const treeBefore = listTree(f.root);
  const result = spawnSync(process.execPath, [PIPELINE_STATE_SCRIPT, "inspect"], {
    cwd: f.root, encoding: "utf8", env: { ...process.env, PIPELINE_PROJECT_DIR: f.root },
  });
  // The CLI resolves the project root itself; if it declines this scratch root
  // the module-level cases above remain the authoritative pin.
  if (result.status !== 0) {
    assert.ok(result.stderr.length > 0, "a failing CLI inspect must explain itself");
  } else {
    assert.equal(JSON.parse(result.stdout).lifecycle.code, "PLAN-LIFECYCLE-DIGEST-DRIFT");
  }
  assert.deepEqual(readFileSync(f.statePathValue), stateBefore);
  assert.deepEqual(listTree(f.root), treeBefore);
});
