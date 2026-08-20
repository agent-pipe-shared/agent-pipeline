#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";

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

check("multi-file patches use bounded parallel guard fan-out", () => {
  const source = readFileSync(guard, "utf8");
  assert.match(source, /const MAX_PARALLEL_GUARDS = 12/u);
  assert.match(source, /async function runGuardsInParallel\(jobs\)/u);
  assert.match(source, /Promise\.all\(Array\.from\(\{ length: Math\.min\(MAX_PARALLEL_GUARDS/u);
  const patch = [
    "*** Begin Patch",
    ...Array.from({ length: 16 }, (_, index) => [
      `*** Update File: docs/parallel-${index}.md`,
      "@@",
      "-old",
      "+new",
    ]).flat(),
    "*** End Patch",
  ].join("\n");
  const result = run(patch);
  assert.equal(result.status, 0, result.stderr);
});

check("every governed patch target requires dispatch-ready lifecycle without path exemptions", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  for (const path of [
    "src/implementation.mjs",
    "docs/state.md",
    "DOCS/state.md",
    "specs/feature/spec.md",
    "Specs/feature/spec.md",
    ".claude/pipeline.json",
    ".CLAUDE/pipeline.json",
    "backlog/item.md",
    "BackLog/item.md",
    join(tmpdir(), "outside-lifecycle-guard.txt"),
  ]) {
    const patch = `*** Begin Patch\n*** Update File: ${path}\n@@\n-a\n+b\n*** End Patch`;
    blocked(run(patch, { root }), /guard-lifecycle-ready/);
  }
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

check("only guard-lifecycle-ready.mjs receives an explicit --runner codex argument; guard-testpath.mjs and guard-devplan.mjs keep their bare argv", () => {
  const source = readFileSync(guard, "utf8");
  const guardsBlock = source.slice(source.indexOf("const GUARDS ="), source.indexOf("function block("));
  assert.match(guardsBlock, /guard-testpath\.mjs.*args:\s*\[\]/su);
  assert.match(guardsBlock, /guard-devplan\.mjs.*args:\s*\[\]/su);
  assert.match(guardsBlock, /guard-lifecycle-ready\.mjs.*args:\s*\["--runner",\s*"codex"\]/su);
});

check("the lifecycle guard is invoked per patched path with an explicit codex runner even when CLAUDECODE=1 is present in its environment (regression pin for ready-gate-env-var-runner-authority, second production caller)", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const patch = "*** Begin Patch\n*** Update File: src/a.mjs\n*** End Patch";
  const input = JSON.stringify({ tool_name: "apply_patch", tool_input: { command: patch } });
  const result = spawnSync(process.execPath, [guard], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDECODE: "1" },
    encoding: "utf8",
    input,
  });
  // A malformed/absent --runner makes guard-lifecycle-ready.mjs's own main()
  // fail closed before ever reaching the gate, which surfaces only the
  // generic "exact V4 ready result" message with no typed lifecycle status.
  // Reaching the specific "session readiness is <status>" message proves an
  // explicit, valid runner was threaded through and the gate was actually
  // consulted -- despite CLAUDECODE=1 being present in the environment.
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /guard-lifecycle-ready/);
  assert.match(result.stderr, /Pipeline session readiness is/u);
  assert.doesNotMatch(result.stderr, /exact V4 ready result for session intent/u);
});

check("architectural invariant: evaluateLifecycleReadyGuard's own outer tool-name gate still does not recognize apply_patch -- a raw, untranslated call reaching it directly is admitted unconditionally even against a governed path that the identical path in translated Edit shape blocks (regression pin for backlog: raw-apply_patch-is-unconditionally-admitted-by-the-outer-lifecycle-gate; if this ever stops holding, guard-apply-patch.mjs's translate-first comment needs re-reading before anyone relies on the outer gate alone)", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const filePath = "src/governed.mjs";
  const patch = `*** Begin Patch\n*** Update File: ${filePath}\n@@\n-a\n+b\n*** End Patch`;
  const raw = evaluateLifecycleReadyGuard(
    { tool_name: "apply_patch", tool_input: { command: patch } },
    { runner: "codex", projectDir: root },
  );
  assert.equal(raw.exitCode, 0, `expected the raw, untranslated apply_patch call to be silently admitted by the outer gate; got ${JSON.stringify(raw)}`);
  const translated = evaluateLifecycleReadyGuard(
    { tool_name: "Edit", tool_input: { file_path: filePath } },
    { runner: "codex", projectDir: root },
  );
  assert.notEqual(translated.exitCode, 0, "the translated Edit shape for the identical governed path is expected to be gated -- if this also returns 0, the contrast this test relies on to prove translation matters is gone.");
});

check("architectural invariant: guard-apply-patch.mjs's spawn loop synthesizes a bare Edit shape for guard-lifecycle-ready.mjs, never the original apply_patch tool_name or command envelope (regression pin: this is the only translation boundary before evaluateLifecycleReadyGuard, which does not itself recognize apply_patch)", () => {
  const source = readFileSync(guard, "utf8");
  const loopStart = source.indexOf("const jobs = paths.flatMap");
  assert.ok(loopStart >= 0, "expected to find the per-path translation jobs in guard-apply-patch.mjs");
  const loopBlock = source.slice(loopStart);
  assert.match(loopBlock, /input:\s*JSON\.stringify\(\{\s*tool_name:\s*"Edit",\s*tool_input:\s*\{\s*file_path:\s*filePath\s*\}\s*\}\)/su);
  assert.doesNotMatch(loopBlock, /tool_name:\s*toolName/u);
  assert.doesNotMatch(loopBlock, /tool_name:\s*"apply_patch"/u);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`1..${passed}\n`);
