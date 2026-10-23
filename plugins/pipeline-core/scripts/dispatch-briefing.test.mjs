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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("an estimate above the tier cap binds the deep tier; above the deep cap it needs a grant rationale", async () => {
  const { runDispatchBriefing } = await lib();
  const base = packageFixture();
  const cap = budgetOf(runDispatchBriefing(argvOf(base.fx), depsOf(base.fx)).skeleton);
  const raised = packageFixture({ estimatedToolCalls: cap + 1 });
  const raisedResult = runDispatchBriefing(raised.argv, depsOf(raised.fx));
  assert.equal(raisedResult.ok, true, JSON.stringify(raisedResult));
  assert.equal(parseNativeGoldfishBriefing(raisedResult.text).binding.agentType, "goldfish-deep");
  assert.ok(raisedResult.warnings.some((entry) => entry.code === "DBG-PACKAGE-TIER-RAISED"));
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
