// SPDX-License-Identifier: SUL-1.0
/**
 * Pin for AC-127 (PF-23): a consumer project's signed spec can bind its first item delivery.
 *
 * Observed 2026-10-18 in a real greenfield consumer (epic, Claude on WSL): after approve-plan,
 * materialize-architecture and `set-phase implementation`, the first Goldfish dispatch was refused
 * `SQ-DELIVERY-COURSE-ABSENT`. The guard creates the course itself, but only from a dispatch whose
 * prompt opens with a native binding carrying `itemDelivery`, and the shipped generator could not
 * produce one for a consumer: it found only this repository's own "Original Alfred item <slug> is
 * delivered" row (with a backlog evidence cell) and refused whenever the preflight's loaded ruleset
 * identity was unavailable (it is, for a Claude local-development install).
 *
 * This pin holds the repaired contract:
 *   A  `--criterion AC-<n>` binds a plain EARS criterion of a consumer spec, with the criterion's exact
 *      bytes as the locator, a derived `<feature>.<slug>` item id and no backlog item; missing and
 *      ambiguous criteria are typed refusals; the Alfred route is unchanged. The generator finds the
 *      criterion in three Markdown shapes, but `parseAcceptedCriticCriterion` (which the guard re-runs
 *      at admission, so it is authoritative) admits only: a `# | Criterion | Evidence` table row under
 *      an acceptance-criteria heading, an `### AC-<n>` heading with one plain paragraph, and a
 *      single-line `<k>. **AC-<n>:** text` item. Every other rendering is a typed refusal here.
 *   B  `rulesetSha` is only format-checked by the host, so an unavailable loaded identity falls back
 *      (installed identity, then the loaded plugin root's content hash) with a DBG-RULESET-FALLBACK
 *      warning, and is refused only when no source exists.
 *   C  The check contract, driven through the real host functions against a real git fixture: the
 *      check is run as `node --test <path>` at the commit the host makes, so a FIRST dispatch may
 *      author its own check; uncommitted or absent check sources are refused.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir, devNull } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateItemDeliveryBriefing } from "../native-goldfish-host-return.mjs";
import { parseAcceptedCriticCriterion } from "../critic-accepted-contract.mjs";
import { nativeContractFixtureParent } from "../test-item-approved-course-fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const lib = () => import("../../scripts/dispatch-briefing.mjs");

const COMMIT = "1".repeat(40);
const TREE = "2".repeat(40);
const RULESET = "ab".repeat(32);
const INSTALLED = "cd".repeat(32);
const SNAPSHOT = "ef".repeat(32);
const CHECK = "checks/orders.test.mjs";
const PATH_A = "src/orders.mjs";
const SPEC = "specs/shop-app/spec.md";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const T1 = "WHEN a visitor submits the order form THE SYSTEM SHALL store the order with a timestamp";
const T3 = "WHEN a visitor opens the cart THE SYSTEM SHALL list every selected product with its price";
const T6 = "WHEN the visitor signs out THE SYSTEM SHALL end the session";
const SPEC_TEXT = [
  "# Shop app spec — Café", "",
  "## Acceptance criteria", "",
  "| # | Criterion | Evidence |", "| --- | --- | --- |",
  `| AC-1 | ${T1} | order tests |`,
  "| AC-10 | WHEN the stock is empty THE SYSTEM SHALL hide the product | stock tests |", "",
  `1. **AC-3:** ${T3}`, "",
  "### AC-6", "", T6, "",
  "## Further statements", "",
  "- AC-4: WHILE the cart is empty THE SYSTEM SHALL disable the checkout button",
  "- **AC-5** IF the payment is declined THEN THE SYSTEM SHALL show the reason",
  "AC-9 — WHEN the visitor changes the language THE SYSTEM SHALL translate the shop", "",
  "2. **AC-11:** WHEN the cart is large THE SYSTEM SHALL paginate it,",
  "   keeping the running total visible.", "",
  "```", "AC-12: this id is only inside a code fence", "```", "",
  "AC-7: first statement of seven", "AC-7: second statement of seven", "",
  "| AC-8 | WHEN a table says it THE SYSTEM SHALL count once | t |", "- AC-8: WHEN a list says it THE SYSTEM SHALL count twice", "",
].join("\n");

function agentFile(name, model, effort, maxTurns) {
  return `---\nname: ${name}\nmodel: ${model}\neffort: ${effort}\nmaxTurns: ${maxTurns}\n---\nFixture agent body.\n`;
}
function makeAgents() {
  const agentsDir = mkdtempSync(join(tmpdir(), "consumer-binding-agents-"));
  roots.push(agentsDir);
  writeFileSync(join(agentsDir, "goldfish-implementor.md"), agentFile("goldfish-implementor", "sonnet", "medium", 50));
  return agentsDir;
}
function put(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
function makeFixture(specText = SPEC_TEXT) {
  const root = mkdtempSync(join(tmpdir(), "consumer-binding-"));
  roots.push(root);
  put(root, SPEC, specText);
  return { root, specBytes: Buffer.from(specText), agentsDir: makeAgents() };
}

const observerOf = (loaded, extra = {}) => () => ({
  ...(extra.pluginRoot ? { pluginRoot: extra.pluginRoot } : {}),
  rulesetSource: { selectedPlugin: { id: "pipeline-core", version: "9.9.9+test" }, loadedIdentity: loaded, installedIdentity: extra.installed ?? { status: "unavailable" } },
});
const availableObserver = observerOf({ status: "available", algorithm: "content-sha256", value: RULESET });
const depsOf = (fx, over = {}) => ({
  agentsDir: fx.agentsDir,
  observePreflight: availableObserver,
  git: (_root, args) => (args[0] === "status" ? "" : args[1] === "HEAD^{tree}" ? TREE : COMMIT),
  resolveBaseline: () => ({ status: "ready", entries: [] }),
  defaultSpecPath: () => null,
  ...over,
});
function argvOf(fx, criterion, overrides = {}) {
  const pairs = [["--root", fx.root], ["--dispatch-id", "SHOP-1"], ["--item", "checkout-order"],
    ["--agent-type", "goldfish-implementor"], ["--model-id", "claude-sonnet-5-5"],
    ["--check", CHECK], ["--path", PATH_A], ["--spec", SPEC], ["--criterion", criterion]];
  const out = ["binding"];
  for (const [flag, value] of pairs) {
    const chosen = Object.hasOwn(overrides, flag) ? overrides[flag] : value;
    if (chosen !== null && chosen !== undefined) out.push(flag, chosen);
  }
  return out;
}
const slice = (fx, locator) => fx.specBytes.subarray(locator.startByte, locator.endByte).toString("utf8");

// A. The generic criterion route.

for (const [id, text, shape] of [["AC-1", T1, "`# | Criterion | Evidence` table row"], ["AC-3", T3, "single-line numbered bold item"],
  ["AC-6", T6, "heading and its one paragraph"]]) {
  test(`--criterion binds a plain EARS criterion stated as a ${shape}`, async () => {
    const { runDispatchBriefing } = await lib();
    const fx = makeFixture();
    const result = runDispatchBriefing(argvOf(fx, id), depsOf(fx));
    assert.equal(result.ok, true, JSON.stringify(result));
    const { itemDelivery } = result.binding;
    assert.equal(validateItemDeliveryBriefing(itemDelivery).ok, true);
    assert.equal(itemDelivery.itemId, "shop-app.checkout-order");
    assert.equal(itemDelivery.sliceId, "SHOP-1");
    const locator = itemDelivery.criterionLocator;
    assert.equal(locator.criterionId, id);
    assert.equal(locator.sourcePath, SPEC);
    assert.equal(locator.sourceSha256, sha(fx.specBytes));
    assert.equal(slice(fx, locator), text, "the locator bytes are exactly the criterion text");
    assert.equal(locator.excerptSha256, sha(fx.specBytes.subarray(locator.startByte, locator.endByte)));
    assert.ok(locator.endByte - locator.startByte <= 4096);
    const parsed = parseAcceptedCriticCriterion({
      sourceBytes: new Uint8Array(fx.specBytes), locator,
      packageContext: { featureId: "shop-app", sourceBindings: [{ path: SPEC, sha256: sha(fx.specBytes), role: "spec" }] },
    });
    assert.ok(["explicit-actual-independent-pass", "no-explicit-criterion"].includes(parsed.status), JSON.stringify(parsed));
    assert.deepEqual(result.binding.itemDelivery.checks, [{ id: "shop-1-check", path: CHECK, dependencies: [CHECK, PATH_A] }]);
  });
}

for (const [id, rendering] of [["AC-4", "a bullet `- AC-<n>:` line"], ["AC-5", "a bullet `- **AC-<n>**` line"],
  ["AC-9", "an `AC-<n> —` paragraph"], ["AC-11", "a numbered bold item wrapped over two lines"]]) {
  test(`${rendering} is found but the host parser refuses it, so the generator never hands out a binding the guard would refuse`, async () => {
    const { runDispatchBriefing } = await lib();
    const fx = makeFixture();
    const result = runDispatchBriefing(argvOf(fx, id), depsOf(fx));
    assert.equal(result.ok, false, JSON.stringify(result).slice(0, 300));
    assert.equal(result.code, "DBG-CRITERION-REFUSED");
    assert.ok(result.message.includes("CAC-CRITERION-UNSUPPORTED") && result.message.includes(id), result.message);
    assert.equal(result.skeleton, undefined);
  });
}

test("an id that is a prefix of another id, or sits in a code fence, is not matched", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const one = runDispatchBriefing(argvOf(fx, "AC-1"), depsOf(fx));
  assert.equal(one.ok, true, JSON.stringify(one));
  assert.equal(slice(fx, one.binding.itemDelivery.criterionLocator), T1);
  const fenced = runDispatchBriefing(argvOf(fx, "AC-12"), depsOf(fx));
  assert.equal(fenced.ok, false);
  assert.equal(fenced.code, "DBG-CRITERION-MISSING");
});

test("a criterion stated nowhere is DBG-CRITERION-MISSING and the refusal names the supported shapes", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const result = runDispatchBriefing(argvOf(fx, "AC-99"), depsOf(fx));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DBG-CRITERION-MISSING");
  for (const needle of ["AC-99", SPEC, "first cell", "`AC-<n>:`", "`**AC-<n>**`", "`AC-<n> —`", "heading"]) assert.ok(result.message.includes(needle), `${needle} in ${result.message}`);
  assert.equal(result.skeleton, undefined);
});

for (const [name, id] of [["two lines of one shape", "AC-7"], ["a table row and a list item", "AC-8"]]) {
  test(`a criterion stated twice (${name}) is DBG-CRITERION-AMBIGUOUS`, async () => {
    const { runDispatchBriefing } = await lib();
    const fx = makeFixture();
    const result = runDispatchBriefing(argvOf(fx, id), depsOf(fx));
    assert.equal(result.ok, false);
    assert.equal(result.code, "DBG-CRITERION-AMBIGUOUS");
    assert.ok(result.message.includes(id), result.message);
  });
}

test("a malformed criterion id and an over-long criterion are typed refusals", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  assert.equal(runDispatchBriefing(argvOf(fx, "AC-0"), depsOf(fx)).code, "DBG-CRITERION-ID");
  assert.equal(runDispatchBriefing(argvOf(fx, "ac-1"), depsOf(fx)).code, "DBG-CRITERION-ID");
  const long = makeFixture(`| AC-1 | ${"WHEN x THE SYSTEM SHALL y ".repeat(200)} | t |\n`);
  const result = runDispatchBriefing(argvOf(long, "AC-1"), depsOf(long));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DBG-CRITERION-TOO-LONG");
});

test("the Alfred-row route is unchanged without --criterion", async () => {
  const { runDispatchBriefing } = await lib();
  const row = "Original Alfred item sample-slug is delivered as its own original acceptance states, on the integrated candidate";
  const spec = ["# Spec", "", "## Acceptance criteria", "", "| # | Criterion | Evidence |", "| --- | --- | --- |", `| AC-2 | ${row} | backlog/items/2026-01-02-sample-slug.md |`, ""].join("\n");
  const fx = makeFixture(spec);
  put(fx.root, "backlog/items/2026-01-02-sample-slug.md", "---\nschema: pipeline.backlog-item.v1\nid: pipeline.sample-slug\nstatus: open\n---\nBody.\n");
  const result = runDispatchBriefing(argvOf(fx, null, { "--item": "sample-slug" }), depsOf(fx));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.binding.itemDelivery.itemId, "pipeline.sample-slug");
  assert.equal(result.binding.itemDelivery.criterionLocator.criterionId, "AC-2");
  assert.equal(slice(fx, result.binding.itemDelivery.criterionLocator), row);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.skeleton.includes(`- Ruleset: \`9.9.9+test\` · content identity \`${RULESET}\`.\n`), "field 6 is byte-identical without a fallback");
  assert.equal(JSON.stringify(runDispatchBriefing(argvOf(fx, null, { "--item": "sample-slug" }), depsOf(fx))), JSON.stringify(result));
  const consumer = makeFixture();
  const missing = runDispatchBriefing(argvOf(consumer, null, { "--item": "checkout-order" }), depsOf(consumer));
  assert.equal(missing.code, "DBG-AC-ROW-MISSING", "without --criterion a consumer spec still needs the Alfred row");
});

// B. The ruleset identity: format-checked by the host, so an unavailable loaded identity falls back.

test("rulesetSha is only format-checked by the host and copied from the binding", () => {
  const read = (rel) => readFileSync(join(HERE, "..", rel), "utf8");
  assert.match(read("native-goldfish-host-return.mjs"), /!SHA\.test\(binding\.rulesetSha \?\? ""\)/u);
  assert.match(read("native-goldfish-host-observation.mjs"), /rulesetSha: state\.binding\.rulesetSha/u);
  assert.match(read("native-goldfish-host-finalizer.mjs"), /rulesetSha: binding\.rulesetSha/u);
});

test("an unavailable loaded identity falls back to the installed identity, with a warning naming the source", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const observer = observerOf({ status: "unavailable" }, { installed: { status: "available", algorithm: "content-sha256", value: INSTALLED }, pluginRoot: "/ignored" });
  const result = runDispatchBriefing(argvOf(fx, "AC-1"), depsOf(fx, { observePreflight: observer, snapshotPluginRoot: () => { throw new Error("must not be reached"); } }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.binding.rulesetSha, INSTALLED);
  const [warning] = result.warnings;
  assert.equal(warning.code, "DBG-RULESET-FALLBACK");
  assert.ok(warning.source.includes("installedIdentity"), warning.source);
  assert.ok(result.skeleton.includes(INSTALLED) && result.skeleton.includes("fallback"));
});

test("with no installed identity either, the loaded plugin root's content hash is used, with a warning", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const seen = [];
  const observer = observerOf({ status: "unavailable" }, { pluginRoot: "/plugin/root" });
  const result = runDispatchBriefing(argvOf(fx, "AC-1"), depsOf(fx, { observePreflight: observer, snapshotPluginRoot: (root) => { seen.push(root); return { contentSha256: SNAPSHOT }; } }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(seen, ["/plugin/root"]);
  assert.equal(result.binding.rulesetSha, SNAPSHOT);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, "DBG-RULESET-FALLBACK");
  assert.ok(result.warnings[0].source.includes("plugin root"), result.warnings[0].source);
});

test("the real plugin-root snapshot yields a 64-hex identity for a small plugin directory", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  const plugin = mkdtempSync(join(tmpdir(), "consumer-binding-plugin-"));
  roots.push(plugin);
  put(plugin, ".claude-plugin/plugin.json", JSON.stringify({ name: "pipeline-core", version: "9.9.9+test" }));
  put(plugin, "scripts/a.mjs", "export const a = 1;\n");
  const observer = observerOf({ status: "unavailable" }, { pluginRoot: plugin });
  const first = runDispatchBriefing(argvOf(fx, "AC-1"), depsOf(fx, { observePreflight: observer }));
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.match(first.binding.rulesetSha, /^[a-f0-9]{64}$/u);
  assert.equal(runDispatchBriefing(argvOf(fx, "AC-1"), depsOf(fx, { observePreflight: observer })).binding.rulesetSha, first.binding.rulesetSha, "deterministic");
});

test("a ruleset identity is refused only when no source exists", async () => {
  const { runDispatchBriefing } = await lib();
  const fx = makeFixture();
  for (const [name, deps] of [
    ["no pluginRoot and no installed identity", { observePreflight: observerOf({ status: "unavailable" }) }],
    ["a failing snapshot", { observePreflight: observerOf({ status: "unavailable" }, { pluginRoot: "/p" }), snapshotPluginRoot: () => { throw new Error("unsafe root"); } }],
    ["a malformed snapshot", { observePreflight: observerOf({ status: "unavailable" }, { pluginRoot: "/p" }), snapshotPluginRoot: () => ({ contentSha256: "short" }) }],
    ["an installed identity that is not 64-hex", { observePreflight: observerOf({ status: "unavailable" }, { installed: { status: "available", value: "abc" } }) }],
  ]) {
    const result = runDispatchBriefing(argvOf(fx, "AC-1"), depsOf(fx, deps));
    assert.equal(result.ok, false, name);
    assert.equal(result.code, "DBG-RULESET-UNAVAILABLE", name);
  }
});

// C. The check contract, through the real host functions against a real git fixture.

function git(root, ...args) {
  const run = spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", `core.hooksPath=${devNull}`, "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

test("a first dispatch may author its own node-runnable check: it runs as node --test at the commit the host makes", async () => {
  const { runDispatchBriefing } = await lib();
  const { executeGovernedItemDeliveryChecks } = await import("../native-goldfish-host-state.mjs");
  const { inspectSignedDescriptorCustodyRepository } = await import("../worktree-lifecycle.mjs");
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "consumer-binding-"));
  roots.push(root);
  assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
  put(root, SPEC, SPEC_TEXT);
  git(root, "add", SPEC);
  git(root, "commit", "-q", "-m", "signed consumer spec");
  const fx = { root, specBytes: Buffer.from(SPEC_TEXT), agentsDir: makeAgents() };
  const real = depsOf(fx);
  delete real.git;
  const generated = runDispatchBriefing(argvOf(fx, "AC-1"), real);
  assert.equal(generated.ok, true, JSON.stringify(generated));
  const { itemDelivery, candidateCommit } = generated.binding;
  const first = inspectSignedDescriptorCustodyRepository(root).candidate;
  assert.equal(first.commit, candidateCommit);

  // (i) At the first candidate neither the check nor its dependency exists: admission never asked for them,
  // but running them there is refused.
  assert.equal(executeGovernedItemDeliveryChecks({ root, itemDelivery, candidate: first }).status, "refused");

  // The dispatch authors the check and its dependency. Present on disk but not committed: refused as not-candidate.
  put(root, PATH_A, "export const orders = () => 1;\n");
  put(root, CHECK, "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { orders } from \"../src/orders.mjs\";\ntest(\"orders\", () => assert.equal(orders(), 1));\n");
  const uncommitted = executeGovernedItemDeliveryChecks({ root, itemDelivery, candidate: first });
  assert.equal(uncommitted.status, "refused");
  assert.match(JSON.stringify(uncommitted), /not-candidate/u);

  // The host commits the dispatch's paths; the checks then run at that new candidate and pass.
  git(root, "add", PATH_A, CHECK);
  git(root, "commit", "-q", "-m", "host commit of the first item dispatch");
  const second = inspectSignedDescriptorCustodyRepository(root).candidate;
  assert.notEqual(second.commit, first.commit);
  const observed = executeGovernedItemDeliveryChecks({ root, itemDelivery, candidate: second });
  assert.equal(observed.code, "SQ-TARGETED-CHECKS-PASSED", JSON.stringify(observed));
  // (ii) The exact invocation.
  assert.equal(observed.evidence.results[0].executable, process.execPath);
  assert.deepEqual(observed.evidence.results[0].args, ["--test", CHECK]);
  assert.deepEqual(observed.evidence.files.map((entry) => entry.path), [CHECK, PATH_A].sort());
});

test("host-state source facts the briefing relies on stay in place", () => {
  const source = readFileSync(join(HERE, "..", "native-goldfish-host-state.mjs"), "utf8");
  assert.match(source, /spawnSync\(process\.execPath,\['--test',resolve\(root,check\.path\)\],\{cwd:before\.repository\.primaryRoot[^}]*timeout:60000/u);
  assert.match(source, /git',\['-C',physical,'show',`\$\{candidate\.commit\}:\$\{path\}`\]/u);
  assert.match(source, /itemDelivery\.checks\.some\(check=>changedPaths\.includes\(check\.path\)\)\)throw nativeManagedFault\('native-item-check-source-amendment-required'\)/u);
});
