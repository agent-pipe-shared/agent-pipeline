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
register("D84 allow a Claude dispatch that names a configured model, with no model finding", () => {
  for (const tool_name of ["Task", "Agent"]) {
    const { code, stderr } = run({ tool_name, tool_input: { subagent_type: "general-purpose", model: "sonnet", prompt: "find where X is defined" } });
    assert.equal(code, ALLOW, `${tool_name}: exit ${code} (expected ${ALLOW}) -- ${stderr.trim().slice(0, 200)}`);
    assert.ok(!stderr.includes("DISPATCH-MODEL"), `${tool_name}: unexpected model finding -- ${stderr.trim().slice(0, 200)}`);
  }
});
register("D84 block a Claude dispatch that names a model no configured duty route selects, typed and naming the configured selectors", () => {
  const { code, stderr } = run({ tool_name: "Agent", tool_input: { subagent_type: "general-purpose", model: "not-a-configured-model", prompt: "find where X is defined" } });
  assert.equal(code, BLOCK, `exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 200)}`);
  assert.ok(stderr.includes("DISPATCH-MODEL-UNROUTED"), `stderr missing "DISPATCH-MODEL-UNROUTED" -- ${stderr.trim().slice(0, 200)}`);
});

assert.equal(cases.length, 3, "the D84 dispatch-model hook corpus must register three cases");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
const completionCases = cases.map((entry, index) => ({ ...entry, id: `GDM${String(index + 1).padStart(2, "0")}` }));
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
