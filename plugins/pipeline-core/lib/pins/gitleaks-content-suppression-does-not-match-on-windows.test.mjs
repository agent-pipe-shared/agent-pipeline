#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Pin for backlog item `pipeline.gitleaks-content-suppression-does-not-match-on-windows` (AC-182).
 *
 * Acceptance points (item Proposal): (A1) a fixture covers both line endings (LF, CRLF) and both
 * path separators (`/`, `\`); (A2) the normalisation is fixed where the match diverged, so a
 * content-v1 entry suppresses nested findings; (A3) the fixture is kept as a regression test.
 *
 * Exercised through the real adapter module (`run`, `normalizeCandidateFindingPath`) with its
 * documented `spawnFn` seam; fixtures live under the repository `scratch/`. RED proof: a scratch
 * mirror of the pre-fix function (inline, never an edit of production) fails the nested case.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { gitleaksContentAuthorityLine, normalizeCandidateFindingPath, run } from "../../scripts/security-adapters/gitleaks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
const IS_WINDOWS = process.platform === "win32";
const RULE = "fixture-rule";
const SECRET = "fixture-secret-value";
const DEPTHS = ["top.txt", "backlog/one.txt", "a/b/c.txt"];

function makeRoot() {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "glwin-pin-"));
  for (const rel of DEPTHS) {
    const abs = join(root, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "synthetic fixture content\n");
  }
  return root;
}
const finding = (file, o = {}) => ({ File: file, RuleID: RULE, StartLine: 7, StartColumn: 3, Secret: SECRET, ...o });
const entry = (rel, o = {}) => gitleaksContentAuthorityLine(finding(rel, o));

async function runAdapter(root, findings, ignoreText) {
  writeFileSync(join(root, ".gitleaksignore"), ignoreText);
  const spy = (_c, args) => {
    writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify(findings));
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  return run({ rootDir: root, config: { binaryPath: "unused-fake-gitleaks" }, spawnFn: spy, timeoutMs: 5000 });
}

const SHAPES = [
  ["absolute-native", (root, rel) => join(root, ...rel.split("/"))],
  ["absolute-forward-slash", (root, rel) => `${root.split("\\").join("/")}/${rel}`],
  ["relative-forward-slash", (_r, rel) => rel],
];

// A1 + A2: EOL x separator shape x depth through run().
for (const [eolLabel, eol] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  for (const [shape, build] of SHAPES) {
    for (const rel of DEPTHS) {
      test(`A1/A2 run() suppresses content-v1 entry | ignore ${eolLabel} | ${shape} | ${rel}`, async () => {
        const root = makeRoot();
        try {
          const r = await runAdapter(root, [finding(build(root, rel))], `# header${eol}${entry(rel)}${eol}`);
          assert.equal(r.status, "PASS");
          assert.equal(r.findings.length, 0);
          assert.equal(r.ignored.findingCount, 1);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    }
  }
}

// Backslash-relative separator shape: a separator only on win32.
test("A1/A2 run() suppresses a backslash-relative nested finding on win32", { skip: IS_WINDOWS ? undefined : "backslash is a filename character off Windows; the Windows-only shape is exercised by the win32 override case in the adjacent suite (not a directory-mode/symlink limitation)" }, async () => {
  const root = makeRoot();
  try {
    const r = await runAdapter(root, [finding("a\\b\\c.txt")], `${entry("a/b/c.txt")}\r\n`);
    assert.equal(r.status, "PASS");
    assert.equal(r.ignored.findingCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A2: normaliser unit contract, nested absolute path -> repo-relative forward slashes.
for (const rel of DEPTHS) {
  test(`A2 normalizeCandidateFindingPath yields "${rel}" from an absolute native path`, () => {
    const root = makeRoot();
    try {
      assert.equal(normalizeCandidateFindingPath(finding(join(root, ...rel.split("/"))), root).File, rel);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// Over-fix guards: the fix must not widen suppression.
test("A2 guard: out-of-root finding and different secret stay retained", async () => {
  const root = makeRoot();
  const external = makeRoot();
  try {
    const r1 = await runAdapter(root, [finding(join(external, "backlog", "one.txt"))], `${entry("backlog/one.txt")}\n`);
    assert.equal(r1.status, "FINDINGS");
    const r2 = await runAdapter(root, [finding(join(root, "a", "b", "c.txt"), { Secret: "other-secret" })], `${entry("a/b/c.txt")}\n`);
    assert.equal(r2.status, "FINDINGS");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("A2 guard: a backslash content-v1 entry path stays a malformed authority", async () => {
  const root = makeRoot();
  try {
    const r = await runAdapter(root, [], `content-v1:${"a".repeat(64)}:backlog\\one.txt:${RULE}:7:3\n`);
    assert.equal(r.status, "ERROR");
    assert.equal(r.classification, "ignore_authority");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A3: the regression fixture suite is kept in the tree.
test("A3 the adjacent regression suite is kept", () => {
  assert.ok(existsSync(join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "security-adapters", "gitleaks.windows-suppression.test.mjs")));
});

// RED proof: scratch mirror of the pre-fix normaliser (no separator conversion). On a win32-style
// relative result the strict validator rejects the backslash, the finding stays absolute, and the
// nested case would NOT match. Pure string logic via path.win32 -- no production edit.
function preFixMirror(file, physicalRoot) {
  const rel = win32.relative(physicalRoot, file); // old code: native separators, no .split(sep).join("/")
  const ok = !isAbsolute(rel) && !rel.includes("\\") && rel.split("/").every((p) => p && p !== "." && p !== "..");
  return ok ? rel : file;
}
test("RED: pre-fix mirror leaves a nested win32 path absolute (so the pin is meaningful); depth 0 survives", () => {
  assert.equal(preFixMirror("C:\\r\\a\\b\\c.txt", "C:\\r"), "C:\\r\\a\\b\\c.txt", "nested path stays absolute under the old logic");
  assert.equal(preFixMirror("C:\\r\\top.txt", "C:\\r"), "top.txt", "root file already worked");
  // the fixed form converts the native separator before validating
  assert.equal(win32.relative("C:\\r", "C:\\r\\a\\b\\c.txt").split(win32.sep).join("/"), "a/b/c.txt");
});
