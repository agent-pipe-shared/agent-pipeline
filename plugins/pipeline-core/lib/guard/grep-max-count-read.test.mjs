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

// C21 (AC-108, live findings 12 and 16): `grep -n -C 5 <word> <file>` cost every Antigravity worker two refused calls. The context flags -A, -B and -C
// are display only (they print neighbouring lines of an operand the checks already admitted), so a bounded number is admitted in the separate and the
// attached spelling; nothing else about the closed grep grammar moves.
test("C21 grep context flags -A -B -C take a 1..3 digit number (separate or attached) on an exact passive file; every other form stays refused", () => {
  const base = mkdtempSync(join(tmpdir(), "c21-grep-"));
  const root = join(base, "project");
  try {
    mkdirSync(root);
    mkdirSync(join(root, ".aws"));
    writeFileSync(join(root, "scan.txt"), "needle\nneedle\n");
    writeFileSync(join(base, "outside.txt"), "needle\n");
    writeFileSync(join(root, ".aws", "credentials"), "synthetic fixture\n");
    const admitted = (command) => isReadOnlyDiagnosticCommand(command, root);
    for (const command of [
      "grep -n -C 5 needle scan.txt", "grep -C5 needle scan.txt", "grep -n -C5 needle scan.txt", "grep -A 2 needle scan.txt", "grep -B3 needle scan.txt",
      "grep -n -A 2 -B 3 needle scan.txt", "grep -A2 -B3 -n needle scan.txt", "grep -m 1 -C 2 needle scan.txt", "grep -C 999 needle scan.txt",
      "grep -C 0 needle scan.txt", "grep -n -C 5 -- needle scan.txt", "grep -n -C 5 needle scan.txt | head -20", "grep -n -C 5 needle scan.txt | grep -n x",
    ]) assert.equal(admitted(command), true, command);
    const guard = evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command: "grep -n -C 5 needle scan.txt" } }, {
      projectDir: root,
      observeGovernanceScopeFn: () => ({ requiresEnforcement: true }),
      requireProjectOnboardingReadyFn() { throw new Error("passive read must not invoke lifecycle admission"); },
    });
    assert.equal(guard.exitCode, 0, guard.stderr);
    for (const command of [
      "grep -C 1000 needle scan.txt", "grep -C -1 needle scan.txt", "grep -C x needle scan.txt", "grep -C needle scan.txt", "grep -C", "grep -C 5 -C 6 needle scan.txt",
      "grep -C5 -C5 needle scan.txt", "grep -A 2 -A 3 needle scan.txt", "grep -C 05x needle scan.txt", "grep -nC5 needle scan.txt", "grep -C 5 needle .aws/credentials",
      "grep -C 5 needle scan.txt > output.txt", "grep -C 5 needle $(touch scan.txt)", "grep -C 5 -f scan.txt scan.txt",
      // QG-04, restated in place (PO decision of 2026-11-09, recursive grep with --include/--exclude/--exclude-dir filters): `--include '*.txt'` is an admitted
      // filter now; the unadmitted long option this row stood for (a value-taking option the grammar does not know) is `--exclude-from`, which stays refused.
      "grep -C 5 --exclude-from scan.txt needle scan.txt", "grep --context 5 needle scan.txt", "grep --context=5 needle scan.txt", "grep -C 5 --pre cat needle scan.txt",
      "grep -C 5 needle", "grep -C 5 needle scan.txt | tee out.txt",
    ]) assert.equal(admitted(command), false, command);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
