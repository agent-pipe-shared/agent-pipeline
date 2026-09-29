// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {classifyOnboardingContinuity} from "./onboarding-continuity.mjs";
import {planProjectOnboardingV3,applyProjectOnboardingV3} from "./project-onboarding-v3.mjs";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  PB_CONFIG_INVALID,
  PB_DYNAMIC_UNAVAILABLE,
  PB_SUBTRACTION_ATTEMPT,
  canonicalProjectPath,
  protectedBaselineRuleFor,
  resolveProtectedBaseline,
} from "./protected-baseline.mjs";
import { loadProtectedTestPathRules } from "./protected-test-paths.mjs";

function fixture(config, state = undefined) {
  const root = mkdtempSync(join(tmpdir(), "protected-baseline-"));
  if (config !== undefined) {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project/guard-config.json"), typeof config === "string" ? config : JSON.stringify(config));
  }
  if (state !== undefined) {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project/pipeline-state.json"), JSON.stringify(state));
  }
  return root;
}

test("A3 treats an absent lifecycle state as an empty dynamic protected class", () => {
  const baseline = resolveProtectedBaseline({ rootDir: fixture() });
  assert.equal(baseline.status, "ready");
  assert.ok(baseline.entries.length >= 6);
  assert.ok(protectedBaselineRuleFor(baseline.entries, "plugins/pipeline-core/lib/protected-baseline.mjs"));
  assert.equal(protectedBaselineRuleFor(baseline.entries, "plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs")?.id, "PB-ALFRED-E3-HOST");
  assert.equal(protectedBaselineRuleFor(baseline.entries, "schemas/pipeline.cross-runner-dispatch-receipt.v1.json")?.id, "PB-ALFRED-E3-RECEIPT");
  assert.ok(baseline.identity.baselineDigest);
  assert.equal(baseline.dynamic.status, "absent");
  assert.equal(baseline.diagnostics.some((item) => item.code === PB_DYNAMIC_UNAVAILABLE), false);
  const idleRoot = fixture();const portable=planProjectOnboardingV3({rootDir:idleRoot,runner:"claude"});assert.equal(applyProjectOnboardingV3(portable,{rootDir:idleRoot,activate:true}).status,"applied");
  writeFileSync(join(idleRoot,"project/pipeline-state.json"),JSON.stringify({schema:"pipeline.state.v0",activeFeature:{id:"idle-fixture",planPath:"specs/idle/prd.md",phase:"design"},planApproved:false}));
  const writer=resolve(dirname(fileURLToPath(import.meta.url)),"../scripts/pipeline-state.mjs");
  const discarded=spawnSync(process.execPath,[writer,"discard-feature","--by","disposable-fixture","--reason","canonical idle protected baseline regression"],{cwd:idleRoot,encoding:"utf8"});assert.equal(discarded.status,0,discarded.stderr);
  const state=JSON.parse(readFileSync(join(idleRoot,"project/pipeline-state.json")));assert.equal(state.closedFeatures,undefined);assert.equal(classifyOnboardingContinuity({rootDir:idleRoot}).status,"valid");
  const idleBaseline=resolveProtectedBaseline({rootDir:idleRoot});assert.equal(idleBaseline.dynamic.status,"available");assert.deepEqual(idleBaseline.dynamic.entries,[]);assert.equal(idleBaseline.diagnostics.some(item=>item.code===PB_DYNAMIC_UNAVAILABLE),false);
  for(const closedFeatures of [null,{},"invalid",0]){const malformed=resolveProtectedBaseline({rootDir:fixture({}, {...state,closedFeatures})});assert.equal(malformed.dynamic.status,"unavailable");assert.ok(malformed.diagnostics.some(item=>item.code===PB_DYNAMIC_UNAVAILABLE));}
  for(const malformedState of [null,[],"invalid",{}])assert.equal(resolveProtectedBaseline({rootDir:fixture({},malformedState)}).dynamic.status,"unavailable");
});

test("A3 accepts valid project additions without changing the immutable baseline identity", () => {
  const root = fixture({ protectedSurfaceAdditions: [{ id: "PROJECT-EXTRA", pathPattern: "custom/check\\.mjs$", class: "contract-test", rationale: "project policy" }] });
  const baseline = resolveProtectedBaseline({ rootDir: root });
  assert.ok(protectedBaselineRuleFor(baseline.entries, "custom/check.mjs"));
  assert.equal(baseline.diagnostics.some((item) => item.code === PB_CONFIG_INVALID), false);
  assert.equal(baseline.identity.baselineRevision, "1");
});

test("A3 preserves legacy protectedTestPaths as additive entries and rule ids", () => {
  const root = fixture({ protectedTestPaths: [{ id: "TP-LEGACY", pattern: "legacy/check\\.mjs$", reason: "legacy policy" }] });
  const baseline = resolveProtectedBaseline({ rootDir: root });
  assert.equal(protectedBaselineRuleFor(baseline.entries, "legacy/check.mjs")?.id, "TP-LEGACY");
  assert.equal(loadProtectedTestPathRules({ rootDir: root }).rules.find((entry) => entry.re.test("legacy/check.mjs"))?.id, "TP-LEGACY");
});

test("A3 treats malformed config and duplicate/shadow attempts as baseline-only", () => {
  const malformed = resolveProtectedBaseline({ rootDir: fixture("{") });
  assert.ok(malformed.entries.length >= 6);
  assert.ok(malformed.diagnostics.some((item) => item.code === PB_CONFIG_INVALID));
  const shadow = resolveProtectedBaseline({ rootDir: fixture({ protectedSurfaceAdditions: [{ id: "PB-CONFIG", pathPattern: "unrelated\\.mjs$", class: "hook", rationale: "attempt" }] }) });
  assert.ok(shadow.diagnostics.some((item) => item.code === PB_SUBTRACTION_ATTEMPT));
  assert.equal(protectedBaselineRuleFor(shadow.entries, "unrelated.mjs"), null);
});

test("A3 rejects physical path escapes and symlink aliases", () => {
  const root = fixture();
  assert.throws(() => canonicalProjectPath(root, "../outside"), /escapes/);
  mkdirSync(join(root, "real"));
  symlinkSync(join(root, "real"), join(root, "alias"));
  assert.throws(() => canonicalProjectPath(root, "alias"), /symbolic link/);
});

test("A3 reads continuity-close bindings as a dynamic protected class", () => {
  const root = fixture({}, { closedFeatures: [{ id: "closed-a", continuityClose: { result: { path: "evidence/closed-result.md", sha256: "a" }, closeEvidence: { path: "evidence/close.md", sha256: "b" } } }] });
  const baseline = resolveProtectedBaseline({ rootDir: root });
  assert.equal(baseline.dynamic.status, "available");
  assert.ok(protectedBaselineRuleFor(baseline.entries, "evidence/closed-result.md")?.dynamic);
  assert.ok(protectedBaselineRuleFor(baseline.entries, "evidence/close.md")?.dynamic);
});

test("A3 keeps an unreadable lifecycle state fail-closed", () => {
  const root = fixture({}, "not-an-object");
  writeFileSync(join(root, "project/pipeline-state.json"), "{");
  const baseline = resolveProtectedBaseline({ rootDir: root });
  assert.equal(baseline.dynamic.status, "unavailable");
  assert.ok(baseline.diagnostics.some((item) => item.code === PB_DYNAMIC_UNAVAILABLE));
});

test("A3 plugin-only install retains the shipped baseline without a parent schemas tree", async () => {
  const installRoot = mkdtempSync(join(tmpdir(), "protected-baseline-install-"));
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const installedPlugin = join(installRoot, "plugins", "pipeline-core");
  cpSync(pluginRoot, installedPlugin, { recursive: true });
  const installed = await import(`${pathToFileURL(join(installedPlugin, "lib/protected-baseline.mjs"))}?install-regression`);
  const baseline = installed.resolveProtectedBaseline({ rootDir: installRoot });
  assert.equal(baseline.status, "ready");
  assert.ok(baseline.entries.length >= 6);
  assert.ok(installed.protectedBaselineRuleFor(baseline.entries, "plugins/pipeline-core/lib/protected-baseline.mjs"));
});

test("A3 refuses all writes when the shipped baseline cannot be loaded", () => {
  const root = fixture();
  const rules = loadProtectedTestPathRules({ rootDir: root, readFileSyncFn: () => { throw new Error("schema unavailable"); } });
  assert.equal(rules.rules[0]?.id, "PB-BASELINE-UNAVAILABLE");
  assert.ok(rules.rules[0]?.re.test("an/arbitrary/project-file.mjs"));
});
