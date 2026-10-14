#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.nongit-retirement-reader-calls-inaccessible-controller-helper (AC-218).
// readGovernanceEnrollmentRetirement must read non-Git enrollment scope through the
// public sealed controller observation (never a module-scope `inspect`), return no
// journal for inactive roots without history and for valid active enrollment, and
// still fail closed with typed diagnostics for retained/corrupt/unverifiable history.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { observeGovernanceScope, readGovernanceEnrollmentRetirement } from "../governance-scope.mjs";
import { inspectProjectOnboardingV3, freshManifestBytes } from "../project-onboarding-v3.mjs";
import { loadRunnerProfilesV3Registry } from "../runner-profiles-v3.mjs";
import { codexCustomAgentSeed, planRuntimeProjectionV3 } from "../runtime-projection-v3.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
// Fixtures must be genuinely non-Git roots: repository scratch/ sits inside this
// Git work tree and would resolve to the repository root, so the OS temp dir is used.
const BASE = join(tmpdir(), "nongit-retirement-reader-pin");

function fixture() { mkdirSync(BASE, { recursive: true }); const root = mkdtempSync(join(BASE, "fx-")); return root; }
function cleanup() { rmSync(BASE, { recursive: true, force: true }); }
function put(root, path, bytes) { const dest = join(root, path); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, bytes); }
function files(root, prefix = "") {
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(root, e.name);
    if (e.isDirectory()) out.push(...files(p, prefix + e.name + "/")); else out.push([prefix + e.name, readFileSync(p).toString("hex")]);
  }
  return out;
}
function yaml(value, indent = "") {
  if (Array.isArray(value)) return value.map((i) => (i && typeof i === "object" ? indent + "-\n" + yaml(i, indent + "  ") : indent + "- " + JSON.stringify(i) + "\n")).join("");
  return Object.entries(value).map(([k, i]) => (i && typeof i === "object" ? indent + k + ":\n" + yaml(i, indent + "  ") : indent + k + ": " + JSON.stringify(i) + "\n")).join("");
}
function seedV3(root) {
  const registry = loadRunnerProfilesV3Registry();
  const intent = { schema: "pipeline.user.v3", language: { human_facing: "de", agent_facing: "en" }, agent_runtime: "other", runners: { enabled: ["claude", "codex"], default: "codex" }, routing: { profiles: registry.profiles, duties: registry.duties }, usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" }, autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 }, gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 }, critic_export: registry.criticExportPolicy, session: { keep_awake: true } };
  const values = { ".claude/pipeline.yaml": freshManifestBytes(), ".claude/settings.json": "{}\n", ".claude/pipeline.json": "{}\n", ".codex/config.toml": "", ".codex/agents/implementor.toml": codexCustomAgentSeed("implementor"), ".codex/agents/critic.toml": codexCustomAgentSeed("critic"), ".codex/agents/consult-advisor.toml": "" };
  const baselines = Object.fromEntries(Object.entries(values).map(([p, bytes]) => [p, { status: "present", bytes }]));
  const plan = planRuntimeProjectionV3(intent, { baselines });
  assert.equal(plan.status, "ready", JSON.stringify(plan.diagnostics));
  const manifest = plan.targets.find((r) => r.path === ".claude/pipeline.yaml").after.bytes;
  put(root, "pipeline.user.yaml", yaml(intent)); put(root, ".claude/pipeline.yaml", manifest);
}
const CONSENT = JSON.stringify({ schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-09-28T00:00:00.000Z" });
const retained = (code) => (e) => e.code === code && !(e instanceof ReferenceError);

test("inactive non-Git root without history returns no journal, no ReferenceError, writes nothing", () => {
  const root = fixture();
  try {
    const before = files(root);
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: root }), null);
    assert.deepEqual(files(root), before);
  } finally { cleanup(); }
});

test("valid active non-Git enrollment is recognized and invents no retirement record", () => {
  const root = fixture();
  try {
    put(root, ".agent-pipeline/onboarding-consent.json", CONSENT);
    const before = files(root);
    assert.equal(observeGovernanceScope({ rootDir: root }).state, "active");
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: root }), null);
    assert.deepEqual(files(root), before);
  } finally { cleanup(); }
});

test("valid V3 projection enrollment reads as active with no journal", () => {
  const root = fixture();
  try {
    seedV3(root);
    const before = files(root);
    assert.equal(observeGovernanceScope({ rootDir: root }).state, "active");
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: root }), null);
    assert.deepEqual(files(root), before);
  } finally { cleanup(); }
});

test("corrupt retained history fails closed with the typed code, not a permissive null", () => {
  const root = fixture();
  try {
    put(root, ".agent-pipeline/onboarding-consent.json", "{}");
    assert.equal(observeGovernanceScope({ rootDir: root }).state, "inactive");
    const before = files(root);
    assert.throws(() => readGovernanceEnrollmentRetirement({ rootDir: root }), retained("GS-NONGIT-RETAINED-HISTORY"));
    assert.deepEqual(files(root), before);
  } finally { cleanup(); }
});

test("unverifiable active enrollment fails closed with a typed diagnostic", () => {
  const root = fixture();
  try {
    seedV3(root);
    put(root, ".claude/pipeline.yaml", "broken: true\n");
    const obs = observeGovernanceScope({ rootDir: root });
    assert.equal(obs.state, "unverifiable-active");
    const before = files(root);
    assert.throws(() => readGovernanceEnrollmentRetirement({ rootDir: root }), (e) => !(e instanceof ReferenceError) && typeof e.code === "string" && e.code.startsWith("GS-"));
    assert.deepEqual(files(root), before);
  } finally { cleanup(); }
});

test("the reader's physical root matches the sealed controller observation root", () => {
  const root = fixture();
  try {
    put(root, ".agent-pipeline/onboarding-consent.json", CONSENT);
    const obs = observeGovernanceScope({ rootDir: root });
    assert.equal(realpathSync(obs.root), realpathSync(root));
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: root }), null);
  } finally { cleanup(); }
});

test("public onboarding inspection of non-Git roots does not throw ReferenceError", () => {
  const root = fixture(); const retainedRoot = fixture();
  try {
    put(retainedRoot, ".agent-pipeline/onboarding-consent.json", "{}");
    for (const rootDir of [root, retainedRoot]) {
      try { inspectProjectOnboardingV3({ runner: "codex", rootDir }); }
      catch (error) { assert.ok(!(error instanceof ReferenceError), `ReferenceError for ${rootDir}: ${error.message}`); assert.ok(!/inspect is not defined/.test(String(error.message))); }
    }
  } finally { cleanup(); }
});

test("structural: the reader's non-Git branch calls no module-scope inspect", () => {
  const source = readFileSync(join(HERE, "..", "governance-scope.mjs"), "utf8");
  const start = source.indexOf("export function readGovernanceEnrollmentRetirement");
  const body = source.slice(start, source.indexOf("export const withGovernanceRetirementScopeLock", start));
  assert.ok(start > 0 && body.length > 0);
  assert.doesNotMatch(body, /(^|[^.\w])inspect\(/);
  assert.match(body, /defaultController\.observe\(/);
});
