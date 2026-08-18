#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { existsSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { DEFAULT_TEST_TMP_ROOT_BASE, mkdtempTestScratch, testTmpRoot } from "./test-tmpdir.mjs";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const created = [];

{
  const dir = mkdtempTestScratch("tt01-basic-");
  created.push(dir);
  check("TT01 creates a real directory", statSync(dir).isDirectory());
  const rel = relative(testTmpRoot(DEFAULT_TEST_TMP_ROOT_BASE), dir);
  check("TT01 directory lives directly under this repo's scratch/test-tmp/", !rel.startsWith("..") && !rel.includes("/"), dir);
}

{
  const a = mkdtempTestScratch("tt02-dup-");
  const b = mkdtempTestScratch("tt02-dup-");
  created.push(a, b);
  check("TT02 repeated identical prefix never collides", a !== b, `${a} vs ${b}`);
}

{
  let threw = false;
  try { mkdtempTestScratch("../escape"); } catch { threw = true; }
  check("TT03 rejects a '..'-bearing prefix", threw);
}
{
  let threw = false;
  try { mkdtempTestScratch("nested/prefix"); } catch { threw = true; }
  check("TT03 rejects a '/'-bearing prefix", threw);
}
{
  let threw = false;
  try { mkdtempTestScratch("back\\slash"); } catch { threw = true; }
  check("TT03 rejects a '\\'-bearing prefix", threw);
}
{
  let threw = false;
  try { mkdtempTestScratch(""); } catch { threw = true; }
  check("TT03 rejects an empty prefix", threw);
}
{
  let threw = false;
  try { mkdtempTestScratch(undefined); } catch { threw = true; }
  check("TT03 rejects a non-string prefix", threw);
}

{
  // fakeRepoRoot is itself created inside the REAL scratch/test-tmp/ (as this
  // module's own fixture), so `nested`, created with `fakeRepoRoot` as the
  // `base` override, necessarily lives *inside* the real testTmpRoot too --
  // that nesting is expected and is not what this assertion is about. What it
  // proves is that the base override adds its OWN `scratch/test-tmp/` layer
  // under the given base, rather than writing straight into it.
  const fakeRepoRoot = mkdtempTestScratch("tt04-fake-root-");
  created.push(fakeRepoRoot);
  const nested = mkdtempTestScratch("tt04-nested-", fakeRepoRoot);
  check("TT04 base override places the fixture under <base>/scratch/test-tmp/",
    nested.startsWith(join(fakeRepoRoot, "scratch", "test-tmp")), nested);
  check("TT04 base override does not write directly into the base directory",
    relative(fakeRepoRoot, nested).split("/").length === 3, nested);
}

{
  const first = mkdtempTestScratch("tt05-parent-reuse-");
  const second = mkdtempTestScratch("tt05-parent-reuse-");
  created.push(first, second);
  check("TT05 an already-existing scratch/test-tmp/ parent is reused, not an error", existsSync(first) && existsSync(second));
}

for (const dir of created) rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
