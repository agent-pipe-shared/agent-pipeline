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

// backlog pipeline.gate-strength-shell-refuses-admitted-reads: the locate-the-calibration read the Toolbox typed.
test("FOR03 find admits -not, -path, -ipath and -prune as read predicates and keeps writers and misplaced -not closed", () => {
  const base = mkdtempSync(join(tmpdir(), "gs-find-"));
  const root = join(base, "project");
  try {
    mkdirSync(join(root, "node_modules", "x"), { recursive: true });
    writeFileSync(join(root, "pipeline.json"), "{}\n");
    const admitted = (command) => isReadOnlyDiagnosticCommand(command, root);
    assert.equal(admitted("find . -maxdepth 2 -name \"pipeline.json\" -not -path \"./node_modules/*\""), true);
    assert.equal(admitted("find . -name pipeline.json -not -ipath \"./node_modules/*\""), true);
    assert.equal(admitted("find . -not -name \"*.map\" -type f"), true);
    assert.equal(admitted("find . -path ./node_modules -prune -o -name pipeline.json -print"), true);
    assert.equal(admitted("find . -name a.txt -o -not -name b.txt"), true);
    // -not negates the next predicate: it cannot repeat, end the expression or precede an operator.
    assert.equal(admitted("find . -not"), false);
    assert.equal(admitted("find . -name a.txt -not"), false);
    assert.equal(admitted("find . -not -not -name a.txt"), false);
    assert.equal(admitted("find . -not -o -name a.txt"), false);
    assert.equal(admitted("find . -name a.txt -o -not"), false);
    // A -path pattern is one non-option word; writers stay closed behind the new predicates.
    assert.equal(admitted("find . -path"), false);
    assert.equal(admitted("find . -path -name"), false);
    assert.equal(admitted("find . -not -path \"./x/*\" -delete"), false);
    assert.equal(admitted("find . -not -path \"./x/*\" -exec rm {} ;"), false);
    assert.equal(admitted("find . -path ./x -prune -o -fprint out.txt"), false);
    assert.equal(admitted("find /etc -not -path \"./x/*\" -name a"), false);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
