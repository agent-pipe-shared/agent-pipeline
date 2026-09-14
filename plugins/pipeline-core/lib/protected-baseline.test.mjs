// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("A3 keeps the shipped static minimum when project config is absent", () => {
  const baseline = resolveProtectedBaseline({ rootDir: fixture() });
  assert.equal(baseline.status, "ready");
  assert.ok(baseline.entries.length >= 6);
  assert.ok(protectedBaselineRuleFor(baseline.entries, "plugins/pipeline-core/lib/protected-baseline.mjs"));
  assert.ok(baseline.identity.baselineDigest);
  assert.ok(baseline.diagnostics.some((item) => item.code === PB_DYNAMIC_UNAVAILABLE));
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
