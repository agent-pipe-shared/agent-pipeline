#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { computeEdits } from "./po-guarded-edit.mjs";

let passed = 0;
let failed = 0;
const roots = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "po-guarded-edit-"));
  roots.push(root);
  return root;
}
function write(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
  return full;
}

{
  const root = makeRoot();
  write(root, "harness/scripts/verify.mjs", "const TEST_SUITES = [\n  a,\n];\n");
  const plan = computeEdits(
    { jobs: [{ file: "harness/scripts/verify.mjs", oldString: "  a,\n];", newString: "  a,\n  b,\n];", reason: "add b" }] },
    { repoRoot: root },
  );
  check("GE01 single-occurrence job plans a clean edit", plan.ok && plan.edits.length === 1);
  check(
    "GE01b planned edit produces the expected new content",
    plan.ok && plan.edits[0].after === "const TEST_SUITES = [\n  a,\n  b,\n];\n",
    plan.ok ? plan.edits[0].after : "",
  );
  check("GE01c planned edit never writes the file", readFileSync(join(root, "harness/scripts/verify.mjs"), "utf8").includes("\n  b,\n") === false);
}

{
  const root = makeRoot();
  write(root, "f.txt", "x x x");
  const plan = computeEdits({ jobs: [{ file: "f.txt", oldString: "x", newString: "y" }] }, { repoRoot: root });
  check("GE02 rejects an oldString that is not exactly one occurrence", !plan.ok && plan.errors[0].includes("expected 1"), JSON.stringify(plan));
}

{
  const root = makeRoot();
  write(root, "f.txt", "no match here");
  const plan = computeEdits({ jobs: [{ file: "f.txt", oldString: "zzz", newString: "y" }] }, { repoRoot: root });
  check("GE03 rejects zero occurrences", !plan.ok && plan.errors[0].includes("found 0"), JSON.stringify(plan));
}

{
  const root = makeRoot();
  write(root, "f.txt", "aaa");
  const plan = computeEdits({ jobs: [{ file: "f.txt", oldString: "a", newString: "b", occurrences: 3 }] }, { repoRoot: root });
  check("GE04 an explicit occurrences count is honored", plan.ok && plan.edits[0].after === "bbb", JSON.stringify(plan));
}

{
  const root = makeRoot();
  const plan = computeEdits({ jobs: [{ file: "../outside.txt", oldString: "a", newString: "b" }] }, { repoRoot: root });
  check("GE05 rejects a path that traverses outside the repository root", !plan.ok && plan.errors[0].includes("outside"), JSON.stringify(plan));
}

{
  const root = makeRoot();
  const plan = computeEdits({ jobs: [{ file: "C:\\Windows\\System32\\evil.txt", oldString: "a", newString: "b" }] }, { repoRoot: root });
  check("GE06 rejects an absolute-looking file path", !plan.ok && plan.errors[0].includes("repository-relative"), JSON.stringify(plan));
}

{
  const root = makeRoot();
  write(root, "a.txt", "alpha");
  write(root, "b.txt", "beta");
  const plan = computeEdits(
    {
      jobs: [
        { file: "a.txt", oldString: "alpha", newString: "ALPHA" },
        { file: "b.txt", oldString: "zzz", newString: "ZZZ" },
      ],
    },
    { repoRoot: root },
  );
  check("GE07 one invalid job in a batch fails the whole batch (no partial plan)", !plan.ok && plan.errors.length === 1);
}

{
  const root = makeRoot();
  const plan = computeEdits({ jobs: [{ file: "missing.txt", oldString: "a", newString: "b" }] }, { repoRoot: root });
  check("GE08 rejects a job whose target file cannot be read", !plan.ok && plan.errors[0].includes("cannot read"), JSON.stringify(plan));
}

{
  const plan = computeEdits({ jobs: [] }, { repoRoot: "/tmp" });
  check("GE09 rejects an empty job list", !plan.ok);
  const plan2 = computeEdits(null, { repoRoot: "/tmp" });
  check("GE10 rejects a non-array, non-{jobs:[...]} spec", !plan2.ok);
}

{
  const root = makeRoot();
  write(root, "f.txt", "one");
  const plan = computeEdits([{ file: "f.txt", oldString: "one", newString: "two" }], { repoRoot: root });
  check("GE11 accepts a bare array job spec (no wrapping object)", plan.ok && plan.edits[0].after === "two");
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
