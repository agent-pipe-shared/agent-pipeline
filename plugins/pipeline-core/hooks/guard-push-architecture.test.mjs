// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) { completionCases.push({ id: "GPA001", name, run }); }

const guard = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));

test("stale map blocks strict push and explicit checkpoint persists typed debt", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-push-architecture-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const runGuard = (command) => spawnSync(process.execPath, [guard], {
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("checkout", "-q", "-b", "feat/map-debt");
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: required\npushDestinationPolicy:\n  schema: pipeline.push-destination-policy.v1\n  checkpointNamespace: refs/heads/feat/\n");
    writeFileSync(join(dir, ".claude", "pipeline.json"), JSON.stringify({ project: "fixture", verify: null, autonomy: "gated", handover: "README.md" }));
    mkdirSync(join(dir, "architecture", "map"), { recursive: true });
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "architecture", "map", "index.md"), "# Map\n");
    writeFileSync(join(dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core\n");
    writeFileSync(join(dir, "src", "contract.mjs"), "export const value = 1;\n");
    git("add", "."); git("commit", "-q", "-m", "map baseline");
    writeFileSync(join(dir, "src", "contract.mjs"), "export const value = 2;\n");
    git("add", "."); git("commit", "-q", "-m", "contract change\n\nCheckpoint-Intent: backup before map refresh");
    const strict = runGuard("git push origin feat/map-debt:refs/heads/release/0.7");
    assert.equal(strict.status, 2, `${strict.stderr}\n${strict.stdout}`);
    assert.match(strict.stderr, /final candidate needs a current architecture map/u);
    const checkpoint = runGuard("git push origin feat/map-debt:refs/heads/feat/map-debt");
    assert.equal(checkpoint.status, 0, checkpoint.stderr);
    const records = readFileSync(join(dir, ".git", "agent-pipeline", "feature-checkpoint-audit.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(records.at(-1).commit, git("rev-parse", "HEAD"));
    assert.equal(records.at(-1).stalenessDebt[0].type, "architecture-map-stale");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
