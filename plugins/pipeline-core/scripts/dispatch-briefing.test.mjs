// SPDX-License-Identifier: SUL-1.0
/**
 * Contract for the native Goldfish binding generator (`dispatch-briefing.mjs binding`).
 *
 * Every test builds a throwaway fixture repository (spec with an acceptance row, backlog items,
 * agent definitions) and injects the preflight observer, the git reader and the protected
 * baseline resolver, so each generated field is compared against its own source and nothing is
 * restated here that the generator is supposed to read. The module is imported lazily inside
 * each test so a missing implementation fails every test individually (a countable RED).
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NATIVE_GOLDFISH_HOST_DIRECTIVE,
  parseNativeGoldfishBriefing,
  validateItemDeliveryBriefing,
} from "../lib/native-goldfish-host-return.mjs";
import { parseAcceptedCriticCriterion } from "../lib/critic-accepted-contract.mjs";
import { dispatchBudgetLineForRole } from "../lib/dispatch-policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "dispatch-briefing.mjs");
const lib = () => import("./dispatch-briefing.mjs");

const MARKER = "<!-- pipeline-native-goldfish-host-commit:v";
const COMMIT = "1".repeat(40);
const TREE = "2".repeat(40);
const RULESET = "ab".repeat(32);
const CHECK = "plugins/x/y.test.mjs";
const PATH_A = "plugins/x/y.mjs";
const ROW_TEXT = "Original Alfred item sample-slug is delivered as its own original acceptance states, on the integrated candidate";
const NOID_TEXT = "Original Alfred item no-id-slug is delivered as its own original acceptance states, on the integrated candidate";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function agentFile(name, model, effort, maxTurns) {
  return `---\nname: ${name}\nmodel: ${model}\neffort: ${effort}\nmaxTurns: ${maxTurns}\n---\nFixture agent body.\n`;
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "dispatch-briefing-"));
  roots.push(root);
  const put = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  const spec = [
    "# Fixture spec — Café",
    "",
    "## Acceptance criteria",
    "",
    "| # | Criterion | Evidence |",
    "| --- | --- | --- |",
    "| AC-1 | Naïve criterion with multibyte text | backlog/items/2026-01-01-other.md |",
    `| AC-2 | ${ROW_TEXT} | backlog/items/2026-01-02-sample-slug.md |`,
    `| AC-3 | ${NOID_TEXT} | backlog/items/2026-01-03-no-id-slug.md |`,
    "",
  ].join("\n");
  put("specs/feat-x/spec.md", spec);
  put("backlog/items/2026-01-02-sample-slug.md", "---\nschema: pipeline.backlog-item.v1\nid: pipeline.sample-slug\nstatus: open\n---\nBody.\n");
  put("backlog/items/2026-01-03-no-id-slug.md", "---\nschema: pipeline.backlog-item.v1\nstatus: open\n---\nBody.\n");
  const agentsDir = join(root, "agents-fixture");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, "goldfish-deep.md"), agentFile("goldfish-deep", "sonnet", "xhigh", 80));
  writeFileSync(join(agentsDir, "goldfish-implementor.md"), agentFile("goldfish-implementor", "sonnet", "medium", 50));
  writeFileSync(join(agentsDir, "goldfish-mechanic.md"), agentFile("goldfish-mechanic", "haiku", "low", 30));
  return { root, specRel: "specs/feat-x/spec.md", specBytes: Buffer.from(spec), agentsDir };
}

const availableObserver = () => ({
  rulesetSource: {
    selectedPlugin: { id: "pipeline-core", version: "9.9.9+test" },
    loadedIdentity: { status: "available", algorithm: "content-sha256", value: RULESET },
  },
});

const depsOf = (fx, over = {}) => ({
  agentsDir: fx.agentsDir,
  observePreflight: availableObserver,
  git: (_root, args) => (args[0] === "status" ? "" : args[1] === "HEAD^{tree}" ? TREE : COMMIT),
  resolveBaseline: () => ({ status: "ready", entries: [] }),
  defaultSpecPath: () => null,
  queueRow: () => null,
  // hermetic: the pre-existing cases never run session-authority-repair inspect for the settled-pending count (W7 cases inject their own)
  settledPending: () => null,
  // hermetic: the pre-existing cases never read the real runner-profile registry; the route here equals each fixture agent's own effort
  // (no contradiction, no unreadable-route warning), and the W2-R2 cases inject their own
  claudeRoute: (taskRoute) => ({ taskRoute, runner: "claude", role: "worker", state: "default", selector: { kind: "alias", value: "sonnet" }, effort: { "duty.implement": "medium", "duty.mechanic": "low", "duty.deep": "xhigh" }[taskRoute] }),
  ...over,
});

function argvOf(fx, overrides = {}, extra = []) {
  const pairs = [["--root", fx.root], ["--dispatch-id", "ALF-T1"], ["--item", "sample-slug"],
    ["--agent-type", "goldfish-implementor"], ["--model-id", "claude-sonnet-5-5"],
    ["--check", CHECK], ["--path", PATH_A], ["--spec", fx.specRel]];
  const out = ["binding"];
  for (const [flag, value] of pairs) {
    const chosen = Object.hasOwn(overrides, flag) ? overrides[flag] : value;
    if (chosen !== null) out.push(flag, chosen);
  }
  return [...out, ...extra];
}

const capOf = (type) => Number(/≤(\d+) tool uses/u.exec(dispatchBudgetLineForRole(type))[1]);
const budgetOf = (skeleton) => Number(/Tool budget[^\n]*≤(\d+) tool uses/u.exec(skeleton)[1]);

function directorySnapshot(root, prefix = "") {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    const path = prefix ? `${prefix}/${name}` : name;
    const stat = lstatSync(join(root, path));
    const row = [path, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs];
    return stat.isDirectory() ? [row, ...directorySnapshot(root, path)] : [[...row, sha(readFileSync(join(root, path)))]];
  });
}

for (const flag of ["--help", "-h"]) test(`public ${flag} prints actionable usage and exits zero`, () => {
  const result = spawnSync(process.execPath, [SCRIPT, flag], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Usage:[\s\S]*binding[\s\S]*build/u);
});

test("public --help and -h work before setup without private reads, processes or filesystem effects", () => {
  const root = mkdtempSync(join(tmpdir(), "dispatch-help-"));
  const held = lstatSync(root);
  try {
    const audit = join(root, "audit.mjs");
    writeFileSync(audit, `import fs from 'node:fs';
import cp from 'node:child_process';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
const calls=[];
for(const key of ['readFileSync','lstatSync','statSync','existsSync','readdirSync','realpathSync','openSync','writeFileSync','mkdirSync','rmSync','unlinkSync','renameSync']) {
 const original=fs[key];
 const wrapped=function(path,...args) {
  const text=String(path);
  if(text.startsWith(process.cwd()) || text.startsWith(process.env.HOME) || text.includes('/.git/agent-pipeline/')) { calls.push(key); throw new Error('HELP-FORBIDDEN-IO'); }
  return original.call(this,path,...args);
 };
 if(original.native) wrapped.native=wrapped;
 fs[key]=wrapped;
}
for(const key of ['spawnSync','execFileSync','spawn','execFile','execSync','exec']) cp[key]=()=>{calls.push(key);throw new Error('HELP-FORBIDDEN-PROCESS');};
for(const key of ['homedir','userInfo']) os[key]=()=>{calls.push(key);throw new Error('HELP-FORBIDDEN-IDENTITY');};
syncBuiltinESMExports();
process.on('exit',()=>process.stderr.write('HELP-AUDIT:'+JSON.stringify(calls)+'\\n'));
`);
    const before = directorySnapshot(root);
    for (const flag of ["--help", "-h"]) {
      const result = spawnSync(process.execPath, ["--import", audit, SCRIPT, flag], {
        cwd: root, encoding: "utf8", env: { ...process.env, PIPELINE_MODEL_ROLE_STORE: join(root, "unavailable-store") },
      });
      assert.equal(result.status, 0, `${flag}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /Usage:/u);
      assert.match(result.stdout, /binding[\s\S]*--dispatch-id[\s\S]*--item[\s\S]*--agent-type[\s\S]*--model-id[\s\S]*--check[\s\S]*--path/u);
      assert.match(result.stdout, /build[\s\S]*--package[\s\S]*--out/u);
      assert.match(result.stdout, /pipeline\.dispatch-briefing-package\.v1/u);
      assert.match(result.stdout, /--runner[\s\S]*claude[\s\S]*codex/u);
      assert.match(result.stdout, /no.*(?:authoriz|attest)|does not.*(?:authoriz|attest)/iu);
      assert.equal(result.stderr, "HELP-AUDIT:[]\n");
      assert.deepEqual(directorySnapshot(root), before);
    }
    for (const args of [["--help", "build", "--out", "scratch/help.md"], ["build", "--help", "--package", "missing.json"],
      ["binding", "-h"], ["--help", "--bogus"], ["--help", "--root", root], ["--help", "-h"]]) {
      const result = spawnSync(process.execPath, ["--import", audit, SCRIPT, ...args], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 2, JSON.stringify(args));
      assert.equal(JSON.parse(result.stdout).ok, false);
      assert.equal(result.stderr, "HELP-AUDIT:[]\n");
      assert.deepEqual(directorySnapshot(root), before);
    }
  } finally {
    const now = lstatSync(root);
    if (now.dev === held.dev && now.ino === held.ino) rmSync(root, { recursive: true });
  }
});

test("binding fields equal the facts of their own sources", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(Object.keys(result).sort(), ["binding", "block", "ok", "schema", "skeleton", "warnings"]);
  const b = result.binding;
  assert.equal(b.schema, "pipeline.native-goldfish-host-briefing.v3");
  assert.equal(b.dispatchId, "ALF-T1");
  assert.equal(b.candidateCommit, COMMIT);
  assert.equal(b.candidateTree, TREE);
  assert.equal(b.runner, "claude");
  assert.equal(b.role, "pipeline-core:goldfish-implementor");
  assert.equal(b.agentType, "goldfish-implementor");
  assert.equal(b.model, "claude-sonnet-5-5");
  assert.equal(b.effort, "medium");
  assert.equal(b.rulesetSha, RULESET);
  assert.deepEqual(b.allowedPaths, [PATH_A, CHECK]);
  assert.deepEqual(b.criticDecision, {
    schema: "pipeline.critic-required-decision.v1",
    trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
      diff: { mechanical: false, architecture: true, guardrails: false, security: false } },
    appliedRow: "T1",
  });
  const item = b.itemDelivery;
  assert.equal(item.schema, "pipeline.item-delivery-briefing.v1");
  assert.equal(item.sliceId, "ALF-T1");
  assert.equal(item.itemId, "pipeline.sample-slug");
  assert.deepEqual(item.checks, [{ id: "alf-t1-check", path: CHECK, dependencies: [PATH_A, CHECK] }]);
  const start = fx.specBytes.indexOf(Buffer.from(ROW_TEXT));
  const end = start + Buffer.byteLength(ROW_TEXT);
  assert.deepEqual(item.criterionLocator, {
    schema: "pipeline.critic-criterion-locator.v1",
    sourcePath: fx.specRel,
    sourceSha256: sha(fx.specBytes),
    criterionId: "AC-2",
    startByte: start,
    endByte: end,
    excerptSha256: sha(fx.specBytes.subarray(start, end)),
  });
  assert.equal(fx.specBytes.subarray(start, end).toString("utf8"), ROW_TEXT);
});

for (const [agentType, modelId, effort, maxTurns] of [
  ["goldfish-deep", "claude-sonnet-5-5", "xhigh", 80],
  ["goldfish-implementor", "claude-sonnet-5-5", "medium", 50],
  ["goldfish-mechanic", "claude-haiku-4-5", "low", 30],
]) {
  test(`effort and tool budget follow the ${agentType} definition`, async () => {
    const { runDispatchBriefing } = await lib();
    const fx = makeFixture();
    const result = runDispatchBriefing(argvOf(fx, { "--agent-type": agentType, "--model-id": modelId }), depsOf(fx));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.binding.effort, effort);
    assert.equal(result.binding.agentType, agentType);
    assert.equal(result.binding.role, `pipeline-core:${agentType}`);
    const budget = Math.min(capOf(agentType), maxTurns - 15);
    assert.equal(budgetOf(result.skeleton), budget);
    assert.match(result.skeleton, new RegExp(`checkpoint at about call ${Math.floor(budget * 0.8)}\\b`, "u"));
    assert.match(result.skeleton, new RegExp(`\`${modelId}\` / ${effort}`, "u"));
  });
}

test("the criterion locator validates against the original bytes", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(validateItemDeliveryBriefing(result.binding.itemDelivery).ok, true);
  const parsed = parseAcceptedCriticCriterion({
    sourceBytes: fx.specBytes,
    locator: result.binding.itemDelivery.criterionLocator,
    packageContext: { featureId: "feat-x", sourceBindings: [{ path: fx.specRel, sha256: sha(fx.specBytes), role: "spec" }] },
  });
  assert.ok(["explicit-actual-independent-pass", "no-explicit-criterion"].includes(parsed.status), JSON.stringify(parsed));
});

test("the block round-trips the host parser and the skeleton carries the marker once", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.block.startsWith(`${MARKER}3\n`));
  assert.ok(result.block.endsWith("\n-->"));
  const fromBlock = parseNativeGoldfishBriefing(`${result.block}\n\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\n`);
  assert.equal(fromBlock.ok, true, JSON.stringify(fromBlock));
  // The strict JSON parser returns null-prototype objects; compare plain-data equality.
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(fromBlock.binding), result.binding);
  const fromSkeleton = parseNativeGoldfishBriefing(result.skeleton);
  assert.equal(fromSkeleton.ok, true, JSON.stringify(fromSkeleton));
  assert.deepEqual(plain(fromSkeleton.binding), result.binding);
  assert.equal(result.skeleton.split(MARKER).length, 2);
  assert.equal(result.skeleton.split(NATIVE_GOLDFISH_HOST_DIRECTIVE).length, 2);
  assert.ok(result.skeleton.includes(result.block));
});

test("the skeleton prefills field 6 and leaves judgment fields as placeholders", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  const text = result.skeleton;
  for (const heading of ["### 1. Goal", "### 2. Context files", "### 3. DoD checks", "### 4. Forbidden", "### 5. Stop conditions", "### 6. Dispatch metadata"]) {
    assert.ok(text.includes(heading), heading);
  }
  for (const placeholder of ["{{GOAL}}", "{{CONTEXT_FILES}}", "{{DOD_CHECKS}}", "{{FORBIDDEN}}", "{{STOP_CONDITIONS}}"]) {
    assert.ok(text.includes(placeholder), placeholder);
  }
  const field6 = text.slice(text.indexOf("### 6. Dispatch metadata"));
  assert.ok(field6.includes(RULESET));
  assert.ok(field6.includes("9.9.9+test"));
  assert.ok(field6.includes("`claude-sonnet-5-5` / medium"));
  assert.ok(field6.includes("goldfish-implementor"));
  assert.ok(field6.includes("TB-09"));
  assert.ok(!/\{\{(?:RULESET|MODEL|TIER|TOOL_BUDGET)/u.test(field6));
});

test("the skeleton names the slice and write scope the item admission reads (PF-42)", async () => {
  const { runDispatchBriefing } = await lib();
  const { parseDispatchSlice } = await import("../lib/dispatch-policy.mjs");
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  const named = parseDispatchSlice(result.skeleton);
  assert.equal(named.sliceId, result.binding.itemDelivery.sliceId);
  assert.deepEqual(named.writeScope, result.binding.allowedPaths);
});

test("the skeleton names the owning module, its allowed dependencies and contract for the touched paths (FB3-PF-54)", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const without = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.equal(without.ok, true, JSON.stringify(without));
  assert.match(without.skeleton, /### 2\. Context files\n\n- Architecture: this project has no architecture map/u);

  const concept = (id, owned, deps, contracts) => `---\ntype: Governed Module\nid: ${id}\nresponsibility: Owns the ${id} code\nnonResponsibilities: []\nownedPaths:\n  - ${owned}\npublicContracts:${contracts.length ? `\n${contracts.map((c) => `  - ${c}`).join("\n")}` : " []"}\nallowedDependencies:${deps.length ? `\n${deps.map((d) => `  - ${d}`).join("\n")}` : " []"}\nauthorityEffects: []\nverificationEntryPoints: []\nadrReferences: []\n---\n`;
  mkdirSync(join(fx.root, "architecture/map"), { recursive: true });
  writeFileSync(join(fx.root, "architecture/map/index.md"), "# Map\n");
  writeFileSync(join(fx.root, "architecture/map/x.md"), concept("x", "plugins/x/**", ["shared"], ["plugins/x/api.mjs"]));
  writeFileSync(join(fx.root, "architecture/map/shared.md"), concept("shared", "shared/**", [], []));
  const mapped = runDispatchBriefing(argvOf(fx, {}, ["--path", "tools/loose.mjs"]), depsOf(fx));
  assert.equal(mapped.ok, true, JSON.stringify(mapped));
  const field2 = mapped.skeleton.slice(mapped.skeleton.indexOf("### 2. Context files"), mapped.skeleton.indexOf("### 3. DoD checks"));
  assert.match(field2, /- Architecture, module `x` \(`plugins\/x\/y\.mjs`, `plugins\/x\/y\.test\.mjs`\): Owns the x code\. Imports only within the module or from: `shared`; public contracts `plugins\/x\/api\.mjs`\./u);
  assert.match(field2, /no single module owns `tools\/loose\.mjs`/u);
  assert.ok(field2.includes("{{CONTEXT_FILES}}"), "the hand-authored context stays a placeholder");
});

test("a dispatch id that names a governed queue row must match its write scope, item and state (PF-47)", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const first = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.equal(first.ok, true, JSON.stringify(first));
  const row = { id: "ALF-T1", state: "ready", writeScope: [...first.binding.allowedPaths], delivery: { itemId: first.binding.itemDelivery.itemId } };
  assert.equal(runDispatchBriefing(argvOf(fx), depsOf(fx, { queueRow: () => row })).ok, true, "the identical scope rebinds");
  const wider = { ...row, writeScope: [...row.writeScope, "plugins/x/extra.mjs"] };
  const drift = runDispatchBriefing(argvOf(fx), depsOf(fx, { queueRow: () => wider }));
  assert.equal(drift.code, "DBG-QUEUE-ROW-DRIFT");
  assert.match(drift.message, /plugins\/x\/extra\.mjs/u);
  assert.match(drift.message, new RegExp(`--check ${CHECK.replaceAll(".", "\\.")}`, "u"));
  assert.equal(runDispatchBriefing(argvOf(fx), depsOf(fx, { queueRow: () => ({ ...row, state: "cancelled" }) })).code, "DBG-QUEUE-ROW-NOT-READY");
  assert.equal(runDispatchBriefing(argvOf(fx), depsOf(fx, { queueRow: () => ({ ...row, delivery: { itemId: "other.item" } }) })).code, "DBG-QUEUE-ROW-DRIFT");
  assert.equal(runDispatchBriefing(argvOf(fx), depsOf(fx, { queueRow: () => ({ ...wider, state: "deferred", delivery: { status: "unbound-legacy" } }) })).ok, true, "a legacy row is rebound by the course writer");
});

test("a scope drift names the cancel with its class argument and teaches each class (D75 S5)", async () => {
  const { runDispatchBriefing } = await lib();
  const { CANCEL_CLASS_HELP, CANCEL_CLASSES } = await import("../lib/slice-queue.mjs");
  const fx = makeFixture();
  const first = runDispatchBriefing(argvOf(fx), depsOf(fx));
  const row = { id: "ALF-T1", state: "ready", writeScope: [...first.binding.allowedPaths, "plugins/x/extra.mjs"], delivery: { itemId: first.binding.itemDelivery.itemId } };
  const drift = runDispatchBriefing(argvOf(fx), depsOf(fx, { queueRow: () => row }));
  assert.equal(drift.code, "DBG-QUEUE-ROW-DRIFT");
  assert.match(drift.message, /slice-queue\.mjs cancel ALF-T1 --reason "<why>" --class <budget\|wrong-premise\|review-defect\|integrated-elsewhere\|superseded>/u, drift.message);
  for (const name of CANCEL_CLASSES) assert.ok(drift.message.includes(`${name} = ${CANCEL_CLASS_HELP[name]}`), `${name} is taught: ${drift.message}`);
});

const REFUSALS = [
  ["a missing acceptance row names the slug", { "--item": "absent-slug" }, [], {}, "DBG-AC-ROW-MISSING", "absent-slug"],
  ["an unknown agent type", { "--agent-type": "goldfish-wizard" }, [], {}, "DBG-AGENT-TYPE-UNKNOWN", "goldfish-wizard"],
  ["a check that is not a test file", { "--check": PATH_A }, [], {}, "DBG-CHECK-NOT-TEST", PATH_A],
  ["an unknown flag", {}, ["--frobnicate", "1"], {}, "DBG-FLAG-UNKNOWN", "--frobnicate"],
  ["a repeated single-value flag", {}, ["--check", "plugins/x/z.test.mjs"], {}, "DBG-FLAG-REPEATED", "--check"],
  ["a missing required flag", { "--model-id": null }, [], {}, "DBG-FLAG-MISSING", "--model-id"],
  ["a flag without a value", {}, ["--path"], {}, "DBG-FLAG-VALUE", "--path"],
  ["a model outside the alias family", { "--model-id": "claude-opus-5" }, [], {}, "DBG-MODEL-FAMILY", "sonnet"],
  ["an unavailable ruleset identity", {}, [], { observePreflight: () => ({ rulesetSource: { loadedIdentity: { status: "unavailable" } } }) }, "DBG-RULESET-UNAVAILABLE", "unavailable"],
  ["a preflight without a ruleset source", {}, [], { observePreflight: () => ({ rulesetSource: null }) }, "DBG-RULESET-UNAVAILABLE", "absent"],
  ["a dispatch id carrying the binding marker", { "--dispatch-id": `X${MARKER}3` }, [], {}, "DBG-DISPATCH-ID", ""],
  ["a path that escapes the repository", {}, ["--path", "../escape.mjs"], {}, "DBG-PATH-INVALID", "../escape.mjs"],
  ["an unreadable spec", { "--spec": "specs/feat-x/nope.md" }, [], {}, "DBG-SPEC-UNREADABLE", "specs/feat-x/nope.md"],
  ["no spec flag and no authority default", { "--spec": null }, [], {}, "DBG-SPEC-UNRESOLVED", "--spec"],
  ["an agent type without a definition", {}, [], { agentsDir: "/nonexistent-agents-dir-for-test" }, "DBG-AGENT-UNRESOLVED", "goldfish-implementor"],
];
for (const [name, overrides, extra, depOverrides, code, mention] of REFUSALS) {
  test(`refuses ${name}`, async () => {
    const { runDispatchBriefing } = await lib();
    const fx = makeFixture();
    const result = runDispatchBriefing(argvOf(fx, overrides, extra), depsOf(fx, depOverrides));
    assert.equal(result.ok, false, JSON.stringify(result).slice(0, 300));
    assert.equal(result.code, code, result.message);
    assert.ok(result.message.includes(mention), result.message);
    assert.equal(result.skeleton, undefined);
  });
}

// K12: a transient registry lock must never degrade into a different ruleset identity.
const heldLock = (over = {}) => ({ status: "held", owner: "live", pid: 4242, ageSeconds: 3, ...over });
const unavailableObserver = () => ({ rulesetSource: { loadedIdentity: { status: "unavailable" } }, pluginRoot: "/fixture/plugin-root" });

test("K12 a lock that stays held refuses DBG-RULESET-LOCK-HELD naming the holder instead of falling back to the plugin-root hash", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  let clock = 0;
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { observePreflight: unavailableObserver, snapshotPluginRoot: () => ({ contentSha256: "e".repeat(64) }),
    registryLock: () => heldLock(), now: () => clock, pause: (ms) => { clock += ms; } }));
  assert.equal(result.ok, false); assert.equal(result.code, "DBG-RULESET-LOCK-HELD", result.message);
  assert.match(result.message, /pid 4242/u); assert.match(result.message, /retry this command/u); assert.match(result.message, /session-authority-repair\.mjs wait/u);
  assert.equal(result.skeleton, undefined);
});

test("K12 a lock that clears within the wait changes nothing: the identity is read again and the loaded one is used", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  let clock = 0; let reads = 0; let observed = 0;
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, {
    observePreflight: () => { observed += 1; if (observed === 1) { const error = new Error("held"); error.code = "SDC-LOCK-HELD"; throw error; } return availableObserver(); },
    snapshotPluginRoot: () => ({ contentSha256: "e".repeat(64) }),
    registryLock: () => { reads += 1; return reads <= 2 ? heldLock() : { status: "absent" }; }, now: () => clock, pause: (ms) => { clock += ms; } }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.equal(result.binding.rulesetSha, RULESET);
  assert.equal(result.warnings.some((warning) => warning.code === "DBG-RULESET-FALLBACK"), false, "no fallback identity was used");
});

test("K12 a preflight that throws SDC-LOCK-HELD is refused typed, never answered with a fallback identity", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { observePreflight: () => { const error = new Error("held"); error.code = "SDC-LOCK-HELD"; throw error; },
    snapshotPluginRoot: () => ({ contentSha256: "e".repeat(64) }), registryLock: () => ({ status: "absent" }) }));
  assert.equal(result.ok, false); assert.equal(result.code, "DBG-RULESET-LOCK-HELD", result.message);
});

test("refuses an unknown subcommand", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const argv = argvOf(fx);
  argv[0] = "serve";
  const result = runDispatchBriefing(argv, depsOf(fx));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DBG-SUBCOMMAND");
});

test("the binding invariant refuses a check that is not among the allowed paths", async () => {
  const { runDispatchBriefing, assertBindingInvariants } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.doesNotThrow(() => assertBindingInvariants(result.binding));
  const broken = structuredClone(result.binding);
  broken.allowedPaths = [PATH_A];
  assert.throws(() => assertBindingInvariants(broken), (error) => error.code === "DBG-CHECK-NOT-IN-PATHS");
});

test("a backlog item without an id falls back with a warning", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx, { "--item": "no-id-slug" }), depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.binding.itemDelivery.itemId, "pipeline.no-id-slug");
  assert.deepEqual(result.warnings.map((entry) => entry.code), ["DBG-ITEM-ID-FALLBACK"]);
});

test("a path matching a protected-baseline rule yields a warning with the rule id", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const entries = [{ id: "PB-TEST-1", pathPattern: "^plugins/x/y\\.mjs$", class: "config", rationale: "fixture rule" }];
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { resolveBaseline: () => ({ status: "ready", entries }) }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, "DBG-PROTECTED-PATH");
  assert.equal(result.warnings[0].ruleId, "PB-TEST-1");
  assert.equal(result.warnings[0].path, PATH_A);
  const plain = runDispatchBriefing(argvOf(fx), depsOf(fx));
  assert.deepEqual(plain.warnings, []);
  const unavailable = runDispatchBriefing(argvOf(fx), depsOf(fx, { resolveBaseline: () => ({ status: "unavailable", entries: [] }) }));
  assert.deepEqual(unavailable.warnings.map((entry) => entry.code), ["DBG-BASELINE-UNAVAILABLE"]);
});

test("output is deterministic and independent of path order and duplicates", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const first = runDispatchBriefing(argvOf(fx, {}, ["--path", "plugins/x/a.mjs"]), depsOf(fx));
  const second = runDispatchBriefing(argvOf(fx, {}, ["--path", "plugins/x/a.mjs"]), depsOf(fx));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const reordered = runDispatchBriefing(
    ["binding", "--path", "plugins/x/a.mjs", "--path", PATH_A, "--path", PATH_A, ...argvOf(fx, { "--path": null }).slice(1)], depsOf(fx));
  assert.equal(reordered.ok, true, JSON.stringify(reordered));
  assert.equal(JSON.stringify(reordered), JSON.stringify(first));
  assert.deepEqual(first.binding.allowedPaths, ["plugins/x/a.mjs", PATH_A, CHECK]);
});

test("the spec defaults to the project authority state when --spec is absent", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx, { "--spec": null }), depsOf(fx, { defaultSpecPath: () => fx.specRel }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.binding.itemDelivery.criterionLocator.sourcePath, fx.specRel);
});

test("real git: HEAD and tree come from the repository, an uncommitted spec warns, nothing is written", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  const git = (...args) => {
    const r = spawnSync("git", ["-C", fx.root, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
      "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
  const real = { ...depsOf(fx) };
  delete real.git;
  const clean = runDispatchBriefing(argvOf(fx), real);
  assert.equal(clean.ok, true, JSON.stringify(clean));
  assert.equal(clean.binding.candidateCommit, git("rev-parse", "HEAD"));
  assert.equal(clean.binding.candidateTree, git("rev-parse", "HEAD^{tree}"));
  assert.deepEqual(clean.warnings, []);
  writeFileSync(join(fx.root, fx.specRel), `${readFileSync(join(fx.root, fx.specRel), "utf8")}\n`);
  const before = git("status", "--porcelain");
  const dirty = runDispatchBriefing(argvOf(fx), real);
  assert.equal(dirty.ok, true, JSON.stringify(dirty));
  assert.deepEqual(dirty.warnings.map((entry) => entry.code), ["DBG-SPEC-UNCOMMITTED"]);
  assert.equal(git("status", "--porcelain"), before);
  assert.equal(git("rev-parse", "HEAD"), clean.binding.candidateCommit);
});

test("the command line prints a typed refusal as JSON and exits 2", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "binding", "--bogus", "1"], { encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.equal(out.code, "DBG-FLAG-UNKNOWN");
});

// --- `build`: the complete briefing from a closed package (PO decision D78) ---

const buildLib = () => import("../lib/dispatch-briefing-build.mjs");

function packageFixture(over = {}, { calibration = true } = {}) {
  const fx = makeFixture();
  const put = (rel, text) => {
    mkdirSync(dirname(join(fx.root, rel)), { recursive: true });
    writeFileSync(join(fx.root, rel), text);
  };
  put(PATH_A, "export const y = 1;\n");
  put(CHECK, "// fixture check\n");
  if (calibration) put("project/pipeline.json", JSON.stringify({ project: "fixture-project", handover: "docs/state.md", verify: "node verify.mjs" }));
  const pkg = {
    id: "ALF-T1", item: "sample-slug", agentType: "goldfish-implementor", modelId: "claude-sonnet-5-5",
    modelWhy: "role default", check: CHECK, paths: [PATH_A], spec: fx.specRel,
    title: "Fixture title", ac: "AC-2", goal: "Fixture goal text.",
    context: ["`plugins/x/y.mjs` — the module."],
    targeted: [`\`node --test ${CHECK}\` (green)`],
    forbidden: ["Fixture forbidden rule."], stops: ["Fixture stop rule."],
    ...over,
  };
  for (const key of Object.keys(pkg)) if (pkg[key] === undefined) delete pkg[key];
  put("scratch/pkg.json", JSON.stringify(pkg));
  return { fx, pkg, argv: ["build", "--root", fx.root, "--package", "scratch/pkg.json"] };
}

test("build renders the complete briefing: the binding parses back, the fields match the package, the marker verifies", async () => {
  const { runDispatchBriefing } = await lib();
  const { verifyGeneratedBriefing } = await buildLib();
  const { fx, pkg, argv } = packageFixture();
  const result = runDispatchBriefing(argv, depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.schema, "pipeline.dispatch-briefing.build.v1");
  assert.equal(result.dispatchId, "ALF-T1");
  assert.equal(result.path, null);
  assert.equal(result.sha256, sha(Buffer.from(result.text)));
  const parsed = parseNativeGoldfishBriefing(result.text);
  assert.equal(parsed.ok, true, parsed.code);
  assert.equal(parsed.binding.dispatchId, "ALF-T1");
  assert.deepEqual(parsed.binding.allowedPaths, [CHECK, PATH_A].sort());
  assert.equal(result.text.split(NATIVE_GOLDFISH_HOST_DIRECTIVE).length, 2);
  for (const heading of ["### 1. Goal", "### 2. Context files", "### 3. DoD checks", "### 4. Forbidden", "### 5. Stop conditions", "### 6. Dispatch metadata"]) {
    assert.equal(result.text.split(heading).length, 2, heading);
  }
  for (const text of [pkg.title, pkg.goal, ...pkg.context, ...pkg.targeted, ...pkg.forbidden, ...pkg.stops, pkg.modelWhy]) {
    assert.ok(result.text.includes(text), text);
  }
  assert.ok(result.text.includes("Calibration file: `project/pipeline.json` (project `fixture-project`, handover `docs/state.md`)"));
  assert.ok(result.text.includes("`node verify.mjs`; not yours to run"));
  assert.doesNotMatch(result.text, /\{\{[A-Z_]+\}\}/u);
  assert.deepEqual(verifyGeneratedBriefing(result.text), { ok: true, code: "DBG-GENERATED-VERIFIED" });
});

test("a one-byte edit or a removed marker fails the generated-briefing verification", async () => {
  const { runDispatchBriefing } = await lib();
  const { verifyGeneratedBriefing } = await buildLib();
  const { fx, argv } = packageFixture();
  const { text } = runDispatchBriefing(argv, depsOf(fx));
  const edited = text.replace("Fixture goal text.", "Fixture goal text!");
  assert.notEqual(edited, text);
  assert.equal(verifyGeneratedBriefing(edited).code, "DBG-GENERATED-DIGEST-MISMATCH");
  const unmarked = text.split("\n").filter((line) => !line.startsWith("<!-- pipeline-briefing-generator:")).join("\n");
  assert.equal(verifyGeneratedBriefing(unmarked).code, "DBG-GENERATED-MARKER-MISSING");
  assert.equal(verifyGeneratedBriefing(`${text}${text}`).code, "DBG-GENERATED-MARKER-MISSING");
});

test("build refuses a named path that does not exist unless the package declares it new", async () => {
  const { runDispatchBriefing } = await lib();
  const missing = packageFixture({ paths: [PATH_A, "plugins/x/new.mjs"] });
  const refused = runDispatchBriefing(missing.argv, depsOf(missing.fx));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "DBG-PACKAGE-PATH-MISSING");
  assert.match(refused.message, /plugins\/x\/new\.mjs.*repair: /u);
  const declared = packageFixture({ paths: [PATH_A, "plugins/x/new.mjs"], newFiles: ["plugins/x/new.mjs"] });
  assert.equal(runDispatchBriefing(declared.argv, depsOf(declared.fx)).ok, true);
});

// PF-68 (PO decision 2026-10-29): newFiles declares what the dispatch creates, so those files are writable.
test("build adds every newFiles entry to the write scope, once, whether or not paths names it too", async () => {
  const { runDispatchBriefing } = await lib();
  const onlyNew = packageFixture({ newFiles: ["plugins/x/generated.mjs"] });
  const built = runDispatchBriefing(onlyNew.argv, depsOf(onlyNew.fx));
  assert.equal(built.ok, true, JSON.stringify(built));
  const scope = parseNativeGoldfishBriefing(built.text).binding.allowedPaths;
  assert.deepEqual(scope, [CHECK, PATH_A, "plugins/x/generated.mjs"].sort());
  assert.ok(built.text.includes("`plugins/x/generated.mjs`"), "the briefing scope line names the new file");
  const both = packageFixture({ paths: [PATH_A, "plugins/x/new.mjs"], newFiles: ["plugins/x/new.mjs"] });
  const builtBoth = runDispatchBriefing(both.argv, depsOf(both.fx));
  assert.deepEqual(parseNativeGoldfishBriefing(builtBoth.text).binding.allowedPaths, [CHECK, PATH_A, "plugins/x/new.mjs"].sort());
  const invalid = packageFixture({ newFiles: ["../outside.mjs"] });
  assert.equal(runDispatchBriefing(invalid.argv, depsOf(invalid.fx)).code, "DBG-PATH-INVALID");
});

test("build refuses an unknown package key and a missing required field, each naming its repair", async () => {
  const { runDispatchBriefing } = await lib();
  const unknown = packageFixture({ cluster: "K13" });
  const refusedKey = runDispatchBriefing(unknown.argv, depsOf(unknown.fx));
  assert.equal(refusedKey.code, "DBG-PACKAGE-KEY-UNKNOWN");
  assert.match(refusedKey.message, /cluster.*repair: /u);
  const noGoal = packageFixture({ goal: undefined });
  const refusedField = runDispatchBriefing(noGoal.argv, depsOf(noGoal.fx));
  assert.equal(refusedField.code, "DBG-PACKAGE-FIELD-MISSING");
  assert.match(refusedField.message, /"goal".*repair: /u);
});

test("first dispatch: a successful build prints the Agent call (tier, model family, briefing source) it expects", async () => {
  const { runDispatchBriefing } = await lib();
  const ok = packageFixture({});
  const built = runDispatchBriefing(ok.argv, depsOf(ok.fx));
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.equal(built.dispatchCall.tool, "Agent");
  assert.match(built.dispatchCall.subagent_type, /^pipeline-core:goldfish-(implementor|deep|mechanic)$/u);
  assert.ok(["opus", "sonnet", "haiku", "fable"].includes(built.dispatchCall.model), JSON.stringify(built.dispatchCall));
  assert.match(built.dispatchCall.prompt, /verbatim/u);
});

test("first dispatch: build reports every field problem of the package in one answer, the first code kept", async () => {
  const { runDispatchBriefing } = await lib();
  const bad = packageFixture({ goal: undefined, estimatedToolCalls: 0, facts: "a string" });
  const refused = runDispatchBriefing(bad.argv, depsOf(bad.fx));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "DBG-PACKAGE-FIELD-MISSING");
  assert.match(refused.message, /3 field problems/u);
  for (const field of ["goal", "facts", "estimatedToolCalls"]) assert.match(refused.message, new RegExp(`"${field}".*repair: `, "u"), field);
});

test("build refuses a repository without a calibration and names how to calibrate", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture({}, { calibration: false });
  const result = runDispatchBriefing(argv, depsOf(fx));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DBG-PACKAGE-CALIBRATION-UNRESOLVED");
  assert.match(result.message, /repair: run the Pipeline onboarding/u);
});

test("build --out writes the verified briefing under scratch/ and refuses any other target", async () => {
  const { runDispatchBriefing } = await lib();
  const { verifyGeneratedBriefing } = await buildLib();
  const { fx, argv } = packageFixture();
  const result = runDispatchBriefing([...argv, "--out", "scratch/briefing-ALF-T1.md"], depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.path, "scratch/briefing-ALF-T1.md");
  assert.equal(result.text, undefined);
  const written = readFileSync(join(fx.root, "scratch/briefing-ALF-T1.md"), "utf8");
  assert.equal(sha(Buffer.from(written)), result.sha256);
  assert.equal(verifyGeneratedBriefing(written).ok, true);
  const outside = runDispatchBriefing([...argv, "--out", "docs/briefing.md"], depsOf(fx));
  assert.equal(outside.code, "DBG-PATH-INVALID");
});

test("build --out also prints the D183 pointer prompt: the marker line plus a file pointer whose digest is the digest of the whole file", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const withFile = runDispatchBriefing([...argv, "--out", "scratch/briefing-ALF-T1.md"], depsOf(fx));
  assert.equal(withFile.ok, true, JSON.stringify(withFile));
  const written = readFileSync(join(fx.root, "scratch/briefing-ALF-T1.md"), "utf8");
  const marker = written.split("\n").find((line) => line.startsWith("<!-- pipeline-briefing-generator:v1 sha256="));
  assert.equal(withFile.dispatchCall.promptPointer, `${marker}\npipeline-briefing-file: scratch/briefing-ALF-T1.md sha256=${withFile.sha256}\n`);
  assert.match(withFile.dispatchCall.prompt, /verbatim/u, "the full-text route stays for every non-pointer carrier");
  const inline = runDispatchBriefing(argv, depsOf(fx));
  assert.equal(inline.dispatchCall.promptPointer, undefined, "without --out there is no file to point at");
});

test("the generated briefing prescribes the test-first order in one dispatch (AC-186, PO 2026-10-21)", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const { text } = runDispatchBriefing(argv, depsOf(fx));
  const first = text.indexOf("record them RED against the original code, before your first production edit");
  const second = text.indexOf("2. Implement.");
  const third = text.indexOf("3. Run exactly those cases GREEN");
  assert.ok(first > 0 && first < second && second < third, "the three steps appear in order");
  assert.match(text, /never from the code you are about to write/u);
  assert.match(text, /changed after step 2 only with a written justification/u);
  assert.doesNotMatch(text, /separate test-author dispatch/u);
});

test("PF-100 the generated briefing names the readable copy of the obligations file when the project has none at its root", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const { text } = runDispatchBriefing(argv, depsOf(fx));
  const line = text.split("\n").find((l) => l.startsWith("Read `templates/prompts/agent-obligations.md`")) ?? "";
  assert.match(line, /at the repository root first/u);
  assert.match(line, /\$\{PIPELINE_PLUGIN_ROOT\}\/templates\/prompts\/agent-obligations\.md/u);
  assert.match(line, /follow it: it carries the closed shell grammar/u);
});

// AC-187 (item goldfish-test-briefs-lack-targeted-and-quick-command-routes): the emitted briefing carries the three
// check routes in the order targeted -> quick -> final Verify, never invents a quick command, and leaves the final
// Verify to the Coordinator. The template wording is pinned in lib/pins/goldfish-test-briefs-lack-targeted-and-quick-command-routes.test.mjs;
// this case pins what the generator actually emits.
function checkRouteProblems(text, { verifyCommand }) {
  const problems = [];
  const targeted = text.indexOf("- Targeted checks — Goldfish owner:");
  const quick = text.indexOf("- Quick check: ");
  const verify = text.indexOf("- Final integrated Verify");
  if (!(targeted >= 0 && targeted < quick && quick < verify)) problems.push("routes are not in the order targeted, quick, final Verify");
  const quickLine = text.split("\n").find((line) => line.startsWith("- Quick check: ")) ?? "";
  if (quickLine !== "- Quick check: missing — unknown, no quick PASS.") problems.push(`quick route is not the honest absent route: ${quickLine}`);
  if (/Quick check:[^\n]*`/u.test(text)) problems.push("a quick command was invented");
  const verifyLine = text.split("\n").find((line) => line.startsWith("- Final integrated Verify")) ?? "";
  if (verifyCommand === null) {
    if (!verifyLine.includes("this project calibrates no Verify command")) problems.push(`no-Verify route is not stated: ${verifyLine}`);
  } else if (!(verifyLine.includes("Coordinator owner") && verifyLine.includes(`\`${verifyCommand}\``) && verifyLine.includes("not yours to run"))) {
    problems.push(`final Verify is not Coordinator-owned: ${verifyLine}`);
  }
  return problems;
}

test("the generated briefing carries the targeted, quick and final Verify routes in order and never invents a quick command (AC-187)", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, pkg, argv } = packageFixture({ targeted: [`\`node --test ${CHECK}\` (green)`, `\`node --test --test-name-pattern=first ${CHECK}\` (green)`] });
  const built = runDispatchBriefing(argv, depsOf(fx));
  assert.equal(built.ok, true, JSON.stringify(built));
  const { text } = built;
  assert.deepEqual(checkRouteProblems(text, { verifyCommand: "node verify.mjs" }), []);
  const block = text.slice(text.indexOf("- Targeted checks — Goldfish owner:"), text.indexOf("- Quick check: "));
  for (const command of pkg.targeted) assert.ok(block.includes(`  - ${command}`), `every targeted command is listed under the targeted route: ${command}`);
  assert.match(block, /Record each printed GREEN line with its counts\./u);
  // RED proof: the checker fails on a briefing whose routes are swapped, whose quick route is invented, and whose Verify is the worker's.
  const swapped = text.replace("- Quick check: missing — unknown, no quick PASS.\n", "").replace("- Targeted checks — Goldfish owner:", "- Quick check: missing — unknown, no quick PASS.\n- Targeted checks — Goldfish owner:");
  assert.ok(checkRouteProblems(swapped, { verifyCommand: "node verify.mjs" }).some((problem) => problem.includes("order")));
  const invented = text.replace("- Quick check: missing — unknown, no quick PASS.", "- Quick check: `npm run quick` PASS.");
  assert.ok(checkRouteProblems(invented, { verifyCommand: "node verify.mjs" }).length >= 2);
  const workerVerify = text.replace("; not yours to run", "");
  assert.ok(checkRouteProblems(workerVerify, { verifyCommand: "node verify.mjs" }).some((problem) => problem.includes("Coordinator")));
});

test("a project that calibrates no Verify command still gets targeted -> quick -> final Verify, with the absence stated (AC-187)", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  writeFileSync(join(fx.root, "project/pipeline.json"), JSON.stringify({ project: "fixture-project", handover: "docs/state.md", verify: null }));
  const result = runDispatchBriefing(argv, depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(checkRouteProblems(result.text, { verifyCommand: null }), []);
});

test("D193: an estimate above the tier cap is refused with the grant route named, never raised to the deep tier silently; a rationale plans the grant", async () => {
  const { runDispatchBriefing } = await lib();
  const base = packageFixture();
  const cap = budgetOf(runDispatchBriefing(argvOf(base.fx), depsOf(base.fx)).skeleton);
  const over = packageFixture({ estimatedToolCalls: cap + 1 });
  const overResult = runDispatchBriefing(over.argv, depsOf(over.fx));
  assert.equal(overResult.ok, false, JSON.stringify(overResult));
  assert.equal(overResult.code, "DBG-PACKAGE-BUDGET-EXCEEDED");
  assert.match(overResult.message, /the tier is not raised silently/u);
  assert.match(overResult.message, /budgetRationale/u);
  assert.match(overResult.message, /goldfish-deep/u);
  const planned = packageFixture({ estimatedToolCalls: cap + 1, budgetRationale: "one test-first cycle that needs a few calls more than the base cap" });
  const plannedResult = runDispatchBriefing(planned.argv, depsOf(planned.fx));
  assert.equal(plannedResult.ok, true, JSON.stringify(plannedResult));
  assert.notEqual(parseNativeGoldfishBriefing(plannedResult.text).binding.agentType, "goldfish-deep", "the tier stays the one the package named");
  assert.ok(!plannedResult.warnings.some((entry) => entry.code === "DBG-PACKAGE-TIER-RAISED"));
  assert.match(plannedResult.text, /Budget grant expected at the 80 % checkpoint: one test-first cycle/u);
  const tooMany = packageFixture({ estimatedToolCalls: 100000 });
  const refused = runDispatchBriefing(tooMany.argv, depsOf(tooMany.fx));
  assert.equal(refused.code, "DBG-PACKAGE-BUDGET-EXCEEDED");
  assert.match(refused.message, /repair: /u);
  const granted = packageFixture({ estimatedToolCalls: 100000, budgetRationale: "one test-first cycle over three modules" });
  const grantedResult = runDispatchBriefing(granted.argv, depsOf(granted.fx));
  assert.equal(grantedResult.ok, true, JSON.stringify(grantedResult));
  assert.match(grantedResult.text, /Budget grant expected at the 80 % checkpoint: one test-first cycle over three modules/u);
});

test("an Evidence cell without a backlog item names the repair", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const rel = "specs/feat-x/spec-noitem.md";
  writeFileSync(join(fx.root, rel), [
    "# Fixture spec without an item in the Evidence cell",
    "",
    "## Acceptance criteria",
    "",
    "| # | Criterion | Evidence |",
    "| --- | --- | --- |",
    "| AC-9 | Original Alfred item sample-slug is delivered as its own original acceptance states, on the integrated candidate | evidence/private.json |",
    "",
  ].join("\n"));
  const result = runDispatchBriefing(argvOf(fx, { "--spec": rel }), depsOf(fx));
  assert.equal(result.code, "DBG-ITEM-EVIDENCE-MISSING");
  assert.match(result.message, /repair: /u);
});

test("the dispatch admission (D78) admits a generated briefing and refuses an edited or hand-assembled item briefing", async () => {
  const { runDispatchBriefing } = await lib();
  const { generatedBriefingAdmission } = await buildLib();
  const { fx, argv } = packageFixture();
  const { text } = runDispatchBriefing(argv, depsOf(fx));
  assert.equal(generatedBriefingAdmission(text), null);
  const edited = generatedBriefingAdmission(text.replace("Fixture goal text.", "Fixture goal text!"), "node gen.mjs");
  assert.equal(edited.code, "DBG-GENERATED-DIGEST-MISMATCH");
  assert.match(edited.message, /repair: .*node gen\.mjs build --package/u);
  const skeleton = runDispatchBriefing(argvOf(fx), depsOf(fx)).skeleton;
  assert.equal(parseNativeGoldfishBriefing(skeleton).ok, true);
  assert.equal(generatedBriefingAdmission(skeleton).code, "DBG-GENERATED-BRIEFING-REQUIRED");
  assert.equal(generatedBriefingAdmission("A plain research prompt with no binding."), null);
});

test("a fresh fix wave uses an existing accepted criterion and a missing original row names that route", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const missing = runDispatchBriefing(argvOf(fx, { "--item": "fresh-fix-wave" }), depsOf(fx));
  assert.equal(missing.code, "DBG-AC-ROW-MISSING");
  assert.match(missing.message, /--criterion AC-<n>/u);
  const bound = runDispatchBriefing(argvOf(fx, { "--item": "fresh-fix-wave" }, ["--criterion", "AC-1"]), depsOf(fx));
  assert.equal(bound.ok, true, JSON.stringify(bound));
  assert.equal(bound.binding.itemDelivery.criterionLocator.criterionId, "AC-1");
  assert.equal(bound.binding.itemDelivery.itemId, "feat-x.fresh-fix-wave");
});

test("writable dispatch carrier and generated briefing admission retain a read-only research route", async () => {
  const { writeCapableCarrierAdmission } = await import("../hooks/guard-dispatch.mjs");
  const { generatedBriefingAdmission } = await buildLib();
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const text = runDispatchBriefing(argv, depsOf(fx)).text;
  assert.equal(writeCapableCarrierAdmission({ subagentType: "pipeline-core:goldfish-deep", transport: "direct", prompt: text }), null);
  assert.equal(generatedBriefingAdmission(text), null);
  assert.equal(writeCapableCarrierAdmission({ subagentType: "worker", transport: "codex", prompt: "write the fix" }).code, "DISPATCH-WRITE-CARRIER-REQUIRED");
  assert.equal(writeCapableCarrierAdmission({ subagentType: "explorer", transport: "codex", prompt: "inspect the code" }), null);
  assert.equal(writeCapableCarrierAdmission({ subagentType: "Explore", transport: "direct", prompt: "inspect the code" }), null);
  assert.equal(writeCapableCarrierAdmission({ subagentType: "consult-advisor", transport: "antigravity", prompt: "input.txt" }), null);
  assert.equal(writeCapableCarrierAdmission({ subagentType: "customer-researcher", transport: "antigravity", prompt: "input.txt" }).code, "DISPATCH-WRITE-CARRIER-REQUIRED");
  assert.equal(writeCapableCarrierAdmission({ subagentType: "pipeline-core:critic", transport: "direct", prompt: "review the diff" }), null);
  const skeleton = runDispatchBriefing(argvOf(fx), depsOf(fx)).skeleton;
  assert.equal(generatedBriefingAdmission(skeleton).code, "DBG-GENERATED-BRIEFING-REQUIRED");
  assert.equal(generatedBriefingAdmission("A hand-written Goldfish briefing.", "node gen.mjs", { requireGenerated: true }).code, "DBG-GENERATED-BRIEFING-REQUIRED");
  const emptyBindingBody = "A hand-written Goldfish briefing.\n";
  const markedWithoutBinding = `${emptyBindingBody}<!-- pipeline-briefing-generator:v1 sha256=${sha(emptyBindingBody)} -->\n`;
  assert.equal(generatedBriefingAdmission(markedWithoutBinding, "node gen.mjs", { requireGenerated: true }).code, "DBG-GENERATED-BINDING-REQUIRED");
});

test("init-dispatch-record prints a valid opening v4 record whose digests come from the generated briefing (AC-163)", async () => {
  const { runDispatchBriefing } = await lib();
  const { runInitDispatchRecord } = await import("./init-dispatch-record.mjs");
  const { validateDispatchRecord } = await import("../lib/dispatch-record.mjs");
  const { fx, argv } = packageFixture();
  const built = runDispatchBriefing([...argv, "--out", "scratch/briefing-ALF-T1.md"], depsOf(fx));
  assert.equal(built.ok, true, JSON.stringify(built));
  const result = runInitDispatchRecord(["--root", fx.root, "--briefing", "scratch/briefing-ALF-T1.md"]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.path, "evidence/dispatch-record-ALF-T1.json");
  const { binding } = parseNativeGoldfishBriefing(readFileSync(join(fx.root, "scratch/briefing-ALF-T1.md"), "utf8"));
  const r = result.record;
  assert.deepEqual([r.taskId, r.agentType, r.model, r.effort, r.rulesetSha, r.candidateCommit],
    [binding.dispatchId, binding.agentType, binding.model, binding.effort, binding.rulesetSha, binding.candidateCommit]);
  assert.equal(r.candidateCommit, COMMIT);
  assert.equal(r.rulesetSha, RULESET);
  assert.equal(r.outcome, "in-progress");
  assert.deepEqual([r.commits, r.log, r.report, r.resultSha256], [[], [], null, null]);
  assert.doesNotThrow(() => validateDispatchRecord(r));
  const missing = runInitDispatchRecord(["--root", fx.root, "--briefing", "scratch/none.md"]);
  assert.equal(missing.code, "IDR-BRIEFING-UNREADABLE");
  assert.match(missing.message, /repair: /u);
});

// --- D76: the binding admits a write scope only when it is disjoint from every running dispatch ---

const PATH_B = "plugins/x/other.mjs";
const running = (over = {}) => ({ dispatchId: "ALF-RUN", writeScope: [PATH_B, "plugins/x/other.test.mjs"], verdict: "alive", ...over });

test("D76 a write scope that overlaps a running dispatch is refused DBG-SCOPE-OVERLAP, naming the dispatch, the overlap and the repair", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { runningDispatches: () => [running({ writeScope: [PATH_A, PATH_B] })] }));
  assert.equal(result.ok, false, JSON.stringify(result).slice(0, 300));
  assert.equal(result.code, "DBG-SCOPE-OVERLAP", result.message);
  assert.ok(result.message.includes("ALF-RUN"), "names the running dispatch");
  assert.ok(result.message.includes(PATH_A), "names the overlapping path");
  assert.match(result.message, /repair, one of: /u);
  assert.match(result.message, /disjoint/u);
  assert.match(result.message, /worktree/u);
  assert.equal(result.skeleton, undefined);
});

test("D76 a glob in the running dispatch's scope overlaps a literal path of this one", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { runningDispatches: () => [running({ writeScope: ["plugins/x/**"] })] }));
  assert.equal(result.code, "DBG-SCOPE-OVERLAP", JSON.stringify(result).slice(0, 300));
  assert.ok(result.message.includes("plugins/x/**"));
});

test("D76 a disjoint scope is admitted, and so is a call with no running dispatch or only its own earlier record", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  assert.equal(runDispatchBriefing(argvOf(fx), depsOf(fx, { runningDispatches: () => [running()] })).ok, true, "disjoint");
  assert.equal(runDispatchBriefing(argvOf(fx), depsOf(fx, { runningDispatches: () => [] })).ok, true, "none running");
  const own = running({ dispatchId: "ALF-T1", writeScope: [PATH_A, CHECK] });
  assert.equal(runDispatchBriefing(argvOf(fx), depsOf(fx, { runningDispatches: () => [own] })).ok, true, "a rebind is not held against itself");
});

test("D76 a running dispatch whose scope cannot be read never blocks and is announced as a warning", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { runningDispatches: () => [running({ writeScope: null, verdict: "unjudgeable" })] }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const warning = result.warnings.find((entry) => entry.code === "DBG-RUNNING-SCOPE-UNKNOWN");
  assert.ok(warning, JSON.stringify(result.warnings));
  assert.ok(warning.message.includes("ALF-RUN"));
});

test("D76 the default reader finds a running dispatch from its open record and its generated briefing, and ignores a finished one", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  const init = spawnSync("git", ["-C", fx.root, "init", "-q"], { encoding: "utf8", env });
  assert.equal(init.status, 0, init.stderr);
  const other = runDispatchBriefing(argvOf(fx, { "--dispatch-id": "ALF-RUN", "--check": "plugins/x/other.test.mjs", "--path": PATH_A }), depsOf(fx));
  assert.equal(other.ok, true, JSON.stringify(other));
  mkdirSync(join(fx.root, "scratch"), { recursive: true });
  mkdirSync(join(fx.root, "evidence"), { recursive: true });
  writeFileSync(join(fx.root, "scratch", "briefing-ALF-RUN.md"), other.skeleton);
  const record = join(fx.root, "evidence", "dispatch-record-ALF-RUN.json");
  writeFileSync(record, JSON.stringify({ taskId: "ALF-RUN", outcome: "in-progress" }));
  const deps = depsOf(fx);
  delete deps.queueRow;
  const refused = runDispatchBriefing(argvOf(fx), deps);
  assert.equal(refused.code, "DBG-SCOPE-OVERLAP", JSON.stringify(refused).slice(0, 300));
  assert.ok(refused.message.includes("ALF-RUN") && refused.message.includes(PATH_A));
  writeFileSync(record, JSON.stringify({ taskId: "ALF-RUN", outcome: "succeeded" }));
  assert.equal(runDispatchBriefing(argvOf(fx), deps).ok, true, "a terminal record is not a running dispatch");
});

// --- D75 (A): a re-dispatch after a wrong-premise stop needs a recon reference ---

const SLICE_ITEM = "pipeline.sample-slug";
const RECON_REL = "scratch/recon-ALF-T1.md";
const cancelledRow = (cancelClass, over = {}) => ({
  id: "ALF-T0", state: "cancelled", cancelClass, writeScope: [PATH_A, CHECK], delivery: { itemId: SLICE_ITEM }, ...over,
});
const withRows = (fx, rows, over = {}) => depsOf(fx, { queueRows: () => rows, ...over });
const putFile = (fx, rel, text) => {
  mkdirSync(dirname(join(fx.root, rel)), { recursive: true });
  writeFileSync(join(fx.root, rel), text);
};

test("D75 A a re-dispatch of a slice whose earlier attempt was cancelled wrong-premise is refused DBG-RECON-REQUIRED without a recon note, naming the slice, the attempt and the repair", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), withRows(fx, [cancelledRow("wrong-premise")]));
  assert.equal(result.ok, false, JSON.stringify(result).slice(0, 300));
  assert.equal(result.code, "DBG-RECON-REQUIRED", result.message);
  assert.ok(result.message.includes("ALF-T1"), "names the slice being re-dispatched");
  assert.ok(result.message.includes("ALF-T0"), "names the earlier cancelled attempt");
  assert.ok(result.message.includes("wrong-premise"), "names the stop class");
  assert.match(result.message, /repair: write a recon note/u);
  assert.ok(result.message.includes("reconNote"), "names the package field");
  assert.match(result.message, /regenerate/u);
  assert.equal(result.skeleton, undefined);
});

test("D75 A an existing, non-empty recon note admits the re-dispatch and changes nothing else in the binding", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  putFile(fx, RECON_REL, "Earlier attempt assumed X; the code shows Y.\n");
  const plain = runDispatchBriefing(argvOf(fx), depsOf(fx));
  const noted = runDispatchBriefing(argvOf(fx, {}, ["--recon-note", RECON_REL]), withRows(fx, [cancelledRow("wrong-premise")]));
  assert.equal(noted.ok, true, JSON.stringify(noted).slice(0, 300));
  assert.equal(noted.skeleton, plain.skeleton, "the binding output carries nothing new");
  assert.deepEqual(noted.warnings, plain.warnings);
});

test("D75 A a recon note that does not exist, is empty or sits outside scratch/ and specs/ is refused", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const rows = [cancelledRow("wrong-premise")];
  const missing = runDispatchBriefing(argvOf(fx, {}, ["--recon-note", RECON_REL]), withRows(fx, rows));
  assert.equal(missing.code, "DBG-RECON-REQUIRED", JSON.stringify(missing).slice(0, 300));
  assert.ok(missing.message.includes(RECON_REL), "names the unusable path");
  assert.match(missing.message, /repair: /u);
  putFile(fx, RECON_REL, "  \n");
  const blank = runDispatchBriefing(argvOf(fx, {}, ["--recon-note", RECON_REL]), withRows(fx, rows));
  assert.equal(blank.code, "DBG-RECON-REQUIRED", JSON.stringify(blank).slice(0, 300));
  putFile(fx, "docs/recon.md", "A real note in the wrong place.\n");
  const elsewhere = runDispatchBriefing(argvOf(fx, {}, ["--recon-note", "docs/recon.md"]), withRows(fx, rows));
  assert.equal(elsewhere.code, "DBG-PATH-INVALID", JSON.stringify(elsewhere).slice(0, 300));
  assert.ok(elsewhere.message.includes("scratch/") && elsewhere.message.includes("specs/"));
});

test("D75 A the other cancel classes, an unclassified cancel, another item and a live row do not require a recon note", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  for (const cancelClass of ["budget", "review-defect", "integrated-elsewhere", "superseded", "unclassified"]) {
    assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, [cancelledRow(cancelClass)])).ok, true, cancelClass);
  }
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, [cancelledRow("wrong-premise", { delivery: { itemId: "other.item" } })])).ok, true, "another item's stop");
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, [cancelledRow("wrong-premise", { state: "ready", cancelClass: null })])).ok, true, "a row that is not cancelled");
});

test("D75 A a repository without a slice queue is unchanged, with the injected reader and with the default reader", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, [])).ok, true, "empty queue");
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, null)).ok, true, "unreadable queue");
  assert.equal(runDispatchBriefing(argvOf(fx), depsOf(fx)).ok, true, "default reader on a fixture without a governed queue");
});

test("D75 A the package field reconNote is optional and closed: a string path under scratch/ or specs/ that exists", async () => {
  const { runDispatchBriefing } = await lib();
  const { validateBriefingPackage } = await buildLib();
  const base = packageFixture().pkg;
  assert.doesNotThrow(() => validateBriefingPackage(base), "absent is valid");
  assert.doesNotThrow(() => validateBriefingPackage({ ...base, reconNote: RECON_REL }));
  for (const bad of [42, "", "docs/recon.md", "/etc/passwd", "scratch/../x.md", "scratch\\recon.md"]) {
    assert.throws(() => validateBriefingPackage({ ...base, reconNote: bad }), (error) => error.code === "DBG-PACKAGE-FIELD-TYPE" && /reconNote/u.test(error.message) && /repair: /u.test(error.message), JSON.stringify(bad));
  }
  const absent = packageFixture({ reconNote: RECON_REL });
  const refused = runDispatchBriefing(absent.argv, depsOf(absent.fx));
  assert.equal(refused.code, "DBG-PACKAGE-PATH-MISSING", JSON.stringify(refused).slice(0, 300));
  assert.ok(refused.message.includes(RECON_REL));
});

test("D75 A build: a wrong-premise earlier attempt makes the package field mandatory, and the recon note is then listed as a context file", async () => {
  const { runDispatchBriefing } = await lib();
  const { verifyGeneratedBriefing } = await buildLib();
  const rows = [cancelledRow("wrong-premise")];
  const bare = packageFixture();
  const refused = runDispatchBriefing(bare.argv, withRows(bare.fx, rows));
  assert.equal(refused.code, "DBG-RECON-REQUIRED", JSON.stringify(refused).slice(0, 300));
  assert.match(refused.message, /"reconNote"/u);
  const noted = packageFixture({ reconNote: RECON_REL });
  putFile(noted.fx, RECON_REL, "Earlier attempt assumed X; the code shows Y.\n");
  const result = runDispatchBriefing(noted.argv, withRows(noted.fx, rows));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const context = result.text.split("### 2. Context files")[1].split("### 3. DoD checks")[0];
  assert.ok(context.includes(RECON_REL), "the recon note is a context file");
  assert.match(context, /recon note/u);
  assert.deepEqual(verifyGeneratedBriefing(result.text), { ok: true, code: "DBG-GENERATED-VERIFIED" });
  const plain = packageFixture();
  const plainText = runDispatchBriefing(plain.argv, depsOf(plain.fx)).text;
  assert.doesNotMatch(plainText, /recon/iu, "a briefing without the field renders nothing new");
});

// --- K106 (D75 A amendment): the recon-note duty ends once a delivery of the SAME item exists ---
// Delivery is not a stored queue state (SLICE_STATES has no delivered/merged/closed value); the lib derives it:
// readyAndLive marks a slice "done" when its id is integrated (commit evidence or a native integration record, read by
// observeGovernedItemIntegrationReadiness). The generator therefore takes the integrated ids as one injectable reader.

const successorRow = (over = {}) => ({ id: "ALF-T2", state: "ready", writeScope: [PATH_A, CHECK], delivery: { itemId: SLICE_ITEM }, ...over });
const integrated = (...ids) => ({ integratedSliceIds: () => ids });

test("K106 a wrong-premise cancel plus a delivered successor row of the SAME item no longer requires a recon note, in either row order", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const plain = runDispatchBriefing(argvOf(fx), depsOf(fx));
  for (const rows of [[cancelledRow("wrong-premise"), successorRow()], [successorRow(), cancelledRow("wrong-premise")]]) {
    const result = runDispatchBriefing(argvOf(fx), withRows(fx, rows, integrated("ALF-T2")));
    assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
    assert.equal(result.skeleton, plain.skeleton, "the binding output carries nothing new");
  }
  const packaged = packageFixture();
  const built = runDispatchBriefing(packaged.argv, withRows(packaged.fx, [cancelledRow("wrong-premise"), successorRow()], integrated("ALF-T2")));
  assert.equal(built.ok, true, JSON.stringify(built).slice(0, 300));
});

test("K106 a successor row that is merely ready, held, deferred or blocked (not integrated) keeps the duty", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  for (const state of ["ready", "hold-po", "deferred", "blocked-external"]) {
    const result = runDispatchBriefing(argvOf(fx), withRows(fx, [cancelledRow("wrong-premise"), successorRow({ state })], integrated()));
    assert.equal(result.code, "DBG-RECON-REQUIRED", `${state}: ${JSON.stringify(result).slice(0, 200)}`);
  }
  assert.match(runDispatchBriefing(argvOf(fx), withRows(fx, [cancelledRow("wrong-premise")])).message, /ends once a slice of item pipeline\.sample-slug has been delivered/u, "the refusal says when the duty ends");
});

test("K106 a delivered row of a DIFFERENT item, an integrated id with no row, or an unreadable integration reader keeps the duty", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const rows = [cancelledRow("wrong-premise"), successorRow({ delivery: { itemId: "other.item" } })];
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, rows, integrated("ALF-T2"))).code, "DBG-RECON-REQUIRED", "other item");
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, [cancelledRow("wrong-premise")], integrated("ALF-T9"))).code, "DBG-RECON-REQUIRED", "no such row");
  const same = [cancelledRow("wrong-premise"), successorRow()];
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, same, { integratedSliceIds: () => null })).code, "DBG-RECON-REQUIRED", "unreadable (null)");
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, same, { integratedSliceIds: () => { throw new Error("git fault"); } })).code, "DBG-RECON-REQUIRED", "unreadable (throws)");
  assert.equal(runDispatchBriefing(argvOf(fx), withRows(fx, [cancelledRow("wrong-premise")], integrated("ALF-T0"))).code, "DBG-RECON-REQUIRED", "the wrong-premise row itself is not the delivery");
});

test("K106 pin: the queue lib has no stored delivered state and the derived delivery vocabulary is exactly done; a new state forces a decision here", async () => {
  const { SLICE_STATES, readyAndLive } = await import("../lib/slice-queue.mjs");
  assert.deepEqual([...SLICE_STATES], ["ready", "hold-po", "blocked-external", "deferred", "cancelled"], "a new stored state must be classified as delivered or not for the recon-note duty (K106)");
  const raw = {
    schema: "pipeline.slice-queue.v1", feature: "unit", defaults: { commitMode: "diff-only", tier: "implementor" }, monoliths: [],
    slices: ["A", "B"].map((id) => ({ id, title: id, state: "ready", dependsOn: [], writeScope: [`lib/${id}.mjs`], tier: "implementor", commitMode: "diff-only", loadClass: "light", briefing: { ref: `specs/unit/briefings/${id}.md` } })),
  };
  const result = readyAndLive({ queue: raw, terminalIds: ["A"], now: Date.parse("2026-10-05T12:00:00.000Z") }, { platform: "linux" });
  assert.deepEqual(Object.keys(result.counts), ["ready", "live", "done", "held", "blocked", "cancelled"], "a new derived status must be classified as delivered or not for the recon-note duty (K106)");
  assert.equal(result.slices.find((entry) => entry.id === "A").status, "done", "done is the one completed-delivery status");
  assert.notEqual(result.slices.find((entry) => entry.id === "B").status, "done");
});

// --- K142 (Greenfield finding G1): the model check is runner-aware, never removed ---

const codexRouteOf = async (taskRoute) => {
  const { registeredFunctionalTaskRoutes, functionalTaskRoutesForRunner } = await import("../lib/model-role-route-source.mjs");
  const scoped = functionalTaskRoutesForRunner(registeredFunctionalTaskRoutes(), "codex");
  assert.equal(scoped.ok, true, "the committed registry yields a Codex route source");
  return scoped.taskRoutes.find((entry) => entry.taskRoute === taskRoute);
};
const CODEX = ["--runner", "codex"];

test("K142 --runner codex is admitted and the model id is checked against the model the Codex route yields for the role", async () => {
  const { runDispatchBriefing } = await lib();
  const { resolveActiveRunner } = await import("./pipeline-start-preflight.mjs");
  const fx = makeFixture();
  const route = await codexRouteOf("duty.implement");
  assert.equal(route.selector.kind, "model-id", "the Codex implement route selects an exact model id");
  let seen = null;
  const result = runDispatchBriefing(argvOf(fx, { "--model-id": route.selector.value }, CODEX), depsOf(fx, { observePreflight: (arg) => { seen = arg; return availableObserver(); } }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  const b = result.binding;
  assert.equal(b.runner, "codex");
  assert.equal(b.model, route.selector.value);
  assert.equal(b.effort, route.effort, "the effort of a Codex dispatch is the Codex route's, not the Claude agent definition's");
  assert.equal(b.nativeAgentType, "worker", "the host's Codex-native briefing shape");
  assert.equal(b.role, "pipeline-core:goldfish-implementor");
  assert.equal(b.agentType, "goldfish-implementor", "the read-back binding carries the agent type the host derives from the role");
  const parsed = parseNativeGoldfishBriefing(result.skeleton);
  assert.equal(parsed.ok, true, parsed.code);
  assert.equal(parsed.binding.runner, "codex");
  assert.equal(parsed.binding.model, route.selector.value);
  assert.equal(result.skeleton.includes('"agentType"'), false, "the Codex block does not carry the Claude-only agentType key");
  assert.ok(result.skeleton.includes(`\`${route.selector.value}\``), "field 6 names the route model");
  assert.equal(resolveActiveRunner({ env: seen.env }), "codex", "the preflight observation is made as the requested runner");
  assert.equal(seen.cwd, fx.root);
});

test("K142 a Claude-family model under --runner codex is refused DBG-MODEL-FAMILY with a repair that names the route model and the flag", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const route = await codexRouteOf("duty.implement");
  const result = runDispatchBriefing(argvOf(fx, {}, CODEX), depsOf(fx));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DBG-MODEL-FAMILY", result.message);
  assert.ok(result.message.includes(route.selector.value), `names the model the route selected: ${result.message}`);
  assert.match(result.message, /repair:/u);
  assert.match(result.message, /--model-id /u);
  assert.match(result.message, /--runner/u);
  assert.equal(result.skeleton, undefined);
});

test("K142 a Codex route that is unavailable refuses typed with a repair, and a custom route source decides the expected model", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const entry = { taskRoute: "duty.implement", runner: "codex", role: "worker", effort: "high", state: "unavailable", selector: { kind: "model-id", value: "fixture-codex-model" } };
  const unavailable = runDispatchBriefing(argvOf(fx, { "--model-id": "fixture-codex-model" }, CODEX), depsOf(fx, { codexRoute: () => entry }));
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.code, "DBG-MODEL-ROUTE-UNAVAILABLE", unavailable.message);
  assert.match(unavailable.message, /repair:/u);
  assert.match(unavailable.message, /duty\.implement/u);
  const missing = runDispatchBriefing(argvOf(fx, { "--model-id": "fixture-codex-model" }, CODEX), depsOf(fx, { codexRoute: () => null }));
  assert.equal(missing.code, "DBG-MODEL-ROUTE-UNAVAILABLE", missing.message);
  const ok = runDispatchBriefing(argvOf(fx, { "--model-id": "fixture-codex-model" }, CODEX), depsOf(fx, { codexRoute: () => ({ ...entry, state: "default" }) }));
  assert.equal(ok.ok, true, JSON.stringify(ok).slice(0, 300));
  assert.equal(ok.binding.model, "fixture-codex-model");
  const other = runDispatchBriefing(argvOf(fx, { "--model-id": "gpt-other" }, CODEX), depsOf(fx, { codexRoute: () => ({ ...entry, state: "default" }) }));
  assert.equal(other.code, "DBG-MODEL-FAMILY", other.message);
  assert.ok(other.message.includes("fixture-codex-model"));
});

test("K142 each agent type maps to its own Codex duty route", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const asked = [];
  const deps = depsOf(fx, { codexRoute: (taskRoute) => { asked.push(taskRoute); return { taskRoute, runner: "codex", role: "worker", effort: "high", state: "default", selector: { kind: "model-id", value: "fixture-codex-model" } }; } });
  for (const type of ["goldfish-implementor", "goldfish-mechanic", "goldfish-deep"]) {
    const result = runDispatchBriefing(argvOf(fx, { "--agent-type": type, "--model-id": "fixture-codex-model" }, CODEX), deps);
    assert.equal(result.ok, true, `${type}: ${JSON.stringify(result).slice(0, 300)}`);
  }
  assert.deepEqual(asked, ["duty.implement", "duty.mechanic", "duty.deep"]);
});

test("K142 an unknown runner and a repeated runner flag are refused with a repair", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const unknown = runDispatchBriefing(argvOf(fx, {}, ["--runner", "gpt"]), depsOf(fx));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "DBG-RUNNER-UNKNOWN", unknown.message);
  assert.ok(unknown.message.includes("gpt"));
  assert.match(unknown.message, /repair:/u);
  assert.match(unknown.message, /claude/u);
  assert.match(unknown.message, /codex/u);
  const repeated = runDispatchBriefing(argvOf(fx, {}, [...CODEX, ...CODEX]), depsOf(fx));
  assert.equal(repeated.code, "DBG-FLAG-REPEATED", repeated.message);
  const valueless = runDispatchBriefing(argvOf(fx, {}, ["--runner"]), depsOf(fx));
  assert.equal(valueless.code, "DBG-FLAG-VALUE", valueless.message);
});

test("K142 the Claude default path is unchanged: no --runner and --runner claude yield the identical skeleton and the preflight is observed exactly as before", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const calls = [];
  const observe = (arg) => { calls.push(arg); return availableObserver(); };
  const plain = runDispatchBriefing(argvOf(fx), depsOf(fx, { observePreflight: observe }));
  const explicit = runDispatchBriefing(argvOf(fx, {}, ["--runner", "claude"]), depsOf(fx, { observePreflight: observe }));
  assert.equal(plain.ok, true); assert.equal(explicit.ok, true);
  assert.equal(explicit.skeleton, plain.skeleton);
  assert.equal(plain.binding.runner, "claude");
  assert.equal(Object.hasOwn(plain.binding, "nativeAgentType"), false);
  assert.deepEqual(calls, [{ cwd: fx.root }, { cwd: fx.root }], "the Claude observation passes no runner-specific input");
});

test("K142 the Claude family refusal names a repair and keeps naming the alias family", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx, { "--model-id": "claude-opus-5" }), depsOf(fx));
  assert.equal(result.code, "DBG-MODEL-FAMILY");
  assert.ok(result.message.includes("sonnet"), result.message);
  assert.match(result.message, /repair:/u);
  assert.match(result.message, /--model-id/u);
  assert.match(result.message, /--agent-type/u);
  assert.match(result.message, /--runner codex/u);
  assert.match(result.message, /MP-29/u, "the escalation route stays named: only the tool-layer model parameter selects the model");
});

test("K142 build: a package that names runner codex renders a Codex briefing that parses back and verifies (needs the package-key part of the protected diff)", async () => {
  const { runDispatchBriefing } = await lib();
  const { verifyGeneratedBriefing } = await buildLib();
  const route = await codexRouteOf("duty.implement");
  const { fx, argv } = packageFixture({ runner: "codex", modelId: route.selector.value });
  const result = runDispatchBriefing(argv, depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  const parsed = parseNativeGoldfishBriefing(result.text);
  assert.equal(parsed.ok, true, parsed.code);
  assert.equal(parsed.binding.runner, "codex");
  assert.equal(parsed.binding.model, route.selector.value);
  assert.deepEqual(verifyGeneratedBriefing(result.text), { ok: true, code: "DBG-GENERATED-VERIFIED" });
  const claude = packageFixture({ runner: "claude" });
  const claudeResult = runDispatchBriefing(claude.argv, depsOf(claude.fx));
  assert.equal(claudeResult.ok, true, JSON.stringify(claudeResult).slice(0, 300));
  assert.equal(parseNativeGoldfishBriefing(claudeResult.text).binding.runner, "claude");
});

// --- W2-R2 (backlog 2026-10-26-agent-frontmatter-effort-overrides-configured-route, AC-212): the run's effort is the configured route's ---

const claudeRouteOf = (effort, state = "default") => (taskRoute) => ({ taskRoute, runner: "claude", role: "worker", effort, state, selector: { kind: "alias", value: "sonnet" } });

test("W2-R2 the binding and field 6 record the effort the configured Claude route selects when the agent definition pins the same effort", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { claudeRoute: claudeRouteOf("medium") }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  assert.equal(result.binding.effort, "medium");
  assert.match(result.skeleton, /`claude-sonnet-5-5` \/ medium/u);
  assert.match(result.skeleton, /Claude route `duty\.implement`/u, "field 6 names the route the effort came from");
});

test("W2-R2 each agent type asks the Claude route of its own duty", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const asked = [];
  for (const [type, effort, modelId] of [["goldfish-implementor", "medium", "claude-sonnet-5-5"], ["goldfish-mechanic", "low", "claude-haiku-4-5"], ["goldfish-deep", "xhigh", "claude-sonnet-5-5"]]) {
    const result = runDispatchBriefing(argvOf(fx, { "--agent-type": type, "--model-id": modelId }), depsOf(fx, { claudeRoute: (route) => { asked.push(route); return claudeRouteOf(effort)(route); } }));
    assert.equal(result.ok, true, `${type}: ${JSON.stringify(result).slice(0, 300)}`);
  }
  assert.deepEqual(asked, ["duty.implement", "duty.mechanic", "duty.deep"]);
});

test("W2-R2 a frontmatter effort that contradicts the configured route is refused typed before launch, never run silently", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx, { "--agent-type": "goldfish-deep" }), depsOf(fx, { claudeRoute: claudeRouteOf("medium") }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DBG-EFFORT-ROUTE-CONTRADICTION", result.message);
  assert.equal(result.skeleton, undefined);
  assert.ok(result.message.includes("xhigh") && result.message.includes("medium") && result.message.includes("duty.deep"), result.message);
  assert.match(result.message, /repair:/u);
  assert.match(result.message, /--effort-escalation/u);
  assert.match(result.message, /MP-05/u);
  assert.match(result.message, /MP-07/u);
  assert.match(result.message, /MP-29/u, "the Claude Agent tool cannot pass an effort: the message says why the pin would win");
});

test("W2-R2 an explicit MP-05/MP-07 escalation admits the above-route effort, records the effort the run really gets and warns", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  for (const act of ["MP-05", "MP-07"]) {
    const result = runDispatchBriefing(argvOf(fx, { "--agent-type": "goldfish-deep" }, ["--effort-escalation", act]), depsOf(fx, { claudeRoute: claudeRouteOf("medium") }));
    assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
    assert.equal(result.binding.effort, "xhigh", "the binding states the effort the agent definition will really run");
    const warning = result.warnings.find((entry) => entry.code === "DBG-EFFORT-ESCALATION");
    assert.ok(warning, JSON.stringify(result.warnings));
    assert.ok(warning.message.includes(act) && warning.message.includes("medium") && warning.message.includes("xhigh"), warning.message);
  }
  const unknown = runDispatchBriefing(argvOf(fx, { "--agent-type": "goldfish-deep" }, ["--effort-escalation", "because"]), depsOf(fx, { claudeRoute: claudeRouteOf("medium") }));
  assert.equal(unknown.code, "DBG-EFFORT-ESCALATION-UNKNOWN", unknown.message);
  assert.match(unknown.message, /repair:/u);
});

test("W2-R2 an escalation flag where the route already equals the pin changes nothing, and a pin below the route contradicts it too", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const same = runDispatchBriefing(argvOf(fx, {}, ["--effort-escalation", "MP-05"]), depsOf(fx, { claudeRoute: claudeRouteOf("medium") }));
  assert.equal(same.ok, true);
  assert.equal(same.warnings.some((entry) => entry.code === "DBG-EFFORT-ESCALATION"), false);
  const lower = runDispatchBriefing(argvOf(fx, { "--agent-type": "goldfish-implementor" }), depsOf(fx, { claudeRoute: claudeRouteOf("high") }));
  assert.equal(lower.code, "DBG-EFFORT-ROUTE-CONTRADICTION");
});

// 2026-10-30: a package could not carry the escalation act, so a deep-tier package above the route effort had no generator route at all
// (the flag exists only on the direct binding). The package key reaches the same binding check: parity with the flag for every value.
test("a briefing package carries effortEscalation exactly like the flag: admitted with the same warning, unknown refused, absent contradicts", async () => {
  const { runDispatchBriefing } = await lib();
  const deep = { agentType: "goldfish-deep" };
  for (const act of ["MP-05", "MP-07"]) {
    const { fx, argv } = packageFixture({ ...deep, effortEscalation: act });
    const built = runDispatchBriefing(argv, depsOf(fx, { claudeRoute: claudeRouteOf("medium") }));
    assert.equal(built.ok, true, JSON.stringify(built).slice(0, 400));
    const parsed = parseNativeGoldfishBriefing(built.text);
    assert.equal(parsed.ok, true, parsed.code);
    assert.equal(parsed.binding.effort, "xhigh", "the binding records the effort the agent definition really runs");
    const warning = built.warnings.find((entry) => entry.code === "DBG-EFFORT-ESCALATION");
    assert.ok(warning && warning.message.includes(act), JSON.stringify(built.warnings));
    const flag = runDispatchBriefing(argvOf(fx, { "--agent-type": "goldfish-deep" }, ["--effort-escalation", act]), depsOf(fx, { claudeRoute: claudeRouteOf("medium") }));
    assert.equal(flag.binding.effort, parsed.binding.effort, `${act}: package and flag bind the same effort`);
    assert.equal(flag.warnings.find((entry) => entry.code === "DBG-EFFORT-ESCALATION").message, warning.message, `${act}: same warning`);
  }
  const unknown = packageFixture({ ...deep, effortEscalation: "because" });
  const refused = runDispatchBriefing(unknown.argv, depsOf(unknown.fx, { claudeRoute: claudeRouteOf("medium") }));
  assert.equal(refused.code, "DBG-EFFORT-ESCALATION-UNKNOWN", refused.message);
  assert.match(refused.message, /"effortEscalation"/u, "the repair names the package key");
  const empty = packageFixture({ ...deep, effortEscalation: "" });
  assert.equal(runDispatchBriefing(empty.argv, depsOf(empty.fx, { claudeRoute: claudeRouteOf("medium") })).code, "DBG-PACKAGE-FIELD-TYPE");
  const absent = packageFixture(deep);
  const contradiction = runDispatchBriefing(absent.argv, depsOf(absent.fx, { claudeRoute: claudeRouteOf("medium") }));
  assert.equal(contradiction.code, "DBG-EFFORT-ROUTE-CONTRADICTION");
  assert.match(contradiction.message, /"effortEscalation"/u, "the contradiction names the package key as a repair");
});

test("W2-R2 an unreadable Claude route is announced and the agent definition's effort stays the briefed one", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { claudeRoute: () => null }));
  assert.equal(result.ok, true);
  assert.equal(result.binding.effort, "medium");
  assert.ok(result.warnings.some((entry) => entry.code === "DBG-EFFORT-ROUTE-UNKNOWN"), JSON.stringify(result.warnings));
});

test("W2-R2 the default Claude route reader uses the registry route of the duty, and a Codex dispatch never reads the Claude route", async () => {
  const { runDispatchBriefing } = await lib();
  const { registeredFunctionalTaskRoutes, functionalTaskRoutesForRunner } = await import("../lib/model-role-route-source.mjs");
  const scoped = functionalTaskRoutesForRunner(registeredFunctionalTaskRoutes(), "claude");
  assert.equal(scoped.ok, true);
  const route = scoped.taskRoutes.find((entry) => entry.taskRoute === "duty.implement");
  const fx = makeFixture();
  const { claudeRoute: _unused, ...rest } = depsOf(fx);
  const result = runDispatchBriefing(argvOf(fx), rest);
  if (route.effort === "medium") { assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300)); assert.equal(result.binding.effort, "medium"); }
  else { assert.equal(result.code, "DBG-EFFORT-ROUTE-CONTRADICTION", result.message); assert.ok(result.message.includes(route.effort)); }
  const codex = runDispatchBriefing(argvOf(fx, { "--model-id": "fixture-codex-model" }, CODEX), depsOf(fx, { claudeRoute: () => { throw new Error("a Codex dispatch must not read the Claude route"); }, codexRoute: (taskRoute) => ({ taskRoute, runner: "codex", role: "worker", effort: "high", state: "default", selector: { kind: "model-id", value: "fixture-codex-model" } }) }));
  assert.equal(codex.ok, true, JSON.stringify(codex).slice(0, 300));
  assert.equal(codex.binding.effort, "high");
});

// --- PF-65 (consumer report 05, AC-142): coordinator facts and the orientation-heavy / low-estimate advisories ---

const pf65Paths = (count) => {
  const extra = Array.from({ length: count - 1 }, (_, index) => `plugins/x/pf65-${index}.mjs`);
  return { paths: [PATH_A, ...extra], newFiles: extra };
};
const pf65Codes = (result) => result.warnings.map((entry) => entry.code);

test("PF-65 a facts list of non-empty strings is accepted; a wrongly typed facts value is refused naming the repair", async () => {
  const { runDispatchBriefing } = await lib();
  const ok = packageFixture({ facts: ["The cap is 35 calls.", "Line 60 holds the help text."] });
  const accepted = runDispatchBriefing(ok.argv, depsOf(ok.fx));
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  for (const bad of ["a string", [""], [3]]) {
    const wrong = packageFixture({ facts: bad });
    const refused = runDispatchBriefing(wrong.argv, depsOf(wrong.fx));
    assert.equal(refused.ok, false, JSON.stringify(bad));
    assert.equal(refused.code, "DBG-PACKAGE-FIELD-TYPE", JSON.stringify(bad));
    assert.match(refused.message, /"facts".*repair: /u);
  }
});

test("PF-65 facts render as a list under the coordinator line inside section 1 after the goal; absent facts leave the text byte-identical", async () => {
  const { runDispatchBriefing } = await lib();
  const { verifyGeneratedBriefing } = await buildLib();
  const withFacts = packageFixture({ facts: ["First fact.", "Second fact."] });
  const built = runDispatchBriefing(withFacts.argv, depsOf(withFacts.fx));
  assert.equal(built.ok, true, JSON.stringify(built));
  const line = "Facts established by the coordinator (do not re-derive):";
  const goalAt = built.text.indexOf("Fixture goal text.");
  const lineAt = built.text.indexOf(line);
  const contextAt = built.text.indexOf("### 2. Context files");
  assert.ok(built.text.indexOf("### 1. Goal") < goalAt && goalAt < lineAt && lineAt < contextAt, "facts sit in section 1 after the goal");
  assert.ok(built.text.includes(`${line}\n\n- First fact.\n- Second fact.\n`));
  assert.deepEqual(verifyGeneratedBriefing(built.text), { ok: true, code: "DBG-GENERATED-VERIFIED" });
  const plain = packageFixture();
  const plainBuilt = runDispatchBriefing(plain.argv, depsOf(plain.fx));
  assert.equal(plainBuilt.text.includes(line), false);
  assert.ok(plainBuilt.text.includes("### 1. Goal\n\nFixture goal text.\n\n### 2. Context files"));
});

test("PF-65 more than 6 delivery paths without facts warn DBG-PACKAGE-ORIENTATION-HEAVY; facts or 6 or fewer paths do not", async () => {
  const { runDispatchBriefing } = await lib();
  const { ORIENTATION_PATH_BOUND } = await buildLib();
  assert.equal(ORIENTATION_PATH_BOUND, 6);
  const heavy = packageFixture({ ...pf65Paths(7), estimatedToolCalls: 29 });
  const result = runDispatchBriefing(heavy.argv, depsOf(heavy.fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  const warning = result.warnings.find((entry) => entry.code === "DBG-PACKAGE-ORIENTATION-HEAVY");
  assert.ok(warning, JSON.stringify(result.warnings));
  assert.match(warning.message, /7/u);
  assert.match(warning.message, /6/u);
  assert.match(warning.message, /"facts"/u);
  assert.match(warning.message, /split/u);
  const withFacts = packageFixture({ ...pf65Paths(7), estimatedToolCalls: 29, facts: ["A coordinator fact."] });
  assert.equal(pf65Codes(runDispatchBriefing(withFacts.argv, depsOf(withFacts.fx))).includes("DBG-PACKAGE-ORIENTATION-HEAVY"), false);
  const atBound = packageFixture({ ...pf65Paths(6), estimatedToolCalls: 26 });
  assert.equal(pf65Codes(runDispatchBriefing(atBound.argv, depsOf(atBound.fx))).includes("DBG-PACKAGE-ORIENTATION-HEAVY"), false);
});

test("PF-65 an estimate absent or below 8 + 3 x paths warns DBG-PACKAGE-ESTIMATE-LOW naming the floor; at or above it no warning", async () => {
  const { runDispatchBriefing } = await lib();
  const absent = packageFixture();
  const absentResult = runDispatchBriefing(absent.argv, depsOf(absent.fx));
  assert.equal(absentResult.ok, true, JSON.stringify(absentResult));
  const warning = absentResult.warnings.find((entry) => entry.code === "DBG-PACKAGE-ESTIMATE-LOW");
  assert.ok(warning, JSON.stringify(absentResult.warnings));
  assert.match(warning.message, /11/u);
  const low = packageFixture({ estimatedToolCalls: 10 });
  const lowResult = runDispatchBriefing(low.argv, depsOf(low.fx));
  assert.equal(lowResult.ok, true, JSON.stringify(lowResult));
  assert.ok(pf65Codes(lowResult).includes("DBG-PACKAGE-ESTIMATE-LOW"));
  const atFloor = packageFixture({ estimatedToolCalls: 11 });
  assert.equal(pf65Codes(runDispatchBriefing(atFloor.argv, depsOf(atFloor.fx))).includes("DBG-PACKAGE-ESTIMATE-LOW"), false);
  const wide = packageFixture({ ...pf65Paths(4), estimatedToolCalls: 19 });
  const wideResult = runDispatchBriefing(wide.argv, depsOf(wide.fx));
  assert.ok(pf65Codes(wideResult).includes("DBG-PACKAGE-ESTIMATE-LOW"));
  assert.match(wideResult.warnings.find((entry) => entry.code === "DBG-PACKAGE-ESTIMATE-LOW").message, /20/u);
  const wideOk = packageFixture({ ...pf65Paths(4), estimatedToolCalls: 20 });
  assert.equal(pf65Codes(runDispatchBriefing(wideOk.argv, depsOf(wideOk.fx))).includes("DBG-PACKAGE-ESTIMATE-LOW"), false);
});

// --- PF-61 reader: a persisted background-Goldfish stop-failure diagnostic is surfaced as a non-blocking warning ---

const STOP_SCHEMA = "pipeline.native-goldfish-host-stop-failure.v1";
const STOP_DIR = "agent-pipeline/run/native-goldfish-host-diagnostics";
const LEGACY_STOP_DIR = "agent-pipeline/run/native-goldfish-host-commit";
const stopFailure = (over = {}) => ({ schema: STOP_SCHEMA, dispatchId: "ALF-BG", toolUseId: "toolu_1", status: "refused", code: "NGHF-HANDBACK-INVALID", commit: COMMIT, observedAt: "2026-10-26T10:00:00.000Z", ...over });
const stopWarnings = (result) => result.warnings.filter((entry) => entry.code === "DBG-HOST-COMMIT-STOP-FAILURE");

test("PF-61 reader one persisted diagnostic yields exactly one warning naming dispatch, code and commit; the build still succeeds", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { stopFailures: () => [stopFailure()] }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const found = stopWarnings(result);
  assert.equal(found.length, 1, JSON.stringify(result.warnings));
  assert.equal(found[0].dispatchId, "ALF-BG");
  assert.ok(found[0].message.includes("ALF-BG"));
  assert.ok(found[0].message.includes("NGHF-HANDBACK-INVALID"));
  assert.ok(found[0].message.includes(COMMIT));
  assert.match(found[0].message, /commit it yourself with the Dispatch trailer, then rebuild/u);
});

test("PF-61 reader no diagnostic yields no stop-failure warning", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { stopFailures: () => [] }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.deepEqual(stopWarnings(result), []);
});

test("PF-61 reader a malformed or foreign-schema entry is ignored, and several valid ones are ordered by observedAt then dispatchId", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const entries = [
    stopFailure({ dispatchId: "ALF-B", observedAt: "2026-10-26T11:00:00.000Z" }),
    stopFailure({ dispatchId: "ALF-FOREIGN", schema: "pipeline.something-else.v1" }),
    stopFailure({ dispatchId: 7 }),
    stopFailure({ dispatchId: "ALF-NOCODE", code: undefined }),
    null,
    "text",
    stopFailure({ dispatchId: "ALF-A", observedAt: "2026-10-26T11:00:00.000Z" }),
    stopFailure({ dispatchId: "ALF-FIRST", observedAt: "2026-10-26T09:00:00.000Z" }),
  ];
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { stopFailures: () => entries }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.deepEqual(stopWarnings(result).map((entry) => entry.dispatchId), ["ALF-FIRST", "ALF-A", "ALF-B"]);
});

test("PF-61 reader the default reader lists real files of the run directory, ignores a symlink, and deletes nothing", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  const git = (...args) => {
    const r = spawnSync("git", ["-C", fx.root, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
      "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
  const real = { ...depsOf(fx) };
  delete real.git;
  const before = runDispatchBriefing(argvOf(fx), real);
  assert.equal(before.ok, true, JSON.stringify(before));
  assert.deepEqual(stopWarnings(before), [], "an absent run directory is no diagnostic");
  const dir = join(fx.root, ".git", STOP_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "stop-failure-aaa.json"), JSON.stringify(stopFailure({ dispatchId: "ALF-REAL" })));
  writeFileSync(join(dir, "stop-failure-bad.json"), "{not json");
  writeFileSync(join(dir, "other.json"), JSON.stringify(stopFailure({ dispatchId: "ALF-OTHERNAME" })));
  writeFileSync(join(fx.root, "elsewhere.json"), JSON.stringify(stopFailure({ dispatchId: "ALF-LINKED" })));
  symlinkSync(join(fx.root, "elsewhere.json"), join(dir, "stop-failure-link.json"));
  const result = runDispatchBriefing(argvOf(fx), real);
  assert.equal(result.ok, true, JSON.stringify(result));
  const found = stopWarnings(result);
  assert.deepEqual(found.map((entry) => entry.dispatchId), ["ALF-REAL"], JSON.stringify(result.warnings));
  assert.equal(found[0].path, `${STOP_DIR}/stop-failure-aaa.json`);
  assert.deepEqual(readdirSync(dir).sort(), ["other.json", "stop-failure-aaa.json", "stop-failure-bad.json", "stop-failure-link.json"]);
});

function realDepsIn(fx) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  const git = (...args) => {
    const r = spawnSync("git", ["-C", fx.root, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
      "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "-q"); git("add", "-A"); git("commit", "-q", "-m", "fixture");
  const real = { ...depsOf(fx) };
  delete real.git;
  return real;
}
const plantStop = (fx, rel, name, over) => {
  const dir = join(fx.root, ".git", rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(stopFailure(over)));
};

test("D180b PF-61 reader surfaces a record in the diagnostics directory", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const real = realDepsIn(fx);
  plantStop(fx, STOP_DIR, "stop-failure-new.json", { dispatchId: "ALF-NEWDIR" });
  const found = stopWarnings(runDispatchBriefing(argvOf(fx), real));
  assert.deepEqual(found.map((entry) => entry.dispatchId), ["ALF-NEWDIR"]);
  assert.equal(found[0].path, `${STOP_DIR}/stop-failure-new.json`);
});

test("D180b PF-61 reader still surfaces a record left in the legacy host-commit directory", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const real = realDepsIn(fx);
  plantStop(fx, LEGACY_STOP_DIR, "stop-failure-old.json", { dispatchId: "ALF-LEGACY" });
  const found = stopWarnings(runDispatchBriefing(argvOf(fx), real));
  assert.deepEqual(found.map((entry) => entry.dispatchId), ["ALF-LEGACY"]);
  assert.equal(found[0].path, `${LEGACY_STOP_DIR}/stop-failure-old.json`);
});

test("D180b PF-61 reader does not double-count the same file name present in both directories", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const real = realDepsIn(fx);
  plantStop(fx, STOP_DIR, "stop-failure-same.json", { dispatchId: "ALF-SAME" });
  plantStop(fx, LEGACY_STOP_DIR, "stop-failure-same.json", { dispatchId: "ALF-SAME" });
  const found = stopWarnings(runDispatchBriefing(argvOf(fx), real));
  assert.deepEqual(found.map((entry) => entry.dispatchId), ["ALF-SAME"], JSON.stringify(found));
});

// D195: a check may name a registered consumer Verify command id (additive form); the .test form is unchanged.
const REGISTERED = () => ({ baseline: [{ id: "make-check", command: "make check" }], areas: [{ id: "docs", paths: ["docs"], commands: [{ id: "docs-lint", command: "make docs" }] }] });
test("D195 command:<id> of a registered command builds the 4-key check; the calibration is a dependency and not a write path", async () => {
  const { runDispatchBriefing, assertBindingInvariants } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx, { "--check": "command:make-check" }), depsOf(fx, { readConsumerVerify: REGISTERED }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  const [check] = result.binding.itemDelivery.checks;
  assert.deepEqual(Object.keys(check).sort(), ["command", "dependencies", "id", "path"]);
  assert.equal(check.command, "make-check");
  assert.ok(check.dependencies.includes(check.path), "the calibration path is a dependency");
  assert.ok(!result.binding.allowedPaths.includes(check.path), "the calibration path is not writable by the Goldfish");
  assert.deepEqual(result.binding.allowedPaths, [PATH_A]);
  assert.ok(result.binding.allowedPaths.every((path) => check.dependencies.includes(path)), "every allowed path is a dependency");
  assert.doesNotThrow(() => assertBindingInvariants(result.binding));
  const area = runDispatchBriefing(argvOf(fx, { "--check": "command:docs-lint" }), depsOf(fx, { readConsumerVerify: REGISTERED }));
  assert.equal(area.ok, true, "a command registered under an area is registered too");
  const broken = structuredClone(result.binding);
  broken.allowedPaths = [...broken.allowedPaths, broken.itemDelivery.checks[0].path].sort();
  assert.throws(() => assertBindingInvariants(broken), (error) => error.code === "DBG-CHECK-COMMAND-PATH-WRITABLE");
});
test("D195 an unregistered command id is refused DBG-CHECK-COMMAND-UNKNOWN with a runnable repair naming verifyImpact.baseline", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx, { "--check": "command:absent-id" }), depsOf(fx, { readConsumerVerify: REGISTERED }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DBG-CHECK-COMMAND-UNKNOWN", result.message);
  assert.match(result.message, /absent-id/u);
  assert.match(result.message, /verifyImpact\.baseline/u);
  const bad = runDispatchBriefing(argvOf(fx, { "--check": "command:-bad id" }), depsOf(fx, { readConsumerVerify: REGISTERED }));
  assert.equal(bad.ok, false);
  assert.ok(["DBG-CHECK-COMMAND-UNKNOWN", "DBG-PATH-INVALID"].includes(bad.code), bad.code);
  const unreadable = runDispatchBriefing(argvOf(fx, { "--check": "command:make-check" }), depsOf(fx, { readConsumerVerify: () => { throw new Error("VEP-NO-CALIBRATION: no project calibration found."); } }));
  assert.equal(unreadable.code, "DBG-CHECK-COMMAND-UNKNOWN");
});
test("D195 the calibration cannot be named as a write path of a command check", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx, { "--check": "command:make-check" }, ["--path", "project/pipeline.json"]), depsOf(fx, { readConsumerVerify: REGISTERED, calibrationRelPath: () => "project/pipeline.json" }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DBG-CHECK-COMMAND-PATH-WRITABLE", result.message);
});
test("D195 the .test form is unchanged: 3 keys, the check is a write path, a non-test check is still refused", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx), depsOf(fx, { readConsumerVerify: () => { throw new Error("must not be read for the .test form"); } }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const [check] = result.binding.itemDelivery.checks;
  assert.deepEqual(Object.keys(check).sort(), ["dependencies", "id", "path"]);
  assert.equal(check.path, CHECK);
  assert.ok(result.binding.allowedPaths.includes(CHECK));
  const notTest = runDispatchBriefing(argvOf(fx, { "--check": PATH_A }), depsOf(fx));
  assert.equal(notTest.code, "DBG-CHECK-NOT-TEST");
});

test("D195 the package route admits check command:<id> to the same admission as the --check flag form", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture({ check: "command:make-check", targeted: ["`make check` (green)"] });
  const result = runDispatchBriefing(argv, depsOf(fx, { readConsumerVerify: REGISTERED }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  const parsed = parseNativeGoldfishBriefing(result.text);
  assert.equal(parsed.ok, true, parsed.code);
  const [check] = parsed.binding.itemDelivery.checks;
  assert.equal(check.command, "make-check");
  assert.deepEqual(parsed.binding.allowedPaths, [PATH_A]);
  const unknown = packageFixture({ check: "command:absent-id", targeted: ["`make check` (green)"] });
  const refused = runDispatchBriefing(unknown.argv, depsOf(unknown.fx, { readConsumerVerify: REGISTERED }));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "DBG-CHECK-COMMAND-UNKNOWN", refused.message);
});

// --- D196 (R1, R4): warn about a started unfinished owner of the same item; lint the estimate (warnings only, never a refusal) ---

const startedOwner = (over = {}) => ({ dispatchId: "ALF-T0", itemId: SLICE_ITEM, ...over });
const warningCodes = (result) => result.warnings.map((entry) => entry.code);

test("D196 R1: a started, unfinished slice of the same item warns DBG-CHECKPOINTED-OWNER with the grant-and-resume procedure; the build still succeeds with its dispatchCall", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const result = runDispatchBriefing(argv, depsOf(fx, { startedOwners: () => [startedOwner()] }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.dispatchCall, "the dispatchCall is still printed");
  const warning = result.warnings.find((entry) => entry.code === "DBG-CHECKPOINTED-OWNER");
  assert.ok(warning, JSON.stringify(result.warnings));
  assert.match(warning.message, /ALF-T0/u);
  assert.match(warning.message, /dispatch-budget-grant\.mjs --agent-id <the agent id of that run> --extra <1\.\.30> --reason/u);
  assert.match(warning.message, /SendMessage/u);
  assert.match(warning.message, /elephant-restart, owner-lost, context-poisoned or new-vertical-outcome/u);
  assert.match(warning.message, /slice-queue\.mjs cancel ALF-T0 --started --reason "<why>" --class budget/u);
  const binding = runDispatchBriefing(argvOf(fx), depsOf(fx, { startedOwners: () => [startedOwner()] }));
  assert.equal(binding.ok, true, JSON.stringify(binding));
  assert.ok(warningCodes(binding).includes("DBG-CHECKPOINTED-OWNER"), "the binding route warns too");
});

test("W7: settled pending states and stop-failure records of settled dispatches yield a typed preDispatch heal and one summary warning; build writes no file", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const before = directorySnapshot(fx.root);
  const settled = () => ({ settledCount: 3, leavingDispatchIds: ["ALF-BG"] });
  const stops = () => [stopFailure({ dispatchId: "ALF-BG" }), stopFailure({ dispatchId: "ALF-OPEN" })];
  const result = runDispatchBriefing(argv, depsOf(fx, { settledPending: settled, stopFailures: stops }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.equal(result.preDispatch.length, 1);
  const [step] = result.preDispatch;
  assert.equal(step.kind, "routine-repair");
  assert.equal(step.argv[0], "node");
  assert.match(step.argv[1], /scripts[\\/]routine-repair\.mjs$/u);
  assert.deepEqual(step.argv.slice(2, 5), ["run", "heal", "--root"]);
  assert.deepEqual(step.argv.slice(-2), ["--reason", "retire settled pending states before dispatch"]);
  assert.equal(step.why, "3 settled pending states, 1 stop-failure records");
  assert.deepEqual(stopWarnings(result).map((entry) => entry.dispatchId), ["ALF-OPEN"]);
  const summary = result.warnings.filter((entry) => entry.code === "DBG-SETTLED-PENDING-HEAL");
  assert.equal(summary.length, 1);
  assert.match(summary[0].message, /routine-repair\.mjs run heal/u);
  const binding = runDispatchBriefing(argvOf(fx), depsOf(fx, { settledPending: settled, stopFailures: stops }));
  assert.equal(binding.preDispatch?.length, 1, "the binding route reports it too");
  assert.deepEqual(directorySnapshot(fx.root), before);
});

test("W7: nothing settled and no leaving stop-failure record prints no preDispatch and keeps every stop-failure warning", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const result = runDispatchBriefing(argv, depsOf(fx, { settledPending: () => ({ settledCount: 0, leavingDispatchIds: [] }), stopFailures: () => [stopFailure()] }));
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.equal("preDispatch" in result, false);
  assert.equal(stopWarnings(result).length, 1);
  assert.ok(!warningCodes(result).includes("DBG-SETTLED-PENDING-HEAL"));
});

test("D196 R1: a started slice of another item, the same dispatch id, or no started slice gives no warning", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  for (const owners of [[startedOwner({ itemId: "other.item" })], [startedOwner({ dispatchId: "ALF-T1" })], []]) {
    const result = runDispatchBriefing(argv, depsOf(fx, { startedOwners: () => owners }));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(!warningCodes(result).includes("DBG-CHECKPOINTED-OWNER"), JSON.stringify(owners));
  }
});

test("D196 R1: a finished or cancelled slice of the same item gives no warning (queue rows carry no started state)", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const rows = [cancelledRow("budget"), cancelledRow("superseded", { id: "ALF-T9" })];
  const result = runDispatchBriefing(argv, withRows(fx, rows, { startedOwners: () => [] }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(!warningCodes(result).includes("DBG-CHECKPOINTED-OWNER"));
});

test("D196 R1: an unreadable started-owner reader never refuses the build", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const result = runDispatchBriefing(argv, depsOf(fx, { startedOwners: () => { throw new Error("unreadable"); } }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(!warningCodes(result).includes("DBG-CHECKPOINTED-OWNER"));
});

test("D205: a started slice of the same item with a known, disjoint write scope gives no DBG-CHECKPOINTED-OWNER; an overlapping or unknown scope keeps it", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx, argv } = packageFixture();
  const own = [PATH_A];
  const warns = (owner) => warningCodes(runDispatchBriefing(argv, depsOf(fx, { startedOwners: () => [owner] }))).includes("DBG-CHECKPOINTED-OWNER");
  assert.equal(warns(startedOwner({ writeScope: ["plugins/other/elsewhere.mjs", "plugins/other/elsewhere.test.mjs"] })), false, "disjoint scope: a parallel slice, no warning");
  assert.equal(warns(startedOwner({ writeScope: [own[0]] })), true, "an overlapping scope keeps the warning");
  assert.equal(warns(startedOwner({ writeScope: [] })), true, "an empty scope is unknown, so the warning stays");
  assert.equal(warns(startedOwner()), true, "no recorded scope keeps the warning");
});

test("D196 R4: an estimate above the base cap whose rationale does not say a grant is planned warns DBG-ESTIMATE-ABOVE-BASE; grant wording silences it; D193 still refuses a missing rationale", async () => {
  const { runDispatchBriefing } = await lib();
  const base = packageFixture();
  const cap = budgetOf(runDispatchBriefing(argvOf(base.fx), depsOf(base.fx)).skeleton);
  const within = packageFixture({ estimatedToolCalls: cap });
  assert.ok(!warningCodes(runDispatchBriefing(within.argv, depsOf(within.fx))).includes("DBG-ESTIMATE-ABOVE-BASE"));
  const plain = packageFixture({ estimatedToolCalls: cap + 1, budgetRationale: "one test-first cycle that needs a few calls more than the base cap" });
  const plainResult = runDispatchBriefing(plain.argv, depsOf(plain.fx));
  assert.equal(plainResult.ok, true, JSON.stringify(plainResult));
  assert.ok(warningCodes(plainResult).includes("DBG-ESTIMATE-ABOVE-BASE"), JSON.stringify(plainResult.warnings));
  assert.ok(!warningCodes(plainResult).includes("DBG-ESTIMATE-NEEDS-SPLIT"));
  const planned = packageFixture({ estimatedToolCalls: cap + 1, budgetRationale: "a budget grant of 20 calls is planned at the checkpoint" });
  const plannedResult = runDispatchBriefing(planned.argv, depsOf(planned.fx));
  assert.equal(plannedResult.ok, true, JSON.stringify(plannedResult));
  assert.ok(!warningCodes(plannedResult).includes("DBG-ESTIMATE-ABOVE-BASE"), JSON.stringify(plannedResult.warnings));
  const none = packageFixture({ estimatedToolCalls: cap + 1 });
  assert.equal(runDispatchBriefing(none.argv, depsOf(none.fx)).code, "DBG-PACKAGE-BUDGET-EXCEEDED");
});

test("D196 R4: an estimate above twice the base cap plus one grant step warns DBG-ESTIMATE-NEEDS-SPLIT without refusing", async () => {
  const { runDispatchBriefing } = await lib();
  const base = packageFixture();
  const cap = budgetOf(runDispatchBriefing(argvOf(base.fx), depsOf(base.fx)).skeleton);
  const edge = packageFixture({ estimatedToolCalls: 2 * (cap + 30), budgetRationale: "a grant is planned" });
  assert.ok(!warningCodes(runDispatchBriefing(edge.argv, depsOf(edge.fx))).includes("DBG-ESTIMATE-NEEDS-SPLIT"), "the edge itself is not above the factor");
  const far = packageFixture({ estimatedToolCalls: 2 * (cap + 30) + 1, budgetRationale: "a grant is planned" });
  const farResult = runDispatchBriefing(far.argv, depsOf(far.fx));
  assert.equal(farResult.ok, true, JSON.stringify(farResult));
  assert.ok(warningCodes(farResult).includes("DBG-ESTIMATE-NEEDS-SPLIT"), JSON.stringify(farResult.warnings));
  assert.match(farResult.warnings.find((entry) => entry.code === "DBG-ESTIMATE-NEEDS-SPLIT").message, /independent criteria/u);
});

test("D196 R1 default reader: an unsettled pending state of a ready queue slice names its owner; settled, unreadable, delivery-less, cancelled, unqueued and committed (Dispatch trailer) ones do not", async () => {
  const { defaultStartedOwners } = await lib();
  const dir = mkdtempSync(join(tmpdir(), "dbg-started-owner-"));
  try {
    assert.equal(spawnSync("git", ["init", "-q", dir]).status, 0);
    assert.deepEqual(defaultStartedOwners(dir), [], "no host directory: no owner");
    const host = join(dir, ".git", "agent-pipeline", "run", "native-goldfish-host-commit");
    mkdirSync(host, { recursive: true });
    const pending = (dispatchId, delivery = { itemId: "item.a" }) => {
      const bytes = Buffer.from(JSON.stringify({ binding: { dispatchId }, ...(delivery ? { delivery } : {}) }));
      const digest = createHash("sha256").update(bytes).digest("hex");
      writeFileSync(join(host, `pending-claude-${createHash("sha256").update(dispatchId).digest("hex")}.json`), bytes);
      return digest;
    };
    pending("ALF-OPEN");
    writeFileSync(join(host, `authority-terminal-${pending("ALF-DONE")}.json`), "{}");
    pending("ALF-NO-DELIVERY", null);
    pending("ALF-CANCELLED");
    pending("ALF-UNQUEUED");
    pending("ALF-DELIVERED");
    assert.equal(spawnSync("git", ["-C", dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "--allow-empty",
      "-m", "fixture delivery", "-m", "Dispatch: ALF-DELIVERED (goldfish)"]).status, 0);
    writeFileSync(join(host, `pending-codex-${"0".repeat(64)}.json`), "not json");
    writeFileSync(join(host, "pending-claude-short.json"), JSON.stringify({ binding: { dispatchId: "ALF-BADNAME" }, delivery: { itemId: "item.a" } }));
    const rows = [{ id: "ALF-OPEN", state: "ready" }, { id: "ALF-DONE", state: "ready" }, { id: "ALF-NO-DELIVERY", state: "ready" },
      { id: "ALF-CANCELLED", state: "cancelled" }, { id: "ALF-BADNAME", state: "ready" }, { id: "ALF-DELIVERED", state: "ready" }];
    assert.deepEqual(defaultStartedOwners(dir, rows), [{ dispatchId: "ALF-OPEN", itemId: "item.a" }]);
    assert.deepEqual(defaultStartedOwners(dir, []), [], "no live queue row: no owner, whatever the pending states say");
    const scoped = defaultStartedOwners(dir, [{ id: "ALF-OPEN", state: "ready", writeScope: ["plugins/x/a.mjs", "plugins/x/a.test.mjs"] }]);
    assert.deepEqual(scoped, [{ dispatchId: "ALF-OPEN", itemId: "item.a", writeScope: ["plugins/x/a.mjs", "plugins/x/a.test.mjs"] }], "D205: the queue row's write scope rides along");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- `probe`: every dispatch-time check in dry-run, all failures at once (backlog: first dispatch in a consumer repository) ---

const probeDepsOf = (fx, over = {}) => depsOf(fx, {
  observePlanApproval: () => ({ status: "eligible" }),
  registryLock: () => ({ status: "absent" }),
  startedOwners: () => [],
  // the probe must never take the registry lock: any use of this acquirer fails the case
  acquireRegistryLock: () => { throw new Error("the probe must not take the registry lock"); },
  ...over,
});
const probeArgvOf = (fx) => ["probe", "--root", fx.root, "--package", "scratch/pkg.json"];
const QUEUE_ROW = { id: "ALF-T1", state: "ready", delivery: { itemId: "pipeline.sample-slug" }, writeScope: [CHECK, PATH_A] };

const PROBE_TABLE = [
  { name: "a package field problem", pkg: { goal: undefined }, check: "package-fields", code: "DBG-PACKAGE-FIELD-MISSING", repair: /repair: /u },
  { name: "a named path that does not exist", pkg: { paths: [PATH_A, "plugins/x/new.mjs"] }, check: "package-paths", code: "DBG-PACKAGE-PATH-MISSING", repair: /newFiles/u },
  { name: "the D193 estimate above the tier cap without a grant route", pkg: { estimatedToolCalls: 200 }, check: "tool-budget", code: "DBG-PACKAGE-BUDGET-EXCEEDED", repair: /budgetRationale/u },
  { name: "a governed queue row that is not ready", deps: { queueRow: () => ({ ...QUEUE_ROW, state: "cancelled" }) }, check: "binding", code: "DBG-QUEUE-ROW-NOT-READY", repair: /new --dispatch-id/u },
  { name: "a queue row with another write scope", deps: { queueRow: () => ({ ...QUEUE_ROW, writeScope: [CHECK, PATH_A, "plugins/x/wider.mjs"] }) }, check: "binding", code: "DBG-QUEUE-ROW-DRIFT", repair: /Rebind with exactly that scope/u },
  { name: "a wrong-premise item without a recon note", deps: { queueRows: () => [{ id: "OLD-1", state: "cancelled", cancelClass: "wrong-premise", delivery: { itemId: "pipeline.sample-slug" } }], integratedSliceIds: () => [] }, check: "binding", code: "DBG-RECON-REQUIRED", repair: /recon note/u },
  { name: "a write scope that overlaps a running dispatch", deps: { runningDispatches: () => [{ dispatchId: "OTHER-1", writeScope: [PATH_A], record: "dispatch-record-OTHER-1.json", verdict: "alive" }] }, check: "binding", code: "DBG-SCOPE-OVERLAP", repair: /disjoint/u },
  { name: "a stale plan approval", deps: { observePlanApproval: () => ({ status: "unavailable", code: "CVCT-FILE" }) }, check: "plan-approval", code: "CVCT-FILE", repair: /chmod 600/u },
  { name: "a registry lock held by a dead owner", deps: { registryLock: () => ({ status: "held", owner: "dead", pid: 4242, ageSeconds: 9 }) }, check: "registry-lock", code: "DBG-PROBE-REGISTRY-LOCK-HELD", repair: /routine-repair\.mjs run heal --root .+ --reason "/u, message: /pid 4242/u },
];

for (const entry of PROBE_TABLE) {
  test(`probe: ${entry.name} fails alone and is reported with its repair`, async () => {
    const { runDispatchBriefing } = await lib();
    const { fx } = packageFixture(entry.pkg ?? {});
    const result = runDispatchBriefing(probeArgvOf(fx), probeDepsOf(fx, entry.deps ?? {}));
    assert.equal(result.schema, "pipeline.dispatch-readiness-probe.v1", JSON.stringify(result));
    assert.equal(result.ready, false);
    assert.equal(result.findings.length, 1, JSON.stringify(result.findings));
    const [finding] = result.findings;
    assert.equal(finding.code, entry.code);
    assert.equal(finding.check, entry.check);
    assert.match(finding.repair, entry.repair);
    if (entry.message) assert.match(finding.message, entry.message);
    assert.equal(Object.hasOwn(result, "dispatchCall"), false, "no dispatch call while a check fails");
  });
}

test("probe: a lock held by a live owner is a finding that names the wait route, not the heal", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx } = packageFixture();
  const result = runDispatchBriefing(probeArgvOf(fx), probeDepsOf(fx, { registryLock: () => ({ status: "held", owner: "live", pid: 77, ageSeconds: 2 }) }));
  assert.equal(result.ready, false);
  assert.equal(result.findings[0].check, "registry-lock");
  assert.match(result.findings[0].message, /pid 77/u);
  assert.doesNotMatch(result.findings[0].repair, /run heal/u);
  assert.match(result.findings[0].repair, /session-authority-repair\.mjs wait/u);
});

test("probe: a lock that cannot be observed is reported as skipped, never as passed", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx } = packageFixture();
  const result = runDispatchBriefing(probeArgvOf(fx), probeDepsOf(fx, { registryLock: () => null }));
  assert.equal(result.ready, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].kind, "skipped");
  assert.equal(result.findings[0].check, "registry-lock");
});

test("probe: three failing checks together are all reported in one answer", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx } = packageFixture({ estimatedToolCalls: 200 });
  const result = runDispatchBriefing(probeArgvOf(fx), probeDepsOf(fx, {
    queueRow: () => ({ ...QUEUE_ROW, state: "cancelled" }),
    observePlanApproval: () => ({ status: "unavailable", code: "CVCT-AUTHORITY-STALE" }),
    registryLock: () => ({ status: "held", owner: "dead", pid: 9, ageSeconds: 99 }),
  }));
  assert.equal(result.ready, false);
  assert.deepEqual(result.findings.map((finding) => finding.check).sort(), ["binding", "plan-approval", "registry-lock", "tool-budget"]);
  for (const finding of result.findings) {
    assert.equal(typeof finding.code, "string");
    assert.equal(typeof finding.message, "string");
    assert.ok(finding.repair.length > 0, finding.check);
  }
  assert.match(result.findings.find((finding) => finding.check === "plan-approval").repair, /rebind-approval/u);
});

test("probe: a ready package prints the dispatch call and keeps warnings apart from findings", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx } = packageFixture();
  const result = runDispatchBriefing(probeArgvOf(fx), probeDepsOf(fx));
  assert.equal(result.schema, "pipeline.dispatch-readiness-probe.v1");
  assert.equal(result.ready, true, JSON.stringify(result.findings));
  assert.deepEqual(result.findings, []);
  assert.equal(result.dispatchCall.tool, "Agent");
  assert.equal(result.dispatchCall.subagent_type, "pipeline-core:goldfish-implementor");
  assert.equal(result.dispatchCall.model, "sonnet");
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.some((warning) => warning.code === "DBG-PACKAGE-ESTIMATE-LOW"), "a warning stays a warning and does not flip ready");
});

test("probe: writes no file and never takes the registry lock", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx } = packageFixture();
  const before = directorySnapshot(fx.root);
  const result = runDispatchBriefing(probeArgvOf(fx), probeDepsOf(fx));
  assert.equal(result.ready, true, JSON.stringify(result.findings));
  assert.deepEqual(directorySnapshot(fx.root), before);
  const failing = runDispatchBriefing(probeArgvOf(fx), probeDepsOf(fx, { observePlanApproval: () => ({ status: "unavailable", code: "CVCT-FILE" }), registryLock: () => ({ status: "held", owner: "dead", pid: 1, ageSeconds: 1 }) }));
  assert.equal(failing.ready, false);
  assert.deepEqual(directorySnapshot(fx.root), before);
});

test("probe: refuses a missing --package and names probe in the usage text", async () => {
  const { runDispatchBriefing } = await lib();
  const { fx } = packageFixture();
  const refused = runDispatchBriefing(["probe", "--root", fx.root], probeDepsOf(fx));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "DBG-FLAG-MISSING");
  const help = spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /dispatch-briefing\.mjs probe --package/u);
});
