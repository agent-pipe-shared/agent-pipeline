// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "../test-case-completion.mjs";
import { isBoundedSingleRg, parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { isSanctionedLifecycleCommand } from "./command-catalogue.mjs";
import { isMissingSingleReadTarget, readToolScopeVerdict } from "./read-scope.mjs";
import { isReadOnlyDiagnosticCommand } from "./shell-grammar.mjs";

const script = fileURLToPath(new URL("../../scripts/po-human-approval.mjs", import.meta.url));
const fixtureBase = resolve("scratch");
const cases = [];
function test(name, run) { cases.push({ id: `G23C${String(cases.length + 1).padStart(3, "0")}`, name, run }); }

test("G23 bounded repeated rg globs preserve hidden and credential exclusions", () => {
  mkdirSync(fixtureBase, { recursive: true });
  const root = mkdtempSync(join(fixtureBase, "g23-read-"));
  try {
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "a.md"), "safe\n");
    assert.equal(isBoundedSingleRg(["-n", "safe", "docs", "-g", "*.md", "-g", "*.txt"], root), true);
    // D232 restates this case (intent kept: a filter may only narrow): a NEGATED filter excludes and so only narrows, it is admitted;
    // every positive filter outside the closed extension grammar, a hidden name, a traversal and a path pattern stay refused.
    for (const good of ["!*.patch", "!*.min.js", "!**/*.log", "!node_modules", "!scratch/"]) {
      assert.equal(isBoundedSingleRg(["-l", "safe", "docs", "-g", "*.md", "-g", good], root), true, good);
    }
    assert.equal(isBoundedSingleRg(["safe", "docs", "--glob", "!*.patch"], root), true, "negated filter alone, long spelling");
    for (const bad of [".*", "../*.md", "**/*.md", "*.tar.gz", "!.*", "!../x", "!/abs", "!a/b", "!*.{md,txt}", "!", "!*", "!-x", "!*.a.b.c.d"]) {
      assert.equal(isBoundedSingleRg(["safe", "docs", "-g", "*.md", "-g", bad], root), false, bad);
    }
    assert.equal(isBoundedSingleRg(["safe", "docs", "-g", "*.md", "--pre", "run"], root), false);
    // D232 measured, not changed: the source grammar already admits `ls -l`, `-h` and their clusters on an admitted directory (the generic
    // read lane takes any flag); only a path outside the project root or a missing operand ends in a refusal. Pinned so it stays.
    for (const good of ["ls -lh docs", "ls -l docs", "ls -h docs", "ls -lah docs", "ls -1 docs", "ls -a docs"]) {
      assert.equal(isReadOnlyDiagnosticCommand(good, root), true, good);
    }
    for (const bad of ["ls -lh ../", "ls -lh /etc"]) {
      assert.equal(isReadOnlyDiagnosticCommand(bad, root), false, bad);
    }
    // The full command line through the shell grammar: a negated filter in either spelling, and a positive one as before.
    for (const good of ["rg -l safe docs --glob '!*.patch'", "rg -l safe docs -g '!node_modules'", "rg -l safe docs -g '*.md'"]) {
      assert.equal(isReadOnlyDiagnosticCommand(good, root), true, good);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("G23 exact source-owned PO help is a pure CLI route", () => {
  mkdirSync(fixtureBase, { recursive: true });
  const root = mkdtempSync(join(fixtureBase, "g23-help-"));
  try {
    for (const flag of ["--help", "-h"]) {
      assert.equal(isSanctionedLifecycleCommand(`node ${script} ${flag}`, root), true);
      const child = spawnSync(process.execPath, [script, flag], { cwd: root, encoding: "utf8" });
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /^Usage: po-human-approval\.mjs /u);
      assert.deepEqual(readdirSync(root), [], "help leaves the fixture root untouched");
    }
    assert.equal(isSanctionedLifecycleCommand(`node ${script} --help --directory /tmp`, root), false);
    assert.equal(isSanctionedLifecycleCommand(`node ${script} approve`, root), false);
    assert.equal(isSanctionedLifecycleCommand(`node ${join(root, "foreign.mjs")} --help`, root), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("G23 missing local targets are distinct from unknown grammar and protected paths", () => {
  mkdirSync(fixtureBase, { recursive: true });
  const root = mkdtempSync(join(fixtureBase, "g23-missing-"));
  const outside = mkdtempSync(join(fixtureBase, "g23-outside-"));
  try {
    mkdirSync(join(root, "docs"));
    mkdirSync(join(root, "vault"));
    symlinkSync(outside, join(root, "alias"), "dir");
    const parse = command => parseGuardCommand(command, root, { platform: "linux" });
    for (const command of ["cat docs/absent.md", "rg -n needle docs/absent.md", "grep needle docs/absent.md"]) {
      assert.equal(isMissingSingleReadTarget(parse(command), root), true, command);
    }
    for (const command of ["rg --column needle docs/absent.md", "cat vault/id_rsa", "cat ../absent.md", "cat docs/*.md", "cat docs/../missing.md", "cat alias/missing.md"]) {
      assert.equal(isMissingSingleReadTarget(parse(command), root), false, command);
    }
    const native = readToolScopeVerdict({ tool_name: "Read", tool_input: { file_path: join(root, "docs", "absent.md") } }, root, {});
    assert.equal(native.exitCode, 2);
    assert.match(native.stderr, /GUARD-READ-TARGET-MISSING/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

if (cases.length !== 3) throw new Error("G23 read/help case count drift");
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
