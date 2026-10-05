// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DISPATCH_BUDGET_CALIBRATION_RULE_SCHEMA,
  DISPATCH_BUDGET_CALIBRATION_SAMPLE_SCHEMA,
  DISPATCH_BUDGET_TIERS,
  DISPATCH_BUDGET_TIER_AGENTS,
  DispatchBudgetCalibrationError,
  deriveMaxTurnsByTier,
  evaluateDispatchBudgetCalibration,
} from "./dispatch-budget-calibration.mjs";
import { readAgentMaxTurns } from "./dispatch-budget-binding.mjs";
import { dispatchWorkingCap } from "./dispatch-budget-core.mjs";
import { dispatchBudgetBinding, dispatchBudgetContractForRole, dispatchBudgetLineForRole } from "./dispatch-policy.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRATCH_ROOT = fileURLToPath(new URL("../../../scratch/", import.meta.url));
const fixtureRoots = [];
process.on("exit", () => { for (const root of fixtureRoots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } });
function fixtureDir(prefix) {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const root = mkdtempSync(join(SCRATCH_ROOT, `sst2b-${prefix}-`));
  fixtureRoots.push(root);
  return root;
}
/** A plugin root with the given `agents/<name>.md` definitions (name -> file text). */
function pluginFixture(prefix, definitions) {
  const pluginRoot = join(fixtureDir(prefix), "plugin");
  mkdirSync(join(pluginRoot, "agents"), { recursive: true });
  for (const [name, text] of Object.entries(definitions)) writeFileSync(join(pluginRoot, "agents", `${name}.md`), text);
  return pluginRoot;
}
const agentDefinition = (name, maxTurns) => `---\nname: ${name}\nmodel: sonnet\nmaxTurns: ${maxTurns}\ntools: Read\n---\nbody\n`;

const rule = (overrides = {}) => ({
  schema: DISPATCH_BUDGET_CALIBRATION_RULE_SCHEMA,
  fixedCalls: 10,
  callsPerFile: { correction: 6, documentation: 8, implementation: 5, investigation: 3, review: 4 },
  maxTurnsByTier: { mechanic: 50, implementor: 50, deep: 80 },
  ...overrides,
});
const sample = (overrides = {}) => ({
  schema: DISPATCH_BUDGET_CALIBRATION_SAMPLE_SCHEMA,
  tier: "deep",
  taskClass: "documentation",
  fileCount: 6,
  observedCalls: 50,
  outcome: "terminal",
  ...overrides,
});

test("a terminal observation includes the fixed closing allowance in its lower bound", () => {
  const result = evaluateDispatchBudgetCalibration({ rule: rule(), samples: [sample()] });
  assert.equal(result.status, "meets-observed-terminal-bounds");
  assert.deepEqual(result.evaluations[0], {
    tier: "deep", taskClass: "documentation", fileCount: 6, observedCalls: 50, outcome: "terminal",
    proposedBaseCalls: 58, workingCap: 65, effectiveBaseCalls: 58, requiredBaseCalls: 55,
    undercutsObservedBound: false, tierLimited: false, classification: "meets-terminal-bound",
  });
  assert.equal(result.closingAllowance, 5);
});

test("the evaluator exposes both a weak formula and a tier cap that truncates a stronger formula", () => {
  const weak = evaluateDispatchBudgetCalibration({
    rule: rule(),
    samples: [sample({ observedCalls: 66 })],
  });
  assert.equal(weak.status, "undercut");
  assert.equal(weak.evaluations[0].classification, "undercut-terminal-bound");
  assert.equal(weak.evaluations[0].requiredBaseCalls, 71);

  const capped = evaluateDispatchBudgetCalibration({
    rule: rule({ fixedCalls: 60 }),
    samples: [sample({ tier: "implementor", fileCount: 1, observedCalls: 40 })],
  });
  assert.equal(capped.evaluations[0].proposedBaseCalls, 68);
  assert.equal(capped.evaluations[0].workingCap, 35);
  assert.equal(capped.evaluations[0].effectiveBaseCalls, 35);
  assert.equal(capped.evaluations[0].tierLimited, true);
  assert.equal(capped.evaluations[0].undercutsObservedBound, true);
});

test("a truncated run is only a strict lower bound and can never validate sufficiency", () => {
  const result = evaluateDispatchBudgetCalibration({
    rule: rule({ fixedCalls: 70, maxTurnsByTier: { mechanic: 100, implementor: 100, deep: 100 } }),
    samples: [sample({ tier: "implementor", taskClass: "correction", fileCount: 1, observedCalls: 50, outcome: "truncated" })],
  });
  assert.equal(result.status, "inconclusive-truncated");
  assert.equal(result.evaluations[0].requiredBaseCalls, 56);
  assert.equal(result.evaluations[0].classification, "clears-truncated-lower-bound");
});

test("mixed samples summarize every undercut without leaking identifiers or prose", () => {
  const result = evaluateDispatchBudgetCalibration({
    rule: rule(),
    samples: [
      sample(),
      sample({ tier: "mechanic", taskClass: "investigation", fileCount: 0, observedCalls: 20, outcome: "truncated" }),
    ],
  });
  assert.equal(result.status, "undercut");
  assert.deepEqual({ sampleCount: result.sampleCount, undercutCount: result.undercutCount, truncatedCount: result.truncatedCount },
    { sampleCount: 2, undercutCount: 1, truncatedCount: 1 });
  assert.deepEqual(Object.keys(result.evaluations[1]).sort(), [
    "classification", "effectiveBaseCalls", "fileCount", "observedCalls", "outcome", "proposedBaseCalls",
    "requiredBaseCalls", "taskClass", "tier", "tierLimited", "undercutsObservedBound", "workingCap",
  ].sort());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.evaluations), true);
  assert.equal(Object.isFrozen(result.evaluations[0]), true);
});

test("the sample and rule contracts are exact and reject invalid or unsafe arithmetic", () => {
  for (const input of [
    {},
    { rule: rule(), samples: [] },
    { rule: { ...rule(), extra: true }, samples: [sample()] },
    { rule: rule({ callsPerFile: { documentation: 4 } }), samples: [sample()] },
    { rule: rule({ maxTurnsByTier: { mechanic: 50, implementor: 50, deep: 0 } }), samples: [sample()] },
    { rule: rule(), samples: [{ ...sample(), extra: "private" }] },
    { rule: rule(), samples: [sample({ tier: "critic" })] },
    { rule: rule(), samples: [sample({ taskClass: "other" })] },
    { rule: rule(), samples: [sample({ fileCount: -1 })] },
    { rule: rule(), samples: [sample({ observedCalls: 0 })] },
    { rule: rule(), samples: [sample({ outcome: "failed" })] },
    { rule: rule({ fixedCalls: Number.MAX_SAFE_INTEGER }), samples: [sample()] },
  ]) {
    assert.throws(() => evaluateDispatchBudgetCalibration(input), DispatchBudgetCalibrationError);
  }
});

test("fully and partially sparse sample arrays are rejected before calibration", () => {
  const sparse = new Array(1);
  const partiallySparse = [sample(), , sample({ taskClass: "review" })];
  for (const samples of [sparse, partiallySparse]) {
    assert.throws(
      () => evaluateDispatchBudgetCalibration({ rule: rule(), samples }),
      (error) => error instanceof DispatchBudgetCalibrationError && error.code === "DBC-SAMPLES",
    );
  }
});

// ------------------------------------------------ maxTurns: one reader, one source

test("readAgentMaxTurns: prefixed and bare names resolve the same frontmatter line; the default root is this plugin", () => {
  const pluginRoot = pluginFixture("reader-names", { critic: agentDefinition("critic", 41) });
  assert.equal(readAgentMaxTurns("critic", pluginRoot), 41);
  assert.equal(readAgentMaxTurns("pipeline-core:critic", pluginRoot), 41);
  assert.equal(readAgentMaxTurns("another-host:critic", pluginRoot), 41);
  assert.equal(readAgentMaxTurns("critic"), readAgentMaxTurns("critic", PLUGIN_ROOT));
  assert.ok(readAgentMaxTurns("critic") > 0, "the shipped critic definition resolves");
});

test("readAgentMaxTurns: a comment line is not the setting, CRLF files read, and the injected filesystem is honoured", () => {
  const pluginRoot = pluginFixture("reader-shapes", {
    commented: "---\nname: commented\n# maxTurns: 99\nmaxTurns: 41\n---\nbody\n",
    crlf: "---\r\nname: crlf\r\nmaxTurns: 42\r\n---\r\nbody\r\n",
  });
  assert.equal(readAgentMaxTurns("commented", pluginRoot), 41);
  assert.equal(readAgentMaxTurns("crlf", pluginRoot), 42);
  const seam = (text) => ({ existsSyncFn: () => true, readFileSyncFn: () => text });
  assert.equal(readAgentMaxTurns("critic", "/virtual-plugin", seam(agentDefinition("critic", 43))), 43);
  assert.equal(readAgentMaxTurns("critic", "/virtual-plugin", { existsSyncFn: () => true, readFileSyncFn: () => { throw new Error("boom"); } }), null);
  assert.equal(readAgentMaxTurns("critic", "/virtual-plugin", seam(Buffer.from("x"))), null);
});

test("readAgentMaxTurns: every unreadable shape is null -- never a guess, never a throw", () => {
  const definitions = {
    "no-frontmatter": "maxTurns: 40\nbody\n",
    "only-in-body": "---\nname: x\n---\nmaxTurns: 7\n",
    "comment-only": "---\nname: x\n# maxTurns: 99\n---\nbody\n",
    indented: "---\nname: x\n  maxTurns: 99\n---\nbody\n",
    "non-numeric": "---\nname: x\nmaxTurns: many\n---\nbody\n",
    zero: "---\nname: x\nmaxTurns: 0\n---\nbody\n",
    negative: "---\nname: x\nmaxTurns: -5\n---\nbody\n",
    decimal: "---\nname: x\nmaxTurns: 4.5\n---\nbody\n",
    unsafe: "---\nname: x\nmaxTurns: 99999999999999999999\n---\nbody\n",
    "trailing-text": "---\nname: x\nmaxTurns: 40 turns\n---\nbody\n",
    unterminated: "---\nname: x\nmaxTurns: 40\nbody\n",
  };
  const pluginRoot = pluginFixture("reader-null", definitions);
  for (const name of Object.keys(definitions)) assert.equal(readAgentMaxTurns(name, pluginRoot), null, name);
  assert.equal(readAgentMaxTurns("absent", pluginRoot), null);
  for (const bad of ["../critic", "a/b", "critic.md", "", "pipeline-core:", undefined, null, 7]) {
    assert.equal(readAgentMaxTurns(bad, pluginRoot), null, String(bad));
  }
  for (const badRoot of ["", undefined, null, 7]) assert.equal(readAgentMaxTurns("critic", badRoot === undefined ? null : badRoot), null);
});

test("consumer repository: the definitions live in the plugin root, not under the project root", () => {
  const project = fixtureDir("consumer-project");
  const pluginRoot = pluginFixture("consumer-plugin", {
    critic: agentDefinition("critic", 41),
    "goldfish-deep": agentDefinition("goldfish-deep", 81),
    "goldfish-implementor": agentDefinition("goldfish-implementor", 51),
    "goldfish-mechanic": agentDefinition("goldfish-mechanic", 52),
  });
  const projectPluginRoot = join(project, "plugins", "pipeline-core");
  assert.equal(readAgentMaxTurns("critic", projectPluginRoot), null, "a consumer project carries no plugins/pipeline-core");
  assert.equal(readAgentMaxTurns("critic", pluginRoot), 41);

  assert.deepEqual({ ...deriveMaxTurnsByTier({ pluginRoot }) }, { mechanic: 52, implementor: 51, deep: 81 });
  assert.throws(() => deriveMaxTurnsByTier({ pluginRoot: projectPluginRoot }), (e) => e instanceof DispatchBudgetCalibrationError && e.code === "DBC-MAXTURNS-UNRESOLVED");

  const contract = dispatchBudgetContractForRole("pipeline-core:critic", { pluginRoot });
  assert.deepEqual({ applicable: contract.applicable, role: contract.role, maxTurns: contract.maxTurns }, { applicable: true, role: "critic", maxTurns: 41 });
  assert.equal(dispatchBudgetContractForRole("critic", { pluginRoot: projectPluginRoot }).maxTurns, null, "an unreadable definition is null, never a fallback number");

  const binding = dispatchBudgetBinding({ subagentType: "pipeline-core:goldfish-implementor", prompt: dispatchBudgetLineForRole("goldfish-implementor"), pluginRoot });
  assert.equal(binding.status, "prepared");
  assert.equal(binding.maxTurns, 51);
  assert.equal(binding.workingCap, dispatchWorkingCap(51));
  const unresolved = dispatchBudgetBinding({ subagentType: "pipeline-core:goldfish-implementor", prompt: dispatchBudgetLineForRole("goldfish-implementor"), pluginRoot: projectPluginRoot });
  assert.equal(unresolved.status, "rejected");
  assert.equal(unresolved.code, "DBB-TIER-INCOMPATIBLE");
});

test("calibration validation: the rule's tier limits must equal the agent definitions (DBC-MAXTURNS-MISMATCH / -UNRESOLVED)", () => {
  const codeOf = (fn) => { try { fn(); } catch (error) { return error instanceof DispatchBudgetCalibrationError ? error.code : `other:${error?.message}`; } return null; };

  // Against the real shipped agents: the derived map is exactly what the one reader says per tier.
  const derived = deriveMaxTurnsByTier();
  assert.deepEqual(Object.keys(derived), [...DISPATCH_BUDGET_TIERS]);
  for (const tier of DISPATCH_BUDGET_TIERS) assert.equal(derived[tier], readAgentMaxTurns(DISPATCH_BUDGET_TIER_AGENTS[tier]), tier);
  assert.equal(Object.isFrozen(derived), true);
  assert.equal(codeOf(() => evaluateDispatchBudgetCalibration({ rule: rule(), samples: [sample()], pluginRoot: PLUGIN_ROOT })), null,
    "the rule helper's what-if limits equal the shipped definitions (update the helper when a definition changes)");

  // A limit that differs from the definition in any one tier is refused.
  for (const tier of DISPATCH_BUDGET_TIERS) {
    const skewed = rule({ maxTurnsByTier: { ...rule().maxTurnsByTier, [tier]: derived[tier] + 1 } });
    assert.equal(codeOf(() => evaluateDispatchBudgetCalibration({ rule: skewed, samples: [sample()], pluginRoot: PLUGIN_ROOT })), "DBC-MAXTURNS-MISMATCH", tier);
  }

  // An unreadable definition fails closed instead of validating against nothing.
  const full = Object.fromEntries(DISPATCH_BUDGET_TIERS.map((tier) => [DISPATCH_BUDGET_TIER_AGENTS[tier], agentDefinition(DISPATCH_BUDGET_TIER_AGENTS[tier], 60)]));
  for (const tier of DISPATCH_BUDGET_TIERS) {
    const broken = pluginFixture(`unresolved-${tier}`, { ...full, [DISPATCH_BUDGET_TIER_AGENTS[tier]]: "---\nname: x\nmaxTurns: many\n---\nbody\n" });
    assert.equal(codeOf(() => deriveMaxTurnsByTier({ pluginRoot: broken })), "DBC-MAXTURNS-UNRESOLVED", tier);
    assert.equal(codeOf(() => evaluateDispatchBudgetCalibration({ rule: rule(), samples: [sample()], pluginRoot: broken })), "DBC-MAXTURNS-UNRESOLVED", tier);
  }
  const fixture = pluginFixture("validation-fixture", full);
  const matching = rule({ maxTurnsByTier: { mechanic: 60, implementor: 60, deep: 60 } });
  assert.equal(codeOf(() => evaluateDispatchBudgetCalibration({ rule: matching, samples: [sample()], pluginRoot: fixture })), null);
  assert.equal(codeOf(() => evaluateDispatchBudgetCalibration({ rule: rule(), samples: [sample()], pluginRoot: fixture })), "DBC-MAXTURNS-MISMATCH");
});

// ---- RATCHET: no second copy of a role's maxTurns may creep back into the shipped sources.
// The agent definition is the only place a number lives. A numeric literal after `maxTurns`, or a
// `*MAX_TURNS*` role table, in a non-test module under lib/ hooks/ scripts/ is a second source that
// will drift. Comments are not code and are skipped; the allowlist is exact and each entry is
// itself checked to still be needed.
const RATCHET_DIRS = ["lib", "hooks", "scripts"];
const RATCHET_ALLOWLIST = Object.freeze({
  "scripts/measure-fresh-repo-onboarding-turns.mjs":
    "the onboarding probe's own loop cap (a bounded-turns parameter of the measurement run), not an agent definition's tier limit",
});
const NUMERIC_AFTER_MAXTURNS = /\bmaxTurns["']?\s*[:=]\s*\d/u;
const MAX_TURNS_ROLE_TABLE = /\b\w*MAX_TURNS\w*\s*=\s*(?:Object\.freeze\(\s*)?(?:\{|\[|new\s+Map\b)/u;

function codeLinesOf(source) {
  return source
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gmu, (block) => block.replace(/[^\n]/gu, " "))
    .split(/\r?\n/u)
    .map((line) => line.replace(/(^|\s)\/\/.*$/u, "$1"));
}
function maxTurnsCopies(source) {
  return codeLinesOf(source)
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(({ text }) => NUMERIC_AFTER_MAXTURNS.test(text) || MAX_TURNS_ROLE_TABLE.test(text));
}
function shippedSources(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") found.push(...shippedSources(path)); }
    else if (entry.name.endsWith(".mjs") && !entry.name.endsWith(".test.mjs")) found.push(path);
  }
  return found;
}

test("ratchet detector: flags a literal or a role table, ignores comments, comparisons and the frontmatter regex", () => {
  for (const flagged of [
    "const limits = { critic: 1, maxTurns: 40 };",
    "const MAX_TURNS_BY_ROLE = { critic: 40 };",
    "export const TIER_MAX_TURNS = Object.freeze({ deep: 80 });",
    "const ROLE_MAX_TURNS = new Map([[\"critic\", 40]]);",
    "function probe({ maxTurns = 20 } = {}) {}",
    "const body = '{ \"maxTurns\": 50 }';",
  ]) assert.equal(maxTurnsCopies(flagged).length, 1, flagged);
  for (const clean of [
    "// maxTurns: 40 is what the definition says",
    "/**\n * At maxTurns = 50, workingCap is 35.\n */\nconst x = 1;",
    "if (maxTurns <= 0) return null;",
    "const cap = maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN);",
    "const maxTurns = readAgentMaxTurns(role, pluginRoot);",
    "const AGENT_MAX_TURNS_LINE = /^maxTurns:[ \\t]*(\\d+)[ \\t\\r]*$/mu;",
    "const url = 'https://example.test/maxTurns';",
  ]) assert.deepEqual(maxTurnsCopies(clean), [], clean);
});

test("ratchet: no shipped module carries a second copy of an agent's maxTurns (allowlist exact, with reasons)", () => {
  const offenders = {};
  for (const dir of RATCHET_DIRS) {
    for (const path of shippedSources(join(PLUGIN_ROOT, dir))) {
      const hits = maxTurnsCopies(readFileSync(path, "utf8"));
      if (hits.length > 0) offenders[relative(PLUGIN_ROOT, path).split(sep).join("/")] = hits.map((hit) => `${hit.line}: ${hit.text.trim()}`);
    }
  }
  assert.deepEqual(Object.keys(offenders).sort(), Object.keys(RATCHET_ALLOWLIST).sort(),
    `a maxTurns number or role table outside the agent definitions (offenders: ${JSON.stringify(offenders)}); an allowlist entry that no longer offends must be removed`);
  for (const [path, reason] of Object.entries(RATCHET_ALLOWLIST)) assert.ok(reason.length > 20, `${path} needs a reason`);
});
