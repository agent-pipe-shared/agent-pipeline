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
