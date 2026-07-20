#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const guard = join(dirname(fileURLToPath(import.meta.url)), "guard-apply-patch.mjs");
let passed = 0;

function fixture(protectedPattern = null) {
  const root = mkdtempSync(join(tmpdir(), "guard-apply-patch-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  if (protectedPattern) {
    writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({
      protectedTestPaths: [{ id: "PATCH-LOCK", pattern: protectedPattern, reason: "locked by test" }],
    }));
  }
  return root;
}

function run(command, { root = fixture(), raw = false } = {}) {
  const input = raw ? command : JSON.stringify({ tool_name: "apply_patch", tool_input: { command } });
  return spawnSync(process.execPath, [guard], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
    input,
  });
}

function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function blocked(result, pattern) {
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, pattern);
}

check("valid Add/Update/Delete/Move paths are extracted and checked", () => {
  const patch = [
    "*** Begin Patch",
    "*** Add File: docs/new.md",
    "+new",
    "*** Update File: src/old.mjs",
    "*** Move to: src/new.mjs",
    "@@",
    "-old",
    "+new",
    "*** Delete File: docs/obsolete.md",
    "*** End Patch",
  ].join("\n");
  const result = run(patch);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

check("every extracted path is subjected to the configured write guard", () => {
  const root = fixture("locked\\.test\\.mjs$");
  const patch = "*** Begin Patch\n*** Update File: src/safe.mjs\n@@\n-a\n+b\n*** Update File: locked.test.mjs\n@@\n-a\n+b\n*** End Patch";
  blocked(run(patch, { root }), /PATCH-LOCK/);
});

check("invalid JSON, missing command and ambiguous envelopes block", () => {
  blocked(run("not-json", { raw: true }), /not valid JSON/);
  const missing = spawnSync(process.execPath, [guard], { encoding: "utf8", input: JSON.stringify({ tool_name: "apply_patch", tool_input: {} }) });
  blocked(missing, /missing or malformed/);
  for (const patch of [
    "*** Update File: src/a.mjs\n*** End Patch",
    "*** Begin Patch\n*** Update File: src/a.mjs",
    "*** Begin Patch\n*** End Patch",
    "*** Begin Patch\n*** Begin Patch\n*** Update File: src/a.mjs\n*** End Patch",
  ]) blocked(run(patch), /envelope|Begin Patch|no unambiguous file paths/);
});

check("content before the first operation and unknown patch headers block", () => {
  blocked(run("*** Begin Patch\nstray content\n*** Update File: src/a.mjs\n*** End Patch"), /before the first file operation/);
  blocked(run("*** Begin Patch\n*** Rename File: src/a.mjs\n*** End Patch"), /unknown or ambiguous patch header/);
});

check("empty, traversal, doubled-separator and whitespace paths block", () => {
  for (const path of ["", "../outside", "src/../outside", "src//a.mjs", "src/a.mjs ", "src/"]) {
    const patch = `*** Begin Patch\n*** Update File: ${path}\n*** End Patch`;
    blocked(run(patch), /ambiguous Update File path|empty, traversal, or ambiguous Update File path/);
  }
});

check("Move to is accepted only after Update File", () => {
  blocked(run("*** Begin Patch\n*** Move to: src/new.mjs\n*** End Patch"), /without a preceding Update File/);
  blocked(run("*** Begin Patch\n*** Add File: src/a.mjs\n*** Move to: src/b.mjs\n*** End Patch"), /without a preceding Update File/);
  blocked(run("*** Begin Patch\n*** Update File: src/a.mjs\n*** Move to: src/b.mjs\n*** Move to: src/c.mjs\n*** End Patch"), /without a preceding Update File/);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`1..${passed}\n`);
