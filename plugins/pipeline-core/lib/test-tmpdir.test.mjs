#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { existsSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DEFAULT_TEST_TMP_ROOT_BASE, REPO_TEST_TMP_ROOT_BASE, mkdtempTestScratch, resolveTestTmpBase, testTmpRoot } from "./test-tmpdir.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

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

{
  const overrideBase = mkdtempTestScratch("tt06-override-base-");
  created.push(overrideBase);
  check("TT06 unset env keeps the repo-local base", resolveTestTmpBase({}) === REPO_TEST_TMP_ROOT_BASE);
  check("TT06 set to an absolute existing directory uses it", resolveTestTmpBase({ PIPELINE_TEST_TMP_BASE: overrideBase }) === overrideBase);
  check("TT06 relative path falls back", resolveTestTmpBase({ PIPELINE_TEST_TMP_BASE: "relative/dir" }) === REPO_TEST_TMP_ROOT_BASE);
  check("TT06 missing path falls back", resolveTestTmpBase({ PIPELINE_TEST_TMP_BASE: join(overrideBase, "does-not-exist") }) === REPO_TEST_TMP_ROOT_BASE);
  check("TT06 empty value falls back", resolveTestTmpBase({ PIPELINE_TEST_TMP_BASE: "" }) === REPO_TEST_TMP_ROOT_BASE);

  const probe = (value) => {
    const env = { ...process.env };
    delete env.PIPELINE_TEST_TMP_BASE;
    if (value !== undefined) env.PIPELINE_TEST_TMP_BASE = value;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import(${JSON.stringify(pathToFileURL(join(HERE, "test-tmpdir.mjs")).href)}).then((m) => console.log(m.DEFAULT_TEST_TMP_ROOT_BASE))`],
    { env, encoding: "utf8" });
    return { status: r.status, out: (r.stdout || "").trim() };
  };
  const unset = probe(undefined);
  check("TT07 import with env unset resolves the repo-local default", unset.status === 0 && unset.out === REPO_TEST_TMP_ROOT_BASE, JSON.stringify(unset));
  const set = probe(overrideBase);
  check("TT07 import with env set places the default base under the override", set.status === 0 && set.out === overrideBase, JSON.stringify(set));
  const rel = probe("relative/dir");
  check("TT07 import with a relative env never throws and keeps the default", rel.status === 0 && rel.out === REPO_TEST_TMP_ROOT_BASE, JSON.stringify(rel));
  const missing = probe(join(overrideBase, "nope"));
  check("TT07 import with a missing env path never throws and keeps the default", missing.status === 0 && missing.out === REPO_TEST_TMP_ROOT_BASE, JSON.stringify(missing));
  const viaOverride = mkdtempTestScratch("tt07-shape-", overrideBase);
  check("TT07 override keeps the <base>/scratch/test-tmp shape", viaOverride.startsWith(join(overrideBase, "scratch", "test-tmp")), viaOverride);
}

for (const dir of created) rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
