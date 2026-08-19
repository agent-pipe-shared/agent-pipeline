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

import {
  PROJECT_RESET_APPLY_RESULT_SCHEMA,
  PROJECT_RESET_PLAN_SCHEMA,
  RESET_APPLY_FAULT_STAGES,
  applyProjectReset,
  classifyRuntimeProjectionProvenance,
  planProjectReset,
  planRequiresKeySurgery,
} from "./project-reset.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import {
  applyOnboardingKickoff,
  applyOnboardingKickoffPromotion,
  planOnboardingKickoff,
  planOnboardingKickoffPromotion,
} from "../lib/onboarding-continuity.mjs";

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

/**
 * A kickoff whose anchor has been PROMOTED -- carries the real supersession
 * marker a promotion transaction writes (onboarding-continuity.mjs:4353),
 * naming a real successor package. Request shape mirrors the minimal
 * `promotionSeed` fixture in onboarding-continuity.test.mjs:952 (profile
 * "feature", no `runner` -- unneeded for a fresh, non-legacy-continuity
 * promotion).
 */
function promotedKickoffFixture(name, options = {}) {
  const root = freshProject(name, options);
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: `Promote ${name}` });
  applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
  const directory = join(root, "specs", "promoted");
  mkdirSync(directory, { recursive: true });
  const specBytes = `# ${name} specification\n`;
  writeFileSync(join(directory, "spec.md"), specBytes);
  writeFileSync(join(directory, "prd_promoted.md"), [
    "<!-- po-language: en -->",
    `<!-- technical-spec-sha256: ${createHash("sha256").update(specBytes).digest("hex")} -->`,
    "<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->",
    `# ${name} PRD`,
    "",
  ].join("\n"));
  writeFileSync(join(directory, "design-input.md"), `# ${name} design input\n`);
  const promotion = planOnboardingKickoffPromotion({
    rootDir: root,
    profile: "feature",
    featureId: `feature-${name}`,
    planPath: "specs/promoted/prd_promoted.md",
    prdPath: "specs/promoted/prd_promoted.md",
    specPath: "specs/promoted/spec.md",
    designInputPath: "specs/promoted/design-input.md",
  });
  const applied = applyOnboardingKickoffPromotion({
    plan: promotion, expectedPlanSha256: promotion.planSha256, activate: true,
  });
  assert.equal(applied.status, "applied");
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

/** Every inventory() line whose relPath is exactly `relPrefix` or nested under it. */
function linesFor(text, relPrefix) {
  return text.split("\n").filter((line) => {
    const relPath = line.split("\0")[1];
    return relPath === relPrefix || relPath.startsWith(`${relPrefix}/`);
  });
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

test("NVA-BL-64: project/critical-human-proof.json and project/push-threat-model.md are classified and actually removed by apply", () => {
  withFixture(kickoffFixture("proof-policy-artifacts", { tier: "neutral" }), (root) => {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "critical-human-proof.json"), "{}\n");
    writeFileSync(join(root, "project", "push-threat-model.md"), "# Fixture push threat model\n");
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    const proofEntry = plan.remove.find((entry) => entry.path === "project/critical-human-proof.json");
    assert.ok(proofEntry, "expected project/critical-human-proof.json to be classified in remove");
    assert.equal(proofEntry.kind, "runtimeSeededFile");
    assert.equal(proofEntry.type, "file");
    assert.equal(proofEntry.existed, true);
    const threatModelEntry = plan.remove.find((entry) => entry.path === "project/push-threat-model.md");
    assert.ok(threatModelEntry, "expected project/push-threat-model.md to be classified in remove");
    assert.equal(threatModelEntry.kind, "runtimeSeededFile");
    assert.equal(threatModelEntry.type, "file");
    assert.equal(threatModelEntry.existed, true);
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(result.status, "applied");
    assert.equal(existsSync(join(root, "project", "critical-human-proof.json")), false, "expected the proof policy to be gone after apply");
    assert.equal(existsSync(join(root, "project", "push-threat-model.md")), false, "expected the push threat model to be gone after apply");
  });
});

test("AC-3: remove never contains a directory the Pipeline merely writes into, only the seeded file or a Pipeline-created anchor", () => {
  // R3: `kickoffFixture` seeds a genuine, UNPROMOTED kickoff anchor, so
  // `specs/kickoff-<hash>` is now legitimately a `remove` entry -- the exact
  // behaviour change this dispatch's AC-3 requires. `specs` (the directory
  // itself, wholesale) must still never appear.
  withFixture(kickoffFixture("docs-specs-guard"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const paths = plan.remove.map((entry) => entry.path);
    assert.equal(paths.includes("docs"), false);
    assert.equal(paths.includes("docs/"), false);
    assert.equal(paths.includes("specs"), false);
    assert.equal(paths.includes("specs/"), false);
    assert.equal(plan.remove.some((entry) => entry.path === "docs/state.md"), true);
    for (const entry of plan.remove) {
      if (entry.type === "directory") {
        assert.ok(
          entry.path === ".git/agent-pipeline" || entry.kind === "kickoffAnchor",
          "the only directory remove entries are the Pipeline's own wholesale private state and a provisional kickoff anchor",
        );
      }
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

test("R3 AC-3: the design-package neverTouched entry states plainly that a provisional kickoff anchor is not a design package", () => {
  withFixture(kickoffFixture("anchor-vs-design-package"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const designPackage = plan.neverTouched.find((entry) => entry.category === "design-package");
    assert.match(designPackage.description, /provisional kickoff anchor/);
    assert.match(designPackage.description, /not a design package/);
    // Behaviour matches the claim: the fixture's own (unpromoted) kickoff
    // anchor is classified elsewhere -- a remove entry, never something the
    // "design-package" category describes as untouched.
    const anchorEntry = plan.remove.find((entry) => entry.kind === "kickoffAnchor");
    assert.ok(anchorEntry, "expected the fixture's own kickoff anchor to be a remove entry, not folded into design-package");
  });
});

test("R3 AC-1: a provisional kickoff anchor is a shape-derived directory remove entry, never a startsWith string test", () => {
  withFixture(kickoffFixture("anchor-shape"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const anchorEntries = plan.remove.filter((entry) => entry.kind === "kickoffAnchor");
    assert.equal(anchorEntries.length, 1);
    assert.equal(anchorEntries[0].type, "directory");
    assert.match(anchorEntries[0].path, /^specs\/kickoff-[a-f0-9]{16}$/u);
    assert.equal(anchorEntries[0].existed, true);
  });
  // A directory whose name merely starts with "kickoff-" but does not match
  // the exact 16-lowercase-hex shape must never be classified as an anchor --
  // proves the check is shape-derived, not startsWith("specs/kickoff-").
  withFixture(freshProject("anchor-lookalike", { tier: "neutral" }), (root) => {
    mkdirSync(join(root, "specs", "kickoff-notes-from-the-workshop"), { recursive: true });
    writeFileSync(join(root, "specs", "kickoff-notes-from-the-workshop", "notes.md"), "# notes\n");
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.remove.some((entry) => entry.kind === "kickoffAnchor"), false);
    assert.equal(plan.remove.some((entry) => entry.path.startsWith("specs/kickoff-")), false);
    assert.equal(plan.keep.some((entry) => entry.path.startsWith("specs/kickoff-")), false);
  });
});

test("R3 AC-2: an adopter's design package, and a plausible non-anchor specs/kickoff-* directory, are never touched", () => {
  // NEUTRAL tier (RESETKEYS-1). This fixture used to be routed to legacy for
  // one reason only: the neutral tier produces `keys`-type remove entries and
  // `apply` refused for their mere presence. It no longer does, so the tier a
  // real adopter actually resolves to is where this is exercised.
  withFixture(kickoffFixture("adopter-design-package", { tier: "neutral" }), (root) => {
    const realTopicDir = join(root, "specs", "2026-08-08_real-topic");
    mkdirSync(realTopicDir, { recursive: true });
    writeFileSync(join(realTopicDir, "prd.md"), "# Real topic PRD\n");
    writeFileSync(join(realTopicDir, "spec.md"), "# Real topic spec\n");
    const ideasDir = join(root, "specs", "kickoff-ideas");
    mkdirSync(ideasDir, { recursive: true });
    writeFileSync(join(ideasDir, "notes.md"), "# workshop ideas, not a Pipeline anchor\n");
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    const anchorEntry = plan.remove.find((entry) => entry.kind === "kickoffAnchor");
    assert.ok(anchorEntry, "expected the fixture's own real anchor to still be classified for removal");
    for (const prefix of ["specs/2026-08-08_real-topic", "specs/kickoff-ideas"]) {
      assert.equal(
        plan.remove.some((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}/`)),
        false,
        `${prefix} must never be a remove entry`,
      );
      assert.equal(
        plan.keep.some((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}/`)),
        false,
        `${prefix} must never be enumerated in keep either -- it is categorically covered by the design-package neverTouched entry, never listed by path`,
      );
    }
    const before = inventory(root);
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(result.status, "applied");
    const after = inventory(root);
    for (const prefix of ["specs/2026-08-08_real-topic", "specs/kickoff-ideas"]) {
      assert.deepEqual(linesFor(after, prefix), linesFor(before, prefix), `expected ${prefix} untouched`);
    }
    // The fixture's own (unpromoted) anchor IS gone -- proving the two paths
    // above survived on their own merits, not because apply skipped all of
    // specs/.
    assert.equal(existsSync(join(root, anchorEntry.path)), false);
  });
});

test("R3 AC-4: a promoted kickoff anchor -- one already carrying the supersession marker -- is kept, not removed", () => {
  withFixture(promotedKickoffFixture("promoted-anchor"), (root) => {
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    const promotedEntry = plan.keep.find((entry) => entry.kind === "kickoffAnchorPromoted");
    assert.ok(promotedEntry, "expected the promoted anchor to be a keep entry");
    assert.match(promotedEntry.path, /^specs\/kickoff-[a-f0-9]{16}$/u);
    assert.equal(promotedEntry.type, "directory");
    assert.equal(promotedEntry.existed, true);
    assert.equal(typeof promotedEntry.reason, "string");
    assert.equal(plan.remove.some((entry) => entry.kind === "kickoffAnchor"), false);
    assert.equal(plan.remove.some((entry) => entry.path === promotedEntry.path), false);
    const before = inventory(root);
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(result.status, "applied");
    const after = inventory(root);
    assert.deepEqual(
      linesFor(after, promotedEntry.path),
      linesFor(before, promotedEntry.path),
      "the promoted anchor must survive apply byte for byte",
    );
  });
});

test("R3 AC-5: several attempted kickoffs leave several anchors -- all are planned and removed", () => {
  // Neutral tier, for the same reason as the AC-2 test above.
  withFixture(freshProject("several-anchors", { tier: "neutral" }), (root) => {
    const names = ["first attempt", "second attempt", "third attempt"].map(
      (label) => `kickoff-${createHash("sha256").update(label).digest("hex").slice(0, 16)}`,
    );
    for (const name of names) {
      const dir = join(root, "specs", name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `prd_${name}.md`), `# ${name} PRD\n`);
      writeFileSync(join(dir, "spec.md"), `# ${name} spec\n`);
    }
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    const anchorEntries = plan.remove.filter((entry) => entry.kind === "kickoffAnchor");
    assert.equal(anchorEntries.length, 3);
    assert.deepEqual(anchorEntries.map((entry) => entry.path).sort(), names.map((name) => `specs/${name}`).sort());
    for (const entry of anchorEntries) {
      assert.equal(entry.type, "directory");
      assert.equal(entry.existed, true);
    }
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(result.status, "applied");
    for (const name of names) assert.equal(existsSync(join(root, "specs", name)), false);
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

// ---------------------------------------------------------------------------
// R2D: apply -- atomic, or it does not begin.
//
// TIER ROUTING, CORRECTED (RESETKEYS-1). The "apply succeeds" fixtures below
// used to be routed to the LEGACY tier wholesale. The reason was never about
// legacy: only the NEUTRAL tier produces `keys`-type remove entries (the
// `.claude/pipeline.yaml`/`.claude/pipeline.json` runtime-projection
// collision, see the AC-4/collision tests above) and `apply` refused for the
// mere presence of one -- so the happy path could only be demonstrated on the
// tier a real adopter does NOT resolve to. That refusal now fires only where
// key surgery is real, so the success path runs on the default tier too:
// where the tier is a variable these tests iterate both, and where a fixture
// still names one tier it says why at the fixture.
// ---------------------------------------------------------------------------

test("R2D AC-1: a --plan-sha256 that does not match a freshly derived plan refuses and writes nothing", () => {
  withFixture(kickoffFixture("apply-digest-mismatch", { tier: "legacy" }), (root) => {
    const before = inventory(root);
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: "f".repeat(64) });
    assert.equal(result.status, "refused");
    assert.equal(result.code, "PROJECT-RESET-APPLY-DIGEST-MISMATCH");
    assert.equal(inventory(root), before, "a digest mismatch must change no byte anywhere under the root");
  });
});

test("R2D AC-3: keep and neverTouched entries are byte-identical after a successful apply", () => {
  // Creating BOTH the .claude/ manifest and calibration compat copies claims
  // both runtime-projection collision paths for the authority loop's `keep`
  // set, so neither survives to the runtime loop as a `keys` entry (see the
  // "AC-4: the collision paths are claimed..." test above) -- an apply that
  // hit a keys refusal would never reach the move phase this test exercises.
  //
  // R3: `kickoffFixture` also seeds a genuine, UNPROMOTED anchor under
  // specs/, which IS now removed by design -- so "specs" as a whole is no
  // longer an untouched prefix; an adopter's own subdirectory under specs/
  // (not seeded by the Pipeline) is what must survive, and it is asserted
  // here alongside the anchor's actual removal.
  withFixture(kickoffFixture("apply-keep-untouched", { tier: "neutral" }), (root) => {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.project.v1\n");
    writeFileSync(join(root, ".claude", "pipeline.json"), "{}\n");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "adopter.txt"), "adopter content\n");
    const adopterSpecsDir = join(root, "specs", "2026-08-08_real-topic");
    mkdirSync(adopterSpecsDir, { recursive: true });
    writeFileSync(join(adopterSpecsDir, "prd.md"), "# Real topic PRD\n");
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.remove.some((entry) => entry.type === "keys"), false, "both collision paths must be claimed as keep, not keys");
    const anchorEntry = plan.remove.find((entry) => entry.kind === "kickoffAnchor");
    assert.ok(anchorEntry, "expected the fixture's own unpromoted anchor to be a remove entry");
    const before = inventory(root);
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(result.status, "applied");
    const after = inventory(root);
    for (const prefix of ["specs/2026-08-08_real-topic", "src", ".claude/pipeline.yaml", ".claude/pipeline.json"]) {
      assert.deepEqual(linesFor(after, prefix), linesFor(before, prefix), `expected ${prefix} untouched`);
    }
    assert.equal(existsSync(join(root, anchorEntry.path)), false, "the unpromoted anchor must be gone after apply");
  });
});

test("R2D AC-4: a keys entry naming a file that is not there is no work, and the reset completes", () => {
  // The tier the Pipeline resolves to by DEFAULT, with no `.claude/` files at
  // all -- which is every neutral-tier plan, because the two keys targets are
  // `.claude/pipeline.json` and `.claude/pipeline.yaml`. There are no owned
  // keys to strip out of a document nobody wrote, so there is nothing here
  // for the unimplemented key surgery to do, and refusing would have been a
  // refusal earned by the tier rather than by the work.
  withFixture(kickoffFixture("apply-keys-absent", { tier: "neutral" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.authorityTier, "neutral");
    const keysEntries = plan.remove.filter((entry) => entry.type === "keys");
    assert.deepEqual(
      keysEntries.map((entry) => entry.path),
      [".claude/pipeline.json", ".claude/pipeline.yaml"],
      "the neutral tier must still produce both keys entries -- this is not a plan-side change",
    );
    for (const entry of keysEntries) {
      assert.equal(entry.existed, false, `${entry.path} must be planned as absent`);
      assert.equal(existsSync(join(root, entry.path)), false, `${entry.path} must really be absent`);
    }
    assert.equal(planRequiresKeySurgery(plan), false, "absent keys entries are not key surgery");
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(result.status, "applied");
    assert.equal(result.code, null);
    assert.equal(result.authorityTier, "neutral");
    // The reset really ran rather than reporting success over an empty set.
    const removedEntries = result.remove.filter((entry) => entry.existed);
    assert.ok(
      removedEntries.some((entry) => entry.path.startsWith("project/")),
      "expected the neutral authority artifacts to be among the removed entries",
    );
    for (const entry of removedEntries) assert.equal(existsSync(join(root, entry.path)), false);
    // And nothing invented a file for the entries it could not act on.
    for (const entry of keysEntries) {
      assert.equal(existsSync(join(root, entry.path)), false, `${entry.path} must still be absent after apply`);
    }
    const schemaResult = validateAgainstSchema(result, SCHEMA);
    assert.deepEqual(schemaResult.errors, []);
    assert.equal(schemaResult.valid, true);
  });
});

test("R2D AC-4: key surgery the reset would REALLY have to perform is still a typed refusal", () => {
  // WHY THIS IS A PREDICATE TEST AND NOT A PROJECT FIXTURE, stated rather
  // than quietly worked around. `applyProjectReset` derives its own plan and
  // requires it to digest-match the caller's, so a keys entry with
  // `existed: true` can only reach the gate if `planProjectReset` can emit
  // one from a real project -- and under today's runtime-projection manifest
  // it cannot, which the test below this one proves against real roots
  // rather than asserting here. Hand-building a project shape the planner
  // never emits would be a fixture invented to make a check pass, not
  // coverage. The gate in `applyProjectReset` is a one-line call to this
  // exported predicate, so this is the level at which the refusal is
  // testable honestly, and it is tested against the literal entry shapes the
  // manifest's two keys projections produce.
  const keysEntry = (existed) => ({
    path: ".claude/pipeline.json",
    kind: "runtimeOwnedKeys",
    type: "keys",
    existed,
    ownedKeys: ["humanRoles.po.displayLabel"],
  });
  assert.equal(planRequiresKeySurgery({ remove: [keysEntry(true)] }), true);
  assert.equal(planRequiresKeySurgery({ remove: [keysEntry(false)] }), false);
  // One present keys target among absent ones is still key surgery.
  assert.equal(
    planRequiresKeySurgery({
      remove: [keysEntry(false), { ...keysEntry(true), path: ".claude/pipeline.yaml" }],
    }),
    true,
  );
  // A present file the plan removes WHOLESALE is not key surgery: the
  // distinction is the entry's type, never its existence on its own.
  assert.equal(
    planRequiresKeySurgery({
      remove: [{ path: "project/pipeline.yaml", kind: "manifest", type: "file", existed: true }],
    }),
    false,
  );
  assert.equal(planRequiresKeySurgery({ remove: [] }), false);
  assert.equal(planRequiresKeySurgery({}), false);
});

test("R2D AC-4: a keys target that physically exists is claimed by the authority loop, never left as a keys entry", () => {
  // The reach of the refusal above, as behaviour rather than as a claim. The
  // manifest's two keys-projection targets ARE the legacy manifest and
  // calibration artifacts, and the authority loop claims each of them
  // whenever it physically exists -- as a whole-file `remove` where legacy is
  // the resolved tier (pinned by the collision test further up), as a `keep`
  // compatibility copy where it is not (here) -- and the runtime-projection
  // loop skips an already-claimed path. That is why no real project produces
  // a keys entry with `existed: true` today. A future manifest gaining a keys
  // target outside the authority paths would show up as a change here rather
  // than silently.
  withFixture(freshProject("keys-target-present", { tier: "neutral" }), (root) => {
    const absent = planProjectReset({ rootDir: root });
    assert.equal(absent.remove.filter((entry) => entry.type === "keys").length, 2);
    assert.equal(planRequiresKeySurgery(absent), false);
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.project.v1\n");
    writeFileSync(join(root, ".claude", "pipeline.json"), "{}\n");
    const present = planProjectReset({ rootDir: root });
    assert.equal(present.status, "ready");
    assert.equal(present.authorityTier, "neutral");
    assert.equal(
      present.remove.some((entry) => entry.type === "keys"),
      false,
      "a physically present keys target must be claimed as a whole-file entry, never left as a keys entry",
    );
    for (const [path, kind] of [[".claude/pipeline.yaml", "manifest"], [".claude/pipeline.json", "calibration"]]) {
      const keepEntry = present.keep.find((entry) => entry.path === path);
      assert.ok(keepEntry, `${path} must be claimed by the authority loop`);
      assert.equal(keepEntry.kind, kind);
      assert.equal(keepEntry.type, "file");
      assert.equal(keepEntry.existed, true);
    }
    assert.equal(planRequiresKeySurgery(present), false);
  });
});

test("R2D AC-5: re-running the identical command against an already-reset project is zero-write and honest", () => {
  // Both tiers: the neutral one is what a real adopter resolves to, and its
  // plan carries the two absent keys entries -- so replay is proven honest
  // for a plan that contains entries `apply` never acts on, not only for one
  // whose every entry is a file move.
  for (const tier of ["legacy", "neutral"]) {
    withFixture(kickoffFixture(`apply-replay-${tier}`, { tier }), (root) => {
      const plan = planProjectReset({ rootDir: root });
      const first = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
      assert.equal(first.status, "applied", `expected apply to complete on the ${tier} tier`);
      const before = inventory(root);
      const second = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
      assert.equal(second.status, "replayed");
      assert.equal(second.code, null);
      assert.equal(inventory(root), before, "replay must write nothing");
    });
  }
});

test("R2D AC-6: a target that is itself a symlink is refused rather than followed", () => {
  withFixture(kickoffFixture("apply-symlink-target", { tier: "legacy" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const handoverEntry = plan.remove.find((entry) => entry.kind === "handover");
    const absolute = join(root, handoverEntry.path);
    rmSync(absolute);
    symlinkSync(join(root, ".claude", "pipeline.yaml"), absolute);
    const before = inventory(root);
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(result.status, "refused");
    assert.equal(result.code, "PROJECT-RESET-APPLY-SYMLINK-REFUSED");
    assert.equal(inventory(root), before, "a symlink refusal must write nothing");
  });
});

test("R2D AC-6: a target whose parent became a symlink between plan and apply is refused rather than followed", () => {
  withFixture(kickoffFixture("apply-symlink-parent", { tier: "legacy" }), (root) => {
    const plan = planProjectReset({ rootDir: root });
    const handoverEntry = plan.remove.find((entry) => entry.kind === "handover");
    // Preserve the handover file's content behind the new symlink so the
    // fresh plan `apply` re-derives is digest-IDENTICAL to `plan` above --
    // isolating the symlinked-parent refusal from an (also legitimate, but
    // different) digest-mismatch refusal.
    const originalBytes = readFileSync(join(root, handoverEntry.path));
    rmSync(join(root, "docs"), { recursive: true, force: true });
    mkdirSync(join(root, ".decoy"), { recursive: true });
    writeFileSync(join(root, ".decoy", "state.md"), originalBytes);
    symlinkSync(join(root, ".decoy"), join(root, "docs"), "dir");
    const before = inventory(root);
    const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(result.status, "refused");
    assert.equal(result.code, "PROJECT-RESET-APPLY-SYMLINK-REFUSED");
    assert.equal(inventory(root), before, "a symlinked parent refusal must write nothing");
  });
});

test("R2D AC-8: a successful apply's result validates against the schema and separates removed, already-absent, and kept", () => {
  for (const tier of ["legacy", "neutral"]) {
    withFixture(freshProject(`apply-report-${tier}`, { tier }), (root) => {
      const plan = planProjectReset({ rootDir: root });
      const result = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
      assert.equal(result.status, "applied", `expected apply to complete on the ${tier} tier`);
      assert.equal(result.schema, PROJECT_RESET_APPLY_RESULT_SCHEMA);
      const schemaResult = validateAgainstSchema(result, SCHEMA);
      assert.deepEqual(schemaResult.errors, []);
      assert.equal(schemaResult.valid, true);
      const removedEntries = result.remove.filter((entry) => entry.existed);
      const absentEntries = result.remove.filter((entry) => !entry.existed);
      assert.ok(removedEntries.length > 0, "expected at least one actually-removed entry");
      assert.ok(absentEntries.length > 0, "expected at least one already-absent entry (freshProject has no State/handover)");
      for (const entry of removedEntries) assert.equal(existsSync(join(root, entry.path)), false);
      assert.equal(result.keep.some((entry) => entry.path === ".claude/settings.json"), true);
    });
  }
});

test("R2D: the apply CLI operates ONLY on --root, never on the process cwd it was invoked from", () => {
  withFixture(kickoffFixture("apply-cli-root", { tier: "legacy" }), (root) => {
    const decoy = mkdtempSync(join(tmpdir(), "project-reset-cli-decoy-"));
    try {
      const plan = planProjectReset({ rootDir: root });
      const decoyBefore = inventory(decoy);
      const result = spawnSync(process.execPath, [
        new URL("./project-reset.mjs", import.meta.url).pathname,
        "apply", "--root", root, "--plan-sha256", plan.planSha256,
      ], { encoding: "utf8", cwd: decoy, shell: false });
      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.status, "applied");
      assert.equal(parsed.root, root);
      assert.equal(inventory(decoy), decoyBefore, "the CLI must never write into the cwd it was invoked from, only --root");
    } finally {
      rmSync(decoy, { recursive: true, force: true });
    }
  });
});

// AC-2: every apply fault stage either leaves the root byte-identical to
// before the interrupted call, or is completed only by re-running the
// identical command -- named per stage, the way the onboarding-kickoff
// fault suite is (onboarding-continuity.test.mjs). Only "journal-temp-fsync"
// precedes the durable publication of the journal (the commit point); every
// later stage is recovered by resuming the same digest-bound command.
const PRE_PUBLISH_STAGES = new Set(["journal-temp-fsync"]);

for (const stage of RESET_APPLY_FAULT_STAGES) {
  const claim = PRE_PUBLISH_STAGES.has(stage)
    ? "leaves the root unchanged and permits a clean retry"
    : "is completed only by re-running the identical command";
  test(`R2D AC-2: fault at ${stage} ${claim}`, () => {
    withFixture(kickoffFixture(`apply-fault-${stage}`, { tier: "legacy" }), (root) => {
      const plan = planProjectReset({ rootDir: root });
      const before = inventory(root);
      let threw = false;
      try {
        applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256, deps: { crashAt: stage } });
      } catch (error) {
        threw = true;
        assert.equal(error.code, "PROJECT-RESET-APPLY-SIMULATED-FAULT");
      }
      assert.equal(threw, true, `expected a simulated fault at ${stage}`);
      if (PRE_PUBLISH_STAGES.has(stage)) {
        assert.equal(inventory(root), before, "root must be byte-identical to before the interrupted call");
      }
      const resumed = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
      assert.equal(resumed.status, "applied", `expected the identical command to complete the reset after a fault at ${stage}`);
      const replay = applyProjectReset({ rootDir: root, expectedPlanSha256: plan.planSha256 });
      assert.equal(replay.status, "replayed");
    });
  });
}
