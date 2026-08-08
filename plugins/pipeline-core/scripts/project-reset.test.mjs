#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { PROJECT_RESET_PLAN_SCHEMA, planProjectReset } from "./project-reset.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { applyOnboardingKickoff, planOnboardingKickoff } from "../lib/onboarding-continuity.mjs";

const SCHEMA = JSON.parse(readFileSync(new URL("./project-reset-plan.schema.json", import.meta.url), "utf8"));

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

/** Manifest + calibration only -- the precondition kickoff itself requires, not its output. */
function seedManifestAndCalibration(root, { tier = "legacy", handover } = {}) {
  const dir = tier === "neutral" ? join(root, "project") : join(root, ".claude");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pipeline.yaml"), "schema: pipeline.project.v1\n");
  const calibration = {
    project: "fixture",
    verify: "node verify.mjs",
    autonomy: "bounded",
    branchModel: "local",
    worktree: "supported",
    stakes: "high",
    constraints: [],
    ...(handover === undefined ? {} : { handover }),
  };
  writeFileSync(join(dir, "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
}

function freshProject(name, options = {}) {
  const root = mkdtempSync(join(tmpdir(), `project-reset-${name}-`));
  git(root, ["init", "-q"]);
  seedManifestAndCalibration(root, options);
  return root;
}

/** State/handover/PRD/spec/history seeded through the REAL kickoff producer, never hand-written. */
function kickoffFixture(name, options = {}) {
  const root = freshProject(name, options);
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Fixture goal for the reset planner" });
  applyOnboardingKickoff({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  return root;
}

function withFixture(root, run) {
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

/** Full recursive path+kind+content-digest inventory, for byte-for-byte before/after comparison. */
function inventory(root) {
  const entries = [];
  const visit = (dir, rel = "") => {
    for (const name of readdirSync(dir).sort()) {
      const child = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const stat = lstatSync(child);
      if (stat.isSymbolicLink()) entries.push(`l\0${relPath}`);
      else if (stat.isDirectory()) { entries.push(`d\0${relPath}`); visit(child, relPath); }
      else entries.push(`f\0${relPath}\0${createHash("sha256").update(readFileSync(child)).digest("hex")}`);
    }
  };
  visit(root);
  return entries.join("\n");
}

test("AC-2: legacy and neutral authority tiers differ in exactly the five tier-resolved paths", () => {
  withFixture(kickoffFixture("legacy-tier", { tier: "legacy" }), (legacyRoot) => {
    withFixture(kickoffFixture("neutral-tier", { tier: "neutral" }), (neutralRoot) => {
      const legacyPlan = planProjectReset({ rootDir: legacyRoot });
      const neutralPlan = planProjectReset({ rootDir: neutralRoot });
      assert.equal(legacyPlan.status, "ready");
      assert.equal(neutralPlan.status, "ready");
      assert.equal(legacyPlan.authorityTier, "legacy");
      assert.equal(neutralPlan.authorityTier, "neutral");
      assert.deepEqual(legacyPlan.remove.slice(0, 5).map((e) => e.path), [
        ".claude/pipeline.yaml", ".claude/pipeline-state.json", ".claude/pipeline.json",
        ".claude/guard-config.json", ".claude/guard-override.log.jsonl",
      ]);
      assert.deepEqual(neutralPlan.remove.slice(0, 5).map((e) => e.path), [
        "project/pipeline.yaml", "project/pipeline-state.json", "project/pipeline.json",
        "project/guard-config.json", "project/guard-override.log.jsonl",
      ]);
      // Only the five tier-resolved entries differ; the fixed order after them (handover) is identical.
      assert.deepEqual(legacyPlan.remove.slice(5).map((e) => e.path), neutralPlan.remove.slice(5).map((e) => e.path));
    });
  });
});

test("AC-2: a configured calibration.handover is removed; the default docs/state.md is not", () => {
  withFixture(kickoffFixture("custom-handover", { tier: "neutral", handover: "docs/CUSTOM_HANDOVER.md" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    const handoverEntry = plan.remove.find((entry) => entry.kind === "handover");
    assert.equal(handoverEntry.path, "docs/CUSTOM_HANDOVER.md");
    assert.equal(handoverEntry.existed, true);
    assert.equal(plan.remove.some((entry) => entry.path === "docs/state.md"), false);
  });
  withFixture(kickoffFixture("default-handover", { tier: "neutral" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const handoverEntry = plan.remove.find((entry) => entry.kind === "handover");
    assert.equal(handoverEntry.path, "docs/state.md");
    assert.equal(handoverEntry.existed, true);
  });
});

test("AC-3: remove never contains a directory the Pipeline merely writes into, only the seeded file", () => {
  withFixture(kickoffFixture("docs-specs-guard"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const paths = plan.remove.map((entry) => entry.path);
    assert.equal(paths.includes("docs"), false);
    assert.equal(paths.includes("docs/"), false);
    assert.equal(paths.includes("specs"), false);
    assert.equal(plan.remove.some((entry) => entry.path.startsWith("specs/")), false);
    assert.equal(plan.remove.some((entry) => entry.path === "docs/state.md"), true);
    for (const entry of plan.remove) {
      if (entry.type === "directory") assert.equal(entry.path, ".git/agent-pipeline", "the only directory remove entry is the Pipeline's own wholesale private state");
    }
  });
});

test("AC-1: neverTouched names git history, adopter files, and specs/ as a design package", () => {
  withFixture(freshProject("categories"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    assert.deepEqual(plan.neverTouched.map((entry) => entry.category), ["git-history", "adopter-files", "design-package"]);
    const designPackage = plan.neverTouched.find((entry) => entry.category === "design-package");
    assert.match(designPackage.description, /specs\//);
  });
});

test("AC-4: plan is read-only -- byte-identical before and after, including a damaged/non-ready project", () => {
  withFixture(kickoffFixture("readonly-ready"), (root) => {
    const before = inventory(root);
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(inventory(root), before);
  });
  // Damaged: neutral authority is ready, but a legacy lifecycle State copy also
  // exists -- project-authority.mjs classifies this exact shape as
  // "migration-required". The planner must still be read-only over it.
  withFixture(kickoffFixture("readonly-damaged", { tier: "neutral" }), (root) => {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline-state.json"), "{}\n");
    const before = inventory(root);
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(inventory(root), before);
  });
});

test("AC-5: the plan is digest-bound and deterministic; a configuration change changes the digest", () => {
  withFixture(kickoffFixture("digest-repeat"), (root) => {
    const first = planProjectReset({ rootDir: root });
    const second = planProjectReset({ rootDir: root });
    assert.equal(first.planSha256, second.planSha256);
    assert.deepEqual(first, second);
  });
  withFixture(kickoffFixture("digest-legacy", { tier: "legacy" }), (legacyRoot) => {
    withFixture(kickoffFixture("digest-neutral", { tier: "neutral" }), (neutralRoot) => {
      const legacyPlan = planProjectReset({ rootDir: legacyRoot });
      const neutralPlan = planProjectReset({ rootDir: neutralRoot });
      assert.notEqual(legacyPlan.planSha256, neutralPlan.planSha256);
    });
  });
  withFixture(kickoffFixture("digest-default-handover", { tier: "neutral" }), (defaultRoot) => {
    withFixture(kickoffFixture("digest-custom-handover", { tier: "neutral", handover: "docs/OTHER.md" }), (customRoot) => {
      const defaultPlan = planProjectReset({ rootDir: defaultRoot });
      const customPlan = planProjectReset({ rootDir: customRoot });
      assert.notEqual(defaultPlan.planSha256, customPlan.planSha256);
    });
  });
});

test("AC-6: a root with no manifest at either tier is refused as not-a-project", () => {
  const root = mkdtempSync(join(tmpdir(), "project-reset-empty-"));
  try {
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "not-a-project");
    assert.equal(plan.code, "PROJECT-RESET-NOT-A-PROJECT");
    assert.deepEqual(plan.remove, []);
    assert.deepEqual(plan.keep, []);
    assert.equal(plan.neverTouched.length, 3);
    assert.equal(plan.planSha256, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-6: a resolved manifest path that is a directory, not a file, is refused as authority-unreadable", () => {
  withFixture(freshProject("unreadable-authority", { tier: "neutral" }), (root) => {
    rmSync(join(root, "project", "pipeline.yaml"));
    mkdirSync(join(root, "project", "pipeline.yaml"));
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "authority-unreadable");
    assert.equal(plan.code, "PROJECT-RESET-AUTHORITY-UNREADABLE");
  });
});

test("AC-6: a root that is a symlink is refused distinctly from the other two refusals", () => {
  const parent = mkdtempSync(join(tmpdir(), "project-reset-symlink-parent-"));
  const real = freshProject("symlink-target", { tier: "neutral" });
  const link = join(parent, "link");
  try {
    symlinkSync(real, link, "dir");
    const plan = planProjectReset({ rootDir: link });
    assert.equal(plan.status, "root-unsafe");
    assert.equal(plan.code, "PROJECT-RESET-ROOT-SYMLINK");
    assert.notEqual(plan.status, "not-a-project");
    assert.notEqual(plan.status, "authority-unreadable");
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

test("AC-6: absent paths are not a refusal -- a partially-reset (pre-kickoff) project still gets a plan", () => {
  withFixture(freshProject("partial", { tier: "neutral" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    const byKind = Object.fromEntries(plan.remove.map((entry) => [entry.kind, entry]));
    assert.equal(byKind.manifest.existed, true);
    assert.equal(byKind.calibration.existed, true);
    assert.equal(byKind.state.existed, false);
    assert.equal(byKind.guardConfig.existed, false);
    assert.equal(byKind.guardAudit.existed, false);
    assert.equal(byKind.handover.existed, false);
  });
});

test("AC-7: the emitted plan validates against its schema, both ready and refused", () => {
  withFixture(kickoffFixture("schema-ready"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const result = validateAgainstSchema(plan, SCHEMA);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
    assert.equal(plan.schema, PROJECT_RESET_PLAN_SCHEMA);
  });
  const empty = mkdtempSync(join(tmpdir(), "project-reset-schema-empty-"));
  try {
    const refused = planProjectReset({ rootDir: empty });
    const result = validateAgainstSchema(refused, SCHEMA);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("keep: a compatibility artifact retained at the non-selected authority tier is kept, not removed", () => {
  withFixture(kickoffFixture("keep-compat", { tier: "neutral" }), (root) => {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.project.v1\n");
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    const keepEntry = plan.keep.find((entry) => entry.kind === "manifest");
    assert.ok(keepEntry, "expected a kept legacy manifest compatibility entry");
    assert.equal(keepEntry.path, ".claude/pipeline.yaml");
    assert.equal(keepEntry.existed, true);
    assert.equal(typeof keepEntry.reason, "string");
    assert.equal(plan.remove.some((entry) => entry.path === ".claude/pipeline.yaml"), false);
  });
});

test("privateState: an ordinary repository's private Pipeline directory is a wholesale remove entry", () => {
  withFixture(kickoffFixture("private-state"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const entry = plan.remove.find((candidate) => candidate.kind === "privateState");
    assert.ok(entry, "expected a privateState remove entry for an ordinary (non-worktree) repository");
    assert.equal(entry.path, ".git/agent-pipeline");
    assert.equal(entry.type, "directory");
    assert.equal(entry.existed, true);
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding", "continuity-history.json")), true);
  });
});
