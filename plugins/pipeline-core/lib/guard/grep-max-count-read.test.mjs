// SPDX-License-Identifier: SUL-1.0
// A bounded grep read must not spend a guard refusal and a second dispatch turn.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluateLifecycleReadyGuard } from "./evaluate.mjs";
import { isReadOnlyDiagnosticCommand } from "./shell-grammar.mjs";

test("bounded max-count grep admits an exact passive file and retains denials", () => {
  const base = mkdtempSync(join(tmpdir(), "ac168-grep-"));
  const root = join(base, "project");
  try {
    mkdirSync(root);
    mkdirSync(join(root, ".aws"));
    writeFileSync(join(root, "scan.txt"), "needle\nneedle\n");
    writeFileSync(join(base, "outside.txt"), "needle\n");
    writeFileSync(join(root, ".aws", "credentials"), "synthetic fixture\n");
    const admitted = (command) => isReadOnlyDiagnosticCommand(command, root);
    assert.equal(admitted("grep -n -m 1 needle scan.txt"), true);
    assert.equal(admitted("grep --max-count 2 -n needle scan.txt"), true);
    const guard = evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command: "grep -n -m 1 needle scan.txt" } }, {
      projectDir: root,
      observeGovernanceScopeFn: () => ({ requiresEnforcement: true }),
      requireProjectOnboardingReadyFn() { throw new Error("passive read must not invoke lifecycle admission"); },
    });
    assert.equal(guard.exitCode, 0, guard.stderr);
    assert.equal(admitted("grep -m 0 needle scan.txt"), false);
    assert.equal(admitted("grep -m 501 needle scan.txt"), false);
    assert.equal(admitted("grep -m 1 -m 2 needle scan.txt"), false);
    assert.equal(admitted("grep -m 1 needle .aws/credentials"), false);
    assert.equal(admitted("grep -m 1 needle scan.txt > output.txt"), false);
    assert.equal(admitted("grep -m 1 needle $(touch scan.txt)"), false);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
