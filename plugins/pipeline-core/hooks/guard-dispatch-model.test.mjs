#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-dispatch.mjs — D84 hook-level cases.
 *
 * The model of a Claude Task/Agent dispatch comes from the configured routing, never from the session
 * it was launched in. lib/dispatch-model-enforcement.test.mjs pins the decision; these cases prove the
 * hook calls it for both tool names. They live in their own file because hooks/guard-dispatch.test.mjs
 * sits at its accepted line bound.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { recordConsentGiven } from "../lib/onboarding-consent-marker.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";

const GUARD = fileURLToPath(new URL("./guard-dispatch.mjs", import.meta.url));
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."); mkdirSync(join(repoRoot, "scratch"), { recursive: true }); // a fresh checkout has no scratch/
const bindingRepo = mkdtempSync(join(repoRoot, "scratch", "guard-dispatch-model-"));
execFileSync("git", ["init", "-q"], { cwd: bindingRepo });
mkdirSync(join(bindingRepo, ".claude"), { recursive: true });
recordConsentGiven({ rootDir: bindingRepo });
assert.equal(observeGovernanceScope({ rootDir: bindingRepo }).requiresEnforcement, true,
  "guard fixture must be admitted through canonical governance enrollment");
process.once("exit", () => rmSync(bindingRepo, { recursive: true, force: true }));

function run(payload) {
  const res = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: bindingRepo } });
  return { code: res.status, stderr: res.stderr ?? "" };
}
const BLOCK = 2, ALLOW = 0;
const cases = [];
const register = (name, runCase) => cases.push({ id: `GD${String(cases.length + 1).padStart(2, "0")}`, name, run: runCase });

register("D84 block a Claude dispatch that names no model, typed and naming the `model` parameter", () => {
  for (const tool_name of ["Task", "Agent"]) {
    const { code, stderr } = run({ tool_name, tool_input: { subagent_type: "general-purpose", prompt: "find where X is defined" } });
    assert.equal(code, BLOCK, `${tool_name}: exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 200)}`);
    assert.ok(stderr.includes("DISPATCH-MODEL-MISSING"), `${tool_name}: stderr missing "DISPATCH-MODEL-MISSING"`);
    assert.ok(stderr.includes("`model`"), `${tool_name}: stderr does not name the \`model\` parameter`);
  }
});
// K146 / PO decision batch 17: the old GDM02 allowed general-purpose because the prompt said
// "find". That carrier can write; prompt wording cannot grant a read-only exemption. Preserve
// D84's model-route observation and add a real read-only carrier as the positive control.
register("D84 configured model passes its route check while K146 blocks a write-capable research prompt", () => {
  for (const tool_name of ["Task", "Agent"]) {
    const { code, stderr } = run({ tool_name, tool_input: { subagent_type: "general-purpose", model: "sonnet", prompt: "find where X is defined" } });
    assert.equal(code, BLOCK, `${tool_name}: exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 200)}`);
    assert.ok(!stderr.includes("DISPATCH-MODEL"), `${tool_name}: unexpected model finding -- ${stderr.trim().slice(0, 200)}`);
    assert.ok(stderr.includes("DISPATCH-WRITE-CARRIER-REQUIRED"), `${tool_name}: missing carrier refusal -- ${stderr.trim().slice(0, 200)}`);
  }
  const research = run({ tool_name: "spawn_agent", tool_input: { agent_type: "explorer", message: "find where X is defined" } });
  assert.equal(research.code, ALLOW, `read-only explorer must remain available: ${research.stderr.trim().slice(0, 200)}`);
  const advisor = run({ tool_name: "Task", tool_input: { Subagents: [{ TypeName: "consult-advisor", Role: "Advisor", Prompt: "inspect input.txt", Model: "pro" }] } });
  assert.equal(advisor.code, ALLOW, `read-only Antigravity Advisor must reach its native preparation gate: ${advisor.stderr.trim().slice(0, 200)}`);
  const unknown = run({ tool_name: "Task", tool_input: { Subagents: [{ TypeName: "customer-researcher", Role: "Researcher", Prompt: "inspect input.txt", Model: "flash" }] } });
  assert.equal(unknown.code, BLOCK, `unknown Antigravity carrier must not gain a prompt exemption: ${unknown.stderr.trim().slice(0, 200)}`);
  assert.ok(unknown.stderr.includes("DISPATCH-WRITE-CARRIER-REQUIRED"), `missing unknown-carrier refusal: ${unknown.stderr.trim().slice(0, 200)}`);
});
register("D84 block a Claude dispatch that names a model no configured duty route selects, typed and naming the configured selectors", () => {
  const { code, stderr } = run({ tool_name: "Agent", tool_input: { subagent_type: "general-purpose", model: "not-a-configured-model", prompt: "find where X is defined" } });
  assert.equal(code, BLOCK, `exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 200)}`);
  assert.ok(stderr.includes("DISPATCH-MODEL-UNROUTED"), `stderr missing "DISPATCH-MODEL-UNROUTED" -- ${stderr.trim().slice(0, 200)}`);
});

register("K152B refuse an Antigravity entry without an explicit native Model", () => {
  const subagents = [{ TypeName: "customer-researcher", Role: "Customer Researcher", Prompt: "Inspect the customer fixture." }];
  const { code, stderr } = run({ tool_name: "Task", tool_input: { Subagents: subagents } });
  assert.equal(code, BLOCK);
  assert.ok(stderr.includes("DISPATCH-WRITE-CARRIER-REQUIRED"), stderr);
  // dc8204a28 bound the native Model to the carrier's configured duty tier: an ungoverned type
  // (customer-researcher) is no longer judged on its Model and is refused as a write carrier instead,
  // so the explicit-Model message is asserted on a governed read-only carrier (consult-advisor).
  const governed = run({ tool_name: "Task", tool_input: { Subagents: [{ TypeName: "consult-advisor", Role: "Advisor", Prompt: "inspect input.txt" }] } });
  assert.equal(governed.code, BLOCK);
  assert.ok(governed.stderr.includes("DISPATCH-MODEL-MISSING"), governed.stderr);
  assert.ok(governed.stderr.includes("Subagents[].Model"), governed.stderr);
});

register("K152B check every native Model and preserve explicit model admission", () => {
  // dc8204a28: each governed carrier admits exactly its configured duty tier (advisory = pro,
  // readiness = flash); "flash_lite" is a valid enum value that no duty selects, so it is refused as a mismatch.
  const entry = (Model, TypeName = "consult-advisor") => ({ TypeName, Role: "Advisor", Prompt: "inspect input.txt", Model });
  for (const Model of ["inherit", "unknown"]) {
    const { code, stderr } = run({ tool_name: "Task", tool_input: { Subagents: [entry("pro"), entry(Model)] } });
    assert.equal(code, BLOCK);
    assert.ok(stderr.includes("DISPATCH-MODEL"));
  }
  const advisory = run({ tool_name: "Task", tool_input: { Subagents: [entry("pro", "consult-advisor")] } });
  assert.equal(advisory.code, ALLOW, `pro: ${advisory.stderr}`);
  // A readiness-reviewer is a Critic-family carrier, so a bare prompt is refused later by the role-template check;
  // the explicit-Model admission is what this case pins, so the configured "flash" tier must raise no model finding.
  const readiness = run({ tool_name: "Task", tool_input: { Subagents: [entry("flash", "readiness-reviewer")] } });
  assert.ok(!readiness.stderr.includes("DISPATCH-MODEL"), `flash: ${readiness.stderr}`);
  for (const [Model, TypeName] of [["flash_lite", "consult-advisor"], ["flash_lite", "readiness-reviewer"], ["flash", "consult-advisor"], ["pro", "readiness-reviewer"]]) {
    const { code, stderr } = run({ tool_name: "Task", tool_input: { Subagents: [entry(Model, TypeName)] } });
    assert.equal(code, BLOCK, `${TypeName}/${Model}`);
    assert.ok(stderr.includes("DISPATCH-MODEL-DUTY-MISMATCH"), stderr);
  }
});

assert.equal(cases.length, 5,"the dispatch-model hook corpus must register five cases");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
const completionCases = cases.map((entry, index) => ({ ...entry, id: `GDM${String(index + 1).padStart(2, "0")}` }));
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
