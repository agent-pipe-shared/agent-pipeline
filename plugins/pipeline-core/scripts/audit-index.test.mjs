// SPDX-License-Identifier: SUL-1.0
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIT_INDEX_SCHEMA, buildAuditIndex } from "./audit-index.mjs";
import * as auditModule from "./audit-index.mjs";
import { hasPrivateTransferContent } from "../lib/bound-artifact-transfer.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const COMMIT = "a".repeat(40);

function withFixture(fn) {
  const scratch = join(repoRoot, "scratch");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "audit-index-"));
  try {
    writeFileSync(join(dir, "spec.md"), "spec body");
    writeFileSync(join(dir, "gate.json"), '{"ok":true}');
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("complete index carries source, commit and gate digests", () => {
  withFixture((dir) => {
    const index = buildAuditIndex({ rootDir: dir, sources: ["spec.md"], commit: COMMIT, gates: [{ id: "verify", path: "gate.json" }] });
    assert.equal(index.schema, AUDIT_INDEX_SCHEMA);
    assert.equal(index.sources[0].sha256, sha("spec body"));
    assert.equal(index.gates[0].sha256, sha('{"ok":true}'));
    assert.equal(index.commit.sha, COMMIT);
    assert.deepEqual(index.missingSteps, []);
    assert.equal(index.complete, true);
  });
});

test("missing source, gate and commit are named explicitly, never omitted", () => {
  withFixture((dir) => {
    const index = buildAuditIndex({ rootDir: dir, sources: ["spec.md", "nope.md"], gates: [{ id: "critic", path: "absent.json" }] });
    const steps = index.missingSteps.map((m) => `${m.step}=${m.reason}`);
    assert.deepEqual(steps, ["source:nope.md=missing", "commit=missing", "gate:critic=missing"]);
    assert.equal(index.complete, false);
    assert.equal(index.sources.find((s) => s.path === "nope.md").sha256, null);
  });
});

test("nothing declared reports sources and gates as missing steps", () => {
  withFixture((dir) => {
    const index = buildAuditIndex({ rootDir: dir });
    assert.deepEqual(
      index.missingSteps.map((m) => m.step),
      ["sources", "commit", "gates"],
    );
  });
});

test("malformed commit and escaping or absolute paths are refused, not hashed", () => {
  withFixture((dir) => {
    const index = buildAuditIndex({ rootDir: dir, sources: ["../outside.md", resolve(dir, "spec.md")], commit: "HEAD", gates: [] });
    assert.equal(index.commit.status, "refused");
    assert.ok(index.sources.every((s) => s.status === "refused" && s.sha256 === null));
    assert.equal(index.complete, false);
  });
});

test("output is deterministic regardless of input order", () => {
  withFixture((dir) => {
    const a = buildAuditIndex({ rootDir: dir, sources: ["spec.md", "gate.json"], commit: COMMIT, gates: [{ id: "b", path: "gate.json" }, { id: "a", path: "spec.md" }] });
    const b = buildAuditIndex({ rootDir: dir, sources: ["gate.json", "spec.md"], commit: COMMIT, gates: [{ id: "a", path: "spec.md" }, { id: "b", path: "gate.json" }] });
    assert.deepEqual(a, b);
  });
});

test("rootDir is required", () => {
  assert.throws(() => buildAuditIndex({}), TypeError);
});

// ---------------------------------------------------------------------------------------------
// AC-175 part A (D209/D210): the collector that gathers a feature's own records, the sanitized
// auditor manifest, the evidence writer the close course calls, and the dispatch-time drift check.
// ---------------------------------------------------------------------------------------------
// A POSIX home-directory shaped absolute path, assembled so no host-path literal sits in the source.
const privateAbsolute = (name) => ["", "home", "someone", name].join("/");
const tempRoots = [];
after(() => { for (const root of tempRoots) rmSync(root, { recursive: true, force: true }); });

function featureFixture() {
  const root = mkdtempSync(join(tmpdir(), "audit-collect-"));
  tempRoots.push(root);
  const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  put("specs/feat/plan.md", "prd body");
  put("specs/feat/spec.md", "spec body");
  put("specs/feat/result.md", "result body");
  const criticBody = '{"critic":"pass"}';
  put("evidence/critic-S1.json", criticBody);
  put("evidence/dispatch-record-S1.json", JSON.stringify({ taskId: "S1", criticEvidence: { path: "evidence/critic-S1.json", sha256: sha(criticBody) } }));
  put("evidence/dispatch-record-S2.json", JSON.stringify({ taskId: "S2", criticSkip: { reason: "mechanical" } }));
  put("specs/feat/slice-queue.json", JSON.stringify({ feature: "feat", slices: [{ id: "S1", state: "ready" }, { id: "S2", state: "ready" }, { id: "S3", state: "cancelled" }] }));
  const verifyBody = JSON.stringify({ schema: "pipeline.verify-evidence.v0", exitCode: 0 });
  put("specs/feat/verify.json", verifyBody);
  put("specs/feat/lifecycle.json", JSON.stringify({ artifacts: [
    { class: "result", path: "specs/feat/result.md", sha256: sha("result body") },
    { class: "candidate-evidence", path: "specs/feat/verify.json", sha256: sha(verifyBody) },
  ] }));
  const state = {
    activeFeature: { id: "feat", planPath: "specs/feat/plan.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planPath: "specs/feat/plan.md", planSha256: sha("prd body"), specPath: "specs/feat/spec.md", specSha256: sha("spec body") } },
    continuity: { authority: {
      prd: { path: "specs/feat/plan.md", sha256: sha("prd body") },
      spec: { path: "specs/feat/spec.md", sha256: sha("spec body") },
      result: { path: "specs/feat/result.md", sha256: sha("result body") },
    } },
  };
  return { root, state, put };
}

test("collect: a complete feature yields sources, approval, dispatch, Critic and Verify digests and is complete", () => {
  const { root, state } = featureFixture();
  const index = auditModule.collectAuditIndex({ rootDir: root, featureId: "feat", state, commit: COMMIT });
  assert.equal(index.schema, AUDIT_INDEX_SCHEMA);
  assert.deepEqual(index.sources.map((s) => s.path), ["specs/feat/plan.md", "specs/feat/result.md", "specs/feat/slice-queue.json", "specs/feat/spec.md"]);
  assert.deepEqual(index.gates.map((g) => g.id), ["critic:S1", "dispatch:S1", "dispatch:S2", "plan-approval:plan", "plan-approval:spec", "verify"]);
  assert.ok(index.gates.every((g) => g.status === "present" && /^[0-9a-f]{64}$/u.test(g.sha256)));
  assert.deepEqual(index.missingSteps, []);
  assert.equal(index.complete, true);
});

test("collect: every absent source is a named missing step, never a refusal and never silent", () => {
  const { root, state } = featureFixture();
  rmSync(join(root, "specs/feat/slice-queue.json"));
  rmSync(join(root, "specs/feat/lifecycle.json"));
  const index = auditModule.collectAuditIndex({ rootDir: root, featureId: "feat", state, commit: COMMIT });
  const steps = index.missingSteps.map((m) => `${m.step}=${m.reason}`);
  assert.ok(steps.includes("dispatch-records=no-delivery-course"), steps.join(","));
  assert.ok(steps.includes("gate:verify=no-feature-package"), steps.join(","));
  assert.equal(index.complete, false);
});

test("collect: a Critic receipt whose bytes drifted, a required Critic without evidence and a cancelled slice", () => {
  const { root, state, put } = featureFixture();
  put("evidence/critic-S1.json", '{"critic":"changed"}');
  put("evidence/dispatch-record-S2.json", JSON.stringify({ taskId: "S2", criticRequired: { appliedRow: "T1" } }));
  const index = auditModule.collectAuditIndex({ rootDir: root, featureId: "feat", state, commit: COMMIT });
  const steps = index.missingSteps.map((m) => `${m.step}=${m.reason}`);
  assert.ok(steps.includes("gate:critic:S1=digest-mismatch"), steps.join(","));
  assert.ok(steps.includes("gate:critic:S2=missing"), steps.join(","));
  assert.ok(!steps.some((s) => s.includes("S3")), "a cancelled slice is not a missing step");
});

test("collect: a feature that is not the active one is a missing step, not a throw", () => {
  const { root, state } = featureFixture();
  const index = auditModule.collectAuditIndex({ rootDir: root, featureId: "other", state, commit: COMMIT });
  assert.ok(index.missingSteps.some((m) => m.step === "feature" && m.reason === "not-active"));
  assert.equal(index.complete, false);
});

test("collect: a recorded absolute or private-looking path never reaches the index, it becomes a missing step", () => {
  const { root, state, put } = featureFixture();
  put("evidence/dispatch-record-S1.json", JSON.stringify({ taskId: "S1", criticEvidence: { path: privateAbsolute("critic.json"), sha256: "a".repeat(64) } }));
  const index = auditModule.collectAuditIndex({ rootDir: root, featureId: "feat", state, commit: COMMIT });
  const text = JSON.stringify(index);
  assert.ok(!text.includes(privateAbsolute("")), text);
  assert.equal(hasPrivateTransferContent(Buffer.from(text)), false);
  assert.ok(index.missingSteps.some((m) => m.step === "gate:critic:S1" && m.reason === "path-not-repo-relative"));
});

test("manifest: paths and digests of present entries only, no body, no absolute path, screened", () => {
  const { root, state } = featureFixture();
  const index = auditModule.collectAuditIndex({ rootDir: root, featureId: "feat", state, commit: COMMIT });
  const manifest = index.manifest;
  assert.equal(manifest.schema, "pipeline.audit-index-manifest.v1");
  assert.equal(manifest.entries.length, index.sources.length + index.gates.length);
  for (const entry of manifest.entries) assert.deepEqual(Object.keys(entry).sort(), ["id", "kind", "path", "sha256"]);
  const text = JSON.stringify(manifest);
  assert.ok(!text.includes("prd body") && !text.includes("critic\":\"pass"), "no file body");
  assert.equal(hasPrivateTransferContent(Buffer.from(text)), false);
  assert.equal(manifest.held, 0);
});

test("manifest: an entry the private screen or the path shape rejects is counted as held, never listed", () => {
  const manifest = auditModule.buildAuditManifest({
    sources: [{ path: "specs/ok.md", status: "present", sha256: "a".repeat(64) }, { path: "specs/has space.md", status: "present", sha256: "b".repeat(64) }],
    gates: [{ id: "g", path: privateAbsolute("x.json"), status: "present", sha256: "c".repeat(64) }, { id: "m", path: "evidence/missing.json", status: "missing", sha256: null }],
  });
  assert.deepEqual(manifest.entries.map((e) => e.path), ["specs/ok.md"]);
  assert.equal(manifest.held, 2);
});

test("evidence writer: writes audit-index.json into a private directory and names it; a private index is held, not written", () => {
  const { root, state } = featureFixture();
  const index = auditModule.collectAuditIndex({ rootDir: root, featureId: "feat", state, commit: COMMIT });
  const directory = join(root, ".git", "agent-pipeline", "close", "evidence");
  const written = auditModule.writeAuditIndexEvidence({ directory, index });
  assert.equal(written.status, "written");
  assert.equal(written.file, "audit-index.json");
  assert.equal(written.complete, true);
  assert.equal(written.sha256, sha(readFileSync(join(directory, "audit-index.json"))));
  assert.ok(!JSON.stringify(written).includes(root), "the result names the file, not an absolute path");
  const heldDirectory = join(root, ".git", "agent-pipeline", "close-held", "evidence");
  const held = auditModule.writeAuditIndexEvidence({ directory: heldDirectory, index: { ...index, sources: [{ path: privateAbsolute("x.md"), status: "present", sha256: "a".repeat(64) }] } });
  assert.equal(held.status, "held");
  assert.equal(held.code, "BT-PRIVACY");
  assert.equal(existsSync(join(heldDirectory, "audit-index.json")), false);
});

test("evidence reader: reports the index already written from its own bytes, and null when there is none", () => {
  const { root, state } = featureFixture();
  const index = auditModule.collectAuditIndex({ rootDir: root, featureId: "feat", state, commit: COMMIT });
  const directory = join(root, ".git", "agent-pipeline", "close-read", "evidence");
  assert.equal(auditModule.readAuditIndexEvidence({ directory }), null);
  const written = auditModule.writeAuditIndexEvidence({ directory, index });
  assert.deepEqual(auditModule.readAuditIndexEvidence({ directory }), written);
});

test("collect verb: reads the State and prints one index, exit 0 even when steps are missing", () => {
  const { root, state } = featureFixture();
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify({ schema: "pipeline.state.v0", ...state }));
  rmSync(join(root, "specs/feat/lifecycle.json"));
  const run = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "audit-index.mjs"), "collect", "--root", root, "--feature-id", "feat", "--commit", COMMIT], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const index = JSON.parse(run.stdout);
  assert.equal(index.schema, AUDIT_INDEX_SCHEMA);
  assert.equal(index.complete, false);
  assert.ok(index.missingSteps.some((m) => m.step === "gate:verify"));
  assert.equal(index.manifest.schema, "pipeline.audit-index-manifest.v1");
  assert.ok(!run.stdout.includes(root), "no absolute path in the output");
});

test("collect verb: no readable State is a typed refusal with exit 2", () => {
  const root = mkdtempSync(join(tmpdir(), "audit-collect-empty-"));
  tempRoots.push(root);
  const run = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "audit-index.mjs"), "collect", "--root", root, "--feature-id", "feat"], { encoding: "utf8" });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.equal(JSON.parse(run.stdout).code, "AUDIT-INDEX-STATE-UNREADABLE");
});

// ---- dispatch-time continuity drift (D209/D210): built like dispatch-briefing.test.mjs, lazily imported ----
const dispatchLib = () => import("./dispatch-briefing.mjs");
const DISPATCH_COMMIT = "1".repeat(40);
const DISPATCH_TREE = "2".repeat(40);
const RULESET = "ab".repeat(32);
const ROW_TEXT = "Original Alfred item sample-slug is delivered as its own original acceptance states, on the integrated candidate";

function dispatchFixture() {
  const root = mkdtempSync(join(tmpdir(), "audit-dispatch-"));
  tempRoots.push(root);
  const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  const spec = ["# Fixture spec", "", "## Acceptance criteria", "", "| # | Criterion | Evidence |", "| --- | --- | --- |",
    `| AC-2 | ${ROW_TEXT} | backlog/items/2026-01-02-sample-slug.md |`, ""].join("\n");
  put("specs/feat-x/spec.md", spec);
  put("backlog/items/2026-01-02-sample-slug.md", "---\nschema: pipeline.backlog-item.v1\nid: pipeline.sample-slug\nstatus: open\n---\nBody.\n");
  const agentsDir = join(root, "agents-fixture");
  put("agents-fixture/goldfish-implementor.md", "---\nname: goldfish-implementor\nmodel: sonnet\neffort: medium\nmaxTurns: 50\n---\nFixture agent body.\n");
  return { root, agentsDir, put };
}

const dispatchDeps = (fx, over = {}) => ({
  agentsDir: fx.agentsDir,
  observePreflight: () => ({ rulesetSource: { selectedPlugin: { id: "pipeline-core", version: "9.9.9+test" }, loadedIdentity: { status: "available", algorithm: "content-sha256", value: RULESET } } }),
  git: (_root, args) => (args[0] === "status" ? "" : args[1] === "HEAD^{tree}" ? DISPATCH_TREE : DISPATCH_COMMIT),
  resolveBaseline: () => ({ status: "ready", entries: [] }),
  defaultSpecPath: () => null,
  queueRow: () => null,
  settledPending: () => null,
  claudeRoute: (taskRoute) => ({ taskRoute, runner: "claude", role: "worker", state: "default", selector: { kind: "alias", value: "sonnet" }, effort: "medium" }),
  ...over,
});

const dispatchArgv = (fx) => ["binding", "--root", fx.root, "--dispatch-id", "ALF-T1", "--item", "sample-slug", "--agent-type", "goldfish-implementor",
  "--model-id", "claude-sonnet-5-5", "--check", "plugins/x/y.test.mjs", "--path", "plugins/x/y.mjs", "--spec", "specs/feat-x/spec.md"];

const driftProjection = (artifacts) => ({
  schema: "pipeline.continuity-authority-drift.v1", status: "drift", featureId: "feat-x", revision: 3, advisory: true,
  artifacts,
  recovery: { kind: "repair-required", code: "CONTINUITY-AUTHORITY-DRIFT", route: "continuity-authority-revision-plan", mutation: false, requiresConfirmation: false, guidance: "g" },
});
const art = (role, path, state) => ({ role, path, recordedSha256: "a".repeat(64), observedSha256: state === "unobservable" ? null : "b".repeat(64), state });

test("dispatch drift: a drifted continuity source refuses the build with a typed code, each drifted path and the sanctioned recovery", async () => {
  const { runDispatchBriefing } = await dispatchLib();
  const fx = dispatchFixture();
  const drift = driftProjection([art("prd", "docs/prd.md", "changed"), art("spec", "docs/spec.md", "changed")]);
  const result = runDispatchBriefing(dispatchArgv(fx), dispatchDeps(fx, { observeContinuityDrift: () => drift }));
  assert.equal(result.ok, false, JSON.stringify(result).slice(0, 400));
  assert.equal(result.code, "DBG-CONTINUITY-AUTHORITY-DRIFT");
  assert.match(result.message, /docs\/prd\.md/u);
  assert.match(result.message, /docs\/spec\.md/u);
  assert.match(result.message, /continuity-authority-revision-plan/u);
  assert.match(result.message, /--proposal-file/u);
  assert.ok(!result.message.includes(fx.root), "no absolute path in the refusal");
});

test("dispatch drift: only the changed source is named", async () => {
  const { runDispatchBriefing } = await dispatchLib();
  const fx = dispatchFixture();
  const drift = driftProjection([art("prd", "docs/prd.md", "match"), art("spec", "docs/spec.md", "changed")]);
  const result = runDispatchBriefing(dispatchArgv(fx), dispatchDeps(fx, { observeContinuityDrift: () => drift }));
  assert.equal(result.code, "DBG-CONTINUITY-AUTHORITY-DRIFT");
  assert.match(result.message, /docs\/spec\.md/u);
  assert.doesNotMatch(result.message, /docs\/prd\.md/u);
});

test("dispatch drift: no continuity record, no drift and a failing observer leave the output byte-identical", async () => {
  const { runDispatchBriefing } = await dispatchLib();
  const fx = dispatchFixture();
  const baseline = JSON.stringify(runDispatchBriefing(dispatchArgv(fx), dispatchDeps(fx)));
  assert.equal(JSON.parse(baseline).ok, true, baseline.slice(0, 400));
  assert.equal(JSON.stringify(runDispatchBriefing(dispatchArgv(fx), dispatchDeps(fx, { observeContinuityDrift: () => null }))), baseline);
  assert.equal(JSON.stringify(runDispatchBriefing(dispatchArgv(fx), dispatchDeps(fx, { observeContinuityDrift: () => { throw new Error("boom"); } }))), baseline);
});

test("dispatch drift: a source that cannot be observed is a warning, not a refusal", async () => {
  const { runDispatchBriefing } = await dispatchLib();
  const fx = dispatchFixture();
  const drift = driftProjection([art("prd", "docs/prd.md", "unobservable"), art("spec", "docs/spec.md", "match")]);
  const result = runDispatchBriefing(dispatchArgv(fx), dispatchDeps(fx, { observeContinuityDrift: () => drift }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  const warning = result.warnings.find((w) => w.code === "DBG-CONTINUITY-AUTHORITY-UNOBSERVABLE");
  assert.ok(warning, JSON.stringify(result.warnings));
  assert.match(warning.message, /docs\/prd\.md/u);
});

test("dispatch drift: the default observer reads the real State of the root", async () => {
  const { runDispatchBriefing } = await dispatchLib();
  const fx = dispatchFixture();
  fx.put("docs/prd.md", "prd now");
  fx.put("docs/spec.md", "spec now");
  const continuity = { revision: 3, featureId: "feat-x", authority: {
    prd: { path: "docs/prd.md", sha256: sha("prd then") }, spec: { path: "docs/spec.md", sha256: sha("spec now") }, result: null },
  queueHead: { nextAction: "work", dispatch: null }, blocker: null, decisionTxn: null };
  fx.put(".claude/pipeline-state.json", JSON.stringify({ schema: "pipeline.state.v0", activeFeature: { id: "feat-x", planPath: "docs/prd.md", phase: "implementation" }, continuity }));
  const result = runDispatchBriefing(dispatchArgv(fx), dispatchDeps(fx));
  assert.equal(result.code, "DBG-CONTINUITY-AUTHORITY-DRIFT", JSON.stringify(result).slice(0, 400));
  assert.match(result.message, /docs\/prd\.md/u);
  assert.doesNotMatch(result.message, /docs\/spec\.md/u);
  fx.put("docs/prd.md", "prd then");
  assert.equal(runDispatchBriefing(dispatchArgv(fx), dispatchDeps(fx)).ok, true, "matching bytes dispatch");
});
