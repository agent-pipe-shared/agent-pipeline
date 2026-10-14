// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin for backlog item pipeline.onboarding-home-override-does-not-bind-machine-plane (ALF-C-P2-12, AC-219).
 *
 * Acceptance points, exercised through the real module / real CLI (no mock of the behaviour under test):
 *  A1  library call with injected home B reads B's machine plane + public anchor although the OS home is A.
 *  A2  B without a plane / without an anchor never falls back to A's ambient data.
 *  A3  an explicit readMachinePlane override is retained unchanged; no override keeps the documented default.
 *  A4  source immutability: neither home's files change.
 *  A5  the supported CLI override (PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE) agrees with the selected home (B) while
 *      the child process OS home is A.
 * The OS home is substituted by HOME/USERPROFILE (restored in finally); no signing key is read or created.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { freshCriticalHumanProofPolicyBytes, planProjectOnboardingV3 } from "../project-onboarding-v3.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CLI = join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "project-onboarding-v3.mjs");
const SCRATCH = join(REPO_ROOT, "scratch");
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function plane(keyDir) {
  return JSON.stringify({ schema: "pipeline.machine-plane.v1", poKeyDirectory: keyDir, pushApprovalDefault: "signature",
    routing: null, language: null, session: null, usage: null, updatedAt: "2026-10-14T00:00:00.000Z" });
}
function makeHome(base, name, digest) {
  const home = join(base, name);
  mkdirSync(join(home, ".agent-pipeline"), { recursive: true });
  if (digest === null) return home;
  const keyDir = join(home, "po-authority");
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(join(keyDir, "trust-policy.json"), JSON.stringify({ keyReference: `ref-${name}`, publicKeySha256: digest }));
  writeFileSync(join(home, ".agent-pipeline", "machine.json"), plane(keyDir));
  return home;
}
function makeRoot(base, name) {
  const root = join(base, name);
  mkdirSync(root, { recursive: true });
  assert.equal(spawnSync("git", ["-C", root, "init", "-q"], { shell: false }).status, 0);
  return root;
}
function snapshot(dir) {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else out.push(`${p}:${createHash("sha256").update(readFileSync(p)).digest("hex")}`);
  } };
  walk(dir);
  return out.sort().join("\n");
}
function withOsHome(home, fn) {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home; process.env.USERPROFILE = home;
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
function arrange(fn) {
  mkdirSync(SCRATCH, { recursive: true });
  const base = mkdtempSync(join(SCRATCH, "alf-c-p2-12-"));
  try { return fn(base); } finally { rmSync(base, { recursive: true, force: true }); }
}
const keyDirOf = (home) => join(home, "po-authority");
const policySha = (keyDir) => createHash("sha256").update(freshCriticalHumanProofPolicyBytes({
  existsSync, readFileSync, readMachinePlane: () => ({ status: "valid", plane: { poKeyDirectory: keyDir } }),
})).digest("hex");
const noAnchorSha = () => createHash("sha256").update(freshCriticalHumanProofPolicyBytes(null)).digest("hex");
const policyShaOf = (plan) => plan.targets.find((t) => t.path === "project/critical-human-proof.json").after.sha256;
const planText = (root, deps) => JSON.stringify(planProjectOnboardingV3({ rootDir: root, runner: "claude", deps }));

test("A1/A4 injected home B supplies the public anchor although the OS home is A; sources unchanged", () => arrange((base) => {
  const a = makeHome(base, "homeA", DIGEST_A);
  const b = makeHome(base, "homeB", DIGEST_B);
  const root = makeRoot(base, "repo");
  const before = snapshot(a) + snapshot(b);
  // The plan never prints the anchor; it carries the sha256 of the seeded project/critical-human-proof.json bytes,
  // which embed the machine plane's public anchor. Oracle: the exported byte builder fed B's / A's plane explicitly.
  const planned = withOsHome(a, () => planProjectOnboardingV3({ rootDir: root, runner: "claude", deps: { homedir: () => b } }));
  const got = planned.targets.find((t) => t.path === "project/critical-human-proof.json").after.sha256;
  assert.equal(got, policySha(keyDirOf(b)), "plan carries B's anchor");
  assert.notEqual(got, policySha(keyDirOf(a)), "plan must not carry A's anchor");
  assert.equal(snapshot(a) + snapshot(b), before);
}));

test("A2 selected home without a plane never borrows the ambient OS home's anchor", () => arrange((base) => {
  const a = makeHome(base, "homeA", DIGEST_A);
  const b = makeHome(base, "homeB", null);
  const root = makeRoot(base, "repo");
  const got = policyShaOf(withOsHome(a, () => planProjectOnboardingV3({ rootDir: root, runner: "claude", deps: { homedir: () => b } })));
  assert.equal(got, noAnchorSha(), "B has no plane: no-anchor seed");
  assert.notEqual(got, policySha(keyDirOf(a)), "must not borrow A's anchor");
}));

test("A3 an explicit readMachinePlane override is retained unchanged", () => arrange((base) => {
  const a = makeHome(base, "homeA", DIGEST_A);
  const b = makeHome(base, "homeB", DIGEST_B);
  const root = makeRoot(base, "repo");
  const got = policyShaOf(withOsHome(a, () => planProjectOnboardingV3({ rootDir: root, runner: "claude", deps: { homedir: () => b, readMachinePlane: () => ({ status: "absent", plane: null }) } })));
  assert.equal(got, noAnchorSha(), "absent override wins over both homes");
  assert.notEqual(got, policySha(keyDirOf(b)));
}));

test("A5 the supported CLI override selects B while the child OS home is A", () => arrange((base) => {
  const a = makeHome(base, "homeA", DIGEST_A);
  const b = makeHome(base, "homeB", DIGEST_B);
  const root = makeRoot(base, "repo");
  const before = snapshot(a) + snapshot(b);
  const env = { ...process.env, HOME: a, USERPROFILE: a, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: b };
  // The CLI `plan` only reports portable-seed-required (no targets); its nextAction.argv is the supported
  // apply-portable-seed command, which WRITES project/critical-human-proof.json from the selected home's plane.
  const planRun = spawnSync(process.execPath, [CLI, "plan", "--root", root, "--runner", "claude"], { encoding: "utf8", shell: false, env });
  assert.equal(planRun.status, 0, planRun.stderr);
  const plan = JSON.parse(planRun.stdout);
  assert.equal(plan.status, "portable-seed-required");
  assert.equal(plan.nextAction.argv[1], "apply-portable-seed");
  const applyRun = spawnSync(process.execPath, plan.nextAction.argv, { encoding: "utf8", shell: false, env });
  assert.equal(applyRun.status, 0, applyRun.stderr);
  const written = readFileSync(join(root, "project", "critical-human-proof.json"));
  const writtenSha = createHash("sha256").update(written).digest("hex");
  assert.equal(writtenSha, policySha(keyDirOf(b)), "written seed carries B's anchor");
  assert.notEqual(writtenSha, policySha(keyDirOf(a)), "written seed must not carry A's anchor");
  assert.ok(written.toString("utf8").includes(DIGEST_B) && !written.toString("utf8").includes(DIGEST_A));
  assert.equal(snapshot(a) + snapshot(b), before, "home sources unchanged");
}));
