// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.scratch-must-remain-writable-across-lifecycle-states (AC-247, slice ALF-C-P10-02).
// Exercises the real lifecycle guard, the shared physical-scratch predicate, the test-path rule
// matcher and the gate-strength rule matcher. Fixtures live under the repository's scratch/.
import assert from "node:assert/strict";
import test from "node:test";
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { GATE_STRENGTH_PATHS, gateStrengthRuleFor } from "../../hooks/guard-gate-strength.mjs";
import { isBoundedScratchOnlyWords, isPhysicalScratchTarget } from "../physical-scratch-boundary.mjs";
import { loadProtectedTestPathRules, protectedTestPathRuleFor } from "../protected-test-paths.mjs";
import { PO_PLAN_ACKNOWLEDGEMENT_MARKER } from "../onboarding-staging-authoring.mjs";
import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
} from "../project-onboarding-ready-gate.mjs";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const SCRATCH = join(REPO, "scratch");
const HOST_LIMITATION = "host-limitation: directory symlinks/mode bits unavailable on native Windows; "
  + "owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";

function fixture(t) {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "scratch-lifecycle-pin-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "scratch"), { recursive: true });
  mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(root, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  writeFileSync(join(root, "pipeline.user.yaml"), "marker\n");
  return root;
}
const write = (file_path, extra = {}) => ({ tool_name: "Write", tool_input: { file_path, ...extra } });
const edit = (file_path, extra = {}) => ({ tool_name: "Edit", tool_input: { file_path, ...extra } });
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const stateDeps = (projectDir, status) => ({
  projectDir,
  requireProjectOnboardingReadyFn() {
    if (status === "unavailable") throw new Error("fixture readiness unavailable");
    if (status === "ready") return { status: "ready" };
    throw new ProjectOnboardingReadyError("PORG-NOT-READY", "fixture", { intent: "session", lifecycleStatus: status });
  },
});
const ALL_STATES = [...PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES, "unavailable", "ready"];

test("AC-247 point 1: Write/Edit/mkdir of contained scratch is admitted in every readiness state", (t) => {
  const root = fixture(t);
  // Runtime: every readiness state is exercised at least once; the three tool shapes rotate across
  // states, and the first and last (ready) states run all three.
  const inputs = [write("scratch/nested/report.md"), edit("scratch/nested/report.md"), bash("mkdir -p scratch/nested")];
  ALL_STATES.forEach((status, index) => {
    const deps = stateDeps(root, status);
    const full = index === 0 || index === ALL_STATES.length - 1;
    for (const input of full ? inputs : [inputs[index % inputs.length]]) {
      const result = evaluateLifecycleReadyGuard(input, deps);
      assert.equal(result.exitCode, 0, `${status}/${input.tool_name}: ${result.stderr}`);
    }
  });
  assert.ok(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.length > 0);
});

test("AC-247 point 2: near-miss paths escaping scratch/ and machine state stay refused in every state", (t) => {
  const root = fixture(t);
  // Runtime: the outside-root refusal class costs ~12 s per call (override planning), so it runs in the
  // first state only. The first state runs every near-miss class; each later state runs one of the
  // cheap classes in rotation, so every state is refused at least once.
  const nearMisses = [
    () => write("scratch/../src/escape.md"), () => write("scratch-evil/x.md"),
    () => write("src/not-scratch.md"), () => bash("mkdir -p src/not-scratch"),
  ];
  const outsideRoot = () => write("../outside.md");
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.forEach((status, index) => {
    const deps = stateDeps(root, status);
    const cases = index === 0 ? [...nearMisses, outsideRoot] : [nearMisses[index % nearMisses.length]];
    for (const make of cases) {
      const input = make();
      const result = evaluateLifecycleReadyGuard(input, deps);
      assert.equal(result.exitCode, 2, `${status}/${JSON.stringify(input.tool_input)}`);
    }
  });
  for (const target of ["scratch/../src/x", "scratch-evil/x", "../x", "src/x", "scratch2/x", "/etc/x"]) {
    assert.equal(isPhysicalScratchTarget(target, { rootDir: root, liveRoots: [] }), false, target);
  }
  assert.equal(isPhysicalScratchTarget("scratch/new/dir/file.md", { rootDir: root, liveRoots: [] }), true);
});

test("AC-247 point 3: no arbitrary shell mutation - opaque interpreter and redirect lanes stay refused (typed host boundary)", (t) => {
  const root = fixture(t);
  // Runtime: both lanes run in the first state; each later state runs one lane in rotation.
  const lanes = ["printf x > scratch/out.txt", "node -e \"require('fs').writeFileSync('scratch/a','b')\""];
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.forEach((status, index) => {
    const deps = stateDeps(root, status);
    for (const command of index === 0 ? lanes : [lanes[index % lanes.length]]) {
      const result = evaluateLifecycleReadyGuard(bash(command), deps);
      assert.equal(result.exitCode, 2, `${status}/${command}`);
      assert.match(result.stderr, /GUARD-/u, command);
    }
  });
  assert.equal(isBoundedScratchOnlyWords(["mkdir", "-p", "scratch/a"], { rootDir: root, liveRoots: [] }), true);
  assert.equal(isBoundedScratchOnlyWords(["touch", "src/a"], { rootDir: root, liveRoots: [] }), false);
  assert.equal(isBoundedScratchOnlyWords(["rm", "scratch/a"], { rootDir: root, liveRoots: [] }), false);
});

test("AC-247 point 4: inert marker quotation in scratch is admitted; real authority, aliases and traversal are not", (t) => {
  const root = fixture(t);
  const quote = (path, translated = false, tool = "Write") => ({
    tool_name: tool,
    tool_input: { file_path: path, ...(translated ? { patchContainsAcknowledgementMarker: true }
      : { [tool === "Edit" ? "new_string" : "content"]: `Quoted: ${PO_PLAN_ACKNOWLEDGEMENT_MARKER}` }) },
  });
  for (const status of ["bootstrap-binding-required", "intake-required", "restart-required", "partial", "unavailable", "ready"]) {
    for (const tool of ["Write", "Edit"]) for (const translated of [false, true]) {
      const result = evaluateLifecycleReadyGuard(quote("scratch/quotation.txt", translated, tool), stateDeps(root, status));
      assert.equal(result.exitCode, 0, `${status}/${tool}/${translated}: ${result.stderr}`);
    }
  }
  mkdirSync(join(root, "specs", "onboarding-abcd1234"), { recursive: true });
  const authority = join(root, "specs", "onboarding-abcd1234", "prd_onboarding-abcd1234.md");
  writeFileSync(authority, "authority\n");
  linkSync(authority, join(root, "scratch", "hardlink.txt"));
  for (const path of ["specs/onboarding-abcd1234/prd_onboarding-abcd1234.md", "scratch/hardlink.txt", "scratch/../project/pipeline-state.json"]) {
    for (const translated of [false, true]) {
      const result = evaluateLifecycleReadyGuard(quote(path, translated), { projectDir: root });
      assert.equal(result.exitCode, 2, path);
      assert.match(result.stderr, /GUARD-BOOTSTRAP-ACKNOWLEDGEMENT-WRITER-ONLY/u, path);
    }
  }
});

test("AC-247 point 4b: file symlink out of scratch into authority is refused (skipped where the host cannot create it)", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "specs"), { recursive: true });
  const authority = join(root, "specs", "authority.md");
  writeFileSync(authority, "authority\n");
  try { symlinkSync(authority, join(root, "scratch", "link.md")); }
  catch { t.skip(HOST_LIMITATION); return; }
  assert.equal(isPhysicalScratchTarget("scratch/link.md", { rootDir: root, liveRoots: [] }), false);
});

test("AC-247 point 4c: directory symlink into protected source is refused", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "specs"), { recursive: true });
  try { symlinkSync(join(root, "specs"), join(root, "scratch", "dir"), "dir"); }
  catch { t.skip(HOST_LIMITATION); return; }
  assert.equal(isPhysicalScratchTarget("scratch/dir/new.md", { rootDir: root, liveRoots: [] }), false);
});

test("AC-247 point 5: inert nested hook/test/config snapshots are ordinary scratch for the test-path rules; real surfaces and live plugins under scratch stay protected", (t) => {
  const root = fixture(t);
  const { rules } = loadProtectedTestPathRules({ rootDir: REPO });
  assert.ok(rules.length > 0);
  const real = [
    "plugins/pipeline-core/hooks/guard-testpath.mjs",
    "plugins/pipeline-core/hooks/hooks.json",
    "plugins/pipeline-core/scripts/pipeline-state.mjs",
  ];
  for (const path of real) {
    assert.ok(protectedTestPathRuleFor(rules, path, { rootDir: root, liveRoots: [] }), `real ${path} must stay protected`);
    assert.equal(protectedTestPathRuleFor(rules, `scratch/snap/${path}`, { rootDir: root, liveRoots: [] }), null, `inert snapshot of ${path}`);
    assert.ok(protectedTestPathRuleFor(rules, `scratch/../${path}`, { rootDir: root, liveRoots: [] }), `traversal into ${path}`);
  }
  // An active plugin installed beneath scratch is not inert.
  const live = join(root, "scratch", "active-plugin");
  mkdirSync(join(live, "hooks"), { recursive: true });
  mkdirSync(join(live, ".claude-plugin"), { recursive: true });
  writeFileSync(join(live, ".claude-plugin", "plugin.json"), "{}\n");
  assert.equal(isPhysicalScratchTarget("scratch/active-plugin/hooks/x.mjs", { rootDir: root, liveRoots: [live] }), false);
  // The protected-path rules are repo-relative patterns (plugins/pipeline-core/...), so a live plugin
  // laid out like the real one beneath scratch matches them only because liveRoots lifts the scratch
  // exemption; the same layout in an inert snapshot stays ordinary scratch.
  const nested = "plugins/pipeline-core/hooks/guard-testpath.mjs";
  mkdirSync(join(live, "plugins", "pipeline-core", "hooks"), { recursive: true });
  assert.ok(protectedTestPathRuleFor(rules, `scratch/active-plugin/${nested}`, { rootDir: root, liveRoots: [live] }),
    "live plugin beneath scratch stays protected");
  assert.equal(protectedTestPathRuleFor(rules, `scratch/active-plugin/${nested}`, { rootDir: root, liveRoots: [] }), null,
    "the same path is inert scratch when no live root covers it");
});

test("AC-247 point 6: gate-strength rules apply the same physical-scratch distinction", (t) => {
  const root = fixture(t);
  assert.ok(GATE_STRENGTH_PATHS.length > 0);
  for (const rule of GATE_STRENGTH_PATHS) {
    const path = rule.path.replace(/\/\*$/u, "/x");
    assert.ok(gateStrengthRuleFor(path, root), `real ${path} stays gate-strength protected`);
    assert.equal(gateStrengthRuleFor(`scratch/snap/${path}`, root), null, `inert snapshot of ${path}`);
  }
});

test("AC-247 meaningfulness: a naive prefix-only scratch mirror would admit what the real predicate refuses (RED mirror)", (t) => {
  const root = fixture(t);
  const naiveMirror = (p) => p.replace(/\\/gu, "/").startsWith("scratch");
  const escapes = ["scratch/../src/escape.md", "scratch-evil/x.md"];
  for (const path of escapes) {
    assert.equal(naiveMirror(path), true, `mirror wrongly admits ${path}`);
    assert.equal(isPhysicalScratchTarget(path, { rootDir: root, liveRoots: [] }), false, path);
  }
  // A suffix-only protected-path matcher would flag the inert snapshot; the real matcher does not.
  const { rules } = loadProtectedTestPathRules({ rootDir: REPO });
  const suffix = (p) => rules.find((r) => r.re.test(p)) ?? null;
  const snap = "scratch/snap/plugins/pipeline-core/hooks/guard-testpath.mjs";
  assert.ok(suffix(snap), "suffix-only mirror wrongly protects the inert snapshot");
  assert.equal(protectedTestPathRuleFor(rules, snap, { rootDir: root, liveRoots: [] }), null);
});

test("AC-247 skill promise: the scratch reference promises direct writes under scratch/ and the guard admits them", async () => {
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(new URL("../../skills/pipeline-start/references/scratch-and-directory.md", import.meta.url), "utf8");
  assert.match(text, /can be written directly under `scratch\/`/u);
});
