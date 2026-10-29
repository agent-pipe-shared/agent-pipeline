// SPDX-License-Identifier: SUL-1.0
// PF-60 (report 05): a bounded find read may combine its closed predicates with -o/-a, and a
// quoted path with parentheses (framework route groups) is a plain passive read.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isReadOnlyDiagnosticCommand } from "./shell-grammar.mjs";

test("FOR01 find admits -o/-a between closed predicates and keeps every writer or runner closed", () => {
  const base = mkdtempSync(join(tmpdir(), "pf60-find-"));
  const root = join(base, "project");
  try {
    mkdirSync(root);
    mkdirSync(join(root, "src", "(app)", "x"), { recursive: true });
    writeFileSync(join(root, "a.txt"), "x\n");
    writeFileSync(join(root, "src", "(app)", "x", "page.tsx"), "x\n");
    const admitted = (command) => isReadOnlyDiagnosticCommand(command, root);
    assert.equal(admitted("find src -name a.txt"), true);
    assert.equal(admitted("find src -name a.txt -o -name b.txt"), true);
    assert.equal(admitted("find src -type f -name a.txt -o -type f -name b.txt"), true);
    assert.equal(admitted("find src -name a.txt -or -name b.txt"), true);
    assert.equal(admitted("find src -type f -a -name a.txt"), true);
    assert.equal(admitted("find src -type f -and -name a.txt -print"), true);
    // An operator must sit between two predicates.
    assert.equal(admitted("find src -o -name a.txt"), false);
    assert.equal(admitted("find src -name a.txt -o"), false);
    assert.equal(admitted("find src -name a.txt -o -o -name b.txt"), false);
    // Writers and runners stay closed, also behind an operator.
    assert.equal(admitted("find src -name a.txt -o -delete"), false);
    assert.equal(admitted("find src -name a.txt -o -exec rm {} ;"), false);
    assert.equal(admitted("find src -name a.txt -o -fprint out.txt"), false);
    assert.equal(admitted("find src -name a.txt -o -ok rm {} ;"), false);
    assert.equal(admitted("find /etc -name a.txt -o -name b.txt"), false);
    assert.equal(admitted("find src -name a.txt -o -name b.txt > out.txt"), false);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("FOR02 quoted or escaped route-group paths are admitted, an unquoted parenthesis stays refused", () => {
  const base = mkdtempSync(join(tmpdir(), "pf60-paren-"));
  const root = join(base, "project");
  try {
    mkdirSync(join(root, "src", "(app)", "x"), { recursive: true });
    writeFileSync(join(root, "src", "(app)", "x", "page.tsx"), "x\n");
    const admitted = (command) => isReadOnlyDiagnosticCommand(command, root);
    assert.equal(admitted("cat 'src/(app)/x/page.tsx'"), true);
    assert.equal(admitted("cat \"src/(app)/x/page.tsx\""), true);
    assert.equal(admitted("cat src/\\(app\\)/x/page.tsx"), true);
    assert.equal(admitted("find 'src/(app)' -name page.tsx -o -name layout.tsx"), true);
    assert.equal(admitted("rg -n x 'src/(app)/x/page.tsx'"), true);
    assert.equal(admitted("cat src/(app)/x/page.tsx"), false);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
