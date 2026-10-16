// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.protected-baseline-rejects-canonical-discarded-idle-state (ALF-C-P2-15, AC-234).
// The canonical idle/discarded State has no `closedFeatures`; the protected baseline must resolve its
// dynamic class as available-and-empty while every malformed shape stays fail-closed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { classifyOnboardingContinuity } from "../onboarding-continuity.mjs";
import { applyProjectOnboardingV3, planProjectOnboardingV3 } from "../project-onboarding-v3.mjs";
import {
  PB_DYNAMIC_UNAVAILABLE,
  canonicalProjectPath,
  protectedBaselineReadback,
  protectedBaselineRuleFor,
  resolveProtectedBaseline,
} from "../protected-baseline.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const writer = resolve(here, "../../scripts/pipeline-state.mjs");
// Host fact: fixtures live under the repository's scratch/, not the OS temp dir.
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const made = [];
function freshRoot() {
  const root = mkdtempSync(join(scratchBase, "pin-pb-idle-"));
  made.push(root);
  return root;
}
function fixture(config, state) {
  const root = freshRoot();
  mkdirSync(join(root, "project"), { recursive: true });
  if (config !== undefined) writeFileSync(join(root, "project/guard-config.json"), JSON.stringify(config));
  if (state !== undefined) writeFileSync(join(root, "project/pipeline-state.json"), typeof state === "string" ? state : JSON.stringify(state));
  return root;
}
after(() => { for (const root of made) rmSync(root, { recursive: true, force: true }); });

const hasDynamicDiag = (baseline) => baseline.diagnostics.some((item) => item.code === PB_DYNAMIC_UNAVAILABLE);

/** Real route: public onboarding, a design-phase feature, then the sanctioned discard writer. */
function canonicalDiscardedIdleRoot() {
  const root = freshRoot();
  // The sanctioned writer needs a git worktree authority: seed a committed, inert pre-onboarding repo.
  writeFileSync(join(root, "README.md"), "inert pre-onboarding seed\n");
  for (const args of [["init", "-q"], ["config", "user.email", "pin@example.invalid"], ["config", "user.name", "pin fixture"], ["config", "commit.gpgsign", "false"], ["add", "README.md"], ["commit", "-q", "--no-verify", "-m", "seed"]]) {
    const git = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(git.status, 0, `git ${args[0]}: ${git.stderr}`);
  }
  const plan = planProjectOnboardingV3({ rootDir: root, runner: "claude" });
  assert.equal(applyProjectOnboardingV3(plan, { rootDir: root, activate: true }).status, "applied");
  writeFileSync(join(root, "project/pipeline-state.json"), JSON.stringify({ schema: "pipeline.state.v0", activeFeature: { id: "idle-fixture", planPath: "specs/idle/prd.md", phase: "design" }, planApproved: false }));
  const discarded = spawnSync(process.execPath, [writer, "discard-feature", "--by", "pin-fixture", "--reason", "canonical idle protected baseline pin"], { cwd: root, encoding: "utf8" });
  assert.equal(discarded.status, 0, discarded.stderr);
  return root;
}

test("AC1 canonical discarded idle State (no closedFeatures) resolves dynamic protection as available and empty", () => {
  const root = canonicalDiscardedIdleRoot();
  const state = JSON.parse(readFileSync(join(root, "project/pipeline-state.json"), "utf8"));
  assert.equal(state.closedFeatures, undefined, "fixture must be the canonical shape, with no invented close history");
  assert.ok(Array.isArray(state.discardedFeatures) && state.discardedFeatures.length >= 1);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "valid");
  const baseline = resolveProtectedBaseline({ rootDir: root });
  assert.equal(baseline.status, "ready");
  assert.equal(baseline.dynamic.status, "available");
  assert.deepEqual(baseline.dynamic.entries, []);
  assert.equal(hasDynamicDiag(baseline), false);
  assert.equal(protectedBaselineReadback({ rootDir: root }).dynamic, "available");
});

test("AC1 the immutable shipped baseline and project additions are retained next to the empty dynamic class", () => {
  const root = canonicalDiscardedIdleRoot();
  const plain = resolveProtectedBaseline({ rootDir: root });
  writeFileSync(join(root, "project/guard-config.json"), JSON.stringify({ protectedSurfaceAdditions: [{ id: "PIN-EXTRA", pathPattern: "custom/pin-check\\.mjs$", class: "contract-test", rationale: "pin project policy" }] }));
  const withAddition = resolveProtectedBaseline({ rootDir: root });
  assert.equal(withAddition.dynamic.status, "available");
  assert.equal(hasDynamicDiag(withAddition), false);
  assert.equal(withAddition.identity.baselineDigest, plain.identity.baselineDigest, "baseline identity is immutable under additions");
  assert.ok(protectedBaselineRuleFor(withAddition.entries, "plugins/pipeline-core/lib/protected-baseline.mjs"), "shipped baseline entry retained");
  assert.equal(protectedBaselineRuleFor(withAddition.entries, "custom/pin-check.mjs")?.id, "PIN-EXTRA");
  assert.equal(withAddition.entries.some((entry) => entry.dynamic), false, "no close bindings invented");
});

test("AC1 minimal canonical idle State shapes (state.v0 without closedFeatures) are accepted", () => {
  for (const state of [{ schema: "pipeline.state.v0" }, { schema: "pipeline.state.v0", discardedFeatures: [] }, { schema: "pipeline.state.v0", discardedFeatures: [{ id: "x" }] }]) {
    const baseline = resolveProtectedBaseline({ rootDir: fixture({}, state) });
    assert.equal(baseline.dynamic.status, "available", JSON.stringify(state));
    assert.equal(hasDynamicDiag(baseline), false);
  }
});

test("AC2 present malformed close history stays fail closed", () => {
  const base = { schema: "pipeline.state.v0", discardedFeatures: [] };
  for (const closedFeatures of [null, {}, "invalid", 0, false]) {
    const baseline = resolveProtectedBaseline({ rootDir: fixture({}, { ...base, closedFeatures }) });
    assert.equal(baseline.dynamic.status, "unavailable", JSON.stringify(closedFeatures));
    assert.ok(hasDynamicDiag(baseline));
    assert.ok(baseline.entries.length >= 6, "static baseline remains active");
  }
});

test("AC2 malformed or unreadable State stays fail closed", () => {
  for (const state of [null, [], "invalid", {}, "{"]) {
    const root = fixture({}, state);
    if (state === "invalid") writeFileSync(join(root, "project/pipeline-state.json"), "\"invalid\"");
    const baseline = resolveProtectedBaseline({ rootDir: root });
    assert.equal(baseline.dynamic.status, "unavailable", JSON.stringify(state));
    assert.ok(hasDynamicDiag(baseline));
  }
  // Absent closedFeatures is only canonical for the lifecycle state schema.
  assert.equal(resolveProtectedBaseline({ rootDir: fixture({}, { schema: "other", discardedFeatures: [] }) }).dynamic.status, "unavailable");
  // Unreadable path via the module's documented read seam.
  const root = fixture({}, { schema: "pipeline.state.v0" });
  const unreadable = resolveProtectedBaseline({
    rootDir: root,
    readFileSyncFn: (path, ...rest) => {
      if (String(path).replaceAll("\\", "/").endsWith("project/pipeline-state.json")) throw Object.assign(new Error("EACCES: simulated unreadable state"), { code: "EACCES" });
      return readFileSync(path, ...rest);
    },
  });
  assert.equal(unreadable.dynamic.status, "unavailable");
  assert.ok(hasDynamicDiag(unreadable));
});

test("AC2 physical escapes in close bindings and aliases remain fail closed", () => {
  const escaped = resolveProtectedBaseline({ rootDir: fixture({}, { schema: "pipeline.state.v0", closedFeatures: [{ id: "c", continuityClose: { result: { path: "../outside.md", sha256: "a" } } }] }) });
  assert.equal(escaped.dynamic.status, "unavailable");
  assert.ok(hasDynamicDiag(escaped));
  const root = fixture({});
  assert.throws(() => canonicalProjectPath(root, "../outside"), /escapes/);
  mkdirSync(join(root, "real"));
  let aliased = true;
  try { symlinkSync(join(root, "real"), join(root, "alias"), "junction"); } catch (error) { aliased = false; }
  if (aliased) assert.throws(() => canonicalProjectPath(root, "alias"), /symbolic link/);
  else console.log("HOST-LIMITATION: directory symlinks unavailable on this host; alias refusal not exercised");
});

test("AC3 valid existing close bindings remain dynamically protected", () => {
  const root = fixture({}, { schema: "pipeline.state.v0", closedFeatures: [{ id: "closed-a", continuityClose: { result: { path: "evidence/closed-result.md", sha256: "a" }, closeEvidence: { path: "evidence/close.md", sha256: "b" } } }] });
  const baseline = resolveProtectedBaseline({ rootDir: root });
  assert.equal(baseline.dynamic.status, "available");
  assert.equal(hasDynamicDiag(baseline), false);
  assert.equal(baseline.dynamic.entries.length, 2);
  // Rule lookup is first-match over shipped entries (an evidence/ shipped rule can pre-empt), so assert on the dynamic class itself.
  for (const path of ["evidence/closed-result.md", "evidence/close.md"]) {
    assert.ok(protectedBaselineRuleFor(baseline.dynamic.entries, path)?.dynamic, path);
    assert.ok(protectedBaselineRuleFor(baseline.entries, path), `${path} protected in the merged set`);
  }
  // Mixed history: closed bindings coexisting with discarded features still protect.
  const mixed = resolveProtectedBaseline({ rootDir: fixture({}, { schema: "pipeline.state.v0", discardedFeatures: [{ id: "d" }], closedFeatures: [{ id: "closed-b", continuityClose: { result: { path: "evidence/b.md", sha256: "c" } } }] }) });
  assert.equal(mixed.dynamic.status, "available");
  assert.ok(protectedBaselineRuleFor(mixed.dynamic.entries, "evidence/b.md")?.dynamic);
});
