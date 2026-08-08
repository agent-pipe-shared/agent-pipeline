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

import { PROJECT_RESET_PLAN_SCHEMA, classifyRuntimeProjectionProvenance, planProjectReset } from "./project-reset.mjs";
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
      // Beyond the five tier-resolved entries, the fixed order is identical --
      // EXCEPT for the two runtime-projection collision paths (R2B):
      // .claude/pipeline.yaml and .claude/pipeline.json are ALSO runtime-
      // projection targets. On the legacy tier both are already the
      // tier-resolved manifest/calibration entries above (positions 0 and 2),
      // so the runtime-projection loop skips them (already claimed). On the
      // neutral tier neither is claimed by the authority loop (this fixture
      // never created a legacy compatibility copy), so both get a
      // runtimeOwnedKeys entry the legacy plan does not have. Exclude that
      // documented asymmetry from the "otherwise identical" comparison and
      // assert it explicitly instead of letting it silently pass or fail.
      const isCollisionEntry = (entry) => entry.kind === "runtimeOwnedKeys"
        && (entry.path === ".claude/pipeline.yaml" || entry.path === ".claude/pipeline.json");
      const nonCollision = (entries) => entries.filter((entry) => !isCollisionEntry(entry));
      assert.deepEqual(
        nonCollision(legacyPlan.remove.slice(5)).map((e) => e.path),
        nonCollision(neutralPlan.remove.slice(5)).map((e) => e.path),
      );
      assert.equal(legacyPlan.remove.some(isCollisionEntry), false);
      assert.deepEqual(
        neutralPlan.remove.filter(isCollisionEntry).map((e) => e.path).sort(),
        [".claude/pipeline.json", ".claude/pipeline.yaml"],
      );
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
    // R2B: the fixture also carries runtime-projection targets now covered
    // by the plan (a preserve-only .codex/config.toml and an owned-keys
    // .codex/agents/critic.toml), so read-only-ness is proven over the
    // extended plan, not just the original five authority artifacts.
    mkdirSync(join(root, ".codex", "agents"), { recursive: true });
    writeFileSync(join(root, ".codex", "config.toml"), "# codex config\n");
    writeFileSync(join(root, ".codex", "agents", "critic.toml"), 'model = "x"\nmodel_reasoning_effort = "y"\n');
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

test("AC-1: runtime-projection targets are runner-neutral -- both .claude/* and .codex/* paths appear", () => {
  withFixture(freshProject("runner-neutral"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const allPaths = [...plan.remove, ...plan.keep].map((entry) => entry.path);
    assert.equal(allPaths.some((path) => path.startsWith(".claude/")), true);
    assert.equal(allPaths.some((path) => path.startsWith(".codex/")), true);
  });
});

test("AC-2: a runtime target with owned keys becomes a keys-scoped removal entry, never a whole-file remove", () => {
  withFixture(freshProject("owned-keys", { tier: "neutral" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const entry = plan.remove.find((candidate) => candidate.path === ".claude/pipeline.yaml");
    assert.ok(entry, "expected a runtime-projection entry for .claude/pipeline.yaml");
    assert.equal(entry.kind, "runtimeOwnedKeys");
    assert.equal(entry.type, "keys");
    assert.deepEqual(entry.ownedKeys, ["language.human_facing", "modelRouting", "runnerRoutes", "criticExport", "session.keep_awake"]);
    assert.equal(entry.existed, false);
    // Never a whole-file remove for the same path.
    assert.equal(plan.remove.filter((candidate) => candidate.path === ".claude/pipeline.yaml").length, 1);
  });
});

test("AC-3: a preserve-only runtime target with no owned keys is never removed", () => {
  withFixture(freshProject("preserve-only"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    for (const path of [".claude/settings.json", ".codex/config.toml"]) {
      const keepEntry = plan.keep.find((candidate) => candidate.path === path);
      assert.ok(keepEntry, `expected ${path} to be kept`);
      assert.equal(keepEntry.kind, "runtimePreserveOnly");
      assert.equal(typeof keepEntry.reason, "string");
      assert.equal(plan.remove.some((candidate) => candidate.path === path), false);
    }
  });
});

test("AC-4: no path appears in more than one of remove/keep, legacy and neutral tiers", () => {
  for (const tier of ["legacy", "neutral"]) {
    withFixture(kickoffFixture(`no-duplicate-${tier}`, { tier }), (root) => {
      const plan = planProjectReset({ rootDir: root });
      const paths = [...plan.remove.map((entry) => entry.path), ...plan.keep.map((entry) => entry.path)];
      assert.equal(new Set(paths).size, paths.length, `duplicate path in ${tier} plan`);
    });
  }
});

test("AC-4: the collision paths are claimed by the authority loop and skipped by the runtime loop, on both tiers", () => {
  withFixture(freshProject("collision-legacy", { tier: "legacy" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.remove.filter((entry) => entry.path === ".claude/pipeline.yaml").length, 1);
    assert.equal(plan.remove.find((entry) => entry.path === ".claude/pipeline.yaml").kind, "manifest");
    assert.equal(plan.remove.filter((entry) => entry.path === ".claude/pipeline.json").length, 1);
    assert.equal(plan.remove.find((entry) => entry.path === ".claude/pipeline.json").kind, "calibration");
  });
  withFixture(freshProject("collision-neutral", { tier: "neutral" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.remove.find((entry) => entry.path === ".claude/pipeline.yaml").kind, "runtimeOwnedKeys");
    assert.equal(plan.remove.find((entry) => entry.path === ".claude/pipeline.json").kind, "runtimeOwnedKeys");
  });
});

test("R2C AC-1: provenance is keyed by the projection field alone -- the classifier never receives a path", () => {
  // A whole-file-seed projection classifies as a whole-file removal
  // regardless of how few keys it lists -- the literal shape of the real
  // `.codex/agents/implementor.toml` / critic.toml manifest entries, which
  // list only the two route-owned keys yet the whole file is Pipeline prose.
  assert.equal(classifyRuntimeProjectionProvenance({ projection: "codex-custom-agent-v3", ownedKeys: ["model", "model_reasoning_effort"] }), "file");
  assert.equal(classifyRuntimeProjectionProvenance({ projection: "codex-advisor-agent-v3", ownedKeys: ["name", "description", "model", "model_reasoning_effort", "developer_instructions", "sandbox_mode"] }), "file");
  // A keys-patch projection classifies as a keys-scoped entry no matter how
  // MANY keys it owns, and no matter what its path would look like -- the
  // function is never given a path, so a `.codex/agents/`-prefix
  // implementation could not have produced this result.
  assert.equal(classifyRuntimeProjectionProvenance({ projection: "human-role-display-v3", ownedKeys: ["humanRoles.po.displayLabel"] }), "keys");
  assert.equal(classifyRuntimeProjectionProvenance({ projection: "claude-model-routing-v3", ownedKeys: ["language.human_facing", "modelRouting", "runnerRoutes", "criticExport", "session.keep_awake"] }), "keys");
  // preserve-only: no owned keys at all, regardless of projection kind.
  assert.equal(classifyRuntimeProjectionProvenance({ projection: "preserve-only", ownedKeys: [] }), "preserve");
  assert.equal(classifyRuntimeProjectionProvenance({ projection: "codex-custom-agent-v3", ownedKeys: [] }), "preserve");
});

test("R2C AC-1/AC-2: each of the seven manifest targets lands in the documented provenance class", () => {
  withFixture(freshProject("seven-targets", { tier: "neutral" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    const byPath = Object.fromEntries([
      ...plan.remove.map((entry) => [entry.path, { ...entry, set: "remove" }]),
      ...plan.keep.map((entry) => [entry.path, { ...entry, set: "keep" }]),
    ]);
    assert.deepEqual(
      { set: byPath[".claude/settings.json"].set, kind: byPath[".claude/settings.json"].kind },
      { set: "keep", kind: "runtimePreserveOnly" },
    );
    assert.deepEqual(
      { set: byPath[".codex/config.toml"].set, kind: byPath[".codex/config.toml"].kind },
      { set: "keep", kind: "runtimePreserveOnly" },
    );
    assert.deepEqual(
      { set: byPath[".claude/pipeline.json"].set, kind: byPath[".claude/pipeline.json"].kind, type: byPath[".claude/pipeline.json"].type },
      { set: "remove", kind: "runtimeOwnedKeys", type: "keys" },
    );
    assert.deepEqual(
      { set: byPath[".claude/pipeline.yaml"].set, kind: byPath[".claude/pipeline.yaml"].kind, type: byPath[".claude/pipeline.yaml"].type },
      { set: "remove", kind: "runtimeOwnedKeys", type: "keys" },
    );
    // AC-2 pin: the three Pipeline-seeded Codex agent files are whole-file
    // removals, never a keys entry that would leave a Pipeline-authored stub
    // (name/description/developer_instructions) behind.
    for (const path of [".codex/agents/implementor.toml", ".codex/agents/critic.toml", ".codex/agents/consult-advisor.toml"]) {
      assert.deepEqual(
        { set: byPath[path].set, kind: byPath[path].kind, type: byPath[path].type },
        { set: "remove", kind: "runtimeSeededFile", type: "file" },
        `expected ${path} to be a whole-file removal`,
      );
    }
  });
});

test("R2C AC-3: preserve-only never appears in remove, on either authority tier", () => {
  for (const tier of ["legacy", "neutral"]) {
    withFixture(freshProject(`preserve-only-${tier}`, { tier }), (root) => {
      const plan = planProjectReset({ rootDir: root });
      for (const path of [".claude/settings.json", ".codex/config.toml"]) {
        assert.equal(plan.remove.some((entry) => entry.path === path), false, `${path} must never be a remove entry (${tier})`);
        assert.equal(plan.keep.some((entry) => entry.path === path), true, `${path} must be a keep entry (${tier})`);
      }
    });
  }
});

test("AC-7: a plan containing runtime-projection removal and preserve-only keep entries validates against the schema", () => {
  withFixture(freshProject("schema-runtime", { tier: "neutral" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const result = validateAgainstSchema(plan, SCHEMA);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
    assert.equal(plan.remove.some((entry) => entry.kind === "runtimeOwnedKeys"), true);
    assert.equal(plan.keep.some((entry) => entry.kind === "runtimePreserveOnly"), true);
  });
});
