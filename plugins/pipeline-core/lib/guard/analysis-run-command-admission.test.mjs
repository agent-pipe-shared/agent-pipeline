// SPDX-License-Identifier: SUL-1.0
// C19 F2b (AC-108): the shell guard admits the analysis-run command by its exact argument shape only.
import assert from "node:assert/strict";
import { join } from "node:path";
import { registerTestCaseCompletion } from "../test-case-completion.mjs";
import { isSanctionedLifecycleCommand } from "./command-catalogue.mjs";
import { resolveSanctionedScriptInvocation } from "./sanctioned-args-scripts.mjs";
import { ANALYSIS_RUN_SCRIPT } from "./constants.mjs";
import { devPlanShellRefusalHit } from "./devplan-shell-lane.mjs";

const root = process.cwd();
const script = "plugins/pipeline-core/scripts/analysis-run.mjs";
const cases = [];
function test(name, run) { cases.push({ id: `ARA${String(cases.length + 1).padStart(3, "0")}`, name, run }); }
const run = (args, path = script) => `node ${path} ${args}`;

test("the script constant names the plugin analysis-run CLI", () => {
  assert.equal(ANALYSIS_RUN_SCRIPT, join(root, script));
  assert.equal(resolveSanctionedScriptInvocation(run("--root ."), root)?.script, ANALYSIS_RUN_SCRIPT);
});

test("only the closed argument shape is admitted", () => {
  const admitted = [
    "--root .",
    `--root ${root}`,
    `--timeout-seconds 900 --commit HEAD --root ${root}`,
    "--root . --commit abc1234",
    `--root . --commit ${"a".repeat(40)} --timeout-seconds 1`,
    "--root . --timeout-seconds 1800",
  ];
  for (const args of admitted) assert.equal(isSanctionedLifecycleCommand(run(args), root), true, args);
  const refused = [
    "", "--commit HEAD", "--root", "--root /elsewhere", "--root ./", "--root ..", "--root=.",
    "--root . --unknown x", "--root . --root .", "--root . --commit HEAD --commit HEAD",
    "--root . --timeout-seconds 5 --timeout-seconds 5", "--root . --commit=HEAD", "--root . --timeout-seconds=5",
    "--root . --commit -x", "--root . --commit ../x", "--root . --commit a/b", "--root . --commit main:x",
    "--root . --commit abc123", "--root . --commit ABCDEF1", `--root . --commit ${"a".repeat(41)}`,
    "--root . --commit head", "--root . --timeout-seconds 0", "--root . --timeout-seconds 1801",
    "--root . --timeout-seconds 1e3", "--root . --timeout-seconds -5", "--root . --timeout-seconds 05x",
    "--root . --commit", "--root . --timeout-seconds", "--root . --commit HEAD extra", "--root . extra",
    "--root . --commit HEAD --timeout-seconds 5 --extra",
  ];
  for (const args of refused) assert.equal(isSanctionedLifecycleCommand(run(args), root), false, args);
  assert.equal(isSanctionedLifecycleCommand("node --test x.test.mjs", root), false);
  assert.equal(isSanctionedLifecycleCommand(run("--root .", "scratch/analysis-run.mjs"), root), false);
  assert.equal(isSanctionedLifecycleCommand(run("--root .", "plugins/pipeline-core/scripts/other.mjs"), root), false);
});

test("the Dev-Plan lane exempts only the admitted shape from the opaque-script candidate", () => {
  const candidates = (command) => {
    const observed = [];
    devPlanShellRefusalHit(command, root, {
      extractShellWriteTargetsFn: () => [],
      devPlanGateVerdictFn: ({ filePath, forceLifecycleGate }) => { observed.push({ filePath, forceLifecycleGate: forceLifecycleGate === true }); return { verdict: "allow" }; },
    });
    return observed;
  };
  assert.deepEqual(candidates(run("--root .")), []);
  assert.deepEqual(candidates(run(`--root ${root} --commit HEAD --timeout-seconds 900`)), []);
  assert.deepEqual(candidates(run("--root . --extra")), [{ filePath: script, forceLifecycleGate: true }]);
  assert.deepEqual(candidates(run("--root . --commit ../x")), [{ filePath: script, forceLifecycleGate: true }]);
  assert.deepEqual(candidates(run("--root .", "plugins/pipeline-core/scripts/other.mjs")),
    [{ filePath: "plugins/pipeline-core/scripts/other.mjs", forceLifecycleGate: true }]);
  assert.deepEqual(candidates(run("--root .", "scratch/analysis-run.mjs")),
    [{ filePath: "scratch/analysis-run.mjs", forceLifecycleGate: true }]);
  assert.deepEqual(candidates("node --test x.test.mjs"), [{ filePath: "x.test.mjs", forceLifecycleGate: true }]);
});

if (cases.length !== 3) throw new Error("analysis-run admission case count drift");
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
