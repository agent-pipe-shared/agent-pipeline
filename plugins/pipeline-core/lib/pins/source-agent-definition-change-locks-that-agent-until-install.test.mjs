// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.source-agent-definition-change-locks-that-agent-until-install (AC-263).
 *
 * Original defect: after a source-tree `agents/critic.md` maxTurns change, `guard-dispatch` bound the
 * base cap from one definition while `guard-dispatch-budget` re-read maxTurns from the INSTALLED
 * plugin, so every dispatch of that agent was refused (`budget-tier-max-turns-conflict` /
 * `pending-binding-tier-conflict`). Accepted resolution: one reader (`readAgentMaxTurns`), one
 * plugin-root answer, and a pending binding that records the maxTurns it used. Acceptance points:
 *   P1 a source definition and an installed definition that differ are distinguishable through the
 *      real reader, and the binding records the maxTurns of the root it was built from;
 *   P2 the budget guard's plugin root and maxTurns read are one answer (injected root wins; the
 *      default is the plugin the guard ships in, the same root the dispatch policy defaults to);
 *   P3 the guard's contract maxTurns and resolved maxTurns agree for ANY root, so a source/installed
 *      difference can only surface as the explicit pending-binding comparison, never as two readers
 *      disagreeing inside the guard;
 *   P4 the recorded pending binding round-trips its maxTurns and effective cap, and the guard's
 *      equality test (`binding.maxTurns === resolved maxTurns`) separates a differing installed copy
 *      from a matching one;
 *   P5 the shipped (default-root) binding and guard reads agree for every budgeted role.
 * Each contract also runs against a mutant mirror (RED) to prove the pin can fail.
 * No case needs mode bits or symlinks, so none is host-skipped. Fixtures live under scratch/, no git.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  persistPendingDispatchBudgetBindings,
  readAgentMaxTurns,
  resolvePendingDispatchBudgetBinding,
} from "../dispatch-budget-binding.mjs";
import { dispatchBudgetBinding, dispatchBudgetContractForRole, dispatchBudgetLineForRole } from "../dispatch-policy.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCRATCH_ROOT = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const guard = await import("../../hooks/guard-dispatch-budget.mjs");

const fixtureRoots = [];
process.on("exit", () => { for (const root of fixtureRoots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } });
function pluginFixture(prefix, definitions) {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const base = mkdtempSync(join(SCRATCH_ROOT, `sadc-${prefix}-`));
  fixtureRoots.push(base);
  const pluginRoot = join(base, "plugin");
  mkdirSync(join(pluginRoot, "agents"), { recursive: true });
  for (const [name, maxTurns] of Object.entries(definitions)) {
    writeFileSync(join(pluginRoot, "agents", `${name}.md`), `---\nname: ${name}\nmodel: sonnet\nmaxTurns: ${maxTurns}\ntools: Read\n---\nbody\n`);
  }
  return pluginRoot;
}
// The defect shape: the source checkout was raised (critic 30 -> 40), the installed copy still says 30.
const sourceRoot = () => pluginFixture("source", { critic: 40 });
const installedRoot = () => pluginFixture("installed", { critic: 30 });

const CRITIC = "pipeline-core:critic";
const criticPrompt = () => dispatchBudgetLineForRole("critic");

test("P1 a differing source and installed definition are told apart by the one reader, and the binding records its root's maxTurns", () => {
  const source = sourceRoot();
  const installed = installedRoot();
  assert.equal(readAgentMaxTurns(CRITIC, source), 40);
  assert.equal(readAgentMaxTurns(CRITIC, installed), 30);
  const fromSource = dispatchBudgetBinding({ subagentType: CRITIC, prompt: criticPrompt(), pluginRoot: source });
  const fromInstalled = dispatchBudgetBinding({ subagentType: CRITIC, prompt: criticPrompt(), pluginRoot: installed });
  assert.equal(fromSource.status, "prepared");
  assert.equal(fromInstalled.status, "prepared");
  assert.equal(fromSource.maxTurns, 40, "the binding records the maxTurns it used");
  assert.equal(fromInstalled.maxTurns, 30);
  assert.notEqual(fromSource.workingCap, fromInstalled.workingCap, "the working cap follows the bound definition");
});

test("P2 the guard answers its plugin root once: an injected root wins, the default is the plugin it ships in", () => {
  const source = sourceRoot();
  assert.equal(guard.resolveAgentPluginRoot("/ignored-project-root", { pluginRoot: source }), source);
  assert.equal(guard.resolveAgentPluginRoot("/ignored-project-root", {}), PLUGIN_ROOT, "never the project root");
  assert.equal(guard.resolveMaxTurns(CRITIC, "/ignored-project-root", { pluginRoot: source }), 40);
  assert.equal(guard.resolveMaxTurns(CRITIC, "/ignored-project-root", { pluginRoot: installedRoot() }), 30);
  assert.equal(guard.resolveMaxTurns(CRITIC, "/ignored-project-root", {}), readAgentMaxTurns(CRITIC, PLUGIN_ROOT));
});

test("P3 the guard's contract maxTurns and resolved maxTurns agree for either root (no budget-tier-max-turns-conflict from two readers)", () => {
  for (const root of [sourceRoot(), installedRoot()]) {
    const options = { pluginRoot: root };
    const contract = dispatchBudgetContractForRole(CRITIC, { pluginRoot: guard.resolveAgentPluginRoot("/x", options) });
    assert.equal(contract.applicable, true);
    assert.equal(contract.maxTurns, guard.resolveMaxTurns(CRITIC, "/x", options));
  }
});

test("P4 the pending binding round-trips the recorded maxTurns; only a genuinely differing installed copy fails the guard's equality test", () => {
  const source = sourceRoot();
  const installed = installedRoot();
  const commonDir = mkdtempSync(join((mkdirSync(SCRATCH_ROOT, { recursive: true }), SCRATCH_ROOT), "sadc-common-"));
  fixtureRoots.push(commonDir);
  const bound = dispatchBudgetBinding({ subagentType: CRITIC, prompt: criticPrompt(), pluginRoot: source });
  const toolUseId = "toolu_sadc_p4";
  const persisted = persistPendingDispatchBudgetBindings({
    commonDir, toolUseId,
    bindings: [{ agentType: CRITIC, baseCalls: bound.baseCalls, maxTurns: bound.maxTurns, effectiveCap: bound.effectiveCap }],
  });
  assert.equal(persisted.status, "prepared");
  const resolved = resolvePendingDispatchBudgetBinding({ commonDir, toolUseId, agentType: CRITIC });
  assert.equal(resolved.status, "prepared");
  assert.equal(resolved.binding.maxTurns, 40);
  assert.equal(resolved.binding.effectiveCap, bound.effectiveCap);
  const guardEquality = (root) => resolved.binding.maxTurns === guard.resolveMaxTurns(CRITIC, "/x", { pluginRoot: root });
  assert.equal(guardEquality(source), true, "guard reading the definition the binding used honours the recorded value");
  assert.equal(guardEquality(installed), false, "a differing installed copy is the one remaining pending-binding-tier-conflict");
});

test("P5 default roots: the dispatch policy and the guard read the same shipped definition for every budgeted role", () => {
  for (const role of ["critic", "goldfish-implementor", "goldfish-mechanic", "goldfish-deep"]) {
    const type = `pipeline-core:${role}`;
    const contract = dispatchBudgetContractForRole(type, {});
    if (!contract.applicable) continue;
    const bound = dispatchBudgetBinding({ subagentType: type, prompt: dispatchBudgetLineForRole(role) });
    assert.equal(bound.status, "prepared", role);
    assert.equal(bound.maxTurns, guard.resolveMaxTurns(type, PLUGIN_ROOT, {}), role);
    assert.equal(bound.maxTurns, readAgentMaxTurns(type), role);
  }
});

test("RED: a mutant guard that reads a different root than the binding is caught by the P1/P3 contracts", () => {
  const source = sourceRoot();
  const installed = installedRoot();
  const mutantResolve = () => guard.resolveMaxTurns(CRITIC, "/x", { pluginRoot: installed });
  const binding = dispatchBudgetBinding({ subagentType: CRITIC, prompt: criticPrompt(), pluginRoot: source });
  assert.throws(() => assert.equal(binding.maxTurns, mutantResolve()), assert.AssertionError);
  const contract = dispatchBudgetContractForRole(CRITIC, { pluginRoot: source });
  assert.throws(() => assert.equal(contract.maxTurns, mutantResolve()), assert.AssertionError);
});
