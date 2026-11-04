// SPDX-License-Identifier: SUL-1.0
// C19-Q5 (AC-108): a node script that names the Pipeline control-plane directory is refused by the shell guard.
// Plain node:test file; fixtures are real files in a private temp project root, nothing is executed.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluateLifecycleReadyGuard } from "./evaluate.mjs";

const CODE = "GUARD-CONTROLPLANE-SCRIPT";
const root = realpathSync(mkdtempSync(join(tmpdir(), "cp-script-")));
test.after(() => rmSync(root, { recursive: true, force: true }));

function put(rel, text) {
  const file = join(root, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
  return file;
}
function run(command, toolName = "Bash") {
  return evaluateLifecycleReadyGuard({ tool_name: toolName, tool_input: { command } }, {
    projectDir: root,
    observeGovernanceScopeFn: () => ({ requiresEnforcement: true }),
  });
}
const refused = (result) => result.exitCode === 2 && result.stderr.includes(CODE);

test("a scratch script that joins .git and agent-pipeline is refused with the typed code", () => {
  put("scratch/join.mjs", "import { join } from 'node:path';\nconst p = join(root, '.git', 'agent-pipeline', 'x');\n");
  const result = run("node scratch/join.mjs");
  assert.ok(refused(result), result.stderr);
});

test("the literal .git/agent-pipeline is refused, also in the backslash spelling", () => {
  put("scratch/lit.mjs", "const p = '.git/agent-pipeline/publication-close/a.json';\n");
  assert.ok(refused(run("node scratch/lit.mjs")));
  put("scratch/win.mjs", "const p = '.git\\\\agent-pipeline\\\\a';\n");
  assert.ok(refused(run("node scratch/win.mjs")));
});

test("a git-dir expression combined with the literal agent-pipeline is refused", () => {
  put("scratch/gd.mjs", "const d = execSync('git rev-parse --git-common-dir');\nconst p = d + '/agent-pipeline/x';\n");
  assert.ok(refused(run("node scratch/gd.mjs")));
});

test("a harmless scratch script is not refused by this rule", () => {
  put("scratch/ok.mjs", "console.log('hello');\n");
  assert.ok(!refused(run("node scratch/ok.mjs")));
});

test("the plugin name in a comment without a .git segment is not refused", () => {
  put("scratch/comment.mjs", "// agent-pipeline plugin helper\nconsole.log('agent-pipeline');\n");
  assert.ok(!refused(run("node scratch/comment.mjs")));
});

test("a missing, an oversized and a symlinked script are not refused by this rule", () => {
  assert.ok(!refused(run("node scratch/missing.mjs")));
  put("scratch/big.mjs", `${"x".repeat(256 * 1024 + 1)}\n// .git/agent-pipeline\n`);
  assert.ok(!refused(run("node scratch/big.mjs")));
  const target = put("scratch/target.mjs", "const p = '.git/agent-pipeline';\n");
  symlinkSync(target, join(root, "scratch/link.mjs"));
  assert.ok(!refused(run("node scratch/link.mjs")));
});

test("a script under plugins/pipeline-core/ is exempt", () => {
  put("plugins/pipeline-core/scripts/sanctioned.mjs", "const p = '.git/agent-pipeline/x';\n");
  assert.ok(!refused(run("node plugins/pipeline-core/scripts/sanctioned.mjs")));
  // the one tracked script outside the plugin that owns control-plane housekeeping is exempt by exact path only
  put("scripts/housekeeping.mjs", "const p = '.git/agent-pipeline/x';\n");
  assert.ok(!refused(run("node scripts/housekeeping.mjs")));
  put("scripts/housekeeping-copy.mjs", "const p = '.git/agent-pipeline/x';\n");
  assert.ok(refused(run("node scripts/housekeeping-copy.mjs")));
});

test("an absolute node path and an absolute script path run the same scan", () => {
  const file = put("scratch/abs.mjs", "const p = '.git/agent-pipeline';\n");
  assert.ok(refused(run(`/usr/bin/node ${file}`)));
  assert.ok(refused(run("node scratch/abs.mjs", "PowerShell")));
});

test("the refusal applies after a chained cd and names the script and the matched spelling", () => {
  put("scratch/named.mjs", "const p = join(a, '.git', 'agent-pipeline');\n");
  const result = run("echo ready && node scratch/named.mjs --flag");
  assert.ok(refused(result));
  assert.match(result.stderr, /scratch\/named\.mjs/u);
  assert.match(result.stderr, /'\.git', 'agent-pipeline'/u);
  assert.match(result.stderr, /command-line argument/u);
});
