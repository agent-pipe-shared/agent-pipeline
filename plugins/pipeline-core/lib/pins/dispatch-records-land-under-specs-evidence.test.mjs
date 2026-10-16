// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.dispatch-records-land-under-specs-evidence (AC-165).
// Acceptance (item Proposal): (A) the dispatch-record path in the Goldfish template (canonical + vendored copy) is stated as the
// repository-root evidence/, never a specs/**/evidence/ directory; (B) the guard rejects a dispatch record written outside the
// repository-root evidence/ (module level and through the live evaluator), while the canonical root path stays admitted.
// Real module, no mocks of the behaviour under test; only the module's documented injection seams are used. No fixture needs directory
// mode bits or directory symlinks, so no case is skipped on the native Windows host.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DISPATCH_RECORD_PATH_DENIAL_CODE, blockedDispatchRecordCollision, checkDispatchRecordCollision,
} from "../guard/dispatch-record-lane.mjs";
import { evaluateLifecycleReadyGuard } from "../guard/evaluate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const top = spawnSync("git", ["-C", here, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
assert.equal(top.status, 0, top.stderr);
const repoRoot = realpathSync(top.stdout.trim());
const deps = { gitCommitForTaskIdFn: () => null, readFileSyncFn: readFileSync };
const open = id => JSON.stringify({ taskId: id, outcome: "in-progress", commits: [], log: [] });
const collide = (fn, relPath, id = "PIN-165") => fn({
  relPath, requested: join(repoRoot, relPath), payload: open(id), root: repoRoot, input: null, dependencies: deps });

// ---- assertion helpers, run against the real code AND a scratch mirror that lacks the behaviour (RED proof) ----
function assertRefusesMisplaced(fn, relPath, id) {
  const hit = collide(fn, relPath, id);
  assert.notEqual(hit, null, `${relPath} must be refused`);
  assert.equal(hit.code, DISPATCH_RECORD_PATH_DENIAL_CODE);
  assert.match(hit.reason, /repository-root evidence\/dispatch-record-/);
  assert.equal(hit.taskId, id);
}
function assertTemplateStatesRoot(text) {
  const line = text.split("\n").find(l => l.includes("Dispatch record (standard evidence)"));
  assert.ok(line, "template has the dispatch-record path bullet");
  assert.match(line, /evidence\/dispatch-record-\{\{TASK_ID\}\}\.json/);
  assert.match(line, /REPOSITORY ROOT/);
  assert.match(line, /never a `specs\/\*\*\/evidence\/` directory/);
}

const MISPLACED = [
  ["specs feature evidence dir", "specs/sprint-alfred-epic/evidence/dispatch-record-PIN-165.json"],
  ["backlog evidence dir", "backlog/evidence/dispatch-record-PIN-165.json"],
  ["nested dir under root evidence", "evidence/nested/dispatch-record-PIN-165.json"],
  ["arbitrary directory", "docs/dispatch-record-PIN-165.json"],
  ["repository root file", "dispatch-record-PIN-165.json"],
];

test("A-1 canonical Goldfish template states the repository-root evidence/ and forbids specs/**/evidence/", () => {
  assertTemplateStatesRoot(readFileSync(join(repoRoot, "templates/prompts/goldfish-task.md"), "utf8"));
});

test("A-2 vendored plugin copy of the template carries the same dispatch-record path wording", () => {
  const canonical = readFileSync(join(repoRoot, "templates/prompts/goldfish-task.md"), "utf8");
  const vendored = readFileSync(join(repoRoot, "plugins/pipeline-core/templates/prompts/goldfish-task.md"), "utf8");
  assertTemplateStatesRoot(vendored);
  const pick = t => t.split("\n").find(l => l.includes("Dispatch record (standard evidence)"));
  assert.equal(pick(vendored), pick(canonical));
});

for (const [label, relPath] of MISPLACED) {
  test(`B-1 module refuses a dispatch record at a non-root location: ${label}`, () => {
    assertRefusesMisplaced(checkDispatchRecordCollision, relPath, "PIN-165");
  });
}

test("B-2 the canonical repository-root path is NOT refused as misplaced", () => {
  assert.equal(collide(checkDispatchRecordCollision, "evidence/dispatch-record-PIN-165.json"), null);
});

test("B-3 non-dispatch-record files under specs evidence are untouched by the path rule", () => {
  assert.equal(collide(checkDispatchRecordCollision, "specs/sprint-alfred-epic/evidence/result-PIN-165.json"), null);
});

test("B-4 the denial message names the canonical path for the refused record", () => {
  const relPath = MISPLACED[0][1];
  const hit = collide(checkDispatchRecordCollision, relPath);
  const verdict = blockedDispatchRecordCollision(relPath, hit);
  const text = JSON.stringify(verdict);
  assert.match(text, /GUARD-DISPATCH-RECORD-PATH/);
  assert.match(text, /evidence\/dispatch-record-PIN-165\.json/);
});

const evaluate = (relPath, toolName = "Write") => evaluateLifecycleReadyGuard(
  { tool_name: toolName, tool_input: toolName === "Write"
      ? { file_path: join(repoRoot, relPath), content: open("PIN-165") }
      : { file_path: join(repoRoot, relPath), old_string: "x", new_string: open("PIN-165") } },
  { projectDir: repoRoot, ...deps });

test("B-5 the live guard evaluator blocks a Write of a misplaced dispatch record (exit 2, GUARD-DISPATCH-RECORD-PATH)", () => {
  const verdict = evaluate(MISPLACED[0][1]);
  assert.equal(verdict?.exitCode, 2, JSON.stringify(verdict));
  assert.match(JSON.stringify(verdict), /GUARD-DISPATCH-RECORD-PATH/);
});

test("B-6 the live guard evaluator blocks an Edit of a misplaced dispatch record", () => {
  const verdict = evaluate(MISPLACED[0][1], "Edit");
  assert.equal(verdict?.exitCode, 2, JSON.stringify(verdict));
  assert.match(JSON.stringify(verdict), /GUARD-DISPATCH-RECORD-PATH/);
});

test("B-7 the live guard evaluator does not raise the PATH denial for the canonical root path", () => {
  const verdict = evaluate("evidence/dispatch-record-PIN-165.json");
  assert.doesNotMatch(JSON.stringify(verdict ?? {}), /GUARD-DISPATCH-RECORD-PATH/);
});

// ---- RED proofs: the same assertions must FAIL against scratch mirrors that lack the behaviour ----
test("RED-1 the misplaced-path assertion fails against a mirror without the rule (proves B-1 is meaningful)", () => {
  assert.throws(() => assertRefusesMisplaced(() => null, MISPLACED[0][1], "PIN-165"));
});

test("RED-2 the template assertion fails against wording that does not name the repository root (proves A-1/A-2 are meaningful)", () => {
  const vague = "- **Dispatch record (standard evidence):** write `evidence/dispatch-record-{{TASK_ID}}.json` next to the result file.";
  assert.throws(() => assertTemplateStatesRoot(vague));
});
