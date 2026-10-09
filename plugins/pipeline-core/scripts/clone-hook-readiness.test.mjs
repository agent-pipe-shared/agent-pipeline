// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { cpSync, existsSync, mkdtempSync, openSync as openCompletionDescriptor, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { basename, dirname, join } from "node:path";
import { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// TR-J-T3e (TOILRES T44/T58, Ruling 116): the scripts under test are loaded from a frozen copy of the plugin root, made
// once at load and removed in after(), so a parallel writer into the LIVE plugin tree cannot change what this suite
// runs against. Both imports must come from the same copy (see clone-hook-readiness.partial.test.mjs). The completion
// registration below stays on the live lib: it is the harness, not the code under test.
const LIVE_PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FROZEN_PLUGIN_ROOT = mkdtempSync(join(tmpdir(), "clone-hook-readiness-plugin-"));
after(() => { rmSync(FROZEN_PLUGIN_ROOT, { recursive: true, force: true, maxRetries: 3 }); });
cpSync(LIVE_PLUGIN_ROOT, FROZEN_PLUGIN_ROOT, { recursive: true });
// Proof that the copy, not the live tree, is what the case below runs against.
assert.notEqual(realpathSync.native(FROZEN_PLUGIN_ROOT), realpathSync.native(LIVE_PLUGIN_ROOT), "the plugin copy must not be the live plugin root");
for (const name of ["clone-hook-readiness.mjs", "check-clone-provisioning.mjs"]) {
  assert.ok(existsSync(join(FROZEN_PLUGIN_ROOT, "scripts", name)), `the frozen copy must carry ${name}`);
}
process.stderr.write(`# frozen plugin copy in use: ${basename(FROZEN_PLUGIN_ROOT)}\n`);
const frozenModule = (name) => import(pathToFileURL(join(FROZEN_PLUGIN_ROOT, "scripts", name)).href);

const { applyMandatoryHookReadiness, inspectMandatoryHookReadiness } = await frozenModule("clone-hook-readiness.mjs");
const { applyMandatoryHookGate, assessMandatoryHookReadiness } = await frozenModule("check-clone-provisioning.mjs");
const completionCases = [];
function test(name, optionsOrRun, possibleRun) {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun ?? {};
  const run = typeof optionsOrRun === "function" ? optionsOrRun : possibleRun;
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  const entry = { id: "CHR" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (options.skip === true) entry.mode = "skip";
  completionCases.push(entry);
}


test("non-repository roots never trigger Git initialization or hook writes", () => {
  const root = mkdtempSync(join(tmpdir(), "clone-hook-readiness-"));
  const gitVariables = ["GIT_CEILING_DIRECTORIES", "GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE"];
  const previous = new Map(gitVariables.map((name) => [name, process.env[name]]));
  try {
    for (const name of gitVariables) delete process.env[name];
    // Keep a scratch fixture from discovering an enclosing repository.
    process.env.GIT_CEILING_DIRECTORIES = dirname(root);
    assert.deepEqual(readdirSync(root), []);
    const observed = inspectMandatoryHookReadiness(root);
    assert.equal(observed.schema, "pipeline.mandatory-hook-readiness.v1");
    assert.equal(observed.status, "unresolved");
    assert.equal(observed.nextAction, null);
    assert.equal(applyMandatoryHookGate("ready", observed), "hook-provisioning-blocked");
    const applied = applyMandatoryHookReadiness(root, {
      applyPreCommit() { throw new Error("must not run"); },
      applyCommitMsg() { throw new Error("must not run"); },
    });
    assert.equal(applied.status, "refused");
    assert.equal(applied.nextAction, null);
    assert.deepEqual(readdirSync(root), [], "inspection and refusal must not initialize Git or write hooks");
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }

  const hooks = (statuses) => ({ checks: statuses.map((status, index) => ({
    id: ["pre-commit-hook", "commit-msg-hook"][index], status, path: "fixture hook", repairAction: null,
  })) });
  const observations = [
    [assessMandatoryHookReadiness(hooks(["current", "current"])), "ready"],
    [assessMandatoryHookReadiness(hooks(["install", "install"])), "hook-provisioning-required"],
    [assessMandatoryHookReadiness(hooks(["foreign-owner", "current"])), "hook-provisioning-blocked"],
    [assessMandatoryHookReadiness(hooks(["decline", "current"])), "hook-provisioning-blocked"],
    [assessMandatoryHookReadiness(hooks(["unresolved", "unresolved"])), "hook-provisioning-blocked"],
    [assessMandatoryHookReadiness(hooks(["current"])), "hook-provisioning-blocked"],
    [assessMandatoryHookReadiness(hooks(["unknown", "current"])), "hook-provisioning-blocked"],
    [undefined, "hook-provisioning-blocked"],
    [null, "hook-provisioning-blocked"],
    [{}, "hook-provisioning-blocked"],
    [{ status: "unknown" }, "hook-provisioning-blocked"],
  ];
  for (const [readiness, expected] of observations) {
    const gated = applyMandatoryHookGate("ready", readiness);
    assert.equal(gated, expected);
    assert.equal(gated === "ready", readiness?.status === "ready", "ready requires an explicit ready observation");
    for (const status of ["hook-provisioning-required", "hook-provisioning-blocked"]) {
      assert.equal(applyMandatoryHookGate(status, readiness), status, "a prior nonready status must be preserved");
    }
  }
});

if (completionCases.length !== 1) throw new Error("case completion count drift: expected 1, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
