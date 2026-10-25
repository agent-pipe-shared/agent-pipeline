// SPDX-License-Identifier: SUL-1.0
// Pin: K152 part 3 (greenfield finding G7). The Antigravity references demand three scripts before the first
// implementation dispatch: scripts/model-role-bootstrap.mjs, scripts/antigravity-native-dispatch-prepare.mjs and
// scripts/design-review-receipt.mjs. In lifecycle `draft` the first two were refused by the shell guard as
// GUARD-DEVPLAN-SHELL because the closed command catalogue (lib/guard/command-catalogue.mjs) did not know them.
// Each is admitted by exactly its documented argv shape (the script's own parser), never by widening a generic rule.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import nodeTest from "node:test";
import { registerTestCaseCompletion } from "../test-case-completion.mjs";
import { fileURLToPath } from "node:url";
import { isSanctionedLifecycleCommand } from "../guard/command-catalogue.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { evaluateLifecycleReadyGuard } from "../guard/evaluate.mjs";
import { devPlanGateVerdict } from "../guard-devplan-policy.mjs";
import { ProjectOnboardingReadyError } from "../project-onboarding-ready-gate.mjs";

const scripts = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts");
const bootstrap = join(scripts, "model-role-bootstrap.mjs");
const prepare = join(scripts, "antigravity-native-dispatch-prepare.mjs");
const receipt = join(scripts, "design-review-receipt.mjs");
const root = mkdtempSync(join(tmpdir(), "k152-draft-scripts-"));
nodeTest.after(() => rmSync(root, { recursive: true, force: true }));
const admitted = (command) => isSanctionedLifecycleCommand(command, root);
const cases = [];
function test(name, run) { cases.push({ id: `K152C${String(cases.length + 1).padStart(3, "0")}`, name, run }); }

test("K152: model-role-bootstrap is admitted with exactly its documented argv shapes", () => {
  assert.equal(admitted(`node ${bootstrap} --repo-root ${root} --runner antigravity --host-session-id sess-1234`), true);
  assert.equal(admitted(`node ${bootstrap} --repo-root ${root} --runner claude`), true);
  assert.equal(admitted(`node ${bootstrap} --repo-root ${root} --runner codex`), true);
});

test("K152: model-role-bootstrap stays refused for any other argv shape", () => {
  const other = mkdtempSync(join(tmpdir(), "k152-other-root-"));
  try {
    for (const tail of [
      `--repo-root ${other} --runner claude`,                                      // a different root
      `--repo-root ${root} --runner bogus`,                                        // an unknown runner
      `--repo-root ${root} --runner claude --extra`,                               // an extra argument
      `--repo-root ${root} --runner claude --host-session-id`,                     // a flag without its value
      `--repo-root ${root} --runner antigravity --host-session-id $(id)`,         // an unsafe session id
      `--runner claude --repo-root ${root}`,                                       // wrong order
      "",                                                                          // no arguments
    ]) assert.equal(admitted(`node ${bootstrap} ${tail}`.trim()), false, tail);
  } finally { rmSync(other, { recursive: true, force: true }); }
});

test("K152: antigravity-native-dispatch-prepare is admitted with exactly `prepare --root <root> --request <json>`", () => {
  assert.equal(admitted(`node ${prepare} prepare --root ${root} --request scratch/native-dispatch-request.json`), true);
  assert.equal(admitted(`node ${prepare} prepare --root ${root} --request evidence/native-dispatch-request.json`), true);
});

test("K152: antigravity-native-dispatch-prepare stays refused for any other argv shape", () => {
  const other = mkdtempSync(join(tmpdir(), "k152-other-root-"));
  try {
    for (const tail of [
      `prepare --root ${other} --request scratch/r.json`,                          // a different root
      `prepare --root ${root} --request ../outside.json`,                          // traversal
      `prepare --root ${root} --request /etc/passwd`,                              // absolute request path
      `prepare --root ${root} --request scratch/r.sh`,                             // not a json request
      `prepare --root ${root} --request src/r.json`,                               // not an input directory
      `prepare --root ${root} --request scratch/r.json --apply`,                   // an extra argument
      `apply --root ${root} --request scratch/r.json`,                             // another subcommand
      `--root ${root} --request scratch/r.json`,                                   // no subcommand
      "",
    ]) assert.equal(admitted(`node ${prepare} ${tail}`.trim()), false, tail);
  } finally { rmSync(other, { recursive: true, force: true }); }
});

test("K152: no other script of the plugin is admitted by these pins (design-review-receipt keeps its own closed grammar)", () => {
  assert.equal(admitted(`node ${join(scripts, "model-role-bootstrap-extra.mjs")} --repo-root ${root} --runner claude`), false);
  assert.equal(admitted(`node ${join(root, "scratch", "model-role-bootstrap.mjs")} --repo-root ${root} --runner claude`), false);
  assert.equal(admitted(`node ${receipt} create`), false, "an incomplete design-review-receipt argv is refused");
  assert.equal(admitted(`node ${receipt}`), false);
});

if (cases.length !== 5) throw new Error("K152 admission case count drift");

// Supplementary controlled Source tests. The original five examiners and their
// order remain above. Fixture state and readiness dependencies are test doubles,
// never native bootstrap, model, receipt, signature or approval authority.
function draftFixture() {
  const owned = join(scripts, "..", "..", "..", "scratch", "agent-out", "g7-draft-route-qualification");
  mkdirSync(owned, { recursive: true });
  const base = mkdtempSync(join(owned, "fixture-"));
  const project = join(base, "project"), home = join(base, "home"), common = join(base, "common");
  for (const dir of [join(project, ".claude"), join(project, "specs", "g7"), join(project, "evidence"), home, common]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(project, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n");
  writeFileSync(join(project, ".claude", "pipeline-state.json"), JSON.stringify({ schema: "pipeline.state.v0", activeFeature: { id: "g7", planPath: "specs/g7/prd.md", phase: "design" }, planApproved: false }));
  for (const name of ["report.md", "prd.md", "spec.md"]) writeFileSync(join(project, "specs", "g7", name), "synthetic fixture input\n");
  const dependencies = {
    projectDir: project, homedirFn: () => home, resolveGitCommonDirFn: () => common,
    observeGovernanceScopeFn: () => ({ requiresEnforcement: true }),
    resolveRebaseAuthorityFn: () => null,
    inspectProjectOnboardingV3Fn: () => ({ status: "ready", lifecycleStatus: "draft" }),
    requireProjectOnboardingReadyFn: () => { throw new ProjectOnboardingReadyError("PORG-NOT-READY", "synthetic draft", { intent: "session", lifecycleStatus: "draft" }); },
    consumeHumanGuardOverrideFn: () => ({ status: "absent" }),
    recordHumanGuardDenialFn: () => ({ status: "unavailable" }),
    readHumanApprovalModeFn: () => ({ mode: "signature" }),
  };
  return {
    project,
    receiptCommand: `node ${receipt} create --repo ${project} --feature g7 --report specs/g7/report.md --prd specs/g7/prd.md --spec specs/g7/spec.md --out evidence/g7.json`,
    run(command) { return evaluateLifecycleReadyGuard({ tool_name: "Bash", cwd: project, tool_input: { command } }, dependencies); },
    cleanup() { rmSync(base, { recursive: true, force: true }); },
  };
}

test("G7: complete receipt-create is admitted by the actual catalogue", () => {
  const fx = draftFixture();
  try { assert.equal(isSanctionedLifecycleCommand(fx.receiptCommand, fx.project), true); }
  finally { fx.cleanup(); }
});

test("G7: all three complete forms pass actual draft lifecycle admission", () => {
  const fx = draftFixture();
  try {
    const blocked = devPlanGateVerdict({ filePath: "src/control.mjs", projectDir: fx.project });
    assert.equal(blocked.verdict, "block");
    assert.equal(blocked.lifecycleStatus, "draft");
    for (const command of [
      `node ${bootstrap} --repo-root ${fx.project} --runner antigravity --host-session-id g7-session`,
      `node ${prepare} prepare --root ${fx.project} --request scratch/request.json`,
      fx.receiptCommand,
    ]) assert.deepEqual(fx.run(command), { exitCode: 0, stderr: "" }, command);
  } finally { fx.cleanup(); }
});

test("G7: malformed and foreign forms remain refused through actual draft lifecycle", () => {
  const fx = draftFixture();
  try {
    for (const command of [
      `node ${bootstrap} --repo-root ${fx.project}/foreign --runner antigravity`,
      `node ${bootstrap} --repo-root ${fx.project} --runner bogus`,
      `node ${prepare} prepare --root ${fx.project}/foreign --request scratch/request.json`,
      `node ${prepare} prepare --root ${fx.project} --request ../outside.json`,
      `node ${receipt} create`,
      fx.receiptCommand.replace(`--repo ${fx.project}`, `--repo ${fx.project}/foreign`),
      fx.receiptCommand.replace("--spec specs/g7/spec.md ", ""),
      fx.receiptCommand.replace("specs/g7/report.md", "../outside.md"),
      `${fx.receiptCommand} --extra value`,
    ]) {
      assert.equal(isSanctionedLifecycleCommand(command, fx.project), false, command);
      const result = fx.run(command);
      assert.equal(result.exitCode, 2, command);
      assert.match(result.stderr, /GUARD-DEVPLAN-SHELL/u, command);
    }
  } finally { fx.cleanup(); }
});
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
